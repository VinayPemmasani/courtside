import { isOverhead, type Handedness, type PoseFrame, type StrokeType, type Vec3 } from './types';
import { sides } from './landmarks';
import { estimateRacket } from './racket';

/**
 * Placing a stroke on a virtual court. Pose world landmarks are metres around the hips with
 * y down; the scene is metres with y up, the net along x at z = 0 and the player's back wall at
 * z = +10, so the player hits toward −z.
 */

/**
 * Padel court: 20 m × 10 m inside the walls, service lines 6.95 m from the net, net 0.88 m in the middle
 * and 0.92 m at the posts. Back walls are 3 m of glass (4 m with the mesh above), side walls step down
 * from 3 m of glass to mesh. `singles` and `doubles` are the same width: padel is always played to the walls.
 */
export const COURT = { length: 20, doubles: 10, singles: 10, service: 6.95, netPost: 0.92, net: 0.88, backGlass: 3, sideGlass: 2, sideGlassLen: 4, fence: 4 };

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

/** Player's spot for a rally ball: about 2 m in front of the back glass, a little to the right side. */
export const PLAYER_SPOT: Vec3 = { x: 0.9, y: 0, z: COURT.length / 2 - 2 };

/** Where on the court each padel stroke is usually played: volleys near the net, overheads around the service line, wall balls by the glass. */
export function spotFor(type?: StrokeType): Vec3 {
  switch (type) {
    case 'volley': return { x: 1.2, y: 0, z: 3 };
    case 'bandeja':
    case 'vibora': return { x: 1.2, y: 0, z: 5.5 };
    case 'smash': return { x: 1.0, y: 0, z: 4.5 };
    case 'wall': return { x: 1.5, y: 0, z: COURT.length / 2 - 1.1 };
    case 'serve': return { x: 1.2, y: 0, z: COURT.length / 2 - 2.2 };
    default: return PLAYER_SPOT;
  }
}

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
  return { yaw, floor, origin: spotFor(stroke.type), level };
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
 * An illustrative ball flight in court coordinates, built around the measured contact point:
 * the ball arrives (a toss for serves, a bounce for groundstrokes), meets the racket at contact,
 * and leaves toward the opponent's court. One camera cannot measure the ball's depth, so only
 * the contact point and the swing direction come from the video.
 */
export function ballFlight(frames: PoseFrame[], stroke: { startFrame: number; endFrame: number; contactFrame: number; type?: StrokeType }, s: StrokeSpace, hand: Handedness, serveFlag?: boolean): BallFlight | null {
  const r = estimateRacket(frames[stroke.contactFrame]?.world ?? null, hand);
  if (!r) return null;
  const C = toCourt(r.head, s);
  const serve = serveFlag ?? stroke.type === 'serve';
  const overhead = !!stroke.type && isOverhead(stroke.type);
  const before = serve ? 1.1 : overhead ? 1.3 : 0.9;
  const after = 1.0;
  const half = COURT.length / 2;
  // Serves go cross-court into the service box; overheads land near the far service line or are
  // smashed down hard; volleys and drives land in the far half.
  const land: Vec3 = serve
    ? { x: -C.x * 0.8 - 1.5, y: 0, z: -COURT.service + 1.2 }
    : stroke.type === 'smash'
      ? { x: C.x * 0.3 - 0.8, y: 0, z: -4.5 }
      : stroke.type === 'lob'
        ? { x: C.x * 0.4 - 0.8, y: 0, z: -half + 1.8 }
        : { x: C.x * 0.4 - 0.8, y: 0, z: overhead ? -half + 3 : -7 };
  const lift = serve ? 0.5 : stroke.type === 'lob' ? 5.5 : stroke.type === 'smash' ? 0 : overhead ? 0.4 : 1.1;
  const outCtrl: Vec3 = { x: (C.x + land.x) / 2, y: Math.max(C.y, 1) + lift, z: (C.z + land.z) / 2 };
  let incoming: (t: number) => Vec3;
  if (serve) {
    // Dropped from the free hand, one bounce beside the front foot, then struck below the waist.
    const { non } = sides(hand);
    const release = frames[stroke.startFrame]?.world;
    const T = release ? toCourt(release[non.wrist], s) : { ...C, y: 1.0 };
    const B: Vec3 = { x: (T.x + C.x) / 2, y: 0, z: (T.z + C.z) / 2 };
    incoming = (k) => (k < 0.5 ? bez(T, { x: T.x, y: T.y, z: T.z }, B, k / 0.5) : bez(B, { x: (B.x + C.x) / 2, y: C.y + 0.35, z: (B.z + C.z) / 2 }, C, (k - 0.5) / 0.5));
  } else if (overhead) {
    // A lob from the far side, dropping onto the player from high above.
    const A: Vec3 = { x: -2, y: 1.0, z: -half + 2 };
    incoming = (k) => bez(A, { x: (A.x + C.x) / 2, y: 9, z: (A.z + C.z) / 2 + 2 }, C, k);
  } else {
    const A: Vec3 = { x: -2.5, y: 1.0, z: -half + 1.5 };
    const B: Vec3 = { x: C.x - 0.3, y: 0, z: C.z - 3 };
    incoming = (k) => (k < 0.65 ? bez(A, { x: (A.x + B.x) / 2, y: 2.0, z: (A.z + B.z) / 2 }, B, k / 0.65) : bez(B, { x: (B.x + C.x) / 2, y: C.y + 0.5, z: (B.z + C.z) / 2 }, C, (k - 0.65) / 0.35));
  }
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
