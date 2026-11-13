import type { Handedness, Vec3 } from '../core/types';
import { PLAYER_SPOT } from '../core/scene';

/**
 * A small kinematic body for the drill animations: a key-framed pose (where the feet stand, how
 * low the hips sit, how far hips and shoulders turn, where the hands go) becomes the 33 MediaPipe
 * landmarks in court space (metres, y up, the player facing the net along −z), which the studio's
 * rigged mannequin is already built to follow.
 *
 * Poses are written for a right-hander; left-handers get the mirror image.
 * Hand and racket directions are written in the "net frame": [right, up, toward the net], measured
 * from the middle of the shoulders, so a key reads like a coach describing it. Between keys they are
 * carried in the chest's own frame, so a swing arcs around the body as the trunk turns instead of
 * cutting straight through it.
 */

export type V3 = [number, number, number];

export interface Foot {
  /** Ankle position over the ground: [x right, z toward the net] from the drill's start spot. */
  at: [number, number];
  /** Toes turned to the right (degrees). */
  yaw?: number;
  /** Lifted off the court (m). */
  lift?: number;
  /** Heel raised onto the ball of the foot, 0..1. */
  heel?: number;
}

export interface Pose {
  /** Pelvis over the ground [x, z toward the net]; defaults to between the feet. */
  pelvis?: [number, number];
  /** Hips sink from fully tall (m). */
  drop: number;
  /** Hip and shoulder turn to the right (degrees; a right-hander's forehand turn is positive). */
  hipYaw: number;
  chestYaw: number;
  /** Trunk leans forward / tips to the right (degrees). */
  lean: number;
  tilt: number;
  lf: Foot;
  rf: Foot;
  /** Wrist targets, net frame from the shoulder centre. */
  rh: V3;
  lh: V3;
  /** Elbow direction hints, net frame (optional). */
  rPole?: V3;
  lPole?: V3;
  /** Racket shaft direction (grip to tip), net frame; null = no racket. */
  racket?: V3 | null;
  /** String face normal, net frame (optional). */
  face?: V3;
  /** Gaze yaw to the right / pitch up (degrees, net frame); defaults to the ball or the net. */
  look?: [number, number];
  /** Off-hand palm normal, net frame. */
  lPalm?: V3;
  rPalm?: V3;
}

export type Key = { t: number } & Partial<Pose>;

/** Body measurements for a 1.78 m player. */
const B = {
  ankle: 0.08, shin: 0.43, thigh: 0.45, hipHalf: 0.095, trunk: 0.48, shoulderHalf: 0.19,
  neck: 0.23, upper: 0.29, fore: 0.265, footFwd: 0.14, toe: 0.07, heelBack: 0.07,
};
const TALL = B.ankle + B.shin + B.thigh - 0.01;

// ---------- small vector helpers on plain arrays ----------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3, fb: V3 = [0, 1, 0]): V3 => { const l = len(a); return l < 1e-9 ? fb : mul(a, 1 / l); };
const madd = (...terms: [V3, number][]): V3 => terms.reduce<V3>((s, [v, k]) => add(s, mul(v, k)), [0, 0, 0]);
const rad = (d: number) => (d * Math.PI) / 180;
const UPV: V3 = [0, 1, 0];
/** Facing the net is −z; turning right (positive yaw) swings the front toward +x. */
const fwdOf = (yaw: number): V3 => [Math.sin(rad(yaw)), 0, -Math.cos(rad(yaw))];
const rightOf = (yaw: number): V3 => [Math.cos(rad(yaw)), 0, Math.sin(rad(yaw))];
/** Net frame [right, up, toward net] to world axes. */
const net = (v: V3): V3 => [v[0], v[1], -v[2]];

interface Frame { o: V3; r: V3; u: V3; f: V3 }

