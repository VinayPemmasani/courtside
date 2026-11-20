import JSZip from 'jszip';
import { METRIC_INFO, newId, PHASE_LABEL, type MetricId } from '../core';
import { STROKE_LABEL } from '../labels';
import { store, SESSION_KINDS, type Player, type Session } from './db';

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

/**
 * All of a session's numbers as CSV: one row per stroke with every phase metric and the key
 * points.
 */
export function sessionCsv(session: Session, player: Player): string {
  const metricIds = Object.keys(METRIC_INFO) as MetricId[];
  const phaseIds = [...new Set(session.strokes.flatMap((s) => s.phases.map((p) => p.id)))];
  const cols = phaseIds.flatMap((p) => metricIds.map((m) => [p, m] as const))
    .filter(([p, m]) => session.strokes.some((s) => s.metrics[p]?.[m] !== undefined));
  const kind = SESSION_KINDS.find((k) => k.id === session.kind)?.label ?? '';
  const t = (frame: number) => (session.start + frame / session.fps).toFixed(2);

  const rows: unknown[][] = [
    ['Player', player.name, 'Hand', player.hand, 'Discipline', session.discipline, 'Session', session.title, 'Type', kind, 'Date', new Date(session.createdAt).toISOString()],
    [],
    ['Shot / delivery', 'Type', 'Impact or release time (s)', 'Peak hand speed (m/s)', 'Fixes', 'Good points',
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
  return csv(rows);
}

const BUNDLE_VERSION = 1;

/** A session as one file a teammate can import: the analysis as JSON plus the original video. */
export async function sessionBundle(session: Session, player: Player): Promise<Blob> {
  const zip = new JSZip();
  zip.file('creaseline.json', JSON.stringify({ version: BUNDLE_VERSION, app: 'creaseline', player: { name: player.name, hand: player.hand }, session }));
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
    throw new Error('This file is not a Creaseline session.');
  }
  const meta = await zip.file('creaseline.json')?.async('string');
  if (!meta) throw new Error('This file is not a Creaseline session.');
  const data = JSON.parse(meta);
  if (data.app !== 'creaseline' || !data.session?.frames) throw new Error('This file is not a Creaseline session.');
  if (data.version > BUNDLE_VERSION) throw new Error('This session was shared from a newer Creaseline. Update the app to open it.');

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
