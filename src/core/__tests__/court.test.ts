import { describe, expect, it } from 'vitest';
import {
  applyHomography, callBounce, CORNER_POINTS, courtMap, HALF, LANDMARK_COUNT, checkSetup, shotSpeed, solveHomography, strokeForBounce, summarisePlacement,
  type PoseFrame, type Vec2,
} from '../index';
import { FOREHAND, synthesize } from './synthetic';

/** A camera behind the hitter's baseline: a perspective view where the far court shrinks. */
const project = (p: Vec2): Vec2 => {
  const depth = p.y + 6; // metres from the camera
  return { x: 0.5 + (p.x * 0.9) / depth, y: 0.2 + 2.4 / depth };
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
    for (const p of [{ x: 1.2, y: 20 }, { x: -3, y: 14 }, { x: 0, y: 3 }]) {
      const back = map.toCourt(project(p))!;
      expect(back.x).toBeCloseTo(p.x, 4);
      expect(back.y).toBeCloseTo(p.y, 4);
    }
  });
  it('rejects a degenerate calibration', () => {
    expect(courtMap({ corners: [corners[0], corners[0], corners[0], corners[0]] })).toBeNull();
  });
});

describe('line calls', () => {
  it('calls a deep ball in and a long ball out with the margin', () => {
    const deep = callBounce({ x: 1, y: 22.5 });
    expect(deep.inside).toBe(true);
    expect(deep.depth).toBe('deep');
    const long = callBounce({ x: 1, y: 24.07 });
    expect(long.inside).toBe(false);
    expect(long.line).toBe('baseline');
    expect(long.margin).toBeCloseTo(0.3, 2);
  });
  it('counts a ball touching the line as in', () => {
    expect(callBounce({ x: 4.115 + 0.02, y: 18 }).inside).toBe(true);
  });
  it('uses the doubles alleys only when asked', () => {
    expect(callBounce({ x: 5, y: 18 }).inside).toBe(false);
    expect(callBounce({ x: 5, y: 18 }, { lines: 'doubles' }).inside).toBe(true);
  });
  it('checks serves against the service boxes', () => {
    expect(callBounce({ x: 2, y: 17 }, { serve: true }).inside).toBe(true);
    const long = callBounce({ x: 2, y: 19 }, { serve: true });
    expect(long.inside).toBe(false);
    expect(long.line).toBe('service line');
  });
  it('calls a ball in the net-side half out', () => {
    expect(callBounce({ x: 0, y: HALF - 1 }).inside).toBe(false);
  });
  it('sorts direction from the hitter’s view', () => {
    expect(callBounce({ x: -3, y: 20 }).direction).toBe('left');
    expect(callBounce({ x: 0, y: 20 }).direction).toBe('middle');
    expect(callBounce({ x: 3, y: 20 }).direction).toBe('right');
  });
});

describe('shot speed and summary', () => {
  it('links a bounce to the last contact before it', () => {
    const strokes = [{ id: 'a', contactFrame: 10 }, { id: 'b', contactFrame: 100 }];
    expect(strokeForBounce(strokes, 130, 30)?.id).toBe('b');
    expect(strokeForBounce(strokes, 400, 30)).toBeUndefined();
  });
  it('measures speed from the feet at contact to the bounce', () => {
    const map = courtMap({ corners })!;
    const feet = project({ x: 0, y: -0.5 });
    const image = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, v: 1 }));
    image[27] = { x: feet.x - 0.01, y: feet.y, v: 1 };
    image[28] = { x: feet.x + 0.01, y: feet.y, v: 1 };
    const frames: PoseFrame[] = [{ t: 0, image, world: null }];
    // 22 m in 0.8 s = 99 km/h
    const kmh = shotSpeed(map, frames, 0, { frame: 24, at: { x: 0, y: 21.5 } }, 30)!;
    expect(kmh).toBeGreaterThan(95);
    expect(kmh).toBeLessThan(103);
  });
  it('summarises in-rate, depth and direction', () => {
    const s = summarisePlacement([callBounce({ x: 1, y: 22.5 }), callBounce({ x: -3, y: 19 }), callBounce({ x: 0, y: 25 })]);
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
