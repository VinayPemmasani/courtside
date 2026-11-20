/**
 * Strike lab: how squarely and how hard a groundstroke meets the ball.
 *
 * A model of ball compression for forehands (and backhands): match the racket face to where the
 * ball is in its bounce (closed on the rise, vertical at the peak, open on the drop), drive forward
 * through the ball on high balls but add lift on balls below the net, brake the trunk just before
 * contact so the arm whips through, and extend forward after contact instead of wiping up the back
 * of the ball.
 *
 * Everything is measured from pose landmarks (world metres, hip-centred, y down). The racket face is
 * the palm-plane estimate from racket.ts, and the ball is not tracked, so the bounce stage comes
 * from the court position (when the court is calibrated) or from the player's own setting.
 * Targets are coaching rules of thumb, not laws: they are kept here as named constants.
 */
import type { Handedness, PoseFrame, Stroke, Vec3 } from './types';
import { sides } from './landmarks';
import { mid, sub } from './geometry';
import { faceTiltAt } from './biomech';
import { smoothSeries } from './smoothing';
import { feetPoint, type CourtMap } from './court';
import type { BallReading } from './ball';
import { HEAD_TO_WRIST, simulate, type Shot } from './flight';

import type { BounceStage } from './types';
export type { BounceStage };

/** Net height at the centre strap and at the posts, metres. */
/** Padel net height in the middle. */
export const NET_STRAP = 0.88;
export const NET_POST = 1.07;

/**
 * Racket-face target at contact by bounce stage, degrees, + closed (strings toward the court),
 * - open. The face should meet the ball's path square on: the ball climbs on the rise, travels
 * level at the peak and drops on the way down.
 */
export const FACE_TARGET: Record<BounceStage, { centre: number; min: number; max: number; words: string }> = {
  rising: { centre: 7, min: 3, max: 12, words: 'slightly closed (5–10°)' },
  peak: { centre: 0, min: -4, max: 4, words: 'vertical' },
  falling: { centre: -5, min: -10, max: -1, words: 'slightly open (about 5°)' },
};

/** Ball height band: below the strap is low, above strap + margin is high, between is at net. */
export const HIGH_MARGIN = 0.15;
export type Height = 'low' | 'net' | 'high';

/**
 * Share of hand speed going forward (drive) rather than up (lift) at contact, by contact height.
 * High balls: mostly drive (path about 18° or flatter). Low balls: about half and half
 * (path about 23–45°), so topspin can carry the ball over the net and down into the court.
 */
export const DRIVE_TARGET: Record<Height, { min: number; max: number; words: string }> = {
  high: { min: 75, max: 100, words: 'mostly drive (75%+ forward)' },
  net: { min: 62, max: 85, words: 'drive with some lift (about 65–85% forward)' },
  low: { min: 50, max: 70, words: 'half drive, half lift (50–70% forward)' },
};

/** Trunk should have slowed by at least this share of its peak rotation speed at contact. */
export const BRAKE_MIN = 25;
/** Forward hand travel along the shot line in the first 0.1 s after contact, metres. */
export const EXTENSION_MIN = 0.3;
export const EXTENSION_WINDOW = 0.1;
/** A swing this steep with a closed face mostly brushes the felt instead of driving the ball. */
export const BRUSH_PATH = 30;
export const BRUSH_FACE = 6;
export const BRUSH_PATH_ANY = 42;
/** Below this average wrist/elbow visibility around contact the strike is not scored. */
export const MIN_TRACKING = 0.5;
/** The three face readings around contact must agree within this, degrees. */
export const FACE_SPREAD_MAX = 15;
/** A groundstroke face beyond this tilt is a tracking error, not a real face angle. */
export const FACE_PLAUSIBLE = 20;

export type StageSource = 'set' | 'ball' | 'court' | 'assumed';

export interface StrikeCheck {
  id: 'face' | 'drive' | 'brake' | 'extension' | 'brush';
  label: string;
  ok: boolean | null;
  value: string;
  target: string;
  tip: string;
}

