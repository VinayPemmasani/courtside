import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_RULES, strokeSpace, toCourt, type PoseFrame } from '../index';
import { FOREHAND, synthesize } from './synthetic';

/** Tilt every world point as a camera pitched down by `deg` would see it. */
function tilt(frames: PoseFrame[], deg: number): PoseFrame[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return frames.map((f) => ({ ...f, world: f.world!.map((p) => ({ x: p.x, y: c * p.y - s * p.z, z: s * p.y + c * p.z })) }));
}

describe('studio levelling', () => {
  it('stands a player filmed by a tilted camera upright on the court', () => {
    const frames = tilt(synthesize(FOREHAND, 30), 20);
    const [st] = analyze({ frames, fps: 30, hand: 'right', rules: DEFAULT_RULES }).strokes;
    const sp = strokeSpace(frames, st, 'right');
    const w = frames[st.startFrame].world!;
    const mid = (a: number, b: number) => ({ x: (w[a].x + w[b].x) / 2, y: (w[a].y + w[b].y) / 2, z: (w[a].z + w[b].z) / 2 });
    const top = toCourt(mid(11, 12), sp), bottom = toCourt(mid(23, 24), sp);
    const lean = Math.atan2(Math.hypot(top.x - bottom.x, top.z - bottom.z), top.y - bottom.y) * 180 / Math.PI;
    expect(lean).toBeLessThan(6);
    // Feet on the floor.
    const feet = [29, 30, 31, 32].map((i) => toCourt(w[i], sp).y);
    expect(Math.min(...feet)).toBeGreaterThan(-0.02);
    expect(Math.min(...feet)).toBeLessThan(0.05);
  });
});
