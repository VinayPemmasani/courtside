import { courtLines, courtMap, type CourtCalibration, type Vec2 } from '../core';
import type { PlacedBounce } from '../storage/share';
import { COLORS, MONO, toCanvas, type View } from './overlay';

/** Draws the calibrated court lines, any corners tapped so far and the bounces near this frame. */
export function drawCourtOverlay(view: View, cal: CourtCalibration | undefined, pending: Vec2[], bounces: PlacedBounce[], frame: number, fps: number, selected?: string) {
  const { ctx, H } = view;
  ctx.save();
  const map = cal ? courtMap(cal) : null;
  if (map) {
    ctx.strokeStyle = 'rgba(67, 214, 196, 0.8)';
    ctx.lineWidth = Math.max(1.5, H / 400);
    ctx.setLineDash([H / 80, H / 120]);
    for (const [a, b] of courtLines(cal!.lines)) {
      const pa = map.toImage(a);
      const pb = map.toImage(b);
      if (!pa || !pb) continue;
      const ca = toCanvas(view, pa);
      const cb = toCanvas(view, pb);
      ctx.beginPath();
      ctx.moveTo(ca.x, ca.y);
      ctx.lineTo(cb.x, cb.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Corners tapped while calibrating.
  pending.forEach((p, i) => {
    const c = toCanvas(view, p);
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(c.x, c.y, H / 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.font = `bold ${Math.round(H / 60)}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), c.x, c.y + 1);
  });
  // Bounces show for half a second either side of the landing frame.
  if (map) {
    const near = Math.round(fps * 0.5);
    for (const b of bounces) {
      if (Math.abs(b.frame - frame) > near && b.id !== selected) continue;
      const img = map.toImage(b.at);
      if (!img) continue;
      const c = toCanvas(view, img);
      const col = b.inside ? COLORS.teal : COLORS.fix;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, H / 250);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, H / 45, H / 110, 0, 0, Math.PI * 2);
      ctx.stroke();
      const label = `${b.inside ? 'IN' : 'OUT'}${b.speed ? ` · ${Math.round(b.speed)} km/h` : ''}`;
      ctx.font = `bold ${Math.round(H / 40)}px ${MONO}`;
      const w = ctx.measureText(label).width + H / 40;
      const h = H / 24;
      ctx.fillStyle = col;
      ctx.fillRect(c.x - w / 2, c.y - h - H / 40, w, h);
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c.x, c.y - h / 2 - H / 40);
    }
  }
  ctx.restore();
}

/** Canvas pixel → normalised image point (inverse of toCanvas). */
export function fromCanvas(view: Pick<View, 'W' | 'H' | 'vw' | 'vh' | 'crop'>, p: { x: number; y: number }): Vec2 {
  return {
    x: ((p.x / view.W) * view.crop.sw + view.crop.sx) / view.vw,
    y: ((p.y / view.H) * view.crop.sh + view.crop.sy) / view.vh,
  };
}
