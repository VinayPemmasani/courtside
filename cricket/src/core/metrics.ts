import type { Handedness, MetricId, Metrics, PoseFrame, Vec3 } from './types';
import { LM, sides } from './landmarks';
import { dist, dot, flatUnit, jointAngle, mid, sub, unwrap, yaw } from './geometry';

export interface BodyAxes {
  hipMid: Vec3;
  /** Ground-plane unit vector toward the dominant side of the hips. */
  lateralDom: Vec3;
  /** Ground-plane unit vector the hips face. */
  forward: Vec3;
}

export function bodyAxes(w: Vec3[], hand: Handedness): BodyAxes {
  const hipMid = mid(w[LM.leftHip], w[LM.rightHip]);
  const toRight = flatUnit(sub(w[LM.rightHip], w[LM.leftHip]));
  const lateralDom = hand === 'right' ? toRight : { x: -toRight.x, y: 0, z: -toRight.z };
  // Perpendicular to the hip line; the nose sits in front of the shoulders, which picks the sign
  // without relying on the model's depth-axis convention.
  let forward: Vec3 = { x: -toRight.z, y: 0, z: toRight.x };
  const shoulderMid = mid(w[LM.leftShoulder], w[LM.rightShoulder]);
  const noseAhead = dot(sub(w[LM.nose], shoulderMid), forward);
  if (noseAhead < 0) forward = { x: -forward.x, y: 0, z: -forward.z };
  return { hipMid, lateralDom, forward };
}

/** Heading of the shoulder line for every frame, unwrapped so rotation accumulates past 180°. */
export function shoulderYawSeries(frames: PoseFrame[]): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const f of frames) {
    if (!f.world) { out.push(prev ?? NaN); continue; }
    const y = yaw(f.world[LM.leftShoulder], f.world[LM.rightShoulder]);
    prev = prev === null || Number.isNaN(prev) ? y : unwrap(prev, y);
    out.push(prev);
  }
  return out;
}

/** Index of the more bent knee in this frame (used to anchor the knee callout). */
export function deeperKnee(w: Vec3[]): number {
  const l = jointAngle(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]);
  const r = jointAngle(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle]);
  return l <= r ? LM.leftKnee : LM.rightKnee;
}

const deg = (r: number) => (r * 180) / Math.PI;
/** Angle of a segment from straight up, in degrees (y is down in the pose). */
export function fromVertical(a: Vec3, b: Vec3): number {
  const d = sub(b, a);
  return deg(Math.atan2(Math.hypot(d.x, d.z), -d.y));
}

/**
 * Every per-frame metric at frame `i`. Distances are metres, angles degrees. Stroke-level values
 * (elbow extension, bat speed, front-knee flex, counter-rotation…) come from `cricketMetrics`.
 * `shoulderTurn` is the shoulder-line rotation since `refFrame` (the stance or run-up frame).
 * For a right-hander the front side is the left: front knee, front elbow, front arm.
 */
export function measure(frames: PoseFrame[], i: number, refFrame: number, hand: Handedness, yawSeries: number[]): Metrics {
  const w = frames[i]?.world;
  if (!w) return {};
  const { dom, non } = sides(hand);
  const axes = bodyAxes(w, hand);
  const hands = mid(w[LM.leftWrist], w[LM.rightWrist]);
  const shoulders = mid(w[LM.leftShoulder], w[LM.rightShoulder]);
  // Back foot → front foot on the ground: "toward the bowler" for the batter's stride.
  const u = flatUnit(sub(w[non.ankle], w[dom.ankle]));
  const nose = w[LM.nose];
  const m: Metrics = {
    shoulderTurn: Math.abs(yawSeries[i] - yawSeries[refFrame]),
    kneeBend: Math.min(
      jointAngle(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]),
      jointAngle(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle]),
    ),
    frontKnee: jointAngle(w[non.hip], w[non.knee], w[non.ankle]),
    handsTogether: dist(w[LM.leftWrist], w[LM.rightWrist]),
    strideLength: Math.hypot(w[non.ankle].x - w[dom.ankle].x, w[non.ankle].z - w[dom.ankle].z),
    headOverFront: dot(sub(nose, w[non.knee]), u),
    handsUnderEyes: dot(sub(hands, nose), u),
    backliftHeight: shoulders.y - hands.y,
    frontElbowHigh: w[non.wrist].y - w[non.elbow].y,
    finishHeight: nose.y - hands.y,
    releaseHeight: nose.y - w[dom.wrist].y,
    armFromVertical: fromVertical(w[dom.shoulder], w[dom.wrist]),
    trunkSideBend: fromVertical(axes.hipMid, shoulders),
    frontArmUp: nose.y - w[non.wrist].y,
    followAcross: -dot(sub(w[dom.wrist], axes.hipMid), axes.lateralDom),
  };
  for (const k of Object.keys(m) as MetricId[]) if (!Number.isFinite(m[k]!)) delete m[k];
  return m;
}

