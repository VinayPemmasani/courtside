import { describe, expect, it } from 'vitest';
import { applyRules, DEFAULT_RULES, ruleForStage, strokeStage, type Stroke } from '../index';

const rule = (id: string) => DEFAULT_RULES.find((r) => r.id === id)!;

describe('body-position targets by ball timing', () => {
  it('keeps the usual targets at the peak or with no timing', () => {
    expect(ruleForStage(rule('fh-full-turn'), undefined).max).toBe(110);
    expect(ruleForStage(rule('fh-full-turn'), 'peak').max).toBe(110);
  });
  it('asks for a compact backswing and contact further in front on an early, rising ball', () => {
    expect(ruleForStage(rule('fh-full-turn'), 'rising').max).toBe(80);
    expect(ruleForStage(rule('fh-contact-front'), 'rising').min!).toBeGreaterThan(rule('fh-contact-front').min!);
  });
  it('asks for a bigger turn and deeper knees on a late, falling ball', () => {
    expect(ruleForStage(rule('fh-knees'), 'falling').max!).toBeLessThan(rule('fh-knees').max!);
    expect(ruleForStage(rule('fh-full-turn'), 'falling').min!).toBeGreaterThan(rule('fh-full-turn').min!);
  });
  it('a set timing wins over the ball reading, and key points carry the stage', () => {
    const reading = { stage: 'falling' } as never;
    expect(strokeStage({ strikeStage: 'rising', ballRead: { contact: 1, reading } })).toBe('rising');
    expect(strokeStage({ ballRead: { contact: 1, reading } })).toBe('falling');
    const stroke = {
      id: 's', type: 'forehand', startFrame: 0, endFrame: 10, contactFrame: 5, peakSpeed: 1,
      phases: [{ id: 'backswing', index: 3, label: 'Backswing', frame: 3 }], keyPoints: [], callouts: [],
      metrics: { backswing: { shoulderTurn: 95 } }, strikeStage: 'rising',
    } as unknown as Stroke;
    const kp = applyRules(stroke, DEFAULT_RULES, 'right').keyPoints.find((k) => k.ruleId === 'fh-full-turn')!;
    expect(kp.status).toBe('fix');
    expect(kp.stage).toBe('rising');
    expect(kp.text).toMatch(/shorten the backswing/);
    const same = applyRules({ ...stroke, strikeStage: 'peak' }, DEFAULT_RULES, 'right').keyPoints.find((k) => k.ruleId === 'fh-full-turn')!;
    expect(same.status).toBe('good');
  });
});
