import type { Discipline, Handedness, PoseFrame, StrokeType, Vec3 } from './types';
import { sides } from './landmarks';
import { dist, dot, flatUnit, mid, sub } from './geometry';
import { bodyAxes } from './metrics';
import { smoothSeries } from './smoothing';
import { frontShare } from './weight';

const hipMidOf = (w: Vec3[]) => mid(w[23], w[24]);

/** Batting: the two hands work as one on the handle, so their midpoint stands in for the bat grip. */
export const handsMid = (w: Vec3[]) => mid(w[15], w[16]);

/**
 * Speed (m/s, smoothed) of the point that drives the action, relative to the hips: the hands on the
 * handle for batting, the bowling hand for bowling. NaN where the pose is missing.
 */
export function actionSpeed(frames: PoseFrame[], fps: number, hand: Handedness, discipline: Discipline): number[] {
  const { dom } = sides(hand);
  const point = (w: Vec3[]) => (discipline === 'batting' ? handsMid(w) : w[dom.wrist]);
  const raw = frames.map((_, i) => {
    const a = frames[i - 1]?.world;
    const b = frames[i + 1]?.world;
    if (!a || !b) return NaN;
    return (dist(sub(point(a), hipMidOf(a)), sub(point(b), hipMidOf(b))) * fps) / 2;
  });
  return smoothSeries(raw, 1);
}

export interface StrokeWindow {
  start: number;
  end: number;
  /** Impact (batting) or release (bowling) estimate. */
  contact: number;
  peakSpeed: number;
}

export interface DetectOptions {
  /** Minimum peak hand speed to count as a shot or delivery (m/s). */
  minPeak?: number;
  /** Peaks must also reach this share of the clip's fastest action. */
  relativePeak?: number;
  /** Minimum time between two actions (s). */
  minGap?: number;
  before?: number;
  after?: number;
}

/** Window lengths around the impact or release: a delivery needs the last strides of the run-up. */
export const WINDOW: Record<Discipline, { before: number; after: number; minGap: number; minPeak: number }> = {
  batting: { before: 1.3, after: 0.9, minGap: 1.6, minPeak: 1.8 },
  bowling: { before: 1.5, after: 0.9, minGap: 2.5, minPeak: 3.0 },
};

/** Find shots (or deliveries) as peaks in hand speed; the peak frame is the impact (or release) estimate. */
export function detectStrokes(frames: PoseFrame[], fps: number, hand: Handedness, discipline: Discipline, opts: DetectOptions = {}): StrokeWindow[] {
  const d = WINDOW[discipline];
  const { minPeak = d.minPeak, relativePeak = 0.35, minGap = d.minGap, before = d.before, after = d.after } = opts;
  const sp = actionSpeed(frames, fps, hand, discipline);
  const max = Math.max(0, ...sp.filter((v) => !Number.isNaN(v)));
  const threshold = Math.max(minPeak, relativePeak * max);
  const peaks: number[] = [];
  for (let i = 1; i < sp.length - 1; i++) {
    const v = sp[i];
    if (Number.isNaN(v) || v < threshold) continue;
    if (!(v >= (sp[i - 1] || 0) && v > (sp[i + 1] || 0))) continue;
    // A real swing builds and fades over several frames; a one-frame burst is a tracking jump.
    if (sustained(sp, i, fps)) peaks.push(i);
  }
  peaks.sort((a, b) => sp[b] - sp[a]);
  const kept: number[] = [];
  for (const p of peaks) if (kept.every((k) => Math.abs(k - p) >= minGap * fps)) kept.push(p);
  kept.sort((a, b) => a - b);

  return kept.map((c, idx) => {
    let start = Math.max(0, c - Math.round(before * fps));
    let end = Math.min(frames.length - 1, c + Math.round(after * fps));
    const prev = kept[idx - 1];
    const next = kept[idx + 1];
    if (prev !== undefined) start = Math.max(start, Math.ceil((prev + c) / 2));
    if (next !== undefined) end = Math.min(end, Math.floor((c + next) / 2));
    return { start, end, contact: c, peakSpeed: sp[c] };
  });
}

