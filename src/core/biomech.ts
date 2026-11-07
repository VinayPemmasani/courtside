/**
 * Whole-body biomechanics for one stroke: where the power comes from, not just what the arm does.
 * Pure functions over world landmarks (metres, hip-centred, y down). Angles in degrees.
 */
import type { Handedness, Metrics, PhaseId, PoseFrame, Stroke, Vec3 } from './types';
import { LM, sides } from './landmarks';
import { jointAngle, mid, sub, unwrap, yaw } from './geometry';
import { centreOfMass, transferSummary, weightTransfer } from './weight';

export type Spin = 'topspin' | 'flat' | 'slice';

/** Swing path at or below this angle (hand travelling down into contact) counts as slice. */
export const SLICE_MAX_PATH = -8;
/** Swing path at or above this angle (hand travelling up into contact) counts as topspin. */
export const TOPSPIN_MIN_PATH = 12;

export function spinFromPath(path: number | undefined): Spin | undefined {
  if (path === undefined || Number.isNaN(path)) return undefined;
  if (path <= SLICE_MAX_PATH) return 'slice';
  if (path >= TOPSPIN_MIN_PATH) return 'topspin';
  return 'flat';
}

function yawSeries(frames: PoseFrame[], a: number, b: number): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const f of frames) {
    if (!f.world) { out.push(prev ?? NaN); continue; }
    const y = yaw(f.world[a], f.world[b]);
    prev = prev === null || Number.isNaN(prev) ? y : unwrap(prev, y);
    out.push(prev);
  }
  return out;
}

/** Hip-line heading per frame, unwrapped (shoulder heading comes from Prepared.yaw). */
export const hipYawSeries = (frames: PoseFrame[]) => yawSeries(frames, LM.leftHip, LM.rightHip);

const hipMid = (w: Vec3[]) => mid(w[LM.leftHip], w[LM.rightHip]);

function rate(series: (i: number) => number, i: number, fps: number): number {
  const a = series(i - 1);
  const b = series(i + 1);
  return ((b - a) * fps) / 2;
}

function peakIn(from: number, to: number, f: (i: number) => number): { frame: number; value: number } | null {
  let best: { frame: number; value: number } | null = null;
  for (let i = from; i <= to; i++) {
    const v = f(i);
    if (!Number.isNaN(v) && (!best || v > best.value)) best = { frame: i, value: v };
  }
  return best;
}

export interface Biomech {
  /** Per-phase metrics to merge into Stroke.metrics. */
  byPhase: Partial<Record<PhaseId, Metrics>>;
  spin?: Spin;
  /** Frames of peak hip, trunk, elbow-extension and hand speed (the kinetic chain). */
  chainPeaks: { hips?: number; trunk?: number; elbow?: number; hand?: number };
}

/**
 * Body-power metrics. Uses the stroke's phases, so call after phases are found.
 * - swingPath: hand direction into contact; + is low-to-high (topspin), - is high-to-low (slice).
 * - hipTurn / hipShoulderSep: hip rotation and the hip-shoulder "X-factor" stretch at the coil.
 * - comDrop: how far the body sinks during the load (using gravity to load the legs).
 * - legDrive: knee extension from the deepest bend to contact (pushing off the ground).
 * - weightShift: % of body weight moved from back foot (load) to front foot (drive).
 * - hipSpeed / trunkSpeed: peak rotation speeds; chainSequence: how many links of
 *   hips → trunk → elbow → hand peak in the right order (3 = perfect chain).
 * - bodyPower: share of hand speed at contact produced by hip + trunk rotation rather than the arm.
 */
