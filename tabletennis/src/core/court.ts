import type { PoseFrame, Vec2 } from './types';
import { COURT } from './scene';

/**
 * Table calibration and shot placement.
 *
 * The coach taps the four corners of the table top on a video frame once. That gives a homography
 * between the table surface and the image, so any tapped bounce can be read in table metres.
 *
 * Table coordinates (metres): x across the table, 0 on the centre line, positive to the hitter's
 * right; y along the table, 0 on the hitter's end line and 2.74 on the far end line.
 */

/** Singles and doubles play on the same surface; doubles serves must cross from right half to right half. */
export type Lines = 'singles' | 'doubles';

export interface CourtCalibration {
  /**
   * Image points (0..1 of the frame) of the table corners, in this order:
   * hitter's end left, hitter's end right, far end right, far end left.
   */
  corners: Vec2[];
  lines?: Lines;
}

export interface Bounce {
  id: string;
  /** Frame index in the session where the ball lands. */
  frame: number;
  /** Image point (0..1 of the frame). */
  u: number;
  v: number;
  /** Stroke that sent the ball, when one is close before the bounce. */
  strokeId?: string;
  /** Set when the coach marks the bounce as a serve; otherwise taken from the stroke type. */
  serve?: boolean;
}

export const HALF = COURT.length / 2;
const SINGLES_HALF = COURT.singles / 2;
const DOUBLES_HALF = COURT.doubles / 2;
/** A ball landing within 0.45 m of the net would bounce twice on the far side: short. */
const SHORT_TO = HALF + 0.45;
/** Last 0.3 m before the far end line counts as long (deep). */
const DEEP_FROM = COURT.length - 0.3;

/** Table points that match `CourtCalibration.corners`. */
export const CORNER_POINTS: Vec2[] = [
  { x: -SINGLES_HALF, y: 0 },
  { x: SINGLES_HALF, y: 0 },
  { x: SINGLES_HALF, y: COURT.length },
  { x: -SINGLES_HALF, y: COURT.length },
];

export const CORNER_HINTS = [
  "Left corner of the hitter's end of the table",
  "Right corner of the hitter's end of the table",
  'Right corner of the far end',
  'Left corner of the far end',
];

/** 3×3 matrix, row-major. */
export type Homography = number[];

