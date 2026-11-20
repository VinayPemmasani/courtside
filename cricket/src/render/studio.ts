import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import type { Callout, Handedness } from '../core';
import { placeLabels, type Box } from './layout';
import { COLORS, MONO, wrap } from './overlay';
import type { SceneInput, StudioScene } from './scene3d';

/**
 * 2D layers over the 3D studio: the bold headline ("■ STEP 2 OF 6 / UNIT TURN / TURN EARLIER."),
 * callout labels pinned to the body, and the weight-transfer gauge.
 */

export const RED = '#ff5a4f';

/** A canvas area to draw on. */
export interface Surface {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
}

export interface Headline {
  kicker: string;
  line1: string;
  line2?: string;
  /** Colour of the kicker square and the second line: red for a fix, neon for a good point. */
  tone?: 'fix' | 'good';
  subtitle?: string;
  dots?: { count: number; active: number };
}


/** Wait for the headline fonts, so the first exported frames are not drawn in a fallback font. */
export async function loadStudioFonts() {
  if (!document.fonts) return;
  await Promise.all([document.fonts.load(`700 100px ${MONO}`), document.fonts.load(`600 30px ${MONO}`)]).catch(() => undefined);
}

/**
 * Layer scale. Reels are 1080 wide and portrait; in a landscape preview, scaling by width alone
 * made the headline taller than the frame, so the height caps it too (portrait reels are unchanged).
 */
export const studioScale = (W: number, H: number) => Math.min(W / 1080, H / 1500);

/** Where the headline's text ends (just under its hairline), in canvas pixels from the top. */
export function headlineBottom(v: Surface, h: Headline): number {
  const { ctx, W, H } = v;
  const s = studioScale(W, H);
  const room = W - 2 * 56 * s;
  ctx.save();
  let y = 104 * s + 22 * s;
  for (const text of [h.line1, h.line2]) {
    if (!text) continue;
    ctx.font = `700 ${116 * s}px ${MONO}`;
    y += Math.min(116 * s, (116 * s * room) / Math.max(1, ctx.measureText(text.toUpperCase()).width)) * 1.02;
  }
  if (h.subtitle) {
    ctx.font = `500 ${32 * s}px ${MONO}`;
    y += 22 * s + 44 * s * wrap(ctx, h.subtitle, room).slice(0, 2).length;
  }
  ctx.restore();
  return y + 40 * s;
}

/** Top of the weight-transfer panel. */
export const gaugeTop = (W: number, H: number) => H - 226 * studioScale(W, H);

export function drawHeadline(v: Surface, h: Headline) {
  const { ctx, W, H } = v;
  const s = studioScale(W, H);
  const pad = 56 * s;
  const tone = h.tone === 'good' ? COLORS.accent : RED;
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  g.addColorStop(0, 'rgba(5,7,12,0.9)');
  g.addColorStop(1, 'rgba(5,7,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.4);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Kicker: "▌ STEP 5 OF 6 | FOREHAND", like a panel label.
  let y = 104 * s;
  ctx.fillStyle = tone;
  ctx.shadowColor = tone;
  ctx.shadowBlur = 10 * s;
  ctx.fillRect(pad, y - 26 * s, 5 * s, 30 * s);
  ctx.shadowBlur = 0;
  ctx.font = `500 ${26 * s}px ${MONO}`;
  ctx.fillStyle = 'rgba(217,223,234,0.75)';
  tracked(ctx, h.kicker.toUpperCase(), pad + 22 * s, y, 5 * s);
  if (h.dots) drawDots(ctx, W - pad, y - 11 * s, s, h.dots.count, h.dots.active);

  const room = W - 2 * pad;
  const big = (text: string, colour: string) => {
    ctx.font = `700 ${116 * s}px ${MONO}`;
    const size = Math.min(116 * s, (116 * s * room) / Math.max(1, ctx.measureText(text).width));
    ctx.font = `700 ${size}px ${MONO}`;
    ctx.fillStyle = colour;
    y += size * 1.02;
    ctx.fillText(text, pad - 4 * s, y);
  };
  y += 22 * s;
  big(h.line1.toUpperCase(), '#ffffff');
  if (h.line2) {
    ctx.shadowColor = tone;
    ctx.shadowBlur = 24 * s;
    big(h.line2.toUpperCase(), tone);
    ctx.shadowBlur = 0;
  }
  if (h.subtitle) {
    ctx.font = `500 ${32 * s}px ${MONO}`;
    ctx.fillStyle = 'rgba(217,223,234,0.85)';
    y += 22 * s;
    for (const line of wrap(ctx, h.subtitle, room).slice(0, 2)) {
      y += 44 * s;
      ctx.fillText(line, pad, y);
    }
  }
  // Hairline under the block.
  ctx.fillStyle = 'rgba(42,50,69,0.9)';
  ctx.fillRect(pad, y + 26 * s, room, Math.max(1, 1.5 * s));
  ctx.restore();
}

/** Tracked-out caps for labels: canvas letterSpacing where the browser has it, plain text otherwise. */
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) {
    ctx.save();
    c.letterSpacing = `${px}px`;
    // Letter spacing adds trailing space; pull right-aligned text back by one step.
    ctx.fillText(text, ctx.textAlign === 'right' ? x + px : x, y);
    ctx.restore();
    c.letterSpacing = '0px';
  } else ctx.fillText(text, x, y);
}

