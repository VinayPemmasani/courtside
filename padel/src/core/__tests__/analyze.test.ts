import { describe, expect, it } from 'vitest';
import { analyze, applyRules, cleanFrames, DEFAULT_RULES, jointAngle, movePhase, retypeStroke, type PoseFrame } from '../index';
import { BACKHAND_1H, BANDEJA, FOREHAND, SMASH, UNDER_SERVE, synthesize } from './synthetic';

const fps = 30;
const run = (frames: PoseFrame[], hand: 'right' | 'left' = 'right') => analyze({ frames, fps, hand, rules: DEFAULT_RULES });
const phaseFrame = (s: { phases: { id: string; frame: number }[] }, id: string) => s.phases.find((p) => p.id === id)!.frame;

describe('geometry', () => {
  it('measures a right angle and a straight arm', () => {
    expect(jointAngle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(90);
    expect(jointAngle({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(180);
  });
});

describe('forehand', () => {
  const { strokes } = run(synthesize(FOREHAND, fps));
  it('finds one forehand with contact near the speed peak', () => {
    expect(strokes).toHaveLength(1);
    expect(strokes[0].type).toBe('forehand');
    expect(Math.abs(strokes[0].contactFrame - 1.33 * fps)).toBeLessThanOrEqual(5);
  });
  it('orders six phases with the backswing near the furthest-back wrist', () => {
    const s = strokes[0];
    expect(s.phases.map((p) => p.id)).toEqual(['ready', 'unit-turn', 'backswing', 'paddle-drop', 'contact', 'follow-through']);
    for (let i = 1; i < s.phases.length; i++) expect(s.phases[i].frame).toBeGreaterThan(s.phases[i - 1].frame);
    expect(Math.abs(phaseFrame(s, 'backswing') - 1.0 * fps)).toBeLessThanOrEqual(5);
  });
  it('measures a big shoulder turn and contact in front', () => {
    const s = strokes[0];
    expect(s.metrics.backswing!.shoulderTurn!).toBeGreaterThan(60);
    expect(s.metrics.contact!.contactForward!).toBeGreaterThan(0.1);
    expect(s.keyPoints.length).toBeGreaterThan(3);
    expect(s.callouts.length).toBe(s.keyPoints.length);
  });
  it('works the same for a left-hander', () => {
    const left = run(synthesize(FOREHAND, fps, 'left'), 'left').strokes;
    expect(left).toHaveLength(1);
    expect(left[0].type).toBe('forehand');
  });
});

describe('backhand', () => {
  const { strokes } = run(synthesize(BACKHAND_1H, fps));
  it('classifies the backhand and spots the free hand on the paddle', () => {
    expect(strokes).toHaveLength(1);
    expect(strokes[0].type).toBe('backhand');
    const throat = strokes[0].keyPoints.find((k) => k.ruleId === 'bh-hand-throat');
    expect(throat?.status).toBe('good');
    expect(throat?.text).toContain('Left hand');
  });
});

describe('smash', () => {
  const { strokes } = run(synthesize(SMASH, fps));
  it('classifies a full-reach overhead as a smash with racket up at the free hand\'s peak', () => {
    expect(strokes).toHaveLength(1);
    const s = strokes[0];
    expect(s.type).toBe('smash');
    expect(s.phases.map((p) => p.id)).toEqual(['ready', 'unit-turn', 'trophy', 'contact', 'follow-through']);
    expect(Math.abs(phaseFrame(s, 'trophy') - 0.9 * fps)).toBeLessThanOrEqual(4);
    expect(s.metrics.contact!.contactHeight!).toBeGreaterThan(0.35);
  });
});

describe('bandeja', () => {
  const { strokes } = run(synthesize(BANDEJA, fps));
  it('classifies a controlled overhead in front, below full reach, as a bandeja', () => {
    expect(strokes).toHaveLength(1);
    const s = strokes[0];
    expect(s.type).toBe('bandeja');
    expect(s.metrics.contact!.contactHeight!).toBeLessThan(0.3);
    expect(s.metrics.contact!.contactForward!).toBeGreaterThan(0.1);
    expect(s.keyPoints.find((k) => k.ruleId === 'bj-front')?.status).toBe('good');
    expect(s.keyPoints.find((k) => k.ruleId === 'bj-finish')?.status).toBe('good');
  });
});

describe('underhand serve', () => {
  const { strokes } = run(synthesize(UNDER_SERVE, fps));
  it('classifies the serve and checks contact is at or below the waist', () => {
    expect(strokes).toHaveLength(1);
    const s = strokes[0];
    expect(s.type).toBe('serve');
    expect(s.phases.map((p) => p.id)).toEqual(['ready', 'ball-drop', 'backswing', 'contact', 'follow-through']);
    const legal = s.keyPoints.find((k) => k.ruleId === 'sv-legal');
    expect(legal?.status).toBe('good');
  });
});

describe('several strokes in one clip', () => {
  it('splits a rally of forehand, backhand, forehand', () => {
    const a = synthesize(FOREHAND, fps);
    const b = synthesize(BACKHAND_1H, fps);
    const c = synthesize(FOREHAND, fps);
    // Players don't teleport between shots: blend 0.8 s (a recovery) from the end of one stroke into the next.
    const blend = (x: PoseFrame[], y: PoseFrame[]) => {
      const n = Math.round(0.8 * fps);
      const A = x[x.length - 1].world!, B = y[0].world!;
      const mid = Array.from({ length: n }, (_, k) => {
        const u = (k + 1) / (n + 1);
        const s = u * u * (3 - 2 * u);
        return { t: 0, image: y[0].image, world: A.map((p, j) => ({ x: p.x + (B[j].x - p.x) * s, y: p.y + (B[j].y - p.y) * s, z: p.z + (B[j].z - p.z) * s })) };
      });
      return [...x, ...mid];
    };
    const all = [...blend(a, b), ...blend(b, c), ...c].map((f, i) => ({ ...f, t: i / fps }));
    const types = run(all).strokes.map((s) => s.type);
    expect(types).toEqual(['forehand', 'backhand', 'forehand']);
  });
});

describe('coach corrections', () => {
  const r = run(synthesize(FOREHAND, fps));
  const p = r.prepared;
  const s = r.strokes[0];
  it('keeps an edited key point when rules re-run', () => {
    const edited = { ...s, keyPoints: s.keyPoints.map((k, i) => (i === 0 ? { ...k, text: 'Coach words', edited: true } : k)) };
    const again = applyRules(edited, DEFAULT_RULES, 'right');
    expect(again.keyPoints.filter((k) => k.text === 'Coach words')).toHaveLength(1);
    expect(again.keyPoints).toHaveLength(s.keyPoints.length);
  });
  it('re-types a stroke and finds the new phases', () => {
    const bj = retypeStroke(p, s, 'bandeja', DEFAULT_RULES);
    expect(bj.type).toBe('bandeja');
    expect(bj.typeLocked).toBe(true);
    expect(bj.phases.some((x) => x.id === 'trophy')).toBe(true);
    const vo = retypeStroke(p, s, 'volley', DEFAULT_RULES);
    expect(vo.phases.map((x) => x.id)).toEqual(['ready', 'unit-turn', 'contact', 'follow-through']);
  });
  it('moves a phase but never past its neighbours', () => {
    const moved = movePhase(p, s, 'contact', 0, DEFAULT_RULES);
    const back = phaseFrame(moved, 'paddle-drop');
    expect(moved.contactFrame).toBe(back + 1);
  });
});

describe('cleanFrames', () => {
  it('fills a short gap', () => {
    const f = synthesize(FOREHAND, fps);
    f[10] = { ...f[10], world: null, image: null };
    f[11] = { ...f[11], world: null, image: null };
    const c = cleanFrames(f, 6, 0);
    expect(c[10].world).not.toBeNull();
    expect(c[11].image).not.toBeNull();
  });
});
