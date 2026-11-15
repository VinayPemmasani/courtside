import type { BounceStage, Callout, Handedness, KeyPoint, Metrics, PhaseId, Rule, StageTarget, Status, Stroke } from './types';

const FH: Rule['strokes'] = ['forehand'];
const BH1: Rule['strokes'] = ['backhand-1h'];
const BH2: Rule['strokes'] = ['backhand-2h'];
const SV: Rule['strokes'] = ['serve'];
const GS: Rule['strokes'] = ['forehand', 'backhand-1h', 'backhand-2h'];

/*
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
  rising: { min: min - 10, max: risingMax, fixHigh: 'Rising ball: shorten the backswing so the racket is ready in time; turn the shoulders, not the arm.', good: 'Compact turn, right for a ball on the rise.' },
  falling: { min: min + 5, max, fixLow: 'Dropping ball: you have time, so take a full turn to make your own pace.' },
});
const KNEES: Rule['byStage'] = {
  rising: { min: 110, max: 158, fixHigh: 'Rising ball: get low and stay down through it so you can meet it early.' },
  peak: { min: 115, max: 165, fixLow: 'At the top of the bounce the ball is high: stay taller instead of sinking.' },
  falling: { min: 105, max: 150, fixHigh: 'Dropping ball: bend more so you can get under it and lift it up.' },
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
  // Forehand
  { id: 'fh-unit-turn', strokes: FH, phase: 'unit-turn', metric: 'shoulderTurn', min: 35, good: 'Shoulders start turning early.', fixLow: 'Start the turn earlier: turn your shoulders as soon as you read the ball.', anchor: 'shoulders', goodLabel: 'Shoulders turned', fixLabel: 'Turn earlier', enabled: true },
  { id: 'fh-full-turn', strokes: FH, phase: 'backswing', metric: 'shoulderTurn', min: 70, max: 140, good: 'Full shoulder turn on the backswing.', fixLow: 'Turn further so your back starts to face the side fence.', fixHigh: 'You over-rotate; turn a little less so you can recover in time.', anchor: 'shoulders', goodLabel: 'Full turn', fixLabel: 'Turn further', enabled: true, byStage: TURN(70, 110, 140) },
  { id: 'fh-knees', strokes: FH, phase: 'backswing', metric: 'kneeBend', min: 110, max: 158, good: 'Knees loaded before the swing.', fixLow: 'Very deep knee bend; stay a little taller to stay balanced.', fixHigh: 'Bend your knees more to load your legs.', anchor: 'knee', goodLabel: 'Knees loaded', fixLabel: 'Bend knees', enabled: true, byStage: KNEES },
  { id: 'fh-contact-front', strokes: FH, phase: 'contact', metric: 'contactForward', min: 0.15, max: 0.75, good: 'Contact out in front of the body.', fixLow: 'Meet the ball further in front of your front hip.', fixHigh: 'Contact is very far out front; let the ball come a bit closer.', anchor: 'domWrist', goodLabel: 'Contact out front', fixLabel: 'Hit further in front', enabled: true, byStage: FRONT(0.15, 0.75) },
  { id: 'fh-arm-space', strokes: FH, phase: 'contact', metric: 'elbowAngle', min: 100, good: 'Hitting arm has room at contact.', fixLow: 'Your arm is cramped at contact; give yourself more space from the ball.', anchor: 'domElbow', goodLabel: 'Arm has space', fixLabel: 'Cramped arm', enabled: true },
  { id: 'fh-finish-across', strokes: FH, phase: 'follow-through', metric: 'crossBody', min: 0.05, good: 'Finishes across the body.', fixLow: 'Finish over your {nonDom} shoulder, across your body.', anchor: 'domWrist', goodLabel: 'Finish across', fixLabel: 'Finish across body', enabled: true },
  { id: 'fh-finish-high', strokes: FH, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.05, good: 'High finish, swinging up through the ball.', fixLow: 'Swing up through the ball and finish higher.', anchor: 'domWrist', goodLabel: 'High finish', fixLabel: 'Finish higher', enabled: true, byStage: FINISH(-0.05) },

  // One-handed backhand
  { id: 'bh1-hand-throat', strokes: BH1, phase: 'unit-turn', metric: 'handsTogether', max: 0.25, good: '{NonDom} hand on the throat turns the racket back.', fixLow: '', fixHigh: 'Keep your {nonDom} hand on the racket throat as you turn.', anchor: 'nonDomWrist', goodLabel: '{NonDom} hand on throat', fixLabel: '{NonDom} hand on throat', enabled: true },
  { id: 'bh1-turn', strokes: BH1, phase: 'backswing', metric: 'shoulderTurn', min: 80, max: 150, good: 'Shoulders turned so your back starts to face the net.', fixLow: 'Turn your shoulders further so your back starts to face the net.', fixHigh: 'You over-rotate; turn a little less.', anchor: 'shoulders', goodLabel: 'Shoulders turned', fixLabel: 'Turn further', enabled: true, byStage: TURN(80, 120, 150) },
  { id: 'bh1-knees', strokes: BH1, phase: 'backswing', metric: 'kneeBend', min: 110, max: 158, good: 'Knees loaded before the swing.', fixLow: 'Very deep knee bend; stay a little taller.', fixHigh: 'Bend your knees more to load your legs.', anchor: 'knee', goodLabel: 'Knees loaded', fixLabel: 'Bend knees', enabled: true, byStage: KNEES },
  { id: 'bh1-contact-front', strokes: BH1, phase: 'contact', metric: 'contactForward', min: 0.25, max: 0.85, good: 'Contact well in front, ahead of the front foot.', fixLow: 'Meet the ball earlier, well in front of your front foot.', fixHigh: 'Contact is very far out front; let the ball come a bit closer.', anchor: 'domWrist', goodLabel: 'Contact out front', fixLabel: 'Hit further in front', enabled: true, byStage: FRONT(0.25, 0.85) },
  { id: 'bh1-straight-arm', strokes: BH1, phase: 'contact', metric: 'elbowAngle', min: 150, good: 'Hitting arm straight at contact.', fixLow: 'Straighten your hitting arm at contact.', anchor: 'domElbow', goodLabel: 'Straight arm', fixLabel: 'Straighten arm', enabled: true },
  { id: 'bh1-finish-high', strokes: BH1, phase: 'follow-through', metric: 'wristAboveShoulder', min: 0, good: 'Arm finishes high and extended.', fixLow: 'Extend up and out; finish with the hand above the shoulder.', anchor: 'domWrist', goodLabel: 'High finish', fixLabel: 'Finish higher', enabled: true, byStage: FINISH(0) },

  // Two-handed backhand
  { id: 'bh2-turn', strokes: BH2, phase: 'backswing', metric: 'shoulderTurn', min: 70, max: 140, good: 'Full shoulder turn on the backswing.', fixLow: 'Turn your shoulders further on the backswing.', fixHigh: 'You over-rotate; turn a little less.', anchor: 'shoulders', goodLabel: 'Full turn', fixLabel: 'Turn further', enabled: true, byStage: TURN(70, 110, 140) },
  { id: 'bh2-knees', strokes: BH2, phase: 'backswing', metric: 'kneeBend', min: 110, max: 158, good: 'Knees loaded before the swing.', fixLow: 'Very deep knee bend; stay a little taller.', fixHigh: 'Bend your knees more to load your legs.', anchor: 'knee', goodLabel: 'Knees loaded', fixLabel: 'Bend knees', enabled: true, byStage: KNEES },
  { id: 'bh2-hands', strokes: BH2, phase: 'contact', metric: 'handsTogether', max: 0.2, good: 'Both hands stay on the racket through contact.', fixLow: '', fixHigh: 'Keep both hands on the racket through contact.', anchor: 'nonDomWrist', goodLabel: 'Two hands on', fixLabel: 'Keep both hands on', enabled: true },
  { id: 'bh2-contact-front', strokes: BH2, phase: 'contact', metric: 'contactForward', min: 0.1, max: 0.65, good: 'Contact in front of the body.', fixLow: 'Meet the ball further in front of your front hip.', fixHigh: 'Contact is very far out front; let the ball come a bit closer.', anchor: 'domWrist', goodLabel: 'Contact out front', fixLabel: 'Hit further in front', enabled: true, byStage: FRONT(0.1, 0.65) },
  { id: 'bh2-finish-high', strokes: BH2, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.05, good: 'Finishes high over the shoulder.', fixLow: 'Swing up and finish over your {dom} shoulder.', anchor: 'domWrist', goodLabel: 'High finish', fixLabel: 'Finish higher', enabled: true, byStage: FINISH(-0.05) },

  // Serve
  { id: 'sv-trophy-elbow', strokes: SV, phase: 'trophy', metric: 'elbowAngle', min: 65, max: 125, good: 'Hitting elbow bent near 90° in the trophy position.', fixLow: 'Hitting elbow too tight; open it toward 90° in the trophy position.', fixHigh: 'Bend your hitting elbow more, toward 90°, in the trophy position.', anchor: 'domElbow', goodLabel: 'Trophy position', fixLabel: 'Elbow to 90°', enabled: true },
  { id: 'sv-toss-arm', strokes: SV, phase: 'trophy', metric: 'tossArmUp', min: 0.15, good: 'Toss arm extended up toward the ball.', fixLow: 'Keep your toss arm reaching up longer.', anchor: 'nonDomWrist', goodLabel: 'Toss arm up', fixLabel: 'Toss arm higher', enabled: true },
  { id: 'sv-knees', strokes: SV, phase: 'trophy', metric: 'kneeBend', min: 100, max: 155, good: 'Knees bent to drive up into the ball.', fixLow: 'Very deep knee bend; it can cost you balance.', fixHigh: 'Bend your knees more in the trophy position to drive up.', anchor: 'knee', goodLabel: 'Knees bent', fixLabel: 'Bend knees', enabled: true },
  { id: 'sv-drop', strokes: SV, phase: 'racket-drop', metric: 'elbowAngle', max: 105, good: 'Deep racket drop behind the back.', fixLow: '', fixHigh: 'Let the racket drop deeper behind your back before swinging up.', anchor: 'domElbow', goodLabel: 'Racket drop', fixLabel: 'Drop deeper', enabled: true },
  { id: 'sv-extension', strokes: SV, phase: 'contact', metric: 'elbowAngle', min: 155, good: 'Fully extended at contact.', fixLow: 'Reach up and hit with a straight arm.', anchor: 'domElbow', goodLabel: 'Full extension', fixLabel: 'Reach up', enabled: true },
  { id: 'sv-height', strokes: SV, phase: 'contact', metric: 'contactHeight', min: 0.35, good: 'Contact at full reach above the head.', fixLow: 'Hit the ball higher, at full reach above your head.', anchor: 'domWrist', goodLabel: 'High contact', fixLabel: 'Contact higher', enabled: true },
  { id: 'sv-finish', strokes: SV, phase: 'follow-through', metric: 'crossBody', min: 0.0, good: 'Finishes on the opposite side.', fixLow: 'Let the racket finish on your {nonDom} side.', anchor: 'domWrist', goodLabel: 'Finish across', fixLabel: 'Finish across', enabled: true },
  // Whole-body power (all groundstrokes): the legs, hips and trunk drive the arm.
  { id: 'gs-separation', strokes: GS, phase: 'backswing', metric: 'hipShoulderSep', min: 20, good: 'Shoulders coil past the hips: the trunk is stretched like a spring.', fixLow: 'Turn your shoulders further than your hips so the trunk stretches and can uncoil.', anchor: 'hips', goodLabel: 'Hip-shoulder stretch', fixLabel: 'Coil shoulders past hips', enabled: true },
  { id: 'gs-weight', strokes: GS, phase: 'contact', metric: 'weightShift', min: 25, good: 'Weight moves from the back foot into the front foot.', fixLow: 'Load the back foot, then push your weight forward into the shot.', anchor: 'hips', goodLabel: 'Weight forward', fixLabel: 'Move weight forward', enabled: true, byStage: WEIGHT },
  { id: 'gs-legs', strokes: GS, phase: 'contact', metric: 'legDrive', min: 8, good: 'Legs push up out of the knee bend into the ball.', fixLow: 'Push up with your legs as you swing instead of staying low.', anchor: 'knee', goodLabel: 'Leg drive', fixLabel: 'Drive with legs', enabled: true, byStage: LEGS },
  { id: 'gs-chain', strokes: GS, phase: 'contact', metric: 'chainSequence', min: 2, good: 'Hips, then trunk, then arm, then hand: power flows up the chain.', fixLow: 'Start the swing with the hips; let the trunk pull the arm through, not the other way round.', anchor: 'hips', goodLabel: 'Kinetic chain', fixLabel: 'Hips lead the swing', enabled: true },
  { id: 'gs-body-power', strokes: GS, phase: 'contact', metric: 'bodyPower', min: 35, good: 'Much of the hand speed comes from body rotation, not just the arm.', fixLow: 'You are mostly arming the ball; rotate your hips and trunk through the shot.', anchor: 'shoulders', goodLabel: 'Body power', fixLabel: 'Use the body, not the arm', enabled: true, byStage: POWER },

  // Preparation timing: turn early so the swing is organised by the bounce.
  { id: 'gs-prep', strokes: GS, phase: 'unit-turn', metric: 'prepLead', min: 0.35, good: 'Turn starts early, leaving time to organise contact.', fixLow: 'Start your turn as soon as you read the ball, so you are set by the bounce instead of rushing.', anchor: 'shoulders', goodLabel: 'Early preparation', fixLabel: 'Prepare earlier', enabled: true, byStage: PREP },

  // Serve body power
  { id: 'sv-legs', strokes: SV, phase: 'contact', metric: 'legDrive', min: 20, good: 'Legs drive up into the ball.', fixLow: 'Bend, then explode up with your legs into the serve.', anchor: 'knee', goodLabel: 'Leg drive', fixLabel: 'Drive up with legs', enabled: true },
  { id: 'sv-separation', strokes: SV, phase: 'trophy', metric: 'hipShoulderSep', min: 15, good: 'Shoulders coiled past the hips in the trophy position.', fixLow: 'Turn your shoulders more than your hips in the trophy position.', anchor: 'hips', goodLabel: 'Coiled trunk', fixLabel: 'Coil shoulders', enabled: true },
  { id: 'sv-chain', strokes: SV, phase: 'contact', metric: 'chainSequence', min: 2, good: 'Legs and hips start the serve, the arm finishes it.', fixLow: 'Let the hips and trunk start the upswing before the arm.', anchor: 'hips', goodLabel: 'Kinetic chain', fixLabel: 'Hips first', enabled: true },
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
