/**
 * Stroke-level cricket measurements: what one frame cannot show on its own (elbow extension
 * through the delivery, front-knee bracing, counter-rotation, bat speed, the kinetic chain).
 * Pure functions over world landmarks (metres, hip-centred, y down). Angles in degrees.
 */
import type { Handedness, Metrics, PhaseId, PoseFrame, Stroke, Vec3 } from './types';
import { isBowling, LM, sides } from './landmarks';
import { headingDiff, jointAngle, mid, sub, unwrap, yaw } from './geometry';
import { transferSummary, weightTransfer } from './weight';
import { contactPhase } from './phases';
import { actionSpeed } from './strokes';

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
  return ((series(i + 1) - series(i - 1)) * fps) / 2;
}

function peakIn(from: number, to: number, f: (i: number) => number): { frame: number; value: number } | null {
  let best: { frame: number; value: number } | null = null;
  for (let i = from; i <= to; i++) {
    const v = f(i);
    if (!Number.isNaN(v) && (!best || v > best.value)) best = { frame: i, value: v };
  }
  return best;
}

/**
 * The frame the bowling arm's upper arm comes up through horizontal (elbow level with the
 * shoulder) on its way to release: where the Laws start measuring elbow extension.
 */
export function armHorizontalFrame(frames: PoseFrame[], from: number, release: number, hand: Handedness): number {
  const { dom } = sides(hand);
  for (let i = Math.max(0, from); i < release; i++) {
    const w = frames[i]?.world;
    if (w && w[dom.elbow].y <= w[dom.shoulder].y) return i;
  }
  return -1;
}

export interface Biomech {
  /** Per-phase metrics to merge into Stroke.metrics. */
  byPhase: Partial<Record<PhaseId, Metrics>>;
  /** Frames of peak hip, trunk, elbow and hand speed (the kinetic chain). */
  chainPeaks: { hips?: number; trunk?: number; elbow?: number; hand?: number };
  /** Bowling: the frame the upper arm passed horizontal (start of the elbow-extension window). */
  armHorizontal?: number;
}

export function cricketMetrics(frames: PoseFrame[], stroke: Stroke, hand: Handedness, fps: number, shoulderYaw: number[], hipYaw: number[]): Biomech {
  const { dom, non } = sides(hand);
  const ph = (id: PhaseId) => stroke.phases.find((p) => p.id === id)?.frame;
  const contact = stroke.contactFrame;
  const cPhase = contactPhase(stroke.type);
  const W = (i: number) => frames[i]?.world ?? null;
  const out: Biomech = { byPhase: {}, chainPeaks: {} };
  const set = (p: PhaseId, k: keyof Metrics, v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return;
    (out.byPhase[p] ??= {})[k] = v;
  };
  const elbow = (i: number) => { const w = W(i); return w ? jointAngle(w[dom.shoulder], w[dom.elbow], w[dom.wrist]) : NaN; };
  const frontKnee = (i: number) => { const w = W(i); return w ? jointAngle(w[non.hip], w[non.knee], w[non.ankle]) : NaN; };
  const sp = actionSpeed(frames, fps, hand, isBowling(stroke.type) ? 'bowling' : 'batting');
  const r = Math.max(1, Math.round(0.05 * fps));
  const peakSp = peakIn(Math.max(0, contact - r), Math.min(frames.length - 1, contact + r), (i) => sp[i] ?? NaN)?.value;

  if (isBowling(stroke.type)) {
    const bfc = ph('back-foot') ?? stroke.startFrame;
    const ffc = ph('front-foot') ?? contact;
    // Elbow extension: release angle minus the most-bent angle from arm-horizontal to release.
    const h = armHorizontalFrame(frames, bfc, contact, hand);
    if (h >= 0) {
      out.armHorizontal = h;
      let least = Infinity;
      for (let i = h; i <= contact; i++) { const a = elbow(i); if (a < least) least = a; }
      set('release', 'elbowExtension', Math.max(0, elbow(contact) - least));
    }
    // Front-knee bracing: how far the knee bends after the front foot lands.
    let mostBent = frontKnee(ffc);
    for (let i = ffc; i <= contact; i++) { const k = frontKnee(i); if (k < mostBent) mostBent = k; }
    set('release', 'frontKneeFlex', frontKnee(ffc) - mostBent);
    // Counter-rotation: the shoulders turning back away from the batter between the two foot plants.
    let scr = 0;
    for (let i = bfc; i <= ffc; i++) {
      const v = Math.abs(shoulderYaw[i] - shoulderYaw[bfc]);
      if (Number.isFinite(v) && v > scr) scr = v;
    }
    set('front-foot', 'counterRotation', scr);
    // Mixed action check: hips and shoulders lined up differently at back-foot contact.
    if (Number.isFinite(shoulderYaw[bfc]) && Number.isFinite(hipYaw[bfc])) {
      const d = Math.abs(headingDiff(shoulderYaw[bfc], hipYaw[bfc]));
      set('back-foot', 'hipShoulderSep', Math.min(d, 180 - d));
    }
    set('release', 'armSpeed', peakSp);
  } else {
    set('impact', 'batSpeed', peakSp);
    // Eye line: the angle of the line through the eyes from level at impact.
    const w = W(contact);
    if (w) {
      const e = sub(w[5], w[2]);
      const t = (Math.atan2(Math.abs(e.y), Math.hypot(e.x, e.z)) * 180) / Math.PI;
      set('impact', 'headStill', t);
    }
    const stance = ph('stance') ?? stroke.startFrame;
    set('impact', 'hipTurn', Math.abs(hipYaw[contact] - hipYaw[stance]));
  }

  // Weight transfer back foot → front foot.
  const wt = weightTransfer(frames, stroke, hand);
  const ts = transferSummary(wt, contact);
  if (ts) set(cPhase, 'weightShift', (ts.drive - ts.load) * 100);

  // Kinetic chain: peak speeds of each link up to just after impact or release.
  const chain = chainCurves(frames, stroke, hand, fps, shoulderYaw, hipYaw);
  const peak = (id: ChainLinkId) => chain.links.find((l) => l.id === id)?.peak;
  const hips = peak('hips'), trunk = peak('trunk'), elb = peak('elbow'), handSp = peak('hand');
  out.chainPeaks = { hips: hips?.frame, trunk: trunk?.frame, elbow: elb?.frame, hand: handSp?.frame };
  set(cPhase, 'hipSpeed', hips?.value);
  set(cPhase, 'trunkSpeed', trunk?.value);
  const order = [hips, trunk, elb, handSp];
  if (order.every(Boolean)) {
    let ok = 0;
    for (let k = 0; k < 3; k++) if (order[k]!.frame <= order[k + 1]!.frame) ok++;
    set(cPhase, 'chainSequence', ok);
  }
  return out;
}

