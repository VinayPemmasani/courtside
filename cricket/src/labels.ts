import type { Discipline, StrokeType } from './core';

export const STROKE_LABEL: Record<StrokeType, string> = {
  drive: 'Drive',
  pull: 'Pull',
  cut: 'Cut',
  defence: 'Defence',
  pace: 'Pace delivery',
  spin: 'Spin delivery',
  unknown: 'Unclassified',
};

export const STROKE_TYPES: StrokeType[] = ['drive', 'pull', 'cut', 'defence', 'pace', 'spin', 'unknown'];

export const DISCIPLINE_LABEL: Record<Discipline, string> = { batting: 'Batting', bowling: 'Bowling' };

/** "shot" or "delivery", for sentences. */
export const actionWord = (d: Discipline | undefined, plural = false) => (d === 'bowling' ? (plural ? 'deliveries' : 'delivery') : plural ? 'shots' : 'shot');

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};

/** Video timestamp to the hundredth of a second ("0:04.27"), precise enough to check a single phase frame. */
export const fmtStamp = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, '0')}`;
};

export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
