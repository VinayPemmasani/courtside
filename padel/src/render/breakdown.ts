import * as THREE from 'three';
import { formatReading, shareAt, weightTransfer, type Breakdown, type Chapter, type Reading, type Stroke } from '../core';
import { STROKE_LABEL } from '../labels';
import { baseName, createFrameWriter, type CardContext } from './export';
import { saveFile } from './files';
import { COLORS, MONO, wrap } from './overlay';
import type { SceneInput, StudioScene } from './scene3d';
import { loadStudioFonts, RED, type Surface } from './studio';

/**
 * 2D layer of the step-by-step breakdown, drawn over the 3D studio: the chapter header and caption,
 * then readouts tied to the body (shoulder and hip line gauge, racket drop, contact distance, knee
 * angles, kinetic chain timeline, balance line). Every number carries a MEASURED / EST. tag.
 */

export const AMBER = COLORS.accent;
export const CYAN = '#5fd4ff';
const INK = 'rgba(5,9,20,0.84)';
const LINE = 'rgba(58,70,96,0.95)';
const DIM = 'rgba(160,172,196,0.95)';

export interface BreakdownFrame {
  breakdown: Breakdown;
  chapter: Chapter;
  /** Which caption beat to show. */
  beat: number;
  /** 0..1 how far into the hold; readouts fade in over the first part. */
  hold: number;
  /** Leave out parts of the layer (the Strike lab cards draw their own header and stats). */
  body?: boolean;
  panels?: boolean;
  header?: boolean;
}

/** Scene input for one breakdown frame. */
export function breakdownInput(base: Omit<SceneInput, 'breakdown'>, b: Breakdown, c: Chapter): SceneInput {
  return { ...base, ball: c.id === 'contact' || c.id === 'finish', eyeLine: false, breakdown: { ...c.look, xray: true, frontKnee: b.frontKnee } };
}

export function renderBreakdown(v: Surface, scene: StudioScene, input: SceneInput, f: BreakdownFrame) {
  scene.setSize(v.W, v.H);
  scene.render(input);
  v.ctx.drawImage(scene.canvas, 0, 0, v.W, v.H);
  drawBreakdownLayer(v, scene, input, f);
}

export function chip(ctx: CanvasRenderingContext2D, s: number, x: number, y: number, text: string, colour: string, tag?: string, align: 'left' | 'right' | 'center' = 'left') {
  ctx.save();
  ctx.font = `700 ${26 * s}px ${MONO}`;
  const tw = ctx.measureText(text).width;
  ctx.font = `500 ${15 * s}px ${MONO}`;
  const gw = tag ? ctx.measureText(tag).width + 14 * s : 0;
  const w = tw + gw + 28 * s, h = 44 * s;
  const raw = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  const x0 = Math.max(8 * s, Math.min(ctx.canvas.width - w - 8 * s, raw));
  y = Math.max(h / 2 + 8 * s, Math.min(ctx.canvas.height - h / 2 - 8 * s, y));
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y - h / 2, w, h);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(x0, y - h / 2, w, h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 ${26 * s}px ${MONO}`;
  ctx.fillStyle = colour;
  ctx.fillText(text, x0 + 14 * s, y + 1 * s);
  if (tag) {
    ctx.font = `500 ${15 * s}px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText(tag, x0 + 14 * s + tw + 14 * s, y + 2 * s);
  }
  ctx.restore();
  return { x: x0, w, h };
}

export const tagOf = (r?: Reading) => (r?.source === 'estimated' ? 'EST.' : 'MEAS.');
const colourOf = (r: Reading | undefined, fallback: string) => (r?.status === 'fix' ? RED : fallback);

function dashedLine(ctx: CanvasRenderingContext2D, s: number, a: { x: number; y: number }, b: { x: number; y: number }, colour: string, width = 3, dash = 14) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width * s;
  ctx.setLineDash([dash * s, dash * 0.7 * s]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}