export type ChainLinkId = 'hips' | 'trunk' | 'elbow' | 'hand';

export interface ChainLink {
  id: ChainLinkId;
  label: string;
  unit: string;
  values: number[];
  peak?: { frame: number; value: number };
}

export interface ChainCurves {
  from: number;
  to: number;
  contact: number;
  links: ChainLink[];
}

/**
 * Speed of each link of the kinetic chain into impact or release: hip and trunk rotation (°/s),
 * arm (elbow) speed (°/s) and hand speed (m/s). A good chain peaks in that order.
 */
export function chainCurves(frames: PoseFrame[], stroke: Stroke, hand: Handedness, fps: number, shoulderYaw: number[], hipYaw: number[]): ChainCurves {
  const { dom } = sides(hand);
  const ph = (id: PhaseId) => stroke.phases.find((p) => p.id === id)?.frame;
  const contact = stroke.contactFrame;
  const coil = ph('backlift') ?? ph('back-foot') ?? Math.round((stroke.startFrame + contact) / 2);
  const W = (i: number) => frames[i]?.world ?? null;
  const lo = Math.max(1, coil);
  const hi = Math.min(frames.length - 2, contact + Math.max(1, Math.round(0.05 * fps)));
  const from = lo;
  const to = Math.min(frames.length - 2, Math.max(hi, ph('follow-through') ?? hi));
  const bowl = isBowling(stroke.type);
  const elbowAng = (i: number) => { const w = W(i); return w ? jointAngle(w[dom.shoulder], w[dom.elbow], w[dom.wrist]) : NaN; };
  const point = (w: Vec3[]) => (bowl ? w[dom.wrist] : mid(w[15], w[16]));
  const speed: Record<ChainLinkId, (i: number) => number> = {
    hips: (i) => Math.abs(rate((j) => hipYaw[j], i, fps)),
    trunk: (i) => Math.abs(rate((j) => shoulderYaw[j], i, fps)),
    elbow: (i) => Math.abs(rate(elbowAng, i, fps)),
    hand: (i) => {
      const p = W(i - 1), n = W(i + 1);
      if (!p || !n) return NaN;
      const d = sub(sub(point(n), hipMid(n)), sub(point(p), hipMid(p)));
      return (Math.hypot(d.x, d.y, d.z) * fps) / 2;
    },
  };
  const meta: { id: ChainLinkId; label: string; unit: string }[] = [
    { id: 'hips', label: 'Hips', unit: '°/s' },
    { id: 'trunk', label: 'Trunk', unit: '°/s' },
    { id: 'elbow', label: 'Arm', unit: '°/s' },
    { id: 'hand', label: bowl ? 'Bowling hand' : 'Hands', unit: 'm/s' },
  ];
  const links = meta.map((m): ChainLink => {
    const f = speed[m.id];
    const values: number[] = [];
    for (let i = from; i <= to; i++) values.push(f(i));
    return { ...m, values, peak: peakIn(lo, hi, f) ?? undefined };
  });
  return { from, to, contact, links };
}