export function biomechanics(frames: PoseFrame[], stroke: Stroke, hand: Handedness, fps: number, shoulderYaw: number[], hipYaw: number[]): Biomech {
  const { dom } = sides(hand);
  const ph = (id: PhaseId) => stroke.phases.find((p) => p.id === id)?.frame;
  const ready = ph('ready') ?? stroke.startFrame;
  const contact = stroke.contactFrame;
  const coil = ph('backswing') ?? ph('trophy') ?? Math.round((ready + contact) / 2);
  const coilPhase: PhaseId = ph('backswing') !== undefined ? 'backswing' : 'trophy';
  const W = (i: number) => frames[i]?.world ?? null;
  const out: Biomech = { byPhase: {}, chainPeaks: {} };
  const set = (p: PhaseId, k: keyof Metrics, v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return;
    (out.byPhase[p] ??= {})[k] = v;
  };

  // Swing path into contact (~0.12 s window).
  const a = Math.max(stroke.startFrame, contact - Math.max(2, Math.round(0.12 * fps)));
  const wa = W(a), wc = W(contact);
  if (wa && wc && stroke.type !== 'serve') {
    const pa = sub(wa[dom.wrist], hipMid(wa));
    const pc = sub(wc[dom.wrist], hipMid(wc));
    const path = (Math.atan2(pa.y - pc.y, Math.hypot(pc.x - pa.x, pc.z - pa.z)) * 180) / Math.PI;
    set('contact', 'swingPath', path);
    out.spin = spinFromPath(path);
  }

  // Coil: hip turn and hip-shoulder separation, largest value up to the coil phase.
  const rel = (s: number[], i: number) => s[i] - s[ready];
  let sep = NaN;
  for (let i = ready; i <= coil; i++) {
    const v = Math.abs(rel(shoulderYaw, i) - rel(hipYaw, i));
    if (!Number.isNaN(v) && !(v <= sep)) sep = v;
  }
  set(coilPhase, 'hipShoulderSep', sep);
  set(coilPhase, 'hipTurn', Math.abs(rel(hipYaw, coil)));

  // Gravity load: centre-of-mass drop from ready to its lowest point before contact (y down).
  const comY = (i: number) => { const w = W(i); return w ? centreOfMass(w).y : NaN; };
  const low = peakIn(ready, contact, comY);
  if (low) {
    set('racket-drop', 'comDrop', low.value - comY(ready));
    // Leg drive: knee straightening from the deepest bend to contact.
    const knee = (i: number) => {
      const w = W(i);
      if (!w) return NaN;
      return Math.min(jointAngle(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]), jointAngle(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle]));
    };
    const deepest = peakIn(ready, contact, (i) => -knee(i));
    if (deepest) set('contact', 'legDrive', knee(contact) - -deepest.value);
  }

  // Weight transfer back foot → front foot.
  const wt = weightTransfer(frames, stroke, hand);
  const ts = transferSummary(wt, contact);
  if (ts) set('contact', 'weightShift', (ts.drive - ts.load) * 100);

  // Kinetic chain: peak speeds of each link between the coil and just after contact.
  const lo = Math.max(1, coil);
  const hi = Math.min(frames.length - 2, contact + Math.max(1, Math.round(0.05 * fps)));
  const hips = peakIn(lo, hi, (i) => Math.abs(rate((j) => hipYaw[j], i, fps)));
  const trunk = peakIn(lo, hi, (i) => Math.abs(rate((j) => shoulderYaw[j], i, fps)));
  const elbowAng = (i: number) => { const w = W(i); return w ? jointAngle(w[dom.shoulder], w[dom.elbow], w[dom.wrist]) : NaN; };
  const elbow = peakIn(lo, hi, (i) => rate(elbowAng, i, fps));
  const handSp = peakIn(lo, hi, (i) => {
    const p = W(i - 1), n = W(i + 1);
    if (!p || !n) return NaN;
    const d = sub(sub(n[dom.wrist], hipMid(n)), sub(p[dom.wrist], hipMid(p)));
    return (Math.hypot(d.x, d.y, d.z) * fps) / 2;
  });
  out.chainPeaks = { hips: hips?.frame, trunk: trunk?.frame, elbow: elbow?.frame, hand: handSp?.frame };
  set('contact', 'hipSpeed', hips?.value);
  set('contact', 'trunkSpeed', trunk?.value);
  const order = [hips, trunk, elbow, handSp];
  if (order.every(Boolean)) {
    let ok = 0;
    for (let k = 0; k < 3; k++) if (order[k]!.frame <= order[k + 1]!.frame) ok++;
    set('contact', 'chainSequence', ok);
  }

  // Body vs arm: hand velocity at contact explained by trunk rotation about the vertical axis.
  const p = W(contact - 1), n = W(contact + 1);
  if (p && n && wc) {
    const vw = sub(sub(n[dom.wrist], hipMid(n)), sub(p[dom.wrist], hipMid(p)));
    const v = { x: (vw.x * fps) / 2, y: (vw.y * fps) / 2, z: (vw.z * fps) / 2 };
    const omega = (((shoulderYaw[contact + 1] - shoulderYaw[contact - 1]) * fps) / 2) * (Math.PI / 180);
    const r = sub(wc[dom.wrist], hipMid(wc));
    const vRot = { x: -r.z * omega, z: r.x * omega };
    const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
    if (v2 > 0.25 && Number.isFinite(omega)) {
      const share = (vRot.x * v.x + vRot.z * v.z) / v2;
      set('contact', 'bodyPower', Math.max(0, Math.min(1, share)) * 100);
    }
  }
  return out;
}
