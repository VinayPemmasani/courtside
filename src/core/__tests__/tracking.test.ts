import { describe, expect, it } from 'vitest';
import { cleanFrames, copyFrames, fixSwaps, removeSpikes, smoothWorld, steadyBones, type PoseFrame } from '../index';
import { FOREHAND, synthesize } from './synthetic';

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const swapLegs = (f: PoseFrame) => {
  for (const [l, r] of [[25, 26], [27, 28], [29, 30], [31, 32]]) {
    const t = f.world![l]; f.world![l] = f.world![r]; f.world![r] = t;
  }
};

describe('tracking clean-up', () => {
  it('undoes a left/right leg swap', () => {
    const clean = synthesize(FOREHAND, 30);
    const f = copyFrames(clean);
    // Spread the feet so a swap is visible, then swap the legs on two frames.
    for (const fr of f) { fr.world![27].x -= 0.25; fr.world![28].x += 0.25; fr.world![25].x -= 0.1; fr.world![26].x += 0.1; }
    const truth = copyFrames(f);
    swapLegs(f[20]); swapLegs(f[21]);
    expect(fixSwaps(f)).toBeGreaterThan(0);
    expect(dist(f[20].world![27], truth[20].world![27])).toBeLessThan(1e-6);
    expect(dist(f[21].world![28], truth[21].world![28])).toBeLessThan(1e-6);
  });

  it('removes a one-frame spike', () => {
    const f = copyFrames(synthesize(FOREHAND, 30));
    const good = { ...f[15].world![25] };
    f[15].world![25] = { x: good.x + 0.8, y: good.y, z: good.z };
    expect(removeSpikes(f)).toBe(1);
    expect(dist(f[15].world![25], good)).toBeLessThan(0.05);
  });

  it('smooths jitter without blunting the swing peak', () => {
    const base = synthesize(FOREHAND, 30);
    const speed = (fr: PoseFrame[], i: number) => dist(fr[i].world![16], fr[i - 1].world![16]) * 30;
    const peakOf = (fr: PoseFrame[]) => Math.max(...fr.slice(1).map((_, i) => speed(fr, i + 1)));
    const noisy = copyFrames(base);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.03;
    for (const fr of noisy) for (const p of fr.world!) { p.x += rnd(); p.y += rnd(); p.z += rnd(); }
    const smooth = copyFrames(noisy);
    smoothWorld(smooth);
    const err = (fr: PoseFrame[]) => fr.reduce((s, x, i) => s + dist(x.world![14], base[i].world![14]), 0) / fr.length;
    expect(err(smooth)).toBeLessThan(err(noisy) * 0.8);
    expect(peakOf(smooth)).toBeGreaterThan(peakOf(base) * 0.8);
  });

  it('keeps limb lengths constant for the 3D figure', () => {
    const f = copyFrames(synthesize(FOREHAND, 30));
    f[30].world![27].y += 0.12; // shin stretched on one frame
    steadyBones(f);
    const shin = f.map((x) => dist(x.world![25], x.world![27]));
    expect(Math.max(...shin) - Math.min(...shin)).toBeLessThan(1e-6);
  });

  it('cleanFrames keeps the swing timing', () => {
    const c = cleanFrames(synthesize(FOREHAND, 30));
    expect(c).toHaveLength(synthesize(FOREHAND, 30).length);
  });
});
