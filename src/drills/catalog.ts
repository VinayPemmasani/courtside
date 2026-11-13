import type { MetricId, StrokeType } from '../core/types';
import type { Motion } from './body';
import { backhand, bandTurn, forehand, medOverhead, medThrow, seatedTurn, serve, shuffle, squat, turnFreeze } from './motions';

/**
 * Drills for every technique fix the analysis can flag. Each fix ("Bend knees", "Turn earlier"…)
 * belongs to one topic; each topic has on-court drills (with a ball) and off-court exercises (at home
 * or in the gym), each with a 3D demonstration.
 *
 * Content follows common coaching practice (USTA / ITF style progressions: shadow swings, freeze
 * drills, feeding drills, medicine-ball and band work). References are listed per topic.
 */

export type Where = 'on-court' | 'off-court';
type Stroke = 'forehand' | 'backhand-1h' | 'backhand-2h' | 'serve';

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

const gs = (s: Stroke) => (s === 'backhand-1h' ? backhand({}) : s === 'backhand-2h' ? backhand({ twoHands: true }) : forehand({}));
/** The groundstroke the fix came from, with options. */
const stroke = (s: Stroke, o: Parameters<typeof forehand>[0] = {}) =>
  s === 'backhand-1h' ? backhand(o) : s === 'backhand-2h' ? backhand({ ...o, twoHands: true }) : forehand(o);
const side = (s: Stroke) => (s === 'backhand-1h' || s === 'backhand-2h' ? 'bh' : 'fh');
const camFor = (s: Stroke) => (side(s) === 'bh' ? -70 : 70);

const GS: Stroke[] = ['forehand', 'backhand-1h', 'backhand-2h'];

