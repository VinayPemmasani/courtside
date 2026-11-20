/**
 * The body behind each technique fix, and the everyday habits, yoga poses, other sports and gym
 * exercises that train the same movement, each linked to the drills it prepares you for.
 *
 * Facts come from published table tennis biomechanics and the laws of the game (see REFS); the
 * activity links are coaching reasoning: an activity is linked to a fix when it trains the same
 * joint action, muscle group or timing pattern.
 */

export const REFS = {
  limbs: { title: 'Lower limb biomechanics during the topspin forehand in table tennis: a systematic review (2022), PMC', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9330838/' },
  levels: { title: 'He et al. (2021): lower limb kinematics in the topspin forehand loop at different levels, PeerJ', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7958893/' },
  review: { title: 'Biomechanics of table tennis (encyclopedia entry summarising the review literature)', url: 'https://encyclopedia.pub/entry/1592' },
  laws: { title: 'Laws of table tennis 2.6 (service), reproduced by the University of Memphis', url: 'https://www.memphis.edu/campusrec/pdfs/tabletennis.pdf' },
  serve: { title: 'Table Tennis Coach: how to do a legal serve', url: 'https://www.tabletenniscoach.me.uk/how-to-do-a-legal-table-tennis-serve/' },
} as const;
type Ref = keyof typeof REFS;

export interface Fact {
  /** The number, as shown big. */
  value: string;
  /** What it means. */
  text: string;
  ref: Ref;
}

export interface BodyMap {
  /** The joints that move, and how. */
  joints: string;
  /** The muscles doing the work. */
  muscles: string;
  /** How the fix makes the ball go, in plain words. */
  how: string;
  /** What it costs when this part is missing. */
  cost: string;
  facts: Fact[];
}

const TRUNK: Fact = { value: 'Lower trunk', text: 'Advanced players get a larger share of racket speed at impact from the lower trunk turning (Iino et al., in the review).', ref: 'limbs' };
const HIPS: Fact = { value: 'Hip + knee', text: 'Higher-level players bend the hip and knee more in the backswing, then extend and rotate the hip faster in the forward swing.', ref: 'limbs' };
const HEAVY: Fact = { value: 'Heavy topspin', text: 'Racket speed in a maximal topspin forehand rises with the speed of playing-side hip extension and ankle flexion.', ref: 'limbs' };
const LEVELS: Fact = { value: 'Shorter', text: 'Better players finish the backswing and the forward swing in less time.', ref: 'levels' };
const STEADY: Fact = { value: 'At impact', text: 'Players vary their movement a lot, but keep it most repeatable at the instant of impact.', ref: 'review' };
const CHASSE: Fact = { value: 'Vastus medialis', text: 'is the first muscle to fire in a long chasse step to the forehand.', ref: 'review' };
const SQUAT_SERVE: Fact = { value: 'Squat serve', text: 'uses more hip and knee bend than a standing serve.', ref: 'review' };
const TOSS: Fact = { value: '16 cm', text: 'minimum rise of the toss, from a still, flat, open palm, near vertically and without spin (law 2.6.2).', ref: 'laws' };

/** The body behind each fix, by topic id. */
export const BODY: Record<string, BodyMap> = {
  'early-prep': {
    joints: 'A small split hop, then the hips, waist and shoulders turn together; the bat goes back because the body turns.',
    muscles: 'Calves and quads for the hop; obliques and the hip rotators to turn.',
    how: 'Turning as the opponent hits buys the time to load the legs and waist, so the stroke starts from the floor, not from the arm.',
    cost: 'A late turn leaves only the arm to make speed, and contact drifts late and beside the body.',
    facts: [LEVELS, TRUNK],
  },
  'waist-turn': {
    joints: 'The pelvis and the upper back rotate; the shoulders turn a little further than the hips; the playing-side shoulder drops.',
    muscles: 'External and internal obliques, the glutes and deep hip rotators, the back extensors.',
    how: 'The coiled waist uncoils into the ball and passes the speed out to the arm and bat.',
    cost: 'Without a waist turn the loop is an arm stroke: less spin, less speed and a tired shoulder.',
    facts: [TRUNK, HEAVY],
  },
  'stay-square': {
    joints: 'Hips and shoulders stay square to the table; the elbow sits in front and the forearm rotates and opens.',
    muscles: 'Forearm extensors and supinators, triceps and the back of the shoulder.',
    how: 'A compact backhand in front of the body is fast to play and fast to recover, so you can play it close to the table.',
    cost: 'A big body turn on the backhand makes the stroke slow and leaves you late for the next ball.',
    facts: [LEVELS, STEADY],
  },
  knees: {
    joints: 'Hips, knees and ankles bend together and the trunk leans forward over the table.',
    muscles: 'Quads and glutes hold the low stance; calves keep you on the balls of the feet.',
    how: 'A low stance keeps the eyes near the ball\'s height and lets the legs push the stroke and move you quickly.',
    cost: 'Standing tall means bending at the waist to reach, slower footwork and no push from the floor.',
    facts: [HIPS, CHASSE],
  },
  'low-point': {
    joints: 'The bat drops to about knee height as the knees bend; then the legs straighten and the arm swings up and forward.',
    muscles: 'Quads and glutes lift; the front of the shoulder and the forearm brush up the back of the ball.',
    how: 'Starting below the ball gives an upward path that turns backspin into topspin and lifts the ball over the net.',
    cost: 'Starting at table height against backspin sends the ball into the net.',
    facts: [HEAVY, HIPS],
  },
  'contact-front': {
    joints: 'The waist has turned back toward the table; the bat meets the ball in front of the body.',
    muscles: 'Chest and front shoulder swing the arm; the forearm holds the bat angle steady.',
    how: 'In front of the body the bat is still speeding up and the angle is easy to control.',
    cost: 'Late contact beside the hip loses speed and leaves the wrist to rescue the shot.',
    facts: [STEADY, TRUNK],
  },
  elbow: {
    joints: 'The elbow stays bent at roughly 90 to 130 degrees and the forearm rotates through contact.',
    muscles: 'Biceps, triceps and the forearm muscles work fast and relaxed.',
    how: 'A loose bent elbow lets the forearm and wrist add the last burst of bat speed.',
    cost: 'A locked arm is slow and stiff; a cramped one has no room to swing.',
    facts: [STEADY, LEVELS],
  },
  finish: {
    joints: 'The waist turns through and the bat stops in front of the forehead (forehand) or toward the target (backhand), then everything returns to ready.',
    muscles: 'The back of the shoulder and the trunk muscles brake the swing.',
    how: 'A controlled finish keeps the stroke compact so you are ready for the next ball.',
    cost: 'A tennis-style wrap-around finish leaves you out of position for the return.',
    facts: [LEVELS, STEADY],
  },
  'short-game': {
    joints: 'The playing-side foot steps under the table, the knee bends and the arm reaches forward over the table.',
    muscles: 'Quads and glutes for the lunge; forearm and wrist for the push or flick.',
    how: 'Getting close lets you meet the short ball early and keep it short, or flick it at the top of the bounce.',
    cost: 'Reaching from far back makes the push float and the flick weak.',
    facts: [CHASSE, HIPS],
  },
  serve: {
    joints: 'Free hand still and flat; the toss rises straight up; the knees bend so contact can be low.',
    muscles: 'Forearm and wrist make the spin; the legs hold the low stance.',
    how: 'A legal toss and a low contact give a serve that is short, low and hard to attack.',
    cost: 'A low toss is a fault; a high contact pops the serve up for the opponent.',
    facts: [TOSS, SQUAT_SERVE],
  },
  chain: {
    joints: 'Ankle, knee and hip extend on the playing side, the pelvis turns, then the trunk, shoulder, elbow and wrist.',
    muscles: 'Glutes and quads push; obliques turn; the shoulder and forearm finish.',
    how: 'Each link starts as the one below it peaks, so the speed adds up at the bat.',
    cost: 'Arm-first loops are slower and put the load on the shoulder.',
    facts: [TRUNK, HEAVY],
  },
};

export type ActivityKind = 'everyday' | 'yoga' | 'sport' | 'gym';
export const KIND_LABEL: Record<ActivityKind, string> = { everyday: 'Everyday life', yoga: 'Yoga', sport: 'Other sports', gym: 'Gym' };

export interface Activity {
  id: string;
  name: string;
  kind: ActivityKind;
  /** How to do it, or how to turn the habit into training. */
  how: string;
  /** How much. */
  dose: string;
  /** The table tennis link: what it trains in the stroke. */
  why: string;
  /** Be careful of. */
  care?: string;
  /** Fixes (topic ids) it helps. */
  topics: string[];
  /** Drills (drill ids) it prepares you for. */
  drills: string[];
  ref?: Ref;
}

export const ACTIVITIES: Activity[] = [
  // ——— Everyday life ———
  {
    id: 'stairs', name: 'Stairs two at a time', kind: 'everyday',
    how: 'Take stairs two steps at a time, pushing through the whole front foot with the chest tall.',
    dose: 'Every flight you meet.',
    why: 'A deep single-leg bend and push, like the step in to a short ball and the leg drive of a loop.',
    care: 'Hold the rail if balance is an issue.',
    topics: ['knees', 'chain', 'short-game'], drills: ['squats', 'lunge-step', 'slow-chain'],
  },
  {
    id: 'chair-stand', name: 'Stand up without your hands', kind: 'everyday',
    how: 'Get up from a chair with the arms folded, and sit back slowly.',
    dose: 'Every time you stand up.',
    why: 'Builds the legs that hold a low ready stance through a whole rally.',
    topics: ['knees', 'serve', 'low-point'], drills: ['squats', 'squat-hold', 'jump-squats', 'falkenberg'],
  },
  {
    id: 'look-back', name: 'Turn to look behind', kind: 'everyday',
    how: 'When you check behind you, turn from the waist and upper back instead of just the neck.',
    dose: 'Whenever it comes up.',
    why: 'The same trunk rotation as the waist turn of a forehand loop.',
    topics: ['waist-turn', 'early-prep', 'chain'], drills: ['seated-turn', 'band-turns', 'shadow-ready', 'call-side'],
  },
  {
    id: 'reaction-games', name: 'Catch and reaction games', kind: 'everyday',
    how: 'Throw and catch a ball against a wall, or play reaction-light or phone reaction games.',
    dose: '5 minutes a day.',
    why: 'Trains reading early and moving on the read, the habit behind preparing earlier.',
    topics: ['early-prep', 'contact-front'], drills: ['call-side', 'one-spot', 'shadow-contact'],
  },
  {
    id: 'catch-in-front', name: 'Catch in front of you', kind: 'sport',
    how: 'Play catch with a partner and always catch the ball out in front of your body, never beside the hip.',
    dose: '5 minutes.',
    why: 'Builds the habit of meeting the ball early, in front, where you can see it onto the bat.',
    topics: ['contact-front', 'early-prep'], drills: ['one-spot', 'shadow-contact', 'call-side'],
  },
  {
    id: 'flick-cards', name: 'Wrist flicks with a light object', kind: 'everyday',
    how: 'Flick a playing card or a light ball forward with a quick wrist snap, elbow bent.',
    dose: '2 sets of 15.',
    why: 'Practises the relaxed forearm and wrist snap of the flick and the counter-hit.',
    topics: ['elbow', 'short-game'], drills: ['flick-multiball', 'forearm-whip', 'mirror-elbow'],
  },
  {
    id: 'palm-balance', name: 'Ball on a flat palm', kind: 'everyday',
    how: 'Rest a ball on a flat open palm, toss it straight up a hand\'s width or more and catch it.',
    dose: '20 tosses while waiting for the kettle.',
    why: 'Grooves the legal service toss: still, flat palm, near vertical, at least 16 cm.',
    topics: ['serve'], drills: ['toss-catch', 'low-serve'], ref: 'serve',
  },
  // ——— Yoga ———
  {
    id: 'twist', name: 'Seated twist', kind: 'yoga',
    how: 'Sit tall, cross one leg over and turn the chest toward it, using the arm as a lever.',
    dose: '3 breaths each side.',
    why: 'Mobility in the upper back for a fuller waist turn.',
    topics: ['waist-turn', 'stay-square', 'early-prep'], drills: ['seated-turn', 'band-turns', 'mirror-bh'],
  },
  {
    id: 'chair-pose', name: 'Chair pose', kind: 'yoga',
    how: 'Sit back as if into a chair, arms forward, weight in the heels.',
    dose: '3 holds of 5 breaths.',
    why: 'Holds the low, forward-leaning ready stance.',
    topics: ['knees', 'serve'], drills: ['squat-hold', 'squats', 'low-serve-receive'],
  },
  {
    id: 'low-lunge', name: 'Low lunge', kind: 'yoga',
    how: 'Step one foot forward into a lunge with the back knee down; sink the hips.',
    dose: '5 breaths each side.',
    why: 'Opens the hips for the step in to short balls and the wide forehand.',
    topics: ['short-game', 'knees', 'finish'], drills: ['lunge-step', 'push-rally', 'shadow-recover'],
  },
  // ——— Other sports ———
  {
    id: 'badminton', name: 'Badminton', kind: 'sport',
    how: 'Rallies with lots of drop shots and net play.',
    dose: 'Once a week.',
    why: 'Fast footwork, lunging to the net and a relaxed, wristy forearm.',
    topics: ['short-game', 'elbow', 'early-prep'], drills: ['push-rally', 'forearm-whip', 'call-side'],
  },
  {
    id: 'frisbee', name: 'Frisbee backhand throws', kind: 'sport',
    how: 'Throw a frisbee backhand with the elbow in front and a snap of the forearm.',
    dose: '10 minutes.',
    why: 'The same forearm-and-wrist action as the table tennis backhand.',
    topics: ['stay-square', 'elbow', 'finish'], drills: ['bh-bh-drive', 'mirror-bh', 'freeze-finish'],
  },
  {
    id: 'skipping', name: 'Skipping rope', kind: 'sport',
    how: 'Light, quick skips on the balls of the feet.',
    dose: '3 rounds of 1 minute.',
    why: 'Quick feet and calf stiffness for the split hop and short steps.',
    topics: ['knees', 'early-prep', 'finish'], drills: ['side-shuffle', 'falkenberg', 'shadow-recover'],
  },
  // ——— Gym ———
  {
    id: 'goblet-squat', name: 'Goblet squat', kind: 'gym',
    how: 'Hold a dumbbell at your chest and squat with the chest tall.',
    dose: '3 × 8 to 10.',
    why: 'Leg strength to stay low and push into the loop.',
    topics: ['knees', 'low-point', 'chain'], drills: ['squats', 'jump-squats', 'backspin-lift'],
  },
  {
    id: 'cable-chop', name: 'Cable or band low-to-high chop', kind: 'gym',
    how: 'Side-on to a low cable, turn and pull it up and across the body with straight-ish arms.',
    dose: '3 × 10 each side.',
    why: 'Trains the waist turning upward and forward, the path of a loop against backspin.',
    topics: ['waist-turn', 'low-point', 'chain'], drills: ['band-turns', 'loop-backspin', 'backspin-lift', 'rot-throw'],
  },
  {
    id: 'med-throw', name: 'Medicine ball side throw', kind: 'gym',
    how: 'Side-on to a wall, throw a light medicine ball with the hips first.',
    dose: '3 × 8 each side.',
    why: 'Teaches the order legs, hips, chest, arm.',
    topics: ['chain', 'waist-turn'], drills: ['rot-throw', 'slow-chain', 'loop-backspin'],
  },
  {
    id: 'wrist-curls', name: 'Wrist curls and rotations', kind: 'gym',
    how: 'Light dumbbell: curls, reverse curls and slow forearm rotations.',
    dose: '2 × 15 each.',
    why: 'Forearm endurance for flicks, counter-hits and backhands.',
    topics: ['elbow', 'short-game', 'stay-square'], drills: ['flick-multiball', 'forearm-whip', 'mirror-elbow', 'bh-bh-drive'],
  },
  {
    id: 'lateral-lunge', name: 'Lateral lunges', kind: 'gym',
    how: 'Step wide to one side, sit into that hip, push back.',
    dose: '3 × 8 each side.',
    why: 'Strength for the wide forehand and moving back to the backhand corner.',
    topics: ['knees', 'contact-front', 'finish'], drills: ['falkenberg', 'side-shuffle', 'one-spot', 'shadow-contact', 'low-serve-receive', 'freeze-finish'],
  },
];

/** Activities that help a fix, those linked to the drill first. */
export function activitiesFor(topicId: string, drillId?: string): Activity[] {
  const list = ACTIVITIES.filter((a) => a.topics.includes(topicId) || (drillId && a.drills.includes(drillId)));
  return list.sort((a, b) => Number(!!drillId && b.drills.includes(drillId)) - Number(!!drillId && a.drills.includes(drillId)));
}