export interface Strike {
  stage: BounceStage;
  stageSource: StageSource;
  /** Feet distance behind the hitter's back glass at contact, metres (negative = in front of it, i.e. inside the court). */
  behindBaseline?: number;
  /** Estimated ball (string-bed) height above the ground at contact, metres. */
  ballHeight?: number;
  height?: Height;
  /** Racket face at contact, + closed / - open, degrees (estimate). */
  face?: number;
  faceTarget: (typeof FACE_TARGET)[BounceStage];
  /** How far the face is from square to the ball, degrees (0 = head on). */
  faceError?: number;
  /** Swing path into contact, degrees (+ upward). */
  path?: number;
  /** Share of hand speed going forward vs up at contact, %. */
  drive?: number;
  driveTarget?: (typeof DRIVE_TARGET)[Height];
  /** Trunk rotation speed lost between its peak and contact, %. */
  brake?: number;
  /** Trunk peak before hand peak, ms (positive = trunk first). */
  trunkLead?: number;
  /** Hand travel along the shot line just after contact, metres. */
  extension?: number;
  brushing: boolean;
  /** Average visibility of the hitting arm around contact, 0..1. */
  tracking: number;
  lowTracking: boolean;
  /** Why the face is missing, when it is. */
  faceNote?: string;
  /** 0–100 summary of the four checks (face, drive split, brake, extension). */
  score?: number;
  checks: StrikeCheck[];
  /** The one change to try first. */
  headline: string;
  /** Ball flight read from the video, when found. */
  ball?: BallReading;
  /** Racket head speed used for the model (from the wrist speed), m/s. */
  racketSpeed?: number;
  /** Incoming ball speed used for the model, m/s, and whether it was measured. */
  speedIn?: number;
  speedInMeasured?: boolean;
  /** True when the face could not be read and the model assumed a vertical face. */
  faceAssumed?: boolean;
  /** What this strike did to the ball (model), and the same swing in two other cases. */
  shot?: Shot;
  atPeak?: Shot;
  faceSquare?: Shot;
  /** Plain sentences on how the bounce stage, face and path shaped power and the ball's path. */
  impact: string[];
}

const GROUND_POINTS = [27, 28, 29, 30, 31, 32];
const hipMid = (w: Vec3[]) => mid(w[23], w[24]);
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Height of a world point above the lowest foot point in the same frame, metres. */
export function heightAboveGround(w: Vec3[], p: Vec3): number | undefined {
  let ground = -Infinity;
  for (const i of GROUND_POINTS) if (w[i] && Number.isFinite(w[i].y)) ground = Math.max(ground, w[i].y);
  if (!Number.isFinite(ground)) return undefined;
  const h = ground - p.y;
  return Number.isFinite(h) ? h : undefined;
}

export function heightBand(h: number): Height {
  if (h < NET_STRAP) return 'low';
  if (h > NET_STRAP + HIGH_MARGIN) return 'high';
  return 'net';
}

/**
 * Bounce stage from where the player stands: in front of the service line the ball is usually taken
 * on the rise, between the service line and the glass near its peak, and close to the back glass on
 * the way down (or after it comes off the glass).
 */
export function stageFromPosition(behind: number): BounceStage {
  if (behind < -4) return 'rising';
  if (behind <= -1.5) return 'peak';
  return 'falling';
}

/** Feet distance behind the hitter's back glass at a frame, from the court calibration (negative inside the court). */
export function behindBaselineAt(map: CourtMap | null, frames: PoseFrame[], frame: number): number | undefined {
  if (!map) return undefined;
  const feet = feetPoint(frames[frame]);
  const at = feet && map.toCourt(feet);
  return at ? -at.y : undefined;
}

/** Share of a velocity going forward (horizontal) rather than up, % (0..100). */
export function driveShare(pathDeg: number): number {
  const t = (clamp(pathDeg, -89, 89) * Math.PI) / 180;
  const f = Math.abs(Math.cos(t));
  const u = Math.max(0, Math.sin(t));
  return (f / (f + u)) * 100;
}

