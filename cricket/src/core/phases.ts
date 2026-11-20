import type { Handedness, Phase, PhaseId, PoseFrame, StrokeType } from './types';
import { isBowling, sides } from './landmarks';
import { handsMid, type StrokeWindow } from './strokes';
import { actionSpeed } from './strokes';

export const PHASE_LABEL: Record<PhaseId, string> = {
  stance: 'Stance',
  backlift: 'Backlift',
  stride: 'Stride',
  downswing: 'Downswing',
  impact: 'Impact',
  'run-up': 'Run-up',
  gather: 'Gather',
  'back-foot': 'Back-foot Contact',
  'front-foot': 'Front-foot Contact',
  release: 'Release',
  'follow-through': 'Follow-through',
};

export const BATTING_PHASES: PhaseId[] = ['stance', 'backlift', 'stride', 'downswing', 'impact', 'follow-through'];
export const BOWLING_PHASES: PhaseId[] = ['run-up', 'gather', 'back-foot', 'front-foot', 'release', 'follow-through'];

export function phaseOrder(type: StrokeType): PhaseId[] {
  return isBowling(type) ? BOWLING_PHASES : BATTING_PHASES;
}

/** The phase where the bat meets the ball, or the ball leaves the hand. */
export const contactPhase = (type: StrokeType): PhaseId => (isBowling(type) ? 'release' : 'impact');

const wy = (frames: PoseFrame[], i: number, idx: number) => frames[i]?.world?.[idx].y ?? NaN;
/** Height above the hips (y is down in the pose), so a crouch does not read as a lower hand. */
const rel = (frames: PoseFrame[], i: number, y: number) => {
  const w = frames[i]?.world;
  return w ? (w[23].y + w[24].y) / 2 - y : NaN;
};

function argBest(from: number, to: number, score: (i: number) => number): number {
  let best = -1;
  let bestV = -Infinity;
  for (let i = from; i <= to; i++) {
    const v = score(i);
    if (!Number.isNaN(v) && v > bestV) { bestV = v; best = i; }
  }
  return best;
}

/** Image speed of one landmark (frame heights per second). */
function imageSpeed(frames: PoseFrame[], idx: number, fps: number): number[] {
  return frames.map((_, i) => {
    const a = frames[i - 1]?.image?.[idx], b = frames[i + 1]?.image?.[idx];
    if (!a || !b || a.v < 0.3 || b.v < 0.3) return NaN;
    return (Math.hypot(b.x - a.x, b.y - a.y) * fps) / 2;
  });
}

/**
 * A foot plant in [from, to]: the foot's last swing (its speed peak), then the first frame it has
 * slowed to under a third of that speed. -1 when the foot did not move.
 */
export function footPlant(frames: PoseFrame[], ankle: number, from: number, to: number, fps: number): number {
  const sp = imageSpeed(frames, ankle, fps);
  let peak = -1;
  for (let i = to; i >= from; i--) {
    const v = sp[i];
    if (Number.isNaN(v)) continue;
    // The latest clear swing: a local maximum above a small threshold.
    if (v > 0.35 && v >= (sp[i - 1] ?? 0) && v >= (sp[i + 1] ?? 0)) { peak = i; break; }
  }
  if (peak < 0) return -1;
  for (let i = peak + 1; i <= to; i++) if (!(sp[i] > sp[peak] / 3)) return i;
  return -1;
}

/**
 * Pick the key frame of each phase inside a window.
 * Batting: stance → backlift (hands highest) → stride (front foot lands) → downswing (hands speeding
 * up) → impact (hand-speed peak) → follow-through (hands highest after impact).
 * Bowling: run-up → gather (front arm highest) → back-foot contact → front-foot contact →
 * release (bowling hand highest near its speed peak) → follow-through (bowling hand lowest).
 */
export function findPhases(frames: PoseFrame[], win: StrokeWindow, type: StrokeType, hand: Handedness, fps: number): Phase[] {
  const { start, end } = win;
  let contact = win.contact;
  const { dom, non } = sides(hand);
  const frameOf: Partial<Record<PhaseId, number>> = {};
  const afterLimit = Math.min(end, contact + Math.round(0.8 * fps));
  const sec = (s: number) => Math.max(1, Math.round(s * fps));

  if (isBowling(type)) {
    const r = sec(0.08);
    const c = argBest(Math.max(start, contact - r), Math.min(end, contact + r), (i) => -wy(frames, i, dom.wrist));
    if (c >= 0) contact = c;
    let ffc = footPlant(frames, non.ankle, Math.max(start, contact - sec(0.4)), contact - 1, fps);
    if (ffc < 0) ffc = Math.max(start + 3, contact - sec(0.12));
    let bfc = footPlant(frames, dom.ankle, Math.max(start, ffc - sec(0.45)), ffc - 1, fps);
    if (bfc < 0) bfc = Math.max(start + 2, ffc - sec(0.18));
    const gather = argBest(Math.max(start + 1, bfc - sec(0.6)), bfc - 1, (i) => rel(frames, i, wy(frames, i, non.wrist)));
    frameOf['run-up'] = start;
    frameOf.gather = gather >= 0 ? gather : Math.round((start + bfc) / 2);
    frameOf['back-foot'] = bfc;
    frameOf['front-foot'] = ffc;
    frameOf.release = contact;
    const ft = argBest(contact + 1, afterLimit, (i) => -rel(frames, i, wy(frames, i, dom.wrist)));
    frameOf['follow-through'] = ft >= 0 ? ft : afterLimit;
  } else {
    const handsUp = (i: number) => { const w = frames[i]?.world; return w ? rel(frames, i, handsMid(w).y) : NaN; };
    const back = argBest(Math.max(start, contact - sec(1.0)), contact - 2, handsUp);
    const top = back >= 0 ? back : Math.round((start + contact) / 2);
    let stride = footPlant(frames, non.ankle, Math.max(start, top - sec(0.35)), contact - 1, fps);
    if (stride <= top) stride = Math.round((top + contact) / 2);
    const sp = actionSpeed(frames, fps, hand, 'batting');
    let down = -1;
    for (let i = stride + 1; i < contact; i++) if (sp[i] >= 0.5 * (sp[contact] || 0)) { down = i; break; }
    if (down < 0) down = Math.round((stride + contact) / 2);
    const ft = argBest(contact + 1, afterLimit, handsUp);
    frameOf.stance = start;
    frameOf.backlift = top;
    frameOf.stride = stride;
    frameOf.downswing = down;
    frameOf.impact = contact;
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
