import type { Handedness, PoseFrame, StrokeType } from './types';
import { sides } from './landmarks';
import { dist, dot, sub } from './geometry';
import { bodyAxes, measure } from './metrics';
import { smoothSeries } from './smoothing';

/** Hitting-wrist speed relative to the hips (m/s), smoothed. NaN where the pose is missing. */
export function wristSpeed(frames: PoseFrame[], fps: number, hand: Handedness): number[] {
  const { dom } = sides(hand);
  const raw = frames.map((_, i) => {
    const a = frames[i - 1]?.world;
    const b = frames[i + 1]?.world;
    if (!a || !b) return NaN;
    const ra = sub(a[dom.wrist], hipMidOf(a));
    const rb = sub(b[dom.wrist], hipMidOf(b));
    return (dist(ra, rb) * fps) / 2;
  });
  return smoothSeries(raw, 1);
}

function hipMidOf(w: { x: number; y: number; z: number }[]) {
  return { x: (w[23].x + w[24].x) / 2, y: (w[23].y + w[24].y) / 2, z: (w[23].z + w[24].z) / 2 };
}

export interface StrokeWindow {
  start: number;
  end: number;
  contact: number;
  peakSpeed: number;
}

export interface DetectOptions {
  /** Minimum peak wrist speed to count as a swing (m/s). */
  minPeak?: number;
  /** Peaks must also reach this share of the clip's fastest swing. */
  relativePeak?: number;
  /** Minimum time between two contacts (s). */
  minGap?: number;
  before?: number;
  after?: number;
}

/** Find swings as peaks in hitting-wrist speed; the peak frame is the contact estimate. */
export function detectStrokes(frames: PoseFrame[], fps: number, hand: Handedness, opts: DetectOptions = {}): StrokeWindow[] {
  const { minPeak = 2.0, relativePeak = 0.35, minGap = 1.0, before = 1.4, after = 0.9 } = opts;
  const sp = wristSpeed(frames, fps, hand);
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
  // Keep the strongest peak within each minGap window.
  peaks.sort((a, b) => sp[b] - sp[a]);
  const kept: number[] = [];
  for (const p of peaks) if (kept.every((k) => Math.abs(k - p) >= minGap * fps)) kept.push(p);
  kept.sort((a, b) => a - b);

  const out: StrokeWindow[] = [];
  kept.forEach((c, idx) => {
    let start = Math.max(0, c - Math.round(before * fps));
    let end = Math.min(frames.length - 1, c + Math.round(after * fps));
    const prev = kept[idx - 1];
    const next = kept[idx + 1];
    if (prev !== undefined) start = Math.max(start, Math.ceil((prev + c) / 2));
    if (next !== undefined) end = Math.min(end, Math.floor((c + next) / 2));
    out.push({ start, end, contact: c, peakSpeed: sp[c] });
  });
  return out;
}

/** True when the hand is moving fast for for a few frames around frame i, not just on one frame. */
function sustained(sp: number[], i: number, fps: number) {
  const half = Math.max(1, Math.round(0.03 * fps));
  let fast = 0;
  for (let j = i - half; j <= i + half; j++) if ((sp[j] ?? 0) >= sp[i] * 0.45) fast++;
  return fast >= 2 * half + 1 - (half > 1 ? 1 : 0);
}

/** Window around a hand-marked contact frame. */
export function windowAt(frames: PoseFrame[], fps: number, contact: number, before = 1.4, after = 0.9): StrokeWindow {
  return {
    start: Math.max(0, contact - Math.round(before * fps)),
    end: Math.min(frames.length - 1, contact + Math.round(after * fps)),
    contact,
    peakSpeed: NaN,
  };
}

/** Frame in [from, to) where the hitting wrist is furthest behind the hips, along the contact-frame facing. */
export function backswingFrame(frames: PoseFrame[], from: number, to: number, contact: number, hand: Handedness): number {
  const wc = frames[contact]?.world;
  if (!wc) return Math.round((from + to) / 2);
  const fwd = bodyAxes(wc, hand).forward;
  const { dom } = sides(hand);
  let best = -1;
  let bestV = Infinity;
  for (let i = from; i < to; i++) {
    const w = frames[i].world;
    if (!w) continue;
    const v = dot(sub(w[dom.wrist], bodyAxes(w, hand).hipMid), fwd);
    if (v < bestV) { bestV = v; best = i; }
  }
  return best < 0 ? Math.round((from + to) / 2) : best;
}