/** A dimension line with end ticks. */
function dimension(ctx: CanvasRenderingContext2D, s: number, a: { x: number; y: number }, b: { x: number; y: number }, colour: string) {
  dashedLine(ctx, s, a, b, colour, 3.5, 16);
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3.5 * s;
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(ang) * 18 * s, p.y + Math.sin(ang) * 18 * s);
    ctx.lineTo(p.x - Math.cos(ang) * 18 * s, p.y - Math.sin(ang) * 18 * s);
    ctx.stroke();
  }
  ctx.fillStyle = colour;
  ctx.beginPath(); ctx.arc(b.x, b.y, 9 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawBreakdownLayer(v: Surface, scene: StudioScene, input: SceneInput, f: BreakdownFrame) {
  const { ctx, W, H } = v;
  const s = bdScale(W, H);
  const { chapter: c, breakdown: b } = f;
  const reading = (id: string) => c.readings.find((r) => r.id === id);
  const show = Math.min(1, f.hold * 4);
  const m = scene.marks;
  const P = (p: THREE.Vector3 | null | undefined) => (p ? scene.toScreen(p) : null);
  const i = Math.round(input.i);

  ctx.save();
  ctx.globalAlpha = show;
  if (m && show > 0 && f.body !== false) {
    if (c.id === 'coil' || c.id === 'finish') {
      // Labels at the outer ends of the shoulder and hip lines.
      const sh = reading(c.id === 'coil' ? 'shoulderTurn' : 'uncoil');
      const ends = (a: THREE.Vector3, z: THREE.Vector3, ext: number) => {
        const d = z.clone().sub(a);
        return [P(a.clone().addScaledVector(d, -ext)), P(z.clone().addScaledVector(d, ext))];
      };
      const [, s2] = ends(m.lShoulder, m.rShoulder, 0.5);
      const [h1] = ends(m.lHip, m.rHip, 0.65);
      const tu = b.turn;
      const at = (arr: number[]) => arr[Math.max(0, Math.min(arr.length - 1, i - tu.from))];
      if (s2 && sh) chip(ctx, s, s2.x + 16 * s, s2.y, `SHOULDERS ${c.id === 'coil' ? Math.round(Math.abs(at(tu.shoulders))) + '°' : formatReading(sh)}`, AMBER, tagOf(sh), s2.x > W * 0.6 ? 'right' : 'left');
      if (h1 && c.id === 'coil') chip(ctx, s, h1.x - 16 * s, h1.y, `HIPS ${Math.round(Math.abs(at(tu.hips)))}°`, CYAN, 'MEAS.', h1.x < W * 0.4 ? 'left' : 'right');
      if (c.id === 'coil' && f.panels !== false) drawTurnGauge(v, s, at(tu.shoulders), at(tu.hips), reading('sep'));
      if (c.id === 'finish') {
        // Balance: plumb line from the head to the floor, and the middle of the feet.
        const headFloor = m.head.clone().setY(0.01);
        const feet = m.lAnkle.clone().add(m.rAnkle).multiplyScalar(0.5).setY(0.01);
        const a = P(m.head), z = P(headFloor), ft = P(feet);
        const bal = reading('balance');
        if (a && z) dashedLine(ctx, s, a, z, 'rgba(235,240,250,0.8)', 2.5, 10);
        if (z && ft) {
          dimension(ctx, s, z, ft, colourOf(bal, AMBER));
          if (bal) chip(ctx, s, (z.x + ft.x) / 2, Math.max(z.y, ft.y) + 46 * s, `BALANCE ${formatReading(bal)}`, colourOf(bal, AMBER), 'MEAS.', 'center');
        }
      }
    }
    if (c.id === 'swing' && m.racketHead && m.grip) {
      const drop = reading('drop');
      const hand = m.hand;
      const level = m.racketHead.clone().setY(hand.y);
      const a = P(level), z = P(m.racketHead), hp = P(hand);
      if (a && z && hp && drop) {
        dashedLine(ctx, s, hp, a, 'rgba(235,240,250,0.65)', 2, 8);
        dimension(ctx, s, a, z, AMBER);
        chip(ctx, s, Math.max(a.x, z.x) + 24 * s, (a.y + z.y) / 2, drop.value >= 0 ? `DROP ${formatReading(drop)}` : `HEAD ${Math.abs(drop.value)} cm ABOVE HAND`, AMBER, 'EST.');
      }
    }
    if (c.id === 'contact') {
      const fwd = reading('contactForward');
      const hp = m.hipMid;
      const top = P(hp.clone().setY(1.95)), bot = P(hp.clone().setY(0.02));
      if (top && bot) dashedLine(ctx, s, top, bot, 'rgba(235,240,250,0.55)', 2.5, 12);
      if (fwd) {
        const from = P(hp.clone().setY(m.hand.y)), to = P(m.hand);
        if (from && to) {
          dimension(ctx, s, from, to, colourOf(fwd, AMBER));
          chip(ctx, s, (from.x + to.x) / 2, Math.min(from.y, to.y) - 52 * s, `IN FRONT ${formatReading(fwd)}`, colourOf(fwd, AMBER), 'MEAS.', 'center');
        }
      }
      const kf = reading('kneeFront'), kb = reading('kneeBack');
      const frontLeft = b.frontKnee !== undefined ? b.frontKnee === 25 : input.hand === 'right';
      const fk = P(frontLeft ? m.lKnee : m.rKnee), bk = P(frontLeft ? m.rKnee : m.lKnee);
      if (fk && kf) chip(ctx, s, fk.x + 40 * s * (fk.x >= (bk?.x ?? 0) ? 1 : -1), fk.y, `${formatReading(kf)}`, AMBER, 'FRONT KNEE', fk.x >= (bk?.x ?? 0) ? 'left' : 'right');
      if (bk && kb) chip(ctx, s, bk.x + 40 * s * (bk.x > (fk?.x ?? 0) ? 1 : -1), bk.y + 54 * s, `${formatReading(kb)}`, CYAN, 'BACK KNEE', bk.x > (fk?.x ?? 0) ? 'left' : 'right');
    }
  }
  ctx.restore();

  if (f.panels === false) { if (f.header !== false) drawHeader(v, s, input.stroke, f); return; }
  // Bottom panels.
  ctx.save();
  ctx.globalAlpha = show;
  if (c.id === 'swing' && b.chain.length) drawChainTimeline(v, s, b, input);
  if (c.id === 'contact') {
    const wt = input.weight ?? (input.stroke ? weightTransfer(input.frames, input.stroke, input.hand) : null);
    const share = shareAt(wt, i);
    const drive = reading('legDrive'), rise = reading('rise');
    drawBars(v, s, [
      ...(share !== null ? [{ label: 'WEIGHT ON FRONT FOOT', value: share, text: `${Math.round(share * 100)}%`, colour: AMBER, tag: 'MEAS.' }] : []),
      ...(drive ? [{ label: 'LEG DRIVE', value: Math.max(0, Math.min(1, drive.value / 30)), text: `+${formatReading(drive)}`, colour: colourOf(drive, CYAN), tag: 'MEAS.' }] : []),
      ...(rise ? [{ label: 'BODY RISE', value: Math.max(0, Math.min(1, rise.value / 15)), text: `${formatReading(rise)}`, colour: CYAN, tag: 'MEAS.' }] : []),
    ]);
  }
  if (c.id === 'finish') {
    const items = c.readings.filter((r) => r.id === 'finishHigh' || r.id === 'across' || r.id === 'weightF').map((r) => ({
      label: r.label.toUpperCase(), value: r.unit === '%' ? r.value / 100 : Math.max(0, Math.min(1, (r.value + 20) / 70)), text: formatReading(r), colour: colourOf(r, AMBER), tag: tagOf(r),
    }));
    drawBars(v, s, items);
  }
  ctx.restore();

  if (f.header !== false) drawHeader(v, s, input.stroke, f);
}

/** Layer scale: like the studio's, but landscape frames keep bigger text. */
export const bdScale = (W: number, H: number) => Math.min(W / 1080, H / 1100);

/** Header: STEP n/4, chapter title, four progress segments, and the caption beat. */
function drawHeader(v: Surface, s: number, stroke: Stroke | undefined, f: BreakdownFrame) {
  const { ctx, W, H } = v;
  const { chapter: c } = f;
  const pad = 48 * s;
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.34);
  g.addColorStop(0, 'rgba(4,8,20,0.92)');
  g.addColorStop(1, 'rgba(4,8,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.34);
  // Progress segments.
  const segW = (W - 2 * pad - 3 * 10 * s) / 4;
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k < c.step - 1 ? 'rgba(215,255,58,0.85)' : k === c.step - 1 ? AMBER : 'rgba(160,172,196,0.25)';
    if (k === c.step - 1) { ctx.shadowColor = AMBER; ctx.shadowBlur = 12 * s; }
    ctx.fillRect(pad + k * (segW + 10 * s), 34 * s, k === c.step - 1 ? segW * Math.max(0.15, Math.min(1, 0.15 + f.hold * 0.85)) : segW, 7 * s);
    if (k === c.step - 1) { ctx.fillStyle = 'rgba(160,172,196,0.25)'; ctx.shadowBlur = 0; ctx.fillRect(pad + k * (segW + 10 * s) + segW * Math.max(0.15, Math.min(1, 0.15 + f.hold * 0.85)), 34 * s, segW * (1 - Math.max(0.15, Math.min(1, 0.15 + f.hold * 0.85))), 7 * s); }
    ctx.shadowBlur = 0;
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let y = 104 * s;
  ctx.font = `700 ${30 * s}px ${MONO}`;
  ctx.fillStyle = AMBER;
  const kick = `STEP ${c.step}/4`;
  ctx.fillText(kick, pad, y);
  const kw = ctx.measureText(kick).width;
  ctx.font = `500 ${22 * s}px ${MONO}`;
  ctx.fillStyle = DIM;
  if (stroke) ctx.fillText(`· ${STROKE_LABEL[stroke.type].toUpperCase()} BREAKDOWN`, pad + kw + 16 * s, y);
  y += 82 * s;
  const room = W - 2 * pad;
  ctx.font = `700 ${80 * s}px ${MONO}`;
  const size = Math.min(80 * s, (80 * s * room) / Math.max(1, ctx.measureText(c.title.toUpperCase()).width));
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(95,212,255,0.55)';
  ctx.shadowBlur = 18 * s;
  ctx.fillText(c.title.toUpperCase(), pad - 3 * s, y);
  ctx.shadowBlur = 0;
  // Caption beat: "▸ TOPIC · text".
  const beat = c.beats[Math.min(f.beat, c.beats.length - 1)];
  if (beat) {
    y += 54 * s;
    ctx.font = `700 ${28 * s}px ${MONO}`;
    const topic = `▸ ${beat.topic.toUpperCase()}`;
    ctx.fillStyle = AMBER;
    ctx.fillText(topic, pad, y);
    ctx.font = `500 ${29 * s}px ${MONO}`;
    ctx.fillStyle = 'rgba(236,241,250,0.95)';
    const lines = wrap(ctx, beat.text, room).slice(0, 3);
    for (const line of lines) { y += 40 * s; ctx.fillText(line, pad, y); }
  }
  ctx.restore();
}

/** Shoulder and hip line rotation on a quarter dial: two needles and the stretch between them. */
function drawTurnGauge(v: Surface, s: number, shoulders: number, hips: number, sep?: Reading) {
  const { ctx, W, H } = v;
  if (!Number.isFinite(shoulders) || !Number.isFinite(hips)) return;
  const r = Math.min(170 * s, W * 0.2);
  const cx = 48 * s + 20 * s, cy = H - 70 * s;
  const ang = (deg: number) => -Math.PI / 2 + (Math.max(-10, Math.min(150, deg)) * Math.PI) / 180 * (90 / 135);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 20 * s, cy - r - 70 * s, r + 300 * s, r + 110 * s);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(cx - 20 * s, cy - r - 70 * s, r + 300 * s, r + 110 * s);
  ctx.font = `500 ${18 * s}px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.textAlign = 'left';
  ctx.fillText('TURN FROM READY · TOP VIEW', cx, cy - r - 40 * s);
  // Arc with ticks every 45°.
  ctx.strokeStyle = 'rgba(160,172,196,0.5)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.arc(cx, cy, r, ang(0), ang(135)); ctx.stroke();
  for (const d of [0, 45, 90, 135]) {
    const a = ang(d);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 10 * s), cy + Math.sin(a) * (r - 10 * s)); ctx.lineTo(cx + Math.cos(a) * (r + 6 * s), cy + Math.sin(a) * (r + 6 * s)); ctx.stroke();
    ctx.fillStyle = DIM;
    ctx.font = `500 ${15 * s}px ${MONO}`;
    ctx.fillText(`${d}°`, cx + Math.cos(a) * (r + 14 * s) - (d === 0 ? 14 * s : 0), cy + Math.sin(a) * (r + 14 * s) + 6 * s);
  }
  // Stretch wedge.
  const a1 = ang(Math.abs(hips)), a2 = ang(Math.abs(shoulders));
  ctx.fillStyle = 'rgba(215,255,58,0.18)';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 0.85, Math.min(a1, a2), Math.max(a1, a2)); ctx.closePath(); ctx.fill();
  const needle = (a: number, colour: string) => {
    ctx.strokeStyle = colour; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
    ctx.shadowColor = colour; ctx.shadowBlur = 10 * s;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); ctx.stroke();
    ctx.shadowBlur = 0;
  };
  needle(a1, CYAN);
  needle(a2, AMBER);
  // Numbers.
  const tx = cx + r + 40 * s;
  ctx.textAlign = 'left';
  const row = (y: number, label: string, val: string, colour: string) => {
    ctx.font = `500 ${17 * s}px ${MONO}`; ctx.fillStyle = DIM; ctx.fillText(label, tx, y);
    ctx.font = `700 ${40 * s}px ${MONO}`; ctx.fillStyle = colour; ctx.fillText(val, tx, y + 40 * s);
  };
  row(cy - r + 10 * s, 'SHOULDERS', `${Math.round(Math.abs(shoulders))}°`, AMBER);
  row(cy - r + 90 * s, 'HIPS', `${Math.round(Math.abs(hips))}°`, CYAN);
  if (sep) row(cy - r + 170 * s, 'STRETCH', `${Math.round(Math.abs(Math.abs(shoulders) - Math.abs(hips)))}°`, colourOf(sep, '#ffffff'));
  ctx.restore();
}

/** Hips, trunk, arm and hand peak times against contact, with a playhead at the current frame. */
function drawChainTimeline(v: Surface, s: number, b: Breakdown, input: SceneInput) {
  const { ctx, W, H } = v;
  const st = input.stroke;
  if (!st) return;
  const pad = 48 * s;
  const rowH = 46 * s;
  const h = rowH * b.chain.length + 96 * s;
  const y0 = H - h - 30 * s;
  const right = Math.min(W - pad, pad + 980 * s);
  const x0 = pad + 120 * s, x1 = right - 20 * s;
  const lo = Math.min(-400, ...b.chain.map((c) => c.ms - 60)), hi = 120;
  const X = (ms: number) => x0 + ((ms - lo) / (hi - lo)) * (x1 - x0);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(pad - 20 * s, y0, right - pad + 40 * s, h);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(pad - 20 * s, y0, right - pad + 40 * s, h);
  ctx.font = `500 ${18 * s}px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.textAlign = 'left';
  ctx.fillText(`KINETIC CHAIN · PEAK SPEED VS CONTACT${b.chainInOrder !== undefined ? ` · ${b.chainInOrder}/3 IN ORDER` : ''}`, pad, y0 + 32 * s);
  // Contact line.
  ctx.strokeStyle = 'rgba(236,241,250,0.6)';
  ctx.setLineDash([6 * s, 6 * s]);
  ctx.beginPath(); ctx.moveTo(X(0), y0 + 46 * s); ctx.lineTo(X(0), y0 + h - 30 * s); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(236,241,250,0.8)';
  ctx.textAlign = 'center';
  ctx.font = `500 ${15 * s}px ${MONO}`;
  ctx.fillText('CONTACT', X(0), y0 + h - 10 * s);
  const colours = [CYAN, '#8fb4ff', '#c79bff', AMBER];
  b.chain.forEach((c, k) => {
    const y = y0 + 66 * s + k * rowH;
    ctx.textAlign = 'left';
    ctx.font = `700 ${20 * s}px ${MONO}`;
    ctx.fillStyle = colours[k];
    ctx.fillText(c.label.toUpperCase(), pad, y + 7 * s);
    ctx.fillStyle = 'rgba(160,172,196,0.18)';
    ctx.fillRect(x0, y - 2 * s, x1 - x0, 4 * s);
    ctx.fillStyle = colours[k];
    ctx.shadowColor = colours[k]; ctx.shadowBlur = 10 * s;
    ctx.beginPath(); ctx.arc(X(c.ms), y, 11 * s, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `500 ${16 * s}px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${c.ms > 0 ? '+' : ''}${c.ms} ms`, X(c.ms) + 18 * s, y + 6 * s);
  });
  // Playhead.
  const now = ((input.i - st.contactFrame) / input.fps) * 1000;
  if (now >= lo && now <= hi) {
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(X(now), y0 + 46 * s); ctx.lineTo(X(now), y0 + h - 30 * s); ctx.stroke();
  }
  ctx.restore();
}

