import { isOverhead, type Handedness, type Phase, type PhaseId, type PoseFrame, type StrokeType } from './types';
import { sides } from './landmarks';
import { backswingFrame, type StrokeWindow } from './strokes';

export const PHASE_LABEL: Record<PhaseId, string> = {
  ready: 'Ready',
  'unit-turn': 'Unit Turn',
  'ball-drop': 'Ball Drop',
  backswing: 'Backswing',
  trophy: 'Paddle Up',
  'paddle-drop': 'Paddle Drop',
  contact: 'Contact',
  'follow-through': 'Follow-Through',
};

export function phaseOrder(type: StrokeType): PhaseId[] {
  if (type === 'serve') return ['ready', 'ball-drop', 'backswing', 'contact', 'follow-through'];
  if (type === 'volley') return ['ready', 'unit-turn', 'contact', 'follow-through'];
  if (isOverhead(type)) return ['ready', 'unit-turn', 'trophy', 'contact', 'follow-through'];
  return ['ready', 'unit-turn', 'backswing', 'paddle-drop', 'contact', 'follow-through'];
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
 * Groundstrokes (forehand, backhand, lob, off the glass): ready → unit turn (half the backswing's shoulder
 * turn) → backswing (wrist furthest back) → racket drop (wrist lowest) → contact (wrist-speed peak)
 * → follow-through (wrist highest after contact).
 * Overheads (bandeja, víbora, smash): ready → unit turn → racket up (free hand highest) → contact (hitting
 * wrist highest) → follow-through (hitting wrist lowest after contact).
 * Underhand serve: ready → ball drop (free hand lowest) → backswing → contact → follow-through.
 * Volley: ready → set (short take-back) → contact → short finish.
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
  let contact = win.contact;
  const { dom, non } = sides(hand);
  const frameOf: Partial<Record<PhaseId, number>> = {};
  const afterLimit = Math.min(end, contact + Math.round(0.8 * fps));

  const turnAt = (i: number) => Math.abs(yawSeries[i] - yawSeries[start]);
  const unitBefore = (until: number) => {
    const target = turnAt(until) * 0.5;
    for (let i = start; i <= until; i++) if (turnAt(i) >= target) return i < until ? i : Math.round((start + until) / 2);
    return Math.round((start + until) / 2);
  };
  if (isOverhead(type)) {
    // Contact refined to the highest hitting wrist near the speed peak.
    const r = Math.round(0.1 * fps);
    const c = argBest(Math.max(start, contact - r), Math.min(end, contact + r), (i) => -y(frames, i, dom.wrist));
    if (c >= 0) contact = c;
    // Racket up: the free hand points up at the ball highest, with the racket cocked behind the head.
    const up = argBest(start, contact - 1, (i) => -y(frames, i, non.wrist));
    const tr = up >= 0 ? up : Math.round((start + contact) / 2);
    frameOf.ready = start;
    frameOf['unit-turn'] = unitBefore(tr);
    frameOf.trophy = tr;
    frameOf.contact = contact;
    const ft = argBest(contact + 1, afterLimit, (i) => y(frames, i, dom.wrist));
    frameOf['follow-through'] = ft >= 0 ? ft : afterLimit;
  } else if (type === 'serve') {
    // Ball drop: the free hand at its lowest after letting go; backswing: hitting wrist furthest back.
    const back = backswingFrame(frames, start, contact, contact, hand);
    const drop = argBest(start, Math.max(start, back - 1), (i) => y(frames, i, non.wrist));
    frameOf.ready = start;
    frameOf['ball-drop'] = drop >= 0 ? drop : Math.round((start + back) / 2);
    frameOf.backswing = back;
    frameOf.contact = contact;
    const ft = argBest(contact + 1, afterLimit, (i) => -y(frames, i, dom.wrist));
    frameOf['follow-through'] = ft >= 0 ? ft : afterLimit;
  } else if (type === 'volley') {
    const back = backswingFrame(frames, start, contact, contact, hand);
    frameOf.ready = start;
    frameOf['unit-turn'] = back > start ? back : Math.round((start + contact) / 2);
    frameOf.contact = contact;
    // Volleys stop short: the finish is where the hand slows down after contact.
    const short = Math.min(afterLimit, contact + Math.round(0.25 * fps));
    frameOf['follow-through'] = short;
  } else {
    const back = backswingFrame(frames, start, contact, contact, hand);
    const unit = unitBefore(back);
    const drop = argBest(back + 1, contact - 1, (i) => y(frames, i, dom.wrist));
    const ft = argBest(contact + 1, afterLimit, (i) => -y(frames, i, dom.wrist));
    frameOf.ready = start;
    frameOf['unit-turn'] = unit;
    frameOf.backswing = back;
    frameOf['paddle-drop'] = drop >= 0 ? drop : Math.round((back + contact) / 2);
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