/**
 * Padel stroke from the pose alone. The rules of thumb, in order:
 * - Contact above the head → an overhead. Full reach with a straight arm is a smash; a contact out to
 *   the side at head height that finishes across the body is a víbora; the rest (in front, arm a little
 *   bent, finishing forward) is a bandeja.
 * - Contact below the hips on the forehand side, after the free hand held the ball beside the racket
 *   and then dropped it, is the underhand serve.
 * - Hardly any turn or backswing is a volley.
 * - A steep upward swing that finishes high is a lob.
 * - Otherwise a forehand or backhand by the side the racket was taken back on.
 * Balls off the back glass look like groundstrokes from the pose; the coach marks them by re-labelling.
 */
export function classifyStroke(frames: PoseFrame[], win: StrokeWindow, hand: Handedness, yawSeries: number[]): StrokeType {
  const { start, contact, end } = win;
  const atContact = measure(frames, contact, start, hand, yawSeries);
  if (atContact.contactHeight === undefined) return 'unknown';
  const { dom, non } = sides(hand);

  // Overheads: read the contact at the highest hitting wrist near the speed peak (the speed peaks
  // a frame or two before the arm reaches full extension).
  let top = atContact;
  for (let i = Math.max(start, contact - 4); i <= Math.min(end, contact + 4); i++) {
    const m = measure(frames, i, start, hand, yawSeries);
    if ((m.contactHeight ?? -Infinity) > (top.contactHeight ?? -Infinity)) top = m;
  }
  if ((top.contactHeight ?? -1) > 0.02) {
    const elbow = top.elbowAngle ?? 150;
    if ((top.contactHeight ?? 0) >= 0.3 && elbow >= 158) return 'smash';
    // Finish: the furthest the hand crosses the body after contact.
    let across = -Infinity;
    for (let i = contact + 1; i <= end; i++) {
      const m = measure(frames, i, start, hand, yawSeries);
      if (m.crossBody !== undefined) across = Math.max(across, m.crossBody);
    }
    if ((top.contactSide ?? 0) >= 0.32 && (top.contactHeight ?? 0) < 0.3 && across > 0.1) return 'vibora';
    return 'bandeja';
  }

  const b = backswingFrame(frames, start, contact, contact, hand);
  const wb = frames[b].world;
  if (!wb) return 'unknown';
  const axes = bodyAxes(wb, hand);
  const lateral = dot(sub(wb[dom.wrist], axes.hipMid), axes.lateralDom);

  if (lateral >= 0 && (atContact.contactBelowWaist ?? -1) > 0.02 && servePrep(frames, start, contact, dom.wrist, non.wrist)) return 'serve';

  // Volley: the shoulders barely turn and the paddle hardly goes back behind the body.
  let maxTurn = 0;
  for (let i = start; i <= contact; i++) maxTurn = Math.max(maxTurn, Math.abs(yawSeries[i] - yawSeries[start]) || 0);
  const behind = dot(sub(wb[dom.wrist], axes.hipMid), axes.forward);
  if (maxTurn < 35 && behind > -0.12 && (atContact.contactBelowWaist ?? 1) < -0.05) return 'volley';

  // Lob: low contact, swinging steeply up to a high finish.
  let finishHigh = -Infinity;
  for (let i = contact + 1; i <= end; i++) {
    const m = measure(frames, i, start, hand, yawSeries);
    if (m.wristAboveShoulder !== undefined) finishHigh = Math.max(finishHigh, m.wristAboveShoulder);
  }
  const rise = (frames[b].world?.[dom.wrist].y ?? 0) - (frames[contact].world?.[dom.wrist].y ?? 0);
  if ((atContact.contactBelowWaist ?? -1) > -0.05 && finishHigh > 0.22 && rise > -0.05) return 'lob';

  return lateral >= 0 ? 'forehand' : 'backhand';
}

/**
 * Before an underhand serve the free hand holds the ball beside the racket, then drops it to bounce:
 * the hands start close together and the free hand goes down before contact.
 */
function servePrep(frames: PoseFrame[], start: number, contact: number, domWrist: number, nonWrist: number): boolean {
  const early = start + Math.max(1, Math.round((contact - start) * 0.5));
  let together = Infinity;
  let highest = Infinity;
  let lowestAfter = -Infinity;
  for (let i = start; i <= early; i++) {
    const w = frames[i]?.world;
    if (!w) continue;
    together = Math.min(together, dist(w[domWrist], w[nonWrist]));
    highest = Math.min(highest, w[nonWrist].y);
  }
  for (let i = start; i < contact; i++) {
    const w = frames[i]?.world;
    if (w) lowestAfter = Math.max(lowestAfter, w[nonWrist].y);
  }
  return together < 0.3 && lowestAfter - highest > 0.08;
}