const fmtFace = (v: number) => (Math.abs(v) < 0.5 ? '0° (vertical)' : v > 0 ? `${Math.round(v)}° closed` : `${Math.round(-v)}° open`);

export interface StrikeInput {
  frames: PoseFrame[];
  stroke: Stroke;
  hand: Handedness;
  fps: number;
  yaw: number[];
  hipYaw: number[];
  /** Court mapping, when the court is calibrated. */
  court?: CourtMap | null;
  /** The player's own setting for this stroke. */
  stage?: BounceStage;
  /** Ball flight read from the video. */
  ball?: BallReading | null;
}

/** Typical club rally ball arriving at the player, m/s (about 50 km/h). */
export const DEFAULT_SPEED_IN = 14;
/** Vertical ball speed at contact assumed for each stage when the bounce was not seen, m/s. */
const STAGE_VZ: Record<BounceStage, number> = { rising: 2, peak: 0, falling: -2 };

const kmh = (v: number) => Math.round(v * 3.6);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const where = (s: Shot) => (s.result === 'net' || s.result === 'short' ? 'into the net' : s.result === 'long' ? 'into the back glass on the full (out)' : `${s.depth!.toFixed(1)} m short of the back glass`);

/** Plain-language effects of the bounce stage, face and path on this shot. */
function explain(o: { stage: BounceStage; ball?: BallReading; shot: Shot; atPeak: Shot; faceSquare: Shot; face: number; faceAssumed: boolean; squareFace: number; path: number; height: number }): string[] {
  const out: string[] = [];
  const { shot, atPeak, faceSquare } = o;
  const b = o.ball;
  if (b?.bounceSeen && b.sinceApex !== undefined) {
    const ms = Math.round(Math.abs(b.sinceApex) * 1000);
    const when = Math.abs(b.sinceApex) < 0.03 ? 'right at the top of the bounce' : b.sinceApex < 0 ? `${ms} ms before the top of the bounce` : `${ms} ms after the top of the bounce`;
    out.push(`You took this ball ${when}, ${b.dt!.toFixed(2)} s after it bounced${b.belowApex! > 0.03 ? `, ${Math.round(b.belowApex! * 100)} cm below its highest point (${b.apexHeight!.toFixed(2)} m)` : ''}.`);
  } else if (b) out.push('The bounce was out of view, but the ball was dropping on screen into contact, so it was falling.');
  const up = (deg: number) => (deg >= 0 ? `${Math.round(deg)}° up` : `${Math.round(-deg)}° down`);
  out.push(`Off the paddle: about ${kmh(shot.speed)} km/h, ${up(shot.launch)}, with about ${Math.round(Math.max(0, shot.rpm) / 50) * 50} rpm of topspin. ${Math.round(shot.square)}% of the paddle's speed goes straight into the ball (compression); the rest brushes across it as spin.`);
  const cmp = (alt: Shot) => {
    const dl = alt.launch - shot.launch;
    const dn = (alt.netClear - shot.netClear) * 100;
    const ds = kmh(alt.speed) - kmh(shot.speed);
    const parts: string[] = [];
    if (Math.abs(dl) >= 0.5) parts.push(`launch ${Math.abs(dl).toFixed(dl > -10 && dl < 10 ? 1 : 0)}° ${dl > 0 ? 'higher' : 'lower'}`);
    if (Math.abs(dn) >= 3 && shot.result !== 'short' && alt.result !== 'short') parts.push(`pass the net ${Math.round(Math.abs(dn))} cm ${dn > 0 ? 'higher' : 'lower'}`);
    if (Math.abs(ds) >= 2) parts.push(`leave ${Math.abs(ds)} km/h ${ds > 0 ? 'faster' : 'slower'}`);
    return parts.length ? parts.join(', ') : 'change very little';
  };
  if (o.stage !== 'peak') out.push(`${o.stage === 'falling' ? 'Dropping' : 'Rising'} ball: the same swing at the top of the bounce would ${cmp(atPeak)}.`);
  const off = o.face - o.squareFace;
  if (Math.abs(off) >= 3) {
    const sq = o.squareFace >= 0 ? `${Math.round(o.squareFace)}° closed` : `${Math.round(-o.squareFace)}° open`;
    out.push(`${o.faceAssumed ? 'If the face was vertical (it could not be read), it' : 'The face'} was ${Math.round(Math.abs(off))}° ${off > 0 ? 'more closed' : 'more open'} than square to this ball. Square to it (${sq}), the ball would ${cmp(faceSquare)}.`);
  }
  if (o.height < NET_STRAP && o.path < 18) out.push(`Contact was below the net strap with a fairly flat path (${Math.round(o.path)}°): a steeper low-to-high swing adds net clearance and topspin to bring it down.`);
  if (o.height > NET_STRAP + HIGH_MARGIN && o.path > 30) out.push(`Contact was above the net with a steep path (${Math.round(o.path)}°): you had clearance, so a flatter, more forward swing would put more pace on it.`);
  return out;
}