/** Pelvis, chest frame and shoulder centre for a pose. */
function torso(p: Pose) {
  const lf = ankleOf(p.lf), rf = ankleOf(p.rf);
  const px = p.pelvis ? p.pelvis[0] : (p.lf.at[0] + p.rf.at[0]) / 2;
  const pz = p.pelvis ? -p.pelvis[1] : -(p.lf.at[1] + p.rf.at[1]) / 2;
  const hr = rightOf(p.hipYaw);
  // As low as asked, and never so high that a planted foot would have to leave the ground.
  let h = TALL - p.drop;
  const L = (B.thigh + B.shin) * 0.997;
  for (const [a, s] of [[lf, -1], [rf, 1]] as const) {
    const hip: V3 = [px + hr[0] * B.hipHalf * s, 0, pz + hr[2] * B.hipHalf * s];
    const d = Math.hypot(hip[0] - a[0], hip[2] - a[2]);
    h = Math.min(h, a[1] + Math.sqrt(Math.max(0.01, L * L - d * d)));
  }
  const pelvis: V3 = [px, h, pz];
  const f0 = fwdOf(p.chestYaw), r0 = rightOf(p.chestYaw);
  let u = add(mul(UPV, Math.cos(rad(p.lean))), mul(f0, Math.sin(rad(p.lean))));
  u = unit(add(mul(u, Math.cos(rad(p.tilt))), mul(r0, Math.sin(rad(p.tilt)))));
  const r = unit(sub(r0, mul(u, dot(r0, u))));
  const f = cross(u, r);
  const hipFwd = fwdOf(p.hipYaw);
  const hu = unit(add(UPV, mul(hipFwd, Math.sin(rad(p.lean * 0.35)))));
  const sm = add(add(pelvis, mul(hu, 0.06)), mul(u, B.trunk - 0.06));
  return { pelvis, hr, hipFwd, chest: { o: sm, r, u, f } as Frame };
}

const toLocal = (fr: Frame, w: V3): V3 => [dot(w, fr.r), dot(w, fr.u), dot(w, fr.f)];
const fromLocal = (fr: Frame, l: V3): V3 => madd([fr.r, l[0]], [fr.u, l[1]], [fr.f, l[2]]);

/** Ankle centre for a foot spec (lifted with the heel when it is raised). */
function ankleOf(ft: Foot): V3 {
  const fw = fwdOf(ft.yaw ?? 0);
  const a = rad((ft.heel ?? 0) * 50);
  const ball: V3 = [ft.at[0] + fw[0] * B.footFwd, 0.025 + (ft.lift ?? 0), -ft.at[1] + fw[2] * B.footFwd];
  return add(ball, madd([fw, -B.footFwd * Math.cos(a)], [UPV, B.footFwd * Math.sin(a) + B.ankle - 0.025]));
}

function footPoints(ft: Foot) {
  const fw = fwdOf(ft.yaw ?? 0);
  const a = rad((ft.heel ?? 0) * 50);
  const ankle = ankleOf(ft);
  const ball: V3 = [ft.at[0] + fw[0] * B.footFwd, 0.025 + (ft.lift ?? 0), -ft.at[1] + fw[2] * B.footFwd];
  const toe = add(ball, mul(fw, B.toe));
  const heel = add(ankle, madd([fw, -B.heelBack * Math.cos(a)], [UPV, -(B.ankle - 0.02) * Math.cos(a) - B.heelBack * Math.sin(a)]));
  return { ankle, toe, heel, fw };
}

/** Two-bone IK: the middle joint between `a` and `c`, bent toward `pole`. */
function ik(a: V3, c: V3, l1: number, l2: number, pole: V3): { mid: V3; end: V3 } {
  let d = sub(c, a);
  let dl = len(d);
  const max = (l1 + l2) * 0.999;
  let end = c;
  if (dl > max) { end = add(a, mul(d, max / dl)); d = sub(end, a); dl = max; }
  dl = Math.max(dl, Math.abs(l1 - l2) + 1e-3);
  const u = unit(d);
  const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let pv = sub(pole, mul(u, dot(pole, u)));
  pv = unit(pv, unit(cross(u, [0, 0, 1]), [1, 0, 0]));
  return { mid: add(add(a, mul(u, x)), mul(pv, h)), end };
}