export const TOPICS: Topic[] = [
  {
    id: 'early-prep',
    title: 'Turn earlier',
    labels: ['Turn earlier', 'Prepare earlier', 'Early preparation', 'Unit turn'],
    why: 'The unit turn (hips, shoulders and racket turning together) has to start the moment you read the ball. Late turns force a rushed, arm-only swing and late contact.',
    ruleIds: ['fh-unit-turn', 'gs-prep'],
    metrics: ['prepLead'],
    strokes: GS,
    sources: [
      { title: 'Sportplan: Unit turns', url: 'https://www.sportplan.net/drills/Tennis/Agility-Fitness/Unit-Turns-UnitTurns.jsp' },
      { title: 'Essential Tennis: your first move after reading the ball', url: 'https://www.essentialtennisinstruction.com/?p=8013' },
      { title: 'CoachLife: Unit turn timing and coil', url: 'https://www.coachlife.com/videos/unit-turn-foundation-timing' },
    ],
    drills: [
      {
        id: 'turn-freeze', title: 'Split, turn and freeze', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 8 balls each side',
        steps: [
          'Split step as the feeder hits.',
          'Land and turn hips, shoulders and racket together before the ball reaches the net.',
          'Freeze in the turned position: off hand on the racket, chest facing the side fence.',
          'Let the ball bounce, then swing. Turned late? Let it go and reset.',
        ],
        cue: 'Turn on the bounce on their side, not on yours.',
        avoid: 'Taking the racket back with the arm only while the shoulders stay square.',
        motion: (s) => turnFreeze(side(s), { ball: true, hold: 0.7 }), cam: 40,
      },
      {
        id: 'call-side', title: 'Call the side', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 10 random feeds',
        steps: [
          'The feeder sends balls to your forehand or backhand at random.',
          'Shout "forehand" or "backhand" before the ball crosses the net.',
          'Turn on the call, so the turn is finished by the bounce.',
          'Hit crosscourt, recover to the middle, split again.',
        ],
        cue: 'Read, call, turn: the call makes the decision early.',
        avoid: 'Waiting to see the bounce before you move.',
        motion: () => turnFreeze('both', { hold: 0.35 }), cam: 0,
      },
      {
        id: 'mirror-turns', title: 'Shadow unit turns', where: 'off-court', kit: 'Racket, a mirror or phone camera',
        dose: '3 sets of 10 each side',
        steps: [
          'Start in the ready position with a small split hop.',
          'Turn to one side in one piece: feet, hips, shoulders, racket.',
          'Hold for two seconds and check the mirror: shoulders turned, racket head up, off hand on the throat.',
          'Back to ready and turn the other way.',
        ],
        cue: 'The racket moves because the body turns.',
        avoid: 'Swinging the racket back behind you before the shoulders move.',
        motion: (s) => turnFreeze(side(s), { hold: 1.0 }), cam: 140,
      },
    ],
  },
  {
    id: 'shoulder-turn',
    title: 'Turn further',
    labels: ['Turn further', 'Full turn', 'Shoulder turn'],
    why: 'A full shoulder turn stores energy in the trunk and lets the swing build speed over a longer path, so you get power without muscling the arm.',
    ruleIds: ['fh-full-turn', 'bh1-turn', 'bh2-turn'],
    metrics: ['shoulderTurn'],
    strokes: GS,
    sources: [
      { title: 'Sportplan: turn drills', url: 'https://www.sportplan.net/s/Tennis/turn.jsp' },
      { title: 'TennisOne: the unit turn', url: 'https://tennisone.tennisplayer.net/club/lessons/jm/31/unit.php' },
    ],
    drills: [
      {
        id: 'back-to-net', title: 'Show your back', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 10',
        steps: [
          'On each feed, turn until your back starts to face the net (forehand) or your shoulder points at the ball (backhand).',
          'The feeder should be able to see the logo on the back of your shirt.',
          'Hold for a beat at the end of the turn, then swing.',
        ],
        cue: 'Chin over the front shoulder at the end of the turn.',
        avoid: 'Turning only the arm and keeping the chest open to the net.',
        motion: (s) => stroke(s, { ball: true, turn: 10, hold: [{ at: 'back', for: 0.6 }] }), cam: 0,
      },
      {
        id: 'point-off-hand', title: 'Off hand points the way', where: 'on-court', kit: 'Racket, balls',
        dose: '3 sets of 10', strokes: ['forehand'],
        steps: [
          'As you turn, keep the off hand on the racket until the shoulders are sideways.',
          'Then let the off hand point at the incoming ball while the racket goes back.',
          'Swing and let the off hand fold in to the chest.',
        ],
        cue: 'Off arm across the body = shoulders turned.',
        avoid: 'Dropping the off hand to the side early, which opens the chest.',
        motion: () => forehand({ ball: true, hold: [{ at: 'back', for: 0.5 }] }), cam: 120,
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
    title: 'Bend knees',
    labels: ['Bend knees', 'Knees loaded', 'Knees bent'],
    why: 'Bent knees load the legs like springs. They lower you to the ball, keep you balanced and let you push up into the shot (and up into the serve).',
    ruleIds: ['fh-knees', 'bh1-knees', 'bh2-knees', 'sv-knees'],
    metrics: ['kneeBend'],
    strokes: ['forehand', 'backhand-1h', 'backhand-2h', 'serve'],
    sources: [
      { title: 'PlayYourCourt: footwork drills and common mistakes', url: 'https://www.playyourcourt.com/news/improve-tennis-footwork/' },
      { title: 'REP Fitness: exercises for tennis', url: 'https://repfitness.com/blogs/training/tennis-exercises' },
    ],
    drills: [
      {
        id: 'sit-and-hit', title: 'Sit and hit', where: 'on-court', kit: 'Racket, balls, a feeder', strokes: GS,
        dose: '3 sets of 10',
        steps: [
          'Ask for low, slow feeds.',
          'As you turn, sit down as if onto a high stool: knees bent, back tall.',
          'Keep your head at the same height from the turn to contact.',
          'Push up out of the legs as you swing.',
        ],
        cue: 'Sit down to the ball, stand up through it.',
        avoid: 'Bending at the waist instead of at the knees.',
        motion: (s) => stroke(s, { ball: true, load: 0.3, hold: [{ at: 'back', for: 0.4 }] }), cam: 90,
      },
      {
        id: 'trophy-sit', title: 'Bend and drive serve', where: 'on-court', kit: 'Racket, balls', strokes: ['serve'],
        dose: '3 sets of 8 serves',
        steps: [
          'Toss, then bend both knees as the arm goes up to the trophy.',
          'Pause for a beat with the knees bent.',
          'Drive up off both feet into the ball.',
        ],
        cue: 'Knees bend as the ball goes up.',
        avoid: 'Standing straight-legged and hitting with the arm only.',
        motion: () => serve({ load: 0.28, jump: 0.16, hold: [{ at: 'trophy', for: 0.5 }] }), cam: 90,
      },
      {
        id: 'low-shuffle', title: 'Low shuffle between cones', where: 'on-court', kit: 'Two cones 3 to 4 m apart',
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
    labels: ['Hit further in front', 'Contact out front'],
    why: 'Meeting the ball in front of the front hip lets the body\'s rotation and the arm\'s extension reach full speed, and keeps the racket face steady. Late contact makes you push the ball and hit it late.',
    ruleIds: ['fh-contact-front', 'bh1-contact-front', 'bh2-contact-front'],
    metrics: ['contactForward'],
    strokes: GS,
    sources: [
      { title: 'CoachLife: contact points and arm structure', url: 'https://www.coachlife.com/videos/straight-arm-vs-double-bend-forehands-how-contact-points-shape-power-consistency' },
      { title: 'PlayYourCourt: how to hit a backhand', url: 'https://www.playyourcourt.com/news/how-to-hit-a-backhand-in-tennis-the-complete-playyourcourt-guide/' },
    ],
    drills: [
      {
        id: 'catch-in-front', title: 'Catch it in front', where: 'on-court', kit: 'Balls, a feeder',
        dose: '2 sets of 10 each side',
        steps: [
          'No racket. Turn as if to hit.',
          'Swing the hitting hand forward and catch the ball with the palm out in front of your front hip.',
          'Freeze where you caught it: that is your contact point.',
        ],
        cue: 'Catch it where you can see it.',
        avoid: 'Catching beside or behind the body.',
        motion: (s) => stroke(s, { ball: true, noRacket: true, hold: [{ at: 'contact', for: 0.7 }] }), cam: 70,
      },
      {
        id: 'freeze-contact', title: 'Hit and freeze', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 8',
        steps: [
          'Hit easy feeds and freeze the racket at contact for two seconds.',
          'Check: strings face the target, hand ahead of the front hip, arm comfortable.',
          'Then finish the swing.',
        ],
        cue: 'Contact a racket-length ahead of you, not beside you.',
        avoid: 'Letting the ball get past the front foot.',
        motion: (s) => stroke(s, { ball: true, contactFwd: 0.08, hold: [{ at: 'contact', for: 0.7 }] }), cam: 120,
      },
      {
        id: 'shadow-contact', title: 'Shadow to contact', where: 'off-court', kit: 'Racket',
        dose: '3 sets of 10',
        steps: [
          'Put a marker on the floor a little in front of your front foot.',
          'Shadow swing and stop dead with the strings over the marker.',
          'Hold, then finish the swing slowly.',
        ],
        cue: 'Same spot every time.',
        avoid: 'Stopping with the racket next to the body.',
        motion: (s) => stroke(s, { split: false, contactFwd: 0.08, hold: [{ at: 'contact', for: 1.0 }] }), cam: 150,
      },
    ],
  },
  {
    id: 'arm-space',
    title: 'Give yourself space',
    labels: ['Cramped arm', 'Arm has space'],
    why: 'A cramped arm means the ball got too close to the body. With room to swing, the arm can extend and the racket can accelerate.',
    ruleIds: ['fh-arm-space'],
    metrics: ['elbowAngle'],
    strokes: ['forehand'],
    sources: [{ title: 'PlayYourCourt: footwork and adjustment steps', url: 'https://www.playyourcourt.com/news/improve-tennis-footwork/' }],
    drills: [
      {
        id: 'spacing-feeds', title: 'Racket-length spacing', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 10',
        steps: [
          'The feeder aims straight at your body.',
          'Take small adjustment steps away from the ball so you hit it a racket length from your hip.',
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
    id: 'finish-across',
    title: 'Finish across the body',
    labels: ['Finish across body', 'Finish across'],
    why: 'Finishing over the opposite shoulder means the body rotated all the way through. Stopping short slows the racket before contact.',
    ruleIds: ['fh-finish-across', 'sv-finish'],
    metrics: ['crossBody'],
    strokes: ['forehand', 'serve'],
    sources: [{ title: 'Tennis Companion: the serve trophy pose and follow-through', url: 'https://cdn.tenniscompanion.org/serve-trophy-pose/' }],
    drills: [
      {
        id: 'catch-racket', title: 'Catch the racket', where: 'on-court', kit: 'Racket, balls', strokes: ['forehand'],
        dose: '3 sets of 10',
        steps: [
          'Hit a forehand and let the racket wrap over your opposite shoulder.',
          'Catch the racket throat with your off hand at the finish.',
          'Hold for two seconds: elbow pointing at the target.',
        ],
        cue: 'Elbow to the target, racket behind the neck.',
        avoid: 'Stopping the racket out in front.',
        motion: () => forehand({ ball: true, hold: [{ at: 'finish', for: 0.8 }] }), cam: 140,
      },
      {
        id: 'serve-finish', title: 'Serve to the opposite pocket', where: 'on-court', kit: 'Racket, balls', strokes: ['serve'],
        dose: '3 sets of 8 serves',
        steps: [
          'Serve at 70 percent pace.',
          'Let the racket finish on your opposite side, next to the front leg.',
          'Hold the finish until the ball lands.',
        ],
        cue: 'Up, out, then down across.',
        avoid: 'Stopping the racket on the hitting side.',
        motion: () => serve({ hold: [{ at: 'finish', for: 0.7 }] }), cam: 120,
      },
      {
        id: 'shadow-finish', title: 'Slow-motion shadow to the finish', where: 'off-court', kit: 'Racket', strokes: ['forehand'],
        dose: '3 sets of 10',
        steps: [
          'Shadow forehands at half speed.',
          'Rotate until your chest faces the target and the racket rests over the opposite shoulder.',
          'Back foot ends up on its toe.',
        ],
        cue: 'Chest to the target, back heel up.',
        avoid: 'Finishing with the chest still facing the side fence.',
        motion: () => forehand({ split: false, slow: 1.8, hold: [{ at: 'finish', for: 0.6 }] }), cam: 160,
      },
    ],
  },
  {
    id: 'finish-high',
    title: 'Finish higher',
    labels: ['Finish higher', 'High finish'],
    why: 'Swinging low to high lifts the ball over the net with topspin. A low finish means a flat swing path and balls into the net.',
    ruleIds: ['fh-finish-high', 'bh1-finish-high', 'bh2-finish-high'],
    metrics: ['wristAboveShoulder'],
    strokes: GS,
    sources: [{ title: 'Human Kinetics: groundstroke drills', url: 'https://canada.humankinetics.com/blogs/excerpt/use-the-backhand-drill-to-master-your-backhand' }],
    drills: [
      {
        id: 'over-the-rope', title: 'Over the rope', where: 'on-court', kit: 'Racket, balls, a rope or string 1 m above the net',
        dose: '3 sets of 10',
        steps: [
          'Tie a rope or string about a metre above the net.',
          'Rally or take feeds and clear the rope every time.',
          'Start with the racket below the ball and finish with the hand above the shoulder.',
        ],
        cue: 'Below the ball, up through it.',
        avoid: 'Lifting the ball with the wrist instead of the swing path.',
        motion: (s) => stroke(s, { ball: true, hold: [{ at: 'finish', for: 0.6 }] }), cam: 70,
      },
      {
        id: 'drop-to-finish', title: 'Drop and lift', where: 'off-court', kit: 'Racket',
        dose: '3 sets of 10',
        steps: [
          'Shadow swing in slow motion.',
          'Pause with the racket head dropped below the hand.',
          'Swing up and finish with the hand above the shoulder.',
        ],
        cue: 'Low to high, like brushing up the back of the ball.',
        avoid: 'Swinging straight across at shoulder height.',
        motion: (s) => stroke(s, { split: false, slow: 1.6, hold: [{ at: 'back', for: 0.4 }, { at: 'finish', for: 0.6 }] }), cam: 90,
      },
    ],
  },
  {
    id: 'bh1-throat',
    title: 'Off hand on the throat',
    labels: ['hand on throat'],
    why: 'On a one-handed backhand the off hand on the racket throat turns the shoulders and sets the racket back, so the hitting arm stays relaxed.',
    ruleIds: ['bh1-hand-throat'],
    metrics: ['handsTogether'],
    strokes: ['backhand-1h'],
    sources: [{ title: 'Tennis Mind Game: the one-handed backhand', url: 'https://www.tennismindgame.com/one-handed-backhand.html' }],
    drills: [
      {
        id: 'throat-turn', title: 'Throat-hand takeback', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 10',
        steps: [
          'Split step, then turn by pushing the racket back with the off hand on the throat.',
          'Keep the off hand on until the racket is fully back.',
          'Release the off hand back as you swing forward.',
        ],
        cue: 'The off hand takes the racket back.',
        avoid: 'Letting go early and pulling the racket back with the hitting arm.',
        motion: () => turnFreeze('bh', { ball: true, hold: 0.7 }), cam: -60,
      },
      {
        id: 'throat-shadow', title: 'Shadow takebacks', where: 'off-court', kit: 'Racket',
        dose: '3 sets of 10',
        steps: ['From ready, turn with both hands on the racket.', 'Pause at the end of the backswing, off hand still on the throat.', 'Swing and let the arms split apart like wings.'],
        cue: 'Both hands back, arms split forward.',
        avoid: 'Turning only the hitting arm.',
        motion: () => backhand({ split: false, hold: [{ at: 'unit', for: 0.5 }, { at: 'back', for: 0.5 }] }), cam: -120,
      },
    ],
  },
  {
    id: 'bh1-straight',
    title: 'Straighten the arm at contact',
    labels: ['Straighten arm', 'Straight arm'],
    why: 'A one-handed backhand is hit with a straight arm. A bent elbow at contact means the ball is too close and power leaks out of the arm.',
    ruleIds: ['bh1-straight-arm'],
    metrics: ['elbowAngle'],
    strokes: ['backhand-1h'],
    sources: [{ title: 'Tennis Tour Talk: five backhand drills', url: 'https://tennistourtalk.com/?p=73496' }],
    drills: [
      {
        id: 'bh-contact-freeze', title: 'Straight-arm freeze', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 8',
        steps: ['Easy feeds to the backhand.', 'Freeze at contact: arm straight, contact in front of the front foot.', 'Off arm goes back, chest stays sideways.'],
        cue: 'Arm and racket form one long lever.',
        avoid: 'Leading with the elbow.',
        motion: () => backhand({ ball: true, hold: [{ at: 'contact', for: 0.8 }] }), cam: -40,
      },
      {
        id: 'bh-slow-shadow', title: 'Slow-motion backhand shadow', where: 'off-court', kit: 'Racket',
        dose: '3 sets of 10',
        steps: ['Shadow one-handers at half speed.', 'Stop at contact and check the arm is straight and in front of the front foot.', 'Extend up to a high finish.'],
        cue: 'Straight at contact, high at the finish.',
        avoid: 'Bending the elbow to reach the ball.',
        motion: () => backhand({ split: false, slow: 1.8, hold: [{ at: 'contact', for: 0.7 }] }), cam: -100,
      },
    ],
  },
  {
    id: 'bh2-hands',
    title: 'Keep both hands on',
    labels: ['Keep both hands on', 'Two hands on'],
    why: 'The top hand drives a two-handed backhand. Letting go before contact turns it into a weak one-hander.',
    ruleIds: ['bh2-hands'],
    metrics: ['handsTogether'],
    strokes: ['backhand-2h'],
    sources: [{ title: 'Sportplan: both hands for better results', url: 'https://www.sportplan.net/drills/Tennis/Backhand-Drills/Both-Hands-for-Better-Results-camtennis75.jsp' }],
    drills: [
      {
        id: 'bh2-finish-hold', title: 'Two hands to the shoulder', where: 'on-court', kit: 'Racket, balls',
        dose: '3 sets of 10',
        steps: ['Hit two-handers and keep both hands on until the racket is over your hitting-side shoulder.', 'Hold the finish for two seconds.'],
        cue: 'Both hands finish together.',
        avoid: 'Releasing the top hand at contact.',
        motion: () => backhand({ twoHands: true, ball: true, hold: [{ at: 'finish', for: 0.7 }] }), cam: -60,
      },
      {
        id: 'bh2-medball', title: 'Backhand medicine ball throws', where: 'off-court', kit: '2 to 3 kg medicine ball, a wall',
        dose: '3 sets of 8',
        steps: ['Side-on to a wall, ball in both hands at the back hip.', 'Turn back, then rotate and throw with both hands together.', 'Finish facing the wall.'],
        cue: 'Two hands, one throw.',
        avoid: 'Pushing with one arm.',
        motion: () => medThrow('bh'), cam: -120,
      },
    ],
  },
  {
    id: 'trophy',
    title: 'Elbow to 90° in the trophy',
    labels: ['Elbow to 90°', 'Trophy position'],
    why: 'In the trophy position the hitting elbow bends to about 90°, at shoulder height, with the toss arm up. It sets up the racket drop and a loose, fast upswing.',
    ruleIds: ['sv-trophy-elbow'],
    metrics: ['elbowAngle'],
    strokes: ['serve'],
    sources: [
      { title: 'Tennis Evolution: the trophy position hold drill', url: 'https://tennisevolution.com/?p=8615' },
      { title: 'Tennis Companion: serve trophy pose', url: 'https://cdn.tenniscompanion.org/serve-trophy-pose/' },
    ],
    drills: [
      {
        id: 'trophy-hold', title: 'Trophy hold, then serve', where: 'on-court', kit: 'Racket, balls',
        dose: '3 sets of 8 serves',
        steps: ['Toss and stop in the trophy: elbow at shoulder height, bent about 90°, racket tip up.', 'Hold until the ball peaks.', 'Then drop and swing up.'],
        cue: 'Elbow up, tip up, toss arm up.',
        avoid: 'Elbow below the shoulder or the arm straight behind you.',
        motion: () => serve({ hold: [{ at: 'trophy', for: 0.8 }] }), cam: 100,
      },
      {
        id: 'trophy-mirror', title: 'Mirror trophy checks', where: 'off-court', kit: 'Racket, a mirror',
        dose: '3 sets of 10',
        steps: ['Side-on to a mirror, go through the toss motion without a ball.', 'Freeze in the trophy and check the elbow angle and height.', 'Swing up slowly to full reach.'],
        cue: 'A capital L with the hitting arm.',
        avoid: 'Lifting the racket with a straight arm.',
        motion: () => serve({ slow: 1.5, hold: [{ at: 'trophy', for: 1.0 }] }), cam: 160,
      },
    ],
  },
  {
    id: 'toss',
    title: 'Toss arm higher',
    labels: ['Toss arm higher', 'Toss arm up'],
    why: 'A toss arm that reaches up and stays up keeps the shoulders tilted and the head up, and gives you a target to hit toward.',
    ruleIds: ['sv-toss-arm'],
    metrics: ['tossArmUp'],
    strokes: ['serve'],
    sources: [
      { title: 'Sikana: serve drill, toss and balance', url: 'https://www.sikana.tv/en/sport/tennis/service-drill-toss-and-balance' },
      { title: 'Tennisplayer: the serve toss', url: 'https://media.tennisplayer.net/members/classiclessons/kerry_mitchell/the_serve_toss' },
    ],
    drills: [
      {
        id: 'toss-catch', title: 'Toss and catch', where: 'on-court', kit: 'Balls',
        dose: '3 sets of 10 tosses',
        steps: ['Toss with a straight arm, releasing at head height.', 'Keep the arm reaching up while the ball rises.', 'Catch the ball with the same hand above your head without moving your feet.'],
        cue: 'Lift, don\'t throw.',
        avoid: 'Flicking the wrist or dropping the arm right after release.',
        motion: () => serve({ tossOnly: true }), cam: 100,
      },
      {
        id: 'toss-target', title: 'Toss onto the racket', where: 'on-court', kit: 'Racket on the court, balls',
        dose: '3 sets of 10 tosses',
        steps: ['Lay your racket on the court just inside the baseline, in front of your front foot.', 'Toss without hitting and let the ball drop.', 'It should land on the strings every time.'],
        cue: 'Same toss, same spot.',
        avoid: 'Tossing behind your head.',
        motion: () => ({ ...serve({ tossOnly: true }), props: [{ kind: 'target', p: [0.0, 0, 0.55] }] }), cam: 60,
      },
    ],
  },
  {
    id: 'racket-drop',
    title: 'Drop deeper',
    labels: ['Drop deeper', 'Racket drop'],
    why: 'A deep, relaxed racket drop behind the back gives the racket a long path to accelerate up to the ball.',
    ruleIds: ['sv-drop'],
    metrics: ['elbowAngle'],
    strokes: ['serve'],
    sources: [{ title: 'Sportplan: modern serve technique', url: 'https://www.sportplan.net/drills/Tennis/trends/modern-serve-power-placement-2025-01.jsp' }],
    drills: [
      {
        id: 'drop-pause', title: 'Pause in the drop', where: 'on-court', kit: 'Racket, balls',
        dose: '3 sets of 8 serves',
        steps: ['Serve at half pace.', 'Feel the racket fall behind your back as the legs drive up.', 'Let the elbow lead up to the ball.'],
        cue: 'Loose arm: the racket drops by itself.',
        avoid: 'Gripping tight, which stops the drop.',
        motion: () => serve({ hold: [{ at: 'drop', for: 0.5 }] }), cam: 150,
      },
      {
        id: 'towel-serve', title: 'Slow-motion serve shadow', where: 'off-court', kit: 'Racket or a towel',
        dose: '3 sets of 10',
        steps: ['Shadow the serve in slow motion (a towel works too: it only cracks with a full drop).', 'Let the racket head point at the ground behind your back.', 'Swing up to full reach.'],
        cue: 'Scratch your back with the racket.',
        avoid: 'Rushing from the trophy straight to the ball.',
        motion: () => serve({ slow: 1.8 }), cam: 150,
      },
    ],
  },
  {
    id: 'reach-up',
    title: 'Reach up at contact',
    labels: ['Reach up', 'Contact higher', 'Full extension', 'High contact'],
    why: 'Hitting at full reach gives a better angle into the box and uses the legs and trunk rising into the ball.',
    ruleIds: ['sv-extension', 'sv-height'],
    metrics: ['contactHeight'],
    strokes: ['serve'],
    sources: [{ title: 'Human Kinetics: overhead rotational medicine ball slam', url: 'https://us.humankinetics.com/blogs/excerpt/overhead-rotational-medicine-ball-slam' }],
    drills: [
      {
        id: 'reach-freeze', title: 'Reach and freeze', where: 'on-court', kit: 'Racket, balls',
        dose: '3 sets of 8 serves',
        steps: ['Toss a little higher and in front.', 'Hit at full reach and freeze for a second: arm straight, body tall.', 'Then let the racket finish.'],
        cue: 'Hit the top of the toss with a straight arm.',
        avoid: 'Letting the ball drop to head height.',
        motion: () => serve({ hold: [{ at: 'contact', for: 0.6 }] }), cam: 90,
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
    id: 'coil',
    title: 'Coil shoulders past the hips',
    labels: ['Coil shoulders past hips', 'Hip-shoulder stretch', 'Coil shoulders', 'Coiled trunk'],
    why: 'When the shoulders turn further than the hips, the trunk stretches like a spring. Uncoiling it is where effortless power comes from.',
    ruleIds: ['gs-separation', 'sv-separation'],
    metrics: ['hipShoulderSep'],
    strokes: ['forehand', 'backhand-1h', 'backhand-2h', 'serve'],
    sources: [
      { title: 'Human Kinetics: rotational throws', url: 'https://us.humankinetics.com/blogs/excerpt/rotational-throws' },
      { title: 'ITF Coaching Review: medicine ball training for tennis', url: 'https://itfcoachingreview.com/index.php/journal/article/download/140/399/485' },
    ],
    drills: [
      {
        id: 'coil-hold', title: 'Coil and hold', where: 'on-court', kit: 'Racket, balls, a feeder', strokes: GS,
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
        motion: (s) => bandTurn({ side: s === 'serve' ? 'fh' : side(s) }), cam: 160,
      },
    ],
  },
  {
    id: 'weight',
    title: 'Move your weight forward',
    labels: ['Move weight forward', 'Weight forward'],
    why: 'Loading the back foot and moving into the front foot adds the body\'s mass to the shot and keeps contact in front.',
    ruleIds: ['gs-weight'],
    metrics: ['weightShift'],
    strokes: GS,
    sources: [{ title: 'Active: 9 ways a medicine ball can add power to your strokes', url: 'https://www.active.com/tennis/articles/9-ways-a-medicine-ball-can-add-power-to-your-strokes' }],
    drills: [
      {
        id: 'step-in', title: 'Step-in groundstrokes', where: 'on-court', kit: 'Racket, balls, a feeder',
        dose: '3 sets of 10',
        steps: ['Load the back foot as you turn.', 'Step toward the net with the front foot as the ball bounces.', 'Swing as the weight arrives on the front foot; back heel comes up.'],
        cue: 'Back foot, front foot, hit.',
        avoid: 'Falling backwards or hitting off the back foot.',
        motion: (s) => stroke(s, { ball: true, stepIn: true }), cam: 90,
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
    why: 'Pushing up out of the knee bend starts the swing from the ground. It adds pace and lift without extra arm effort.',
    ruleIds: ['gs-legs', 'sv-legs'],
    metrics: ['legDrive'],
    strokes: ['forehand', 'backhand-1h', 'backhand-2h', 'serve'],
    sources: [{ title: 'STACK: adding power to your serve and groundstrokes', url: 'https://www.stack.com/?p=62864' }],
    drills: [
      {
        id: 'sit-lift', title: 'Sit and lift', where: 'on-court', kit: 'Racket, balls, a feeder', strokes: GS,
        dose: '3 sets of 10',
        steps: ['Bend the knees deeply on the turn.', 'Push up through the ground as you swing; let the heels lift a little after contact.', 'Finish taller than you started.'],
        cue: 'The legs start the swing.',
        avoid: 'Staying down through the whole swing.',
        motion: (s) => stroke(s, { ball: true, load: 0.3 }), cam: 90,
      },
      {
        id: 'jump-serve', title: 'Bend and jump serve', where: 'on-court', kit: 'Racket, balls', strokes: ['serve'],
        dose: '3 sets of 8 serves',
        steps: ['Bend the knees in the trophy.', 'Explode up so both feet leave the court at contact.', 'Land on the front foot inside the court.'],
        cue: 'Jump into the ball, not forward.',
        avoid: 'Hitting flat-footed.',
        motion: () => serve({ load: 0.28, jump: 0.2 }), cam: 90,
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
    labels: ['Hips lead the swing', 'Hips first', 'Kinetic chain', 'Use the body, not the arm', 'Body power'],
    why: 'Power flows from the ground up: legs, hips, trunk, arm, hand, each one speeding up the next. Starting with the arm skips the biggest muscles.',
    ruleIds: ['gs-chain', 'sv-chain', 'gs-body-power'],
    metrics: ['chainSequence', 'bodyPower'],
    strokes: ['forehand', 'backhand-1h', 'backhand-2h', 'serve'],
    sources: [
      { title: 'SimpliFaster: medicine ball rotational throw', url: 'https://simplifaster.com/?p=44095' },
      { title: 'TennisOne: medicine ball forehand', url: 'https://tennisone.tennisplayer.net/club/lessons/barstow/medicine_fh/fh.php' },
    ],
    drills: [
      {
        id: 'slow-chain', title: 'Slow-motion chain shadow', where: 'on-court', kit: 'Racket',
        dose: '3 sets of 8',
        steps: ['Shadow swing in slow motion and say the order out loud: "hips, chest, arm".', 'The back hip turns first while the racket is still back.', 'Then hit balls at 60 percent keeping the same order.'],
        cue: 'Hips pull, arm follows.',
        avoid: 'The hand starting forward before the hips turn.',
        motion: (s) => (s === 'serve' ? serve({ slow: 2 }) : stroke(s, { split: false, slow: 2.2 })), cam: 60,
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
        id: 'chain-overhead', title: 'Overhead medicine ball throws', where: 'off-court', kit: '1 to 2 kg medicine ball, a wall', strokes: ['serve'],
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
  if (metric === 'elbowAngle') {
    if (strokeType === 'serve') return TOPICS.find((t) => t.id === 'trophy');
    if (strokeType === 'backhand-1h') return TOPICS.find((t) => t.id === 'bh1-straight');
    return TOPICS.find((t) => t.id === 'arm-space');
  }
  if (metric === 'shoulderTurn') return TOPICS.find((t) => t.id === 'shoulder-turn');
  if (metric === 'handsTogether') return TOPICS.find((t) => t.id === (strokeType === 'backhand-1h' ? 'bh1-throat' : 'bh2-hands'));
  return TOPICS.find((t) => t.metrics.includes(metric));
}

/** Drills of a topic that fit a stroke, and the stroke to demonstrate them with. */
export function drillsFor(topic: Topic, strokeType?: StrokeType): { drill: Drill; stroke: Stroke }[] {
  const s = (strokeType && (topic.strokes as string[]).includes(strokeType) ? strokeType : topic.strokes[0]) as Stroke;
  return topic.drills.filter((d) => !d.strokes || d.strokes.includes(s)).map((drill) => ({ drill, stroke: s }));
}

export const STROKE_NAME: Record<Stroke, string> = { forehand: 'Forehand', 'backhand-1h': 'One-handed backhand', 'backhand-2h': 'Two-handed backhand', serve: 'Serve' };
export type { Stroke as DrillStroke };
export { gs, camFor };
