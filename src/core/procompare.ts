/**
 * Pro compare: line a user's stroke up against a reference stroke (a pro's, from a clip the
 * coach imported) so both skeletons can play together and the differences can be measured.
 * Pure functions, no DOM. World points are metres, hip-centred, y down.
 */
import type { Handedness, ImagePoint, MetricId, PhaseId, PoseFrame, Stroke, Vec3 } from './types';
import { LM, LANDMARK_COUNT, sides } from './landmarks';
import { jointAngle, mid, sub, yaw } from './geometry';

export interface ProRef {
  /** Unique per stroke: `${sessionId}:${strokeId}`. */
  key: string;
  player: string;
  hand: Handedness;
  fps: number;
  frames: PoseFrame[];
  stroke: Stroke;
  sessionId?: string;
  title?: string;
}

export interface ProMatch {
  ref: ProRef;
  /** 0..100: how alike the two swings move (joint angles through the phases). */
  similarity: number;
  sameSpin: boolean;
}

/** Left/right landmark pairs, for mirroring a left-hander onto a right-hander. */
const MIRROR: number[] = (() => {
  const m = Array.from({ length: LANDMARK_COUNT }, (_, i) => i);
  const pairs: [number, number][] = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
  for (const [a, b] of pairs) { m[a] = b; m[b] = a; }
  return m;
})();

/** Mirror a world pose left-right (x flips, left and right joints swap). */
export function mirrorWorld(w: Vec3[]): Vec3[] {
  return w.map((_, i) => { const p = w[MIRROR[i]]; return { x: -p.x, y: p.y, z: p.z }; });
}

/** Shot family used for matching: forehand/backhand/serve plus spin. */
const family = (s: Stroke) => (s.type.startsWith('backhand') ? 'backhand' : s.type);

/** Map a frame of stroke `a` to the matching moment of stroke `b`, phase by phase. */
export function alignFrame(a: Stroke, b: Stroke, i: number): number {
  const pb = new Map(b.phases.map((p) => [p.id, p.frame] as const));
  const keys: [number, number][] = [];
  for (const p of a.phases) { const f = pb.get(p.id); if (f !== undefined) keys.push([p.frame, f]); }
  if (!keys.length) return Math.round(b.contactFrame + (i - a.contactFrame));
  keys.unshift([a.startFrame, b.startFrame]);
  keys.push([a.endFrame, b.endFrame]);
  keys.sort((x, y) => x[0] - y[0]);
  if (i <= keys[0][0]) return Math.max(b.startFrame, keys[0][1] - (keys[0][0] - i));
  for (let k = 1; k < keys.length; k++) {
    const [a0, b0] = keys[k - 1];
    const [a1, b1] = keys[k];
    if (i <= a1) return Math.round(a1 === a0 ? b1 : b0 + ((i - a0) / (a1 - a0)) * (b1 - b0));
  }
  return Math.min(b.endFrame, keys[keys.length - 1][1] + (i - keys[keys.length - 1][0]));
}

/** Joint angles that describe a pose regardless of camera angle or body size. */
export interface PoseAngles {
  elbow: number;
  shoulder: number;
  knee: number;
  hipShoulder: number;
  trunkLean: number;
}

export function poseAngles(w: Vec3[], hand: Handedness): PoseAngles {
  const { dom } = sides(hand);
  const knee = Math.min(jointAngle(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]), jointAngle(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle]));
  let hs = yaw(w[LM.leftShoulder], w[LM.rightShoulder]) - yaw(w[LM.leftHip], w[LM.rightHip]);
  while (hs > 180) hs -= 360;
  while (hs < -180) hs += 360;
  const hipMid = mid(w[LM.leftHip], w[LM.rightHip]);
  const sh = mid(w[LM.leftShoulder], w[LM.rightShoulder]);
  const up = sub(sh, hipMid);
  const lean = (Math.atan2(Math.hypot(up.x, up.z), -up.y) * 180) / Math.PI;
  return {
    elbow: jointAngle(w[dom.shoulder], w[dom.elbow], w[dom.wrist]),
    shoulder: jointAngle(w[dom.hip], w[dom.shoulder], w[dom.elbow]),
    knee,
    hipShoulder: Math.abs(hs),
    trunkLean: lean,
  };
}

const ANGLE_KEYS: (keyof PoseAngles)[] = ['elbow', 'shoulder', 'knee', 'hipShoulder', 'trunkLean'];

