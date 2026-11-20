import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { weightTransfer, type Breakdown, type StrikeCard, type Stroke } from '../core';
import { STROKE_LABEL } from '../labels';
import { AMBER, bdScale, breakdownInput, drawBreakdownLayer } from './breakdown';
import { baseName, createFrameWriter, type CardContext } from './export';
import { saveFile, slug } from './files';
import { COLORS, MONO, wrap } from './overlay';
import type { SceneInput, StudioScene } from './scene3d';
import { loadStudioFonts, RED, type Surface } from './studio';

/**
 * Strike lab cards drawn over the see-through 3D figure: a numbered title ("2 DROP THE RACKET
 * HEAD"), one plain line, a pass/fix pill, and a panel of the numbers behind it, each tagged
 * MEAS. (read from the tracked body), EST. (the racket, or depth) or MODEL (ball physics).
 */

const INK = 'rgba(5,9,20,0.86)';
const LINE = 'rgba(58,70,96,0.95)';
const DIM = 'rgba(160,172,196,0.95)';
const TEAL = COLORS.teal;

export interface CardFrame {
  card: StrikeCard;
  total: number;
  /** 0..1 into the hold (readouts fade in). */
  hold: number;
  /** Small footer line: player, stroke, date. */
  footer?: string;
}

export function strikeCardInput(base: Omit<SceneInput, 'breakdown' | 'i'>, b: Breakdown, card: StrikeCard, i: number): SceneInput {
  return breakdownInput({ ...base, i }, b, card.chapter);
}

