import type { AnchorJoint, Discipline, Handedness, StrokeType } from './types';

export const BATTING_TYPES: StrokeType[] = ['drive', 'pull', 'cut', 'defence'];
export const BOWLING_TYPES: StrokeType[] = ['pace', 'spin'];
export const isBowling = (t: StrokeType) => t === 'pace' || t === 'spin';
export const disciplineOf = (t: StrokeType): Discipline => (isBowling(t) ? 'bowling' : 'batting');

/** MediaPipe Pose landmark indices (the person's own left and right). */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const LANDMARK_COUNT = 33;

/** Bones drawn for the skeleton overlay. */
export const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
];

export interface Side {
  shoulder: number;
  elbow: number;
  wrist: number;
  hip: number;
  knee: number;
  ankle: number;
}

const LEFT: Side = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 };
const RIGHT: Side = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };

/**
 * For a right-hander, `dom` is the right side (the batter's bottom hand and back leg, the bowler's
 * bowling arm and back leg) and `non` the left (top hand, front arm, front leg). Left-handers mirror.
 */
export function sides(hand: Handedness): { dom: Side; non: Side } {
  return hand === 'right' ? { dom: RIGHT, non: LEFT } : { dom: LEFT, non: RIGHT };
}

/** Landmark indices whose average gives the anchor position. */
export function anchorIndices(anchor: AnchorJoint, hand: Handedness, kneeIndex?: number): number[] {
  const { dom, non } = sides(hand);
  switch (anchor) {
    case 'domShoulder': return [dom.shoulder];
    case 'domElbow': return [dom.elbow];
    case 'domWrist': return [dom.wrist];
    case 'nonDomWrist': return [non.wrist];
    case 'nonDomElbow': return [non.elbow];
    case 'frontKnee': return [non.knee];
    case 'frontFoot': return [non.ankle];
    case 'shoulders': return [11, 12];
    case 'hips': return [23, 24];
    case 'knee': return [kneeIndex ?? dom.knee];
    case 'head': return [LM.nose];
  }
}
