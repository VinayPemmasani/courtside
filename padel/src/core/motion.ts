import type { Handedness, PoseFrame, Vec3 } from './types';
import { sides } from './landmarks';
import { RACKET_LENGTH, type RacketPose } from './racket';

/**
 * Motion for the 3D studio: the tracked pose turned into a smooth animation, and a racket that
 * swings like a real one. Analysis keeps its own frames; this is only what gets drawn.
 */

type P3 = { x: number; y: number; z: number };

/** Indices of frames runs that have a pose, as [start, end] inclusive. */
function stretches(frames: PoseFrame[]): [number, number][] {
  const out: [number, number][] = [];
  let s = 0;
  while (s < frames.length) {
    if (!frames[s].world) { s++; continue; }
    let e = s;
    while (e + 1 < frames.length && frames[e + 1].world) e++;
    out.push([s, e]);
    s = e + 1;
  }
  return out;
}

/** Zero-phase Gaussian smoothing of a series, each sample weighted by how sure the tracker was of it. */
function gauss(xs: number[], ws: number[], sigma: number): number[] {
  if (sigma < 0.3) return xs.slice();
  const r = Math.ceil(sigma * 2.5);
  const k: number[] = [];
  for (let d = -r; d <= r; d++) k.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  return xs.map((_, i) => {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) {
      const j = i + d;
      if (j < 0 || j >= xs.length) continue;
      const w = k[d + r] * ws[j];
      s += xs[j] * w;
      n += w;
    }
    return n > 0 ? s / n : xs[i];
  });
}

const FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HANDS: [number, number[]][] = [[15, [17, 19, 21]], [16, [18, 20, 22]]];
/** Seconds of smoothing per landmark: the trunk and legs move slowly, the hitting arm fast. */
function sigmaFor(k: number) {
  if (k === 13 || k === 14 || k === 15 || k === 16) return 0.04;
  if (k === 25 || k === 26) return 0.05;
  return 0.06;
}

/**
 * Smooth the pose for animation. Every point is filtered both ways in time (nothing lags the video),
 * dots the tracker was unsure of lean on their neighbours, and the face and finger points ride on
 * the head and wrist with their own, slower filter, so a noisy knuckle cannot twist the hand.
 */
export function animationFrames(frames: PoseFrame[], fps: number): PoseFrame[] {
  const out = frames.map((f) => ({ ...f, world: f.world?.map((p) => ({ ...p })) ?? null, image: f.image?.map((p) => ({ ...p })) ?? null }));
  for (const [s, e] of stretches(out)) {
    if (e - s < 2) continue;
    const idx: number[] = [];
    for (let i = s; i <= e; i++) idx.push(i);
    const vis = (k: number) => idx.map((i) => Math.max(0.08, Math.min(1, out[i].image?.[k]?.v ?? 1)));
    for (const key of ['world', 'image'] as const) {
      if (!idx.every((i) => out[i][key])) continue;
      const pts = (i: number) => out[i][key]! as P3[];
      const axes = key === 'world' ? (['x', 'y', 'z'] as const) : (['x', 'y'] as const);
      const smoothPoint = (k: number, sec: number, rel?: (i: number) => P3) => {
        const ws = vis(k);
        for (const ax of axes) {
          const xs = idx.map((i) => pts(i)[k][ax] - (rel ? rel(i)[ax] : 0));
          const f = gauss(xs, ws, sec * fps);
          idx.forEach((i, n) => (pts(i)[k][ax] = f[n] + (rel ? rel(i)[ax] : 0)));
        }
      };
      // Offsets of the face and fingers from their anchors, taken before the anchors move.
      const shoulderMid = (i: number) => {
        const a = pts(i)[11], b = pts(i)[12];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
      };
      const faceOff = idx.map((i) => FACE.map((k) => sub3(pts(i)[k], shoulderMid(i))));
      const handOff = idx.map((i) => HANDS.map(([w, ks]) => ks.map((k) => sub3(pts(i)[k], pts(i)[w]))));
      for (let k = 11; k < 33; k++) if (k < 17 || k > 22) smoothPoint(k, sigmaFor(k));
      // Face: smoothed offset from the (now smooth) shoulders.
      FACE.forEach((k, j) => {
        for (const ax of axes) {
          const f = gauss(faceOff.map((o) => o[j][ax]), vis(k), 0.1 * fps);
          idx.forEach((i, n) => (pts(i)[k][ax] = shoulderMid(i)[ax] + f[n]));
        }
      });
      HANDS.forEach(([w, ks], h) =>
        ks.forEach((k, j) => {
          for (const ax of axes) {
            const f = gauss(handOff.map((o) => o[h][j][ax]), vis(k), 0.12 * fps);
            idx.forEach((i, n) => (pts(i)[k][ax] = pts(i)[w][ax] + f[n]));
          }
        }),
      );
    }
  }
  return out;
}

