import type { PoseFrame } from './types';
import { copyFrames, fillHidden, fixSwaps, removeSpikes, smoothWorld } from './tracking';

/**
 * Clean a clip's pose before measuring or drawing it: undo left/right swaps, drop one-frame
 * spikes, re-fill joints the camera could not see, fill short gaps (up to `maxGap` frames) of
 * missing poses, then (when `window` > 0) smooth with a zero-phase adaptive filter.
 * Constant bone lengths (steadyBones) are applied only for the 3D figure, so measurements keep
 * what the camera saw. See tracking.ts. Image landmarks are swap-fixed and gap-filled only.
 */
export function cleanFrames(frames: PoseFrame[], maxGap = 6, window = 2): PoseFrame[] {
  const out = copyFrames(frames);
  fixSwaps(out);
  removeSpikes(out);
  fillHidden(out);
  // Interpolate gaps.
  let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (!out[i].world) continue;
    if (last >= 0 && i - last > 1 && i - last - 1 <= maxGap) {
      for (let g = last + 1; g < i; g++) {
        const k = (g - last) / (i - last);
        out[g].world = lerpPoints(out[last].world!, out[i].world!, k);
        if (out[last].image && out[i].image) {
          out[g].image = lerpPoints(out[last].image!, out[i].image!, k).map((p, j) => ({ ...p, v: Math.min(out[last].image![j].v, out[i].image![j].v) }));
        }
      }
    }
    last = i;
  }
  if (window <= 0) return out;
  smoothWorld(out);
  return out;
}

function lerpPoints<T extends { x: number; y: number; z?: number; v?: number }>(a: T[], b: T[], k: number): T[] {
  return a.map((p, j) => {
    const q = b[j];
    const r: any = { ...p, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
    if (p.z !== undefined && q.z !== undefined) r.z = p.z + (q.z - p.z) * k;
    return r as T;
  });
}

/** Centred moving average of a numeric series, ignoring NaN. */
export function smoothSeries(xs: number[], window = 2): number[] {
  return xs.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(xs.length - 1, i + window); j++) {
      if (!Number.isNaN(xs[j])) { s += xs[j]; n++; }
    }
    return n ? s / n : NaN;
  });
}