/** Solves the 8 unknowns of a homography mapping `from[i]` to `to[i]` (four points). */
export function solveHomography(from: Vec2[], to: Vec2[]): Homography | null {
  if (from.length !== 4 || to.length !== 4) return null;
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8×9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j < 9; j++) A[r][j] -= k * A[c][j];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function applyHomography(H: Homography, p: Vec2): Vec2 | null {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

/** Image ↔ court mappings from a calibration (image points in 0..1 of the frame). */
export interface CourtMap {
  toCourt: (img: Vec2) => Vec2 | null;
  toImage: (court: Vec2) => Vec2 | null;
}

export function courtMap(cal: CourtCalibration): CourtMap | null {
  if (cal.corners.length !== 4) return null;
  const toC = solveHomography(cal.corners, CORNER_POINTS);
  const toI = solveHomography(CORNER_POINTS, cal.corners);
  if (!toC || !toI) return null;
  return { toCourt: (p) => applyHomography(toC, p), toImage: (p) => applyHomography(toI, p) };
}

/** Table lines as segments in table metres, for drawing the calibration over the video. */
export function courtLines(lines: Lines = 'singles'): [Vec2, Vec2][] {
  const L = COURT.length;
  const segs: [Vec2, Vec2][] = [
    [{ x: -SINGLES_HALF, y: 0 }, { x: -SINGLES_HALF, y: L }],
    [{ x: SINGLES_HALF, y: 0 }, { x: SINGLES_HALF, y: L }],
    [{ x: -SINGLES_HALF, y: 0 }, { x: SINGLES_HALF, y: 0 }],
    [{ x: -SINGLES_HALF, y: L }, { x: SINGLES_HALF, y: L }],
    [{ x: -SINGLES_HALF - 0.15, y: HALF }, { x: SINGLES_HALF + 0.15, y: HALF }],
    [{ x: 0, y: 0 }, { x: 0, y: L }],
  ];
  return lines === 'doubles' ? segs : segs.slice(0, 5);
}

export type Depth = 'short' | 'mid' | 'deep';
export type Direction = 'left' | 'middle' | 'right';

export interface BounceCall {
  /** Table position in metres. */
  at: Vec2;
  /** On the far half of the table (an edge ball counts). */
  inside: boolean;
  /** Distance to the nearest edge that decides the call, metres (how far in or out). */
  margin: number;
  /** Which edge decided the call. */
  line: 'end line' | 'side line' | 'net side';
  depth: Depth;
  direction: Direction;
  serve: boolean;
}

/** A ball (40 mm) touching the edge is good: an edge ball. So a bounce counts up to its radius past the edge. */
export const BALL_RADIUS = 0.02;

/**
 * The call for one bounce on the far half. Short balls would bounce twice on the opponent's side,
 * long ones land in the last 30 cm before the end line.
 */
export function callBounce(at: Vec2, opts: { serve?: boolean; lines?: Lines } = {}): BounceCall {
  const serve = !!opts.serve;
  const half = opts.lines === 'doubles' ? DOUBLES_HALF : SINGLES_HALF;
  const side = half - Math.abs(at.x);
  const length = COURT.length - at.y;
  const net = at.y - HALF;
  const checks: [number, BounceCall['line']][] = [[side, 'side line'], [length, 'end line'], [net, 'net side']];
  const worst = checks.reduce((a, b) => (b[0] < a[0] ? b : a));
  const inside = worst[0] >= -BALL_RADIUS;
  const depth: Depth = at.y < SHORT_TO ? 'short' : at.y < DEEP_FROM ? 'mid' : 'deep';
  // Seen from the hitter, facing the far end: their left is −x.
  const third = COURT.singles / 6;
  const direction: Direction = at.x < -third ? 'left' : at.x > third ? 'right' : 'middle';
  return { at, inside, margin: Math.abs(worst[0]), line: worst[1], depth, direction, serve };
}

/** The stroke that most likely sent a ball bouncing at `frame`: the last contact within `maxGap` seconds before it. */
export function strokeForBounce<T extends { id: string; contactFrame: number }>(strokes: T[], frame: number, fps: number, maxGap = 1): T | undefined {
  return strokes
    .filter((s) => s.contactFrame < frame && (frame - s.contactFrame) / fps <= maxGap)
    .sort((a, b) => b.contactFrame - a.contactFrame)[0];
}

/** The point on the ground between the player's feet, in image coordinates. */
export function feetPoint(f: PoseFrame | undefined): Vec2 | null {
  const im = f?.image;
  if (!im) return null;
  const a = im[27];
  const b = im[28];
  if (!a || !b || a.v < 0.3 || b.v < 0.3) return null;
  return { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) };
}

/**
 * Average ball speed from contact to bounce, km/h. The feet are on the floor, not on the table
 * surface the calibration maps, so contact is taken half a metre behind the hitter's end line, in
 * line with the hitting hand where it can be mapped, otherwise the middle. It reads a little low
 * because the real flight arcs; it is a fair number for comparing shots.
 */
export function shotSpeed(map: CourtMap, frames: PoseFrame[], contactFrame: number, bounce: { frame: number; at: Vec2 }, fps: number): number | null {
  const dt = (bounce.frame - contactFrame) / fps;
  if (dt <= 0.03) return null;
  const feet = feetPoint(frames[contactFrame]);
  const fx = feet && map.toCourt(feet);
  const from = { x: fx && Math.abs(fx.x) < 2 ? fx.x : 0, y: -0.5 };
  const d = Math.hypot(bounce.at.x - from.x, bounce.at.y - from.y);
  const kmh = (d / dt) * 3.6;
  return kmh > 3 && kmh < 160 ? kmh : null;
}

export interface PlacementSummary {
  total: number;
  inside: number;
  deep: number;
  avgSpeed: number | null;
  byDirection: Record<Direction, number>;
}

export function summarisePlacement(calls: (BounceCall & { speed?: number | null })[]): PlacementSummary {
  const speeds = calls.map((c) => c.speed).filter((s): s is number => typeof s === 'number');
  const byDirection: Record<Direction, number> = { left: 0, middle: 0, right: 0 };
  for (const c of calls) byDirection[c.direction]++;
  return {
    total: calls.length,
    inside: calls.filter((c) => c.inside).length,
    deep: calls.filter((c) => c.inside && c.depth === 'deep').length,
    avgSpeed: speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null,
    byDirection,
  };
}
