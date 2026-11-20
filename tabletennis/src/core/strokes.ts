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
  // Table tennis strokes are short and quick: a rally ball comes back every 0.6-1 s, and pushes
  // and blocks move the hand far slower than a loop, so the thresholds are lower than for tennis.
  const { minPeak = 1.1, relativePeak = 0.2, minGap = 0.45, before = 0.75, after = 0.45 } = opts;
  const sp = wristSpeed(frames, fps, hand);
  const max = Math.max(0, ...sp.filter((v) => !Number.isNaN(v)));
  const threshold = Math.max(minPeak, relativePeak * max);
  const peaks: number[] = [];
  for (let i = 1; i < sp.length - 1; i++) {
    const v = sp[i];
    if (Number.isNaN(v) || v < threshold) continue;
    if (!(v >= (sp[i - 1] || 0) && v > (sp[i + 1] || 0))) continue;
    // A real swing builds and fades over several frames; a one-frame burst is a tracking jump.
    // And a stroke moves the hand forward into the ball: returning to the ready position after the
    // finish is often just as quick in table tennis, but it moves the hand down and back.
    if (sustained(sp, i, fps) && movesForward(frames, i, hand)) peaks.push(i);
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

/** True when the hitting hand's movement at frame i (relative to the hips) is mostly toward where the hips face. */
function movesForward(frames: PoseFrame[], i: number, hand: Handedness): boolean {
  const a = frames[i - 1]?.world;
  const b = frames[i + 1]?.world;
  if (!a || !b) return true;
  const { dom } = sides(hand);
  const v = sub(sub(b[dom.wrist], hipMidOf(b)), sub(a[dom.wrist], hipMidOf(a)));
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-6) return false;
  return dot(v, bodyAxes(frames[i].world ?? b, hand).forward) / l > 0.2;
}

/** True when the hand is moving fast for for a few frames around frame i, not just on one frame. */
function sustained(sp: number[], i: number, fps: number) {
  const half = Math.max(1, Math.round(0.03 * fps));
  let fast = 0;
  for (let j = i - half; j <= i + half; j++) if ((sp[j] ?? 0) >= sp[i] * 0.45) fast++;
  return fast >= 2 * half + 1 - (half > 1 ? 1 : 0);
}

/** Window around a hand-marked contact frame. */
export function windowAt(frames: PoseFrame[], fps: number, contact: number, before = 0.75, after = 0.45): StrokeWindow {
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
 * Swing length (m): the furthest the hitting wrist gets, relative to the hips, from where it was at
 * the end of the backswing, up to a short time after contact. Contact sits near the middle of the
 * forward swing (peak hand speed), so the stroke's full size includes a little of the finish.
 */
export function swingLength(frames: PoseFrame[], back: number, contact: number, hand: Handedness, fps = 30): number {
  const { dom } = sides(hand);
  const a = frames[back]?.world;
  if (!a) return NaN;
  const from = sub(a[dom.wrist], hipMidOf(a));
  let best = NaN;
  const to = Math.min(frames.length - 1, contact + Math.round(0.12 * fps));
  for (let i = back; i <= to; i++) {
    const b = frames[i]?.world;
    if (!b) continue;
    const d = dist(from, sub(b[dom.wrist], hipMidOf(b)));
    if (!(d <= best)) best = d;
  }
  return best;
}

/**
 * Table tennis stroke type from the body alone:
 * - serve: the free hand tosses the ball up from an open palm before contact, and contact is low;
 * - long strokes (the hand travels over ~0.42 m): forehand or backhand loop/drive, by which side of the body
 *   the hand meets the ball;
 * - short strokes over the table: a flick rises quickly into the ball, a block meets it at waist
 *   height or above with almost no swing, and a push is a short forward, slightly downward stroke low
 *   over the table.
 */
export function classifyStroke(frames: PoseFrame[], win: StrokeWindow, hand: Handedness, yawSeries: number[], fps = 30): StrokeType {
  const { start, contact } = win;
  const atContact = measure(frames, contact, start, hand, yawSeries);
  if (atContact.contactHeight === undefined) return 'unknown';
  const { dom, non } = sides(hand);
  const wc = frames[contact].world!;

  // Serve: the toss hand rises well above where it started, and contact stays below the shoulder.
  const w0 = frames[start]?.world;
  if (w0) {
    let rise = 0;
    for (let i = start; i <= contact; i++) {
      const w = frames[i].world;
      if (w) rise = Math.max(rise, (w0[non.wrist].y - w[non.wrist].y));
    }
    const belowShoulder = wc[dom.wrist].y > wc[dom.shoulder].y - 0.05;
    if (rise > 0.22 && belowShoulder) return 'serve';
  }

  const b = backswingFrame(frames, start, contact, contact, hand);
  const wb = frames[b].world;
  if (!wb) return 'unknown';
  const len = swingLength(frames, b, contact, hand, fps);
  const axes = bodyAxes(wc, hand);
  const lateral = dot(sub(wc[dom.wrist], axes.hipMid), axes.lateralDom);
  if (!(len < 0.42)) return lateral >= 0.08 ? 'forehand' : 'backhand';

  // Short strokes: vertical rise of the hand into contact (y is down) and contact height over the hips.
  const rise = wb[dom.wrist].y - hipMidOf(wb).y - (wc[dom.wrist].y - axes.hipMid.y);
  const overHips = axes.hipMid.y - wc[dom.wrist].y;
  if (rise > 0.07 && (win.peakSpeed || 0) > 2.0) return 'flick';
  if (overHips > 0.16) return 'block';
  return 'push';
}
