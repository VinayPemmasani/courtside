/**
 * Plain-language readings of a stroke's numbers: contact timing, swing path against racket face,
 * and one practice focus for the next session (one fix, one drill, one question).
 * Pure functions; no DOM.
 */
import type { Handedness, MetricId, Rule, Stroke } from './types';
import { topFix } from './rules';

export type Timing = 'early' | 'on time' | 'late';

export interface ContactTiming {
  timing: Timing;
  /** Wrist in front of the hips at contact (m). */
  value: number;
  min?: number;
  max?: number;
  /** What a miss in that direction usually looks like, and what to check. */
  hint: string;
}

/** Loops and drives: the strokes with a full swing whose timing and path can be read. */
const GROUNDSTROKES = new Set(['forehand', 'backhand']);

/**
 * Early / on time / late from how far in front of the hips the hand meets the ball, using the
 * stroke's own contact rule range so a coach's tuning carries through.
 */
export function contactTiming(stroke: Stroke, rules: Rule[], hand: Handedness): ContactTiming | undefined {
  if (!GROUNDSTROKES.has(stroke.type)) return undefined;
  const value = stroke.metrics.contact?.contactForward;
  if (value === undefined || Number.isNaN(value)) return undefined;
  const rule = rules.find((r) => r.enabled && r.metric === 'contactForward' && r.phase === 'contact' && r.strokes.includes(stroke.type));
  const min = rule?.min ?? 0.15;
  const max = rule?.max ?? 0.75;
  const timing: Timing = value < min ? 'late' : value > max ? 'early' : 'on time';
  const fh = stroke.type === 'forehand';
  // For a forehand the hitting side is the dominant side; for a backhand it is the other side.
  const hitSide = fh ? hand : hand === 'right' ? 'left' : 'right';
  const across = hitSide === 'right' ? 'left' : 'right';
  const hint =
    timing === 'late'
      ? `Late contact tends to push the ball toward your hitting side (to the ${hitSide}). Start the turn earlier and meet the ball further in front.`
      : timing === 'early'
        ? `Early contact tends to pull the ball across your body (to the ${across}). Let the ball come a little closer before you swing.`
        : `Contact point is in a repeatable spot. If the ball still sprays, check spacing and racket face before timing.`;
  return { timing, value, min, max, hint };
}

export interface PathFace {
  path: number;
  face?: number;
  gap?: number;
  summary: string;
  /** One adjustment to try, by the miss the player sees. */
  adjust: string;
}

/**
 * Swing path into contact against the (estimated) racket-face angle. The bigger the gap between
 * where the racket travels and where the strings face, the more topspin the ball gets, which lets a
 * fast ball clear the net and still drop in.
 */
export function pathVsFace(stroke: Stroke): PathFace | undefined {
  if (!GROUNDSTROKES.has(stroke.type)) return undefined;
  const c = stroke.metrics.contact;
  const path = c?.swingPath;
  if (path === undefined || Number.isNaN(path)) return undefined;
  const face = c?.faceTilt;
  const gap = c?.pathFaceGap;
  const dir = path >= 0 ? `${Math.round(path)}° upward` : `${Math.round(-path)}° downward`;
  let summary = `The racket travels ${dir} into contact`;
  if (face !== undefined && gap !== undefined) {
    const f = face >= 0 ? `tilted ${Math.round(face)}° closed` : `tilted ${Math.round(-face)}° open`;
    summary += ` with the face ${f}, about ${Math.round(Math.abs(gap))}° between swing and strings.`;
  } else summary += '.';
  let adjust: string;
  if (path < -8) adjust = 'Downward path, like a chop. Against backspin, open the bat a little and swing up through the ball instead.';
  else if (gap !== undefined && gap >= 22) adjust = 'Plenty of brush for a spinny loop. If it goes long, close the bat a touch; if it hits the net, swing more up.';
  else if (path >= 12) adjust = 'Low-to-high loop path. If the ball goes long, close the bat angle; against heavy backspin, start lower and lift more.';
  else adjust = 'Flat path, more of a drive. For a safer loop, start the bat a little lower and brush up the back of the ball, one change at a time.';
  return { path, face, gap, summary, adjust };
}

export interface PracticeFocus {
  /** The thing to work on (the first fix in phase order), or a "keep it" note. */
  title: string;
  why: string;
  drill: string;
  question: string;
  metric?: MetricId;
}

