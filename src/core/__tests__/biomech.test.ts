import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_RULES, spinFromPath } from '../index';
import { FOREHAND, SERVE, synthesize } from './synthetic';

describe('biomechanics', () => {
  it('labels spin from the swing path', () => {
    expect(spinFromPath(-20)).toBe('slice');
    expect(spinFromPath(0)).toBe('flat');
    expect(spinFromPath(30)).toBe('topspin');
    expect(spinFromPath(undefined)).toBeUndefined();
  });
  it('adds body-power metrics and a spin to a forehand', () => {
    const [s] = analyze({ frames: synthesize(FOREHAND, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES }).strokes;
    expect(s.spin).toBeDefined();
    const c = s.metrics.contact!;
    expect(c.swingPath).toBeTypeOf('number');
    expect(c.chainSequence).toBeGreaterThanOrEqual(0);
    expect(c.chainSequence).toBeLessThanOrEqual(3);
    expect(s.metrics.backswing!.hipShoulderSep).toBeGreaterThanOrEqual(0);
    if (c.bodyPower !== undefined) expect(c.bodyPower).toBeGreaterThanOrEqual(0);
  });
  it('gives a serve leg drive but no groundstroke spin', () => {
    const [s] = analyze({ frames: synthesize(SERVE, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES }).strokes;
    expect(s.type).toBe('serve');
    expect(s.spin).toBeUndefined();
    expect(s.metrics.trophy?.hipShoulderSep).toBeTypeOf('number');
  });
});
