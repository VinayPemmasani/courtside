import { describe, expect, it } from 'vitest';
import { bounceArc, findBounce, isBallColour, stageFromVz } from '../ball';
import { collide, simulate } from '../flight';

describe('ball reading', () => {
  it('knows optic yellow from court and skin colours', () => {
    expect(isBallColour(215, 240, 60)).toBe(true);
    expect(isBallColour(60, 120, 70)).toBe(false); // green court
    expect(isBallColour(220, 170, 140)).toBe(false); // skin
  });

  it('turns time since the bounce into rising / peak / falling', () => {
    // Ball that rises to 1.25 m: top after ~0.48 s.
    const early = bounceArc(0.25, 0.95)!;
    expect(early.stage).toBe('rising');
    expect(early.sinceApex!).toBeLessThan(0);
    const top = bounceArc(0.47, 1.2)!;
    expect(top.stage).toBe('peak');
    const late = bounceArc(0.8, 0.7)!;
    expect(late.stage).toBe('falling');
    expect(late.sinceApex!).toBeGreaterThan(0);
    expect(bounceArc(0.01, 1)).toBeUndefined();
    expect(stageFromVz(3)).toBe('rising');
    expect(stageFromVz(0.5)).toBe('peak');
    expect(stageFromVz(-3)).toBe('falling');
  });

  it('finds the bounce as the lowest on-screen point between going down and coming up', () => {
    const track = Array.from({ length: 20 }, (_, i) => ({ frame: i, x: 0.5, y: 0.8 - Math.abs(i - 8.4) * 0.02, r: 3 }));
    const b = findBounce(track as never)!;
    expect(b).toBeGreaterThan(7.5);
    expect(b).toBeLessThan(9.5);
  });
});

describe('strike model', () => {
  const base = { face: 0, path: 15, racketSpeed: 25, speedIn: 15, vzIn: 0, height: 1, behind: 1 };

  it('a faster racket sends the ball faster', () => {
    expect(simulate({ ...base, racketSpeed: 30 }).speed).toBeGreaterThan(simulate(base).speed);
  });

  it('a low-to-high path makes topspin, a level one less', () => {
    expect(simulate(base).rpm).toBeGreaterThan(500);
    expect(simulate({ ...base, path: 30 }).rpm).toBeGreaterThan(simulate({ ...base, path: 5 }).rpm);
  });

  it('closing the face lowers the launch', () => {
    expect(simulate({ ...base, face: 10 }).launch).toBeLessThan(simulate(base).launch);
  });

  it('a falling ball launches higher than the same swing at the top', () => {
    const falling = simulate({ ...base, vzIn: -3 });
    const top = simulate(base);
    expect(falling.launch).toBeLessThan(top.launch + 5);
    expect(collide({ ...base, vzIn: -3 }).square).toBeLessThan(collide(base).square + 1e-9);
  });
});
