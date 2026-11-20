import JSZip from 'jszip';
import {
  callBounce, courtMap, METRIC_INFO, newId, PHASE_LABEL, shotSpeed,
  type BounceCall, type MetricId, type PoseFrame, type Stroke,
} from '../core';
import { STROKE_LABEL } from '../labels';
import { store, SESSION_KINDS, type Player, type Session } from './db';

/** One bounce with its line call and speed, ready to draw or export. */
export interface PlacedBounce extends BounceCall {
  id: string;
  frame: number;
  stroke?: Stroke;
  speed: number | null;
}

/** Line calls and speeds for every bounce in a calibrated session. */
export function placeBounces(session: Session, frames: PoseFrame[] = session.frames): PlacedBounce[] {
  if (!session.court) return [];
  const map = courtMap(session.court);
  if (!map) return [];
  const out: PlacedBounce[] = [];
  for (const b of session.bounces ?? []) {
    const at = map.toCourt({ x: b.u, y: b.v });
    if (!at) continue;
    const stroke = session.strokes.find((s) => s.id === b.strokeId);
    const serve = b.serve ?? (stroke?.type === 'serve' || session.kind === 'serve');
    const call = callBounce(at, { serve, lines: session.court.lines });
    const speed = stroke ? shotSpeed(map, frames, stroke.contactFrame, { frame: b.frame, at }, session.fps) : null;
    out.push({ ...call, id: b.id, frame: b.frame, stroke, speed });
  }
  return out;
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

/**
 * All of a session's numbers as CSV: one row per stroke with every phase metric and the key
 * points, then one row per bounce with its call and speed.
 */
export function sessionCsv(session: Session, player: Player): string {
  const metricIds = Object.keys(METRIC_INFO) as MetricId[];
  const phaseIds = [...new Set(session.strokes.flatMap((s) => s.phases.map((p) => p.id)))];
  const cols = phaseIds.flatMap((p) => metricIds.map((m) => [p, m] as const))
    .filter(([p, m]) => session.strokes.some((s) => s.metrics[p]?.[m] !== undefined));
  const kind = SESSION_KINDS.find((k) => k.id === (session.kind ?? 'rally'))?.label;
  const t = (frame: number) => (session.start + frame / session.fps).toFixed(2);

  const rows: unknown[][] = [
    ['Player', player.name, 'Hand', player.hand, 'Session', session.title, 'Type', kind, 'Date', new Date(session.createdAt).toISOString()],
    [],
    ['Stroke', 'Type', 'Contact time (s)', 'Peak hand speed (m/s)', 'Fixes', 'Good points',
      ...cols.map(([p, m]) => `${PHASE_LABEL[p]} ${METRIC_INFO[m].label}${METRIC_INFO[m].unit ? ` (${METRIC_INFO[m].unit})` : ''}`),
      'Key points', 'Coach note'],
    ...session.strokes.map((s, i) => [
      i + 1, STROKE_LABEL[s.type], t(s.contactFrame), Number.isFinite(s.peakSpeed) ? s.peakSpeed.toFixed(2) : '',
      s.keyPoints.filter((k) => k.status === 'fix').length, s.keyPoints.filter((k) => k.status === 'good').length,
      ...cols.map(([p, m]) => { const v = s.metrics[p]?.[m]; return v === undefined ? '' : v.toFixed(METRIC_INFO[m].digits); }),
      s.keyPoints.map((k) => `${k.status === 'fix' ? 'FIX' : k.status === 'good' ? 'GOOD' : 'NOTE'}: ${k.text}`).join(' | '),
      s.note ?? '',
    ]),
  ];
  const placed = placeBounces(session);
  if (placed.length) {
    rows.push([], ['Bounce', 'Time (s)', 'Stroke', 'Call', 'Margin (cm)', 'Deciding line', 'Depth', 'Direction', 'Across (m)', 'Along (m)', 'Speed (km/h)']);
    placed.forEach((b, i) => rows.push([
      i + 1, t(b.frame), b.stroke ? `${session.strokes.indexOf(b.stroke) + 1} ${STROKE_LABEL[b.stroke.type]}` : '',
      b.inside ? 'IN' : 'OUT', Math.round(b.margin * 100), b.line, b.depth, b.direction,
      b.at.x.toFixed(2), b.at.y.toFixed(2), b.speed ? Math.round(b.speed) : '',
    ]));
  }
  return csv(rows);
}

const BUNDLE_VERSION = 1;

/** A session as one file a teammate can import: the analysis as JSON plus the original video. */
export async function sessionBundle(session: Session, player: Player): Promise<Blob> {
  const zip = new JSZip();
  zip.file('vidrio.json', JSON.stringify({ version: BUNDLE_VERSION, app: 'vidrio', player: { name: player.name, hand: player.hand }, session }));
  const video = await store.video(session.id);
  if (video) zip.file('video', video);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

/**
 * Imports a shared session. The player is matched by name and hand, or added; the session gets a
 * new id so importing twice never overwrites anything.
 */
export async function importBundle(file: Blob): Promise<{ session: Session; player: Player }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a Vidrio session.');
  }
  const meta = await zip.file('vidrio.json')?.async('string');
  if (!meta) throw new Error('This file is not a Vidrio session.');
  const data = JSON.parse(meta);
  if (data.app !== 'vidrio' || !data.session?.frames) throw new Error('This file is not a Vidrio session.');
  if (data.version > BUNDLE_VERSION) throw new Error('This session was shared from a newer Vidrio. Update the app to open it.');

  const players = await store.players();
  let player = players.find((p) => p.name === data.player.name && p.hand === data.player.hand);
  if (!player) {
    player = { id: newId('pl'), name: data.player.name, hand: data.player.hand, createdAt: Date.now() };
    await store.savePlayer(player);
  }
  const session: Session = { ...data.session, id: newId('se'), playerId: player.id };
  const video = await zip.file('video')?.async('blob');
  if (video) await store.saveVideo(session.id, video);
  await store.saveSession(session);
  return { session, player };
}
