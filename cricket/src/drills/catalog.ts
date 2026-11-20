import type { Discipline, MetricId, StrokeType } from '../core';
import { disciplineOf } from '../core';

export type DrillWhere = 'nets' | 'off-field';

export interface Drill {
  id: string;
  name: string;
  where: DrillWhere;
  /** What you need. */
  kit: string;
  steps: string[];
  /** Sets and reps, or time. */
  dose: string;
  /** One thing to feel or say. */
  cue: string;
}

export interface Topic {
  id: string;
  title: string;
  discipline: Discipline;
  /** Measurements a fix on this topic comes from. */
  metrics: MetricId[];
  /** Rule ids that point here even when the metric is shared with another topic. */
  rules?: string[];
  /** The body behind the fix, in plain words. */
  why: string;
  drills: Drill[];
}

export const TOPICS: Topic[] = [
  {
    id: 'backlift', title: 'Higher, earlier backlift', discipline: 'batting', metrics: ['backliftHeight'],
    why: 'A bat that is up and still when the ball is released only has to come down. A late or low backlift has to go up and down in the time the ball takes to arrive, so shots get rushed and the face opens.',
    drills: [
      { id: 'mirror-lift', name: 'Mirror backlift', where: 'off-field', kit: 'Bat, mirror', steps: ['Take guard side-on to a mirror.', 'On a count of "release", lift the bat so the toe points at the sky and the hands sit by the back shoulder.', 'Hold for two seconds, check the face points toward point, lower slowly.'], dose: '3 × 10', cue: '"Up at release."' },
      { id: 'trigger-feeds', name: 'Trigger throw-downs', where: 'nets', kit: 'Feeder, balls', steps: ['Feeder shows the ball, then throws.', 'Your bat must be at the top before the ball leaves the hand.', 'Play a straight drive or leave; the feeder calls "late" if the bat was still moving up.'], dose: '4 overs', cue: 'Bat up, then watch.' },
    ],
  },
  {
    id: 'grip', title: 'Hands together on the handle', discipline: 'batting', metrics: ['handsTogether'],
    why: 'Hands that drift apart fight each other: the bottom hand takes over, the face closes, and the bat swings across the line.',
    drills: [
      { id: 'grip-check', name: 'Grip check between balls', where: 'nets', kit: 'Bat', steps: ['Between every ball, lay the bat face down and pick it up with both hands touching.', 'The Vs of thumb and forefinger point between the splice and the outside edge.'], dose: 'Every ball of a net session', cue: 'Hands touching.' },
      { id: 'one-hand-taps', name: 'Top-hand taps', where: 'off-field', kit: 'Bat, tennis ball', steps: ['Top hand only, tap a tennis ball into the ground in front of you.', 'Then add the bottom hand touching the top hand and keep the same tap.'], dose: '3 × 30 s', cue: 'Top hand leads.' },
    ],
  },
  {
    id: 'stride', title: 'Get the front foot to the ball', discipline: 'batting', metrics: ['strideLength'], rules: ['fwd-stride'],
    why: 'A stride to the pitch of the ball smothers the movement off the seam and lets the head get over it. A short stride means reaching with the arms, which opens the face and lifts the ball.',
    drills: [
      { id: 'cone-stride', name: 'Cone stride', where: 'nets', kit: 'Cones, feeder', steps: ['Feeder throws to a cone placed on a full length.', 'Step the front foot next to the cone, head over the knee, and play a straight drive.', 'Move the cone fuller or shorter every over.'], dose: '4 overs', cue: 'Foot to the cone.' },
      { id: 'lunges', name: 'Batting lunges', where: 'off-field', kit: 'Bat', steps: ['From your stance, lunge the front foot down the line of a crack in the floor.', 'Hold the shape with head over the knee, then push back to guard.'], dose: '3 × 8 each way', cue: 'Long and balanced.' },
    ],
  },
  {
    id: 'head', title: 'Head over the ball, eyes level', discipline: 'batting', metrics: ['headOverFront', 'headStill', 'handsUnderEyes'],
    why: 'The head leads the body. Over the front knee and level, it keeps the bat coming down straight and the ball on the ground. A head falling to the off side drags the shoulders and the bat across.',
    drills: [
      { id: 'drop-ball', name: 'Drop-ball drives', where: 'nets', kit: 'Feeder, balls', steps: ['Feeder stands to the side and drops a ball from shoulder height.', 'Play it after the bounce, under your eyes, and hold the finish for two seconds.'], dose: '3 × 12', cue: 'See it under the eyes.' },
      { id: 'colour-call', name: 'Colour call', where: 'nets', kit: 'Balls with coloured dots, feeder', steps: ['Feeder throws balls with coloured dots.', 'Call the colour just before you play: you cannot see it with a moving head.'], dose: '4 overs', cue: 'Still head, quiet eyes.' },
      { id: 'balance-holds', name: 'Single-leg balance', where: 'off-field', kit: 'None', steps: ['Stand on the front leg in a drive finish.', 'Eyes level on a fixed point, hold for 20 seconds.', 'Progress: close your eyes for 5 seconds.'], dose: '3 × 20 s each leg', cue: 'Eyes level.' },
    ],
  },
  {
    id: 'front-elbow', title: 'High front elbow, straight bat', discipline: 'batting', metrics: ['frontElbowHigh'],
    why: 'The top hand and front elbow steer the bat. When the elbow drops, the bottom hand takes over and the bat swings across the line.',
    drills: [
      { id: 'top-hand-drives', name: 'Top-hand-only drives', where: 'nets', kit: 'Light bat or stump, feeder', steps: ['Hold the bat in the top hand only.', 'Play gentle drives with the front elbow pointing at the ball.', 'Add the bottom hand, keeping it light.'], dose: '3 × 10', cue: 'Elbow at the ball.' },
      { id: 'wall-shadow', name: 'Wall shadow drives', where: 'off-field', kit: 'Bat, wall', steps: ['Stand side-on with your back near a wall.', 'Shadow straight drives: the bat must not hit the wall, which keeps it vertical.'], dose: '3 × 10', cue: 'Straight up, straight down.' },
    ],
  },
  {
    id: 'weight', title: 'Weight into the shot', discipline: 'batting', metrics: ['weightShift'], rules: ['fwd-weight'],
    why: 'Timing, not muscle, makes the ball travel. Moving your weight into the ball adds the body to the bat. Playing on the back foot with weight going back pushes the ball in the air.',
    drills: [
      { id: 'heel-up', name: 'Back heel up', where: 'nets', kit: 'Feeder', steps: ['Play drives off throw-downs.', 'At the finish the back heel must be off the ground, weight on the front foot.'], dose: '4 overs', cue: 'Finish on the front foot.' },
      { id: 'step-throw', name: 'Step-and-throw', where: 'off-field', kit: 'Medicine ball (2–3 kg)', steps: ['Side-on, step forward and push the ball forward from the chest like a drive.', 'Finish balanced on the front leg.'], dose: '3 × 8', cue: 'Step, then push.' },
    ],
  },
  {
    id: 'through', title: 'Swing through and finish', discipline: 'batting', metrics: ['finishHeight', 'batSpeed'],
    why: 'The bat is fastest just after impact if you swing through the ball. Slowing down into the ball, or stopping the bat, costs most of the speed.',
    drills: [
      { id: 'tee-swings', name: 'Batting tee swings', where: 'nets', kit: 'Batting tee, balls', steps: ['Ball on a tee at drive height.', 'Swing through to a high finish over the front shoulder, hold it.'], dose: '3 × 10', cue: 'Through, not at.' },
      { id: 'band-swings', name: 'Light-bat speed swings', where: 'off-field', kit: 'Stump or light bat', steps: ['Fast shadow drives with a stump: you should hear it whoosh after the impact point.'], dose: '3 × 10', cue: 'Loudest after impact.' },
    ],
  },
  {
    id: 'rotate', title: 'Rotate for the pull and the cut', discipline: 'batting', metrics: ['shoulderTurn'], rules: ['pull-turn', 'pull-front', 'cut-high'],
    why: 'Back-foot attacking shots come from the hips and shoulders turning, with the arms extended in front. Arms alone drag the ball and lose control.',
    drills: [
      { id: 'short-throws', name: 'Short throw-downs', where: 'nets', kit: 'Feeder, tennis balls or wobble balls', steps: ['Feeder throws short at chest height.', 'Move back and across, rotate so the chest faces square leg at the finish, roll the wrists.'], dose: '4 overs', cue: 'Turn, hit in front.' },
      { id: 'rotation-throws', name: 'Rotational medicine-ball throw', where: 'off-field', kit: 'Medicine ball, wall', steps: ['Stand side-on to a wall, ball at the back hip.', 'Turn hips then chest and throw the ball into the wall.'], dose: '3 × 8 each side', cue: 'Hips first.' },
    ],
  },
  {
    id: 'legal-arm', title: 'A straight, braced bowling arm', discipline: 'bowling', metrics: ['elbowExtension'],
    why: 'The Laws allow up to 15° of elbow straightening between the upper arm reaching horizontal and release. A single camera can only estimate this, so a high reading means "get it tested", not "illegal". A braced arm is also more repeatable.',
    drills: [
      { id: 'wall-bowl', name: 'Wall bowling', where: 'nets', kit: 'Wall or net, balls', steps: ['Stand side-on a metre from a wall.', 'Bowl gently with the arm brushing past the ear, elbow locked from the gather to release.', 'Step back as it feels natural.'], dose: '3 × 10', cue: 'Long arm.' },
      { id: 'film-check', name: 'High-speed film check', where: 'nets', kit: 'Phone with 120–240 fps slow motion, tripod', steps: ['Film side-on, level with the bowling arm, whole body in frame.', 'Import at 60 fps and compare the elbow extension over several balls.'], dose: '6 balls per check', cue: 'Same arm every ball.' },
      { id: 'band-pull', name: 'Band pull-throughs', where: 'off-field', kit: 'Resistance band', steps: ['Band anchored behind you at head height.', 'With a straight arm, pull it over the top to the opposite hip.'], dose: '3 × 12', cue: 'Straight arm all the way.' },
    ],
  },
  {
    id: 'brace', title: 'Brace the front leg', discipline: 'bowling', metrics: ['frontKneeFlex', 'frontKnee'], rules: ['pace-land', 'pace-brace', 'spin-brace'],
    why: 'A firm front leg stops the body\'s run-up momentum and whips the trunk and arm over it, which is where pace and bounce come from. A collapsing knee soaks the energy up.',
    drills: [
      { id: 'bound-brace', name: 'Bound and brace', where: 'nets', kit: 'Marker, balls', steps: ['From three walking steps, bound and land on a firm front leg next to a marker.', 'Bowl and freeze at release for a count of two: the knee should not sink.'], dose: '3 × 6', cue: 'Land tall.' },
      { id: 'drop-landings', name: 'Drop landings', where: 'off-field', kit: 'Low box (20–30 cm)', steps: ['Step off the box and land on one leg with the knee almost straight.', 'Stick the landing for two seconds.'], dose: '3 × 6 each leg', cue: 'Stiff, not locked.' },
      { id: 'single-leg-squat', name: 'Single-leg squats', where: 'off-field', kit: 'Bench', steps: ['Slow single-leg squat to a bench and back up, knee over the toes.'], dose: '3 × 8 each leg', cue: 'Control the knee.' },
    ],
  },
  {
    id: 'alignment', title: 'Hips and shoulders together', discipline: 'bowling', metrics: ['hipShoulderSep', 'counterRotation', 'trunkSideBend'],
    why: 'When the hips face one way and the shoulders another at back-foot contact (a mixed action), the lower back twists while it takes several times body weight. It is the action pattern most linked with stress injuries in young fast bowlers.',
    drills: [
      { id: 'walk-through', name: 'Slow walk-throughs', where: 'nets', kit: 'None', steps: ['Walk through your delivery stride in slow motion.', 'At back-foot contact, check the back foot, hips and shoulders all point the same way (side-on or front-on).'], dose: '10 reps before every session', cue: 'Feet, hips, chest together.' },
      { id: 'core-antirotation', name: 'Pallof press', where: 'off-field', kit: 'Resistance band', steps: ['Band at chest height to the side.', 'Press it straight out and hold without letting the trunk turn.'], dose: '3 × 10 s × 6 each side', cue: 'Do not let it twist you.' },
    ],
  },
  {
    id: 'release', title: 'High arm, high release', discipline: 'bowling', metrics: ['releaseHeight', 'armFromVertical'],
    why: 'A high release gives bounce and a better angle; an arm that comes round lowers it and pushes the ball down the leg side.',
    drills: [
      { id: 'bar-bowl', name: 'Bowl over a bar', where: 'nets', kit: 'High-jump bar or a pole held up, balls', steps: ['Set a bar a little above head height a few metres in front.', 'Bowl so the ball passes over it and still lands on a length.'], dose: '3 × 6', cue: 'Reach for the sky.' },
      { id: 'ear-brush', name: 'Ear brush', where: 'off-field', kit: 'None', steps: ['Shadow bowl in slow motion with the bicep brushing the ear at release.'], dose: '3 × 10', cue: 'Arm by the ear.' },
    ],
  },
  {
    id: 'gather', title: 'Strong gather and front arm', discipline: 'bowling', metrics: ['frontArmUp', 'chainSequence'],
    why: 'The front arm goes up at the gather and pulls down hard into the hip, which turns the chest and starts the whip of the bowling arm. A lazy front arm leaves the bowling arm working alone.',
    drills: [
      { id: 'gather-freeze', name: 'Gather freeze', where: 'nets', kit: 'None', steps: ['Jump into the gather and freeze with the front arm high, eyes looking past it at the target.', 'Then bowl, pulling the front arm down into the hip.'], dose: '3 × 6', cue: 'Up, then pull.' },
      { id: 'med-ball-chain', name: 'Side-on medicine-ball throws', where: 'off-field', kit: 'Medicine ball', steps: ['Side-on, step, turn the hips, then the chest, then throw over the top.'], dose: '3 × 8', cue: 'Hips, chest, arm.' },
    ],
  },
  {
    id: 'bowl-stride', title: 'Delivery stride length', discipline: 'bowling', metrics: ['strideLength'], rules: ['bowl-stride', 'spin-stride'],
    why: 'Too short and you cannot get over the front leg; too long and the front knee collapses and the hips stall. A stride near 70–85% of your height is a common range for quick bowlers; spinners are shorter.',
    drills: [
      { id: 'stride-markers', name: 'Stride markers', where: 'nets', kit: 'Two markers', steps: ['Mark your back-foot spot and a target front-foot spot.', 'Bowl and hit both marks; move the front marker 10 cm at a time.'], dose: '3 × 6', cue: 'Hit the marks.' },
      { id: 'hip-mobility', name: 'Hip flexor stretch', where: 'off-field', kit: 'Mat', steps: ['Half-kneeling, push the hips forward and reach the arm up.'], dose: '3 × 30 s each side', cue: 'Long through the front.' },
    ],
  },
  {
    id: 'bowl-follow', title: 'Finish the action', discipline: 'bowling', metrics: ['followAcross'],
    why: 'A full follow-through lets the arm and trunk slow down over a long distance, which takes load off the shoulder and the back.',
    drills: [
      { id: 'hip-tap', name: 'Hip tap', where: 'nets', kit: 'None', steps: ['After every ball, the bowling hand finishes past the opposite hip.', 'Run off the pitch in the follow-through.'], dose: 'Every ball', cue: 'Hand to the hip.' },
      { id: 'decel-throws', name: 'Deceleration catches', where: 'off-field', kit: 'Light ball, partner', steps: ['Partner throws a light ball behind your shoulder; catch and slow the arm down across your body.'], dose: '3 × 8', cue: 'Slow it down long.' },
    ],
  },
];

const BY_RULE = new Map(TOPICS.flatMap((t) => (t.rules ?? []).map((r) => [r, t] as const)));

/** The drills topic for a key point, by its rule first and then its measurement and discipline. */
export function topicFor(ruleId: string | undefined, metric: MetricId | undefined, type: StrokeType): Topic | undefined {
  if (ruleId && BY_RULE.has(ruleId)) return BY_RULE.get(ruleId);
  if (!metric) return undefined;
  const d = disciplineOf(type);
  return TOPICS.find((t) => t.discipline === d && t.metrics.includes(metric)) ?? TOPICS.find((t) => t.metrics.includes(metric));
}