export interface BodyFrame {
  /** 33 landmarks, court space. */
  pts: Vec3[];
  /** Racket shaft and face (court space), when held. */
  racket: { dir: Vec3; face: Vec3 } | null;
}

/** Interpolation carrier: a pose with hand and racket vectors already in the chest's frame. */
interface Carrier extends Pose { t: number }

const V = (a: V3): Vec3 => ({ x: a[0], y: a[1], z: a[2] });

/** Build the landmarks for one pose whose hand/racket vectors are in chest-local coordinates. */
function build(p: Pose, gaze: V3 | null): BodyFrame {
  const { pelvis, hr, hipFwd, chest } = torso(p);
  const w: V3[] = Array.from({ length: 33 }, () => [0, 0, 0] as V3);
  // Legs.
  const lHip = add(pelvis, mul(hr, -B.hipHalf));
  const rHip = add(pelvis, mul(hr, B.hipHalf));
  for (const [hip, ft, ids, s] of [[lHip, p.lf, [23, 25, 27, 29, 31], -1], [rHip, p.rf, [24, 26, 28, 30, 32], 1]] as const) {
    const fp = footPoints(ft);
    // Knees track over the toes, a little outward.
    const pole = add(add(fp.fw, mul(hipFwd, 0.6)), mul(hr, 0.25 * s));
    const { mid, end } = ik(hip, fp.ankle, B.thigh, B.shin, pole);
    const shift = sub(end, fp.ankle);
    w[ids[0]] = hip; w[ids[1]] = mid; w[ids[2]] = end;
    w[ids[3]] = add(fp.heel, shift); w[ids[4]] = add(fp.toe, shift);
  }
  // Shoulders and arms.
  const { o, r, u, f } = chest;
  const ls = add(o, mul(r, -B.shoulderHalf)), rs = add(o, mul(r, B.shoulderHalf));
  w[11] = ls; w[12] = rs;
  const arm = (s: V3, target: V3, poleL: V3 | undefined, side: 1 | -1) => {
    const goal = add(o, fromLocal(chest, target));
    const pole = poleL ? fromLocal(chest, poleL) : madd([u, -1], [r, 0.35 * side], [f, -0.35]);
    return ik(s, goal, B.upper, B.fore, pole);
  };
  const ra = arm(rs, p.rh, p.rPole, 1);
  const la = arm(ls, p.lh, p.lPole, -1);
  w[14] = ra.mid; w[16] = ra.end; w[13] = la.mid; w[15] = la.end;
  const racket = p.racket ? unit(fromLocal(chest, p.racket)) : null;
  let face: V3 | null = null;
  if (racket) {
    const want = p.face ? fromLocal(chest, p.face) : f;
    face = unit(sub(want, mul(racket, dot(want, racket))), unit(cross(racket, u)));
  }
  // Hands: knuckles along the hand, index and pinky across the palm.
  const hand = (wr: V3, el: V3, side: 'l' | 'r', palmL: V3 | undefined, ids: [number, number, number]) => {
    const fore = unit(sub(wr, el));
    let main = fore;
    let palm: V3 = palmL ? fromLocal(chest, palmL) : side === 'l' ? r : mul(r, -1);
    if (side === 'r' && racket) {
      main = unit(add(mul(fore, 0.45), mul(racket, 0.55)));
      palm = face!;
    }
    palm = unit(sub(palm, mul(main, dot(palm, main))), unit(cross(main, f)));
    const across = side === 'r' ? cross(main, palm) : cross(palm, main);
    w[ids[0]] = add(wr, madd([main, 0.08], [across, -0.035])); // pinky
    w[ids[1]] = add(wr, madd([main, 0.09], [across, 0.035])); // index
    w[ids[2]] = add(wr, madd([main, 0.04], [across, 0.045])); // thumb
  };
  hand(w[15], w[13], 'l', p.lPalm, [17, 19, 21]);
  hand(w[16], w[14], 'r', p.rPalm, [18, 20, 22]);
  // Head: on the neck, turned toward the gaze but never more than 75° from the chest.
  const hc = add(o, madd([u, B.neck], [f, 0.02]));
  const lk = p.look ?? [0, -8];
  const g = gaze && !p.look ? unit(sub(gaze, hc)) : unit(add(fwdOf(lk[0]), mul(UPV, Math.tan(rad(lk[1])))));
  const gh = unit([g[0], 0, g[2]], f);
  const cf = unit([f[0], 0, f[2]]);
  let ang = Math.atan2(cross(cf, gh)[1], dot(cf, gh));
  const lim = rad(75);
  ang = Math.max(-lim, Math.min(lim, ang));
  const c = Math.cos(ang), sn = Math.sin(ang);
  const hf0: V3 = [cf[0] * c + cf[2] * sn, 0, -cf[0] * sn + cf[2] * c];
  const pitch = Math.max(-0.7, Math.min(0.9, Math.asin(Math.max(-1, Math.min(1, g[1])))));
  const hf = unit(add(mul(hf0, Math.cos(pitch)), mul(UPV, Math.sin(pitch))));
  const hrt = unit(cross(hf, UPV));
  const hu = cross(hrt, hf);
  w[0] = add(hc, madd([hf, 0.1], [hu, -0.01]));
  const eye = (k: number, side: number) => add(hc, madd([hf, 0.085], [hu, 0.025], [hrt, side * k]));
  w[1] = eye(0.02, -1); w[2] = eye(0.033, -1); w[3] = eye(0.046, -1);
  w[4] = eye(0.02, 1); w[5] = eye(0.033, 1); w[6] = eye(0.046, 1);
  w[7] = add(hc, mul(hrt, -0.075)); w[8] = add(hc, mul(hrt, 0.075));
  w[9] = add(hc, madd([hf, 0.09], [hu, -0.045], [hrt, -0.02]));
  w[10] = add(hc, madd([hf, 0.09], [hu, -0.045], [hrt, 0.02]));
  return { pts: w.map(V), racket: racket && face ? { dir: V(racket), face: V(face) } : null };
}

