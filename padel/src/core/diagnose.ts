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

const GROUNDSTROKES = new Set(['forehand', 'backhand', 'lob', 'wall']);

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
  if (path < -8) adjust = 'Slice: keep the face slightly open and extend forward through the ball rather than chopping down.';
  else if (gap !== undefined && gap >= 22) adjust = 'Plenty of brush for topspin. If it sails long, keep the tempo and close the face a touch; if it nets, open it slightly.';
  else if (path >= 12) adjust = 'Low-to-high path. If the ball sails long, close the face a touch; for more spin, let the paddle rise a little more through contact while still swinging forward.';
  else adjust = 'Flat path. To clear the net with margin, start the paddle a little lower and let it travel up through contact, one change at a time.';
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
  shoulderTurn: { drill: 'Shadow swings: turn your shoulders before the paddle moves, ten reps, then the same on easy feeds.', question: 'Does the paddle go back before your shoulders turn?' },
  prepLead: { drill: 'Say "turn" out loud as the ball leaves the feeder\'s paddle and "hit" at contact. Aim to be turned by the bounce.', question: 'Do you feel rushed, or do you catch yourself swinging too soon?' },
  kneeBend: { drill: 'Feeds at knee height: sink into the legs on the backswing and push up as you swing.', question: 'Where do you feel the load: in your legs or in your arm?' },
  contactForward: { drill: 'Generous crosscourt target, count misses on each side. Wide to the hitting side means late; across the body means early.', question: 'Which side do most of your misses go to?' },
  elbowAngle: { drill: 'Set a cone a paddle-length beside your contact point and use small adjustment steps so the ball arrives there.', question: 'Do you run into the ball, or give it room?' },
  crossBody: { drill: 'Catch the paddle over the opposite shoulder after each swing, slow pace first.', question: 'Does your swing stop at contact or keep going?' },
  wristAboveShoulder: { drill: 'Feeds from the service line to the opposite box; finish with the hand above the shoulder and watch net clearance.', question: 'When the ball goes long, do you slow down or add lift?' },
  handsTogether: { drill: 'Two-handed shadow swings with both hands staying on the grip until the finish.', question: 'When does your top hand let go?' },
  swingPath: { drill: 'Change either the face or the path for each set of feeds, not both, and watch how high the ball clears the net.', question: 'When your forehand goes long, do you slow down or lift more?' },
  hipShoulderSep: { drill: 'Turn the shoulders past the hips on the backswing, pause, then let the hips start the swing. Slow shadow swings first.', question: 'When you try to hit harder, does your arm get ahead of your body?' },
  weightShift: { drill: 'Step-in feeds: load the back foot, then move into the ball and finish balanced on the front foot.', question: 'Where is your weight when you finish?' },
  legDrive: { drill: 'Bend and push up through the shot on easy feeds; feel the ground before adding speed.', question: 'Do your legs push, or stay still?' },
  chainSequence: { drill: 'Smooth shadow swings: feet, hips, chest, arm, paddle, with no pauses. Then easy feeds before adding speed.', question: 'What breaks down first when you swing harder: arm ahead, turn behind, or late contact?' },
  bodyPower: { drill: 'Hit at 60% pace with the arm relaxed and let the body turn swing it. Add pace only while contact stays clean.', question: 'Does more effort come from your arm or from your turn?' },
  tossArmUp: { drill: 'Toss-and-catch drill: hold the toss arm up until the paddle starts up.', question: 'Does your toss arm drop before you swing?' },
  contactHeight: { drill: 'Serve to a big target reaching up to full extension; let the ball drop if the toss is low.', question: 'Are you hitting at full reach?' },
};

/** One focus for the next session: the first fix in phase order, a drill for it and a question. */
export function practiceFocus(stroke: Stroke): PracticeFocus {
  const k = topFix(stroke);
  if (!k) {
    return {
      title: 'Keep this swing',
      why: 'Every checked point is on target for this stroke.',
      drill: 'Same feed, smaller target: keep the contact point and balance while you add pace a little at a time.',
      question: 'Can you repeat it when the ball comes faster?',
    };
  }
  const d = (k.metric && DRILLS[k.metric]) || { drill: 'Slow shadow swings with this one change, then easy feeds. Change one thing at a time so you can tell what helps.', question: 'Does it feel different, or just look different?' };
  return { title: k.text, why: 'This is the first fix in the stroke; earlier phases set up the later ones.', drill: d.drill, question: d.question, metric: k.metric };
}

/** Frame where the forward swing begins: end of the backswing (or the racket-up position on an overhead). */
export function forwardSwingStart(stroke: Stroke): number {
  const f = (id: string) => stroke.phases.find((p) => p.id === id)?.frame;
  return (f('trophy') ?? f('backswing')) ?? stroke.startFrame;
}

/** Frame where the forward swing ends: the follow-through (recovery stays unmarked). */
export function forwardSwingEnd(stroke: Stroke): number {
  return stroke.phases.find((p) => p.id === 'follow-through')?.frame ?? stroke.endFrame;
}
