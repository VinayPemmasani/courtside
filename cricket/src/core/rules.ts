import type { Callout, Handedness, KeyPoint, Metrics, PhaseId, Rule, Status, Stroke } from './types';

const BAT: Rule['strokes'] = ['drive', 'pull', 'cut', 'defence'];
const SHOTS: Rule['strokes'] = ['drive', 'pull', 'cut'];
const FWD: Rule['strokes'] = ['drive', 'defence'];
const BOWL: Rule['strokes'] = ['pace', 'spin'];
const PACE: Rule['strokes'] = ['pace'];
const SPIN: Rule['strokes'] = ['spin'];

/**
 * Starting target ranges. They are deliberately broad defaults for a coach to tune in Coach
 * settings; every key point shows the measured value behind it. `{dom}`/`{nonDom}` become
 * right/left for the player's hand.
 */
export const DEFAULT_RULES: Rule[] = ([
  // Batting: set-up and backlift
  { id: 'bat-grip', strokes: BAT, phase: 'stance', metric: 'handsTogether', max: 0.2, good: 'Hands together on the handle.', fixLow: 'Keep both hands together near the top of the handle.', anchor: 'nonDomWrist', goodLabel: 'Hands together', fixLabel: 'Hands together', enabled: true },
  { id: 'bat-backlift', strokes: SHOTS, phase: 'backlift', metric: 'backliftHeight', min: -0.15, good: 'High backlift: hands up near the back shoulder.', fixLow: 'Pick the bat up higher, hands toward the back shoulder as the bowler lets go.', anchor: 'domWrist', goodLabel: 'High backlift', fixLabel: 'Lift higher', enabled: true },
  // Front-foot play: drive and forward defence
  { id: 'fwd-stride', strokes: FWD, phase: 'impact', metric: 'strideLength', min: 0.5, max: 1.3, good: 'Good stride toward the pitch of the ball.', fixLow: 'Get the front foot further down the pitch, to the line of the ball.', fixHigh: 'Over-stretching: a shorter stride keeps the head over the ball.', anchor: 'frontFoot', goodLabel: 'Big stride', fixLabel: 'Step further', enabled: true },
  { id: 'fwd-head', strokes: FWD, phase: 'impact', metric: 'headOverFront', min: -0.05, good: 'Head over the front knee at impact: balanced and in control.', fixLow: 'Lean into the shot: head over the front knee keeps the ball down.', anchor: 'head', goodLabel: 'Head over ball', fixLabel: 'Head forward', enabled: true },
  { id: 'drive-knee', strokes: ['drive'], phase: 'impact', metric: 'frontKnee', min: 110, max: 168, good: 'Front knee bent and braced.', fixLow: 'Front knee too bent: you are collapsing into the shot. Stride a little shorter.', fixHigh: 'Bend the front knee so the head and weight can get forward.', anchor: 'frontKnee', goodLabel: 'Front knee bent', fixLabel: 'Bend front knee', enabled: true },
  { id: 'fwd-elbow', strokes: FWD, phase: 'impact', metric: 'frontElbowHigh', min: -0.03, good: 'Front elbow high: the bat comes down straight.', fixLow: 'Lead with a high front ({nonDom}) elbow so the bat face stays straight.', anchor: 'nonDomElbow', goodLabel: 'High elbow', fixLabel: 'Elbow up', enabled: true },
  { id: 'fwd-hands', strokes: FWD, phase: 'impact', metric: 'handsUnderEyes', min: -0.15, max: 0.45, good: 'Bat meets the ball under the eyes.', fixLow: 'The ball is getting past you: meet it in front, under the eyes.', fixHigh: 'Hands are pushing out away from the body: let the ball come and play it close to the pad.', anchor: 'domWrist', goodLabel: 'Under the eyes', fixLabel: 'Play it later', enabled: true },
  { id: 'fwd-weight', strokes: FWD, phase: 'impact', metric: 'weightShift', min: 20, good: 'Weight moves forward into the shot.', fixLow: 'Transfer your weight onto the front foot as you play.', anchor: 'hips', goodLabel: 'Weight forward', fixLabel: 'Weight forward', enabled: true },
  { id: 'drive-finish', strokes: ['drive'], phase: 'follow-through', metric: 'finishHeight', min: -0.05, good: 'High finish: hands end up over the front shoulder.', fixLow: 'Follow through: let the hands finish high over the front shoulder.', anchor: 'domWrist', goodLabel: 'High finish', fixLabel: 'Finish higher', enabled: true },
  { id: 'defence-soft', strokes: ['defence'], phase: 'follow-through', metric: 'finishHeight', max: -0.2, good: 'Short, soft push: the bat stops at the ball.', fixLow: 'Defence is a short push: stop the bat at the ball and keep the hands low and soft.', anchor: 'domWrist', goodLabel: 'Soft hands', fixLabel: 'Stop the bat', enabled: true },
  // Back-foot play
  { id: 'pull-turn', strokes: ['pull'], phase: 'impact', metric: 'shoulderTurn', min: 40, good: 'Shoulders rotate through the pull.', fixLow: 'Turn the hips and shoulders: the pull comes from the body rotating, not just the arms.', anchor: 'shoulders', goodLabel: 'Body turns', fixLabel: 'Turn more', enabled: true },
  { id: 'pull-front', strokes: ['pull'], phase: 'impact', metric: 'handsUnderEyes', min: -0.05, good: 'Ball met in front of the body.', fixLow: 'Meet the ball further in front, with the arms extended.', anchor: 'domWrist', goodLabel: 'In front', fixLabel: 'Hit in front', enabled: true },
  { id: 'cut-high', strokes: ['cut'], phase: 'backlift', metric: 'backliftHeight', min: -0.05, good: 'High hands ready to come down on the ball.', fixLow: 'Get the hands high so you can hit down on top of the bounce.', anchor: 'domWrist', goodLabel: 'Hands high', fixLabel: 'Hands higher', enabled: true },
  // All shots
  { id: 'bat-eyes', strokes: BAT, phase: 'impact', metric: 'headStill', max: 22, good: 'Eyes level at impact.', fixLow: 'Keep the head still and the eyes level through the shot.', anchor: 'head', goodLabel: 'Eyes level', fixLabel: 'Head still', enabled: true },
  { id: 'bat-speed', strokes: SHOTS, phase: 'impact', metric: 'batSpeed', min: 4, good: 'Hands accelerate through the ball.', fixLow: 'Swing through the ball: accelerate the hands into impact instead of slowing down.', anchor: 'domWrist', goodLabel: 'Fast hands', fixLabel: 'Swing through', enabled: true },

  // Bowling: the Laws and safety first
  { id: 'bowl-elbow', strokes: BOWL, phase: 'release', metric: 'elbowExtension', max: 15, good: 'Elbow extension within the 15° the Laws allow (single-camera estimate).', fixLow: 'Elbow straightens more than 15° from arm-horizontal to release. Film from side-on at 120+ fps to confirm, and work on a braced, straight arm.', anchor: 'domElbow', goodLabel: 'Legal arm', fixLabel: 'Check elbow', enabled: true },
  { id: 'pace-mixed', strokes: PACE, phase: 'back-foot', metric: 'hipShoulderSep', max: 30, good: 'Hips and shoulders line up at back-foot contact.', fixLow: 'Hips and shoulders point different ways at back-foot contact (a mixed action, hard on the lower back). Pick side-on or front-on and keep both aligned.', anchor: 'hips', goodLabel: 'Aligned', fixLabel: 'Mixed action', enabled: true },
  { id: 'pace-scr', strokes: PACE, phase: 'front-foot', metric: 'counterRotation', max: 30, good: 'Little shoulder counter-rotation: kind to the back.', fixLow: 'Shoulders twist back a lot between the foot plants. Keep the chest on line with the hips into the crease.', anchor: 'shoulders', goodLabel: 'Steady shoulders', fixLabel: 'Less twist', enabled: true },
  { id: 'pace-land', strokes: PACE, phase: 'front-foot', metric: 'frontKnee', min: 145, good: 'Front leg lands tall.', fixLow: 'Land on a straighter front leg so you can brace against it.', anchor: 'frontKnee', goodLabel: 'Tall landing', fixLabel: 'Straighter leg', enabled: true },
  { id: 'pace-brace', strokes: PACE, phase: 'release', metric: 'frontKneeFlex', max: 15, good: 'Front leg braced at release: pace comes up and over it.', fixLow: 'Front knee gives way after landing. Brace the front leg to drive up and over it.', anchor: 'frontKnee', goodLabel: 'Braced leg', fixLabel: 'Brace front leg', enabled: true },
  { id: 'spin-brace', strokes: SPIN, phase: 'release', metric: 'frontKneeFlex', max: 30, good: 'Firm front leg to pivot over.', fixLow: 'Front knee sinks a lot: a firmer front leg gives more pivot and dip.', anchor: 'frontKnee', goodLabel: 'Firm front leg', fixLabel: 'Firmer leg', enabled: true },
  { id: 'bowl-stride', strokes: PACE, phase: 'front-foot', metric: 'strideLength', min: 0.8, max: 1.8, good: 'Delivery stride in a solid range.', fixLow: 'Short delivery stride: stretch a little more toward the target.', fixHigh: 'Over-striding: shorten the stride to stay balanced over the front leg.', anchor: 'frontFoot', goodLabel: 'Good stride', fixLabel: 'Stride length', enabled: true },
  { id: 'spin-stride', strokes: SPIN, phase: 'front-foot', metric: 'strideLength', min: 0.55, max: 1.4, good: 'Compact, balanced stride.', fixLow: 'Stride a little longer so you can rotate over the front leg.', fixHigh: 'Long stride for a spinner: shorten it to rotate over the front leg.', anchor: 'frontFoot', goodLabel: 'Good stride', fixLabel: 'Stride length', enabled: true },
  { id: 'bowl-gather', strokes: BOWL, phase: 'gather', metric: 'frontArmUp', min: -0.05, good: 'Front arm reaches up high at the gather.', fixLow: 'Lift the front ({nonDom}) arm higher at the gather to set up a strong pull-down.', anchor: 'nonDomWrist', goodLabel: 'Front arm up', fixLabel: 'Arm higher', enabled: true },
  { id: 'bowl-height', strokes: BOWL, phase: 'release', metric: 'releaseHeight', min: 0.2, good: 'High release point.', fixLow: 'Release higher: reach up tall over the front leg.', anchor: 'domWrist', goodLabel: 'High release', fixLabel: 'Release higher', enabled: true },
  { id: 'pace-arm', strokes: PACE, phase: 'release', metric: 'armFromVertical', max: 30, good: 'Bowling arm close to vertical.', fixLow: 'Arm is low and round at release: bring it up closer to the head.', anchor: 'domShoulder', goodLabel: 'High arm', fixLabel: 'Arm higher', enabled: true },
  { id: 'spin-arm', strokes: SPIN, phase: 'release', metric: 'armFromVertical', max: 40, good: 'Bowling arm high over the top.', fixLow: 'Arm is low at release: come more over the top for drift and dip.', anchor: 'domShoulder', goodLabel: 'High arm', fixLabel: 'Arm higher', enabled: true },
  { id: 'pace-side', strokes: PACE, phase: 'release', metric: 'trunkSideBend', max: 40, good: 'Trunk side bend in a safe range.', fixLow: 'Big side bend at release loads the lower back: stay taller over the front leg.', anchor: 'shoulders', goodLabel: 'Tall trunk', fixLabel: 'Stay taller', enabled: true },
  { id: 'bowl-follow', strokes: BOWL, phase: 'follow-through', metric: 'followAcross', min: 0.05, good: 'Bowling arm follows through across the body.', fixLow: 'Finish the action: let the bowling arm sweep down past the front hip.', anchor: 'domWrist', goodLabel: 'Full follow-through', fixLabel: 'Finish across', enabled: true },
  { id: 'bowl-chain', strokes: BOWL, phase: 'release', metric: 'chainSequence', min: 2, good: 'Body works in order: hips, trunk, arm, hand.', fixLow: 'Let the hips lead, then the trunk, then the arm, so the speed builds.', anchor: 'hips', goodLabel: 'In sequence', fixLabel: 'Hips first', enabled: true },
  // Upper limits only: the fix text reads as "too high".
] as Rule[]).map((r): Rule => (r.min === undefined && r.max !== undefined && !r.fixHigh ? { ...r, fixHigh: r.fixLow } : r));

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
  for (const rule of applicable) {
    if (!phaseIds.has(rule.phase)) continue;
    const res = evaluateRule(rule, stroke.metrics[rule.phase], hand);
    if (!res) continue;
    if (!editedKp.some((k) => k.ruleId === rule.id)) {
      keyPoints.push({
        id: newId('kp'), phaseId: rule.phase, ruleId: rule.id, text: res.text, status: res.status,
        metric: rule.metric, value: res.value, min: rule.min, max: rule.max,
      });
    } else {
      // Keep the coach's words but refresh the measurement behind them.
      const k = keyPoints.find((x) => x.ruleId === rule.id)!;
      k.value = res.value; k.min = rule.min; k.max = rule.max; k.metric = rule.metric;
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
