import { StudioScene } from '../src/render/scene3d';
import { DrillPlayer } from '../src/drills/play';
import * as M from '../src/drills/motions';
const q = new URLSearchParams(location.search);
const W = +(q.get('w') ?? 480), H = +(q.get('h') ?? 600);
const scene = new StudioScene(W, H);
document.body.replaceChildren(scene.canvas);
(window as any).M = M;
(window as any).ready = scene.ready;
(window as any).show = (motion: any, t: number, yaw: number, hand: 'right' | 'left' = 'right') => {
  const p = new DrillPlayer(scene, motion, hand);
  p.render(t, (window as any).cam ?? { yaw });
  return scene.canvas.toDataURL('image/jpeg', 0.85);
};
