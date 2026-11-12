import type { ImagePoint, PoseFrame, Vec3 } from './types';
import { LANDMARK_COUNT } from './landmarks';

/**
 * Tracking clean-up for pose world landmarks, run before any measurement or 3D drawing.
 *
 * A single-camera pose model makes a few kinds of mistake that read as a "robotic" or jumpy body:
 * 1. it swaps the left and right arm or leg for a frame or two (common side-on and from behind);
 * 2. it throws a single landmark far away for one frame;
 * 3. it guesses joints it cannot see (low visibility) and those guesses wobble;
 * 4. bone lengths change from frame to frame, so limbs stretch and shrink;
 * 5. plain averaging blurs the fastest part of the swing, the part we care about most.
 * Each step below fixes one of these. Image landmarks (drawn over the video) are only swap-fixed
 * and gap-filled, so the overlay stays faithful to what the camera saw.
 */

type P3 = Vec3;

const LEFT_ARM = [13, 15, 17, 19, 21];
const RIGHT_ARM = [14, 16, 18, 20, 22];
const LEFT_LEG = [25, 27, 29, 31];
const RIGHT_LEG = [26, 28, 30, 32];
const LEFT_ALL = [1, 2, 3, 7, 9, 11, 23, ...LEFT_ARM, ...LEFT_LEG];
const RIGHT_ALL = [4, 5, 6, 8, 10, 12, 24, ...RIGHT_ARM, ...RIGHT_LEG];

const d2 = (a: P3, b: P3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

function swapCost(prev: P3[], cur: P3[], L: number[], R: number[]) {
  let keep = 0;
  let swap = 0;
  for (let k = 0; k < L.length; k++) {
    keep += d2(prev[L[k]], cur[L[k]]) + d2(prev[R[k]], cur[R[k]]);
    swap += d2(prev[L[k]], cur[R[k]]) + d2(prev[R[k]], cur[L[k]]);
  }
  return { keep, swap };
}

function swapIn<T>(arr: T[] | null, L: number[], R: number[]) {
  if (!arr) return;
  for (let k = 0; k < L.length; k++) {
    const t = arr[L[k]];
    arr[L[k]] = arr[R[k]];
    arr[R[k]] = t;
  }
}

/**
 * Undo left/right label swaps by continuity with the previous frame: first the whole body
 * (a front/back flip), then each arm pair and each leg pair. A swap is only taken when it fits
 * the previous frame much better, so a genuine crossing of the legs is left alone.
 * Returns how many swaps were made.
 */
export function fixSwaps(frames: PoseFrame[]): number {
  let prev: P3[] | null = null;
  let n = 0;
  for (const f of frames) {
    const w = f.world;
    if (!w) { prev = null; continue; }
    if (prev) {
      for (const [L, R, floor] of [[LEFT_ALL, RIGHT_ALL, 0.02], [LEFT_ARM, RIGHT_ARM, 0.01], [LEFT_LEG, RIGHT_LEG, 0.01]] as const) {
        const { keep, swap } = swapCost(prev, w, L as number[], R as number[]);
        if (keep > floor && swap < keep * 0.45) {
          swapIn(w, L as number[], R as number[]);
          swapIn(f.image, L as number[], R as number[]);
          n++;
        }
      }
    }
    prev = w;
  }
  return n;
}

/**
 * Replace single-frame spikes: a landmark far from both neighbours while the neighbours agree
 * with each other is moved to their midpoint.
 */
export function removeSpikes(frames: PoseFrame[], jump = 0.25): number {
  let n = 0;
  for (let i = 1; i < frames.length - 1; i++) {
    const a = frames[i - 1].world, w = frames[i].world, b = frames[i + 1].world;
    if (!a || !w || !b) continue;
    for (let k = 0; k < LANDMARK_COUNT; k++) {
      const mid = { x: (a[k].x + b[k].x) / 2, y: (a[k].y + b[k].y) / 2, z: (a[k].z + b[k].z) / 2 };
      const off = Math.sqrt(d2(w[k], mid));
      const spread = Math.sqrt(d2(a[k], b[k]));
      if (off > jump && off > 2.5 * spread) { w[k] = mid; n++; }
    }
  }
  return n;
}

/**
 * Joints the camera cannot see (visibility below `minV`) are re-filled from the nearest frames
 * where they were seen, when that gap is short. Longer gaps keep the model's own guess.
 */
export function fillHidden(frames: PoseFrame[], minV = 0.3, maxGap = 8): void {
  for (let k = 0; k < LANDMARK_COUNT; k++) {
    const seen = (i: number) => !!frames[i].world && (frames[i].image?.[k]?.v ?? 1) >= minV;
    let last = -1;
    for (let i = 0; i < frames.length; i++) {
      if (!frames[i].world || !seen(i)) continue;
      if (last >= 0 && i - last > 1 && i - last - 1 <= maxGap) {
        const A = frames[last].world![k], B = frames[i].world![k];
        for (let g = last + 1; g < i; g++) {
          const w = frames[g].world;
          if (!w) continue;
          const t = (g - last) / (i - last);
          // Blend toward the interpolation, keeping a little of the model's guess for shape.
          const lerp = { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t };
          w[k] = { x: lerp.x * 0.75 + w[k].x * 0.25, y: lerp.y * 0.75 + w[k].y * 0.25, z: lerp.z * 0.75 + w[k].z * 0.25 };
        }
      }
      last = i;
    }
  }
}

/** One Euro filter over a series sampled every `dt` seconds (adaptive low-pass: smooth when slow, sharp when fast). */
export function oneEuro(xs: number[], dt: number, minCutoff: number, beta: number, dCutoff = 1): number[] {
  const alpha = (fc: number) => {
    const tau = 1 / (2 * Math.PI * fc);
    return 1 / (1 + tau / dt);
  };
  const out = new Array<number>(xs.length);
  let x = xs[0];
  let dx = 0;
  out[0] = x;
  for (let i = 1; i < xs.length; i++) {
    const rawDx = (xs[i] - x) / dt;
    dx += alpha(dCutoff) * (rawDx - dx);
    const fc = minCutoff + beta * Math.abs(dx);
    x += alpha(fc) * (xs[i] - x);
    out[i] = x;
  }
  return out;
}

/**
 * Zero-phase One Euro smoothing of world landmarks: filtered forward and backward and averaged,
 * so nothing lags behind the video and fast swings keep their peak speed.
 * Runs separately over each stretch of frames that has a pose.
 */
export function smoothWorld(frames: PoseFrame[], minCutoff = 1.2, beta = 5, dCutoff = 4): void {
  const dt = medianDt(frames);
  let s = 0;
  while (s < frames.length) {
    if (!frames[s].world) { s++; continue; }
    let e = s;
    while (e + 1 < frames.length && frames[e + 1].world) e++;
    if (e - s >= 2) {
      for (let k = 0; k < LANDMARK_COUNT; k++) {
        for (const ax of ['x', 'y', 'z'] as const) {
          const xs: number[] = [];
          for (let i = s; i <= e; i++) xs.push(frames[i].world![k][ax]);
          const f = oneEuro(xs, dt, minCutoff, beta, dCutoff);
          const b = oneEuro([...xs].reverse(), dt, minCutoff, beta, dCutoff).reverse();
          for (let i = s; i <= e; i++) frames[i].world![k][ax] = (f[i - s] + b[i - s]) / 2;
        }
      }
    }
    s = e + 1;
  }
}

function medianDt(frames: PoseFrame[]) {
  const ds: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].t - frames[i - 1].t;
    if (d > 0) ds.push(d);
  }
  ds.sort((a, b) => a - b);
  return ds.length ? ds[Math.floor(ds.length / 2)] : 1 / 30;
}

