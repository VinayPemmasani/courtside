/**
 * Step-by-step stroke breakdown: the stroke cut into four chapters (coil, forward swing, contact,
 * finish), each with the frame to hold on, the frames to play into it, the numbers to show on the
 * body and a short caption. Pure: the 3D studio and the panel both draw from this.
 *
 * Every reading says where it comes from. "measured" is read from the tracked body (joint
 * positions in the video); "estimated" depends on something the camera cannot see directly, such
 * as the racket (simulated from the hand and forearm) or depth toward the lens.
 */
import { isOverhead } from './types';
import type { Handedness, MetricId, PhaseId, PoseFrame, Status, Stroke } from './types';
import { LM } from './landmarks';
import { jointAngle, mid, sub } from './geometry';
import { chainCurves, hipYawSeries } from './biomech';
import { centreOfMass, shareAt, weightTransfer } from './weight';
import { racketTrack } from './motion';
import { strokeStage } from './rules';

export type ChapterId = 'coil' | 'swing' | 'contact' | 'finish';
export type Source = 'measured' | 'estimated';

export interface Reading {
  id: string;
  label: string;
  /** Number in display units (degrees, metres, cm, %, ms). */
  value: number;
  unit: string;
  digits: number;
  source: Source;
  status?: Status;
}

export interface Beat {
  topic: string;
  text: string;
}

/** What the 3D view draws for a chapter. */
export interface ChapterLook {
  /** Camera: 'top' looks straight down; the others circle the player at `yaw` degrees from behind, toward the hitting side. */
  camera: { top?: boolean; yaw: number; height: number; dist: number };
  /** Lines drawn through the see-through body. */
  lines: ('shoulders' | 'hips' | 'legs' | 'spine')[];
  /** Ghost rackets from this frame to the current one (a trail of the racket through the swing). */
  ghostsFrom: number;
}

export interface Chapter {
  id: ChapterId;
  step: number;
  title: string;
  /** Frame the chapter holds on. */
  frame: number;
  /** First frame of the slow-motion run into `frame`. */
  from: number;
  beats: Beat[];
  readings: Reading[];
  look: ChapterLook;
}

export interface ChainMark {
  id: 'hips' | 'trunk' | 'elbow' | 'hand';
  label: string;
  /** Peak time relative to contact, ms (negative = before contact). */
  ms: number;
}

export interface Breakdown {
  chapters: Chapter[];
  /** Kinetic chain peak times, in the order they should fire. */
  chain: ChainMark[];
  /** Chain fired in order (hips, trunk, arm, hand): 0..3 links right. */
  chainInOrder?: number;
  /** Shoulder and hip line rotation (degrees, + = turned back) at every frame from the start of the stroke, for the gauge. */
  turn: { from: number; shoulders: number[]; hips: number[] };
  /** Index of the front leg's knee landmark at contact (for colouring the legs), when the feet were readable. */
  frontKnee?: number;
}

export interface BreakdownInput {
  frames: PoseFrame[];
  /** Unwrapped shoulder-line heading per frame (Prepared.yaw). */
  yaw: number[];
  fps: number;
  hand: Handedness;
}

const r1 = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

function statusFor(stroke: Stroke, phase: PhaseId | PhaseId[], metric: MetricId): Status | undefined {
  const ps = Array.isArray(phase) ? phase : [phase];
  const kp = stroke.keyPoints.find((k) => k.metric === metric && ps.includes(k.phaseId));
  return kp?.status === 'info' ? undefined : kp?.status;
}

export function knees(w: PoseFrame['world']) {
  if (!w) return null;
  return {
    left: jointAngle(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]),
    right: jointAngle(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle]),
  };
}

/**
 * Build the four chapters for one stroke. Overheads use the racket-up position as the "coil" and drive
 * up rather than forward; volleys and unknown strokes still get the same four steps.
 */
