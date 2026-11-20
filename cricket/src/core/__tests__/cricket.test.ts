import { describe, expect, it } from 'vitest';
import { analyze, BATTING_PHASES, BOWLING_PHASES, DEFAULT_RULES, practiceFocus, retypeStroke, strokeAt } from '..';
import { syntheticDelivery, syntheticDrive } from './synthetic';

const FPS = 60;

describe('batting', () => {
  const { prepared, strokes } = analyze({ frames: syntheticDrive(FPS), fps: FPS, hand: 'right', discipline: 'batting', rules: DEFAULT_RULES });

  it('finds one shot near the impact and calls it a drive', () => {
    expect(strokes).toHaveLength(1);
    const s = strokes[0];
    expect(Math.abs(s.contactFrame / FPS - 1.35)).toBeLessThan(0.15);
    expect(s.type).toBe('drive');
  });

  it('splits the shot into the six batting phases, in order', () => {
    const s = strokes[0];
    expect(s.phases.map((p) => p.id)).toEqual(BATTING_PHASES);
    const frames = s.phases.map((p) => p.frame);
    expect([...frames].sort((a, b) => a - b)).toEqual(frames);
    const at = (id: string) => s.phases.find((p) => p.id === id)!.frame / FPS;
    expect(Math.abs(at('backlift') - 1.1)).toBeLessThan(0.12);
    expect(at('follow-through')).toBeGreaterThan(at('impact'));
  });

  it('measures stride, head position and backlift', () => {
    const m = strokes[0].metrics;
    expect(m.impact?.strideLength).toBeGreaterThan(0.7);
    expect(m.impact?.headOverFront).toBeGreaterThan(-0.05);
    expect(m.backlift?.backliftHeight).toBeGreaterThan(-0.15);
    expect(m.impact?.batSpeed).toBeGreaterThan(2);
  });

  it('writes key points from the rules', () => {
    const s = strokes[0];
    expect(s.keyPoints.length).toBeGreaterThan(4);
    expect(s.keyPoints.some((k) => k.ruleId === 'fwd-stride' && k.status === 'good')).toBe(true);
    expect(practiceFocus(s).title.length).toBeGreaterThan(5);
  });

  it('keeps a hand-marked shot and lets a coach relabel it', () => {
    const marked = strokeAt(prepared, Math.round(1.4 * FPS), DEFAULT_RULES);
    expect(marked.phases).toHaveLength(6);
    const pull = retypeStroke(prepared, marked, 'pull', DEFAULT_RULES);
    expect(pull.type).toBe('pull');
    expect(pull.typeLocked).toBe(true);
    expect(pull.keyPoints.some((k) => k.ruleId === 'pull-turn')).toBe(true);
  });
});

describe('bowling', () => {
  const run = (bend = 0, collapse = 0) => analyze({ frames: syntheticDelivery(FPS, 2.4, bend, collapse), fps: FPS, hand: 'right', discipline: 'bowling', rules: DEFAULT_RULES });

  it('finds the delivery, its release and the six bowling phases', () => {
    const { strokes } = run();
    expect(strokes).toHaveLength(1);
    const s = strokes[0];
    expect(['pace', 'spin']).toContain(s.type);
    expect(s.phases.map((p) => p.id)).toEqual(BOWLING_PHASES);
    const at = (id: string) => s.phases.find((p) => p.id === id)!.frame / FPS;
    expect(Math.abs(at('release') - 1.42)).toBeLessThan(0.1);
    expect(Math.abs(at('front-foot') - 1.25)).toBeLessThan(0.1);
    expect(at('back-foot')).toBeLessThan(at('front-foot'));
    expect(Math.abs(at('gather') - 0.8)).toBeLessThan(0.2);
  });

  it('reads a straight arm as legal and a straightening elbow as over 15°', () => {
    const legal = run(0).strokes[0];
    expect(legal.metrics.release?.elbowExtension).toBeLessThan(8);
    expect(legal.keyPoints.find((k) => k.ruleId === 'bowl-elbow')?.status).toBe('good');
    const bent = run(35).strokes[0];
    expect(bent.metrics.release?.elbowExtension).toBeGreaterThan(15);
    expect(bent.keyPoints.find((k) => k.ruleId === 'bowl-elbow')?.status).toBe('fix');
  });

  it('measures release height, arm angle and front-knee bracing', () => {
    const braced = run().strokes[0];
    expect(braced.metrics.release?.releaseHeight).toBeGreaterThan(0.2);
    expect(braced.metrics.release?.armFromVertical).toBeLessThan(35);
    expect(braced.metrics.release?.frontKneeFlex).toBeLessThan(15);
    const collapsing = run(0, 0.3).strokes[0];
    expect(collapsing.metrics.release?.frontKneeFlex).toBeGreaterThan(15);
  });
});
