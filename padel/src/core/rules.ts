import type { BounceStage, Callout, Handedness, KeyPoint, Metrics, PhaseId, Rule, StageTarget, Status, Stroke } from './types';

const FH: Rule['strokes'] = ['forehand'];
const BH: Rule['strokes'] = ['backhand'];
const SV: Rule['strokes'] = ['serve'];
const VO: Rule['strokes'] = ['volley'];
const BJ: Rule['strokes'] = ['bandeja'];
const VB: Rule['strokes'] = ['vibora'];
const SM: Rule['strokes'] = ['smash'];
const LB: Rule['strokes'] = ['lob'];
const WL: Rule['strokes'] = ['wall'];
const GS: Rule['strokes'] = ['forehand', 'backhand'];
const OH: Rule['strokes'] = ['bandeja', 'vibora', 'smash'];

/*
 * Padel groundstrokes are shorter than tennis ones: the ball is slower, bounces lower and there is a
 * glass wall behind you, so the targets favour a compact take-back, low knees, contact in front and a
 * finish toward the target rather than a big topspin wrap.
 *
 * How the body positions change with the ball's timing (all groundstrokes):
 * - Rising: the ball reaches you sooner and faster, so turn earlier, keep the backswing compact,
 *   meet it further in front and use its pace (less weight transfer and leg drive needed), with a
 *   flatter, more forward finish.
 * - Peak: the reference ranges, with the ball at a comfortable height, so stand a little taller.
 * - Falling: there is more time but the ball has lost pace and height, so take a full turn, load the
 *   legs, let it come a little closer, push up and forward to make your own pace, and finish high to
 *   lift it over the net.
 */
const PREP: Rule['byStage'] = {
  rising: { min: 0.45, fixLow: 'A rising ball reaches you sooner after the bounce: be fully turned before it lands.', good: 'Turned early enough to take the ball on the rise.' },
  falling: { min: 0.3 },
};
const TURN = (min: number, risingMax: number, max: number): Rule['byStage'] => ({
  rising: { min: min - 10, max: risingMax, fixHigh: 'Rising ball: shorten the backswing so the paddle is ready in time; turn the shoulders, not the arm.', good: 'Compact turn, right for a ball on the rise.' },
  falling: { min: min + 5, max, fixLow: 'Dropping ball: you have time, so take a full turn to make your own pace.' },
});
const KNEES: Rule['byStage'] = {
  rising: { min: 100, max: 150, fixHigh: 'Rising ball: get low and stay down through it so you can meet it early.' },
  peak: { min: 105, max: 158, fixLow: 'At the top of the bounce the ball is high: stay taller instead of sinking.' },
  falling: { min: 95, max: 140, fixHigh: 'Dropping ball: bend more so you can get under it and lift it up.' },
};
const FRONT = (min: number, max: number): Rule['byStage'] => ({
  rising: { min: min + 0.1, max: max + 0.05, fixLow: 'Rising ball: meet it earlier and further in front, before it climbs past you.' },
  falling: { min: Math.max(0, min - 0.05), max: max - 0.1, fixHigh: 'Dropping ball: let it come a little closer instead of reaching for it.' },
});
const WEIGHT: Rule['byStage'] = {
  rising: { min: 15, good: 'Weight steady: a rising ball brings its own pace.' },
  falling: { min: 35, fixLow: 'Dropping ball has little pace left: step in and drive your weight forward to make your own.' },
};
const LEGS: Rule['byStage'] = {
  rising: { min: 4, good: 'Stays down through a rising ball.' },
  falling: { min: 12, fixLow: 'Dropping ball: push up with your legs to lift it over the net.' },
};
const POWER: Rule['byStage'] = {
  rising: { min: 30 },
  falling: { min: 40, fixLow: 'Dropping ball: the pace has to come from you; rotate hips and trunk through the shot.' },
};
const FINISH = (min: number): Rule['byStage'] => ({
  rising: { min: min - 0.1, good: 'Finishes forward and through, right for a rising ball.', fixLow: 'Even on the rise, swing through and finish at shoulder height.' },
  falling: { min: min + 0.05, fixLow: 'Dropping ball: swing up more and finish high to lift it over the net.' },
});

/** The ball timing that rule targets use: the coach's setting, else the ball's flight in the video. */
export function strokeStage(stroke: Pick<Stroke, 'strikeStage' | 'ballRead'>): BounceStage | undefined {
  return stroke.strikeStage ?? stroke.ballRead?.reading?.stage;
}