const sub3 = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
const add3 = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul3 = (a: P3, s: number): P3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len3 = (a: P3) => Math.hypot(a.x, a.y, a.z);
const norm3 = (a: P3, fb: P3 = { x: 0, y: -1, z: 0 }): P3 => {
  const l = len3(a);
  return l < 1e-6 ? fb : mul3(a, 1 / l);
};
const dot3 = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Pose axes: y runs down, so "up" is -y. */
const UP: P3 = { x: 0, y: -1, z: 0 };

/**
 * The racket through the clip, from smoothed frames (pose axes, metres). The wrist is tracked; the
 * racket is not, so its head is simulated as a weight on a 0.455 m shaft held in the hand: it is
 * pulled toward where the forearm points (tipped up, as players carry the racket head), and it
 * lags behind fast hand speed and whips through, the way a real racket does. The strings face the
 * way the head is travelling. The result is smooth and the same every time a frame is drawn.
 */
export function racketTrack(frames: PoseFrame[], hand: Handedness, fps: number): (RacketPose | null)[] {
  const { dom } = sides(hand);
  const out: (RacketPose | null)[] = frames.map(() => null);
  const L = RACKET_LENGTH;
  const omega = 2 * Math.PI * 6;
  const steps = 6;
  const dt = 1 / fps / steps;
  for (const [s, e] of stretches(frames)) {
    const wrist = (i: number) => frames[i].world![dom.wrist];
    const prefer = (i: number) => {
      const w = frames[i].world!;
      const fore = norm3(sub3(w[dom.wrist], w[dom.elbow]));
      // The way the hips face (left hip minus right hip, crossed with up).
      const fwd = norm3(cross3(sub3(w[23], w[24]), UP), { x: 0, y: 0, z: 1 });
      return norm3(add3(add3(mul3(fore, 0.6), mul3(UP, 0.4)), mul3(fwd, 0.25)));
    };
    // Head position (tip end) as a damped weight following its target, kept at shaft length from the grip.
    let head = add3(wrist(s), mul3(prefer(s), L));
    let vel: P3 = { x: 0, y: 0, z: 0 };
    const heads: P3[] = [];
    for (let i = s; i <= e; i++) {
      const w0 = wrist(Math.max(s, i - 1)), w1 = wrist(i);
      const p0 = prefer(Math.max(s, i - 1)), p1 = prefer(i);
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const g = add3(mul3(w0, 1 - t), mul3(w1, t));
        const target = add3(g, mul3(norm3(add3(mul3(p0, 1 - t), mul3(p1, t))), L));
        // Critically damped spring toward the target.
        const acc = sub3(mul3(sub3(target, head), omega * omega), mul3(vel, 2 * omega));
        vel = add3(vel, mul3(acc, dt));
        let next = add3(head, mul3(vel, dt));
        // Keep the shaft its length.
        next = add3(g, mul3(norm3(sub3(next, g)), L));
        vel = mul3(sub3(next, head), 1 / dt);
        head = next;
      }
      heads.push(head);
    }
    // Directions, lightly smoothed both ways so the simulation's start-up never shows.
    const dirs = heads.map((h, n) => norm3(sub3(h, wrist(s + n))));
    const sm = (xs: number[]) => gauss(xs, xs.map(() => 1), 0.045 * fps);
    const dx = sm(dirs.map((d) => d.x)), dy = sm(dirs.map((d) => d.y)), dz = sm(dirs.map((d) => d.z));
    const D = dirs.map((_, n) => norm3({ x: dx[n], y: dy[n], z: dz[n] }));
    // String face: along the head's travel, square to the shaft; when the head is still, toward the net (+z).
    const faces = D.map((d, n) => {
      const a = heads[Math.max(0, n - 1)], b = heads[Math.min(heads.length - 1, n + 1)];
      const v = mul3(sub3(b, a), fps / 2);
      const speed = len3(v);
      const still = { x: 0, y: 0, z: 1 };
      const want = add3(mul3(norm3(v, still), Math.min(1, speed / 3)), mul3(still, Math.max(0, 1 - speed / 3)));
      const f = sub3(want, mul3(d, dot3(want, d)));
      return norm3(f, norm3(cross3(d, UP), { x: 1, y: 0, z: 0 }));
    });
    // The strings have two sides: keep each face on the same side as the last one, so the
    // racket never spins half a turn about its shaft between frames.
    for (let n = 1; n < faces.length; n++) if (dot3(faces[n], faces[n - 1]) < 0) faces[n] = mul3(faces[n], -1);
    // Smooth the tilt harder than the shaft: the face is the least certain part of the estimate.
    const fx = gauss(faces.map((f) => f.x), faces.map(() => 1), 0.08 * fps);
    const fy = gauss(faces.map((f) => f.y), faces.map(() => 1), 0.08 * fps);
    const fz = gauss(faces.map((f) => f.z), faces.map(() => 1), 0.08 * fps);
    D.forEach((d, n) => {
      const g = wrist(s + n);
      let f = { x: fx[n], y: fy[n], z: fz[n] };
      f = norm3(sub3(f, mul3(d, dot3(f, d))), { x: 0, y: 0, z: 1 });
      out[s + n] = { grip: g, head: add3(g, mul3(d, L * 0.72)), tip: add3(g, mul3(d, L)), dir: d, face: f };
    });
  }
  return out;
}
