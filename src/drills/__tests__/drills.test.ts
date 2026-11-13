import { describe, expect, it } from 'vitest';
import { Animation } from '../body';
import { drillsFor, topicFor, TOPICS } from '../catalog';
import { DEFAULT_RULES } from '../../core/rules';

describe('drills', () => {
  it('every coaching rule with a fix has drills', () => {
    for (const r of DEFAULT_RULES) {
      const t = topicFor(r.id, r.metric, r.strokes[0]);
      expect(t, r.id).toBeTruthy();
      expect(drillsFor(t!, r.strokes[0]).length, r.id).toBeGreaterThan(0);
    }
  });

  it('every topic has on-court and off-court work', () => {
    for (const t of TOPICS) {
      expect(t.drills.some((d) => d.where === 'on-court'), t.id).toBe(true);
    }
    expect(TOPICS.filter((t) => t.drills.some((d) => d.where === 'off-court')).length).toBeGreaterThanOrEqual(TOPICS.length - 1);
  });

  it('every drill animates with sane limbs for both hands', () => {
    for (const t of TOPICS) for (const s of t.strokes) for (const { drill } of drillsFor(t, s)) {
      const m = drill.motion(s);
      expect(m.stills.length, drill.id).toBeGreaterThan(1);
      for (const hand of ['right', 'left'] as const) {
        const a = new Animation(m, hand);
        for (let x = 0; x <= a.duration; x += 0.1) {
          const f = a.at(x);
          for (const p of f.pts) expect(Number.isFinite(p.x + p.y + p.z), `${drill.id} ${x}`).toBe(true);
          // Upper arm keeps its length; feet never go below the court.
          const d = Math.hypot(f.pts[12].x - f.pts[14].x, f.pts[12].y - f.pts[14].y, f.pts[12].z - f.pts[14].z);
          expect(d).toBeCloseTo(0.29, 2);
          expect(Math.min(f.pts[29].y, f.pts[30].y, f.pts[31].y, f.pts[32].y)).toBeGreaterThan(-0.02);
        }
      }
    }
  });

  it('left-handers are the mirror image', () => {
    const m = TOPICS[0].drills[0].motion('forehand');
    const r = new Animation(m, 'right').at(1).pts;
    const l = new Animation(m, 'left').at(1).pts;
    expect(l[15].y).toBeCloseTo(r[16].y, 5);
  });
});