/** The rule with its targets and words for this ball timing. */
export function ruleForStage(rule: Rule, stage: BounceStage | undefined): Rule & { stage?: BounceStage } {
  const t: StageTarget | undefined = stage ? rule.byStage?.[stage] : undefined;
  if (!t) return rule;
  return {
    ...rule,
    min: 'min' in t ? t.min : rule.min,
    max: 'max' in t ? t.max : rule.max,
    good: t.good ?? rule.good,
    fixLow: t.fixLow ?? rule.fixLow,
    fixHigh: t.fixHigh ?? rule.fixHigh,
    stage,
  };
}

/**
 * Starting target ranges. They are deliberately broad defaults for a coach to tune in
 * Coach settings; every key point shows the measured value behind it.
 */
export const DEFAULT_RULES: Rule[] = [
  // Forehand (derecha)
  { id: 'fh-unit-turn', strokes: FH, phase: 'unit-turn', metric: 'shoulderTurn', min: 30, good: 'Shoulders start turning early.', fixLow: 'Turn your shoulders as soon as you read the ball, before it reaches you.', anchor: 'shoulders', goodLabel: 'Shoulders turned', fixLabel: 'Turn earlier', enabled: true },
  { id: 'fh-compact', strokes: FH, phase: 'backswing', metric: 'shoulderTurn', min: 50, max: 110, good: 'Compact turn: enough to drive the ball without a big tennis take-back.', fixLow: 'Turn a little further so your chest faces the side glass.', fixHigh: 'Your take-back is too big for padel; keep the paddle in front of your back shoulder.', anchor: 'shoulders', goodLabel: 'Compact turn', fixLabel: 'Shorter take-back', enabled: true, byStage: TURN(50, 90, 110) },
  { id: 'fh-knees', strokes: FH, phase: 'backswing', metric: 'kneeBend', min: 100, max: 150, good: 'Low and loaded: down at the height of the ball.', fixLow: 'Very deep knee bend; stay a little taller to stay balanced.', fixHigh: 'The ball stays low in padel: bend your knees and get down to it.', anchor: 'knee', goodLabel: 'Knees bent', fixLabel: 'Get lower', enabled: true, byStage: KNEES },
  { id: 'fh-contact-front', strokes: FH, phase: 'contact', metric: 'contactForward', min: 0.15, max: 0.7, good: 'Contact out in front of the body.', fixLow: 'Meet the ball in front of your front hip, not beside you.', fixHigh: 'Contact is very far out front; let the ball come a bit closer.', anchor: 'domWrist', goodLabel: 'Contact out front', fixLabel: 'Hit further in front', enabled: true, byStage: FRONT(0.15, 0.7) },
  { id: 'fh-arm-space', strokes: FH, phase: 'contact', metric: 'elbowAngle', min: 100, good: 'Hitting arm has room at contact.', fixLow: 'Your arm is cramped at contact; give yourself more space from the ball.', anchor: 'domElbow', goodLabel: 'Arm has space', fixLabel: 'Cramped arm', enabled: true },
  { id: 'fh-finish', strokes: FH, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.25, max: 0.3, good: 'Finishes toward the target at about shoulder height.', fixLow: 'Swing through the ball and finish toward your target, not down by the hip.', fixHigh: 'A big high finish sends the ball up to the glass; finish forward toward your target.', anchor: 'domWrist', goodLabel: 'Finish to target', fixLabel: 'Finish to target', enabled: true },

  // Backhand (revés)
  { id: 'bh-hand-throat', strokes: BH, phase: 'unit-turn', metric: 'handsTogether', max: 0.25, good: '{NonDom} hand on the paddle turns it back.', fixLow: '', fixHigh: 'Take the paddle back with your {nonDom} hand on the throat.', anchor: 'nonDomWrist', goodLabel: '{NonDom} hand on paddle', fixLabel: '{NonDom} hand on paddle', enabled: true },
  { id: 'bh-turn', strokes: BH, phase: 'backswing', metric: 'shoulderTurn', min: 60, max: 130, good: 'Shoulders turned so your back starts to face the net.', fixLow: 'Turn your shoulders further so your back starts to face the net.', fixHigh: 'You over-rotate; turn a little less so you are ready for the next ball.', anchor: 'shoulders', goodLabel: 'Shoulders turned', fixLabel: 'Turn further', enabled: true, byStage: TURN(60, 100, 130) },
  { id: 'bh-knees', strokes: BH, phase: 'backswing', metric: 'kneeBend', min: 100, max: 150, good: 'Low and loaded: down at the height of the ball.', fixLow: 'Very deep knee bend; stay a little taller.', fixHigh: 'Bend your knees and get down to the ball.', anchor: 'knee', goodLabel: 'Knees bent', fixLabel: 'Get lower', enabled: true, byStage: KNEES },
  { id: 'bh-contact-front', strokes: BH, phase: 'contact', metric: 'contactForward', min: 0.2, max: 0.8, good: 'Contact well in front, ahead of the front foot.', fixLow: 'Meet the ball earlier, in front of your front foot.', fixHigh: 'Contact is very far out front; let the ball come a bit closer.', anchor: 'domWrist', goodLabel: 'Contact out front', fixLabel: 'Hit further in front', enabled: true, byStage: FRONT(0.2, 0.8) },
  { id: 'bh-arm', strokes: BH, phase: 'contact', metric: 'elbowAngle', min: 130, good: 'Hitting arm long and firm at contact.', fixLow: 'Lead with the elbow less and lengthen the arm through contact.', anchor: 'domElbow', goodLabel: 'Long arm', fixLabel: 'Lengthen arm', enabled: true },
  { id: 'bh-finish', strokes: BH, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.2, max: 0.35, good: 'Finishes forward, toward the target.', fixLow: 'Extend through the ball toward your target.', fixHigh: 'Finish forward, not up; a high finish lifts the ball onto the glass.', anchor: 'domWrist', goodLabel: 'Finish to target', fixLabel: 'Finish to target', enabled: true },

  // Groundstroke power and timing (forehand, backhand)
  { id: 'gs-separation', strokes: GS, phase: 'backswing', metric: 'hipShoulderSep', min: 15, good: 'Shoulders coil past the hips: the trunk is stretched like a spring.', fixLow: 'Turn your shoulders further than your hips so the trunk can uncoil into the ball.', anchor: 'hips', goodLabel: 'Hip-shoulder stretch', fixLabel: 'Coil shoulders past hips', enabled: true },
  { id: 'gs-weight', strokes: GS, phase: 'contact', metric: 'weightShift', min: 25, good: 'Weight moves from the back foot into the front foot.', fixLow: 'Step in and move your weight forward into the shot.', anchor: 'hips', goodLabel: 'Weight forward', fixLabel: 'Move weight forward', enabled: true, byStage: WEIGHT },
  { id: 'gs-chain', strokes: GS, phase: 'contact', metric: 'chainSequence', min: 2, good: 'Hips, then trunk, then arm: power flows up the chain.', fixLow: 'Start the swing with the hips; let the trunk pull the arm through.', anchor: 'hips', goodLabel: 'Kinetic chain', fixLabel: 'Hips lead the swing', enabled: true },
  { id: 'gs-body-power', strokes: GS, phase: 'contact', metric: 'bodyPower', min: 30, good: 'Much of the paddle speed comes from body rotation, not just the arm.', fixLow: 'You are mostly arming the ball; rotate your hips and trunk through the shot.', anchor: 'shoulders', goodLabel: 'Body power', fixLabel: 'Use the body, not the arm', enabled: true, byStage: POWER },
  { id: 'gs-prep', strokes: [...GS, 'wall', 'lob'], phase: 'unit-turn', metric: 'prepLead', min: 0.35, good: 'Turn starts early, leaving time to organise contact.', fixLow: 'Start your turn as soon as you read the ball, so you are set by the bounce instead of rushing.', anchor: 'shoulders', goodLabel: 'Early preparation', fixLabel: 'Prepare earlier', enabled: true, byStage: PREP },

  // Off the back glass (salida de pared): turn to the glass early, stay low, let the ball come out, hit forward.
  { id: 'wl-turn', strokes: WL, phase: 'backswing', metric: 'shoulderTurn', min: 70, max: 150, good: 'Turned side-on to the glass, ready for the rebound.', fixLow: 'Turn your shoulders toward the back glass as soon as you see the ball will reach it.', fixHigh: 'Turned too far; keep your chest to the side glass so you can still swing forward.', anchor: 'shoulders', goodLabel: 'Side-on to glass', fixLabel: 'Turn to the glass', enabled: true },
  { id: 'wl-knees', strokes: WL, phase: 'backswing', metric: 'kneeBend', min: 95, max: 145, good: 'Low and patient, waiting for the ball to come off the glass.', fixLow: 'Very deep; stay a little taller so you can move.', fixHigh: 'Sit lower while you wait for the rebound; the ball drops as it comes off the glass.', anchor: 'knee', goodLabel: 'Low and patient', fixLabel: 'Sit lower', enabled: true },
  { id: 'wl-contact', strokes: WL, phase: 'contact', metric: 'contactForward', min: 0.0, max: 0.6, good: 'Let the ball come out and met it beside or just in front of you.', fixLow: 'You hit it too close to the glass; wait for it to come out to your front hip.', fixHigh: 'You reached for it; let it come out further from the glass.', anchor: 'domWrist', goodLabel: 'Let it come out', fixLabel: 'Wait for the ball', enabled: true },
  { id: 'wl-finish', strokes: WL, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.15, good: 'Lifts the ball up and forward out of the corner.', fixLow: 'Lift through the ball and finish up toward the net to clear it.', anchor: 'domWrist', goodLabel: 'Lift it out', fixLabel: 'Lift and finish up', enabled: true },

  // Lob (globo)
  { id: 'lb-knees', strokes: LB, phase: 'paddle-drop', metric: 'kneeBend', min: 95, max: 150, good: 'Knees bent to get under the ball.', fixLow: 'Very deep; stay a little taller.', fixHigh: 'Bend your knees to get under the ball and lift it.', anchor: 'knee', goodLabel: 'Under the ball', fixLabel: 'Get under it', enabled: true },
  { id: 'lb-path', strokes: LB, phase: 'contact', metric: 'swingPath', min: 20, good: 'Swings up under the ball to send it high over the net players.', fixLow: 'Swing more from low to high to lift the ball over the players at the net.', anchor: 'domWrist', goodLabel: 'Low to high', fixLabel: 'Swing up more', enabled: true },
  { id: 'lb-front', strokes: LB, phase: 'contact', metric: 'contactForward', min: 0.05, good: 'Contact in front, so the paddle face controls the height.', fixLow: 'Meet the ball in front of you, not beside your hip.', anchor: 'domWrist', goodLabel: 'Contact in front', fixLabel: 'Hit in front', enabled: true },
  { id: 'lb-finish', strokes: LB, phase: 'follow-through', metric: 'wristAboveShoulder', min: 0.15, good: 'High, long finish toward the sky.', fixLow: 'Hold the paddle face open and finish high above your shoulder.', anchor: 'domWrist', goodLabel: 'Finish high', fixLabel: 'Finish higher', enabled: true },

  // Volley (volea): short, firm, in front.
  { id: 'vo-short', strokes: VO, phase: 'unit-turn', metric: 'shoulderTurn', max: 60, good: 'Short take-back: just a turn of the shoulders.', fixLow: '', fixHigh: 'Too much take-back for a volley; turn the shoulders and keep the paddle in front of you.', anchor: 'shoulders', goodLabel: 'Short take-back', fixLabel: 'Shorter take-back', enabled: true },
  { id: 'vo-front', strokes: VO, phase: 'contact', metric: 'contactForward', min: 0.2, good: 'Volley met well in front.', fixLow: 'Punch the volley in front of your body, not beside it.', anchor: 'domWrist', goodLabel: 'Out in front', fixLabel: 'Meet it in front', enabled: true },
  { id: 'vo-arm', strokes: VO, phase: 'contact', metric: 'elbowAngle', min: 100, max: 165, good: 'Firm arm with a slight bend.', fixLow: 'Arm too bent; reach out a little more toward the ball.', fixHigh: 'Locked arm; keep a slight bend so you can block and guide the ball.', anchor: 'domElbow', goodLabel: 'Firm arm', fixLabel: 'Firm, slight bend', enabled: true },
  { id: 'vo-knees', strokes: VO, phase: 'contact', metric: 'kneeBend', min: 100, max: 160, good: 'Knees flexed to stay balanced at the net.', fixLow: 'Very deep; stay a little taller at the net.', fixHigh: 'Bend your knees, especially for low volleys; do not just drop the paddle.', anchor: 'knee', goodLabel: 'Knees flexed', fixLabel: 'Bend knees', enabled: true },
  { id: 'vo-finish', strokes: VO, phase: 'follow-through', metric: 'crossBody', max: 0.2, good: 'Short finish toward the target.', fixLow: '', fixHigh: 'Stop the paddle toward the target; a long finish across the body costs control at the net.', anchor: 'domWrist', goodLabel: 'Short finish', fixLabel: 'Shorter finish', enabled: true },

  // Overheads shared (bandeja, víbora, smash): side-on, free arm up, racket up and back.
  { id: 'oh-side-on', strokes: OH, phase: 'trophy', metric: 'shoulderTurn', min: 65, good: 'Side-on to the net with the shoulders turned.', fixLow: 'Turn side-on as the ball goes up, {nonDom} shoulder to the net.', anchor: 'shoulders', goodLabel: 'Side-on', fixLabel: 'Turn side-on', enabled: true },
  { id: 'oh-free-arm', strokes: OH, phase: 'trophy', metric: 'tossArmUp', min: 0.0, good: '{NonDom} arm up, pointing at the ball.', fixLow: 'Point your {nonDom} hand up at the ball to line it up and keep your shoulders level.', anchor: 'nonDomWrist', goodLabel: 'Free arm up', fixLabel: 'Point at the ball', enabled: true },
  { id: 'oh-paddle-up', strokes: OH, phase: 'trophy', metric: 'wristAboveShoulder', min: 0.05, good: 'Paddle up and ready early, beside the head.', fixLow: 'Take the paddle up early, beside your head, before the ball comes down.', anchor: 'domWrist', goodLabel: 'Paddle up early', fixLabel: 'Paddle up early', enabled: true },

  // Bandeja: control. Contact in front, not at full stretch, slice forward, finish forward.
  { id: 'bj-front', strokes: BJ, phase: 'contact', metric: 'contactForward', min: 0.1, good: 'Ball met in front of the body.', fixLow: 'Let the ball come in front of you; a bandeja hit behind the head goes long into the glass.', anchor: 'domWrist', goodLabel: 'In front', fixLabel: 'Contact in front', enabled: true },
  { id: 'bj-height', strokes: BJ, phase: 'contact', metric: 'contactHeight', min: 0.05, max: 0.4, good: 'Contact a little above the head, not at full stretch.', fixLow: 'Contact too low; move back so you meet it above your head.', fixHigh: 'Full stretch is for the smash; let the ball drop a little and slice it for control.', anchor: 'domWrist', goodLabel: 'Contact height', fixLabel: 'Let it drop a little', enabled: true },
  { id: 'bj-arm', strokes: BJ, phase: 'contact', metric: 'elbowAngle', min: 115, max: 165, good: 'Arm long but not locked: a controlled slice.', fixLow: 'Arm too bent; lengthen it to reach the ball in front.', fixHigh: 'Do not lock the arm; a bandeja is a controlled slice, not a smash.', anchor: 'domElbow', goodLabel: 'Controlled arm', fixLabel: 'Do not lock the arm', enabled: true },
  { id: 'bj-finish', strokes: BJ, phase: 'follow-through', metric: 'crossBody', max: 0.25, good: 'Finishes forward toward the target, with the body staying side-on.', fixLow: '', fixHigh: 'Do not pull across the body; finish forward toward the target and stay side-on.', anchor: 'domWrist', goodLabel: 'Finish forward', fixLabel: 'Finish forward', enabled: true },

  // Víbora: attack. Contact beside the head, longer arm, finish across the body.
  { id: 'vb-side', strokes: VB, phase: 'contact', metric: 'contactSide', min: 0.25, good: 'Ball met beside the body, out to the {dom} side.', fixLow: 'Let the ball come to your {dom} side; the víbora is struck beside the head, not above it.', anchor: 'domWrist', goodLabel: 'Out to the side', fixLabel: 'Contact to the side', enabled: true },
  { id: 'vb-arm', strokes: VB, phase: 'contact', metric: 'elbowAngle', min: 140, good: 'Long arm through the ball for a fast, cutting swing.', fixLow: 'Lengthen your arm through contact to cut across the ball.', anchor: 'domElbow', goodLabel: 'Long arm', fixLabel: 'Lengthen arm', enabled: true },
  { id: 'vb-finish', strokes: VB, phase: 'follow-through', metric: 'crossBody', min: 0.1, good: 'Cuts across and finishes by the {nonDom} hip.', fixLow: 'Cut across the ball and finish down by your {nonDom} hip.', anchor: 'domWrist', goodLabel: 'Cut across', fixLabel: 'Finish across', enabled: true },
  { id: 'vb-chain', strokes: VB, phase: 'contact', metric: 'chainSequence', min: 2, good: 'Hips and trunk turn before the arm: the speed comes from the body.', fixLow: 'Let the trunk turn first and pull the arm through.', anchor: 'hips', goodLabel: 'Kinetic chain', fixLabel: 'Trunk first', enabled: true },

  // Smash (remate): full reach, full power.
  { id: 'sm-reach', strokes: SM, phase: 'contact', metric: 'elbowAngle', min: 155, good: 'Fully extended at contact.', fixLow: 'Reach up and hit with a straight arm at the highest point.', anchor: 'domElbow', goodLabel: 'Full extension', fixLabel: 'Reach up', enabled: true },
  { id: 'sm-height', strokes: SM, phase: 'contact', metric: 'contactHeight', min: 0.3, good: 'Contact at full reach above the head.', fixLow: 'Hit the ball higher, at full reach above your head.', anchor: 'domWrist', goodLabel: 'High contact', fixLabel: 'Contact higher', enabled: true },
  { id: 'sm-front', strokes: SM, phase: 'contact', metric: 'contactForward', min: 0.05, good: 'Ball in front so you hit down through it.', fixLow: 'Get behind the ball so you meet it in front and hit down.', anchor: 'domWrist', goodLabel: 'In front', fixLabel: 'Get behind the ball', enabled: true },
  { id: 'sm-legs', strokes: SM, phase: 'contact', metric: 'legDrive', min: 15, good: 'Legs drive up into the ball.', fixLow: 'Bend and drive up with your legs; a smash starts from the floor.', anchor: 'knee', goodLabel: 'Leg drive', fixLabel: 'Drive with legs', enabled: true },
  { id: 'sm-finish', strokes: SM, phase: 'follow-through', metric: 'crossBody', min: 0.05, good: 'Finishes across to the {nonDom} side.', fixLow: 'Let the paddle finish across your body to your {nonDom} side.', anchor: 'domWrist', goodLabel: 'Finish across', fixLabel: 'Finish across', enabled: true },
  { id: 'sm-chain', strokes: SM, phase: 'contact', metric: 'chainSequence', min: 2, good: 'Legs and hips start the smash, the arm finishes it.', fixLow: 'Let the hips and trunk start the swing before the arm.', anchor: 'hips', goodLabel: 'Kinetic chain', fixLabel: 'Hips first', enabled: true },

  // Underhand serve (saque): bounce, then contact at or below the waist.
  { id: 'sv-knees', strokes: SV, phase: 'ball-drop', metric: 'kneeBend', max: 160, good: 'Knees bent as the ball drops.', fixLow: '', fixHigh: 'Bend your knees as you drop the ball so you can stay down through the serve.', anchor: 'knee', goodLabel: 'Knees bent', fixLabel: 'Bend knees', enabled: true },
  { id: 'sv-turn', strokes: SV, phase: 'backswing', metric: 'shoulderTurn', min: 25, max: 100, good: 'Side-on, paddle back, ready to swing through.', fixLow: 'Turn side-on and take the paddle back before you swing.', fixHigh: 'Too much turn for a serve; keep it compact and controlled.', anchor: 'shoulders', goodLabel: 'Side-on', fixLabel: 'Turn side-on', enabled: true },
  { id: 'sv-legal', strokes: SV, phase: 'contact', metric: 'contactBelowWaist', min: -0.08, good: 'Contact at or below the waist: a legal serve.', fixLow: 'The ball must be hit at or below the waist; let it drop lower before you swing.', anchor: 'domWrist', goodLabel: 'Legal height', fixLabel: 'Hit below the waist', enabled: true },
  { id: 'sv-front', strokes: SV, phase: 'contact', metric: 'contactForward', min: 0.1, good: 'Contact in front of the body.', fixLow: 'Drop the ball a little further in front so you meet it ahead of your hip.', anchor: 'domWrist', goodLabel: 'In front', fixLabel: 'Drop it in front', enabled: true },
  { id: 'sv-weight', strokes: SV, phase: 'contact', metric: 'weightShift', min: 20, good: 'Weight moves forward into the serve.', fixLow: 'Step forward and move your weight into the serve.', anchor: 'hips', goodLabel: 'Weight forward', fixLabel: 'Move weight forward', enabled: true },
  { id: 'sv-finish', strokes: SV, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.35, good: 'Finishes up toward the target.', fixLow: 'Swing through toward the target box instead of stopping at the hip.', anchor: 'domWrist', goodLabel: 'Finish to target', fixLabel: 'Swing through', enabled: true },
];

