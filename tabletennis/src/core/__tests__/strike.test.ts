import { describe, expect, it } from 'vitest';
import { analyze, analyseStrike, driveShare, DEFAULT_RULES, FACE_TARGET, heightBand, stageFromPosition } from '../index';
import { FOREHAND, SERVE, synthesize } from './synthetic';

describe('strike lab', () => {
  it('splits a swing path into drive and lift', () => {
    expect(driveShare(0)).toBeCloseTo(100);
    expect(driveShare(45)).toBeCloseTo(50);
    expect(driveShare(18)).toBeGreaterThan(74);
    expect(driveShare(-10)).toBeCloseTo(100);
  });
  it('bands contact height against the net strap', () => {
    expect(heightBand(0.6)).toBe('low');
    expect(heightBand(0.95)).toBe('net');
    expect(heightBand(1.3)).toBe('high');
  });
  it('reads the bounce stage from court position', () => {
    expect(stageFromPosition(-1)).toBe('rising');
    expect(stageFromPosition(0.2)).toBe('peak');
    expect(stageFromPosition(1.2)).toBe('falling');
  });
  it('closes the face target on the rise and opens it on the drop', () => {
    expect(FACE_TARGET.rising.centre).toBeGreaterThan(0);
    expect(FACE_TARGET.peak.centre).toBe(0);
    expect(FACE_TARGET.falling.centre).toBeLessThan(0);
  });
  it('reads a forehand and honours the player-set stage', () => {
    const { strokes, prepared } = analyze({ frames: synthesize(FOREHAND, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES });
    const s = strokes[0];
    const base = { frames: prepared.frames, stroke: s, hand: 'right' as const, fps: 30, yaw: prepared.yaw, hipYaw: prepared.hipYaw! };
    const r = analyseStrike(base)!;
    expect(r.stage).toBe('falling');
    expect(r.stageSource).toBe('assumed');
    expect(r.checks.length).toBeGreaterThan(0);
    expect(r.headline.length).toBeGreaterThan(10);
    const set = analyseStrike({ ...base, stage: 'rising' })!;
    expect(set.stage).toBe('rising');
    expect(set.stageSource).toBe('set');
    expect(set.faceTarget).toBe(FACE_TARGET.rising);
  });
  it('skips serves', () => {
    const { strokes, prepared } = analyze({ frames: synthesize(SERVE, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES });
    expect(analyseStrike({ frames: prepared.frames, stroke: strokes[0], hand: 'right', fps: 30, yaw: prepared.yaw, hipYaw: prepared.hipYaw! })).toBeUndefined();
  });
});
