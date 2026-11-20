import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_RULES, strokeBreakdown, formatReading } from '../index';
import { FOREHAND, SMASH, synthesize } from './synthetic';

describe('strokeBreakdown', () => {
  it('cuts a forehand into four ordered chapters with readings', () => {
    const { prepared, strokes } = analyze({ frames: synthesize(FOREHAND, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES });
    const b = strokeBreakdown(prepared, strokes[0]);
    expect(b.chapters.map((c) => c.id)).toEqual(['coil', 'swing', 'contact', 'finish']);
    for (let k = 1; k < 4; k++) expect(b.chapters[k].frame).toBeGreaterThanOrEqual(b.chapters[k - 1].frame);
    for (const c of b.chapters) { expect(c.from).toBeLessThanOrEqual(c.frame); expect(c.beats.length).toBeGreaterThan(0); }
    const coil = b.chapters[0].readings.find((r) => r.id === 'shoulderTurn');
    expect(coil!.value).toBeGreaterThan(40);
    expect(b.chapters[2].readings.some((r) => r.id === 'contactForward')).toBe(true);
    expect(b.chapters[1].readings.find((r) => r.id === 'drop')?.source).toBe('estimated');
    console.log(JSON.stringify(b.chapters.map((c) => [c.title, c.frame, c.readings.map((r) => `${r.label} ${formatReading(r)} ${r.source[0]}`), c.beats.map((x) => x.text)]), null, 1), b.chain);
  });
  it('handles an overhead', () => {
    const { prepared, strokes } = analyze({ frames: synthesize(SMASH, 30), fps: 30, hand: 'right', rules: DEFAULT_RULES });
    const b = strokeBreakdown(prepared, strokes[0]);
    expect(b.chapters[0].title).toBe('Paddle up');
  });
});
