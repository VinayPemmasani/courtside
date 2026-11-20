import type { MetricId, StrokeType } from '../core/types';
import type { Motion } from './body';
import {
  backhand, bandTurn, forehand, lob, medOverhead, medThrow, overhead, seatedTurn, shuffle, squat, turnFreeze, underServe, volley, wallBall,
} from './motions';

/**
 * Drills for every technique fix the analysis can flag. Each fix ("Get lower", "Prepare earlier"…)
 * belongs to one topic; each topic has on-court drills (with a ball) and off-court exercises (at home
 * or in the gym), each with a 3D demonstration.
 *
 * Content follows common padel coaching practice (shadow swings, freeze drills, basket feeding,
 * wall work, medicine-ball and band work). References are listed per topic.
 */

export type Where = 'on-court' | 'off-court';
type Stroke = Exclude<StrokeType, 'unknown'>;

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

const BACKHAND_SIDE: Stroke[] = ['backhand'];
const side = (s: Stroke): 'fh' | 'bh' => (BACKHAND_SIDE.includes(s) ? 'bh' : 'fh');
const camFor = (s: Stroke) => (side(s) === 'bh' ? -70 : 70);

/** The stroke the fix came from, demonstrated with options. */
type Opts = Parameters<typeof forehand>[0];
const stroke = (s: Stroke, o: Opts = {}): Motion => {
  switch (s) {
    case 'backhand': return backhand(o);
    case 'lob': return lob('fh', o);
    case 'wall': return wallBall('fh', o);
    case 'volley': return volley('fh', { ball: o?.ball, slow: o?.slow });
    case 'serve': return underServe({ slow: o?.slow });
    case 'bandeja':
    case 'vibora':
    case 'smash': return overhead(s, { slow: o?.slow, ball: o?.ball });
    default: return forehand(o);
  }
};
/** The groundstroke version (forehand or backhand) of a stroke. */
const gs = (s: Stroke) => (side(s) === 'bh' ? backhand({}) : forehand({}));

const GS: Stroke[] = ['forehand', 'backhand'];
const OH: Stroke[] = ['bandeja', 'vibora', 'smash'];

const SRC = {
  bandeja: { title: 'The Padel School: bandeja secrets', url: 'https://thepadelschool.com/resources/padel-tips/bandeja-secrets' },
  bandejaVibora: { title: 'M1 Pádel: difference between the bandeja and the víbora', url: 'https://www.m1padel.com/se/blog/post/difference-between-the-bandeja-and-the-vibora-in-padel' },
  volley: { title: 'M1 Pádel: forehand and backhand volley technique', url: 'https://www.m1padel.com/se/blog/post/how-to-master-the-forehand-volley-and-backhand-volley-in-padel-complete-technique' },
  smash: { title: 'M1 Pádel: how to smash in padel', url: 'https://www.m1padel.com/se/blog/post/how-to-do-a-smash-in-padel-technique-power-and-tips-to-improve-your-smash' },
  shortBackswing: { title: 'Padel Point: exercises for a short backswing', url: 'https://www.tiendapadelpoint.com/en/short-backswing-padel-exercises-en' },
  bajada: { title: 'Training Padel: a consistent contact point after the back glass', url: 'https://trainingpadel.com/technical-drills/learning-the-bajada-de-pared-developing-a-consistent-contact-point-in-front-of-the-body-after-the-ball-rebounds-off-the-glass/' },
  backWall: { title: 'Padelmesh: how to play off the back wall', url: 'https://padelmesh.com/en/articles/how-to-play-off-the-back-wall-in-padel' },
  noxWall: { title: 'NOX: off-the-back-wall forehands', url: 'https://noxsport.com/en/blogs/making-you-improve/como-hacer-la-salida-de-pared-de-drive-o-de-derecha-en-padel' },
  fip: { title: 'International Padel Federation: Rules of Padel (Rule 6, the serve)', url: 'https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel.pdf' },
  globo: { title: 'Padel Park: the globo, why the lob matters', url: 'https://www.padelpark.nz/blog/the-globo-most-important-shot-in-padel-beginner-guide' },
  rotThrows: { title: 'Human Kinetics: rotational throws', url: 'https://us.humankinetics.com/blogs/excerpt/rotational-throws' },
  slam: { title: 'Human Kinetics: overhead rotational medicine ball slam', url: 'https://us.humankinetics.com/blogs/excerpt/overhead-rotational-medicine-ball-slam' },
};

