/**
 * Ball tracking around a groundstroke and what the ball was doing when it was hit.
 *
 * The ball is found by colour (optic yellow) in the video frames before contact, tracked backwards
 * from the hitting hand, and its bounce is the lowest point of its path on screen. From the time
 * between the bounce and contact, and the contact height from the pose, the ball's climb after the
 * bounce follows from gravity alone:
 *   h(t) = r + v0·t − g·t²/2,  h(Δt) = contact height  →  v0, the apex, and the ball's vertical
 *   speed at contact (+ rising, about 0 at the peak, − falling).
 * That works from any camera angle, as long as the ball is visible through the bounce.
 * Pure functions over RGBA pixels; no DOM.
 */
import type { BounceStage } from './types';

import { BALL_RADIUS } from './court';

export const G = 9.81;
/** Vertical speed at contact that still counts as "at the peak", m/s (about 7 cm below the top). */
export const PEAK_SPEED = 1.2;

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface Blob {
  /** Centre, 0..1 of the frame. */
  x: number;
  y: number;
  /** Area in pixels of the analysed image. */
  area: number;
}

/** Optic-yellow test: bright, green and red well above blue. */
export function isBallColour(r: number, g: number, b: number): boolean {
  return g > 150 && r > 120 && b < 140 && g - b > 70 && r - b > 50 && r < g + 40;
}

/** Yellow blobs in a frame, largest first. Tiny specks and very large areas (shirts, signs) are dropped. */
export function findBlobs(img: Pixels, minArea = 3, maxFrac = 0.004): Blob[] {
  const { data, width: W, height: H } = img;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) if (isBallColour(data[p], data[p + 1], data[p + 2])) mask[i] = 1;
  const out: Blob[] = [];
  const stack: number[] = [];
  const maxArea = maxFrac * W * H;
  for (let i = 0; i < W * H; i++) {
    if (mask[i] !== 1) continue;
    let n = 0, sx = 0, sy = 0;
    stack.push(i);
    mask[i] = 2;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % W, y = (j / W) | 0;
      n++; sx += x; sy += y;
      // 8-connected, so a motion-blurred streak stays one blob.
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const k = yy * W + xx;
          if (mask[k] === 1) { mask[k] = 2; stack.push(k); }
        }
      }
    }
    if (n >= minArea && n <= maxArea) out.push({ x: sx / n / W, y: sy / n / H, area: n });
  }
  return out.sort((a, b) => b.area - a.area);
}

export interface TrackPoint extends Blob {
  frame: number;
}

/**
 * Follows the ball backwards from contact: the blob nearest the hitting hand at contact, then in
 * each earlier frame the blob nearest the position predicted from the last two points.
 */