/** Phase progress as square segments; the live one is longer and lit. */
function drawDots(ctx: CanvasRenderingContext2D, right: number, y: number, s: number, count: number, active: number) {
  const r = 10 * s, gap = 6 * s, long = 36 * s;
  let x = right - (count - 1) * (r + gap) - long;
  for (let i = 0; i < count; i++) {
    const w = i === active ? long : r;
    ctx.fillStyle = i === active ? COLORS.accent : i < active ? 'rgba(217,223,234,0.7)' : 'rgba(217,223,234,0.2)';
    ctx.fillRect(x, y - r / 2, w, r);
    x += w + gap;
  }
}

/**
 * Callout chips pinned to the 3D body: a reticle on the joint, a leader, and a bordered mono label.
 * Labels go in the empty space around the player, between `top` and `bottom` (under the headline
 * and above the gauge), never over the mannequin, racket, swing path, ball or each other.
 */
export function drawPinnedLabels(v: Surface, scene: StudioScene, callouts: Callout[], hand: Handedness, area: { top?: number; bottom?: number } = {}) {
  const { ctx, W, H } = v;
  const s = studioScale(W, H);
  ctx.save();
  ctx.font = `700 ${26 * s}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const items = [];
  for (const c of callouts) {
    if (c.hidden) continue;
    const a = scene.projectAnchor(c.anchor, hand);
    if (!a) continue;
    const text = c.label.toUpperCase();
    items.push({ c, a, text, w: ctx.measureText(text).width + 40 * s, h: 50 * s });
  }
  const top = area.top ?? 12 * s;
  const bottom = area.bottom ?? H - 12 * s;
  const taken: Box[] = [];
  const spots = placeLabels(
    items.map((it) => ({ anchor: it.a, w: it.w, h: it.h, preferred: { x: it.a.x + it.c.dx * H * 0.8, y: it.a.y + it.c.dy * H * 0.8 } })),
    { body: scene.screenDiscs(), taken, bounds: { x: 12 * s, y: top, w: W - 24 * s, h: Math.max(60 * s, bottom - top) }, margin: 10 * s, reach: 70 * s },
  );
  items.forEach(({ c, a, text, w, h }, k) => {
    const colour = c.status === 'fix' ? RED : COLORS.accent;
    const { x: lx, y: ly } = spots[k];
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 8 * s;
    // Reticle.
    const r = 14 * s;
    ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(a.x + dx * (r - 5 * s), a.y + dy * (r - 5 * s));
      ctx.lineTo(a.x + dx * (r + 7 * s), a.y + dy * (r + 7 * s));
    }
    ctx.stroke();
    // Leader: out from the ring to the nearest edge of the chip.
    const ang = Math.atan2(ly - a.y, lx - a.x);
    const ex = Math.max(lx - w / 2, Math.min(lx + w / 2, a.x));
    const ey = Math.abs(lx - a.x) > w / 2 ? ly : ly + (a.y < ly ? -h / 2 : h / 2);
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(5,7,12,0.88)';
    ctx.fillRect(lx - w / 2, ly - h / 2, w, h);
    ctx.lineWidth = 1.5 * s;
    ctx.strokeRect(lx - w / 2, ly - h / 2, w, h);
    ctx.fillStyle = colour;
    ctx.fillRect(lx - w / 2, ly - h / 2, 6 * s, h);
    ctx.fillText(text, lx - w / 2 + 22 * s, ly + 2 * s);
  });
  ctx.restore();
}

/** "WEIGHT TRANSFER" readout along the bottom: back foot to front foot, with the share in front. */
export function drawWeightGauge(v: Surface, share: number | null) {
  if (share === null) return;
  const { ctx, W, H } = v;
  const s = studioScale(W, H);
  const pad = 56 * s;
  const y = H - 160 * s;
  const barH = 10 * s;
  const bw = W - 2 * pad;
  ctx.save();
  // Hairline panel.
  ctx.fillStyle = 'rgba(8,11,18,0.82)';
  ctx.fillRect(pad - 20 * s, y - 66 * s, bw + 40 * s, 128 * s);
  ctx.strokeStyle = 'rgba(42,50,69,0.95)';
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.strokeRect(pad - 20 * s, y - 66 * s, bw + 40 * s, 128 * s);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 ${20 * s}px ${MONO}`;
  ctx.fillStyle = 'rgba(122,132,153,1)';
  ctx.textAlign = 'left';
  tracked(ctx, 'WEIGHT TRANSFER', pad, y - 24 * s, 4 * s);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.accent;
  ctx.font = `700 ${34 * s}px ${MONO}`;
  ctx.fillText(`${Math.round(share * 100)}%`, W - pad - 138 * s, y - 20 * s);
  ctx.font = `500 ${20 * s}px ${MONO}`;
  ctx.fillStyle = 'rgba(217,223,234,0.8)';
  ctx.fillText('FRONT FOOT', W - pad, y - 22 * s);
  // Track with quarter ticks, then the lit share.
  ctx.fillStyle = 'rgba(42,50,69,0.95)';
  ctx.fillRect(pad, y, bw, barH);
  ctx.fillStyle = COLORS.accent;
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 12 * s;
  ctx.fillRect(pad, y, Math.max(barH, bw * share), barH);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(122,132,153,0.9)';
  for (const q of [0, 0.25, 0.5, 0.75, 1]) ctx.fillRect(pad + bw * q - (q === 1 ? 2 * s : 0), y + barH + 4 * s, 2 * s, q === 0.5 ? 12 * s : 7 * s);
  ctx.font = `500 ${17 * s}px ${MONO}`;
  ctx.fillStyle = 'rgba(122,132,153,1)';
  ctx.textAlign = 'left';
  ctx.fillText('BACK', pad, y + barH + 40 * s);
  ctx.textAlign = 'center';
  ctx.fillText('50 / 50', pad + bw / 2, y + barH + 40 * s);
  ctx.textAlign = 'right';
  ctx.fillText('FRONT', W - pad, y + barH + 40 * s);
  ctx.restore();
}

