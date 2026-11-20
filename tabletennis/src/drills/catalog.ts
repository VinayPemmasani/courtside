import type { MetricId, StrokeType } from '../core/types';
import type { Motion } from './body';
import { bandTurn, medThrow, seatedTurn, shuffle, squat, ttBackhand, ttFalkenberg, ttForehand, ttPush, ttServe, type TTOpts } from './motions';

/**
 * Drills for every technique fix the analysis can flag. Each fix ("Bend knees", "Turn the waist"…)
 * belongs to one topic; each topic has table drills (multiball, a partner or a robot) and
 * off-table exercises (at home or in the gym), each with a 3D demonstration.
 *
 * Content follows common table tennis coaching practice: shadow play, multiball, regular drills
 * such as the Falkenberg, and serve practice with a bucket of balls. References are listed per topic.
 */

/** 'on-court' is at the table; 'off-court' is away from it. */
export type Where = 'on-court' | 'off-court';
type Stroke = 'forehand' | 'backhand' | 'push' | 'flick' | 'block' | 'serve';

export interface Drill {
  id: string;
  title: string;
  where: Where;
  /** What you need. */
  kit: string;
  /** Sets and reps. */
  dose: string;
  steps: string[];
  /** The one thing to feel. */
  cue: string;
  /** The usual mistake. */
  avoid: string;
  /** Only for these strokes (default: all of the topic's strokes). */
  strokes?: Stroke[];
  /** The 3D demonstration for a stroke. */
  motion: (s: Stroke) => Motion;
  /** Camera angle around the player (0 = behind, 90 = from the right side, 180 = front). */
  cam: number;
}

export interface Topic {
  id: string;
  /** The fix as the app says it. */
  title: string;
  /** Labels this fix goes by on the analysis. */
  labels: string[];
  why: string;
  ruleIds: string[];
  metrics: MetricId[];
  strokes: Stroke[];
  drills: Drill[];
  sources: { title: string; url: string }[];
}

/** The stroke the fix came from, as a 3D demonstration. */
const stroke = (s: Stroke, o: TTOpts = {}): Motion =>
  s === 'backhand' || s === 'block' ? ttBackhand(o)
    : s === 'push' ? ttPush(o)
      : s === 'flick' ? ttPush({ ...o, flick: true })
        : s === 'serve' ? ttServe(o)
          : ttForehand(o);
const gs = (s: Stroke) => stroke(s);
const side = (s: Stroke) => (s === 'backhand' || s === 'block' ? 'bh' : 'fh');
const camFor = (s: Stroke) => (side(s) === 'bh' ? -40 : 60);

const LONG: Stroke[] = ['forehand', 'backhand'];
const ALL: Stroke[] = ['forehand', 'backhand', 'push', 'flick', 'block', 'serve'];

const SRC = {
  loop: { title: 'PingSunday: forehand topspin technique', url: 'https://pingsunday.com/forehand-topspin-table-tennis-technique/' },
  pushLoop: { title: 'Table Tennis Coach: push and loop training drill', url: 'https://www.tabletenniscoach.me.uk/video/push-and-loop-training-drill/' },
  drills: { title: 'Winning Table Tennis: training and drills guide', url: 'https://winningtabletennis.com/table-tennis-training-drills/' },
  falkenberg: { title: 'Larry Hodges: the Falkenberg drill', url: 'https://www.tabletenniscoaching.com/node/1183' },
  stepAround: { title: 'Butterfly: step-around footwork', url: 'https://butterflyonline.com/step-around-footwork/' },
  serve: { title: 'Table Tennis Coach: how to do a legal serve', url: 'https://www.tabletenniscoach.me.uk/how-to-do-a-legal-table-tennis-serve/' },
  laws: { title: 'Laws of table tennis 2.6 (service), reproduced by the University of Memphis', url: 'https://www.memphis.edu/campusrec/pdfs/tabletennis.pdf' },
  limbs: { title: 'Lower limb biomechanics during the topspin forehand: a systematic review (2022)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9330838/' },
};

