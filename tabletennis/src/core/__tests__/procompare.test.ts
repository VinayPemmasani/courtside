// The synthetic clip draws 0.3 of the frame per metre on both axes, so a square video keeps pixels square.
import { describe, expect, it } from 'vitest';
import { alignFrame, analyze, DEFAULT_RULES, liveDiff, metricDiffs, mirrorWorld, prepare, proOverlay, rankPros, type PoseFrame, type ProRef } from '../index';
import { FOREHAND, SERVE, synthesize } from './synthetic';

const fps = 30;
function build(frames: PoseFrame[], hand: 'right' | 'left' = 'right') {
  const { prepared, strokes } = analyze({ frames, fps, hand, rules: DEFAULT_RULES });
  return { frames: prepared.frames, stroke: strokes[0], hand };
}
const asRef = (u: ReturnType<typeof build>, player = 'Ref'): ProRef => ({ key: player, player, hand: u.hand, fps, frames: u.frames, stroke: u.stroke });

describe('pro compare', () => {
  const fh = build(synthesize(FOREHAND, fps));
  const sv = build(synthesize(SERVE, fps));

  it('maps phases onto phases', () => {
    for (const p of fh.stroke.phases) expect(alignFrame(fh.stroke, fh.stroke, p.frame)).toBe(p.frame);
  });

  it('ranks the same swing as a perfect match and ignores other shot types', () => {
    const r = rankPros(fh, [asRef(sv, 'Server'), asRef(fh, 'Twin')]);
    expect(r).toHaveLength(1);
    expect(r[0].ref.player).toBe('Twin');
    expect(r[0].similarity).toBe(100);
  });

  it('matches a left-hander to a right-hander by mirroring', () => {
    const lefty = build(synthesize(FOREHAND, fps, 'left'), 'left');
    const [m] = rankPros(fh, [asRef(lefty, 'Lefty')]);
    expect(m.similarity).toBeGreaterThan(90);
  });

  it('mirroring twice gives the same pose', () => {
    const w = fh.frames[10].world!;
    const back = mirrorWorld(mirrorWorld(w));
    back.forEach((p, i) => expect(p.x).toBeCloseTo(w[i].x));
  });

  it('draws the reference on top of the user when they swing the same', () => {
    const i = fh.stroke.contactFrame;
    const o = proOverlay(fh, asRef(fh), i, 1000, 1000)!;
    expect(o).not.toBeNull();
    for (const j of [11, 12, 14, 16, 24, 26]) {
      expect(Math.abs(o.image[j].x - fh.frames[i].image![j].x) * 1000).toBeLessThan(6);
      expect(Math.abs(o.image[j].y - fh.frames[i].image![j].y) * 1000).toBeLessThan(6);
    }
    const d = liveDiff(fh.frames[i].world!, 'right', o.world);
    for (const row of d) expect(Math.abs(row.delta)).toBeLessThan(2);
  });

  it('lists metric differences biggest first', () => {
    const changed = { ...fh.stroke, metrics: { ...fh.stroke.metrics, contact: { ...fh.stroke.metrics.contact, elbowAngle: (fh.stroke.metrics.contact?.elbowAngle ?? 120) - 40 } } };
    const d = metricDiffs(changed, fh.stroke);
    expect(d[0].metric).toBe('elbowAngle');
    expect(d[0].delta).toBeCloseTo(-40);
    void prepare;
  });
});