export interface StudioOverlay {
  headline?: Headline;
  callouts?: Callout[];
  /** Weight share to show on the gauge; omit for no gauge. */
  gauge?: number | null;
}

/**
 * Render one studio frame into `v` (at its own size, so translate the context for a split screen):
 * the 3D scene, then the labels, gauge and headline. Callouts also become rings in the scene.
 */
export function renderStudio(v: Surface, scene: StudioScene, input: SceneInput, overlay: StudioOverlay = {}) {
  const callouts = (overlay.callouts ?? []).filter((c) => !c.hidden);
  scene.setSize(v.W, v.H);
  scene.render({ ...input, rings: callouts.map((c) => ({ anchor: c.anchor, status: c.status })) });
  v.ctx.drawImage(scene.canvas, 0, 0, v.W, v.H);
  if (callouts.length) {
    const s = studioScale(v.W, v.H);
    drawPinnedLabels(v, scene, callouts, input.hand, {
      // Without a headline, stay under the side names of a split screen.
      top: overlay.headline ? headlineBottom(v, overlay.headline) : 84 * s,
      bottom: overlay.gauge !== undefined && overlay.gauge !== null ? gaugeTop(v.W, v.H) - 12 * s : v.H - 12 * s,
    });
  }
  if (overlay.gauge !== undefined) drawWeightGauge(v, overlay.gauge);
  if (overlay.headline) drawHeadline(v, overlay.headline);
}
