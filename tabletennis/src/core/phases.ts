import type { Handedness, Phase, PhaseId, PoseFrame, StrokeType } from './types';
import { sides } from './landmarks';
import { backswingFrame, type StrokeWindow } from './strokes';

export const PHASE_LABEL: Record<PhaseId, string> = {
  ready: 'Ready',
  'unit-turn': 'Turn',
  backswing: 'Backswing',
  trophy: 'Toss',
  'racket-drop': 'Low Point',
  contact: 'Contact',
  'follow-through': 'Finish',
};

/** Short strokes over the table (push, flick, block) have no separate turn or low point. */
export const SHORT_STROKES = new Set<StrokeType>(['push', 'flick', 'block']);

export function phaseOrder(type: StrokeType): PhaseId[] {
  if (type === 'serve') return ['ready', 'trophy', 'racket-drop', 'contact', 'follow-through'];
  if (SHORT_STROKES.has(type)) return ['ready', 'backswing', 'contact', 'follow-through'];
  return ['ready', 'unit-turn', 'backswing', 'racket-drop', 'contact', 'follow-through'];
}

const y = (frames: PoseFrame[], i: number, idx: number) => frames[i]?.world?.[idx].y ?? NaN;

function argBest(from: number, to: number, score: (i: number) => number): number {
  let best = -1;
  let bestV = -Infinity;
  for (let i = from; i <= to; i++) {
    const v = score(i);
    if (!Number.isNaN(v) && v > bestV) { bestV = v; best = i; }
  }
  return best;
}

/**
 * Pick the key frame of each phase inside a stroke window.
 * Loops and drives: ready → turn (half the backswing's shoulder turn) → backswing (wrist furthest back)
 * → low point (wrist lowest before the forward swing) → contact (wrist-speed peak) → finish (wrist
 * highest after contact, which on a good loop is around the forehead, not over the shoulder).
 * Short strokes: ready → backswing → contact → finish (wrist furthest forward after contact).
 * Serve: ready → toss (free hand highest) → low point (the bat furthest back before it accelerates)
 * → contact (wrist-speed peak, the ball is struck low, near table height) → finish.
 */
export function findPhases(
  frames: PoseFrame[],
  win: StrokeWindow,
  type: StrokeType,
  hand: Handedness,
  fps: number,
  yawSeries: number[],
): Phase[] {
  const { start, end } = win;
  const contact = win.contact;
  const { dom, non } = sides(hand);
  const frameOf: Partial<Record<PhaseId, number>> = {};
  const afterLimit = Math.min(end, contact + Math.round(0.4 * fps));
  // Wrist travel from its contact position (m), for the end of a short finish.
  const away = (i: number) => {
    const a = frames[i]?.world, b = frames[contact]?.world;
    if (!a || !b) return NaN;
    return Math.hypot(a[dom.wrist].x - b[dom.wrist].x, a[dom.wrist].y - b[dom.wrist].y, a[dom.wrist].z - b[dom.wrist].z);
  };

  if (type === 'serve') {
    const trophy = argBest(start, contact - 2, (i) => -y(frames, i, non.wrist));
    const tr = trophy >= 0 ? trophy : Math.round((start + contact) / 2);
    const back = backswingFrame(frames, tr + 1, contact, contact, hand);
    frameOf.ready = start;
    frameOf.trophy = tr;
    frameOf['racket-drop'] = back > tr && back < contact ? back : Math.round((tr + contact) / 2);
    frameOf.contact = contact;
    const ft = argBest(contact + 1, afterLimit, away);
    frameOf['follow-through'] = ft >= 0 ? ft : afterLimit;
  } else if (SHORT_STROKES.has(type)) {
    const back = backswingFrame(frames, start, contact, contact, hand);
    frameOf.ready = start;
    frameOf.backswing = back;
    frameOf.contact = contact;
    const ft = argBest(contact + 1, afterLimit, away);
    frameOf['follow-through'] = ft >= 0 ? ft : afterLimit;
  } else {
    const back = backswingFrame(frames, start, contact, contact, hand);
    const turnAt = (i: number) => Math.abs(yawSeries[i] - yawSeries[start]);
    const target = turnAt(back) * 0.5;
    let unit = -1;
    for (let i = start; i <= back; i++) if (turnAt(i) >= target) { unit = i; break; }
    if (unit < 0 || unit >= back) unit = Math.round((start + back) / 2);
    const drop = argBest(back + 1, contact - 1, (i) => y(frames, i, dom.wrist));
    const ft = argBest(contact + 1, afterLimit, (i) => -y(frames, i, dom.wrist));
    frameOf.ready = start;
    frameOf['unit-turn'] = unit;
    frameOf.backswing = back;
    frameOf['racket-drop'] = drop >= 0 ? drop : Math.round((back + contact) / 2);
    frameOf.contact = contact;
    frameOf['follow-through'] = ft >= 0 ? ft : afterLimit;
  }

  // Keep the phases strictly in time order.
  const order = phaseOrder(type);
  let prev = -1;
  return order.map((id, i) => {
    let f = Math.max(frameOf[id] ?? prev + 1, prev + 1);
    f = Math.min(f, end - (order.length - 1 - i));
    prev = f;
    return { id, index: i + 1, label: PHASE_LABEL[id], frame: f };
  });
}
