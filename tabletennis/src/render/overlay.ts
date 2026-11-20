import { anchorIndices, deeperKnee, forwardSwingEnd, forwardSwingStart, SKELETON, sides, type Callout, type Handedness, type ImagePoint, type PoseFrame, type Stroke } from '../core';
import { alongPath, bodyDiscs, placeLabels, visiblePoints, type Box, type Disc } from './layout';

export const COLORS = {
  accent: '#ff7a1a',
  fix: '#ff3d5a',
  ink: '#120c02',
  violet: '#3fb6ff',
  teal: '#3ee08f',
  bone: 'rgba(226, 232, 246, 0.95)',
  glow: 'rgba(63, 182, 255, 0.9)',
};

/** Monospace face used for every label drawn on video, matching the app's telemetry look. */
export const MONO = '"JetBrains Mono", "Space Mono", ui-monospace, monospace';

/** Source rectangle (video pixels) drawn into the whole canvas. */
export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface View {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  vw: number;
  vh: number;
  crop: Crop;
}

export const fullCrop = (vw: number, vh: number): Crop => ({ sx: 0, sy: 0, sw: vw, sh: vh });

export function toCanvas(v: View, p: { x: number; y: number }) {
  return { x: ((p.x * v.vw - v.crop.sx) / v.crop.sw) * v.W, y: ((p.y * v.vh - v.crop.sy) / v.crop.sh) * v.H };
}

/**
 * Crop of the given aspect (w/h) around the player across a stroke, inside the video.
 * `reserveTop` (a share of the height) keeps that band at the top clear of the player, for a header.
 */