/** Small labelled bars along the bottom. */
function drawBars(v: Surface, s: number, items: { label: string; value: number; text: string; colour: string; tag: string }[]) {
  if (!items.length) return;
  const { ctx, W, H } = v;
  const pad = 48 * s;
  const rowH = 62 * s;
  const h = rowH * items.length + 30 * s;
  const y0 = H - h - 30 * s;
  const bw = Math.min(W - 2 * pad, 640 * s);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(pad - 20 * s, y0, bw + 40 * s, h);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(pad - 20 * s, y0, bw + 40 * s, h);
  items.forEach((it, k) => {
    const y = y0 + 34 * s + k * rowH;
    ctx.font = `500 ${17 * s}px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.textAlign = 'left';
    ctx.fillText(`${it.label} · ${it.tag}`, pad, y);
    ctx.textAlign = 'right';
    ctx.font = `700 ${24 * s}px ${MONO}`;
    ctx.fillStyle = it.colour;
    ctx.fillText(it.text, pad + bw, y);
    ctx.fillStyle = 'rgba(160,172,196,0.2)';
    ctx.fillRect(pad, y + 12 * s, bw, 9 * s);
    ctx.fillStyle = it.colour;
    ctx.shadowColor = it.colour; ctx.shadowBlur = 10 * s;
    ctx.fillRect(pad, y + 12 * s, Math.max(6 * s, bw * Math.max(0, Math.min(1, it.value))), 9 * s);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

/** Timing of the breakdown playback: slow motion into each chapter, then a hold that steps through its captions. */
export const BREAKDOWN_SLOW = 0.25;
export const holdMs = (c: Chapter) => 2200 + 1600 * Math.max(1, c.beats.length);

/**
 * A 1080×1920 breakdown reel: for each chapter, the run into it in slow motion with the racket
 * ghosting through the swing, then a hold with the readouts and each caption in turn.
 */
export async function exportBreakdownVideo(ctx: CardContext, stroke: Stroke, b: Breakdown, onProgress?: (p: number) => void) {
  const { session, frames, player } = ctx;
  await loadStudioFonts();
  const { StudioScene } = await import('./scene3d');
  const weight = weightTransfer(frames, stroke, player.hand);
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const view: Surface = { ctx: canvas.getContext('2d')!, W, H };
  const scene = new StudioScene(W, H);
  await scene.ready;
  const writer = await createFrameWriter(canvas);
  const slow = 1 / (session.fps * BREAKDOWN_SLOW);
  const total = b.chapters.reduce((t, c) => t + (c.frame - c.from) * slow + holdMs(c) / 1000, 0);
  const base = { frames, fps: session.fps, hand: player.hand, stroke, weight };
  try {
    for (const c of b.chapters) {
      // Slow motion at a full 30 frames a second, gliding between the filmed frames.
      const outFrames = Math.max(1, Math.round((c.frame - c.from) * slow * 30));
      for (let k = 0; k < outFrames; k++) {
        const i = c.from + ((c.frame - c.from) * k) / outFrames;
        renderBreakdown(view, scene, breakdownInput({ ...base, i }, b, c), { breakdown: b, chapter: c, beat: 0, hold: 0 });
        await writer.add(1 / 30);
      }
      const ms = holdMs(c);
      for (let t = 0; t < ms; t += 1000 / 30) {
        const hold = t / ms;
        const beat = Math.min(c.beats.length - 1, Math.floor((t / ms) * c.beats.length));
        renderBreakdown(view, scene, breakdownInput({ ...base, i: c.frame }, b, c), { breakdown: b, chapter: c, beat, hold });
        await writer.add(1 / 30);
      }
      onProgress?.(Math.min(1, writer.time / total));
    }
  } finally {
    scene.dispose();
  }
  const { blob, ext } = await writer.finish();
  return saveFile(blob, `${baseName(ctx, stroke)}-breakdown.${ext}`, [{ name: 'Video', extensions: [ext] }]);
}