export function strokeBreakdown(p: BreakdownInput, stroke: Stroke): Breakdown {
  const { frames, fps, hand } = p;
  const serve = isOverhead(stroke.type);
  const ph = (id: PhaseId) => stroke.phases.find((x) => x.id === id)?.frame;
  const start = stroke.startFrame;
  const contact = stroke.contactFrame;
  const ready = ph('ready') ?? start;
  const coil = Math.min(contact - 1, ph('backswing') ?? ph('trophy') ?? Math.round((ready + contact) / 2));
  const coilPhase: PhaseId = ph('backswing') !== undefined ? 'backswing' : 'trophy';
  const finish = Math.max(contact + 1, Math.min(stroke.endFrame, ph('follow-through') ?? stroke.endFrame));
  const W = (i: number) => frames[i]?.world ?? null;
  const metric = (phase: PhaseId, id: MetricId) => stroke.metrics[phase]?.[id];

  // Rotation of the shoulder and hip lines since the ready position, + = turned back.
  const hipYaw = hipYawSeries(frames);
  const sh0 = p.yaw[ready], hp0 = hipYaw[ready];
  const sign = Math.sign(p.yaw[coil] - sh0) || 1;
  const turnFrom = start;
  const shoulders: number[] = [], hips: number[] = [];
  for (let i = start; i <= stroke.endFrame; i++) {
    shoulders.push((p.yaw[i] - sh0) * sign);
    hips.push((hipYaw[i] - hp0) * sign);
  }
  const at = (arr: number[], i: number) => arr[Math.max(0, Math.min(arr.length - 1, i - turnFrom))];

  // ---- 1. Coil ----
  const shTurn = at(shoulders, coil);
  const hipTurn = at(hips, coil);
  const sep = metric(coilPhase, 'hipShoulderSep') ?? Math.abs(shTurn - hipTurn);
  const coilReadings: Reading[] = [];
  if (Number.isFinite(shTurn)) coilReadings.push({ id: 'shoulderTurn', label: 'Shoulder turn', value: r1(Math.abs(shTurn), 0), unit: '°', digits: 0, source: 'measured', status: statusFor(stroke, coilPhase, 'shoulderTurn') });
  if (Number.isFinite(hipTurn)) coilReadings.push({ id: 'hipTurn', label: 'Hip turn', value: r1(Math.abs(hipTurn), 0), unit: '°', digits: 0, source: 'measured' });
  if (Number.isFinite(sep)) coilReadings.push({ id: 'sep', label: 'Shoulders past hips', value: r1(sep, 0), unit: '°', digits: 0, source: 'measured', status: statusFor(stroke, coilPhase, 'hipShoulderSep') });
  const kc = knees(W(coil));
  if (kc) coilReadings.push({ id: 'kneeCoil', label: 'Knee angle (deeper)', value: r1(Math.min(kc.left, kc.right), 0), unit: '°', digits: 0, source: 'measured', status: statusFor(stroke, coilPhase, 'kneeBend') });
  const coilBeats: Beat[] = [];
  if (Number.isFinite(shTurn) && Number.isFinite(hipTurn)) {
    coilBeats.push({
      topic: serve ? 'Paddle up' : 'Shoulder coil',
      text: sep >= 20
        ? `Shoulders turned ${Math.round(Math.abs(shTurn))}°, hips ${Math.round(Math.abs(hipTurn))}°: the trunk is wound ${Math.round(sep)}° past the hips, ready to uncoil.`
        : `Shoulders ${Math.round(Math.abs(shTurn))}° and hips ${Math.round(Math.abs(hipTurn))}° turn almost together (${Math.round(sep)}°). Turn the shoulders further than the hips to store more stretch.`,
    });
  }
  if (kc) coilBeats.push({ topic: 'Load', text: Math.min(kc.left, kc.right) <= 158 ? `Knees flexed to ${Math.round(Math.min(kc.left, kc.right))}°: the legs are loaded for the push.` : `Legs almost straight (${Math.round(Math.min(kc.left, kc.right))}°). Sit a little lower to load them.` });

  // ---- 2. Forward swing: racket drop and the kinetic chain ----
  const track = racketTrack(frames, hand, fps);
  let drop = { frame: ph('paddle-drop') ?? Math.round((coil + contact) / 2), cm: NaN };
  const dropEnd = contact - Math.max(2, Math.round(0.3 * (contact - coil)));
  for (let i = coil; i <= dropEnd; i++) {
    const r = track[i];
    if (!r) continue;
    const below = (r.head.y - r.grip.y) * 100; // y down: + = head below the hand
    if (!(below <= drop.cm)) drop = { frame: i, cm: below };
  }
  drop.frame = Math.max(coil + 1, Math.min(contact - 2, drop.frame));
  const chainC = chainCurves(frames, stroke, hand, fps, p.yaw, hipYaw);
  const meta = { hips: 'Hips', trunk: 'Trunk', elbow: 'Arm', hand: 'Hand' } as const;
  const chain: ChainMark[] = [];
  for (const id of ['hips', 'trunk', 'elbow', 'hand'] as const) {
    const pk = chainC.links.find((l) => l.id === id)?.peak;
    if (pk) chain.push({ id, label: meta[id], ms: Math.round(((pk.frame - contact) / fps) * 1000) });
  }
  let chainInOrder: number | undefined;
  if (chain.length === 4) { chainInOrder = 0; for (let k = 0; k < 3; k++) if (chain[k].ms <= chain[k + 1].ms) chainInOrder++; }
  const swingReadings: Reading[] = [];
  if (Number.isFinite(drop.cm)) swingReadings.push({ id: 'drop', label: serve ? 'Paddle drop behind back' : 'Paddle head below hand', value: r1(drop.cm, 0), unit: 'cm', digits: 0, source: 'estimated' });
  const comDrop = metric('paddle-drop', 'comDrop');
  if (comDrop !== undefined) swingReadings.push({ id: 'comDrop', label: 'Body sinks (gravity load)', value: r1(comDrop * 100, 0), unit: 'cm', digits: 0, source: 'measured' });
  if (chainInOrder !== undefined) swingReadings.push({ id: 'chain', label: 'Chain in order', value: chainInOrder, unit: '/3', digits: 0, source: 'measured', status: statusFor(stroke, 'contact', 'chainSequence') });
  const hipSp = metric('contact', 'hipSpeed');
  if (hipSp !== undefined) swingReadings.push({ id: 'hipSpeed', label: 'Peak hip turn speed', value: r1(hipSp, 0), unit: '°/s', digits: 0, source: 'measured' });
  const swingBeats: Beat[] = [];
  if (Number.isFinite(drop.cm)) {
    swingBeats.push({
      topic: 'Paddle drop',
      text: drop.cm > 3
        ? `The racket head drops about ${Math.round(drop.cm)} cm below the hand, then swings up to the ball (est.).`
        : 'The paddle head stays level with or above the hand: let it drop below the ball before swinging up (est.).',
    });
  }
  if (chain.length === 4) {
    const order = chain.map((c) => c.label.toLowerCase());
    swingBeats.push({
      topic: 'Kinetic chain',
      text: chainInOrder === 3
        ? `Hips peak first (${chain[0].ms} ms), then trunk, arm and hand: power flows from the ground up.`
        : `Peak order: ${[...chain].sort((a, b) => a.ms - b.ms).map((c) => c.label.toLowerCase()).join(' → ')}. The ideal is ${order.join(' → ')}, each link handing speed to the next.`,
    });
  }

  // ---- 3. Contact ----
  const wc = W(contact);
  const contactReadings: Reading[] = [];
  const fwd = metric('contact', 'contactForward');
  if (fwd !== undefined && !serve) contactReadings.push({ id: 'contactForward', label: 'Contact in front of hips', value: r1(fwd, 2), unit: 'm', digits: 2, source: 'measured', status: statusFor(stroke, 'contact', 'contactForward') });
  const wt = weightTransfer(frames, stroke, hand);
  let frontKnee: number | undefined;
  const kk = knees(wc);
  if (kk) {
    const frontLeft = wt ? wt.front === LM.leftAnkle : hand === 'right';
    frontKnee = frontLeft ? LM.leftKnee : LM.rightKnee;
    contactReadings.push({ id: 'kneeFront', label: 'Front knee', value: r1(frontLeft ? kk.left : kk.right, 0), unit: '°', digits: 0, source: 'measured' });
    contactReadings.push({ id: 'kneeBack', label: 'Back knee', value: r1(frontLeft ? kk.right : kk.left, 0), unit: '°', digits: 0, source: 'measured' });
  }
  const legDrive = metric('contact', 'legDrive');
  if (legDrive !== undefined) contactReadings.push({ id: 'legDrive', label: 'Leg drive (knee straightens)', value: r1(legDrive, 0), unit: '°', digits: 0, source: 'measured', status: statusFor(stroke, 'contact', 'legDrive') });
  // Body rise from the lowest point to contact (centre of mass, y down).
  let rise: number | undefined;
  if (wc) {
    let low = -Infinity;
    for (let i = coil; i <= contact; i++) { const w = W(i); if (w) low = Math.max(low, centreOfMass(w).y); }
    if (Number.isFinite(low)) rise = (low - centreOfMass(wc).y) * 100;
    if (rise !== undefined) contactReadings.push({ id: 'rise', label: 'Body rises into the ball', value: r1(rise, 0), unit: 'cm', digits: 0, source: 'measured' });
  }
  const share = shareAt(wt, contact);
  if (share !== null) contactReadings.push({ id: 'weight', label: 'Weight on front foot', value: Math.round(share * 100), unit: '%', digits: 0, source: 'measured', status: statusFor(stroke, 'contact', 'weightShift') });
  const elbow = metric('contact', 'elbowAngle');
  if (elbow !== undefined) contactReadings.push({ id: 'elbow', label: 'Hitting elbow', value: r1(elbow, 0), unit: '°', digits: 0, source: 'measured', status: statusFor(stroke, 'contact', 'elbowAngle') });
  const face = metric('contact', 'faceTilt');
  if (face !== undefined) contactReadings.push({ id: 'face', label: 'Paddle face closed', value: r1(face, 0), unit: '°', digits: 0, source: 'estimated' });
  const stage = strokeStage(stroke);
  const contactBeats: Beat[] = [];
  if (fwd !== undefined && !serve) {
    contactBeats.push({
      topic: 'Contact point',
      text: fwd >= 0.15
        ? `Ball met ${fwd.toFixed(2)} m in front of the hips: body behind, ball ahead, so the swing's power goes into the ball.`
        : `Contact only ${fwd.toFixed(2)} m in front of the hips (late). Meet it further out front, ahead of the front hip.`,
    });
  }
  if (legDrive !== undefined || rise !== undefined) {
    const up = rise ?? 0;
    contactBeats.push({
      topic: 'Leg drive',
      text: (legDrive ?? 0) >= 8 || up >= 3
        ? `Knees straighten ${Math.round(legDrive ?? 0)}°${up >= 2 ? ` and the body rises ${Math.round(up)} cm` : ''} into contact: the legs push the turn.`
        : `Little upward drive (${Math.round(legDrive ?? 0)}°, ${Math.round(up)} cm): power is coming mostly from turning in place.`,
    });
  }
  if (stage) contactBeats.push({ topic: 'Ball timing', text: stage === 'rising' ? 'Taken on the rise: shorter swing, face a touch closed, use the ball\'s pace.' : stage === 'peak' ? 'Taken at the top of the bounce: the ideal height to drive through.' : 'Taken as it falls: get lower and lift more through the ball.' });

  // ---- 4. Finish ----
  const wf = W(finish);
  const finishReadings: Reading[] = [];
  const rot = at(shoulders, finish) - at(shoulders, coil);
  if (Number.isFinite(rot)) finishReadings.push({ id: 'uncoil', label: 'Shoulders rotate through', value: r1(Math.abs(rot), 0), unit: '°', digits: 0, source: 'measured' });
  const high = metric('follow-through', 'wristAboveShoulder');
  if (high !== undefined) finishReadings.push({ id: 'finishHigh', label: 'Hand above shoulder', value: r1(high * 100, 0), unit: 'cm', digits: 0, source: 'measured', status: statusFor(stroke, 'follow-through', 'wristAboveShoulder') });
  const across = metric('follow-through', 'crossBody');
  if (across !== undefined) finishReadings.push({ id: 'across', label: 'Hand across body', value: r1(across * 100, 0), unit: 'cm', digits: 0, source: 'measured', status: statusFor(stroke, 'follow-through', 'crossBody') });
  const shareF = shareAt(wt, finish);
  if (shareF !== null) finishReadings.push({ id: 'weightF', label: 'Weight on front foot', value: Math.round(shareF * 100), unit: '%', digits: 0, source: 'measured' });
  // Balance: head over the base of support (horizontal distance from head to the mid-feet, cm).
  let balance: number | undefined;
  if (wf) {
    const feet = mid(wf[LM.leftAnkle], wf[LM.rightAnkle]);
    const d = sub(wf[LM.nose], feet);
    balance = Math.hypot(d.x, d.z) * 100;
    finishReadings.push({ id: 'balance', label: 'Head off centre of feet', value: r1(balance, 0), unit: 'cm', digits: 0, source: 'measured' });
  }
  const finishBeats: Beat[] = [];
  if (Number.isFinite(rot)) finishBeats.push({ topic: 'Rotation', text: `Shoulders rotate ${Math.round(Math.abs(rot))}° from the coil to the finish: ${Math.abs(rot) >= 120 ? 'a full release, chest facing the target.' : 'keep turning until the chest faces the target.'}` });
  if (high !== undefined || across !== undefined) finishBeats.push({ topic: 'Finish', text: (high ?? 0) >= -0.05 && (across ?? 0) >= 0.05 ? 'The hand finishes high and across the body: the swing was not cut short.' : 'Let the swing run on: finish with the hand higher and further across the body.' });
  if (balance !== undefined) finishBeats.push({ topic: 'Balance', text: balance <= 30 ? `Head stays over the feet (${Math.round(balance)} cm off centre): balanced and ready to recover.` : `Head ${Math.round(balance)} cm outside the feet at the finish: you are falling out of the shot.` });

  const chapters: Chapter[] = [
    {
      id: 'coil', step: 1, title: serve ? 'Paddle up' : 'Shoulder coil', frame: coil, from: Math.max(start, ready - 2),
      beats: coilBeats, readings: coilReadings,
      look: { camera: { top: true, yaw: 0, height: 3.5, dist: 0 }, lines: ['shoulders', 'hips'], ghostsFrom: Math.max(start, ready) },
    },
    {
      id: 'swing', step: 2, title: 'Forward swing', frame: drop.frame, from: coil,
      beats: swingBeats, readings: swingReadings,
      look: { camera: { yaw: 62, height: 1.25, dist: 2.9 }, lines: ['spine'], ghostsFrom: coil },
    },
    {
      id: 'contact', step: 3, title: 'Contact', frame: contact, from: drop.frame,
      beats: contactBeats, readings: contactReadings,
      look: { camera: { yaw: 90, height: 1.05, dist: 3.1 }, lines: ['legs'], ghostsFrom: coil },
    },
    {
      id: 'finish', step: 4, title: 'Finish', frame: finish, from: contact,
      beats: finishBeats, readings: finishReadings,
      look: { camera: { yaw: 150, height: 1.55, dist: 3.4 }, lines: ['shoulders', 'hips'], ghostsFrom: contact },
    },
  ];
  for (const c of chapters) if (!c.beats.length) c.beats.push({ topic: c.title, text: 'Not enough of the body was tracked here to measure this step.' });
  return { chapters, chain, chainInOrder, turn: { from: turnFrom, shoulders, hips }, frontKnee };
}

/** Format a reading for display: "0.42 m", "105°", "+12 cm". */
export function formatReading(r: Reading): string {
  const v = r.value.toFixed(r.digits);
  const sp = r.unit === '°' || r.unit === '%' || r.unit.startsWith('/') ? '' : ' ';
  return `${v}${sp}${r.unit}`;
}