export function cropAround(frames: PoseFrame[], from: number, to: number, vw: number, vh: number, aspect: number, reserveTop = 0): Crop {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (let i = from; i <= to; i++) {
    for (const p of frames[i]?.image ?? []) {
      if (p.v < 0.3) continue;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
  }
  if (x1 <= x0) return fitAspect({ sx: 0, sy: 0, sw: vw, sh: vh }, vw, vh, aspect);
  const cx = ((x0 + x1) / 2) * vw;
  const cy = ((y0 + y1) / 2) * vh;
  let sh = (y1 - y0) * vh * 1.5;
  let sw = (x1 - x0) * vw * 1.5;
  if (reserveTop <= 0) {
    if (sw / sh > aspect) sh = sw / aspect; else sw = sh * aspect;
    return fitAspect({ sx: cx - sw / 2, sy: cy - sh / 2, sw, sh }, vw, vh, aspect);
  }
  // The head and racket reach past the tracked points, so the player's box starts a little higher.
  const bh = (y1 - y0) * vh;
  const top = y0 * vh - bh * 0.12;
  const bottom = y1 * vh + bh * 0.04;
  const free = 1 - Math.min(0.6, reserveTop);
  sh = Math.max(sh, ((bottom - top) * 1.1) / free);
  if (sw / sh > aspect) sh = sw / aspect; else sw = sh * aspect;
  // Centre the player in the part of the frame below the reserved band.
  const at = 1 - free / 2;
  return fitAspect({ sx: cx - sw / 2, sy: (top + bottom) / 2 - sh * at, sw, sh }, vw, vh, aspect);
}

function fitAspect(c: Crop, vw: number, vh: number, aspect: number): Crop {
  let { sw, sh } = c;
  if (sw > vw) { sw = vw; sh = sw / aspect; }
  if (sh > vh) { sh = vh; sw = sh * aspect; }
  const sx = Math.max(0, Math.min(vw - sw, c.sx + (c.sw - sw) / 2));
  const sy = Math.max(0, Math.min(vh - sh, c.sy + (c.sh - sh) / 2));
  return { sx, sy, sw, sh };
}

export function drawVideo(v: View, video: CanvasImageSource) {
  v.ctx.fillStyle = '#03050a';
  v.ctx.fillRect(0, 0, v.W, v.H);
  v.ctx.drawImage(video, v.crop.sx, v.crop.sy, v.crop.sw, v.crop.sh, 0, 0, v.W, v.H);
}

export function drawSkeleton(v: View, pts: ImagePoint[] | null, dim = false) {
  if (!pts) return;
  const { ctx } = v;
  const s = v.H / 720;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.shadowColor = COLORS.glow;
  ctx.shadowBlur = 14 * s;
  ctx.strokeStyle = COLORS.bone;
  ctx.lineWidth = 4 * s;
  for (const [a, b] of SKELETON) {
    if (pts[a].v < 0.3 || pts[b].v < 0.3) continue;
    const p = toCanvas(v, pts[a]);
    const q = toCanvas(v, pts[b]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = COLORS.teal;
  ctx.lineWidth = 1.2 * s;
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (pts[i].v < 0.3) continue;
    const p = toCanvas(v, pts[i]);
    ctx.beginPath(); ctx.arc(p.x, p.y, 3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 6.5 * s, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Frames the trail covers at `upTo`: the preparation until the forward swing starts, then only the forward swing. */
export function trailRange(stroke: Stroke, upTo: number): { from: number; to: number; forward: boolean } {
  const start = forwardSwingStart(stroke);
  if (upTo < start) return { from: stroke.startFrame, to: upTo, forward: false };
  return { from: start, to: Math.min(upTo, forwardSwingEnd(stroke)), forward: true };
}

/**
 * Path of the hitting wrist with an arrowhead. During the preparation it shows faintly; once the
 * forward swing starts only the forward swing is drawn, ending at the follow-through, so the route
 * the racket takes through contact is easy to read.
 */
export function drawTrail(v: View, frames: PoseFrame[], stroke: Stroke, upTo: number, hand: Handedness) {
  const { dom } = sides(hand);
  const range = trailRange(stroke, upTo);
  const pts = [];
  for (let i = range.from; i <= range.to; i++) {
    const p = frames[i]?.image?.[dom.wrist];
    if (p && p.v > 0.3) pts.push(toCanvas(v, p));
  }
  if (pts.length < 3) return;
  const { ctx } = v;
  const s = v.H / 720;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    ctx.strokeStyle = COLORS.accent;
    ctx.globalAlpha = (range.forward ? 1 : 0.4) * (0.15 + 0.75 * (i / pts.length));
    ctx.lineWidth = (2 + 3 * (i / pts.length)) * s;
    ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  if (Math.hypot(b.x - a.x, b.y - a.y) > 1) {
    ctx.globalAlpha = range.forward ? 1 : 0.4;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(b.x + Math.cos(ang) * 12 * s, b.y + Math.sin(ang) * 12 * s);
    ctx.lineTo(b.x + Math.cos(ang + 2.5) * 10 * s, b.y + Math.sin(ang + 2.5) * 10 * s);
    ctx.lineTo(b.x + Math.cos(ang - 2.5) * 10 * s, b.y + Math.sin(ang - 2.5) * 10 * s);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export function anchorPoint(v: View, frame: PoseFrame, c: Callout, hand: Handedness) {
  if (!frame.image) return null;
  const knee = frame.world ? deeperKnee(frame.world) : undefined;
  const idx = anchorIndices(c.anchor, hand, knee);
  const pts = idx.map((i) => frame.image![i]);
  if (pts.some((p) => p.v < 0.2)) return null;
  return toCanvas(v, { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
}

/** What export layout needs to keep callout labels off the player. */
export interface AvoidBody {
  body: Disc[];
  /** Areas already holding text, such as the header. */
  taken?: Box[];
}

/**
 * Ring on the joint, a leader line, and an uppercase label chip. Returns label boxes for dragging.
 * With `avoid`, each label stays where the coach put it only while that spot is clear, and
 * otherwise moves to the nearest empty space, off the body, the swing and other text.
 */
export function drawCallouts(v: View, frame: PoseFrame, callouts: Callout[], hand: Handedness, selected?: string, avoid?: AvoidBody): LabelBox[] {
  const { ctx } = v;
  const s = v.H / 720;
  const boxes: LabelBox[] = [];
  ctx.save();
  ctx.font = `700 ${Math.round(15 * s)}px ${MONO}`;
  ctx.textBaseline = 'middle';
  const items = [];
  for (const c of callouts) {
    if (c.hidden) continue;
    const a = anchorPoint(v, frame, c, hand);
    if (!a) continue;
    const text = c.label.toUpperCase();
    items.push({ c, a, text, w: ctx.measureText(text).width + 26 * s, h: 32 * s });
  }
  const spots = avoid
    ? placeLabels(items.map((it) => ({ anchor: it.a, w: it.w, h: it.h, preferred: { x: it.a.x + it.c.dx * v.H, y: it.a.y + it.c.dy * v.H } })), {
        body: avoid.body,
        taken: avoid.taken,
        bounds: { x: 8, y: 8, w: v.W - 16, h: v.H - 16 },
        margin: 8 * s,
        reach: 60 * s,
      })
    : null;
  items.forEach(({ c, a, text, w, h }, k) => {
    const color = c.status === 'fix' ? COLORS.fix : COLORS.accent;
    let lx = spots ? spots[k].x : a.x + c.dx * v.H;
    let ly = spots ? spots[k].y : a.y + c.dy * v.H;
    lx = Math.max(w / 2 + 8, Math.min(v.W - w / 2 - 8, lx));
    ly = Math.max(h / 2 + 8, Math.min(v.H - h / 2 - 8, ly));
    const r = 22 * s;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * s;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * s;
    // Reticle: a ring with four ticks, like a tracking lock.
    ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(a.x + dx * (r - 6 * s), a.y + dy * (r - 6 * s));
      ctx.lineTo(a.x + dx * (r + 8 * s), a.y + dy * (r + 8 * s));
    }
    ctx.stroke();
    // Leader from the ring edge to the nearest edge of the label.
    const ang = Math.atan2(ly - a.y, lx - a.x);
    const far = Math.hypot(ly - a.y, lx - a.x);
    if (far > r + h / 2) {
      const ex = Math.max(lx - w / 2, Math.min(lx + w / 2, a.x));
      const ey = Math.abs(lx - a.x) > w / 2 ? ly : ly + (a.y < ly ? -h / 2 : h / 2);
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(5, 7, 12, 0.86)';
    ctx.fillRect(lx - w / 2, ly - h / 2, w, h);
    ctx.lineWidth = 1.5 * s;
    ctx.strokeRect(lx - w / 2, ly - h / 2, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(lx - w / 2, ly - h / 2, 4 * s, h);
    if (selected === c.id) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 * s;
      ctx.strokeRect(lx - w / 2 - 4, ly - h / 2 - 4, w + 8, h + 8);
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, lx + 2 * s, ly + 1);
    boxes.push({ id: c.id, x: lx - w / 2, y: ly - h / 2, w, h, ax: a.x, ay: a.y });
  });
  ctx.restore();
  return boxes;
}

/**
 * The player in a video card as discs in canvas pixels: the skeleton, torso, head, racket and
 * the hitting wrist's path so far.
 */
export function cardBody(v: View, frames: PoseFrame[], frame: number, hand: Handedness, stroke?: Stroke): Disc[] {
  const { dom } = sides(hand);
  const pts = visiblePoints(frames[frame]?.image, (p) => toCanvas(v, p));
  const body = bodyDiscs(pts, { dominantWrist: dom.wrist, dominantElbow: dom.elbow });
  if (stroke) {
    const trail = [];
    const range = trailRange(stroke, frame);
    for (let i = range.from; i <= range.to; i++) {
      const p = frames[i]?.image?.[dom.wrist];
      if (p && p.v > 0.3) trail.push(toCanvas(v, p));
    }
    body.push(...alongPath(trail, 10 * (v.H / 720)));
  }
  return body;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface HeaderOpts {
  index: number;
  title: string;
  subtitle?: string;
  kicker?: string;
}

/** Height of the header block on a card `W` wide, in canvas pixels. */
export function headerHeight(ctx: CanvasRenderingContext2D, W: number, opts: HeaderOpts): number {
  const s = W / 1080;
  ctx.save();
  ctx.font = `700 ${48 * s}px ${MONO}`;
  const lines = opts.subtitle ? Math.min(3, wrap(ctx, opts.subtitle, W - 2 * 56 * s).length) : 0;
  ctx.restore();
  return (234 + (opts.kicker ? 30 : 0) + 58 * lines + 40) * s;
}

/**
 * "1 UNIT TURN" header with a subtitle, like a breakdown card. An index of 0 hides the number.
 * It sits at the top unless `at` is 'bottom'; `solid` puts a dark panel behind it, for when the
 * player cannot be kept out from under it. Returns the area it covers.
 */
export function drawHeader(v: View, opts: HeaderOpts, place: { at?: 'top' | 'bottom'; solid?: boolean } = {}): Box {
  const { ctx, W, H } = v;
  const s = W / 1080;
  const hh = headerHeight(ctx, W, opts);
  const y0 = place.at === 'bottom' ? H - hh : 0;
  ctx.save();
  if (place.solid) {
    ctx.fillStyle = 'rgba(5,7,13,0.84)';
    ctx.fillRect(0, y0, W, hh);
  } else if (place.at === 'bottom') {
    const top = H - Math.max(H * 0.34, hh * 1.2);
    const grad = ctx.createLinearGradient(0, H, 0, top);
    grad.addColorStop(0, 'rgba(5,7,13,0.92)');
    grad.addColorStop(1, 'rgba(5,7,13,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, W, H - top);
  } else {
    const bottom = Math.max(H * 0.34, hh * 1.2);
    const grad = ctx.createLinearGradient(0, 0, 0, bottom);
    grad.addColorStop(0, 'rgba(5,7,13,0.92)');
    grad.addColorStop(1, 'rgba(5,7,13,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, bottom);
  }
  const pad = 56 * s;
  let y = y0 + 70 * s;
  ctx.textBaseline = 'alphabetic';
  if (opts.kicker) {
    ctx.font = `600 ${30 * s}px ${MONO}`;
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(opts.kicker.toUpperCase(), pad, y);
    y += 30 * s;
  }
  const r = 44 * s;
  const cy = y + r + 6 * s;
  let titleX = pad;
  if (opts.index > 0) {
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(pad, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 ${52 * s}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(opts.index), pad + r, cy + 18 * s);
    titleX = pad + 2 * r + 24 * s;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  // Shrink long titles ("FOLLOW-THROUGH") so they never run off the edge.
  const room = W - pad - titleX;
  ctx.font = `700 ${96 * s}px ${MONO}`;
  const size = Math.min(96 * s, (96 * s * room) / Math.max(1, ctx.measureText(opts.title.toUpperCase()).width));
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.fillText(opts.title.toUpperCase(), titleX, cy + size * 0.35);
  y = cy + r + 70 * s;
  if (opts.subtitle) {
    ctx.font = `700 ${48 * s}px ${MONO}`;
    for (const line of wrap(ctx, opts.subtitle, W - 2 * pad).slice(0, 3)) {
      ctx.fillText(line, pad, y);
      y += 58 * s;
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `700 ${26 * s}px ${MONO}`;
  ctx.fillText('ANALYZED BY SPINWISE  |  TABLE TENNIS LAB', pad, y + 6 * s);
  ctx.restore();
  return { x: 0, y: y0, w: W, h: hh };
}

/** Size of the video timestamp pill for `text` on a card `W` wide. */
export function timecodeSize(ctx: CanvasRenderingContext2D, W: number, text: string) {
  const fs = Math.max(11, 30 * (W / 1080));
  ctx.save();
  ctx.font = `700 ${fs}px ${MONO}`;
  const w = ctx.measureText(text).width + 1.2 * fs;
  ctx.restore();
  return { w, h: fs * 1.7 };
}

/**
 * Video timestamp pill, so a viewer can find the exact frame in the clip. It sits in the
 * bottom-left corner unless `at` (its top-left) says otherwise. Returns the area it covers.
 */
export function drawTimecode(v: View, text: string, at?: { x: number; y: number }): Box {
  const { ctx, W, H } = v;
  const s = W / 1080;
  const fs = Math.max(11, 30 * s);
  const { w, h } = timecodeSize(ctx, W, text);
  const padX = fs * 0.6;
  const x = at?.x ?? 40 * s;
  const y = at?.y ?? H - h - 40 * s;
  ctx.save();
  ctx.font = `700 ${fs}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(5,7,13,0.8)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(x, y, Math.max(2, 4 * s), h);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x + padX, y + h / 2);
  ctx.restore();
  return { x, y, w, h };
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Pro compare: the reference skeleton drawn over the player as a gold ghost, with short links
 * from the player's hitting elbow and hand to the pro's, so the gap reads at a glance.
 */
export function drawProSkeleton(v: View, pro: ImagePoint[], user: ImagePoint[] | null, hand: Handedness) {
  const { ctx } = v;
  const s = v.H / 720;
  const { dom } = sides(hand);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 122, 26, 0.9)';
  ctx.shadowColor = 'rgba(255, 122, 26, 0.6)';
  ctx.shadowBlur = 10 * s;
  ctx.lineWidth = 3.5 * s;
  ctx.setLineDash([9 * s, 6 * s]);
  for (const [a, b] of SKELETON) {
    const p = toCanvas(v, pro[a]);
    const q = toCanvas(v, pro[b]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.accent;
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const p = toCanvas(v, pro[i]);
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * s, 0, Math.PI * 2); ctx.fill();
  }
  if (user) {
    ctx.strokeStyle = COLORS.fix;
    ctx.lineWidth = 2 * s;
    for (const i of [dom.elbow, dom.wrist]) {
      if (user[i].v < 0.3) continue;
      const p = toCanvas(v, user[i]);
      const q = toCanvas(v, pro[i]);
      if (Math.hypot(p.x - q.x, p.y - q.y) < 8 * s) continue;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
  }
  ctx.restore();
}

/** The ball's tracked flight up to this frame, with the bounce ringed. */
export function drawBallTrack(v: View, r: { track: { f: number; x: number; y: number }[]; bounceFrame?: number }, upTo: number) {
  const pts = r.track.filter((p) => p.f <= upTo && p.f >= upTo - 45);
  if (!pts.length) return;
  const { ctx } = v;
  ctx.save();
  ctx.strokeStyle = 'rgba(216, 242, 90, 0.85)';
  ctx.fillStyle = '#d8f25a';
  ctx.lineWidth = Math.max(1.5, v.W / 500);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  pts.forEach((p, k) => { const q = toCanvas(v, p); if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
  ctx.stroke();
  ctx.setLineDash([]);
  const last = toCanvas(v, pts[pts.length - 1]);
  ctx.beginPath(); ctx.arc(last.x, last.y, Math.max(3, v.W / 220), 0, Math.PI * 2); ctx.fill();
  if (r.bounceFrame !== undefined && r.bounceFrame <= upTo) {
    const b = r.track.reduce((a, p) => (Math.abs(p.f - r.bounceFrame!) < Math.abs(a.f - r.bounceFrame!) ? p : a), r.track[0]);
    const q = toCanvas(v, b);
    ctx.lineWidth = Math.max(2, v.W / 400);
    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(8, v.W / 70), 0, Math.PI * 2); ctx.stroke();
    ctx.font = `600 ${Math.max(11, Math.round(v.W / 55))}px system-ui, sans-serif`;
    ctx.fillText('BOUNCE', q.x + Math.max(10, v.W / 60), q.y + 4);
  }
  ctx.restore();
}