export const TOPICS: Topic[] = [
  {
    id: 'early-prep',
    title: 'Prepare earlier',
    labels: ['Turn earlier', 'Prepare earlier', 'Early ready', 'Early turn'],
    why: 'A table tennis ball crosses the table in well under a second. The waist turn has to start as the opponent hits, or the stroke gets rushed, short and late.',
    ruleIds: ['fh-turn', 'ls-prep'],
    metrics: ['prepLead'],
    strokes: LONG,
    sources: [SRC.drills, SRC.falkenberg],
    drills: [
      {
        id: 'call-side', title: 'Random multiball: call the side', where: 'on-court', kit: 'Bat, a bucket of balls, a feeder or robot',
        dose: '4 sets of 15 balls',
        steps: [
          'The feeder sends balls at random to your forehand or backhand.',
          'Say "fore" or "back" as the ball leaves the feeder\'s bat.',
          'Turn on the call, so you are set before the ball bounces on your side.',
          'Play the stroke, then back to the ready position before the next ball.',
        ],
        cue: 'Read, call, turn: the call makes the decision early.',
        avoid: 'Waiting for the bounce on your side before you move.',
        motion: (s) => stroke(s, { ball: true }), cam: 30,
      },
      {
        id: 'shadow-ready', title: 'Shadow turn and hold', where: 'off-court', kit: 'Bat, a mirror or phone camera',
        dose: '3 sets of 10 each side',
        steps: [
          'Ready position: feet wider than shoulders, knees bent, bat in front.',
          'On a clap or a beep, turn the waist into the backswing and hold for one second.',
          'Check the mirror: waist turned, bat low and behind, weight on the back leg.',
          'Back to ready, then the other side.',
        ],
        cue: 'The bat goes back because the waist turns.',
        avoid: 'Pulling the arm back while the hips stay facing the table.',
        motion: (s) => stroke(s, { hold: [{ at: 'back', for: 0.9 }] }), cam: 140,
      },
    ],
  },
  {
    id: 'waist-turn',
    title: 'Turn the waist',
    labels: ['Turn the waist', 'Waist turned', 'Coil the waist', 'Waist coiled'],
    why: 'The forehand loop is powered by the waist and legs. Turning the waist back, with the shoulders a little further than the hips, stores energy that the forward swing releases.',
    ruleIds: ['fh-full-turn', 'ls-separation'],
    metrics: ['shoulderTurn', 'hipShoulderSep'],
    strokes: ['forehand'],
    sources: [SRC.loop, SRC.limbs],
    drills: [
      {
        id: 'loop-backspin', title: 'Loop against backspin multiball', where: 'on-court', kit: 'Bat, a bucket of balls, a feeder',
        dose: '4 sets of 12 balls',
        steps: [
          'The feeder serves or pushes backspin long to your forehand.',
          'Turn the waist back, playing-side shoulder lower, bat at knee height.',
          'Swing up and forward from the legs and waist, brushing the back of the ball.',
          'Finish at the forehead and reset.',
        ],
        cue: 'Turn, then lift: the waist starts it, the arm finishes it.',
        avoid: 'Swinging with the arm only while the waist faces the table.',
        motion: () => ttForehand({ ball: true, load: 0.04 }), cam: 70,
      },
      {
        id: 'band-turns', title: 'Band turns', where: 'off-court', kit: 'Resistance band tied at waist height',
        dose: '3 sets of 12 each side',
        steps: ['Side-on to the anchor, band in both hands at chest height.', 'Turn the shoulders away against the band, hips turning less.', 'Return slowly under control.'],
        cue: 'Shoulders turn past the hips.',
        avoid: 'Bending the arms to pull the band instead of turning.',
        motion: () => bandTurn({ side: 'fh' }), cam: 150,
      },
      {
        id: 'seated-turn', title: 'Seated trunk turns', where: 'off-court', kit: 'A chair or a bench',
        dose: '2 sets of 10 each side',
        steps: ['Sit tall with the hips square.', 'Turn the chest as far as you can each way, hips still.', 'Hold each turn for two seconds.'],
        cue: 'Turn from the upper back, not the hips.',
        avoid: 'Slumping as you turn.',
        motion: () => seatedTurn(), cam: 0,
      },
    ],
  },
  {
    id: 'stay-square',
    title: 'Stay square on the backhand',
    labels: ['Stay square', 'Square stance', 'Less backswing', 'No backswing'],
    why: 'The backhand is played in front of the body, square to the table. A big body turn on the backhand or the block slows you down and leaves no time for the next ball.',
    ruleIds: ['bh-compact', 'block-compact'],
    metrics: [],
    strokes: ['backhand', 'block'],
    sources: [SRC.drills],
    drills: [
      {
        id: 'bh-bh-drive', title: 'Backhand to backhand drive', where: 'on-court', kit: 'Bat, balls, a partner or robot',
        dose: '4 rallies of 2 minutes',
        steps: ['Both players backhand to backhand, diagonal.', 'Bring the bat back to your belly, elbow in front.', 'Hit forward from the forearm, stay square, feet still.'],
        cue: 'Elbow in front, chest to the table.',
        avoid: 'Turning the shoulders like a tennis backhand.',
        motion: () => ttBackhand({ ball: true }), cam: -40,
      },
      {
        id: 'mirror-bh', title: 'Mirror backhand shadow', where: 'off-court', kit: 'Bat, a mirror',
        dose: '3 sets of 15',
        steps: ['Face the mirror in the ready stance.', 'Slow backhands: bat to the belly, forward and up to eye level.', 'Your chest should face the mirror the whole time.'],
        cue: 'Square and compact.',
        avoid: 'Swinging round the side of the body.',
        motion: () => ttBackhand({ hold: [{ at: 'back', for: 0.6 }] }), cam: 170,
      },
    ],
  },
  {
    id: 'knees',
    title: 'Bend your knees',
    labels: ['Bend knees', 'Knees loaded', 'Knees bent', 'Get lower', 'Low stance', 'Low to the ball', 'Soft knees', 'Under the table'],
    why: 'Bent knees keep you low to the ball, let you move fast between shots and start the push from the floor that powers a loop.',
    ruleIds: ['fh-knees', 'bh-knees', 'push-knees', 'flick-knees', 'block-knees', 'sv-knees'],
    metrics: ['kneeBend'],
    strokes: ALL,
    sources: [SRC.falkenberg, SRC.limbs],
    drills: [
      {
        id: 'falkenberg', title: 'Falkenberg footwork drill', where: 'on-court', kit: 'Bat, balls, a partner blocking',
        dose: '4 rounds of 90 seconds',
        steps: [
          'Backhand from the backhand corner.',
          'Step around and play a forehand from the backhand corner.',
          'Move out and play a forehand from the wide forehand.',
          'Back to the backhand corner and repeat, staying low the whole time.',
        ],
        cue: 'Stay at the same height: never stand up between shots.',
        avoid: 'Straightening the legs to move, then bending again to hit.',
        strokes: ['forehand', 'backhand', 'block'],
        motion: () => ttFalkenberg(), cam: 20,
      },
      {
        id: 'low-serve-receive', title: 'Low serve and receive', where: 'on-court', kit: 'Bat, balls, a partner',
        dose: '3 sets of 10 each',
        steps: ['Serve short and low, knees bent through the whole serve.', 'Partner receives with a push or flick from a low stance.', 'Swap.'],
        cue: 'Eyes close to the height of the net.',
        avoid: 'Standing up straight after the serve.',
        strokes: ['push', 'flick', 'serve'],
        motion: (s) => stroke(s, { ball: true }), cam: 70,
      },
      {
        id: 'squats', title: 'Bodyweight squats', where: 'off-court', kit: 'None',
        dose: '3 sets of 15',
        steps: ['Feet a little wider than shoulders.', 'Sit back and down until the thighs are near parallel.', 'Push up through the whole foot.'],
        cue: 'Knees over toes, chest up.',
        avoid: 'Knees caving in.',
        motion: () => squat(), cam: 90,
      },
      {
        id: 'side-shuffle', title: 'Low side shuffles', where: 'off-court', kit: 'Two markers 3 m apart',
        dose: '4 sets of 20 seconds',
        steps: ['Low ready stance between the markers.', 'Shuffle side to side without crossing the feet.', 'Stay at the same height throughout.'],
        cue: 'Head level, feet quick.',
        avoid: 'Bobbing up and down.',
        motion: () => shuffle(), cam: 0,
      },
    ],
  },
  {
    id: 'low-point',
    title: 'Start the loop lower',
    labels: ['Start lower', 'Bat below ball'],
    why: 'Against backspin the bat has to start below the ball and travel up through it. Starting at knee height gives the upward path that lifts the ball over the net with topspin.',
    ruleIds: ['fh-low-point'],
    metrics: [],
    strokes: ['forehand'],
    sources: [SRC.loop, SRC.pushLoop],
    drills: [
      {
        id: 'backspin-lift', title: 'Backspin lift with a pause', where: 'on-court', kit: 'Bat, a bucket of balls, a feeder',
        dose: '3 sets of 10 balls',
        steps: ['Feeder sends long backspin to the forehand.', 'Drop the bat to knee height and pause for a beat.', 'Lift up and forward through the back of the ball.'],
        cue: 'Low, pause, lift.',
        avoid: 'Starting the swing at table height and hitting the net.',
        motion: () => ttForehand({ ball: true, load: 0.06, hold: [{ at: 'back', for: 0.6 }] }), cam: 80,
      },
      {
        id: 'jump-squats', title: 'Jump squats', where: 'off-court', kit: 'None',
        dose: '3 sets of 8',
        steps: ['Squat down with the arms low.', 'Jump up, swinging the arms up.', 'Land softly back into the squat.'],
        cue: 'Down, then up: the same pattern as a loop against backspin.',
        avoid: 'Landing stiff-legged.',
        motion: () => squat({ kind: 'jump' }), cam: 90,
      },
    ],
  },
  {
    id: 'contact-front',
    title: 'Hit further in front',
    labels: ['Hit further in front', 'Contact in front', 'Block in front', 'Meet it earlier'],
    why: 'In front of the body the bat is still speeding up and you can see the ball onto it. Late contact beside the hip loses speed and control.',
    ruleIds: ['fh-contact-front', 'bh-contact-front', 'block-front'],
    metrics: ['contactForward'],
    strokes: ['forehand', 'backhand', 'block'],
    sources: [SRC.loop, SRC.drills],
    drills: [
      {
        id: 'one-spot', title: 'One-spot multiball with a freeze', where: 'on-court', kit: 'Bat, a bucket of balls, a feeder',
        dose: '3 sets of 12 balls',
        steps: ['Feeder sends every ball to the same spot.', 'Meet it in front of the body and freeze at contact.', 'Check: bat in front of the free-hand-side hip or further.'],
        cue: 'See the ball onto the bat.',
        avoid: 'Letting the ball come beside you.',
        motion: (s) => stroke(s, { ball: true, hold: [{ at: 'contact', for: 0.7 }] }), cam: 60,
      },
      {
        id: 'shadow-contact', title: 'Shadow strokes with a contact freeze', where: 'off-court', kit: 'Bat',
        dose: '3 sets of 10',
        steps: ['Shadow the stroke slowly.', 'Freeze where contact should be, in front of the body.', 'Finish the stroke and return to ready.'],
        cue: 'Contact out front, every time.',
        avoid: 'Freezing beside the hip.',
        motion: (s) => stroke(s, { hold: [{ at: 'contact', for: 0.9 }] }), cam: 120,
      },
    ],
  },
  {
    id: 'elbow',
    title: 'Relax the elbow',
    labels: ['Elbow angle', 'Relaxed elbow', 'Open the elbow', 'Forearm through', 'Fold the arm', 'Arm folded'],
    why: 'A bent, relaxed elbow lets the forearm whip through the ball. A locked straight arm is slow and stiff; a cramped one has no room to swing.',
    ruleIds: ['fh-elbow', 'bh-elbow', 'bh-fold'],
    metrics: ['elbowAngle'],
    strokes: LONG,
    sources: [SRC.loop],
    drills: [
      {
        id: 'forearm-whip', title: 'Close-to-table counter-hits', where: 'on-court', kit: 'Bat, balls, a partner',
        dose: '4 rallies of 2 minutes',
        steps: ['Stand close to the table and counter-hit at medium pace.', 'Keep the elbow bent about 110 degrees and loose.', 'Let the forearm and wrist do the speed.'],
        cue: 'Loose arm, fast forearm.',
        avoid: 'Swinging from a straight, tense arm.',
        motion: (s) => stroke(s, { ball: true }), cam: 90,
      },
      {
        id: 'mirror-elbow', title: 'Slow shadow in the mirror', where: 'off-court', kit: 'Bat, a mirror',
        dose: '3 sets of 10',
        steps: ['Side-on to a mirror, shadow at half speed.', 'Watch the elbow: bent, not locked, not jammed into the ribs.', 'Speed up only when it stays the same.'],
        cue: 'Elbow bent, never locked.',
        avoid: 'Straightening the arm through contact.',
        motion: (s) => stroke(s, { slow: 2 }), cam: 100,
      },
    ],
  },
  {
    id: 'finish',
    title: 'Finish and recover',
    labels: ['Finish at forehead', 'Finish in front', 'Finish forward', 'Short finish', 'Shorter finish', 'Stay low', 'Ready for 3rd ball', 'Finish to target'],
    why: 'In table tennis the next ball comes back in under a second. A finish in front of the forehead (forehand) or toward the target (backhand), then straight back to ready, keeps you in the rally.',
    ruleIds: ['fh-finish', 'fh-finish-across', 'bh-finish', 'flick-finish', 'push-short', 'sv-short-finish'],
    metrics: ['crossBody', 'wristAboveShoulder'],
    strokes: ALL,
    sources: [SRC.loop, SRC.drills],
    drills: [
      {
        id: 'freeze-finish', title: 'Freeze the finish, then reset', where: 'on-court', kit: 'Bat, balls, a feeder',
        dose: '3 sets of 10 balls',
        steps: ['Play the stroke and freeze at the finish for one beat.', 'Check where the bat is: forehead height on a loop, short on a push.', 'Snap back to ready before the next ball.'],
        cue: 'Finish, freeze, ready.',
        avoid: 'Wrapping the bat round the neck like a tennis forehand.',
        motion: (s) => stroke(s, { ball: true, hold: [{ at: 'finish', for: 0.7 }] }), cam: 40,
      },
      {
        id: 'shadow-recover', title: 'Shadow strokes with fast recovery', where: 'off-court', kit: 'Bat',
        dose: '4 sets of 20 seconds',
        steps: ['Shadow the stroke at full speed.', 'Return to the ready position as fast as you can.', 'Count how many clean strokes you play in 20 seconds.'],
        cue: 'The stroke ends at ready, not at the finish.',
        avoid: 'Letting the arm hang after the finish.',
        motion: (s) => stroke(s), cam: 140,
      },
    ],
  },
  {
    id: 'short-game',
    title: 'Step in for the short ball',
    labels: ['Step in', 'Reach over table', 'Over the table', 'Push forward', 'Arm forward', 'Cock the wrist', 'Wrist cocked'],
    why: 'Short balls are played over the table: step in with the playing-side foot under the table, meet the ball early, at the top of the bounce, and keep the stroke short.',
    ruleIds: ['push-reach', 'push-arm', 'flick-reach', 'flick-cock'],
    metrics: [],
    strokes: ['push', 'flick'],
    sources: [SRC.pushLoop, SRC.drills],
    drills: [
      {
        id: 'push-rally', title: 'Push to push', where: 'on-court', kit: 'Bat, balls, a partner',
        dose: '4 rallies of 2 minutes',
        steps: ['Push to push, both short and long.', 'Step in with the playing-side foot for every ball, then step back.', 'Contact early with an open bat, forward and slightly down.'],
        cue: 'Step, push, step back.',
        avoid: 'Reaching with the arm while the feet stay back.',
        strokes: ['push'],
        motion: () => ttPush({ ball: true }), cam: 60,
      },
      {
        id: 'flick-multiball', title: 'Flick multiball', where: 'on-court', kit: 'Bat, a bucket of balls, a feeder',
        dose: '3 sets of 10 balls',
        steps: ['Feeder serves short.', 'Step in under the table, elbow up, wrist cocked back.', 'Flick at the top of the bounce with a short, quick snap.'],
        cue: 'Snap, don\'t swing.',
        avoid: 'A big swing that lifts the ball long.',
        strokes: ['flick'],
        motion: () => ttPush({ ball: true, flick: true }), cam: 60,
      },
      {
        id: 'lunge-step', title: 'Step-in lunges', where: 'off-court', kit: 'None',
        dose: '3 sets of 10 each leg',
        steps: ['From the ready stance, lunge forward with the playing-side leg.', 'Reach the bat hand forward as if over the table.', 'Push back to ready.'],
        cue: 'Front knee over the toes, chest forward.',
        avoid: 'Leaning in from the waist without stepping.',
        motion: () => squat({ kind: 'split' }), cam: 90,
      },
    ],
  },
  {
    id: 'serve',
    title: 'Legal, low serve',
    labels: ['Legal toss', 'Toss 16 cm', 'Low contact', 'Contact lower'],
    why: 'The laws ask for the ball to rest on a flat open palm and rise at least 16 cm near vertically. Contact low, close to net height, keeps the serve short and low.',
    ruleIds: ['sv-toss', 'sv-low-contact'],
    metrics: ['tossRise'],
    strokes: ['serve'],
    sources: [SRC.laws, SRC.serve],
    drills: [
      {
        id: 'toss-catch', title: 'Toss and catch', where: 'on-court', kit: 'Balls',
        dose: '3 sets of 10',
        steps: ['Ball still on a flat open palm, above the table, behind the end line.', 'Toss straight up at least 16 cm (above the net height plus a hand).', 'Catch it on the way down without moving the palm forward.'],
        cue: 'Straight up, no spin from the fingers.',
        avoid: 'Tossing toward the table or cupping the ball.',
        motion: () => ttServe({ tossOnly: true }), cam: 90,
      },
      {
        id: 'low-serve', title: 'Bucket serves to a target', where: 'on-court', kit: 'Bat, a bucket of balls, a target near the net',
        dose: '3 sets of 15 serves',
        steps: ['Legal toss, then let the ball drop to near net height.', 'Brush under the ball for backspin.', 'Aim for the ball to bounce twice on the far side.'],
        cue: 'Low contact, short bounce.',
        avoid: 'Hitting the ball at the top of the toss.',
        motion: () => ttServe({ ball: true }), cam: 60,
      },
      {
        id: 'squat-hold', title: 'Squat holds', where: 'off-court', kit: 'None',
        dose: '3 holds of 30 seconds',
        steps: ['Sink to a half squat and hold.', 'Keep the back long and the arms in front.', 'Breathe and stay still.'],
        cue: 'Low and still, like the serve stance.',
        avoid: 'Rising out of it as you tire.',
        motion: () => squat({ depth: 0.25 }), cam: 90,
      },
    ],
  },
  {
    id: 'chain',
    title: 'Power from the legs and waist',
    labels: ['Use your legs', 'Leg drive', 'Waist leads', 'Kinetic chain', 'Use the waist', 'Body power', 'Shift your weight', 'Weight transfer'],
    why: 'Fast loops start at the floor: the legs push, the waist turns, then the shoulder, forearm and wrist. Advanced players get more racket speed from the lower trunk turning.',
    ruleIds: ['ls-weight', 'ls-legs', 'ls-chain', 'ls-body-power'],
    metrics: ['weightShift', 'legDrive', 'chainSequence', 'bodyPower'],
    strokes: LONG,
    sources: [SRC.limbs, SRC.loop],
    drills: [
      {
        id: 'slow-chain', title: 'Slow-motion chain shadow', where: 'on-court', kit: 'Bat',
        dose: '3 sets of 8',
        steps: ['Shadow the loop in slow motion, saying "legs, waist, arm".', 'The playing-side leg pushes and the waist turns while the bat is still back.', 'Then multiball at 60 percent with the same order.'],
        cue: 'Legs push, waist pulls, arm follows.',
        avoid: 'The arm starting before the legs and waist.',
        motion: (s) => stroke(s, { slow: 2.2 }), cam: 60,
      },
      {
        id: 'rot-throw', title: 'Rotational medicine ball throws', where: 'off-court', kit: '2 kg medicine ball, a wall',
        dose: '3 sets of 8 each side',
        steps: ['Side-on to the wall, load the back leg.', 'Start the throw with the hips, then the chest, then the arms let go.', 'Finish facing the wall.'],
        cue: 'Throw with the hips, not the hands.',
        avoid: 'Arms throwing while the hips stay still.',
        motion: (s) => medThrow(side(s)), cam: 120,
      },
    ],
  },
];