export const TOPICS: Topic[] = [
  {
    id: 'early-prep',
    title: 'Prepare earlier',
    labels: ['Turn earlier', 'Prepare earlier', 'Early preparation', 'Unit turn'],
    why: 'Padel is fast and close: the ball comes off the glass or the opponent\'s volley in a fraction of a second. Turning the shoulders and paddle as soon as you read the ball leaves time to set up a controlled contact instead of a rushed arm swing.',
    ruleIds: ['fh-unit-turn', 'gs-prep'],
    metrics: ['prepLead'],
    strokes: ['forehand', 'backhand', 'wall', 'lob'],
    sources: [SRC.volley, SRC.shortBackswing],
    drills: [
      {
        id: 'turn-freeze', title: 'Split, turn and freeze', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8 balls each side',
        steps: [
          'Split step as the feeder hits.',
          'Land and turn hips, shoulders and paddle together before the ball reaches the net.',
          'Freeze in the turned position: free hand on the paddle, chest facing the side glass.',
          'Let the ball bounce, then swing. Turned late? Let it go and reset.',
        ],
        cue: 'Turn when the ball crosses the net, not when it bounces.',
        avoid: 'Taking the paddle back with the arm only while the shoulders stay square.',
        motion: (s) => turnFreeze(side(s), { ball: true, hold: 0.7 }), cam: 40,
      },
      {
        id: 'call-side', title: 'Call the side', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 10 random feeds',
        steps: [
          'The feeder sends balls to your forehand or backhand at random.',
          'Shout "drive" or "revés" before the ball crosses the net.',
          'Turn on the call, so the turn is finished by the bounce.',
          'Hit cross-court low over the net, recover, split again.',
        ],
        cue: 'Read, call, turn: the call makes the decision early.',
        avoid: 'Waiting to see the bounce before you move.',
        motion: () => turnFreeze('both', { hold: 0.35 }), cam: 0,
      },
      {
        id: 'mirror-turns', title: 'Shadow unit turns', where: 'off-court', kit: 'Paddle, a mirror or phone camera',
        dose: '3 sets of 10 each side',
        steps: [
          'Start in the ready position with a small split hop.',
          'Turn to one side in one piece: feet, hips, shoulders, paddle.',
          'Hold for two seconds and check the mirror: shoulders turned, paddle head up, free hand on the paddle.',
          'Back to ready and turn the other way.',
        ],
        cue: 'The paddle moves because the body turns.',
        avoid: 'Swinging the paddle back behind you before the shoulders move.',
        motion: (s) => turnFreeze(side(s), { hold: 1.0 }), cam: 140,
      },
    ],
  },
  {
    id: 'shoulder-turn',
    title: 'Turn, but keep it compact',
    labels: ['Turn further', 'Shorter take-back', 'Compact turn', 'Shoulders turned', 'Short take-back'],
    why: 'In padel the power comes from the shoulder turn, not from a long arm swing. Turn the shoulders until the chest faces the side glass, but keep the paddle in front of the back shoulder: a big tennis take-back is late on fast balls and clips the glass behind you.',
    ruleIds: ['fh-compact', 'bh-turn', 'vo-short'],
    metrics: ['shoulderTurn'],
    strokes: ['forehand', 'backhand', 'volley'],
    sources: [SRC.shortBackswing, SRC.volley],
    drills: [
      {
        id: 'back-to-net', title: 'Chest to the side glass', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: GS,
        dose: '3 sets of 10',
        steps: [
          'On each feed, turn until your chest faces the side glass.',
          'Stop the paddle when it is level with your back shoulder: you should still see it out of the corner of your eye.',
          'Hold for a beat at the end of the turn, then swing.',
        ],
        cue: 'Shoulders turn fully, the paddle stays in sight.',
        avoid: 'Swinging the paddle far behind your back like a tennis forehand.',
        motion: (s) => stroke(s, { ball: true, hold: [{ at: 'back', for: 0.6 }] }), cam: 0,
      },
      {
        id: 'glass-backswing', title: 'Back to the glass', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: GS,
        dose: '3 sets of 10',
        steps: [
          'Stand one paddle length in front of the back glass.',
          'Take feeds and swing without the paddle touching the glass.',
          'Move half a step closer each set as the take-back gets shorter.',
        ],
        cue: 'Short back, long through.',
        avoid: 'Stepping away from the glass to make room for a long swing.',
        motion: (s) => ({ ...stroke(s, { ball: true }), props: [{ kind: 'wall', p: [0, 0, -1.2], size: 6 }] }), cam: 120,
      },
      {
        id: 'volley-short', title: 'Back to the fence volleys', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: ['volley'],
        dose: '3 sets of 10',
        steps: [
          'Volley feeds at the net with your back a paddle length from the side mesh.',
          'Turn only the shoulders: the paddle must not touch the mesh behind you.',
          'Punch forward and stop.',
        ],
        cue: 'Turn the shoulders, not the arm.',
        avoid: 'A big swing that the ball beats to the net.',
        motion: () => volley('fh', { hold: [{ at: 'set', for: 0.5 }] }), cam: 100,
      },
      {
        id: 'hips-still-turns', title: 'Hips-still shoulder turns', where: 'off-court', kit: 'Nothing',
        dose: '2 sets of 10 each way',
        steps: [
          'Athletic stance, arms crossed on your chest.',
          'Keep the belt buckle facing forward and turn the shoulders as far as you can.',
          'Pause, come back through the middle and turn the other way.',
        ],
        cue: 'Turn from the ribs, not from the neck.',
        avoid: 'Letting the hips turn with the shoulders.',
        motion: () => seatedTurn(), cam: 180,
      },
      {
        id: 'band-turns', title: 'Band rotations', where: 'off-court', kit: 'Resistance band tied at chest height',
        dose: '3 sets of 10 each side',
        steps: [
          'Stand side-on to the anchor, band in both hands, arms long.',
          'Start turned toward the anchor, then rotate away against the band.',
          'Return slowly for three seconds.',
        ],
        cue: 'Long arms, the trunk does the work.',
        avoid: 'Pulling with the arms or bending the elbows.',
        motion: (s) => bandTurn({ side: side(s) }), cam: 160,
      },
    ],
  },
  {
    id: 'knees',
    title: 'Get lower',
    labels: ['Bend knees', 'Get lower', 'Knees bent', 'Sit lower', 'Get under it', 'Knees flexed', 'Low and patient'],
    why: 'The padel ball bounces low and dies off the glass. Bending the knees brings your eyes and paddle down to the ball instead of bending at the waist, keeps you balanced, and lets the legs lift the ball over the net.',
    ruleIds: ['fh-knees', 'bh-knees', 'wl-knees', 'lb-knees', 'vo-knees', 'sv-knees'],
    metrics: ['kneeBend'],
    strokes: ['forehand', 'backhand', 'wall', 'lob', 'volley', 'serve'],
    sources: [SRC.bajada, SRC.volley],
    drills: [
      {
        id: 'sit-and-hit', title: 'Sit and hit', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: ['forehand', 'backhand', 'wall', 'lob'],
        dose: '3 sets of 10',
        steps: [
          'Ask for low, slow feeds.',
          'As you turn, sit down as if onto a low stool: knees bent, back tall.',
          'Keep your head at the same height from the turn to contact.',
          'Lift up out of the legs as you swing.',
        ],
        cue: 'Sit down to the ball, stand up through it.',
        avoid: 'Bending at the waist instead of at the knees.',
        motion: (s) => stroke(s, { ball: true, load: 0.32, hold: [{ at: 'back', for: 0.4 }] }), cam: 90,
      },
      {
        id: 'low-volley', title: 'Low volleys at the feet', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: ['volley'],
        dose: '3 sets of 10',
        steps: [
          'Feeder sends low balls at your feet while you stand at the net.',
          'Bend the knees until your eyes are close to the height of the ball.',
          'Keep the paddle face open and push the ball deep.',
        ],
        cue: 'Bend the knees, not the paddle.',
        avoid: 'Dropping the paddle head with straight legs.',
        motion: () => volley('fh', { low: true, hold: [{ at: 'contact', for: 0.5 }] }), cam: 90,
      },
      {
        id: 'serve-sit', title: 'Bend with the drop', where: 'on-court', kit: 'Paddle, balls', strokes: ['serve'],
        dose: '3 sets of 10 serves',
        steps: [
          'Bend the knees as you let the ball go.',
          'Stay down while the ball bounces.',
          'Serve from that height and only stand up after the finish.',
        ],
        cue: 'Drop the ball, drop yourself.',
        avoid: 'Standing tall and reaching down with the arm.',
        motion: () => underServe({ hold: [{ at: 'back', for: 0.5 }] }), cam: 90,
      },
      {
        id: 'low-shuffle', title: 'Low shuffle between cones', where: 'on-court', kit: 'Two cones 3 m apart',
        dose: '4 rounds of 20 seconds',
        steps: [
          'Wide stance, knees bent, weight on the balls of the feet.',
          'Shuffle side to side between the cones without your feet crossing.',
          'Keep your head at the same height the whole time.',
        ],
        cue: 'Stay low, stay level.',
        avoid: 'Standing up between steps.',
        motion: () => shuffle(), cam: 180,
      },
      {
        id: 'squats', title: 'Bodyweight squats', where: 'off-court', kit: 'Nothing',
        dose: '3 sets of 12',
        steps: [
          'Feet shoulder width, toes slightly out.',
          'Sit the hips back and down until the thighs are near level, arms forward.',
          'Knees track over the toes, heels stay down.',
          'Drive up to tall.',
        ],
        cue: 'Hips back first, then the knees bend.',
        avoid: 'Knees caving inward or heels lifting.',
        motion: () => squat({ kind: 'squat' }), cam: 120,
      },
      {
        id: 'split-squats', title: 'Split squats', where: 'off-court', kit: 'Nothing (dumbbells optional)',
        dose: '3 sets of 8 each leg',
        steps: [
          'Long split stance, back heel up.',
          'Lower straight down until the back knee almost touches the floor.',
          'Front knee stays over the ankle; push back up through the front heel.',
        ],
        cue: 'Straight down, straight up.',
        avoid: 'Leaning forward over the front knee.',
        motion: () => squat({ kind: 'split' }), cam: 90,
      },
    ],
  },
  {
    id: 'contact-front',
    title: 'Hit further in front',
    labels: ['Hit further in front', 'Contact out front', 'Contact in front', 'Hit in front', 'In front', 'Get behind the ball'],
    why: 'Meeting the ball in front of the front hip lets the body\'s rotation reach the paddle and keeps the face steady, so you can aim low over the net. Late contact pushes the ball up into the glass or the net players.',
    ruleIds: ['fh-contact-front', 'bh-contact-front', 'lb-front', 'sm-front'],
    metrics: ['contactForward'],
    strokes: ['forehand', 'backhand', 'lob', 'smash'],
    sources: [SRC.volley, SRC.smash],
    drills: [
      {
        id: 'catch-in-front', title: 'Catch it in front', where: 'on-court', kit: 'Balls, a feeder', strokes: ['forehand', 'backhand', 'lob'],
        dose: '2 sets of 10 each side',
        steps: [
          'No paddle. Turn as if to hit.',
          'Swing the hitting hand forward and catch the ball with the palm out in front of your front hip.',
          'Freeze where you caught it: that is your contact point.',
        ],
        cue: 'Catch it where you can see it.',
        avoid: 'Catching beside or behind the body.',
        motion: (s) => stroke(s, { ball: true, noRacket: true, hold: [{ at: 'contact', for: 0.7 }] }), cam: 70,
      },
      {
        id: 'freeze-contact', title: 'Hit and freeze', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: ['forehand', 'backhand', 'lob'],
        dose: '3 sets of 8',
        steps: [
          'Hit easy feeds and freeze the paddle at contact for two seconds.',
          'Check: face toward the target, hand ahead of the front hip, arm comfortable.',
          'Then finish the swing.',
        ],
        cue: 'Contact a forearm\'s length ahead of you, not beside you.',
        avoid: 'Letting the ball get past the front foot.',
        motion: (s) => stroke(s, { ball: true, contactFwd: 0.08, hold: [{ at: 'contact', for: 0.7 }] }), cam: 120,
      },
      {
        id: 'smash-behind', title: 'Get behind the lob', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: ['smash'],
        dose: '3 sets of 8 lobs',
        steps: [
          'The feeder lobs from the back of the court.',
          'Turn and take quick side steps back until the ball is falling in front of your hitting shoulder.',
          'Smash down through the ball; if it is behind your head, play a bandeja instead.',
        ],
        cue: 'Move the feet until the ball drops in front of you.',
        avoid: 'Leaning back and smashing a ball that is already behind you.',
        motion: () => overhead('smash', { hold: [{ at: 'contact', for: 0.5 }] }), cam: 90,
      },
      {
        id: 'shadow-contact', title: 'Shadow to contact', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: [
          'Put a marker on the floor a little in front of your front foot.',
          'Shadow swing and stop dead with the paddle face over the marker.',
          'Hold, then finish the swing slowly.',
        ],
        cue: 'Same spot every time.',
        avoid: 'Stopping with the paddle next to the body.',
        motion: (s) => (s === 'smash' ? overhead('smash', { ball: false, slow: 1.6, hold: [{ at: 'contact', for: 1.0 }] }) : stroke(s, { split: false, contactFwd: 0.08, hold: [{ at: 'contact', for: 1.0 }] })), cam: 150,
      },
    ],
  },
  {
    id: 'arm-space',
    title: 'Give yourself space',
    labels: ['Cramped arm', 'Arm has space'],
    why: 'A cramped arm means the ball got too close to the body. With room to swing, the arm can extend and the paddle face stays steady through contact.',
    ruleIds: ['fh-arm-space'],
    metrics: ['elbowAngle'],
    strokes: ['forehand'],
    sources: [SRC.shortBackswing],
    drills: [
      {
        id: 'spacing-feeds', title: 'Paddle-length spacing', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 10',
        steps: [
          'The feeder aims straight at your body.',
          'Take small adjustment steps away from the ball so you hit it a paddle length and a forearm from your hip.',
          'Hold the contact and check the elbow is open, not jammed into your side.',
        ],
        cue: 'Move the feet, not the arm.',
        avoid: 'Leaning away or chicken-winging the elbow.',
        motion: () => forehand({ ball: true, hold: [{ at: 'contact', for: 0.5 }] }), cam: 0,
      },
      {
        id: 'adjust-steps', title: 'Small steps to the ball', where: 'on-court', kit: 'Cones, balls',
        dose: '4 rounds of 20 seconds, then 10 feeds',
        steps: [
          'Shuffle between two cones with small, quick steps, staying low.',
          'Then hit feeds and take two or three small steps before every ball.',
        ],
        cue: 'Big steps to get there, small steps to set up.',
        avoid: 'Arriving with one big lunge, too close to the ball.',
        motion: () => shuffle(), cam: 180,
      },
      {
        id: 'long-arm-throw', title: 'Long-arm medicine ball throws', where: 'off-court', kit: '2 to 3 kg medicine ball, a wall',
        dose: '3 sets of 8',
        steps: [
          'Stand side-on to a wall, ball held with long arms.',
          'Turn back, then throw by rotating the body, arms long and away from the chest.',
          'Catch and repeat.',
        ],
        cue: 'Keep the ball away from your body the whole way.',
        avoid: 'Pulling the ball into your chest before throwing.',
        motion: () => medThrow('fh'), cam: 120,
      },
    ],
  },
  {
    id: 'finish-target',
    title: 'Finish toward the target',
    labels: ['Finish to target', 'Finish forward', 'Swing through'],
    why: 'Padel rewards control over spin. Finishing with the paddle pointing at your target, around shoulder height, keeps the ball low over the net and away from the glass. A big high wrap lifts the ball up for the net players to smash.',
    ruleIds: ['fh-finish', 'bh-finish', 'sv-finish', 'bj-finish'],
    metrics: ['wristAboveShoulder'],
    strokes: ['forehand', 'backhand', 'serve', 'bandeja'],
    sources: [SRC.bandejaVibora, SRC.shortBackswing],
    drills: [
      {
        id: 'target-finish', title: 'Point at the cone', where: 'on-court', kit: 'Paddle, balls, a feeder, a cone',
        dose: '3 sets of 10', strokes: GS,
        steps: [
          'Put a cone in the far court where you want the ball.',
          'Hit and hold the finish with the paddle pointing at the cone, at shoulder height.',
          'Count to two before you recover.',
        ],
        cue: 'Finish where you want the ball to go.',
        avoid: 'Wrapping the paddle over the shoulder like a tennis topspin forehand.',
        motion: (s) => ({ ...stroke(s, { ball: true, hold: [{ at: 'finish', for: 0.8 }] }), props: [{ kind: 'cone', p: [-0.6, 0, 9] }] }), cam: 140,
      },
      {
        id: 'serve-target', title: 'Serve to the target', where: 'on-court', kit: 'Paddle, balls, a target in the service box', strokes: ['serve'],
        dose: '3 sets of 10 serves',
        steps: [
          'Put a target near the centre line, deep in the service box.',
          'Serve and freeze the finish with the paddle face toward the target.',
          'Count how many of ten land within a paddle length of it.',
        ],
        cue: 'The paddle finishes where the ball goes.',
        avoid: 'Stopping the swing at the hip.',
        motion: () => ({ ...underServe({ hold: [{ at: 'finish', for: 0.7 }] }), props: [{ kind: 'target', p: [-2.6, 0, 10.5] }] }), cam: 140,
      },
      {
        id: 'bandeja-finish', title: 'Bandeja: finish forward', where: 'on-court', kit: 'Paddle, balls, a feeder', strokes: ['bandeja'],
        dose: '3 sets of 8 lobs',
        steps: [
          'Feeder lobs from the back of the court.',
          'Hit the bandeja and stop with the paddle pointing at the far corner, still side-on.',
          'Step back in toward the net.',
        ],
        cue: 'Forward, not down and across.',
        avoid: 'Pulling the paddle down to the opposite hip like a smash.',
        motion: () => overhead('bandeja', { hold: [{ at: 'finish', for: 0.7 }] }), cam: 120,
      },
      {
        id: 'mirror-finish', title: 'Shadow and hold the finish', where: 'off-court', kit: 'Paddle, a mirror',
        dose: '3 sets of 10',
        steps: [
          'Shadow the stroke slowly in front of a mirror.',
          'Stop at the finish: paddle in front, at shoulder height, face toward the target.',
          'Hold for three seconds and check your balance.',
        ],
        cue: 'Balanced, still, pointing.',
        avoid: 'Falling out of the shot after the finish.',
        motion: (s) => (s === 'bandeja' ? overhead('bandeja', { ball: false, slow: 1.6, hold: [{ at: 'finish', for: 1.0 }] }) : s === 'serve' ? underServe({ slow: 1.6, hold: [{ at: 'finish', for: 1.0 }] }) : stroke(s, { split: false, slow: 1.6, hold: [{ at: 'finish', for: 1.0 }] })), cam: 160,
      },
    ],
  },
  {
    id: 'finish-across',
    title: 'Cut across and finish',
    labels: ['Finish across', 'Cut across', 'Finish across body'],
    why: 'The víbora and the smash get their speed and spin from the body rotating all the way through. Finishing across, by the opposite hip, shows that the trunk turned and the arm cut across the ball.',
    ruleIds: ['vb-finish', 'sm-finish'],
    metrics: ['crossBody'],
    strokes: ['vibora', 'smash'],
    sources: [SRC.bandejaVibora, SRC.smash],
    drills: [
      {
        id: 'serve-finish', title: 'Finish in the far pocket', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8 lobs',
        steps: [
          'Feeder lobs to your forehand side.',
          'Hit at 70 percent and let the paddle finish by your opposite hip.',
          'Hold the finish until the ball reaches the glass.',
        ],
        cue: 'Up, through, then down across.',
        avoid: 'Stopping the paddle on the hitting side.',
        motion: (s) => overhead(s === 'smash' ? 'smash' : 'vibora', { hold: [{ at: 'finish', for: 0.7 }] }), cam: 120,
      },
      {
        id: 'shadow-finish', title: 'Slow-motion overhead shadow', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: [
          'Shadow the overhead at half speed.',
          'Rotate until your chest faces the net and the paddle passes your opposite hip.',
          'Back foot ends up on its toe.',
        ],
        cue: 'Chest to the net, back heel up.',
        avoid: 'Finishing with the chest still facing the side glass.',
        motion: (s) => overhead(s === 'smash' ? 'smash' : 'vibora', { ball: false, slow: 1.8, hold: [{ at: 'finish', for: 0.6 }] }), cam: 160,
      },
    ],
  },
  {
    id: 'finish-high',
    title: 'Lift it: low to high',
    labels: ['Finish higher', 'Swing up more', 'Finish high', 'Low to high', 'Lift it out', 'Lift and finish up'],
    why: 'A lob has to climb over the net players and land deep, and a ball off the back glass has to climb out of the corner. Both come from swinging up from below the ball with an open paddle face, not from flicking the wrist.',
    ruleIds: ['lb-path', 'lb-finish', 'wl-finish'],
    metrics: ['swingPath', 'wristAboveShoulder'],
    strokes: ['lob', 'wall'],
    sources: [SRC.globo, SRC.noxWall],
    drills: [
      {
        id: 'over-the-rope', title: 'Over the net player', where: 'on-court', kit: 'Paddle, balls, a partner at the net',
        dose: '3 sets of 10',
        steps: [
          'Your partner stands at the net with the paddle raised high.',
          'Lob over the paddle so the ball lands behind the far service line.',
          'Start with the paddle below the ball and finish with the hand above the shoulder.',
        ],
        cue: 'Below the ball, up through it, face open.',
        avoid: 'Lifting the ball with the wrist instead of the swing path.',
        motion: (s) => (s === 'wall' ? wallBall('fh', { hold: [{ at: 'finish', for: 0.6 }] }) : lob('fh', { hold: [{ at: 'finish', for: 0.6 }] })), cam: 70,
      },
      {
        id: 'drop-to-finish', title: 'Drop and lift', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: [
          'Shadow swing in slow motion.',
          'Pause with the paddle head below the hand.',
          'Swing up and finish with the hand above the shoulder, face to the sky.',
        ],
        cue: 'Low to high, like scooping under the ball.',
        avoid: 'Swinging straight across at shoulder height.',
        motion: () => lob('fh', { split: false, ball: false, slow: 1.6, hold: [{ at: 'back', for: 0.4 }, { at: 'finish', for: 0.6 }] }), cam: 90,
      },
    ],
  },
  {
    id: 'bh1-throat',
    title: 'Free hand on the paddle',
    labels: ['hand on paddle', 'hand on throat'],
    why: 'On the backhand the free hand on the paddle throat turns the shoulders and sets the paddle back in one piece, so the hitting arm stays relaxed and the take-back stays short.',
    ruleIds: ['bh-hand-throat'],
    metrics: ['handsTogether'],
    strokes: ['backhand'],
    sources: [SRC.volley],
    drills: [
      {
        id: 'throat-turn', title: 'Free-hand take-back', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 10',
        steps: [
          'Split step, then turn by pushing the paddle back with the free hand on the throat.',
          'Keep the free hand on until the paddle is back.',
          'Release the free hand back as you swing forward.',
        ],
        cue: 'The free hand takes the paddle back.',
        avoid: 'Letting go early and pulling the paddle back with the hitting arm.',
        motion: () => turnFreeze('bh', { ball: true, hold: 0.7 }), cam: -60,
      },
      {
        id: 'throat-shadow', title: 'Shadow take-backs', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: ['From ready, turn with both hands on the paddle.', 'Pause at the end of the take-back, free hand still on the throat.', 'Swing and let the arms split apart like wings.'],
        cue: 'Both hands back, arms split forward.',
        avoid: 'Turning only the hitting arm.',
        motion: () => backhand({ split: false, hold: [{ at: 'unit', for: 0.5 }, { at: 'back', for: 0.5 }] }), cam: -120,
      },
    ],
  },
  {
    id: 'bh1-straight',
    title: 'Long arm on the backhand',
    labels: ['Lengthen arm', 'Long arm'],
    why: 'The padel backhand is hit with a long, firm arm in front of the body. Leading with a bent elbow means the ball got too close and the face opens, so the ball floats up.',
    ruleIds: ['bh-arm'],
    metrics: ['elbowAngle'],
    strokes: ['backhand'],
    sources: [SRC.volley],
    drills: [
      {
        id: 'bh-contact-freeze', title: 'Long-arm freeze', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8',
        steps: ['Easy feeds to the backhand.', 'Freeze at contact: arm long, contact in front of the front foot.', 'Free arm goes back, chest stays sideways.'],
        cue: 'Arm and paddle form one long lever.',
        avoid: 'Leading with the elbow.',
        motion: () => backhand({ ball: true, hold: [{ at: 'contact', for: 0.8 }] }), cam: -40,
      },
      {
        id: 'bh-slow-shadow', title: 'Slow-motion backhand shadow', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: ['Shadow backhands at half speed.', 'Stop at contact and check the arm is long and in front of the front foot.', 'Extend forward toward the target.'],
        cue: 'Long at contact, forward at the finish.',
        avoid: 'Bending the elbow to reach the ball.',
        motion: () => backhand({ split: false, slow: 1.8, hold: [{ at: 'contact', for: 0.7 }] }), cam: -100,
      },
    ],
  },
  {
    id: 'glass',
    title: 'Play off the back glass',
    labels: ['Turn to the glass', 'Side-on to glass', 'Wait for the ball', 'Let it come out'],
    why: 'A deep ball that bounces past the service line will come off the back glass. Turn to the glass as soon as you see it, stay low and patient, and let the ball come out to your front hip: hitting it close to the glass leaves no room to swing.',
    ruleIds: ['wl-turn', 'wl-contact'],
    metrics: ['contactForward'],
    strokes: ['wall'],
    sources: [SRC.bajada, SRC.backWall, SRC.noxWall],
    drills: [
      {
        id: 'glass-feed', title: 'Glass feeds', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 10 each side',
        steps: [
          'The feeder throws the ball so it bounces once and hits the back glass.',
          'Turn to the glass early and follow the ball with your paddle back.',
          'Wait for it to come out to your front hip, then lift it forward over the net.',
        ],
        cue: 'Turn, wait, let it come to you.',
        avoid: 'Rushing to hit the ball while it is still close to the glass.',
        motion: () => wallBall('fh', { hold: [{ at: 'contact', for: 0.4 }] }), cam: 100,
      },
      {
        id: 'glass-catch', title: 'Catch it off the glass', where: 'on-court', kit: 'Balls, a partner',
        dose: '3 sets of 10',
        steps: [
          'No paddle. Your partner throws a ball to bounce and hit the back glass.',
          'Turn side-on to the glass and follow the ball.',
          'Catch it with the hitting hand in front of your front hip after it comes out.',
        ],
        cue: 'Where you catch it is where you will hit it.',
        avoid: 'Catching it next to the glass or behind the body.',
        motion: () => wallBall('fh', { noRacket: true, hold: [{ at: 'contact', for: 0.7 }] }), cam: 70,
      },
      {
        id: 'home-rebound', title: 'Wall rebound catches at home', where: 'off-court', kit: 'A ball, a wall',
        dose: '3 sets of 15',
        steps: [
          'Stand two metres in front of a wall, facing away from it.',
          'Bounce the ball so it hits the wall, turn to follow it and catch it as it comes back past you.',
          'Catch it in front of the hip, knees bent.',
        ],
        cue: 'Read the rebound, then move.',
        avoid: 'Standing too close to the wall.',
        motion: () => wallBall('fh', { noRacket: true, slow: 1.4 }), cam: 70,
      },
    ],
  },
  {
    id: 'trophy',
    title: 'Side-on, paddle up',
    labels: ['Turn side-on', 'Side-on', 'Point at the ball', 'Free arm up', 'Paddle up early'],
    why: 'Every padel overhead starts the same way: turn side-on as the lob goes up, point the free hand at the ball and get the paddle up beside the head early. It lines up the ball, levels the shoulders and leaves time for the right shot.',
    ruleIds: ['oh-side-on', 'oh-free-arm', 'oh-paddle-up'],
    metrics: ['tossArmUp'],
    strokes: OH,
    sources: [SRC.bandeja, SRC.bandejaVibora],
    drills: [
      {
        id: 'trophy-hold', title: 'Turn and point', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8 lobs',
        steps: ['As the feeder lobs, turn side-on and step back with the paddle up.', 'Point your free hand at the ball and hold until it starts to fall.', 'Then hit.'],
        cue: 'Side-on, hand up, paddle up.',
        avoid: 'Backpedalling square to the net with the paddle down.',
        motion: (s) => overhead(s as 'bandeja', { hold: [{ at: 'up', for: 0.8 }] }), cam: 100,
      },
      {
        id: 'crossover-back', title: 'Turn and move back', where: 'on-court', kit: 'Two cones',
        dose: '4 rounds of 6',
        steps: ['Start at the net.', 'Turn side-on and move back to the service line with side steps or crossovers.', 'Set with the paddle up and free hand pointing, then come back to the net.'],
        cue: 'Turn first, then move.',
        avoid: 'Running backwards facing the net.',
        motion: () => overhead('bandeja', { setOnly: true, hold: [{ at: 'up', for: 0.6 }] }), cam: 90,
      },
      {
        id: 'trophy-mirror', title: 'Mirror set-up checks', where: 'off-court', kit: 'Paddle, a mirror',
        dose: '3 sets of 10',
        steps: ['Side-on to a mirror, turn and lift the paddle beside your head.', 'Freeze: free hand up, elbow at shoulder height, paddle tip up.', 'Swing through slowly.'],
        cue: 'Two hands up, one to aim, one to hit.',
        avoid: 'Lifting the paddle with a straight arm or leaving the free hand down.',
        motion: () => overhead('bandeja', { setOnly: true, slow: 1.5, hold: [{ at: 'up', for: 1.0 }] }), cam: 160,
      },
    ],
  },
  {
    id: 'bandeja',
    title: 'Bandeja: in front and controlled',
    labels: ['Let it drop a little', 'Do not lock the arm', 'Contact height', 'Controlled arm', 'Contact in front'],
    why: 'The bandeja keeps the net position against a lob. Meet the ball in front, a little above the head rather than at full stretch, with a slightly bent arm and a forward slice, so the ball stays low off the glass and you can step back in.',
    ruleIds: ['bj-front', 'bj-height', 'bj-arm'],
    metrics: ['contactHeight'],
    strokes: ['bandeja'],
    sources: [SRC.bandeja, SRC.bandejaVibora],
    drills: [
      {
        id: 'bandeja-feeds', title: 'Bandeja from the service line', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8 lobs',
        steps: ['Start at the net; the feeder lobs to just inside the service line.', 'Turn, move back and let the ball drop to a little above head height.', 'Slice forward to the far corner and move back in to the net.'],
        cue: 'In front, not on top.',
        avoid: 'Jumping to hit it at full stretch like a smash.',
        motion: () => overhead('bandeja', { hold: [{ at: 'contact', for: 0.5 }] }), cam: 90,
      },
      {
        id: 'bandeja-target', title: 'Bandeja to the corner', where: 'on-court', kit: 'Paddle, balls, a feeder, a target',
        dose: '3 sets of 8 lobs',
        steps: ['Put a target near the far back corner.', 'Hit bandejas to land past the service line and die off the glass near the target.', 'Score one point for a hit within a metre.'],
        cue: 'Slow and deep beats fast and short.',
        avoid: 'Hitting hard so the ball bounces high off the glass.',
        motion: () => ({ ...overhead('bandeja'), props: [{ kind: 'target', p: [-3.5, 0, 17] }] }), cam: 150,
      },
      {
        id: 'tray-shadow', title: 'Carry the tray', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: ['Hold the paddle face up beside your head, like a waiter carrying a tray (bandeja).', 'Turn side-on and swing forward and slightly down, keeping the face open.', 'Stop with the paddle in front at shoulder height.'],
        cue: 'The tray never tips over.',
        avoid: 'Closing the face and pulling down across the body.',
        motion: () => overhead('bandeja', { ball: false, slow: 1.6, hold: [{ at: 'up', for: 0.6 }, { at: 'contact', for: 0.6 }] }), cam: 140,
      },
    ],
  },
  {
    id: 'vibora',
    title: 'Víbora: from the side',
    labels: ['Contact to the side', 'Out to the side', 'Lengthen arm', 'Long arm'],
    why: 'The víbora is the attacking version of the bandeja: let the ball drop a little lower and to the side of the head, then cut across it with a long arm so it skids low off the side glass.',
    ruleIds: ['vb-side', 'vb-arm'],
    metrics: ['contactSide'],
    strokes: ['vibora'],
    sources: [SRC.bandejaVibora],
    drills: [
      {
        id: 'vibora-side', title: 'Side-of-the-head víboras', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8 lobs',
        steps: ['The feeder lobs to your forehand side, a little short.', 'Let the ball come down beside your head, out to the side.', 'Cut across the ball toward the side glass and finish by the opposite hip.'],
        cue: 'Beside the head, cut across.',
        avoid: 'Hitting it on top of the head, which turns it into a weak bandeja.',
        motion: () => overhead('vibora', { hold: [{ at: 'contact', for: 0.5 }] }), cam: 160,
      },
      {
        id: 'vibora-shadow', title: 'Slow-motion víbora shadow', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: ['Shadow the víbora at half speed.', 'Stop at contact with the paddle out to the side, arm long.', 'Finish across the body.'],
        cue: 'Long arm, side contact, across.',
        avoid: 'Bending the elbow and hitting over the head.',
        motion: () => overhead('vibora', { ball: false, slow: 1.8, hold: [{ at: 'contact', for: 0.7 }] }), cam: 160,
      },
    ],
  },
  {
    id: 'reach-up',
    title: 'Smash: reach up',
    labels: ['Reach up', 'Contact higher', 'Full extension', 'High contact'],
    why: 'A flat or topspin smash (remate) is hit at full reach: it gives the steepest angle down into the court and uses the legs and trunk rising into the ball.',
    ruleIds: ['sm-reach', 'sm-height'],
    metrics: ['contactHeight'],
    strokes: ['smash'],
    sources: [SRC.smash, SRC.slam],
    drills: [
      {
        id: 'reach-freeze', title: 'Reach and freeze', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8 lobs',
        steps: ['The feeder sends short, high lobs.', 'Hit at full reach and freeze for a second: arm straight, body tall.', 'Then let the paddle finish.'],
        cue: 'Hit the ball at the top of your reach.',
        avoid: 'Letting the ball drop to head height.',
        motion: () => overhead('smash', { hold: [{ at: 'contact', for: 0.6 }] }), cam: 90,
      },
      {
        id: 'overhead-throw', title: 'Overhead medicine ball throws', where: 'off-court', kit: '1 to 2 kg medicine ball, a wall',
        dose: '3 sets of 8',
        steps: ['Ball overhead, knees bent, slight arch.', 'Drive up with the legs and throw the ball high against the wall.', 'Finish tall, then step through.'],
        cue: 'Legs first, then the arms throw up.',
        avoid: 'Throwing with the arms from a straight-legged stance.',
        motion: () => medOverhead(), cam: 90,
      },
    ],
  },
  {
    id: 'toss',
    title: 'Drop the ball in front',
    labels: ['Drop it in front'],
    why: 'Where the ball bounces decides where you hit it. Drop it a little in front and to the side of the front foot so the contact is out in front, at the same height every time.',
    ruleIds: ['sv-front'],
    metrics: ['contactForward'],
    strokes: ['serve'],
    sources: [SRC.fip],
    drills: [
      {
        id: 'toss-catch', title: 'Drop and catch', where: 'on-court', kit: 'Balls',
        dose: '3 sets of 10 drops',
        steps: ['Hold the ball in front of your front hip.', 'Let it go (do not throw it down) and let it bounce once.', 'Catch it at knee height without moving your feet.'],
        cue: 'Let go, don\'t throw.',
        avoid: 'Throwing the ball down so it bounces up too high.',
        motion: () => underServe({ dropOnly: true }), cam: 100,
      },
      {
        id: 'toss-target', title: 'Drop on the mark', where: 'on-court', kit: 'A marker or a ball can lid, balls',
        dose: '3 sets of 10 drops',
        steps: ['Put a marker a forearm in front of and beside your front foot, behind the service line.', 'Drop the ball onto the marker.', 'Serve only when the drop hits it.'],
        cue: 'Same drop, same spot.',
        avoid: 'Dropping the ball beside your back foot.',
        motion: () => ({ ...underServe({ dropOnly: true }), props: [{ kind: 'target', p: [0.5, 0, 0.55] }] }), cam: 60,
      },
    ],
  },
  {
    id: 'serve-legal',
    title: 'Serve at or below the waist',
    labels: ['Hit below the waist', 'Legal height', 'Turn side-on'],
    why: 'The rules say the serve is hit after one bounce, at or below the waist, with one foot on the ground (FIP Rule 6). A lower contact also keeps the serve low over the net so the receiver cannot attack it.',
    ruleIds: ['sv-legal', 'sv-turn'],
    metrics: ['contactBelowWaist'],
    strokes: ['serve'],
    sources: [SRC.fip],
    drills: [
      {
        id: 'waist-line', title: 'Under the line', where: 'on-court', kit: 'Paddle, balls, an elastic or string at waist height',
        dose: '3 sets of 10 serves',
        steps: ['Tie an elastic between two posts or cones at your waist height, beside where you serve.', 'Drop the ball and serve with the paddle passing under the elastic.', 'Any touch of the elastic is a fault.'],
        cue: 'Let it drop, then swing.',
        avoid: 'Hitting the ball on the way up off the bounce at chest height.',
        motion: () => underServe({ hold: [{ at: 'contact', for: 0.6 }] }), cam: 90,
      },
      {
        id: 'side-on-serve', title: 'Side-on serve routine', where: 'on-court', kit: 'Paddle, balls',
        dose: '3 sets of 10 serves',
        steps: ['Stand side-on behind the service line, front foot pointing at the net post.', 'Paddle back before the drop, then drop, bounce and swing.', 'Walk in to the net after every serve.'],
        cue: 'Set, drop, swing, move in.',
        avoid: 'Facing the net and pushing the ball with the arm.',
        motion: () => underServe({ hold: [{ at: 'back', for: 0.5 }] }), cam: 40,
      },
      {
        id: 'serve-shadow', title: 'Shadow serves', where: 'off-court', kit: 'Paddle',
        dose: '3 sets of 10',
        steps: ['Shadow the serve slowly in front of a mirror, side-on.', 'Stop at contact: paddle below the belt, in front of the front hip.', 'Finish toward the target.'],
        cue: 'Below the belt, in front.',
        avoid: 'Stopping at contact with the paddle above the waist.',
        motion: () => underServe({ slow: 1.6, hold: [{ at: 'contact', for: 0.8 }] }), cam: 100,
      },
    ],
  },
  {
    id: 'volley',
    title: 'Volley: firm and in front',
    labels: ['Meet it in front', 'Out in front', 'Firm arm', 'Firm, slight bend', 'Short finish', 'Shorter finish'],
    why: 'At the net there is no time to swing. Meet the volley in front of the body with a firm arm and a slight bend, punch through and stop toward the target: the ball\'s pace does the rest.',
    ruleIds: ['vo-front', 'vo-arm', 'vo-finish'],
    metrics: ['contactForward', 'elbowAngle', 'crossBody'],
    strokes: ['volley'],
    sources: [SRC.volley],
    drills: [
      {
        id: 'volley-punch', title: 'Punch and freeze', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 10 each side',
        steps: ['At the net, the feeder sends medium-paced balls.', 'Step toward the ball and meet it in front, paddle head above the wrist.', 'Freeze for a second after contact: the paddle should still be in front of you.'],
        cue: 'Catch it on the paddle in front.',
        avoid: 'Swinging through and finishing across the body.',
        motion: () => volley('fh', { hold: [{ at: 'finish', for: 0.6 }] }), cam: 90,
      },
      {
        id: 'catch-volley', title: 'Catch volleys', where: 'on-court', kit: 'Balls, a feeder',
        dose: '3 sets of 10',
        steps: ['No paddle. Volley position at the net.', 'Step forward and catch the ball in front of you with the hitting hand.', 'Then do the same with the paddle, stopping where you caught it.'],
        cue: 'Where the hand catches, the paddle volleys.',
        avoid: 'Catching beside the body.',
        motion: () => volley('fh', { hold: [{ at: 'contact', for: 0.7 }] }), cam: 70,
      },
      {
        id: 'wall-volleys', title: 'Wall volleys', where: 'off-court', kit: 'Paddle, a ball, a wall',
        dose: '3 sets of 30 seconds',
        steps: ['Stand two metres from a wall.', 'Volley the ball against the wall without letting it bounce, forehand then backhand.', 'Keep the paddle in front and the arm firm.'],
        cue: 'Short, firm, in front.',
        avoid: 'Taking the paddle back between volleys.',
        motion: () => ({ ...volley('bh'), props: [{ kind: 'wall', p: [0, 0, 2.6], size: 4 }] }), cam: 120,
      },
    ],
  },
  {
    id: 'coil',
    title: 'Coil shoulders past the hips',
    labels: ['Coil shoulders past hips', 'Hip-shoulder stretch', 'Coil shoulders', 'Coiled trunk'],
    why: 'When the shoulders turn further than the hips, the trunk stretches like a spring. Uncoiling it gives pace on the drive without a long arm swing.',
    ruleIds: ['gs-separation'],
    metrics: ['hipShoulderSep'],
    strokes: GS,
    sources: [SRC.rotThrows],
    drills: [
      {
        id: 'coil-hold', title: 'Coil and hold', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8',
        steps: ['Turn the hips about halfway and the shoulders all the way.', 'Feel the stretch across your belly for one beat.', 'Let the hips turn first to start the swing.'],
        cue: 'Hips halfway, shoulders all the way.',
        avoid: 'Turning hips and shoulders the same amount.',
        motion: (s) => stroke(s, { ball: true, turn: 12, hold: [{ at: 'back', for: 0.6 }] }), cam: 20,
      },
      {
        id: 'split-turns', title: 'Split-stance shoulder turns', where: 'off-court', kit: 'Nothing',
        dose: '2 sets of 10 each way',
        steps: ['Low split stance locks the hips.', 'Arms crossed, turn the shoulders as far as you can each way.', 'Breathe out as you turn.'],
        cue: 'Hips locked, ribs turn.',
        avoid: 'Twisting from the neck.',
        motion: () => seatedTurn({ lunge: true }), cam: 180,
      },
      {
        id: 'coil-band', title: 'Band rotations with quiet hips', where: 'off-court', kit: 'Resistance band',
        dose: '3 sets of 10 each side',
        steps: ['Band anchored at chest height beside you.', 'Rotate the shoulders against the band while the hips barely move.', 'Return slowly.'],
        cue: 'Shoulders work, hips watch.',
        avoid: 'Swinging the hips round to cheat.',
        motion: (s) => bandTurn({ side: side(s) }), cam: 160,
      },
    ],
  },
  {
    id: 'weight',
    title: 'Move your weight forward',
    labels: ['Move weight forward', 'Weight forward'],
    why: 'Stepping into the ball adds the body\'s mass to the shot and keeps contact in front. In padel it also carries you forward toward the net after the drive or the serve.',
    ruleIds: ['gs-weight', 'sv-weight'],
    metrics: ['weightShift'],
    strokes: ['forehand', 'backhand', 'serve'],
    sources: [SRC.rotThrows],
    drills: [
      {
        id: 'step-in', title: 'Step-in drives', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 10',
        steps: ['Load the back foot as you turn.', 'Step toward the net with the front foot as the ball bounces.', 'Swing as the weight arrives on the front foot; back heel comes up.'],
        cue: 'Back foot, front foot, hit.',
        avoid: 'Falling backwards or hitting off the back foot.',
        motion: (s) => (s === 'serve' ? underServe({}) : stroke(s, { ball: true, stepIn: true })), cam: 90,
      },
      {
        id: 'step-throw', title: 'Step-in medicine ball throws', where: 'off-court', kit: '2 to 3 kg medicine ball, a wall',
        dose: '3 sets of 8',
        steps: ['Side-on, ball at the back hip, weight on the back foot.', 'Step in and throw by rotating as the weight moves forward.', 'Finish balanced on the front foot.'],
        cue: 'Push off the back, land on the front.',
        avoid: 'Throwing before the step lands.',
        motion: (s) => medThrow(side(s), { step: true }), cam: 100,
      },
    ],
  },
  {
    id: 'legs',
    title: 'Drive with the legs',
    labels: ['Drive with legs', 'Drive up with legs', 'Leg drive'],
    why: 'A smash starts from the floor. Bending and pushing up into the ball adds pace and height without extra arm effort, and it is what lets you hit the ball out of the court (por tres).',
    ruleIds: ['sm-legs'],
    metrics: ['legDrive'],
    strokes: ['smash'],
    sources: [SRC.smash],
    drills: [
      {
        id: 'jump-serve', title: 'Bend and jump smash', where: 'on-court', kit: 'Paddle, balls, a feeder',
        dose: '3 sets of 8 lobs',
        steps: ['Turn and bend the knees with the paddle up.', 'Explode up so both feet leave the court at contact.', 'Land balanced and recover to the net.'],
        cue: 'Jump into the ball, not backwards.',
        avoid: 'Hitting flat-footed.',
        motion: () => overhead('smash', { hold: [{ at: 'up', for: 0.4 }] }), cam: 90,
      },
      {
        id: 'jump-squats', title: 'Jump squats', where: 'off-court', kit: 'Nothing',
        dose: '3 sets of 6',
        steps: ['Squat down with the arms back.', 'Explode up, swinging the arms high.', 'Land softly back into the squat.'],
        cue: 'Fast up, soft down.',
        avoid: 'Landing with straight legs.',
        motion: () => squat({ kind: 'jump' }), cam: 120,
      },
    ],
  },
  {
    id: 'chain',
    title: 'Hips lead the swing',
    labels: ['Hips lead the swing', 'Hips first', 'Trunk first', 'Kinetic chain', 'Use the body, not the arm', 'Body power'],
    why: 'Power flows from the ground up: legs, hips, trunk, arm, hand, each one speeding up the next. Starting with the arm skips the biggest muscles and loads the elbow (padel elbow is a common injury).',
    ruleIds: ['gs-chain', 'gs-body-power', 'vb-chain', 'sm-chain'],
    metrics: ['chainSequence', 'bodyPower'],
    strokes: ['forehand', 'backhand', 'vibora', 'smash'],
    sources: [SRC.rotThrows, SRC.slam],
    drills: [
      {
        id: 'slow-chain', title: 'Slow-motion chain shadow', where: 'on-court', kit: 'Paddle',
        dose: '3 sets of 8',
        steps: ['Shadow swing in slow motion and say the order out loud: "hips, chest, arm".', 'The back hip turns first while the paddle is still back.', 'Then hit balls at 60 percent keeping the same order.'],
        cue: 'Hips pull, arm follows.',
        avoid: 'The hand starting forward before the hips turn.',
        motion: (s) => (OH.includes(s) ? overhead(s as 'vibora', { ball: false, slow: 2 }) : stroke(s, { split: false, slow: 2.2 })), cam: 60,
      },
      {
        id: 'rot-throw', title: 'Rotational medicine ball throws', where: 'off-court', kit: '2 to 3 kg medicine ball, a wall',
        dose: '3 sets of 8 each side',
        steps: ['Side-on to the wall, load the back hip.', 'Start the throw with the hips, then the chest, then the arms let go.', 'Finish facing the wall, back heel up.'],
        cue: 'Throw with the hips, not the hands.',
        avoid: 'Arms throwing while the hips stay still.',
        motion: (s) => medThrow(side(s)), cam: 120,
      },
      {
        id: 'chain-overhead', title: 'Overhead medicine ball throws', where: 'off-court', kit: '1 to 2 kg medicine ball, a wall', strokes: ['vibora', 'smash'],
        dose: '3 sets of 8',
        steps: ['Bend the knees with the ball overhead.', 'Legs drive, hips push forward, then the arms throw.', 'Release high and forward.'],
        cue: 'Ground up.',
        avoid: 'Throwing with the arms first.',
        motion: () => medOverhead(), cam: 90,
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
  const byId = (id: string) => TOPICS.find((t) => t.id === id);
  if (metric === 'elbowAngle') {
    if (strokeType === 'backhand') return byId('bh1-straight');
    if (strokeType === 'volley') return byId('volley');
    if (strokeType === 'bandeja') return byId('bandeja');
    if (strokeType === 'vibora') return byId('vibora');
    if (strokeType === 'smash') return byId('reach-up');
    return byId('arm-space');
  }
  if (metric === 'shoulderTurn') return byId(strokeType && OH.includes(strokeType as Stroke) ? 'trophy' : 'shoulder-turn');
  if (metric === 'handsTogether') return byId('bh1-throat');
  if (metric === 'contactHeight') return byId(strokeType === 'bandeja' ? 'bandeja' : 'reach-up');
  if (metric === 'crossBody') return byId(strokeType === 'volley' ? 'volley' : strokeType === 'bandeja' ? 'finish-target' : 'finish-across');
  if (metric === 'wristAboveShoulder') return byId(strokeType === 'lob' || strokeType === 'wall' ? 'finish-high' : strokeType && OH.includes(strokeType as Stroke) ? 'trophy' : 'finish-target');
  if (metric === 'contactForward') {
    if (strokeType === 'wall') return byId('glass');
    if (strokeType === 'volley') return byId('volley');
    if (strokeType === 'serve') return byId('toss');
    if (strokeType === 'bandeja') return byId('bandeja');
  }
  return TOPICS.find((t) => t.metrics.includes(metric));
}

/** Drills of a topic that fit a stroke, and the stroke to demonstrate them with. */
export function drillsFor(topic: Topic, strokeType?: StrokeType): { drill: Drill; stroke: Stroke }[] {
  const s = (strokeType && (topic.strokes as string[]).includes(strokeType) ? strokeType : topic.strokes[0]) as Stroke;
  return topic.drills.filter((d) => !d.strokes || d.strokes.includes(s)).map((drill) => ({ drill, stroke: s }));
}

export const STROKE_NAME: Record<Stroke, string> = {
  forehand: 'Forehand', backhand: 'Backhand', serve: 'Serve', volley: 'Volley', bandeja: 'Bandeja', vibora: 'Víbora', smash: 'Smash', lob: 'Lob', wall: 'Off the glass',
};
export type { Stroke as DrillStroke };
export { gs, camFor };
