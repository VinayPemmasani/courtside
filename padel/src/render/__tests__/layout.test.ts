import { describe, expect, it } from 'vitest';
import { alongSegment, bodyDiscs, bodyHits, clearestBox, overlapArea, placeLabels, type Box, type Pt } from '../layout';

/** A standing stick figure in canvas pixels, centred at x = 500, from the head (y 300) to the feet (y 900). */
function figure(): (Pt | null)[] {
  const p: (Pt | null)[] = Array.from({ length: 33 }, () => null);
  const set = (i: number, x: number, y: number) => { p[i] = { x, y }; };
  set(0, 500, 300);
  set(11, 440, 380); set(12, 560, 380);
  set(13, 420, 500); set(14, 600, 480);
  set(15, 420, 600); set(16, 680, 500);
  set(23, 460, 600); set(24, 540, 600);
  set(25, 450, 750); set(26, 550, 750);
  set(27, 450, 900); set(28, 550, 900);
  return p;
}

const boxAt = (c: Pt, w: number, h: number): Box => ({ x: c.x - w / 2, y: c.y - h / 2, w, h });

describe('label placement', () => {
  const body = bodyDiscs(figure(), { dominantWrist: 16, dominantElbow: 14 });
  const bounds = { x: 0, y: 0, w: 1080, h: 1350 };

  it('covers the torso, limbs, head and racket', () => {
    expect(bodyHits(boxAt({ x: 500, y: 490 }, 10, 10), body)).toBeGreaterThan(0); // chest
    expect(bodyHits(boxAt({ x: 500, y: 300 }, 10, 10), body)).toBeGreaterThan(0); // head
    expect(bodyHits(boxAt({ x: 760, y: 520 }, 10, 10), body)).toBeGreaterThan(0); // racket past the wrist
    expect(bodyHits(boxAt({ x: 900, y: 1200 }, 10, 10), body)).toBe(0);
  });

  it('moves a label the coach left on the body into empty space nearby', () => {
    const anchor = { x: 560, y: 380 };
    const [spot] = placeLabels([{ anchor, w: 260, h: 44, preferred: { x: 500, y: 480 } }], { body, bounds });
    expect(bodyHits(boxAt(spot, 260, 44), body)).toBe(0);
    expect(Math.hypot(spot.x - anchor.x, spot.y - anchor.y)).toBeLessThan(500);
  });

  it('keeps a clear preferred spot as it is', () => {
    const preferred = { x: 860, y: 300 };
    const [spot] = placeLabels([{ anchor: { x: 560, y: 380 }, w: 200, h: 40, preferred }], { body, bounds });
    expect(spot.x).toBeCloseTo(preferred.x);
    expect(spot.y).toBeCloseTo(preferred.y);
  });

  it('keeps labels apart, inside the frame and out of a header', () => {
    const header = { x: 0, y: 0, w: 1080, h: 420 };
    const anchors = [{ x: 680, y: 500 }, { x: 680, y: 500 }, { x: 450, y: 750 }, { x: 500, y: 300 }];
    const spots = placeLabels(anchors.map((anchor) => ({ anchor, w: 300, h: 44 })), { body, bounds, taken: [header] });
    const boxes = spots.map((s) => boxAt(s, 300, 44));
    boxes.forEach((b, i) => {
      expect(bodyHits(b, body)).toBe(0);
      expect(overlapArea(b, header)).toBe(0);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(1080);
      for (let j = 0; j < i; j++) expect(overlapArea(b, boxes[j])).toBe(0);
    });
  });
});

describe('header placement', () => {
  it('chooses the band the player does not reach', () => {
    const body = alongSegment({ x: 500, y: 100 }, { x: 500, y: 700 }, 30); // reaches the top
    const top = { x: 0, y: 0, w: 1080, h: 400 };
    const bottom = { x: 0, y: 950, w: 1080, h: 400 };
    expect(clearestBox([top, bottom], body)).toEqual({ index: 1, hits: 0 });
    expect(clearestBox([top, bottom], alongSegment({ x: 500, y: 500 }, { x: 500, y: 900 }, 30)).index).toBe(0);
  });
});
