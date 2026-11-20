import type { Handedness } from '../core/types';
import { StudioScene } from '../render/scene3d';
import { MONO, wrap } from '../render/overlay';
import { drawHeadline, loadStudioFonts } from '../render/studio';
import { createFrameWriter } from '../render/export';
import { saveFile, slug } from '../render/files';
import type { Motion } from './body';
import type { Drill, DrillStroke, Topic } from './catalog';
import { DrillPlayer } from './play';

const BG = '#05070c';
const AMBER = '#ff7a1a';
const TEXT = '#e9eef8';
const MUTED = '#8a93a8';

/** One shared offscreen scene for collages and videos (WebGL contexts are limited). */
let shared: { scene: StudioScene; w: number; h: number } | null = null;
function sceneOf(w: number, h: number) {
  if (!shared) shared = { scene: new StudioScene(w, h), w, h };
  shared.scene.setSize(w, h);
  return shared.scene;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * The key positions of one rep as a numbered grid of 3D frames, with the drill name, the cue and
 * each position's caption: a picture to save or print for practice.
 */
export async function renderCollage(drill: Drill, motion: Motion, hand: Handedness, cam: number): Promise<HTMLCanvasElement> {
  await loadStudioFonts();
  const stills = motion.stills;
  const cols = stills.length <= 4 ? stills.length : 3;
  const rows = Math.ceil(stills.length / cols);
  const tw = 420, th = 520, gap = 10, pad = 28, head = 150, foot = 56;
  const W = pad * 2 + cols * tw + (cols - 1) * gap;
  const H = head + rows * th + (rows - 1) * gap + foot + pad;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const c = out.getContext('2d')!;
  c.fillStyle = BG;
  c.fillRect(0, 0, W, H);

  // Header: where, name, cue.
  c.fillStyle = AMBER;
  c.font = `700 22px ${MONO}`;
  c.fillText(`■ ${drill.where === 'on-court' ? 'ON COURT' : 'OFF COURT'} · ${drill.dose.toUpperCase()}`, pad, 44);
  c.fillStyle = TEXT;
  c.font = `700 46px ${MONO}`;
  c.fillText(drill.title.toUpperCase(), pad, 96);
  c.fillStyle = MUTED;
  c.font = `500 22px ${MONO}`;
  c.fillText(wrap(c, `Cue: ${drill.cue}`, W - pad * 2)[0] ?? '', pad, 132);

  const scene = sceneOf(tw, th);
  await scene.ready;
  const player = new DrillPlayer(scene, motion, hand);
  for (let i = 0; i < stills.length; i++) {
    const x = pad + (i % cols) * (tw + gap);
    const y = head + Math.floor(i / cols) * (th + gap);
    player.render(stills[i].t, { yaw: cam }, { trail: true });
    c.drawImage(scene.canvas, x, y, tw, th);
    // Number and caption.
    c.fillStyle = 'rgba(5,7,12,0.78)';
    c.fillRect(x, y + th - 64, tw, 64);
    c.fillStyle = AMBER;
    c.fillRect(x + 14, y + th - 50, 36, 36);
    c.fillStyle = BG;
    c.font = `700 24px ${MONO}`;
    c.textAlign = 'center';
    c.fillText(String(i + 1), x + 32, y + th - 23);
    c.textAlign = 'left';
    c.fillStyle = TEXT;
    c.font = `700 20px ${MONO}`;
    const lines = wrap(c, stills[i].label, tw - 80);
    lines.slice(0, 2).forEach((l, k) => c.fillText(l, x + 62, y + th - (lines.length > 1 ? 38 : 25) + k * 24));
    await tick();
  }
  c.fillStyle = MUTED;
  c.font = `500 18px ${MONO}`;
  c.fillText(`Avoid: ${drill.avoid}`.slice(0, 120), pad, H - pad - 8);
  c.textAlign = 'right';
  c.fillText('SPINWISE · DRILLS', W - pad, H - pad - 8);
  c.textAlign = 'left';
  return out;
}

export async function saveCollage(drill: Drill, topic: Topic, motion: Motion, hand: Handedness, cam: number) {
  const canvas = await renderCollage(drill, motion, hand, cam);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return saveFile(blob, `${slug(topic.title)}-${slug(drill.title)}.png`, [{ name: 'Image', extensions: ['png'] }]);
}

/**
 * A 1080×1350 MP4 of the drill: one rep at full speed from the chosen angle, one in half-speed
 * slow motion while the camera circles, then a held card of each key position.
 */
export async function exportDrillVideo(drill: Drill, topic: Topic, stroke: DrillStroke, motion: Motion, hand: Handedness, cam: number, onProgress?: (p: number) => void) {
  await loadStudioFonts();
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const view = { ctx: canvas.getContext('2d')!, W, H };
  const scene = sceneOf(W, H);
  await scene.ready;
  const player = new DrillPlayer(scene, motion, hand);
  const writer = await createFrameWriter(canvas);
  const fps = 30;
  const d = player.duration;
  const total = d + d * 2 + motion.stills.length * 1.6;
  const stillAt = (t: number) => {
    let label = motion.stills[0]?.label ?? '';
    for (const s of motion.stills) if (t >= s.t - 0.05) label = s.label;
    return label;
  };
  const frame = async (t: number, yaw: number, kicker: string, label: string, seconds: number) => {
    // Aim above the hips so the figure sits below the headline.
    player.render(t, { yaw, dist: 5.0, height: 1.75, aimY: 1.32 });
    view.ctx.drawImage(scene.canvas, 0, 0, W, H);
    drawHeadline(view, { kicker, line1: drill.title, line2: label, tone: 'good', subtitle: `${topic.title} · ${drill.where === 'on-court' ? 'On court' : 'Off court'} · ${drill.dose}` });
    await writer.add(seconds);
    onProgress?.(Math.min(1, writer.time / total));
  };
  for (let i = 0; i <= Math.round(d * fps); i++) {
    const t = i / fps;
    await frame(t, cam, 'Full speed', stillAt(t), 1 / fps);
  }
  for (let i = 0; i <= Math.round(d * 2 * fps); i++) {
    const t = i / fps / 2;
    await frame(t, cam + 50 * Math.sin((i / (d * 2 * fps)) * Math.PI * 2), 'Slow motion', stillAt(t), 1 / fps);
  }
  for (let k = 0; k < motion.stills.length; k++) {
    const s = motion.stills[k];
    await frame(s.t, cam, `Position ${k + 1} of ${motion.stills.length}`, s.label, 1.6);
  }
  const { blob, ext } = await writer.finish();
  return saveFile(blob, `${slug(topic.title)}-${slug(drill.title)}-${slug(stroke)}.${ext}`, [{ name: 'Video', extensions: [ext] }]);
}