/** Mean angle difference (degrees) over the stroke, sampled at phase-aligned moments. */
export function strokeDistance(user: { frames: PoseFrame[]; stroke: Stroke; hand: Handedness }, ref: ProRef, samples = 24): number {
  let sum = 0;
  let n = 0;
  const { startFrame: s, endFrame: e } = user.stroke;
  for (let k = 0; k < samples; k++) {
    const i = Math.round(s + ((e - s) * k) / (samples - 1));
    const j = alignFrame(user.stroke, ref.stroke, i);
    const wu = user.frames[i]?.world;
    const wr = ref.frames[j]?.world;
    if (!wu || !wr) continue;
    const a = poseAngles(wu, user.hand);
    const b = poseAngles(wr, ref.hand);
    for (const key of ANGLE_KEYS) {
      const d = Math.abs(a[key] - b[key]);
      if (Number.isFinite(d)) { sum += d; n++; }
    }
  }
  return n ? sum / n : Infinity;
}

/** Pro strokes of the same kind, closest first. Same spin ranks above other spins. */
export function rankPros(user: { frames: PoseFrame[]; stroke: Stroke; hand: Handedness }, refs: ProRef[]): ProMatch[] {
  return refs
    .filter((r) => family(r.stroke) === family(user.stroke))
    .map((ref) => {
      const d = strokeDistance(user, ref);
      return { ref, similarity: Number.isFinite(d) ? Math.max(0, Math.round(100 - d * 2)) : 0, sameSpin: (ref.stroke.spin ?? null) === (user.stroke.spin ?? null) };
    })
    .sort((a, b) => Number(b.sameSpin) - Number(a.sameSpin) || b.similarity - a.similarity);
}

const torso = (w: Vec3[]) => {
  const a = mid(w[LM.leftShoulder], w[LM.rightShoulder]);
  const b = mid(w[LM.leftHip], w[LM.rightHip]);
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
};

const KEY_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

/** Pixels-per-metre and image hip centre of a user frame, fitted from its visible joints. */
function imageFit(img: ImagePoint[], w: Vec3[], vw: number, vh: number) {
  const js = KEY_JOINTS.filter((i) => img[i].v > 0.4);
  if (js.length < 5) return null;
  const px = js.map((i) => img[i].x * vw), py = js.map((i) => img[i].y * vh);
  const wx = js.map((i) => w[i].x), wy = js.map((i) => w[i].y);
  const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const [mpx, mpy, mwx, mwy] = [m(px), m(py), m(wx), m(wy)];
  let num = 0, den = 0;
  for (let k = 0; k < js.length; k++) {
    // Sign of x is free: the camera may see the body's front or back.
    num += Math.abs((px[k] - mpx) * (wx[k] - mwx)) + (py[k] - mpy) * (wy[k] - mwy);
    den += (wx[k] - mwx) ** 2 + (wy[k] - mwy) ** 2;
  }
  if (den <= 0 || num <= 0) return null;
  let sx = 0;
  for (let k = 0; k < js.length; k++) sx += (px[k] - mpx) * (wx[k] - mwx);
  const hipPx = { x: ((img[23].x + img[24].x) / 2) * vw, y: ((img[23].y + img[24].y) / 2) * vh };
  return { s: num / den, flipX: sx < 0, hipPx };
}

/** Rotate a world pose about the vertical axis through the hips. */
function rotateY(w: Vec3[], deg: number): Vec3[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const h = mid(w[LM.leftHip], w[LM.rightHip]);
  return w.map((p) => {
    const x = p.x - h.x, z = p.z - h.z;
    // Same sense as geometry.yaw (atan2(dz, dx)): positive turns x toward z.
    return { x: h.x + x * c - z * s, y: p.y, z: h.z + x * s + z * c };
  });
}

/**
 * The pro's pose at the moment matching user frame `i`, drawn into the user's video:
 * mirrored to the user's hand, turned to face the same way the user faced at the ready
 * position, scaled to the user's torso and pinned to the user's hips.
 */
