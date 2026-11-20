import { describe, expect, it } from 'vitest';
import {
  applyHomography, callBounce, CORNER_POINTS, courtMap, HALF, LANDMARK_COUNT, checkSetup, shotSpeed, solveHomography, strokeForBounce, summarisePlacement,
  type PoseFrame, type Vec2,
} from '../index';
import { FOREHAND, synthesize } from './synthetic';

/** A camera behind the hitter, above the table: a perspective view where the far end shrinks. */
const project = (p: Vec2): Vec2 => {
  const depth = p.y + 2.5; // metres from the camera
  return { x: 0.5 + (p.x * 0.9) / depth, y: 0.1 + 1.6 / depth };
};
const corners = CORNER_POINTS.map(project);

describe('court calibration', () => {
  it('solves a homography that maps the corners exactly', () => {
    const H = solveHomography(CORNER_POINTS, corners)!;
    for (let i = 0; i < 4; i++) {
      const q = applyHomography(H, CORNER_POINTS[i])!;
      expect(q.x).toBeCloseTo(corners[i].x, 6);
      expect(q.y).toBeCloseTo(corners[i].y, 6);
    }
  });
  it('reads any image point back in court metres', () => {
    const map = courtMap({ corners })!;
    for (const p of [{ x: 0.5, y: 2.2 }, { x: -0.6, y: 1.6 }, { x: 0, y: 0.4 }]) {
      const back = map.toCourt(project(p))!;
      expect(back.x).toBeCloseTo(p.x, 4);
      expect(back.y).toBeCloseTo(p.y, 4);
    }
  });
  it('rejects a degenerate calibration', () => {
    expect(courtMap({ corners: [corners[0], corners[0], corners[0], corners[0]] })).toBeNull();
  });
});

describe('table calls', () => {
  it('calls a long ball on and a ball past the end line off, with the margin', () => {
    const deep = callBounce({ x: 0.3, y: 2.6 });
    expect(deep.inside).toBe(true);
    expect(deep.depth).toBe('deep');
    const long = callBounce({ x: 0.3, y: 2.84 });
    expect(long.inside).toBe(false);
    expect(long.line).toBe('end line');
    expect(long.margin).toBeCloseTo(0.1, 2);
  });
  it('counts an edge ball as on', () => {
    expect(callBounce({ x: 0.7625 + 0.015, y: 2.0 }).inside).toBe(true);
    expect(callBounce({ x: 0.7625 + 0.05, y: 2.0 }).inside).toBe(false);
  });
  it('sorts short balls that would bounce twice', () => {
    expect(callBounce({ x: 0, y: 1.6 }).depth).toBe('short');
    expect(callBounce({ x: 0, y: 2.1 }).depth).toBe('mid');
  });
  it('calls a ball on the hitter\'s own half off', () => {
    expect(callBounce({ x: 0, y: HALF - 0.3 }).inside).toBe(false);
  });
  it('sorts direction from the hitter’s view', () => {
    expect(callBounce({ x: -0.6, y: 2 }).direction).toBe('left');
    expect(callBounce({ x: 0, y: 2 }).direction).toBe('middle');
    expect(callBounce({ x: 0.6, y: 2 }).direction).toBe('right');
  });
});

describe('shot speed and summary', () => {
  it('links a bounce to the last contact before it', () => {
    const strokes = [{ id: 'a', contactFrame: 10 }, { id: 'b', contactFrame: 100 }];
    expect(strokeForBounce(strokes, 115, 30)?.id).toBe('b');
    expect(strokeForBounce(strokes, 200, 30)).toBeUndefined();
  });
  it('measures speed from half a metre behind the end line to the bounce', () => {
    const map = courtMap({ corners })!;
    const frames: PoseFrame[] = [{ t: 0, image: Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, v: 0 })), world: null }];
    // 3 m in 0.3 s = 36 km/h
    const kmh = shotSpeed(map, frames, 0, { frame: 9, at: { x: 0, y: 2.5 } }, 30)!;
    expect(kmh).toBeGreaterThan(34);
    expect(kmh).toBeLessThan(38);
  });
  it('summarises on-table rate, length and direction', () => {
    const s = summarisePlacement([callBounce({ x: 0.1, y: 2.6 }), callBounce({ x: -0.6, y: 2.0 }), callBounce({ x: 0, y: 3.0 })]);
    expect(s).toMatchObject({ total: 3, inside: 2, deep: 1, byDirection: { left: 1, middle: 2, right: 0 } });
  });
});

describe('setup check', () => {
  it('passes a clean 60 fps clip', () => {
    const r = checkSetup(synthesize(FOREHAND, 60), 60);
    expect(r.issues.map((i) => i.id)).toEqual([]);
    expect(r.score).toBe(100);
  });
  it('flags a low frame rate and a player who leaves the picture', () => {
    const frames = synthesize(FOREHAND, 30).map((f, i) => (i % 2 ? { ...f, image: f.image!.map((p, j) => (j === 27 || j === 28 ? { ...p, y: 1.05 } : p)) } : f));
    const r = checkSetup(frames, 30);
    expect(r.issues.map((i) => i.id)).toEqual(expect.arrayContaining(['low-fps', 'cut-off']));
    expect(r.score).toBeLessThan(80);
  });
  it('flags a player who is too small and frames with nobody found', () => {
    const frames = synthesize(FOREHAND, 60).map((f, i) => ({
      ...f,
      image: i % 3 === 0 ? null : f.image!.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * 0.3, y: 0.5 + (p.y - 0.5) * 0.3 })),
    }));
    const ids = checkSetup(frames, 60).issues.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['too-small', 'not-found']));
  });
});