/** Bones as [parent, child], walked from the hips outward. */
const BONES: [number, number][] = [
  [23, 25], [25, 27], [27, 29], [27, 31],
  [24, 26], [26, 28], [28, 30], [28, 32],
  [11, 13], [13, 15], [12, 14], [14, 16],
];
/** Hand points follow the wrist rigidly. */
const HAND: [number, number[]][] = [[15, [17, 19, 21]], [16, [18, 20, 22]]];

/**
 * Keep every limb its own length all clip long: each bone's length is set to a typical value for the clip and the
 * bone keeps its measured direction, walking outward from the hips (and from the shoulders for
 * the arms). Joint angles are unchanged; limbs just stop stretching.
 */
export function steadyBones(frames: PoseFrame[]): void {
  const lens = BONES.map(([a, b]) => percentile(frames.flatMap((f) => (f.world ? [Math.sqrt(d2(f.world[a], f.world[b]))] : []))));
  for (const f of frames) {
    const w = f.world;
    if (!w) continue;
    const before = w.map((p) => ({ ...p }));
    BONES.forEach(([a, b], j) => {
      const L = lens[j];
      const dx = before[b].x - before[a].x, dy = before[b].y - before[a].y, dz = before[b].z - before[a].z;
      const len = Math.hypot(dx, dy, dz);
      if (!(L > 1e-3) || len < 1e-4) {
        w[b] = { x: w[a].x + dx, y: w[a].y + dy, z: w[a].z + dz };
        return;
      }
      const s = L / len;
      w[b] = { x: w[a].x + dx * s, y: w[a].y + dy * s, z: w[a].z + dz * s };
    });
    for (const [wr, pts] of HAND) {
      const mx = w[wr].x - before[wr].x, my = w[wr].y - before[wr].y, mz = w[wr].z - before[wr].z;
      for (const p of pts) w[p] = { x: before[p].x + mx, y: before[p].y + my, z: before[p].z + mz };
    }
  }
}

/** A single camera mostly under-reads depth, so limbs look short more often than long: take the 70th percentile. */
function percentile(xs: number[], q = 0.7) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

/** Copy frames so the clean-up never edits the stored session. */
export function copyFrames(frames: PoseFrame[]): PoseFrame[] {
  return frames.map((f) => ({ ...f, world: f.world?.map((p) => ({ ...p })) ?? null, image: f.image?.map((p: ImagePoint) => ({ ...p })) ?? null }));
}
