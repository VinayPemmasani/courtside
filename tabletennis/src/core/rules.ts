import type { BounceStage, Callout, Handedness, KeyPoint, Metrics, PhaseId, Rule, StageTarget, Status, Stroke } from './types';

const FH: Rule['strokes'] = ['forehand'];
const BH: Rule['strokes'] = ['backhand'];
const PU: Rule['strokes'] = ['push'];
const FL: Rule['strokes'] = ['flick'];
const BL: Rule['strokes'] = ['block'];
const SV: Rule['strokes'] = ['serve'];
const LONG: Rule['strokes'] = ['forehand', 'backhand'];

/*
 * How the body changes with the ball's timing on a loop:
 * - Rising (early, close to the table): little time, so a short backswing, contact further in front
 *   and a short forward finish; use the ball's own pace.
 * - Peak: the reference ranges.
 * - Falling (late, away from the table): more time and less pace, so a bigger turn, more knee bend
 *   and a fuller upward swing to lift the ball over the net.
 */
const FH_TURN: Rule['byStage'] = {
  rising: { min: 30, max: 80, fixHigh: 'Rising ball: shorten the backswing; turn the waist, not the arm, and keep the bat in front of you.', good: 'Compact turn, right for a ball taken early.' },
  falling: { min: 50, max: 120, fixLow: 'Dropping ball, away from the table: you have time, turn the waist fully to make your own speed.' },
};
const KNEES: Rule['byStage'] = {
  falling: { max: 150, fixHigh: 'Late ball: bend more so the bat can start below the ball and lift it.' },
};
const FRONT: Rule['byStage'] = {
  rising: { min: 0.2, fixLow: 'Rising ball: meet it earlier and further in front, over the end of the table.' },
};
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
  // Forehand loop / drive
  { id: 'fh-turn', strokes: FH, phase: 'unit-turn', metric: 'shoulderTurn', min: 20, good: 'Waist starts turning as soon as the ball is read.', fixLow: 'Start the waist turn earlier, as soon as you see the ball is coming to your forehand.', anchor: 'shoulders', goodLabel: 'Early turn', fixLabel: 'Turn earlier', enabled: true },
  { id: 'fh-full-turn', strokes: FH, phase: 'backswing', metric: 'shoulderTurn', min: 40, max: 110, good: 'Good waist rotation back, {dom} shoulder lower and behind.', fixLow: 'Turn your waist further back so your {dom} shoulder goes behind you; it is your power.', fixHigh: 'You turn too far for table tennis; a shorter turn lets you recover for the next ball.', anchor: 'shoulders', goodLabel: 'Waist turned', fixLabel: 'Turn the waist', enabled: true, byStage: FH_TURN },
  { id: 'fh-knees', strokes: FH, phase: 'backswing', metric: 'kneeBend', min: 110, max: 160, good: 'Knees bent, weight loaded on the {dom} leg.', fixLow: 'Very deep knee bend; stay a little taller so you can move.', fixHigh: 'Bend your knees and sit on your {dom} leg before you swing.', anchor: 'knee', goodLabel: 'Knees loaded', fixLabel: 'Bend knees', enabled: true, byStage: KNEES },
  { id: 'fh-low-point', strokes: FH, phase: 'racket-drop', metric: 'wristAboveShoulder', max: -0.35, good: 'Bat drops below the ball before the upward swing.', fixLow: '', fixHigh: 'Drop the bat lower, to about knee height, so you can brush up the back of the ball.', anchor: 'domWrist', goodLabel: 'Bat below ball', fixLabel: 'Start lower', enabled: true },
  { id: 'fh-contact-front', strokes: FH, phase: 'contact', metric: 'contactForward', min: 0.1, max: 0.6, good: 'Contact in front of the body.', fixLow: 'Meet the ball further in front; contact beside or behind you is late.', fixHigh: 'You reach a long way out; move your feet so the ball comes to you.', anchor: 'domWrist', goodLabel: 'Contact in front', fixLabel: 'Hit further in front', enabled: true, byStage: FRONT },
  { id: 'fh-elbow', strokes: FH, phase: 'contact', metric: 'elbowAngle', min: 90, max: 155, good: 'Elbow bent at about 90 to 130 degrees: a relaxed, fast arm.', fixLow: 'Your arm is cramped; leave more room between you and the ball.', fixHigh: 'Your arm is almost straight; keep the elbow bent so the forearm can whip through.', anchor: 'domElbow', goodLabel: 'Relaxed elbow', fixLabel: 'Elbow angle', enabled: true },
  { id: 'fh-finish', strokes: FH, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.1, max: 0.35, good: 'Finishes in front of the forehead.', fixLow: 'Swing forward and up, finishing about at your forehead, to lift the ball over the net.', fixHigh: 'Your finish is too big; stop at the forehead and get back to ready.', anchor: 'domWrist', goodLabel: 'Finish at forehead', fixLabel: 'Finish at forehead', enabled: true },
  { id: 'fh-finish-across', strokes: FH, phase: 'follow-through', metric: 'crossBody', min: -0.12, max: 0.35, good: 'Bat finishes in front of the body, toward the centre line.', fixLow: 'Let the bat travel across toward the middle of your body.', fixHigh: 'You wrap the bat round your neck; keep the finish in front of you so you can recover.', anchor: 'domWrist', goodLabel: 'Finish in front', fixLabel: 'Finish in front', enabled: true },

  // Backhand loop / drive
  { id: 'bh-compact', strokes: BH, phase: 'backswing', metric: 'shoulderTurn', max: 55, good: 'Square to the table, compact backswing.', fixLow: '', fixHigh: 'Too much body turn for a backhand; stay square to the table and bring the bat back to your belly.', anchor: 'shoulders', goodLabel: 'Square stance', fixLabel: 'Stay square', enabled: true },
  { id: 'bh-fold', strokes: BH, phase: 'backswing', metric: 'elbowAngle', max: 100, good: 'Arm folded, bat back near the belly with the elbow in front.', fixLow: '', fixHigh: 'Fold the arm and bring the bat back toward your belly before you swing.', anchor: 'domElbow', goodLabel: 'Arm folded', fixLabel: 'Fold the arm', enabled: true },
  { id: 'bh-knees', strokes: BH, phase: 'backswing', metric: 'kneeBend', min: 110, max: 162, good: 'Knees bent, ready to push up.', fixLow: 'Very deep knee bend; stay a little taller.', fixHigh: 'Bend your knees a little more and lean forward over the table.', anchor: 'knee', goodLabel: 'Knees bent', fixLabel: 'Bend knees', enabled: true, byStage: KNEES },
  { id: 'bh-contact-front', strokes: BH, phase: 'contact', metric: 'contactForward', min: 0.2, max: 0.7, good: 'Contact well in front of the body.', fixLow: 'Take the ball further in front of you, not beside the hip.', fixHigh: 'You reach a long way; step in so the ball comes to you.', anchor: 'domWrist', goodLabel: 'Contact in front', fixLabel: 'Hit further in front', enabled: true, byStage: FRONT },
  { id: 'bh-elbow', strokes: BH, phase: 'contact', metric: 'elbowAngle', min: 90, max: 165, good: 'Elbow opens through contact, forearm doing the work.', fixLow: 'Open the elbow forward through contact; the forearm drives the backhand.', fixHigh: 'Arm locked straight; keep a little bend so the wrist can snap.', anchor: 'domElbow', goodLabel: 'Forearm through', fixLabel: 'Open the elbow', enabled: true },
  { id: 'bh-finish', strokes: BH, phase: 'follow-through', metric: 'wristAboveShoulder', min: -0.25, max: 0.3, good: 'Finishes forward and up, toward the target.', fixLow: 'Finish forward and up toward where you want the ball to go, around eye level.', fixHigh: 'Your finish is too high; swing forward more than up.', anchor: 'domWrist', goodLabel: 'Finish to target', fixLabel: 'Finish forward', enabled: true },

  // Push
  { id: 'push-reach', strokes: PU, phase: 'contact', metric: 'contactForward', min: 0.25, good: 'Reaches in and meets the ball over the table.', fixLow: 'Step in with the {dom} foot under the table and meet the ball well in front.', anchor: 'domWrist', goodLabel: 'Reach over table', fixLabel: 'Step in', enabled: true },
  { id: 'push-arm', strokes: PU, phase: 'contact', metric: 'elbowAngle', min: 100, good: 'Arm opens forward through the ball.', fixLow: 'Push forward from the elbow; the arm should open toward the ball, not stay tucked.', anchor: 'domElbow', goodLabel: 'Arm forward', fixLabel: 'Push forward', enabled: true },
  { id: 'push-knees', strokes: PU, phase: 'contact', metric: 'kneeBend', max: 160, good: 'Low over the table.', fixLow: '', fixHigh: 'Get down to the ball: bend the knees and lean in over the table.', anchor: 'knee', goodLabel: 'Low to the ball', fixLabel: 'Get lower', enabled: true },
  { id: 'push-short', strokes: PU, phase: 'follow-through', metric: 'wristAboveShoulder', max: -0.15, good: 'Short, low finish.', fixLow: '', fixHigh: 'Keep the push short and low; lifting the bat sends the ball high.', anchor: 'domWrist', goodLabel: 'Short finish', fixLabel: 'Stay low', enabled: true },

  // Flick
  { id: 'flick-reach', strokes: FL, phase: 'contact', metric: 'contactForward', min: 0.25, good: 'Over the table, meeting the ball at the top of the bounce.', fixLow: 'Step in under the table and take the ball earlier, over the table.', anchor: 'domWrist', goodLabel: 'Over the table', fixLabel: 'Step in', enabled: true },
  { id: 'flick-cock', strokes: FL, phase: 'backswing', metric: 'elbowAngle', max: 120, good: 'Elbow up and bent, wrist cocked back.', fixLow: '', fixHigh: 'Bend the elbow and cock the wrist back before the flick; the speed comes from the snap.', anchor: 'domElbow', goodLabel: 'Wrist cocked', fixLabel: 'Cock the wrist', enabled: true },
  { id: 'flick-knees', strokes: FL, phase: 'contact', metric: 'kneeBend', max: 160, good: 'Knee bent under the table.', fixLow: '', fixHigh: 'Bend the {dom} knee and get under the table.', anchor: 'knee', goodLabel: 'Under the table', fixLabel: 'Get lower', enabled: true },
  { id: 'flick-finish', strokes: FL, phase: 'follow-through', metric: 'wristAboveShoulder', max: 0.15, good: 'Short, quick finish.', fixLow: '', fixHigh: 'Keep the flick short; a big finish leaves you out of position.', anchor: 'domWrist', goodLabel: 'Short finish', fixLabel: 'Shorter finish', enabled: true },

  // Block
  { id: 'block-compact', strokes: BL, phase: 'backswing', metric: 'shoulderTurn', max: 35, good: 'Almost no backswing: just the bat angle.', fixLow: '', fixHigh: 'No backswing on a block; set the bat angle and let the ball come onto it.', anchor: 'shoulders', goodLabel: 'No backswing', fixLabel: 'Less backswing', enabled: true },
  { id: 'block-front', strokes: BL, phase: 'contact', metric: 'contactForward', min: 0.2, good: 'Blocks in front, close to the bounce.', fixLow: 'Block in front of the body, close to the bounce, before the spin takes the ball up.', anchor: 'domWrist', goodLabel: 'Block in front', fixLabel: 'Meet it earlier', enabled: true },
  { id: 'block-knees', strokes: BL, phase: 'contact', metric: 'kneeBend', max: 162, good: 'Knees soft and balanced.', fixLow: '', fixHigh: 'Soften your knees; stiff legs make it hard to absorb the pace.', anchor: 'knee', goodLabel: 'Soft knees', fixLabel: 'Bend knees', enabled: true },

  // Serve
  { id: 'sv-toss', strokes: SV, phase: 'trophy', metric: 'tossRise', min: 0.16, good: 'Toss rises at least 16 cm from an open palm.', fixLow: 'Toss the ball at least 16 cm straight up from a flat open palm; a low toss is a fault.', anchor: 'nonDomWrist', goodLabel: 'Legal toss', fixLabel: 'Toss 16 cm', enabled: true },
  { id: 'sv-knees', strokes: SV, phase: 'racket-drop', metric: 'kneeBend', max: 160, good: 'Knees bent, low over the table.', fixLow: '', fixHigh: 'Bend your knees and get low so you can strike the ball close to the table.', anchor: 'knee', goodLabel: 'Low stance', fixLabel: 'Get lower', enabled: true },
  { id: 'sv-low-contact', strokes: SV, phase: 'contact', metric: 'wristAboveShoulder', max: -0.25, good: 'Contact low, close to net height, for a short, low serve.', fixLow: '', fixHigh: 'Let the ball drop and contact it lower, near net height, to keep the serve short.', anchor: 'domWrist', goodLabel: 'Low contact', fixLabel: 'Contact lower', enabled: true },
  { id: 'sv-short-finish', strokes: SV, phase: 'follow-through', metric: 'crossBody', min: -0.3, max: 0.45, good: 'Short finish, ready for the third ball.', fixLow: 'Brush across the ball and let the bat finish in front of you.', fixHigh: 'Finish shorter so you are ready for the return.', anchor: 'domWrist', goodLabel: 'Ready for 3rd ball', fixLabel: 'Shorter finish', enabled: true },

  // Whole-body power on loops: the legs and waist drive the arm.
  { id: 'ls-separation', strokes: FH, phase: 'backswing', metric: 'hipShoulderSep', min: 12, good: 'Shoulders turn past the hips: the waist is coiled.', fixLow: 'Turn your shoulders a little further than your hips so the waist can uncoil into the ball.', anchor: 'hips', goodLabel: 'Waist coiled', fixLabel: 'Coil the waist', enabled: true },
  { id: 'ls-weight', strokes: FH, phase: 'contact', metric: 'weightShift', min: 20, good: 'Weight moves from the {dom} leg to the {nonDom} leg.', fixLow: 'Load the {dom} leg, then shift your weight onto the {nonDom} leg as you swing.', anchor: 'hips', goodLabel: 'Weight transfer', fixLabel: 'Shift your weight', enabled: true },
  { id: 'ls-legs', strokes: LONG, phase: 'contact', metric: 'legDrive', min: 5, good: 'Legs push up out of the knee bend.', fixLow: 'Push up with your legs as you swing; the loop starts from the floor.', anchor: 'knee', goodLabel: 'Leg drive', fixLabel: 'Use your legs', enabled: true },
  { id: 'ls-chain', strokes: FH, phase: 'contact', metric: 'chainSequence', min: 2, good: 'Legs, waist, then arm, then wrist: power flows up the chain.', fixLow: 'Start the swing with the legs and waist; the arm comes last.', anchor: 'hips', goodLabel: 'Kinetic chain', fixLabel: 'Waist leads', enabled: true },
  { id: 'ls-body-power', strokes: FH, phase: 'contact', metric: 'bodyPower', min: 30, good: 'Much of the bat speed comes from the body, not just the arm.', fixLow: 'You are mostly using the arm; rotate the waist through the ball.', anchor: 'shoulders', goodLabel: 'Body power', fixLabel: 'Use the waist', enabled: true },
  { id: 'ls-prep', strokes: LONG, phase: 'unit-turn', metric: 'prepLead', min: 0.18, good: 'Ready early, with time to set the stroke.', fixLow: 'Get ready sooner: start the turn as the opponent hits, so you are not rushed.', anchor: 'shoulders', goodLabel: 'Early ready', fixLabel: 'Prepare earlier', enabled: true },
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
