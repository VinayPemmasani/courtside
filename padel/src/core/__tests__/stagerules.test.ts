import { describe, expect, it } from 'vitest';
import { applyRules, DEFAULT_RULES, ruleForStage, strokeStage, type Stroke } from '../index';

const rule = (id: string) => DEFAULT_RULES.find((r) => r.id === id)!;

describe('body-position targets by ball timing', () => {
  it('keeps the usual targets at the peak or with no timing', () => {
    expect(ruleForStage(rule('fh-compact'), undefined).max).toBe(110);
    expect(ruleForStage(rule('fh-compact'), 'peak').max).toBe(110);
  });
  it('asks for a compact backswing, earlier turn and contact further in front on a rising ball', () => {
    expect(ruleForStage(rule('fh-compact'), 'rising').max).toBe(90);
    expect(ruleForStage(rule('gs-prep'), 'rising').min!).toBeGreaterThan(rule('gs-prep').min!);
    expect(ruleForStage(rule('fh-contact-front'), 'rising').min!).toBeGreaterThan(rule('fh-contact-front').min!);
  });
  it('asks for deeper knees and more weight transfer on a falling ball', () => {
    expect(ruleForStage(rule('fh-knees'), 'falling').max!).toBeLessThan(rule('fh-knees').max!);
    expect(ruleForStage(rule('gs-weight'), 'falling').min!).toBeGreaterThan(rule('gs-weight').min!);
  });
  it('a set timing wins over the ball reading, and key points carry the stage', () => {
    const reading = { stage: 'falling' } as never;
    expect(strokeStage({ strikeStage: 'rising', ballRead: { contact: 1, reading } })).toBe('rising');
    expect(strokeStage({ ballRead: { contact: 1, reading } })).toBe('falling');
    const stroke = {
      id: 's', type: 'forehand', startFrame: 0, endFrame: 10, contactFrame: 5, peakSpeed: 1,
      phases: [{ id: 'backswing', index: 3, label: 'Backswing', frame: 3 }], keyPoints: [], callouts: [],
      metrics: { backswing: { shoulderTurn: 100 } }, strikeStage: 'rising',
    } as unknown as Stroke;
    const kp = applyRules(stroke, DEFAULT_RULES, 'right').keyPoints.find((k) => k.ruleId === 'fh-compact')!;
    expect(kp.status).toBe('fix');
    expect(kp.stage).toBe('rising');
    expect(kp.text).toMatch(/shorten the backswing/);
    const same = applyRules({ ...stroke, strikeStage: 'peak' }, DEFAULT_RULES, 'right').keyPoints.find((k) => k.ruleId === 'fh-compact')!;
    expect(same.status).toBe('good');
  });
});