const BY_RULE = new Map<string, Topic>();
for (const t of TOPICS) for (const r of t.ruleIds) BY_RULE.set(r, t);

/** Topic for a fix: by its rule, else by what it measures. */
export function topicFor(ruleId?: string, metric?: MetricId, strokeType?: StrokeType): Topic | undefined {
  if (ruleId && BY_RULE.has(ruleId)) return BY_RULE.get(ruleId);
  if (!metric) return undefined;
  if (metric === 'shoulderTurn') return TOPICS.find((t) => t.id === (strokeType === 'backhand' || strokeType === 'block' ? 'stay-square' : 'waist-turn'));
  if (metric === 'elbowAngle' && (strokeType === 'push' || strokeType === 'flick')) return TOPICS.find((t) => t.id === 'short-game');
  if (metric === 'contactForward' && (strokeType === 'push' || strokeType === 'flick')) return TOPICS.find((t) => t.id === 'short-game');
  return TOPICS.find((t) => t.metrics.includes(metric));
}

/** Drills of a topic that fit a stroke, and the stroke to demonstrate them with. */
export function drillsFor(topic: Topic, strokeType?: StrokeType): { drill: Drill; stroke: Stroke }[] {
  const s = (strokeType && (topic.strokes as string[]).includes(strokeType) ? strokeType : topic.strokes[0]) as Stroke;
  return topic.drills.filter((d) => !d.strokes || d.strokes.includes(s)).map((drill) => ({ drill, stroke: s }));
}

export const STROKE_NAME: Record<Stroke, string> = { forehand: 'Forehand loop', backhand: 'Backhand loop', push: 'Push', flick: 'Flick', block: 'Block', serve: 'Serve' };
export type { Stroke as DrillStroke };
export { gs, camFor };