export const METRIC_INFO: Record<MetricId, { label: string; unit: string; digits: number }> = {
  backliftHeight: { label: 'Hands above shoulders', unit: 'm', digits: 2 },
  headOverFront: { label: 'Head ahead of front knee', unit: 'm', digits: 2 },
  headStill: { label: 'Eye line tilt', unit: '°', digits: 0 },
  frontKnee: { label: 'Front knee angle', unit: '°', digits: 0 },
  strideLength: { label: 'Stride length (ankle to ankle)', unit: 'm', digits: 2 },
  frontElbowHigh: { label: 'Front elbow above front hand', unit: 'm', digits: 2 },
  handsTogether: { label: 'Distance between hands', unit: 'm', digits: 2 },
  handsUnderEyes: { label: 'Hands ahead of head', unit: 'm', digits: 2 },
  shoulderTurn: { label: 'Shoulder rotation', unit: '°', digits: 0 },
  finishHeight: { label: 'Hands above head at finish', unit: 'm', digits: 2 },
  batSpeed: { label: 'Peak hand speed', unit: 'm/s', digits: 1 },
  elbowExtension: { label: 'Elbow extension (arm horizontal → release)', unit: '°', digits: 0 },
  frontKneeFlex: { label: 'Front knee flex after landing', unit: '°', digits: 0 },
  releaseHeight: { label: 'Bowling hand above head', unit: 'm', digits: 2 },
  armFromVertical: { label: 'Bowling arm from vertical', unit: '°', digits: 0 },
  trunkSideBend: { label: 'Trunk side bend', unit: '°', digits: 0 },
  frontArmUp: { label: 'Front arm above head', unit: 'm', digits: 2 },
  counterRotation: { label: 'Shoulder counter-rotation', unit: '°', digits: 0 },
  followAcross: { label: 'Bowling hand across body', unit: 'm', digits: 2 },
  armSpeed: { label: 'Peak bowling-hand speed', unit: 'm/s', digits: 1 },
  kneeBend: { label: 'Most-bent knee angle', unit: '°', digits: 0 },
  hipTurn: { label: 'Hip turn', unit: '°', digits: 0 },
  hipShoulderSep: { label: 'Hip-shoulder separation', unit: '°', digits: 0 },
  weightShift: { label: 'Weight moved to front foot', unit: '%', digits: 0 },
  hipSpeed: { label: 'Peak hip rotation speed', unit: '°/s', digits: 0 },
  trunkSpeed: { label: 'Peak trunk rotation speed', unit: '°/s', digits: 0 },
  chainSequence: { label: 'Kinetic chain order (of 3)', unit: '', digits: 0 },
  bodyPower: { label: 'Hand speed from body rotation', unit: '%', digits: 0 },
};

export function formatMetric(id: MetricId, v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '–';
  const info = METRIC_INFO[id];
  const u = info.unit === '°' || info.unit === '%' || info.unit === '' ? info.unit : ' ' + info.unit;
  return `${v.toFixed(info.digits)}${u}`;
}
