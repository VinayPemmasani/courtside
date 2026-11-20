import type { Handedness, PoseFrame, StrokeType, Vec3 } from './types';
import { isBowling, sides } from './landmarks';
import { estimateRacket } from './racket';

/**
 * Placing a shot or delivery on a virtual pitch. Pose world landmarks are metres around the hips
 * with y down; the scene is metres with y up, the pitch along z centred on z = 0, and the player's
 * stumps at z = +10.06, so the batter hits (and the bowler bowls) toward −z.
 */

/** Pitch dimensions (m): 22 yards between the stumps, popping crease 4 ft in front of them. */
export const PITCH = { length: 20.12, width: 3.05, popping: 1.22, returnHalf: 1.32, bowlingCrease: 2.64, stumpH: 0.711, stumpsW: 0.2286 };
/** Kept for code shared with the scene: half-length of the playing strip. */
export const COURT = { length: PITCH.length };

/** How one stroke is placed on the court. */
export interface StrokeSpace {
  /** Rotation about the vertical axis (radians) that turns the swing direction toward the net. */
  yaw: number;
  /** Pose y of the floor (the lowest foot at the start of the stroke). */
  floor: number;
  /** Where the hips stand on the court. */
  origin: Vec3;
  /**
   * Row-major 3x3 rotation that levels the camera's view (y up, z toward the camera) so the player
   * stands upright on the court even when the camera was tilted. Identity when absent.
   */
  level?: number[];
}

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (m: number[], v: Vec3): Vec3 => ({ x: m[0] * v.x + m[1] * v.y + m[2] * v.z, y: m[3] * v.x + m[4] * v.y + m[5] * v.z, z: m[6] * v.x + m[7] * v.y + m[8] * v.z });
/** Pose world point (y down, z away from the camera) in camera axes with y up and z toward the camera, levelled. */
const up = (p: Vec3, level?: number[]): Vec3 => mul(level ?? I3, { x: p.x, y: -p.y, z: -p.z });

/**
 * The rotation that makes the player's average standing axis (ankles to shoulders) vertical,
 * capped at 30°. Single-camera world landmarks follow the camera's tilt, so without this a
 * camera pointing down makes the player look like they are falling over on the court.
 */
export function levelFor(frames: PoseFrame[], from: number, to: number): number[] {
  let ax = 0, ay = 0, az = 0;
  for (let i = Math.max(0, from); i <= Math.min(frames.length - 1, to); i++) {
    const w = frames[i]?.world;
    if (!w) continue;
    const a = up({ x: (w[27].x + w[28].x) / 2, y: (w[27].y + w[28].y) / 2, z: (w[27].z + w[28].z) / 2 });
    const b = up({ x: (w[11].x + w[12].x) / 2, y: (w[11].y + w[12].y) / 2, z: (w[11].z + w[12].z) / 2 });
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const l = Math.hypot(d.x, d.y, d.z);
    if (l < 0.3) continue;
    ax += d.x / l; ay += d.y / l; az += d.z / l;
  }
  const l = Math.hypot(ax, ay, az);
  if (l < 1e-6 || ay <= 0) return I3;
  const u = { x: ax / l, y: ay / l, z: az / l };
  // Rotate u onto (0,1,0): axis = u × y, angle = acos(u·y), capped.
  let k = { x: -u.z, y: 0, z: u.x };
  const s = Math.hypot(k.x, k.z);
  if (s < 1e-6) return I3;
  k = { x: k.x / s, y: 0, z: k.z / s };
  const ang = Math.min(Math.acos(Math.min(1, u.y)), (30 * Math.PI) / 180);
  const c = Math.cos(ang), n = Math.sin(ang), t = 1 - c;
  return [
    t * k.x * k.x + c, t * k.x * k.y - n * k.z, t * k.x * k.z + n * k.y,
    t * k.x * k.y + n * k.z, t * k.y * k.y + c, t * k.y * k.z - n * k.x,
    t * k.x * k.z - n * k.y, t * k.y * k.z + n * k.x, t * k.z * k.z + c,
  ];
}

/** Batter's spot: in guard just behind the popping crease, a little outside off stump. */
export const PLAYER_SPOT: Vec3 = { x: 0.3, y: 0, z: PITCH.length / 2 - PITCH.popping + 0.35 };
/** Bowler's spot at release: front foot on the popping crease, beside the stumps. */
export const BOWLER_SPOT: Vec3 = { x: -0.35, y: 0, z: PITCH.length / 2 - PITCH.popping + 0.6 };

const FEET = [27, 28, 29, 30, 31, 32];

/**
 * The swing direction at contact (the hitting hand's movement over the ground) is where the ball
 * goes, so it is turned to face the net. The floor is the lowest foot at the start of the stroke.
 */
