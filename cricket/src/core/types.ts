/** Shared data types for the analysis core. Pure data, no DOM. */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A 2D image landmark: x/y normalised to 0..1 of the video frame, v = visibility 0..1. */
export interface ImagePoint extends Vec2 {
  v: number;
}

/**
 * One analysed video frame.
 * `image` is used for drawing; `world` (metres, origin at the hip centre, y pointing down)
 * is used for every measurement, so angles do not depend on camera distance.
 */
export interface PoseFrame {
  t: number;
  image: ImagePoint[] | null;
  world: Vec3[] | null;
}

export type Handedness = 'right' | 'left';

/** Batting strokes and bowling deliveries. */
export type StrokeType = 'drive' | 'pull' | 'cut' | 'defence' | 'pace' | 'spin' | 'unknown';

/** What a session films: a batter or a bowler. */
export type Discipline = 'batting' | 'bowling';

export type PhaseId =
  // Batting
  | 'stance' | 'backlift' | 'stride' | 'downswing' | 'impact'
  // Bowling
  | 'run-up' | 'gather' | 'back-foot' | 'front-foot' | 'release'
  // Both
  | 'follow-through';

export interface Phase {
  id: PhaseId;
  /** 1-based number shown on the phase card ("1 Unit Turn"). */
  index: number;
  label: string;
  frame: number;
}

export type MetricId =
  // Batting
  | 'backliftHeight'
  | 'headOverFront'
  | 'headStill'
  | 'frontKnee'
  | 'strideLength'
  | 'frontElbowHigh'
  | 'handsTogether'
  | 'handsUnderEyes'
  | 'shoulderTurn'
  | 'finishHeight'
  | 'batSpeed'
  // Bowling
  | 'elbowExtension'
  | 'frontKneeFlex'
  | 'releaseHeight'
  | 'armFromVertical'
  | 'trunkSideBend'
  | 'frontArmUp'
  | 'counterRotation'
  | 'followAcross'
  | 'armSpeed'
  // Whole body (both)
  | 'kneeBend'
  | 'hipTurn'
  | 'hipShoulderSep'
  | 'weightShift'
  | 'hipSpeed'
  | 'trunkSpeed'
  | 'chainSequence'
  | 'bodyPower';

export type Metrics = Partial<Record<MetricId, number>>;

/** Named joints a callout can point at, resolved per handedness. */
export type AnchorJoint =
  | 'domShoulder'
  | 'domElbow'
  | 'domWrist'
  | 'nonDomWrist'
  | 'nonDomElbow'
  | 'frontKnee'
  | 'frontFoot'
  | 'shoulders'
  | 'hips'
  | 'knee'
  | 'head';

export type Status = 'good' | 'fix' | 'info';

export interface KeyPoint {
  id: string;
  phaseId: PhaseId;
  ruleId?: string;
  text: string;
  status: Status;
  metric?: MetricId;
  value?: number;
  min?: number;
  max?: number;
  /** Set once a coach edits or adds the key point; re-evaluation keeps it. */
  edited?: boolean;
}

export interface Callout {
  id: string;
  phaseId: PhaseId;
  ruleId?: string;
  label: string;
  anchor: AnchorJoint;
  status: Status;
  /** Label offset from the joint, in normalised frame units. */
  dx: number;
  dy: number;
  hidden?: boolean;
  edited?: boolean;
}

export interface Stroke {
  id: string;
  type: StrokeType;
  startFrame: number;
  endFrame: number;
  contactFrame: number;
  /** Peak hand speed (bat hands, or the bowling hand at release), m/s. */
  peakSpeed: number;
  phases: Phase[];
  metrics: Partial<Record<PhaseId, Metrics>>;
  keyPoints: KeyPoint[];
  callouts: Callout[];
  note?: string;
  /** True when the type was set by hand, so re-analysis keeps it. */
  typeLocked?: boolean;
}

export interface Rule {
  id: string;
  strokes: StrokeType[];
  phase: PhaseId;
  metric: MetricId;
  min?: number;
  max?: number;
  /** Text shown when the value is inside the range. `{nonDom}` and `{dom}` become left/right. */
  good: string;
  /** Text when below `min` (or the only fix text). */
  fixLow: string;
  /** Text when above `max`; falls back to fixLow. */
  fixHigh?: string;
  anchor: AnchorJoint;
  goodLabel: string;
  fixLabel: string;
  enabled: boolean;
}
