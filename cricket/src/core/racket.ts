import type { Handedness, Vec3 } from './types';
import { add, len, scale, sub } from './geometry';
import { sides } from './landmarks';

/** Index-finger and pinky knuckle landmarks for each wrist (MediaPipe numbering). */
const KNUCKLES: Record<number, { index: number; pinky: number }> = { 15: { index: 19, pinky: 17 }, 16: { index: 20, pinky: 18 } };

/** A cricket bat reaches about 0.7 m from the bottom hand to the toe; the middle is about 0.5 m down. */
export const RACKET_LENGTH = 0.7;

export interface RacketPose {
  grip: Vec3;
  /** The middle of the bat (the sweet spot). */
  head: Vec3;
  tip: Vec3;
  /** Unit vector along the bat, handle to toe. */
  dir: Vec3;
  /** Unit vector out of the hitting face (the bottom palm's normal), when the knuckles are known. */
  face: Vec3 | null;
}

const unit = (v: Vec3) => {
  const l = len(v);
  return l < 1e-6 ? null : scale(v, 1 / l);
};
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * Estimated bat from the arms' world landmarks (metres), until a bat detector is added: both hands
 * are on the handle, so it runs from the top hand through the bottom hand, blended with the bottom
 * forearm; the face is taken to be parallel to the bottom palm.
 */
export function estimateRacket(w: Vec3[] | null, hand: Handedness): RacketPose | null {
  if (!w) return null;
  const { dom, non } = sides(hand);
  const wrist = w[dom.wrist];
  const fore = unit(sub(wrist, w[dom.elbow]));
  if (!fore) return null;
  const k = KNUCKLES[dom.wrist];
  const handle = len(sub(wrist, w[non.wrist])) > 0.05 ? unit(sub(wrist, w[non.wrist])) : null;
  const dir = (handle && unit(add(scale(handle, 0.65), scale(fore, 0.35)))) || fore;
  const palm = unit(cross(sub(w[k.index], wrist), sub(w[k.pinky], wrist)));
  return {
    grip: wrist,
    head: add(wrist, scale(dir, RACKET_LENGTH * 0.72)),
    tip: add(wrist, scale(dir, RACKET_LENGTH)),
    dir,
    face: palm,
  };
}