export function fillHand(text: string, hand: Handedness): string {
  const dom = hand === 'right' ? 'right' : 'left';
  const non = hand === 'right' ? 'left' : 'right';
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return text.replaceAll('{dom}', dom).replaceAll('{nonDom}', non).replaceAll('{Dom}', cap(dom)).replaceAll('{NonDom}', cap(non));
}

export interface RuleResult {
  rule: Rule;
  value: number;
  status: Status;
  text: string;
  label: string;
}

export function evaluateRule(rule: Rule, metrics: Metrics | undefined, hand: Handedness): RuleResult | null {
  const value = metrics?.[rule.metric];
  if (value === undefined || Number.isNaN(value)) return null;
  const low = rule.min !== undefined && value < rule.min;
  const high = rule.max !== undefined && value > rule.max;
  const status: Status = low || high ? 'fix' : 'good';
  const raw = status === 'good' ? rule.good : high ? rule.fixHigh || rule.fixLow : rule.fixLow || rule.fixHigh || '';
  return {
    rule,
    value,
    status,
    text: fillHand(raw, hand),
    label: fillHand(status === 'good' ? rule.goodLabel : rule.fixLabel, hand),
  };
}

/** Default label offset: push the label outward from the body, alternating up and down. */
function defaultOffset(i: number): { dx: number; dy: number } {
  const presets = [
    { dx: 0.16, dy: -0.12 },
    { dx: -0.2, dy: 0.08 },
    { dx: 0.18, dy: 0.12 },
    { dx: -0.18, dy: -0.1 },
  ];
  return presets[i % presets.length];
}

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Recompute rule-based key points and callouts for a stroke, keeping anything a coach edited
 * (edited items survive; rule items whose rule no longer applies are dropped).
 */
