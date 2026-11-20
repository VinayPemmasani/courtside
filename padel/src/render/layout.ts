import { SKELETON, type ImagePoint } from '../core';

/**
 * Keeps export text off the player: the body (skeleton, torso, head, racket, swing path) becomes a
 * set of discs in canvas pixels, and headers and label chips go where they cover the fewest.
 */

export interface Pt { x: number; y: number }
export interface Disc { x: number; y: number; r: number }
export interface Box { x: number; y: number; w: number; h: number }

/** Discs every `step` pixels along a segment. */
export function alongSegment(a: Pt, b: Pt, r: number, step = r): Disc[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, step)));
  const out: Disc[] = [];
  for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, r });
  return out;
}

/** Discs along a polyline (a swing path or ball flight). */
export function alongPath(pts: Pt[], r: number): Disc[] {
  const out: Disc[] = [];
  for (let i = 1; i < pts.length; i++) out.push(...alongSegment(pts[i - 1], pts[i], r));
  if (pts.length === 1) out.push({ ...pts[0], r });
  return out;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The player's body as discs, from pose points already in canvas pixels (null where unseen):
 * every bone, a filled torso, the head and a racket reaching out past the hitting hand.
 */
export function bodyDiscs(pts: (Pt | null)[], opts: { dominantWrist?: number; dominantElbow?: number } = {}): Disc[] {
  const ls = pts[11], rs = pts[12], lh = pts[23], rh = pts[24];
  // Limb thickness follows the player's size on screen.
  const torso = ls && rs && lh && rh ? dist(mid(ls, rs), mid(lh, rh)) : 0;
  const shoulders = ls && rs ? dist(ls, rs) : 0;
  const scale = Math.max(torso, shoulders * 1.4, 1);
  const limb = Math.max(6, scale * 0.16);
  const out: Disc[] = [];
  for (const [a, b] of SKELETON) {
    const p = pts[a], q = pts[b];
    if (p && q) out.push(...alongSegment(p, q, limb));
  }
  if (ls && rs && lh && rh) {
    const top = mid(ls, rs), bottom = mid(lh, rh);
    const half = Math.max(shoulders, dist(lh, rh)) / 2 + limb * 0.5;
    out.push(...alongSegment(top, bottom, Math.max(limb, half)));
  }
  const nose = pts[0];
  if (nose) out.push({ ...nose, r: Math.max(limb * 1.6, scale * 0.3) });
  else if (ls && rs) {
    const top = mid(ls, rs);
    out.push({ x: top.x, y: top.y - scale * 0.35, r: scale * 0.3 });
  }
  // The racket: about a forearm and a half beyond the wrist, along the forearm.
  const w = opts.dominantWrist !== undefined ? pts[opts.dominantWrist] : null;
  const e = opts.dominantElbow !== undefined ? pts[opts.dominantElbow] : null;
  if (w && e) {
    const len = Math.max(dist(w, e), scale * 0.35);
    const ux = (w.x - e.x) / Math.max(1, dist(w, e)), uy = (w.y - e.y) / Math.max(1, dist(w, e));
    out.push(...alongSegment(w, { x: w.x + ux * len * 1.6, y: w.y + uy * len * 1.6 }, limb * 1.3));
  }
  return out;
}

/** Pose image points (0..1) to canvas pixels, leaving out the ones the model is unsure of. */
export function visiblePoints(pts: ImagePoint[] | null | undefined, toCanvas: (p: Pt) => Pt, minV = 0.3): (Pt | null)[] {
  return (pts ?? []).map((p) => (p && p.v >= minV ? toCanvas(p) : null));
}

export function inflate(b: Box, m: number): Box {
  return { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
}

function discInBox(d: Disc, b: Box) {
  const cx = Math.max(b.x, Math.min(b.x + b.w, d.x));
  const cy = Math.max(b.y, Math.min(b.y + b.h, d.y));
  return (d.x - cx) ** 2 + (d.y - cy) ** 2 < d.r * d.r;
}

/** How many body discs a box touches. */
export function bodyHits(b: Box, body: Disc[]): number {
  let n = 0;
  for (const d of body) if (discInBox(d, b)) n++;
  return n;
}

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Body discs crossed by the leader from the anchor to the label. */
function leaderHits(a: Pt, c: Pt, body: Disc[], skip: number) {
  let n = 0;
  const steps = 12;
  for (let k = 1; k <= steps; k++) {
    const p = { x: a.x + ((c.x - a.x) * k) / steps, y: a.y + ((c.y - a.y) * k) / steps };
    if (dist(p, a) < skip) continue;
    for (const d of body) if ((p.x - d.x) ** 2 + (p.y - d.y) ** 2 < d.r * d.r) { n++; break; }
  }
  return n;
}

export interface LabelRequest {
  /** The joint the label points at. */
  anchor: Pt;
  w: number;
  h: number;
  /** Where the coach put the label, if anywhere; kept whenever it is clear. */
  preferred?: Pt;
}

export interface PlaceOptions {
  body: Disc[];
  /** Areas already used by other text (a header, a gauge). */
  taken?: Box[];
  /** Where labels may go. */
  bounds: Box;
  /** Clear space kept around each label. */
  margin?: number;
  /** A typical leader length; the search starts here. */
  reach?: number;
}

/**
 * Label centres for each request, in order, so that no label covers the body or another label
 * when there is any free space to put it, staying as near its joint (or its preferred spot) as it can.
 */
export function placeLabels(labels: LabelRequest[], opts: PlaceOptions): Pt[] {
  const { body, bounds } = opts;
  const margin = opts.margin ?? 8;
  const reach = opts.reach ?? Math.min(bounds.w, bounds.h) * 0.12;
  const taken = [...(opts.taken ?? [])];
  const out: Pt[] = [];
  for (const l of labels) {
    const cands: Pt[] = [];
    if (l.preferred) cands.push(l.preferred);
    for (const f of [1, 1.4, 1.9, 2.5, 3.2, 4, 5]) {
      const r = reach * f;
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        // Labels read best beside the joint, so stretch the ring sideways by half a label.
        cands.push({ x: l.anchor.x + Math.cos(ang) * (r + l.w / 2), y: l.anchor.y + Math.sin(ang) * r });
      }
    }
    let best: Pt | null = null;
    let bestCost = Infinity;
    for (const [k, c] of cands.entries()) {
      // Keep the label inside the frame.
      const x = Math.max(bounds.x + l.w / 2, Math.min(bounds.x + bounds.w - l.w / 2, c.x));
      const y = Math.max(bounds.y + l.h / 2, Math.min(bounds.y + bounds.h - l.h / 2, c.y));
      const box = inflate({ x: x - l.w / 2, y: y - l.h / 2, w: l.w, h: l.h }, margin);
      let blocked = bodyHits(box, body) * 1000;
      for (const t of taken) blocked += (overlapArea(box, t) / (box.w * box.h)) * 4000;
      // The coach's own spot stands whenever it is clear.
      if (k === 0 && l.preferred && blocked === 0) { best = { x, y }; break; }
      const cost = blocked + leaderHits(l.anchor, { x, y }, body, reach * 0.35) * 25 + (dist({ x, y }, l.anchor) / reach) * 10
        + (l.preferred ? (dist({ x, y }, l.preferred) / reach) * 6 : 0);
      if (cost < bestCost) { bestCost = cost; best = { x, y }; }
    }
    const p = best ?? l.anchor;
    out.push(p);
    taken.push({ x: p.x - l.w / 2, y: p.y - l.h / 2, w: l.w, h: l.h });
  }
  return out;
}

/** The first of the candidate boxes that touches the least of the body (ties go to the earlier one). */
export function clearestBox(cands: Box[], body: Disc[]): { index: number; hits: number } {
  let index = 0, hits = Infinity;
  cands.forEach((b, i) => {
    const n = bodyHits(b, body);
    if (n < hits) { hits = n; index = i; }
  });
  return { index, hits };
}