// ---------- key frames ----------

const NUM_KEYS = ['drop', 'hipYaw', 'chestYaw', 'lean', 'tilt'] as const;

/** Each key only lists what changes; fill the rest from the key before. */
function complete(keys: Key[]): (Pose & { t: number })[] {
  const out: (Pose & { t: number })[] = [];
  let prev: Pose | null = null;
  for (const k of keys) {
    const cur = { ...(prev ?? {}), ...k } as Pose & { t: number };
    if (prev) {
      cur.lf = { ...prev.lf, ...(k.lf ?? {}) };
      cur.rf = { ...prev.rf, ...(k.rf ?? {}) };
    }
    // Poles, palms, face and look are per-key unless repeated.
    for (const opt of ['rPole', 'lPole', 'face', 'look', 'lPalm', 'rPalm', 'pelvis'] as const) if (!(opt in k)) delete cur[opt];
    out.push(cur);
    prev = cur;
  }
  return out;
}

/** Convert net-frame hand and racket vectors to the chest frame of that key. */
function toCarrier(p: Pose & { t: number }): Carrier {
  const { chest } = torso(p);
  const loc = (v: V3 | undefined) => (v ? toLocal(chest, net(v)) : undefined);
  return {
    ...p,
    rh: loc(p.rh)!, lh: loc(p.lh)!,
    rPole: loc(p.rPole), lPole: loc(p.lPole),
    racket: p.racket ? toLocal(chest, unit(net(p.racket))) : null,
    face: loc(p.face), lPalm: loc(p.lPalm), rPalm: loc(p.rPalm),
  };
}

