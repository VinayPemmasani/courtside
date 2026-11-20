/**
 * Plain-language readings of a shot or delivery: one practice focus for the next session (one fix,
 * one drill, one question) and the frames of the forward swing. Pure functions; no DOM.
 */
import type { MetricId, Stroke } from './types';
import { isBowling } from './landmarks';
import { topFix } from './rules';

export interface PracticeFocus {
  /** The thing to work on (the first fix in phase order), or a "keep it" note. */
  title: string;
  why: string;
  drill: string;
  question: string;
  metric?: MetricId;
}

const DRILLS: Partial<Record<MetricId, { drill: string; question: string }>> = {
  backliftHeight: { drill: 'Shadow bat in front of a mirror: lift the bat as the bowler\'s arm comes over, toe of the bat pointing to the sky at the top.', question: 'Is the bat up and ready when the ball is released?' },
  handsTogether: { drill: 'Grip check before every ball in the nets: both Vs pointing between the splice and the outside edge, hands touching.', question: 'Do the hands drift apart when you play hard shots?' },
  strideLength: { drill: 'Cone drill: place a cone where the ball pitches on throw-downs and step your front foot next to it.', question: 'Do you step to the ball, or wait for it on the crease?' },
  headOverFront: { drill: 'Throw-downs with a hand on the knee: lean until your head is over the front knee before the bat comes down.', question: 'Where is your head when the ball hits the bat?' },
  frontKnee: { drill: 'Hold the finish for three seconds after every forward shot; adjust the stride until the front knee is bent but steady.', question: 'Can you hold your balance after the shot?' },
  frontElbowHigh: { drill: 'Top-hand-only drives with a light bat: the front elbow points at the ball as you play.', question: 'Does the bottom hand take over the shot?' },
  handsUnderEyes: { drill: 'Drop-ball drill: the feeder drops a ball from shoulder height; play it after the bounce under your eyes.', question: 'Are you reaching for the ball or letting it come?' },
  weightShift: { drill: 'Step-and-drive: start on the back foot, step in and finish with the back heel off the ground.', question: 'Which foot is your weight on when you finish?' },
  finishHeight: { drill: 'Full swings on a batting tee, holding a high finish over the front shoulder.', question: 'Does your bat stop at the ball?' },
  shoulderTurn: { drill: 'Pull shots off a short throw-down: rotate on the back foot so the chest faces square leg at the finish.', question: 'Do the arms do the work, or the body?' },
  headStill: { drill: 'Watch the ball onto the bat with a still head: the feeder calls a colour on the ball and you name it.', question: 'Do you see the ball hit the bat?' },
  batSpeed: { drill: 'Underarm feeds into an empty net: swing through to a full finish, not at the ball.', question: 'Do you slow down just before impact?' },
  elbowExtension: { drill: 'Wall bowling with a straight arm, then bowl at 50% with the elbow kept braced from the gather to release. Film side-on at 120+ fps.', question: 'Does the arm bend as it comes past the head?' },
  frontKneeFlex: { drill: 'Bound-and-brace: from three steps, land on a firm front leg and freeze at release for a count of two.', question: 'Do you feel the front leg give as you land?' },
  counterRotation: { drill: 'Slow walk-throughs from a standing start: keep the chest and hips facing the same way into the crease.', question: 'Does your back hurt after a long spell?' },
  hipShoulderSep: { drill: 'Choose your action (side-on or front-on) and walk through the back-foot contact slowly with hips and shoulders matched.', question: 'Do your feet point one way and your chest another?' },
  releaseHeight: { drill: 'Bowl over a raised target (a high-jump bar or a pole held by a team-mate) to get the hand higher.', question: 'Are you releasing at the top of your reach?' },
  armFromVertical: { drill: 'Arm brushes the ear: shadow bowl and hold the arm against the head at release.', question: 'Does the arm come round instead of over?' },
  trunkSideBend: { drill: 'Walk-throughs focusing on bowling tall over the front leg; stop at release and check the trunk is upright.', question: 'Does the head fall away at release?' },
  frontArmUp: { drill: 'Gather freeze: jump into the gather and hold the front arm up high, then pull it down hard into the hip.', question: 'Where does the front arm go at release?' },
  followAcross: { drill: 'Finish drill: after each ball, the bowling hand finishes past the front hip.', question: 'Do you stop the arm at release?' },
  chainSequence: { drill: 'Medicine-ball throws from a side-on stance: step, hips, chest, arm, in that order.', question: 'When you try for more pace, does the arm get ahead of the body?' },
};

/** One focus for the next session: the first fix in phase order, a drill for it and a question. */
export function practiceFocus(stroke: Stroke): PracticeFocus {
  const k = topFix(stroke);
  if (!k) {
    return isBowling(stroke.type)
      ? { title: 'Keep this action', why: 'Every checked point is on target for this delivery.', drill: 'Same run-up, smaller target: a cone on a good length. Add pace a little at a time while the action stays the same.', question: 'Does the action hold up late in a spell?' }
      : { title: 'Keep this shot', why: 'Every checked point is on target for this shot.', drill: 'Same shot, quicker feeds: ask for throw-downs a little faster while the shape stays the same.', question: 'Can you repeat it against a quicker ball?' };
  }
  const d = (k.metric && DRILLS[k.metric]) || { drill: 'Slow shadow repetitions with this one change, then easy feeds. Change one thing at a time so you can tell what helps.', question: 'Does it feel different, or just look different?' };
  return { title: k.text, why: 'This is the first fix in the action; earlier phases set up the later ones.', drill: d.drill, question: d.question, metric: k.metric };
}

/** Frame where the forward swing begins: the top of the backlift, or back-foot contact for a delivery. */
export function forwardSwingStart(stroke: Stroke): number {
  const f = (id: string) => stroke.phases.find((p) => p.id === id)?.frame;
  return (isBowling(stroke.type) ? f('back-foot') : f('backlift')) ?? stroke.startFrame;
}

/** Frame where the forward swing ends: the follow-through. */
export function forwardSwingEnd(stroke: Stroke): number {
  return stroke.phases.find((p) => p.id === 'follow-through')?.frame ?? stroke.endFrame;
}