export function proOverlay(
  user: { frames: PoseFrame[]; stroke: Stroke; hand: Handedness },
  ref: ProRef,
  i: number,
  vw: number,
  vh: number,
): { image: ImagePoint[]; world: Vec3[]; refFrame: number } | null {
  const fu = user.frames[i];
  const j = alignFrame(user.stroke, ref.stroke, i);
  const fr = ref.frames[j];
  if (!fu?.world || !fu.image || !fr?.world) return null;
  const fit = imageFit(fu.image, fu.world, vw, vh);
  if (!fit) return null;
  const mirror = ref.hand !== user.hand;
  const norm = (w: Vec3[]) => (mirror ? mirrorWorld(w) : w);
  // Facing: match the hip line at the ready position of each stroke.
  const ur = user.frames[user.stroke.phases[0]?.frame ?? user.stroke.startFrame]?.world;
  const rr = ref.frames[ref.stroke.phases[0]?.frame ?? ref.stroke.startFrame]?.world;
  let turn = 0;
  if (ur && rr) {
    const rn = norm(rr);
    turn = yaw(ur[LM.leftHip], ur[LM.rightHip]) - yaw(rn[LM.leftHip], rn[LM.rightHip]);
  }
  const w0 = rotateY(norm(fr.world), turn);
  const k = torso(fu.world) / (torso(w0) || 1);
  const h = mid(w0[LM.leftHip], w0[LM.rightHip]);
  const world = w0.map((p) => ({ x: (p.x - h.x) * k, y: (p.y - h.y) * k, z: (p.z - h.z) * k }));
  const sx = fit.flipX ? -fit.s : fit.s;
  const image = world.map((p) => ({ x: (fit.hipPx.x + p.x * sx) / vw, y: (fit.hipPx.y + p.y * fit.s) / vh, v: 1 }));
  return { image, world, refFrame: j };
}

export interface LiveDiff {
  key: keyof PoseAngles | 'hand';
  label: string;
  user: number;
  pro: number;
  /** user - pro, in the unit of the row. */
  delta: number;
  unit: '°' | 'cm';
}

const ANGLE_LABEL: Record<keyof PoseAngles, string> = {
  elbow: 'Hitting elbow',
  shoulder: 'Arm from body',
  knee: 'Knee bend',
  hipShoulder: 'Hip-shoulder separation',
  trunkLean: 'Trunk lean',
};

/** Differences at one moment, plus how far apart the hitting hands are (after scaling the pro to the user). */
export function liveDiff(userWorld: Vec3[], userHand: Handedness, proWorldAligned: Vec3[]): LiveDiff[] {
  const a = poseAngles(userWorld, userHand);
  const b = poseAngles(proWorldAligned, userHand);
  const rows: LiveDiff[] = ANGLE_KEYS.map((key) => ({ key, label: ANGLE_LABEL[key], user: a[key], pro: b[key], delta: a[key] - b[key], unit: '°' as const }));
  const { dom } = sides(userHand);
  const uh = sub(userWorld[dom.wrist], mid(userWorld[LM.leftHip], userWorld[LM.rightHip]));
  const ph = proWorldAligned[dom.wrist];
  const gap = Math.hypot(uh.x - ph.x, uh.y - ph.y, uh.z - ph.z) * 100;
  rows.push({ key: 'hand', label: 'Hitting hand apart', user: gap, pro: 0, delta: gap, unit: 'cm' });
  return rows.filter((r) => Number.isFinite(r.delta));
}

/** Stroke metrics compared phase by phase, biggest relative differences first. */
export interface MetricDiff { phase: PhaseId; metric: MetricId; user: number; pro: number; delta: number; score: number }

const SCALE: Partial<Record<MetricId, number>> = {
  shoulderTurn: 30, elbowAngle: 25, kneeBend: 20, contactForward: 0.2, contactHeight: 0.2, hipShoulderSep: 15, hipTurn: 20,
  weightShift: 25, legDrive: 10, bodyPower: 20, chainSequence: 1, hipSpeed: 300, trunkSpeed: 300, swingPath: 15, comDrop: 0.05,
};

export function metricDiffs(user: Stroke, ref: Stroke): MetricDiff[] {
  const out: MetricDiff[] = [];
  for (const p of user.phases) {
    const mu = user.metrics[p.id] ?? {};
    const mr = ref.metrics[p.id] ?? {};
    for (const k of Object.keys(SCALE) as MetricId[]) {
      const u = mu[k], r = mr[k];
      if (u === undefined || r === undefined) continue;
      out.push({ phase: p.id, metric: k, user: u, pro: r, delta: u - r, score: Math.abs(u - r) / SCALE[k]! });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Phase timing relative to contact (seconds), for the "tempo" comparison. */
export function phaseTiming(stroke: Stroke, fps: number): Partial<Record<PhaseId, number>> {
  return Object.fromEntries(stroke.phases.map((p) => [p.id, (p.frame - stroke.contactFrame) / fps]));
}
