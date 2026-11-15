import { analyze, DEFAULT_RULES, strokeBreakdown, weightTransfer } from '../src/core';
import { FOREHAND, synthesize } from '../src/core/__tests__/synthetic';
import { StudioScene } from '../src/render/scene3d';
import { breakdownInput, renderBreakdown } from '../src/render/breakdown';
import { loadStudioFonts } from '../src/render/studio';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') ?? 1080), H = +(q.get('h') ?? 1920);
const fps = 30;
const { prepared, strokes } = analyze({ frames: synthesize(FOREHAND, fps), fps, hand: 'right', rules: DEFAULT_RULES });
const stroke = strokes[0];
const bd = strokeBreakdown(prepared, stroke);
const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
document.body.append(canvas);
const scene = new StudioScene(W, H);
(window as any).ready = Promise.all([scene.ready, loadStudioFonts()]);
(window as any).bd = bd;
(window as any).show = (k: number, frac = 1, hold = 0.6, beat = 0) => {
  const c = bd.chapters[k];
  const i = Math.round(c.from + (c.frame - c.from) * frac);
  const weight = weightTransfer(prepared.frames, stroke, 'right');
  renderBreakdown({ ctx: canvas.getContext('2d')!, W, H }, scene, breakdownInput({ frames: prepared.frames, i, fps, hand: 'right', stroke, weight }, bd, c), { breakdown: bd, chapter: c, beat, hold });
  return canvas.toDataURL('image/jpeg', 0.88);
};