const DRILLS: Partial<Record<MetricId, { drill: string; question: string }>> = {
  shoulderTurn: { drill: 'Shadow strokes: turn the waist before the bat moves, ten reps, then the same on multiball feeds.', question: 'Does your arm go back before your waist turns?' },
  prepLead: { drill: 'Say "turn" as your partner hits and "hit" at contact. Aim to be ready before the ball bounces on your side.', question: 'Do you feel rushed, or do you catch yourself swinging late?' },
  kneeBend: { drill: 'Footwork drill (Falkenberg): 2 backhands, 1 forehand from the backhand corner, staying low all the time.', question: 'Do your legs stay bent between shots, or do you stand up?' },
  contactForward: { drill: 'Multiball to one spot: aim for contact in front of the body. Count where misses go: wide on your hitting side means late.', question: 'Which side do most of your misses go to?' },
  elbowAngle: { drill: 'Shadow loops in front of a mirror: elbow bent about 110 degrees, forearm whips through. Then multiball, slow pace.', question: 'Is your arm relaxed, or locked straight?' },
  crossBody: { drill: 'Forehand loops to one corner; freeze at the finish with the bat in front of your forehead, then back to ready.', question: 'Are you ready for the next ball as soon as you finish?' },
  wristAboveShoulder: { drill: 'Loop against backspin multiball: bat starts at knee height and finishes at the forehead. Watch the net clearance.', question: 'When the ball hits the net, do you lift more or hit harder?' },
  tossRise: { drill: 'Serve practice with a bucket of balls: toss from a flat open palm, at least 16 cm up, and strike it on the way down.', question: 'Does your toss go straight up, or toward the table?' },
  swingPath: { drill: 'Change the bat angle or the swing path for each set of balls, not both, and watch how high the ball clears the net.', question: 'When your loop goes long, do you close the bat or slow down?' },
  hipShoulderSep: { drill: 'Turn the shoulders past the hips on the backswing, pause, then let the waist start the forward swing. Slow shadow loops first.', question: 'When you try to hit harder, does your arm get ahead of your waist?' },
  weightShift: { drill: 'Shadow loops shifting weight from the back leg to the front leg on every stroke, then on multiball.', question: 'Which foot is your weight on when you finish?' },
  legDrive: { drill: 'Loop against backspin from a deep knee bend; feel the push from the floor before adding speed.', question: 'Do your legs push, or stay still?' },
  chainSequence: { drill: 'Smooth shadow loops: legs, waist, shoulder, forearm, wrist, without stopping. Then multiball before adding speed.', question: 'What breaks down first when you swing harder?' },
  bodyPower: { drill: 'Loop at 60% pace with a relaxed arm and let the waist turn swing it. Add pace only while contact stays clean.', question: 'Does more effort come from your arm or from your waist?' },
};

/** One focus for the next session: the first fix in phase order, a drill for it and a question. */
export function practiceFocus(stroke: Stroke): PracticeFocus {
  const k = topFix(stroke);
  if (!k) {
    return {
      title: 'Keep this swing',
      why: 'Every checked point is on target for this stroke.',
      drill: 'Same feed, smaller target: keep the contact point and balance while you add pace or spin a little at a time.',
      question: 'Can you repeat it when the ball comes faster?',
    };
  }
  const d = (k.metric && DRILLS[k.metric]) || { drill: 'Slow shadow strokes with this one change, then multiball. Change one thing at a time so you can tell what helps.', question: 'Does it feel different, or just look different?' };
  return { title: k.text, why: 'This is the first fix in the stroke; earlier phases set up the later ones.', drill: d.drill, question: d.question, metric: k.metric };
}

/** Frame where the forward swing begins: end of the backswing (or the racket drop on a serve). */
export function forwardSwingStart(stroke: Stroke): number {
  const f = (id: string) => stroke.phases.find((p) => p.id === id)?.frame;
  return (stroke.type === 'serve' ? f('racket-drop') : f('backswing')) ?? stroke.startFrame;
}

/** Frame where the forward swing ends: the follow-through (recovery stays unmarked). */
export function forwardSwingEnd(stroke: Stroke): number {
  return stroke.phases.find((p) => p.id === 'follow-through')?.frame ?? stroke.endFrame;
}
