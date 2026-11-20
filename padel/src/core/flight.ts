/**
 * What the strike does to the ball: a 2D (side-on) model of the ball meeting the strings, then
 * the ball's flight with gravity, air drag and topspin (Magnus) to the net and the far court.
 *
 * Collision (Brody / Cross): along the face normal, the ball leaves at e·v_in + (1 + e)·V_n with
 * the apparent restitution e ≈ 0.42 of a hand-held racket near the sweet spot. Across the face,
 * the ball grips and leaves rolling, which keeps part of the strings' sliding speed and turns the
 * rest into spin. Flight: drag C_D 0.55, lift C_L = 1 / (2 + v / (r·ω)).
 * x points toward the net, y up; angles in degrees, speeds in m/s.
 */
import { NET_STRAP } from './strike';

const R = 0.0335;
const MASS = 0.0577;
const RHO = 1.21;
const AREA = Math.PI * R * R;
const K = (0.5 * RHO * AREA) / MASS;
const CD = 0.55;
const G = 9.81;
/** Apparent coefficient of restitution of a hand-held racket at the sweet spot. */
export const E_APPARENT = 0.42;
/** Share of the strings' sliding speed across the ball that it keeps when it leaves rolling. */
const ROLL = 0.4;
/** Share of the sliding speed that becomes spin at the ball's surface. */
const SPIN_GRIP = 0.5;
/** Padel: back glass to net, and back glass to the far back glass. */
export const BASELINE_TO_NET = 10;
export const COURT_LENGTH = 20;
/** Paddle speed at the sweet spot from wrist speed at contact: a padel paddle is 45.5 cm, a shorter lever than a tennis racket. */
export const HEAD_TO_WRIST = 1.7;

export interface StrikeIn {
  /** Racket face, + closed. */
  face: number;
  /** Racket path, + upward. */
  path: number;
  /** Racket head speed. */
  racketSpeed: number;
  /** Incoming ball: horizontal speed toward the player (positive) and vertical speed (+ up). */
  speedIn: number;
  vzIn: number;
  /** Contact height, m. */
  height: number;
  /** Distance behind the back glass at contact, m (negative: in front of it, as always in padel). */
  behind: number;
}

export interface Shot {
  /** Ball speed off the strings, m/s. */
  speed: number;
  /** Launch angle, + upward. */
  launch: number;
  /** Topspin (+) or backspin (−), rpm. */
  rpm: number;
  /** How much of the strike goes straight into the ball (100% = head on), %. */
  square: number;
  /** Height above the net strap when the ball reaches the net, m (negative = into the net). */
  netClear: number;
  /** Where it lands: metres short of the far back glass (+) or into it on the full, out (−); undefined if it hits the net. */
  depth?: number;
  result: 'net' | 'in' | 'long' | 'short';
  /** Highest point of the flight, m. */
  peak: number;
}

const unit = (deg: number) => ({ c: Math.cos((deg * Math.PI) / 180), s: Math.sin((deg * Math.PI) / 180) });

/** Ball velocity and spin straight off the strings. */
export function collide(a: StrikeIn): { vx: number; vy: number; omega: number; square: number } {
  const f = unit(a.face);
  const n = { x: f.c, y: -f.s }; // out of the strings, toward the net
  const t = { x: f.s, y: f.c }; // along the strings, upward
  const p = unit(a.path);
  const V = { x: a.racketSpeed * p.c, y: a.racketSpeed * p.s };
  const u = { x: -a.speedIn, y: a.vzIn };
  const Vn = V.x * n.x + V.y * n.y, un = u.x * n.x + u.y * n.y;
  const Vt = V.x * t.x + V.y * t.y, ut = u.x * t.x + u.y * t.y;
  const vn = E_APPARENT * Math.max(0, -un) + (1 + E_APPARENT) * Vn;
  const slide = Vt - ut; // strings sliding up the ball (+) gives topspin
  // The ball leaves rolling: it keeps ROLL of its slide relative to the strings.
  const vt = Vt - ROLL * slide;
  const omega = (SPIN_GRIP * slide) / R;
  const rel = { x: V.x - u.x, y: V.y - u.y };
  const relLen = Math.hypot(rel.x, rel.y) || 1;
  const square = Math.max(0, (rel.x * n.x + rel.y * n.y) / relLen) * 100;
  return { vx: vn * n.x + vt * t.x, vy: vn * n.y + vt * t.y, omega, square };
}

/** Flight from contact to the far court. */
export function fly(vx: number, vy: number, omega: number, height: number, behind: number): Pick<Shot, 'netClear' | 'depth' | 'result' | 'peak'> {
  let x = 0, y = height, peak = height;
  const netX = behind + BASELINE_TO_NET;
  const farBase = behind + COURT_LENGTH;
  let netClear: number | undefined;
  const dt = 0.002;
  for (let i = 0; i < 4000; i++) {
    const v = Math.hypot(vx, vy);
    const cl = Math.abs(omega) > 1 ? 1 / (2 + v / (R * Math.abs(omega))) : 0;
    const sgn = Math.sign(omega);
    // Drag against the motion; lift perpendicular to it, downward for topspin.
    const ax = -K * CD * v * vx + K * cl * v * (sgn * vy);
    const ay = -G - K * CD * v * vy + K * cl * v * (-sgn * vx);
    const px = x, py = y;
    vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt;
    peak = Math.max(peak, y);
    if (netClear === undefined && px < netX && x >= netX) netClear = py + ((y - py) * (netX - px)) / (x - px) - NET_STRAP;
    if (y <= R) {
      if (netClear === undefined) {
        // Landed before the net: report how far short of the net plane it would pass, as a height.
        return { netClear: -NET_STRAP - (netX - x) * 0.1, result: 'short', peak };
      }
      if (netClear < 0) return { netClear, result: 'net', peak };
      const depth = farBase - x;
      return { netClear, depth, result: depth >= -R ? 'in' : 'long', peak };
    }
    if (vx <= 0) break;
  }
  return { netClear: netClear ?? -NET_STRAP, result: netClear !== undefined && netClear < 0 ? 'net' : 'short', peak };
}

export function simulate(a: StrikeIn): Shot {
  const c = collide(a);
  const f = fly(c.vx, c.vy, c.omega, a.height, a.behind);
  return {
    speed: Math.hypot(c.vx, c.vy),
    launch: (Math.atan2(c.vy, c.vx) * 180) / Math.PI,
    rpm: (c.omega * 60) / (2 * Math.PI),
    square: c.square,
    ...f,
  };
}