export function applyRules(stroke: Stroke, rules: Rule[], hand: Handedness): Pick<Stroke, 'keyPoints' | 'callouts'> {
  const applicable = rules.filter((r) => r.enabled && r.strokes.includes(stroke.type));
  const phaseIds = new Set<PhaseId>(stroke.phases.map((p) => p.id));
  const editedKp = stroke.keyPoints.filter((k) => k.edited);
  const editedCo = stroke.callouts.filter((c) => c.edited);
  const keyPoints: KeyPoint[] = [...editedKp];
  const callouts: Callout[] = [...editedCo];
  const perPhase: Record<string, number> = {};
  const stage = strokeStage(stroke);
  for (const base of applicable) {
    const rule = ruleForStage(base, stage);
    if (!phaseIds.has(rule.phase)) continue;
    const res = evaluateRule(rule, stroke.metrics[rule.phase], hand);
    if (!res) continue;
    if (!editedKp.some((k) => k.ruleId === rule.id)) {
      keyPoints.push({
        id: newId('kp'), phaseId: rule.phase, ruleId: rule.id, text: res.text, status: res.status,
        metric: rule.metric, value: res.value, min: rule.min, max: rule.max, stage: rule.stage,
      });
    } else {
      // Keep the coach's words but refresh the measurement behind them.
      const k = keyPoints.find((x) => x.ruleId === rule.id)!;
      k.value = res.value; k.min = rule.min; k.max = rule.max; k.metric = rule.metric; k.stage = rule.stage;
    }
    const n = perPhase[rule.phase] ?? 0;
    perPhase[rule.phase] = n + 1;
    const prevCo = stroke.callouts.find((c) => c.ruleId === rule.id && !c.edited);
    if (!editedCo.some((c) => c.ruleId === rule.id)) {
      const off = prevCo ? { dx: prevCo.dx, dy: prevCo.dy } : defaultOffset(n);
      callouts.push({ id: newId('co'), phaseId: rule.phase, ruleId: rule.id, label: res.label, anchor: rule.anchor, status: res.status, ...off, hidden: prevCo?.hidden });
    }
  }
  return { keyPoints, callouts };
}

/** The first "fix" in phase order: the one thing to work on next. */
export function topFix(stroke: Stroke): KeyPoint | undefined {
  const order = stroke.phases.map((p) => p.id);
  return [...stroke.keyPoints]
    .filter((k) => k.status === 'fix')
    .sort((a, b) => order.indexOf(a.phaseId) - order.indexOf(b.phaseId))[0];
}
