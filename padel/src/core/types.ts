/** Shared data types for the analysis core. Pure data, no DOM. */
import type { BallReading } from './ball';

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

/**
 * Padel strokes. Groundstrokes: forehand (drive), backhand (revés), lob (globo) and the ball played
 * after it comes off the back glass (wall exit, salida de pared). Overheads: bandeja (sliced, control),
 * vibora (sidespin slice, attack) and smash (remate). Serve is underhand, hit at or below the waist.
 */
export type StrokeType =
  | 'forehand'
  | 'backhand'
  | 'serve'
  | 'volley'
  | 'bandeja'
  | 'vibora'
  | 'smash'
  | 'lob'
  | 'wall'
  | 'unknown';

/** Overheads share the side-on turn, racket-up position and contact above the head. */
export const OVERHEADS: readonly StrokeType[] = ['bandeja', 'vibora', 'smash'];
/** Strokes played from below after the bounce, with a turn, backswing and racket drop. */
export const GROUNDSTROKES: readonly StrokeType[] = ['forehand', 'backhand', 'lob', 'wall'];
export const isOverhead = (t: StrokeType) => OVERHEADS.includes(t);
export const isGroundstroke = (t: StrokeType) => GROUNDSTROKES.includes(t);

export type PhaseId = 'ready' | 'unit-turn' | 'ball-drop' | 'backswing' | 'trophy' | 'paddle-drop' | 'contact' | 'follow-through';

export interface Phase {
  id: PhaseId;
  /** 1-based number shown on the phase card ("1 Unit Turn"). */
  index: number;
  label: string;
  frame: number;
}

export type MetricId =
  | 'shoulderTurn'
  | 'elbowAngle'
  | 'kneeBend'
  | 'contactForward'
  | 'contactHeight'
  | 'handsTogether'
  | 'wristAboveShoulder'
  | 'crossBody'
  | 'tossArmUp'
  | 'swingPath'
  | 'hipTurn'
  | 'hipShoulderSep'
  | 'comDrop'
  | 'legDrive'
  | 'weightShift'
  | 'hipSpeed'
  | 'trunkSpeed'
  | 'chainSequence'
  | 'bodyPower'
  | 'faceTilt'
  | 'pathFaceGap'
  | 'prepLead'
  | 'contactBelowWaist'
  | 'contactSide';

export type Metrics = Partial<Record<MetricId, number>>;

/** Named joints a callout can point at, resolved per handedness. */
export type AnchorJoint =
  | 'domShoulder'
  | 'domElbow'
  | 'domWrist'
  | 'nonDomWrist'
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
  /** The target was adjusted for this ball timing. */
  stage?: BounceStage;
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

/** Where the ball is in its bounce at contact. */
export type BounceStage = 'rising' | 'peak' | 'falling';

export interface Stroke {
  id: string;
  type: StrokeType;
  startFrame: number;
  endFrame: number;
  contactFrame: number;
  peakSpeed: number;
  /** Groundstroke spin from the swing path into contact. */
  spin?: 'topspin' | 'flat' | 'slice';
  phases: Phase[];
  metrics: Partial<Record<PhaseId, Metrics>>;
  keyPoints: KeyPoint[];
  callouts: Callout[];
  note?: string;
  /** True when the type was set by hand, so re-analysis keeps it. */
  typeLocked?: boolean;
  /** Bounce stage at contact, set by the player in the Strike lab (otherwise estimated). */
  strikeStage?: BounceStage;
  /** Ball flight read from the video around this contact (null = looked, ball not found). */
  ballRead?: { contact: number; reading: BallReading | null };
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
  /**
   * Different targets (and words) when the ball is taken rising, at the peak or falling. The stage
   * comes from the ball's flight in the video, or the coach's setting in the Strike lab.
   */
  byStage?: Partial<Record<BounceStage, StageTarget>>;
}

export interface StageTarget {
  min?: number;
  max?: number;
  good?: string;
  fixLow?: string;
  fixHigh?: string;
}