export function strokeSpace(frames: PoseFrame[], stroke: { startFrame: number; endFrame: number; contactFrame: number; type?: StrokeType }, hand: Handedness): StrokeSpace {
  const { dom } = sides(hand);
  const c = stroke.contactFrame;
  const level = levelFor(frames, stroke.startFrame, stroke.endFrame);
  const a = frames[Math.max(stroke.startFrame, c - 2)]?.world;
  const b = frames[Math.min(stroke.endFrame, c + 2)]?.world;
  // Default: swinging away from the camera, as when filmed from behind.
  let dx = 0, dz = 1;
  if (a && b) {
    const A = up(a[dom.wrist], level), B = up(b[dom.wrist], level);
    const vx = B.x - A.x;
    // Back in pose axes (z away from the camera) for the yaw below.
    const vz = -(B.z - A.z);
    if (Math.hypot(vx, vz) > 0.05) { dx = vx; dz = vz; }
  }
  // In scene axes the swing is (dx, −dz); turn it to (0, −1).
  const yaw = Math.atan2(-dx, dz);
  const first = frames[stroke.startFrame]?.world ?? frames.find((f) => f.world)?.world;
  // Floor: the lowest foot at the start, measured along the levelled vertical (as a pose-style "down" value).
  const floor = first ? Math.max(...FEET.map((i) => -up(first[i], level).y)) : 0.9;
  const bowl = stroke.type !== undefined && isBowling(stroke.type);
  const spot = bowl ? BOWLER_SPOT : PLAYER_SPOT;
  return { yaw, floor, origin: hand === 'left' ? { ...spot, x: -spot.x } : spot, level };
}

/** A pose world point in court coordinates. */
export function toCourt(p: Vec3, s: StrokeSpace): Vec3 {
  const q = up(p, s.level);
  const x = q.x;
  const z = q.z;
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return { x: s.origin.x + x * c - z * n, y: s.floor + q.y, z: s.origin.z + x * n + z * c };
}

/** A direction given in pose axes (y down, z away from the camera), turned into court axes. */
export function dirToCourt(d: Vec3, s: StrokeSpace): Vec3 {
  const a = toCourt({ x: 0, y: 0, z: 0 }, s);
  const b = toCourt(d, s);
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

/** Quadratic Bézier point. */
const bez = (a: Vec3, c: Vec3, b: Vec3, t: number): Vec3 => {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y, z: u * u * a.z + 2 * u * t * c.z + t * t * b.z };
};

export interface BallFlight {
  contact: Vec3;
  /** Ball position `t` seconds from contact (negative before), or null when out of the shown flight. */
  at(t: number): Vec3 | null;
  /** Seconds the flight is shown before and after contact. */
  before: number;
  after: number;
}

/**
 * An illustrative ball flight in pitch coordinates, built around the measured impact or release
 * point. Batting: the ball is bowled from the far end, pitches (full for a drive or defence, short
 * for a pull or cut), meets the middle of the bat and leaves along the swing. Bowling: the ball
 * leaves the hand at release, pitches on a good length and carries on to the far stumps. One camera
 * cannot measure the ball, so only the contact point and the swing direction come from the video.
 */
export function ballFlight(frames: PoseFrame[], stroke: { startFrame: number; endFrame: number; contactFrame: number; type: StrokeType }, s: StrokeSpace, hand: Handedness): BallFlight | null {
  const w = frames[stroke.contactFrame]?.world ?? null;
  if (!w) return null;
  const half = PITCH.length / 2;
  if (isBowling(stroke.type)) {
    const { dom } = sides(hand);
    const R = toCourt(w[dom.wrist], s);
    const spin = stroke.type === 'spin';
    const bounce: Vec3 = { x: R.x * 0.3, y: 0, z: -half + (spin ? 3.5 : 6) };
    const stumps: Vec3 = { x: 0, y: spin ? 0.45 : 0.6, z: -half };
    const t1 = spin ? 0.75 : 0.45, t2 = spin ? 0.3 : 0.2;
    const peak = R.y + (spin ? 0.5 : 0.05);
    return {
      contact: R,
      before: 0,
      after: t1 + t2,
      at(t) {
        if (t < 0 || t > t1 + t2) return null;
        if (t <= t1) return bez(R, { x: (R.x + bounce.x) / 2, y: peak, z: (R.z + bounce.z) / 2 }, bounce, t / t1);
        return bez(bounce, { x: (bounce.x + stumps.x) / 2, y: stumps.y + 0.35, z: (bounce.z + stumps.z) / 2 }, stumps, (t - t1) / t2);
      },
    };
  }
  const r = estimateRacket(w, hand);
  if (!r) return null;
  const C = toCourt(r.head, s);
  const short = stroke.type === 'pull' || stroke.type === 'cut';
  const before = 0.75;
  const after = stroke.type === 'defence' ? 0.6 : 1.0;
  const release: Vec3 = { x: -0.3, y: 2.2, z: -half + 1.0 };
  const pitchAt: Vec3 = { x: C.x * 0.5, y: 0, z: C.z - (short ? 7 : 2.2) };
  const land: Vec3 = stroke.type === 'defence' ? { x: C.x, y: 0, z: C.z - 1.2 } : { x: C.x * 0.4, y: 0, z: C.z - 14 };
  const outCtrl: Vec3 = stroke.type === 'defence'
    ? { x: C.x, y: C.y * 0.6, z: C.z - 0.6 }
    : { x: (C.x + land.x) / 2, y: short ? C.y + 0.4 : Math.max(0.15, C.y * 0.3), z: (C.z + land.z) / 2 };
  const k1 = 0.75;
  const incoming = (k: number) => (k < k1
    ? bez(release, { x: (release.x + pitchAt.x) / 2, y: 2.4, z: (release.z + pitchAt.z) / 2 }, pitchAt, k / k1)
    : bez(pitchAt, { x: (pitchAt.x + C.x) / 2, y: C.y + (short ? 0.5 : 0.15), z: (pitchAt.z + C.z) / 2 }, C, (k - k1) / (1 - k1)));
  return {
    contact: C,
    before,
    after,
    at(t) {
      if (t < -before || t > after) return null;
      return t <= 0 ? incoming(1 + t / before) : bez(C, outCtrl, land, t / after);
    },
  };
}