export function trackBack(blobs: Map<number, Blob[]>, contact: number, hand: { x: number; y: number } | null, from: number): TrackPoint[] {
  const pick = (cands: Blob[], at: { x: number; y: number }, maxD: number) => {
    let best: Blob | undefined, bd = maxD;
    for (const b of cands) {
      const d = Math.hypot(b.x - at.x, b.y - at.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  // Yellow things that do not move (a ball lying on the court, a sign) are not the ball in play.
  const frames = [...blobs.keys()];
  const still = (b: Blob) => {
    let n = 0;
    for (const f of frames) if ((blobs.get(f) ?? []).some((o) => Math.abs(o.x - b.x) < 0.008 && Math.abs(o.y - b.y) < 0.008)) n++;
    return n >= Math.max(6, frames.length * 0.5);
  };
  const moving = new Map<number, Blob[]>();
  for (const f of frames) moving.set(f, (blobs.get(f) ?? []).filter((b) => !still(b)));
  blobs = moving;
  // Start a few frames around contact: the ball can be hidden behind the racket at the strike itself.
  let start: TrackPoint | undefined;
  for (const f of [contact - 1, contact, contact - 2, contact + 1, contact - 3, contact - 4, contact - 5, contact - 6, contact - 7, contact - 8]) {
    const c = blobs.get(f) ?? [];
    const b = hand ? pick(c, hand, 0.4) : c[0];
    if (b) { start = { ...b, frame: f }; break; }
  }
  if (!start) return [];
  const track: TrackPoint[] = [start];
  let miss = 0;
  for (let f = start.frame - 1; f >= from; f--) {
    const a = track[track.length - 1];
    const b = track[track.length - 2];
    const steps = a.frame - f;
    const pred = b ? { x: a.x + ((a.x - b.x) / (b.frame - a.frame)) * steps, y: a.y + ((a.y - b.y) / (b.frame - a.frame)) * steps } : a;
    const reach = (b ? 0.06 : 0.15) * steps + 0.02;
    // The first points can be just after the strike, when the ball has already turned: fall back to
    // the nearest blob to the last point.
    const hit = pick(blobs.get(f) ?? [], pred, reach) ?? pick(blobs.get(f) ?? [], a, 0.08 * steps + 0.02);
    if (hit) { track.push({ ...hit, frame: f }); miss = 0; }
    else if (++miss > 2) break;
  }
  track.reverse();
  // A few frames after the start too, so the turn of the ball at the strike is in the track.
  for (let f = start.frame + 1; f <= start.frame + 4; f++) {
    const a = track[track.length - 1];
    const hit = pick(blobs.get(f) ?? [], a, 0.08 * (f - a.frame) + 0.01);
    if (hit) track.push({ ...hit, frame: f });
  }
  return track;
}

/** Least-squares line through (t, y) points; returns y = a + b·t. */
function line(pts: { t: number; y: number }[]): { a: number; b: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  let st = 0, sy = 0, stt = 0, sty = 0;
  for (const p of pts) { st += p.t; sy += p.y; stt += p.t * p.t; sty += p.t * p.y; }
  const d = n * stt - st * st;
  if (Math.abs(d) < 1e-9) return null;
  const b = (n * sty - st * sy) / d;
  return { a: (sy - b * st) / n, b };
}

/**
 * The bounce: the lowest point of the track on screen, with the ball coming down before it and
 * going up after it. Refined to a fraction of a frame where the lines before and after meet.
 */
export function findBounce(track: TrackPoint[], before = Infinity): number | undefined {
  const pts = track.filter((p) => p.frame <= before);
  if (pts.length < 5) return undefined;
  let k = -1, low = -Infinity;
  for (let i = 2; i < pts.length - 2; i++) if (pts[i].y > low) { low = pts[i].y; k = i; }
  if (k < 0) return undefined;
  const l1 = line(pts.slice(Math.max(0, k - 3), k + 1).map((p) => ({ t: p.frame, y: p.y })));
  const l2 = line(pts.slice(k, Math.min(pts.length, k + 4)).map((p) => ({ t: p.frame, y: p.y })));
  // Down before (y growing), up after (y shrinking): otherwise it is not a bounce.
  if (!l1 || !l2 || l1.b <= 0 || l2.b >= 0) return undefined;
  const t = (l2.a - l1.a) / (l1.b - l2.b);
  return t > pts[k - 1].frame && t < pts[k + 1].frame ? t : pts[k].frame;
}

/**
 * Frame (fractional) where the ball meets the strings: its path on screen turns back, or failing
 * that, where it looks largest (closest to a camera in front of or behind the player).
 */
export function findStrike(track: TrackPoint[], after: number, poseContact: number): number {
  for (let i = 1; i < track.length - 1; i++) {
    const p = track[i - 1], q = track[i], r = track[i + 1];
    if (q.frame <= after + 1) continue;
    const d1 = { x: q.x - p.x, y: q.y - p.y }, d2 = { x: r.x - q.x, y: r.y - q.y };
    if (d1.x * d2.x + d1.y * d2.y < 0 && Math.abs(q.frame - poseContact) <= 4) return q.frame + 0.5;
  }
  return poseContact;
}

export interface BallReading {
  /** True when the bounce was seen; otherwise only the ball's last few frames were read. */
  bounceSeen: boolean;
  /** Fractional frames. */
  bounceFrame?: number;
  strikeFrame: number;
  /** Bounce to contact, s. */
  dt?: number;
  /** Ball height at contact used for the fit, m. */
  height: number;
  /** Ball's upward speed just after the bounce, m/s. */
  v0?: number;
  /** Vertical speed at contact: + rising, − falling, m/s. */
  vz?: number;
  /** Time from the top of the bounce to contact, s (− before the top, + after it). */
  sinceApex?: number;
  apexHeight?: number;
  /** How far below its highest point the ball was at contact, m. */
  belowApex?: number;
  stage: BounceStage;
  /** Incoming horizontal speed estimated from the ball's growth on screen, m/s (rough). */
  speedIn?: number;
  /** Track points (0..1 of the frame) for drawing. */
  track: { f: number; x: number; y: number }[];
}

/** Stage from the vertical speed at contact. */
export function stageFromVz(vz: number): BounceStage {
  return vz > PEAK_SPEED ? 'rising' : vz < -PEAK_SPEED ? 'falling' : 'peak';
}

/**
 * The ball's climb after the bounce from gravity, the bounce-to-contact time and the contact height.
 * Returns undefined when the numbers are not a plausible rally bounce.
 */
export function bounceArc(dt: number, height: number): Pick<BallReading, 'v0' | 'vz' | 'sinceApex' | 'apexHeight' | 'belowApex' | 'stage'> | undefined {
  if (!(dt > 0.08 && dt < 1.6) || !(height > 0.1 && height < 2.5)) return undefined;
  const v0 = (height - BALL_RADIUS + (G * dt * dt) / 2) / dt;
  if (v0 <= 0 || v0 > 15) return undefined;
  const vz = v0 - G * dt;
  const tApex = v0 / G;
  const apexHeight = BALL_RADIUS + (v0 * v0) / (2 * G);
  return { v0, vz, sinceApex: dt - tApex, apexHeight, belowApex: Math.max(0, apexHeight - height), stage: stageFromVz(vz) };
}

/**
 * Whole reading for one stroke. `blobs` holds the yellow blobs per frame from about 0.9 s before
 * contact; `scale` gives ball size → horizontal speed when it can be estimated.
 */
export function readBall(opts: {
  blobs: Map<number, Blob[]>;
  contact: number;
  from: number;
  fps: number;
  hand: { x: number; y: number } | null;
  height: number | undefined;
  /** Distance from the camera to the player at contact, m, for the speed estimate. */
  playerDepth?: number;
}): BallReading | undefined {
  const track = trackBack(opts.blobs, opts.contact, opts.hand, opts.from);
  if (opts.height === undefined) return undefined;
  const strikeFrame = findStrike(track, opts.contact - 6, opts.contact);
  const pts = track.map((p) => ({ f: p.frame, x: p.x, y: p.y }));
  const bounceFrame = findBounce(track, strikeFrame - 3);
  if (bounceFrame === undefined) {
    // No bounce in view. A ball dropping on screen into contact, after a high point, is falling: an
    // approaching ball at a steady height climbs on screen, so a drop on screen is a real drop.
    const pre = track.filter((p) => p.frame <= strikeFrame - 0.5);
    const last = pre.slice(-5);
    if (pre.length >= 7 && last.length === 5) {
      const top = pre.reduce((b, p) => (p.y < b.y ? p : b), pre[0]);
      const fall = line(last.map((p) => ({ t: p.frame, y: p.y })));
      if (fall && fall.b > 0.003 && top.frame < last[0].frame && last[last.length - 1].y - top.y > 0.02) {
        return { bounceSeen: false, strikeFrame, height: opts.height, stage: 'falling', track: pts };
      }
    }
    return undefined;
  }
  const dt = (strikeFrame - bounceFrame) / opts.fps;
  const arc = bounceArc(dt, opts.height);
  if (!arc) return undefined;
  // Horizontal speed: apparent size ∝ 1/distance, so the size ratio from bounce to contact gives
  // how much closer the ball came, relative to the player's distance from the camera.
  let speedIn: number | undefined;
  if (opts.playerDepth) {
    const near = (f: number) => track.reduce((b, p) => (Math.abs(p.frame - f) < Math.abs(b.frame - f) ? p : b), track[0]);
    const pb = near(bounceFrame), pc = near(strikeFrame - 1);
    if (pb.area > 4 && pc.area > pb.area) {
      const ratio = Math.sqrt(pc.area / pb.area);
      const s = (opts.playerDepth * (ratio - 1)) / dt;
      if (s > 5 && s < 40) speedIn = s;
    }
  }
  return { bounceSeen: true, bounceFrame, strikeFrame, dt, height: opts.height, ...arc, speedIn, track: pts };
}
