import type { StrokeType } from './core';

export const STROKE_LABEL: Record<StrokeType, string> = {
  forehand: 'Forehand',
  backhand: 'Backhand',
  serve: 'Serve',
  volley: 'Volley',
  bandeja: 'Bandeja',
  vibora: 'Víbora',
  smash: 'Smash',
  lob: 'Lob',
  wall: 'Off the back glass',
  unknown: 'Unclassified',
};

/** The Spanish court names players use, shown beside the English label. */
export const STROKE_ES: Partial<Record<StrokeType, string>> = {
  forehand: 'Derecha',
  backhand: 'Revés',
  serve: 'Saque',
  volley: 'Volea',
  smash: 'Remate',
  lob: 'Globo',
  wall: 'Salida de pared',
};

export const STROKE_TYPES: StrokeType[] = ['forehand', 'backhand', 'volley', 'bandeja', 'vibora', 'smash', 'lob', 'wall', 'serve', 'unknown'];


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