const GROUNDSTROKES = new Set(['forehand', 'backhand', 'lob', 'wall']);

export function strikeApplies(stroke: Stroke): boolean {
  return GROUNDSTROKES.has(stroke.type);
}

export function analyseStrike(input: StrikeInput): Strike | undefined {
  const { frames, stroke, hand, fps } = input;
  if (!strikeApplies(stroke)) return undefined;
  const { dom } = sides(hand);
  const c = stroke.contactFrame;
  const wc = frames[c]?.world;
  const m = stroke.metrics.contact ?? {};

  // Bounce stage.
  const behind = behindBaselineAt(input.court ?? null, frames, c);
  let stage: BounceStage = 'falling';
  let stageSource: StageSource = 'assumed';
  const ball = input.ball ?? undefined;
  if (input.stage) { stage = input.stage; stageSource = 'set'; }
  else if (ball) { stage = ball.stage; stageSource = 'ball'; }
  else if (behind !== undefined) { stage = stageFromPosition(behind); stageSource = 'court'; }

  // Tracking quality at contact: how clearly the hitting hand is seen around the strike.
  const vis: number[] = [];
  for (let i = c - 2; i <= c + 2; i++) {
    const im = frames[i]?.image;
    if (im) vis.push(Math.min(im[dom.wrist]?.v ?? 0, im[dom.elbow]?.v ?? 0));
  }
  const tracking = vis.length ? vis.reduce((x, y) => x + y, 0) / vis.length : 0;
  const lowTracking = tracking < MIN_TRACKING;

  // Ball height: the hitting hand's height above the ground around contact. On a groundstroke
  // the strings meet the ball roughly level with the hand.
  const hAt = (i: number) => {
    const w = frames[i]?.world;
    return w ? heightAboveGround(w, w[dom.wrist]) : undefined;
  };
  const hs = [c - 1, c, c + 1].map(hAt).filter((v): v is number => v !== undefined);
  let ballHeight = hs.length ? hs.sort((x, y) => x - y)[Math.floor(hs.length / 2)] : undefined;
  if (ballHeight !== undefined && (ballHeight < 0.1 || ballHeight > 2.4)) ballHeight = undefined;
  const height = ballHeight !== undefined ? heightBand(ballHeight) : undefined;

  // Face against the target for the stage. The face is read from the palm, so it is only used
  // when three frames around contact agree and the angle is plausible for a groundstroke.
  const faces = [c - 1, c, c + 1].map((i) => faceTiltAt(frames, i, hand, fps));
  let face: number | undefined;
  let faceNote: string | undefined;
  if (faces.every((f): f is number => f !== undefined)) {
    const sorted = [...faces].sort((x, y) => x - y);
    const med = sorted[1];
    if (sorted[2] - sorted[0] > FACE_SPREAD_MAX || Math.abs(med) > FACE_PLAUSIBLE) faceNote = 'The paddle face could not be read reliably from this camera angle. Film side-on, level with the hitting hand, for a face reading.';
    else face = med;
  } else faceNote = 'The hand is not clear enough at contact to read the paddle face.';
  const faceTarget = FACE_TARGET[stage];
  const faceError = face !== undefined ? face - faceTarget.centre : undefined;

  // Strike path: from the lowest point of the hand just before contact to just after it, so the
  // reading covers the low-to-high drive through the ball and not the loop of the backswing.
  let path: number | undefined;
  const look = Math.max(3, Math.round(0.2 * fps));
  const after = Math.max(1, Math.round(0.067 * fps));
  let low: { i: number; h: number } | undefined;
  for (let i = Math.max(0, c - look); i <= c; i++) {
    const h = hAt(i);
    if (h !== undefined && (!low || h < low.h)) low = { i, h };
  }
  const e = Math.min(frames.length - 1, c + after);
  const wl = low && frames[low.i]?.world, wE = frames[e]?.world, hE = hAt(e);
  if (low && wl && wE && hE !== undefined) {
    const a = sub(wl[dom.wrist], hipMid(wl)), z = sub(wE[dom.wrist], hipMid(wE));
    const horiz = Math.hypot(z.x - a.x, z.z - a.z);
    if (horiz > 0.12) path = deg(Math.atan2(hE - low.h, horiz));
  }
  if (path === undefined) path = m.swingPath;
  // A groundstroke path outside this range is a tracking error, not a real swing.
  if (path !== undefined && (path < -30 || path > 65)) path = undefined;
  const drive = path !== undefined ? driveShare(path) : undefined;
  const driveTarget = height ? DRIVE_TARGET[height] : undefined;

  // Trunk brake: trunk rotation speed at contact against its peak in the last 0.3 s.
  let brake: number | undefined;
  let trunkLead: number | undefined;
  const yawS = smoothSeries(input.yaw, 1);
  const trunkAt = (i: number) => (i > 0 && i < yawS.length - 1 ? Math.abs(((yawS[i + 1] - yawS[i - 1]) * fps) / 2) : NaN);
  let tp: { i: number; v: number } | undefined;
  for (let i = Math.max(1, c - Math.round(0.3 * fps)); i <= c; i++) {
    const v = trunkAt(i);
    if (Number.isFinite(v) && (!tp || v > tp.v)) tp = { i, v };
  }
  if (tp && tp.v > 60) {
    const at = trunkAt(c);
    if (Number.isFinite(at)) brake = clamp((1 - at / tp.v) * 100, 0, 100);
    trunkLead = Math.round(((c - tp.i) / fps) * 1000);
  }

  // Forward extension: the hand's reach forward past the hips along the shot line just after contact.
  let extension: number | undefined;
  const p = frames[c - 1]?.world, n = frames[c + 1]?.world;
  const k = Math.max(2, Math.round(EXTENSION_WINDOW * fps));
  const we = frames[Math.min(frames.length - 1, c + k)]?.world;
  if (p && n && wc && we) {
    const v = sub(sub(n[dom.wrist], hipMid(n)), sub(p[dom.wrist], hipMid(p)));
    const hl = Math.hypot(v.x, v.z);
    if (hl > 1e-4) {
      const d = sub(sub(we[dom.wrist], hipMid(we)), sub(wc[dom.wrist], hipMid(wc)));
      extension = (d.x * v.x + d.z * v.z) / hl;
    }
  }

  // Brushing: steep path with a closed face on a ball that is not rising, or a very steep path.
  const brushing = path !== undefined && ((path >= BRUSH_PATH && face !== undefined && face >= BRUSH_FACE && stage !== 'rising') || path >= BRUSH_PATH_ANY);

  // Checks.
  const checks: StrikeCheck[] = [];
  if (face !== undefined) {
    const ok = face >= faceTarget.min && face <= faceTarget.max;
    const tooClosed = face > faceTarget.max;
    checks.push({
      id: 'face', label: 'Face square to the ball', ok, value: fmtFace(face), target: `${faceTarget.words} on a ${stage} ball`,
      tip: ok ? 'Face meets the ball head on for this bounce stage.'
        : tooClosed ? (stage === 'falling' ? 'Face too closed for a dropping ball: open it a touch so the face meet the ball as it falls.' : 'Face too closed: the face point at the court and slide over the ball. Square it up.')
        : (stage === 'rising' ? 'Face too open for a rising ball: close it slightly to meet the ball on its way up.' : 'Face too open: the ball will float. Bring the face back toward vertical.'),
    });
  }
  if (drive !== undefined && driveTarget && height) {
    const ok = drive >= driveTarget.min && drive <= driveTarget.max;
    const where = height === 'high' ? 'above the net' : height === 'low' ? 'below the net strap' : 'at net height';
    checks.push({
      id: 'drive', label: 'Drive vs lift for the height', ok, value: `${Math.round(drive)}% forward`, target: `${driveTarget.words}, ball ${where}`,
      tip: ok ? 'The split between driving forward and lifting suits the contact height.'
        : drive < driveTarget.min ? (height === 'high' ? 'High ball: you have clearance, so drive through it rather than lifting.' : 'Too much lift: swing more forward through the ball so it does not float short.')
        : (height === 'low' ? 'Low ball hit too flat: add lift (a steeper low-to-high path) so topspin carries it over the net.' : 'A little more lift will give the ball net clearance and dip.'),
    });
  }
  if (brake !== undefined) {
    const ok = brake >= BRAKE_MIN;
    checks.push({
      id: 'brake', label: 'Trunk brakes before contact', ok, value: `${Math.round(brake)}% slower at contact`, target: `at least ${BRAKE_MIN}% below its peak`,
      tip: ok ? 'The trunk slows into contact and passes its speed to the arm and racket.' : 'The trunk is still turning flat out at contact. Let the chest stop facing the net just before contact so the arm whips through.',
    });
  }
  if (extension !== undefined) {
    const ok = extension >= EXTENSION_MIN;
    checks.push({
      id: 'extension', label: 'Extends through the ball', ok, value: `${extension.toFixed(2)} m forward`, target: `at least ${EXTENSION_MIN.toFixed(2)} m in the first ${Math.round(EXTENSION_WINDOW * 1000)} ms`,
      tip: ok ? 'The hand keeps travelling along the shot line after contact.' : 'The hand pulls up or across too soon. Push through the ball toward the target before the finish.',
    });
  }
  if (path !== undefined) {
    checks.push({
      id: 'brush', label: 'No wiper brush', ok: !brushing, value: `${Math.round(path)}° path${face !== undefined ? `, ${fmtFace(face)}` : ''}`, target: `path under ${BRUSH_PATH}° with a closed face, never above ${BRUSH_PATH_ANY}°`,
      tip: brushing ? 'Steep path with a closed face brushes the felt and loses pace. Drive forward through the ball; the topspin comes from the low-to-high path.' : 'The paddle drives through the ball rather than brushing up its back.',
    });
  }

  // Score: average of the graded checks, each 0..1 by how far inside or outside its target.
  const parts: number[] = [];
  if (faceError !== undefined && face !== undefined) {
    const out = face < faceTarget.min ? faceTarget.min - face : face > faceTarget.max ? face - faceTarget.max : 0;
    parts.push(clamp(1 - out / 15, 0, 1));
  }
  if (drive !== undefined && driveTarget) {
    const out = drive < driveTarget.min ? driveTarget.min - drive : drive > driveTarget.max ? drive - driveTarget.max : 0;
    parts.push(clamp(1 - out / 25, 0, 1));
  }
  if (brake !== undefined) parts.push(clamp(brake / BRAKE_MIN, 0, 1));
  if (extension !== undefined) parts.push(clamp(extension / EXTENSION_MIN, 0, 1));
  let score = parts.length >= 2 && !lowTracking ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : undefined;
  if (score !== undefined && brushing) score = Math.min(score, 60);

  const firstFix = checks.find((x) => x.id === 'brush' && x.ok === false) ?? checks.find((x) => x.ok === false);
  const headline = lowTracking ? 'The hitting arm is hard to see at contact in this clip, so these readings are rough. Film with the hitting side toward the camera.' : firstFix ? firstFix.tip : checks.length ? 'Solid strike: face square for the bounce, the right drive for the height, and a full extension.' : 'Not enough tracking at contact to read this strike.';

  // Ball model: what this strike did to the ball, and the same swing taken at the peak or with the
  // face square to this ball.
  let racketSpeed: number | undefined;
  let peakWrist = 0;
  for (let i = c - 6; i <= c + 2; i++) {
    const a = frames[i - 1]?.world, b = frames[i + 1]?.world;
    if (!a || !b) continue;
    const d = sub(b[dom.wrist], a[dom.wrist]);
    peakWrist = Math.max(peakWrist, (Math.hypot(d.x, d.y, d.z) * fps) / 2);
  }
  if (peakWrist > 1) racketSpeed = clamp(peakWrist * HEAD_TO_WRIST, 7, 30);
  const speedIn = clamp(ball?.speedIn ?? DEFAULT_SPEED_IN, 6, 35);
  const vzIn = ball?.vz ?? STAGE_VZ[stage];
  const faceAssumed = face === undefined;
  const faceUsed = face ?? 0;
  const h = ballHeight ?? 0.9;
  const behindUsed = behind !== undefined ? Math.max(-9, behind) : -2;
  let shot: Shot | undefined, atPeak: Shot | undefined, faceSquare: Shot | undefined;
  const impact: string[] = [];
  if (racketSpeed && path !== undefined) {
    const base = { face: faceUsed, path, racketSpeed, speedIn, vzIn, height: h, behind: behindUsed };
    shot = simulate(base);
    // At the peak the ball sits a little higher and is not moving up or down.
    const peakH = ball?.apexHeight ?? h;
    atPeak = simulate({ ...base, vzIn: 0, height: peakH });
    // Square: the face at right angles to the incoming ball.
    const squareFace = (Math.atan2(vzIn, speedIn) * 180) / Math.PI;
    faceSquare = simulate({ ...base, face: squareFace });
    impact.push(...explain({ stage, ball, shot, atPeak, faceSquare, face: faceUsed, faceAssumed, squareFace, path, height: h }));
  }

  return { stage, stageSource, behindBaseline: behind, ballHeight, height, face, faceTarget, faceError, path, drive, driveTarget, brake, trunkLead, extension, brushing, tracking, lowTracking, faceNote, score, checks, headline, ball, racketSpeed, speedIn, speedInMeasured: ball?.speedIn !== undefined, faceAssumed, shot, atPeak, faceSquare, impact };
}

/** Plain summary across a session's strikes, for the study table. */
export function strikeSummary(strikes: Strike[]): { n: number; avgScore?: number; brushing: number; worst?: StrikeCheck['id'] } {
  const scored = strikes.filter((s) => s.score !== undefined);
  const count: Partial<Record<StrikeCheck['id'], number>> = {};
  for (const s of strikes) for (const c of s.checks) if (c.ok === false) count[c.id] = (count[c.id] ?? 0) + 1;
  const worst = (Object.entries(count) as [StrikeCheck['id'], number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    n: strikes.length,
    avgScore: scored.length ? Math.round(scored.reduce((a, s) => a + s.score!, 0) / scored.length) : undefined,
    brushing: strikes.filter((s) => s.brushing).length,
    worst,
  };
}

/** Exposed for the study diagram: where a ball at a stage is heading, degrees (+ upward). */
export function ballPathAngle(stage: BounceStage): number {
  return stage === 'rising' ? 10 : stage === 'peak' ? 0 : -8;
}