/** Monotone cubic (Fritsch–Carlson) through (ts, ys): smooth, no overshoot, holds stay still. */
function monotone(ts: number[], ys: number[]) {
  const n = ts.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, ts[i + 1] - ts[i]));
  const m: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const h0 = ts[i] - ts[i - 1], h1 = ts[i + 1] - ts[i];
      const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (t: number) => {
    if (t <= ts[0]) return ys[0];
    if (t >= ts[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i];
    const s = (t - ts[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

type Curve = (t: number) => number;

export interface BallKey {
  t: number;
  /** World point: [x right, y up, z toward the net] from the drill spot... */
  p?: V3;
  /** ...or where the racket strings / a hand are at that moment. */
  at?: 'racket' | 'rh' | 'lh' | 'hands';
  /** Height of the arc above the straight line to this key (m). */
  arc?: number;
  /** Stay in that hand (or on the racket) until the next key. */
  hold?: boolean;
}

export interface Prop {
  kind: 'medball' | 'band' | 'cone' | 'ball' | 'wall' | 'line' | 'chair' | 'target';
  /** For band: anchor point; cones/wall/target: position; all [x, y, z toward net]. */
  p?: V3;
  /** Band: which hand(s) hold it. */
  hold?: 'rh' | 'lh' | 'hands';
  /** Medball: shown only between these times (it is thrown after). */
  from?: number;
  to?: number;
  /** Medball: thrown along these keys after `to`. */
  flight?: BallKey[];
  /** Size (wall width, line length). */
  size?: number;
  /** Turn of a wall / line (degrees, 0 = across the court). */
  yaw?: number;
}

export interface Motion {
  duration: number;
  keys: Key[];
  ball?: BallKey[];
  props?: Prop[];
  /** Freeze-frame times with a caption for the collage. */
  stills: { t: number; label: string }[];
}

export interface DrillFrame extends BodyFrame {
  ball: Vec3 | null;
  medball: Vec3 | null;
  hands: { l: Vec3; r: Vec3 };
}

/** Compiled animation: sample it at any time. */
export class Animation {
  readonly duration: number;
  private curves = new Map<string, Curve>();
  private ballCurve: ((t: number) => V3 | null) | null = null;
  private medCurve: ((t: number, hands: V3) => V3 | null) | null = null;

  constructor(readonly motion: Motion, readonly hand: Handedness = 'right') {
    this.duration = motion.duration;
    const full = complete(motion.keys).map(toCarrier);
    const ts = full.map((k) => k.t);
    const put = (name: string, get: (k: Carrier) => number | undefined, fallback = 0) => {
      // Optional values: fill gaps from neighbours so the curve stays continuous.
      const raw = full.map(get);
      const firstDef = raw.find((x) => x !== undefined) ?? fallback;
      let last = firstDef;
      const ys = raw.map((x) => (x === undefined ? last : (last = x)));
      this.curves.set(name, monotone(ts, ys));
    };
    for (const n of NUM_KEYS) put(n, (k) => k[n]);
    put('pelvisSet', (k) => (k.pelvis ? 1 : 0));
    put('px', (k) => k.pelvis?.[0]);
    put('pz', (k) => k.pelvis?.[1]);
    for (const f of ['lf', 'rf'] as const) {
      put(`${f}x`, (k) => k[f].at[0]); put(`${f}z`, (k) => k[f].at[1]);
      put(`${f}yaw`, (k) => k[f].yaw ?? 0); put(`${f}lift`, (k) => k[f].lift ?? 0); put(`${f}heel`, (k) => k[f].heel ?? 0);
    }
    const vec = (name: string, get: (k: Carrier) => V3 | undefined | null) => {
      for (let i = 0; i < 3; i++) put(`${name}${i}`, (k) => get(k)?.[i]);
      put(`${name}?`, (k) => (get(k) ? 1 : 0));
    };
    vec('rh', (k) => k.rh); vec('lh', (k) => k.lh);
    vec('rPole', (k) => k.rPole); vec('lPole', (k) => k.lPole);
    vec('racket', (k) => k.racket); vec('face', (k) => k.face);
    vec('lPalm', (k) => k.lPalm); vec('rPalm', (k) => k.rPalm);
    put('lookOn', (k) => (k.look ? 1 : 0));
    put('lookY', (k) => k.look?.[0]); put('lookP', (k) => k.look?.[1]);
    // Bake the whole rep once, smoothed, so playback is steady (pass 1: no gaze; pass 2 looks at the ball).
    this.cache = this.bake(null);
    if (motion.ball) {
      this.ballCurve = this.path(motion.ball);
      const ballAt = this.ballCurve;
      this.cache = this.bake((t) => ballAt(t));
    }
    const med = motion.props?.find((p) => p.kind === 'medball');
    if (med) {
      const fl = med.flight ? this.path(med.flight) : null;
      this.medCurve = (t, hands) => {
        if (med.from !== undefined && t < med.from) return null;
        if (med.to !== undefined && t > med.to) return fl ? fl(t) : null;
        return hands;
      };
    }
  }

  private c(name: string, t: number) {
    return this.curves.get(name)!(t);
  }

  /** The pose at time t (right-handed, before mirroring). */
  private poseAt(t: number): Pose {
    const v = (n: string): V3 | undefined => (this.c(`${n}?`, t) > 0.5 ? [this.c(`${n}0`, t), this.c(`${n}1`, t), this.c(`${n}2`, t)] : undefined);
    const foot = (f: string): Foot => ({ at: [this.c(`${f}x`, t), this.c(`${f}z`, t)], yaw: this.c(`${f}yaw`, t), lift: Math.max(0, this.c(`${f}lift`, t)), heel: Math.max(0, Math.min(1, this.c(`${f}heel`, t))) });
    const lf = foot('lf'), rf = foot('rf');
    const ps = this.c('pelvisSet', t);
    const mid: [number, number] = [(lf.at[0] + rf.at[0]) / 2, (lf.at[1] + rf.at[1]) / 2];
    const pelvis: [number, number] | undefined = ps > 0.01 ? [mid[0] + (this.c('px', t) - mid[0]) * Math.min(1, ps), mid[1] + (this.c('pz', t) - mid[1]) * Math.min(1, ps)] : undefined;
    return {
      pelvis,
      drop: this.c('drop', t), hipYaw: this.c('hipYaw', t), chestYaw: this.c('chestYaw', t), lean: this.c('lean', t), tilt: this.c('tilt', t),
      lf, rf, rh: v('rh')!, lh: v('lh')!, rPole: v('rPole'), lPole: v('lPole'),
      racket: v('racket') ?? null, face: v('face'), lPalm: v('lPalm'), rPalm: v('rPalm'),
      look: this.c('lookOn', t) > 0.5 ? [this.c('lookY', t), this.c('lookP', t)] : undefined,
    };
  }

  /** Baked, smoothed frames at BAKE_FPS (right-handed, before placing on court). */
  private cache: BodyFrame[] | null = null;

  private bake(gaze: ((t: number) => V3 | null) | null): BodyFrame[] {
    const n = Math.max(2, Math.ceil(this.duration * BAKE_FPS) + 1);
    const frames: BodyFrame[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(this.duration, i / BAKE_FPS);
      frames.push(build(this.poseAt(t), gaze ? gaze(t) : null));
    }
    return smoothFrames(frames, BAKE_FPS);
  }

  /** The baked frame at time t, blended between the two nearest samples. */
  private sample(t: number): BodyFrame {
    const c = this.cache!;
    const x = Math.max(0, Math.min(c.length - 1, t * BAKE_FPS));
    const i = Math.min(c.length - 2, Math.floor(x));
    const k = x - i;
    const a = c[i], b = c[i + 1];
    const lerp = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k });
    const nrm = (v: Vec3): Vec3 => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
    return {
      pts: a.pts.map((p, j) => lerp(p, b.pts[j])),
      racket: a.racket && b.racket ? { dir: nrm(lerp(a.racket.dir, b.racket.dir)), face: nrm(lerp(a.racket.face, b.racket.face)) } : (k < 0.5 ? a.racket : b.racket),
    };
  }

  /** Right-handed frame plus racket head, for resolving ball keys. */
  private raw(t: number, gaze: V3 | null = null) {
    const f = this.cache ? this.sample(t) : build(this.poseAt(t), gaze);
    const w = f.pts;
    const g = (i: number): V3 => [w[i].x, w[i].y, w[i].z];
    const head = f.racket ? add(g(16), mul([f.racket.dir.x, f.racket.dir.y, f.racket.dir.z], 0.68 * 0.72)) : null;
    return { f, g, head };
  }

  /** A ball (or medicine ball) path through keys, each leg an arc. */
  private path(keys: BallKey[]) {
    const pts = keys.map((k) => {
      if (k.p) return net(k.p);
      const r = this.raw(k.t);
      if (k.at === 'racket' && r.head) return r.head;
      if (k.at === 'lh') return add(r.g(15), madd([unit(sub(r.g(19), r.g(15))), 0.03], [UPV, 0.045]));
      if (k.at === 'hands') return mul(add(r.g(15), r.g(16)), 0.5);
      return r.g(16);
    });
    const follow = (k: BallKey, t: number): V3 => {
      const r = this.raw(t);
      if (k.at === 'racket' && r.head) return r.head;
      if (k.at === 'lh') return add(r.g(15), madd([unit(sub(r.g(19), r.g(15))), 0.03], [UPV, 0.045]));
      if (k.at === 'hands') return mul(add(r.g(15), r.g(16)), 0.5);
      return r.g(16);
    };
    return (t: number): V3 | null => {
      if (t < keys[0].t || t > keys[keys.length - 1].t) return null;
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      if (keys[i].hold && keys[i].at) return follow(keys[i], t);
      const s = (t - keys[i].t) / Math.max(1e-6, keys[i + 1].t - keys[i].t);
      const p = add(pts[i], mul(sub(pts[i + 1], pts[i]), s));
      p[1] += 4 * (keys[i + 1].arc ?? 0) * s * (1 - s);
      return p;
    };
  }

  at(t: number): DrillFrame {
    const tt = ((t % this.duration) + this.duration) % this.duration;
    const ball = this.ballCurve?.(tt) ?? null;
    const { f, g } = this.raw(tt);
    const handsMid = mul(add(g(15), g(16)), 0.5);
    let med = this.medCurve?.(tt, handsMid) ?? null;
    if (med && this.medCurve && med === handsMid) {
      // Held: in front of the palms, away from the chest.
      const away = unit(sub(handsMid, mul(add(g(11), g(12)), 0.5)));
      med = add(handsMid, mul(away, 0.07));
    }
    const out: DrillFrame = { ...f, ball: ball ? V(ball) : null, medball: med ? V(med) : null, hands: { l: f.pts[15], r: f.pts[16] } };
    return place(this.hand === 'left' ? mirror(out) : out);
  }
}

const BAKE_FPS = 60;

/** Seconds of smoothing per landmark: hands quick, trunk and head steadier. */
function sigmaOf(j: number) {
  if (j >= 15 && j <= 22) return 0.03;
  if (j === 13 || j === 14) return 0.035;
  if (j >= 27) return 0.025;
  if (j <= 10) return 0.06;
  return 0.045;
}

/** Zero-phase Gaussian over a series (wrapping when the rep loops back to its start). */
function gaussSeries(xs: number[], sigma: number, wrap: boolean): number[] {
  if (sigma < 0.5) return xs.slice();
  const r = Math.ceil(sigma * 3);
  const w: number[] = [];
  for (let d = -r; d <= r; d++) w.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  const n = xs.length;
  return xs.map((_, i) => {
    let s = 0, m = 0;
    for (let d = -r; d <= r; d++) {
      let j = i + d;
      if (wrap) j = ((j % (n - 1)) + (n - 1)) % (n - 1);
      else if (j < 0 || j >= n) continue;
      s += xs[j] * w[d + r];
      m += w[d + r];
    }
    return s / m;
  });
}

/**
 * Smooth a baked rep: every landmark and the racket filtered both ways in time (no lag, no
 * corners where key poses meet), then elbows and knees re-solved so limbs keep their length
 * and bend the same way they did.
 */
function smoothFrames(frames: BodyFrame[], fps: number): BodyFrame[] {
  const n = frames.length;
  const first = frames[0].pts, last = frames[n - 1].pts;
  const wrap = first.every((p, j) => Math.hypot(p.x - last[j].x, p.y - last[j].y, p.z - last[j].z) < 0.03);
  const out: BodyFrame[] = frames.map((f) => ({ pts: f.pts.map((p) => ({ ...p })), racket: f.racket ? { dir: { ...f.racket.dir }, face: { ...f.racket.face } } : null }));
  for (let j = 0; j < 33; j++) {
    for (const ax of ['x', 'y', 'z'] as const) {
      const sm = gaussSeries(frames.map((f) => f.pts[j][ax]), sigmaOf(j) * fps, wrap);
      out.forEach((f, i) => (f.pts[j][ax] = sm[i]));
    }
  }
  // Racket: smooth where it is held (runs of frames with a racket).
  if (frames.every((f) => f.racket)) {
    for (const key of ['dir', 'face'] as const) for (const ax of ['x', 'y', 'z'] as const) {
      const sm = gaussSeries(frames.map((f) => f.racket![key][ax]), 0.03 * fps, wrap);
      out.forEach((f, i) => (f.racket![key][ax] = sm[i]));
    }
    for (const f of out) {
      const d = unit([f.racket!.dir.x, f.racket!.dir.y, f.racket!.dir.z]);
      let fc: V3 = [f.racket!.face.x, f.racket!.face.y, f.racket!.face.z];
      fc = unit(sub(fc, mul(d, dot(fc, d))));
      f.racket = { dir: V(d), face: V(fc) };
    }
  }
  // Limb lengths back to exact, bends kept.
  const g = (f: BodyFrame, j: number): V3 => [f.pts[j].x, f.pts[j].y, f.pts[j].z];
  for (const f of out) {
    for (const [a, m, c, l1, l2] of [[12, 14, 16, B.upper, B.fore], [11, 13, 15, B.upper, B.fore], [24, 26, 28, B.thigh, B.shin], [23, 25, 27, B.thigh, B.shin]] as const) {
      const A = g(f, a), M = g(f, m), C = g(f, c);
      const pole = sub(M, mul(add(A, C), 0.5));
      const res = ik(A, C, l1, l2, pole);
      f.pts[m] = V(res.mid);
      const shift = sub(res.end, C);
      if (len(shift) > 1e-6) {
        // Keep the hand or foot attached to its end.
        const kids = c === 16 ? [16, 18, 20, 22] : c === 15 ? [15, 17, 19, 21] : c === 28 ? [28, 30, 32] : [27, 29, 31];
        for (const k of kids) f.pts[k] = V(add(g(f, k), shift));
      }
    }
  }
  return out;
}

/** Landmark pairs swapped when mirroring to a left-hander. */
const SWAP = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
const mx = (p: Vec3): Vec3 => ({ x: -p.x, y: p.y, z: p.z });

function mirror(f: DrillFrame): DrillFrame {
  const pts = f.pts.map(mx);
  for (const [a, b] of SWAP) [pts[a], pts[b]] = [pts[b], pts[a]];
  return {
    pts,
    racket: f.racket ? { dir: mx(f.racket.dir), face: mx(f.racket.face) } : null,
    ball: f.ball ? mx(f.ball) : null,
    medball: f.medball ? mx(f.medball) : null,
    hands: { l: mx(f.hands.r), r: mx(f.hands.l) },
  };
}

/** Move the drill spot onto the court (behind the baseline, deuce side). */
export const SPOT: Vec3 = { x: PLAYER_SPOT.x, y: 0, z: PLAYER_SPOT.z - 0.2 };
const at = (p: Vec3): Vec3 => ({ x: p.x + SPOT.x, y: p.y, z: p.z + SPOT.z });
function place(f: DrillFrame): DrillFrame {
  return { ...f, pts: f.pts.map(at), ball: f.ball ? at(f.ball) : null, medball: f.medball ? at(f.medball) : null, hands: { l: at(f.hands.l), r: at(f.hands.r) } };
}

/** A prop position in court space for a handedness. */
export function propAt(p: V3, hand: Handedness): Vec3 {
  const w = net(p);
  return at({ x: hand === 'left' ? -w[0] : w[0], y: w[1], z: w[2] });
}