export function renderStrikeCard(v: Surface, scene: StudioScene, input: SceneInput, b: Breakdown, f: CardFrame) {
  scene.setSize(v.W, v.H);
  scene.render(input);
  v.ctx.drawImage(scene.canvas, 0, 0, v.W, v.H);
  drawBreakdownLayer(v, scene, input, { breakdown: b, chapter: f.card.chapter, beat: 0, hold: f.hold, body: f.card.body, panels: false, header: false });
  drawCardLayer(v, f);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCardLayer(v: Surface, f: CardFrame) {
  const { ctx, W, H } = v;
  const s = bdScale(W, H);
  const { card } = f;
  const pad = 48 * s;
  ctx.save();
  // Header shade.
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  g.addColorStop(0, 'rgba(4,8,20,0.94)');
  g.addColorStop(1, 'rgba(4,8,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.3);

  // Kicker and progress dots.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `600 ${20 * s}px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.fillText('STRIKE LAB · 3D', pad, 52 * s);
  {
    const dot = 12 * s, wide = 40 * s, gap = 10 * s;
    let x = W - pad - ((f.total - 1) * (dot + gap) + wide);
    for (let k = 0; k < f.total; k++) {
      const on = k === card.n - 1;
      ctx.fillStyle = on ? AMBER : k < card.n - 1 ? 'rgba(245,181,68,0.55)' : 'rgba(160,172,196,0.35)';
      const w = on ? wide : dot;
      roundRect(ctx, x, 40 * s, w, dot, dot / 2);
      ctx.fill();
      x += w + gap;
    }
  }

  // Number disc and title.
  const r = 34 * s, cx = pad + r, cy = 118 * s;
  ctx.fillStyle = AMBER;
  ctx.shadowColor = AMBER; ctx.shadowBlur = 16 * s;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${40 * s}px ${MONO}`;
  ctx.fillText(String(card.n), cx, cy + 2 * s);
  ctx.textAlign = 'left';
  const tx = cx + r + 22 * s, room = W - tx - pad;
  const title = card.title.toUpperCase();
  ctx.font = `800 ${62 * s}px ${MONO}`;
  const size = Math.min(62 * s, (62 * s * room) / Math.max(1, ctx.measureText(title).width));
  ctx.font = `800 ${size}px ${MONO}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, tx, cy + 3 * s);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 ${27 * s}px ${MONO}`;
  ctx.fillStyle = 'rgba(236,241,250,0.92)';
  let y = cy + r + 44 * s;
  for (const line of wrap(ctx, card.line, W - 2 * pad).slice(0, 2)) { ctx.fillText(line, pad, y); y += 36 * s; }

  // Verdict pill.
  const show = Math.min(1, f.hold * 4);
  ctx.globalAlpha = show;
  if (card.verdict) {
    const ok = card.verdict.ok;
    const mark = ok === true ? '✓' : ok === false ? '✗' : '?';
    let text = `${mark}  ${card.verdict.text.toUpperCase()}`;
    ctx.font = `700 ${26 * s}px ${MONO}`;
    while (ctx.measureText(text).width > W - 2 * pad - 40 * s && text.length > 8) text = text.slice(0, -2);
    if (!text.endsWith(card.verdict.text.toUpperCase().slice(-1))) text = text.trimEnd() + '…';
    const w = ctx.measureText(text).width + 40 * s, h = 54 * s;
    const x = pad, py = y - 6 * s;
    roundRect(ctx, x, py, w, h, h / 2);
    ctx.fillStyle = ok === true ? AMBER : ok === false ? '#ffffff' : 'rgba(160,172,196,0.9)';
    ctx.fill();
    if (ok === false) { ctx.strokeStyle = RED; ctx.lineWidth = 3 * s; ctx.stroke(); }
    ctx.fillStyle = ok === false ? RED : COLORS.ink;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 20 * s, py + h / 2 + 1 * s);
    ctx.textBaseline = 'alphabetic';
  }

  // Stats panel: up to four tiles, two per row.
  const stats = card.stats.slice(0, 4);
  if (stats.length) {
    const cols = 2, rows = Math.ceil(stats.length / cols);
    const tileH = 104 * s, gap = 12 * s;
    const footH = f.footer ? 34 * s : 0;
    const panelH = rows * tileH + (rows - 1) * gap;
    const y0 = H - panelH - 30 * s - footH;
    const tileW = (W - 2 * pad - gap) / cols;
    stats.forEach((st, k) => {
      const x = pad + (k % cols) * (tileW + gap), ty = y0 + Math.floor(k / cols) * (tileH + gap);
      ctx.fillStyle = INK;
      roundRect(ctx, x, ty, tileW, tileH, 14 * s);
      ctx.fill();
      ctx.strokeStyle = st.status === 'fix' ? RED : st.status === 'good' ? TEAL : LINE;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.font = `500 ${17 * s}px ${MONO}`;
      ctx.fillStyle = DIM;
      const label = st.label.toUpperCase();
      const lw = tileW - 110 * s;
      let lt = label;
      while (ctx.measureText(lt).width > lw && lt.length > 4) lt = lt.slice(0, -2);
      ctx.fillText(lt === label ? lt : lt + '…', x + 18 * s, ty + 32 * s);
      ctx.textAlign = 'right';
      ctx.font = `600 ${14 * s}px ${MONO}`;
      ctx.fillStyle = st.tag === 'MEAS.' ? TEAL : st.tag === 'EST.' ? AMBER : COLORS.violet;
      ctx.fillText(st.tag, x + tileW - 16 * s, ty + 31 * s);
      ctx.textAlign = 'left';
      ctx.font = `800 ${40 * s}px ${MONO}`;
      ctx.fillStyle = st.status === 'fix' ? RED : '#ffffff';
      let vs = 40 * s;
      while (ctx.measureText(st.value).width > tileW - 36 * s && vs > 20 * s) { vs -= 2 * s; ctx.font = `800 ${vs}px ${MONO}`; }
      ctx.fillText(st.value, x + 18 * s, ty + 84 * s);
    });
  }
  ctx.globalAlpha = 1;
  if (f.footer) {
    ctx.font = `500 ${17 * s}px ${MONO}`;
    ctx.fillStyle = 'rgba(160,172,196,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('SPINWISE', pad, H - 22 * s);
    ctx.textAlign = 'right';
    ctx.fillText(f.footer.toUpperCase(), W - pad, H - 22 * s);
  }
  ctx.restore();
}

function footerFor(ctx: CardContext, stroke: Stroke) {
  return `${ctx.player.name} · ${STROKE_LABEL[stroke.type]} · ${new Date(ctx.session.createdAt).toLocaleDateString()}`;
}

/** Render every card at W×H; `each` gets the canvas for each card in turn. */
async function eachCard(ctx: CardContext, stroke: Stroke, b: Breakdown, cards: StrikeCard[], W: number, H: number, each: (c: HTMLCanvasElement, card: StrikeCard) => Promise<void>, total = cards.length) {
  await loadStudioFonts();
  const { StudioScene } = await import('./scene3d');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const view: Surface = { ctx: canvas.getContext('2d')!, W, H };
  const scene = new StudioScene(W, H);
  await scene.ready;
  const weight = weightTransfer(ctx.frames, stroke, ctx.player.hand);
  const base = { frames: ctx.frames, fps: ctx.session.fps, hand: ctx.player.hand, stroke, weight, figure: 'mannequin' as const };
  try {
    for (const card of cards) {
      renderStrikeCard(view, scene, strikeCardInput(base, b, card, card.frame), b, { card, total, hold: 1, footer: footerFor(ctx, stroke) });
      await each(canvas, card);
    }
  } finally {
    scene.dispose();
  }
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the image'))), type, q));

/** One 1080×1350 PNG per card, zipped. */
export async function exportStrikeImages(ctx: CardContext, stroke: Stroke, b: Breakdown, cards: StrikeCard[], onProgress?: (p: number) => void) {
  const zip = new JSZip();
  let k = 0;
  await eachCard(ctx, stroke, b, cards, 1080, 1350, async (c, card) => {
    zip.file(`${String(card.n).padStart(2, '0')}-${slug(card.title)}.png`, await toBlob(c));
    onProgress?.(++k / cards.length);
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  return saveFile(blob, `${baseName(ctx, stroke)}-strike-3d.zip`, [{ name: 'Zip', extensions: ['zip'] }]);
}

/** Just the card on screen, as a PNG. */
export async function exportStrikeImage(ctx: CardContext, stroke: Stroke, b: Breakdown, cards: StrikeCard[], card: StrikeCard) {
  let out: Blob | null = null;
  await eachCard(ctx, stroke, b, [card], 1080, 1350, async (c) => { out = await toBlob(c); }, cards.length);
  return saveFile(out!, `${baseName(ctx, stroke)}-${card.n}-${slug(card.title)}.png`, [{ name: 'Image', extensions: ['png'] }]);
}

/** A PDF: a summary page with every verdict, then one page per card with its numbers. */
export async function exportStrikePdf(ctx: CardContext, stroke: Stroke, b: Breakdown, cards: StrikeCard[], extra: { score?: number; headline?: string }, onProgress?: (p: number) => void) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const m = 40;
  pdf.setTextColor(200, 130, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('SPINWISE · STRIKE LAB 3D', m, m + 10);
  pdf.setTextColor(20, 24, 34);
  pdf.setFontSize(26);
  pdf.text(`${STROKE_LABEL[stroke.type]} breakdown`, m, m + 48);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(95, 105, 125);
  pdf.text(footerFor(ctx, stroke), m, m + 70);
  let y = m + 110;
  if (extra.score !== undefined) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(40);
    pdf.setTextColor(200, 130, 20);
    pdf.text(`${extra.score}/100`, m, y);
    pdf.setFontSize(12);
    pdf.setTextColor(95, 105, 125);
    pdf.text('STRIKE SCORE', m, y + 18);
    y += 50;
  }
  if (extra.headline) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(20, 24, 34);
    const lines = pdf.splitTextToSize(`Try first: ${extra.headline}`, pw - 2 * m) as string[];
    pdf.text(lines, m, y);
    y += lines.length * 18 + 16;
  }
  pdf.setFontSize(13);
  for (const c of cards) {
    const ok = c.verdict?.ok;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(ok === true ? 30 : ok === false ? 220 : 120, ok === true ? 150 : ok === false ? 60 : 130, ok === true ? 120 : ok === false ? 90 : 150);
    pdf.text(ok === true ? 'PASS' : ok === false ? 'FIX' : '—', m, y);
    pdf.setTextColor(20, 24, 34);
    pdf.text(`${c.n}  ${c.title}`, m + 50, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(95, 105, 125);
    const l = pdf.splitTextToSize(`${c.verdict?.text ?? ''}${c.stats.length ? ' · ' + c.stats.map((s) => `${s.label} ${s.value}`).join(' · ') : ''}`, pw - 2 * m - 50) as string[];
    pdf.text(l, m + 50, y + 16);
    y += 22 + l.length * 15;
  }
  pdf.setFontSize(9);
  pdf.text('MEAS. = read from the tracked body. EST. = the racket (simulated from the hand and forearm) or depth the camera cannot see. MODEL = ball physics.', m, ph - m, { maxWidth: pw - 2 * m });
  let k = 0;
  await eachCard(ctx, stroke, b, cards, 1080, 1350, async (c) => {
    pdf.addPage();
    pdf.setFillColor(5, 7, 13);
    pdf.rect(0, 0, pw, ph, 'F');
    const imgH = ph - 2 * m, imgW = (imgH * 1080) / 1350;
    const w = Math.min(imgW, pw - 2 * m), h = (w * 1350) / 1080;
    pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
    onProgress?.(++k / cards.length);
  });
  return saveFile(pdf.output('blob'), `${baseName(ctx, stroke)}-strike-3d.pdf`, [{ name: 'PDF', extensions: ['pdf'] }]);
}

/** A 1080×1920 video of the cards: a smooth slow-motion run into each card, then a hold. */
export async function exportStrikeVideo(ctx: CardContext, stroke: Stroke, b: Breakdown, cards: StrikeCard[], onProgress?: (p: number) => void) {
  await loadStudioFonts();
  const { StudioScene } = await import('./scene3d');
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const view: Surface = { ctx: canvas.getContext('2d')!, W, H };
  const scene = new StudioScene(W, H);
  await scene.ready;
  const writer = await createFrameWriter(canvas);
  const weight = weightTransfer(ctx.frames, stroke, ctx.player.hand);
  const base = { frames: ctx.frames, fps: ctx.session.fps, hand: ctx.player.hand, stroke, weight, figure: 'mannequin' as const };
  const footer = footerFor(ctx, stroke);
  const runS = (c: StrikeCard) => (c.frame - c.from) / ctx.session.fps / 0.25;
  const total = cards.reduce((t, c) => t + runS(c) + 3.2, 0);
  try {
    for (const card of cards) {
      const n = Math.max(1, Math.round(runS(card) * 30));
      for (let k = 0; k < n; k++) {
        renderStrikeCard(view, scene, strikeCardInput(base, b, card, card.from + ((card.frame - card.from) * k) / n), b, { card, total: cards.length, hold: 0, footer });
        await writer.add(1 / 30);
      }
      // Readouts fade in, then the finished card holds (one still frame, no re-rendering).
      for (let k = 0; k < 24; k++) {
        renderStrikeCard(view, scene, strikeCardInput(base, b, card, card.frame), b, { card, total: cards.length, hold: k / 96, footer });
        await writer.add(1 / 30);
      }
      renderStrikeCard(view, scene, strikeCardInput(base, b, card, card.frame), b, { card, total: cards.length, hold: 1, footer });
      await writer.add(72 / 30);
      onProgress?.(Math.min(1, writer.time / total));
    }
  } finally {
    scene.dispose();
  }
  const { blob, ext } = await writer.finish();
  return saveFile(blob, `${baseName(ctx, stroke)}-strike-3d.${ext}`, [{ name: 'Video', extensions: [ext] }]);
}