function sustained(sp: number[], i: number, fps: number) {
  const half = Math.max(1, Math.round(0.03 * fps));
  let fast = 0;
  for (let j = i - half; j <= i + half; j++) if ((sp[j] ?? 0) >= sp[i] * 0.45) fast++;
  return fast >= 2 * half + 1 - (half > 1 ? 1 : 0);
}

/** Window around a hand-marked impact or release frame. */
export function windowAt(frames: PoseFrame[], fps: number, contact: number, discipline: Discipline = 'batting'): StrokeWindow {
  const d = WINDOW[discipline];
  return {
    start: Math.max(0, contact - Math.round(d.before * fps)),
    end: Math.min(frames.length - 1, contact + Math.round(d.after * fps)),
    contact,
    peakSpeed: NaN,
  };
}

/** First frame in [from, to] with a pose. */
export function firstPose(frames: PoseFrame[], from: number, to: number): number {
  for (let i = from; i <= to; i++) if (frames[i]?.world) return i;
  return -1;
}

/**
 * The batter's guard, from the stance: `toBowler` points from the back hip to the front hip
 * (down the pitch), `offSide` is where the chest faces (side-on stance), both on the ground plane.
 */
export function guardAxes(w: Vec3[], hand: Handedness): { toBowler: Vec3; offSide: Vec3 } {
  const { dom, non } = sides(hand);
  const toBowler = flatUnit(sub(w[non.hip], w[dom.hip]));
  const f = bodyAxes(w, hand).forward;
  const k = dot(f, toBowler);
  const offSide = flatUnit({ x: f.x - k * toBowler.x, y: 0, z: f.z - k * toBowler.z });
  return { toBowler, offSide };
}

/** Pace above this bowling-hand speed at release (m/s, as tracked); slower deliveries read as spin. */
export const PACE_MIN_ARM_SPEED = 11;

/**
 * Batting: defence (slow hands), pull (hands high, bat going to the leg side), cut (hands high,
 * bat going to the off side) or drive. Bowling: pace or spin from the bowling hand's speed.
 * Single-camera depth is rough, so a coach can relabel any shot.
 */
export function classifyStroke(frames: PoseFrame[], win: StrokeWindow, hand: Handedness, discipline: Discipline): StrokeType {
  if (discipline === 'bowling') {
    if (!Number.isFinite(win.peakSpeed)) return 'pace';
    return win.peakSpeed >= PACE_MIN_ARM_SPEED ? 'pace' : 'spin';
  }
  const c = win.contact;
  const s = firstPose(frames, win.start, c);
  const ws = s >= 0 ? frames[s].world : null;
  const wa = frames[c - 1]?.world, wb = frames[c + 1]?.world, wc = frames[c]?.world;
  if (!ws || !wa || !wb || !wc) return 'unknown';
  if (Number.isFinite(win.peakSpeed) && win.peakSpeed < 3.2) return 'defence';
  const { offSide } = guardAxes(ws, hand);
  const v = sub(sub(handsMid(wb), hipMidOf(wb)), sub(handsMid(wa), hipMidOf(wa)));
  const horiz = Math.hypot(v.x, v.z);
  const across = horiz > 1e-6 ? dot({ x: v.x, y: 0, z: v.z }, offSide) / horiz : 0;
  // Hands above the hips (y is down): chest-high for a pull or cut, waist-low for a drive.
  const handsUp = hipMidOf(wc).y - handsMid(wc).y;
  const flat = horiz > Math.abs(v.y) * 0.8;
  const { dom, non } = sides(hand);
  const front = frontShare(wc, non.ankle, dom.ankle);
  if (handsUp > 0.18 && flat) {
    if (across < -0.25) return 'pull';
    if (across > 0.25) return 'cut';
  }
  if (front !== null && front < 0.4 && across < -0.5) return 'pull';
  return 'drive';
}
