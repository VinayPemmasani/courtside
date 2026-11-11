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

describe('diagnose', () => {
  it('reads contact timing, path and a practice focus for a forehand', async () => {
    const { contactTiming, pathVsFace, practiceFocus, forwardSwingStart, forwardSwingEnd, chainCurves, prepare } = await import('../index');
    const frames = synthesize(FOREHAND, 30);
    const { strokes, prepared } = analyze({ frames, fps: 30, hand: 'right', rules: DEFAULT_RULES });
    const s = strokes[0];
    const t = contactTiming(s, DEFAULT_RULES, 'right');
    expect(t && ['early', 'on time', 'late']).toContain(t!.timing);
    expect(pathVsFace(s)?.summary).toMatch(/racket travels/);
    const f = practiceFocus(s);
    expect(f.drill.length).toBeGreaterThan(10);
    expect(forwardSwingStart(s)).toBeLessThan(forwardSwingEnd(s));
    expect(s.metrics['unit-turn']?.prepLead).toBeGreaterThan(0);
    const c = chainCurves(prepared.frames, s, 'right', 30, prepared.yaw, prepared.hipYaw!);
    expect(c.links.map((l) => l.id)).toEqual(['hips', 'trunk', 'elbow', 'hand']);
    expect(c.links[0].values.length).toBe(c.to - c.from + 1);
    expect(prepare).toBeTypeOf('function');
  });
  it('labels late and early contact from the rule range', async () => {
    const { contactTiming } = await import('../index');
    const base = analyze({ frames: synthesize(FOREHAND, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES }).strokes[0];
    const at = (v: number) => contactTiming({ ...base, type: 'forehand', metrics: { ...base.metrics, contact: { ...base.metrics.contact, contactForward: v } } }, DEFAULT_RULES, 'right')!;
    expect(at(0.0).timing).toBe('late');
    expect(at(0.0).hint).toMatch(/to the right/);
    expect(at(0.4).timing).toBe('on time');
    expect(at(1.0).timing).toBe('early');
    expect(at(1.0).hint).toMatch(/to the left/);
  });
  it('gives no groundstroke reading for a serve', async () => {
    const { contactTiming, pathVsFace } = await import('../index');
    const [s] = analyze({ frames: synthesize(SERVE, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES }).strokes;
    expect(contactTiming(s, DEFAULT_RULES, 'right')).toBeUndefined();
    expect(pathVsFace(s)).toBeUndefined();
  });
});
