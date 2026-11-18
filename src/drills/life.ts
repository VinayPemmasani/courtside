/**
 * The body behind each technique fix, and the everyday habits, yoga poses, other sports and gym
 * exercises that train the same movement, each linked to the drills it prepares you for.
 *
 * Numbers come from published tennis biomechanics (see REFS); the activity links are coaching
 * reasoning from those mechanics: an activity is linked to a fix when it trains the same joint
 * action, muscle group or timing pattern.
 */

export const REFS = {
  serve8: { title: 'Kovacs & Ellenbecker (2011): An 8-stage model for evaluating the tennis serve, Sports Health', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3445225/' },
  chain: { title: 'Kibler: Understanding the kinetic chain in tennis, Aspetar Sports Medicine Journal', url: 'https://journal.aspetar.com/en/journals/volume-13-targeted-topic-sports-medicine-in-tennis/understanding-the-kinetic-chain2' },
  forehand: { title: 'Reid, Elliott & Crespo (2013): Mechanics and learning practices of the tennis forehand, JSSM', url: 'https://jssm.org/jssm-12-225.xml-Fulltext' },
  elliott: { title: 'Elliott (2006): Biomechanics and tennis, British Journal of Sports Medicine', url: 'https://web.as.uky.edu/biology/faculty/cooper/Physics%20in%20sports-movement%20and%20health/Biomechanics%20and%20tennis.pdf' },
  yoga: { title: 'Hospital for Special Surgery: yoga for overhead athletes', url: 'https://www.hss.edu/health-library/move-better/yoga-for-overhead-athletes' },
  stairs: { title: 'EMG of lower-limb muscles during stair climbing (2019), PMC', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6452562/' },
  usta: { title: 'USTA Player Development: strength and conditioning exercise techniques', url: 'https://www.playerdevelopment.usta.com/Improve-Your-Game/Sport-Science/114707_Strength__Conditioning_Exercise_Techniques' },
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

const LEGS_TRUNK: Fact = { value: '51–55%', text: 'of the energy that reaches the hand comes from the legs and trunk.', ref: 'serve8' };
const TRUNK_LOSS: Fact = { value: '+34%', text: 'faster arm needed to make up for 20% less energy from the trunk, with more load on the shoulder.', ref: 'serve8' };
const SHOULDER_13: Fact = { value: '13%', text: 'of the serve’s energy is made by the shoulder itself. It mostly passes on what the legs and trunk make.', ref: 'chain' };
const BACKSWING: Fact = { value: '90° / 110°', text: 'hips and shoulders turned from the baseline at the end of a mature forehand backswing, so the shoulders are 20–30° past the hips.', ref: 'forehand' };
const IR_35: Fact = { value: '35%', text: 'of forehand racket speed comes from the upper arm rotating inward, and about 25% from it swinging across the chest.', ref: 'forehand' };
const KNEE_15: Fact = { value: '>15°', text: 'front-knee bend while loading the serve is recommended. Servers with good leg drive load the front of the shoulder and the inside of the elbow less.', ref: 'serve8' };
const KNEE_VEL: Fact = { value: '800°/s', text: 'peak front-knee straightening speed, about 0.18 s before contact, in Olympic servers.', ref: 'serve8' };
const DECEL: Fact = { value: '300 Nm', text: 'braking torque between the trunk and arm after contact, holding the shoulder against a pull of 0.5–0.75× body weight.', ref: 'chain' };

/** The body behind each fix, by topic id. */
export const BODY: Record<string, BodyMap> = {
  'early-prep': {
    joints: 'Feet split and land; hips, trunk and shoulders rotate together around the spine; the racket goes back because the body turns, not because the arm pulls.',
    muscles: 'Calves and quads for the split step; obliques and the hip rotators (glutes, deep hip muscles) to turn; the off arm guides the racket.',
    how: 'Turning early buys time to load the hips and coil the trunk, so the forward swing can start from the ground up instead of from the arm.',
    cost: 'A late turn leaves no time to load. The arm has to make the speed on its own, the contact drifts late, and the shoulder and elbow do the work the legs should.',
    facts: [BACKSWING, LEGS_TRUNK],
  },
  'shoulder-turn': {
    joints: 'The thoracic spine (upper back) rotates; the shoulder blades glide; the hips turn less than the shoulders.',
    muscles: 'Internal and external obliques, the back extensors and the deep spinal rotators; the lats and the rhomboids set the shoulder blades.',
    how: 'A full shoulder turn lengthens the trunk muscles like a spring. They then shorten fast in the forward swing and pass the speed out to the arm.',
    cost: 'A short turn means a short spring. You make the same speed with a faster arm, which is less repeatable and harder on the shoulder.',
    facts: [BACKSWING, TRUNK_LOSS],
  },
  knees: {
    joints: 'Hips, knees and ankles bend together (triple flexion) and the spine stays tall.',
    muscles: 'Quads and glutes do the bending and pushing, the hamstrings hold the hips and the calves finish the push.',
    how: 'Bending loads the leg muscles like springs and lowers you to the ball. Straightening then pushes against the ground and starts the chain that ends at the racket.',
    cost: 'Without leg bend you bend at the waist to reach low balls, and the arm makes up the missing push. In the serve that shows up as more load on the shoulder and elbow.',
    facts: [KNEE_15, LEGS_TRUNK],
  },
  'contact-front': {
    joints: 'The hips and shoulders have rotated almost square to the net; the hitting arm is in front of the front hip.',
    muscles: 'Chest (pec major) and front shoulder swing the arm across; the rotator cuff rotates it inward; the forearm holds the racket face steady.',
    how: 'In front of the body the racket is still speeding up and the face is square. Contact behind the hip catches the racket while it is still turning and the face is open.',
    cost: 'Late contact means less speed, a face that is hard to control and a wrist that has to rescue the shot.',
    facts: [IR_35, { value: '~10%', text: 'of racket speed comes from the shoulder moving forward. The rest comes from rotations that peak in front of the body.', ref: 'forehand' }],
  },
  'arm-space': {
    joints: 'The elbow sits away from the ribs; the shoulder is abducted (arm lifted from the side) so the arm can swing in a wide arc.',
    muscles: 'Deltoids and the rotator cuff hold the arm out; the chest and the internal rotators swing it.',
    how: 'Space lets the upper arm rotate and swing across freely. Those are the two biggest arm contributors to racket speed.',
    cost: 'Crowded, the elbow jams into the side ("chicken wing") and the arm cannot rotate, so the swing gets short and wristy.',
    facts: [IR_35, { value: '100–130°', text: 'elbow angle at forehand contact (western to eastern grip). The arm is long, not tucked.', ref: 'forehand' }],
  },
  'finish-across': {
    joints: 'The shoulders keep turning past square, the upper arm keeps rotating inward and the racket wraps over the opposite shoulder.',
    muscles: 'The trunk rotators keep turning; the back of the shoulder (posterior cuff), the lats and the serratus brake the arm after contact.',
    how: 'A full finish lets the racket slow down over a long path. That keeps the speed high through contact instead of braking early.',
    cost: 'Stopping short means braking before or at contact. The back of the shoulder takes a short, hard stop on every ball.',
    facts: [DECEL, { value: '30–35%', text: 'of maximum effort from the back of the rotator cuff just to slow the arm after a serve.', ref: 'serve8' }],
  },
  'finish-high': {
    joints: 'The racket drops below the ball, then the legs straighten and the arm swings up and forward.',
    muscles: 'Legs and glutes lift; the front shoulder and the internal rotators bring the racket up the back of the ball.',
    how: 'Topspin comes from the racket moving up as well as forward. A high finish shows the path was low to high.',
    cost: 'A flat, shoulder-height finish means a flat path. There is little spin to bring the ball down, so it sails long or you have to slow down.',
    facts: [{ value: '8 → 12 m/s', text: 'upward racket speed for a flat forehand compared with a topspin one, at about the same total racket speed.', ref: 'forehand' }],
  },
  'bh1-throat': {
    joints: 'Both shoulders turn together while the off hand holds the throat; the hitting arm stays relaxed and close to the chest.',
    muscles: 'Obliques and the back turn the trunk; the off arm’s rear shoulder and rhomboids pull the racket back.',
    how: 'The off hand makes the trunk turn the racket back, so the shoulders get a full turn and the racket arrives in the same slot every time.',
    cost: 'Letting go early lets the hitting arm take the racket back alone. The shoulders stay open and the one-hander loses its leverage.',
    facts: [BACKSWING],
  },
  'bh1-straight': {
    joints: 'The hitting arm is straight at contact with the shoulder in front of the body; the off arm goes back to balance.',
    muscles: 'Rear deltoid, middle trapezius and rhomboids swing the arm out; the triceps keep the elbow straight; the forearm extensors hold the wrist.',
    how: 'A straight arm turns the shoulder into the hinge and the whole arm into one long lever, so the force goes into the ball instead of into a bending elbow.',
    cost: 'Leading with the elbow loads the forearm extensors on every ball. That is the classic tennis-elbow pattern on one-handers.',
    facts: [{ value: '0.5–0.75×', text: 'body weight pulls on the arm through and after contact. It is better carried by a straight arm and stable shoulder blade.', ref: 'chain' }],
  },
  'bh2-hands': {
    joints: 'The two arms form a triangle with the shoulders; the top (non-dominant) hand drives, like a non-dominant forehand.',
    muscles: 'The trunk rotators and both chest muscles; the top arm’s internal rotators and wrist do most of the late acceleration.',
    how: 'Keeping both hands on keeps the triangle, so the trunk’s rotation goes straight into the racket.',
    cost: 'Letting go of the top hand at contact breaks the triangle. You lose the main source of power and control on the two-hander.',
    facts: [TRUNK_LOSS],
  },
  trophy: {
    joints: 'Hitting elbow at about shoulder height and bent near 90°; shoulder externally rotating; spine extending and tilting back.',
    muscles: 'Rotator cuff and serratus anterior set the arm; the trunk side-benders (obliques, quadratus lumborum) tilt the shoulders.',
    how: 'The trophy loads the shoulder and trunk in their strongest, safest position before the throw up to the ball.',
    cost: 'With the elbow low or the arm straight behind you, the shoulder has to rotate from a weaker angle and the front of it takes more load.',
    facts: [{ value: '175–185°', text: 'of shoulder external rotation in elite serves, from the shoulder, the shoulder blade and the arched back together.', ref: 'serve8' }, KNEE_15],
  },
  toss: {
    joints: 'The tossing arm lifts straight up from the shoulder, with the palm up and the wrist quiet; the shoulders tilt so the front shoulder is high.',
    muscles: 'The deltoid and the upper trapezius lift the arm; the trunk side-benders tilt the shoulder line.',
    how: 'A high toss arm tilts the shoulders and keeps the chest turned while the legs load. It also holds back the forward rotation until the right moment.',
    cost: 'Dropping the toss arm early lets the hips and trunk open too soon. The hitting arm lags behind and the shoulder gets pinched and stretched.',
    facts: [{ value: '48°', text: 'trunk tilt above horizontal at contact in Olympic servers. The toss arm sets up that tilt.', ref: 'serve8' }],
  },
  'racket-drop': {
    joints: 'The shoulder rotates out to its limit as the trunk drives up; the racket head falls down the back.',
    muscles: 'The internal rotators (subscapularis, pec major, lats) are stretched, then fire. The serratus holds the shoulder blade.',
    how: 'A deep drop is a pre-stretch. The legs and trunk throw the arm up while the forearm lags, and the stretched muscles snap back.',
    cost: 'A shallow drop means a short stretch. You lose the whip and push the racket with the arm.',
    facts: [{ value: '<0.01 s', text: 'is all it takes advanced servers to go from the deepest drop (maximum external rotation) to contact.', ref: 'serve8' }, { value: '115%', text: 'of maximum voluntary effort from the pec major as the arm rotates in, and 113% from the subscapularis.', ref: 'serve8' }],
  },
  'reach-up': {
    joints: 'At contact the arm is about 100° up from the side, the elbow nearly straight and the trunk tilted up to the ball.',
    muscles: 'Legs and trunk lift; the serratus and lower trapezius rotate the shoulder blade up so the arm can reach high safely.',
    how: 'Hitting at full reach gives the highest contact, which opens the angle over the net and lets the racket hit at full speed.',
    cost: 'Letting the ball drop shortens the lever and flattens the trajectory, so fewer serves clear the net and land in.',
    facts: [{ value: '~100°', text: 'arm angle from the side just before contact. That is the same angle as the strongest and safest pitching position.', ref: 'serve8' }, { value: '20°', text: 'elbow bend at contact. The arm is nearly straight.', ref: 'serve8' }],
  },
  coil: {
    joints: 'The pelvis stays quieter while the thoracic spine keeps turning, which makes a separation angle between hips and shoulders.',
    muscles: 'The obliques and the back of the trunk are stretched across the separation; the glutes hold the hips steady.',
    how: 'Separation stretches the trunk muscles so they shorten faster in the forward swing. The hips then lead and the shoulders whip through.',
    cost: 'Hips and shoulders turning as one block means no stretch. You get a slower, arm-led swing.',
    facts: [BACKSWING, TRUNK_LOSS],
  },
  weight: {
    joints: 'The back hip extends (straightens) and pushes the body over a firm front leg; the centre of mass moves toward the net.',
    muscles: 'Back-leg glutes and calf push; the front-leg quads and glutes brace so the body can rotate over it.',
    how: 'Moving forward adds momentum to the ball. The back hip straightening also helps the trunk start its turn.',
    cost: 'Hitting off the back foot sends momentum away from the ball, so shots land short and lack weight.',
    facts: [{ value: 'Back hip', text: 'extension drives the hip forward and helps the trunk rotate in the forehand forward swing.', ref: 'forehand' }, LEGS_TRUNK],
  },
  legs: {
    joints: 'Hips, knees and ankles straighten fast (triple extension) just before the arm swings.',
    muscles: 'Quads, glutes and calves; the hamstrings and the core pass the push up into the trunk.',
    how: 'The legs push against the ground. The ground pushes back, and the force travels up the chain to the racket.',
    cost: 'Flat-footed hitting skips the biggest engine in the body. The arm is left to replace it.',
    facts: [KNEE_VEL, { value: '1.7–2.1×', text: 'body weight of vertical force pushed into the ground during the serve.', ref: 'serve8' }],
  },
  chain: {
    joints: 'Ground, then legs, then hips, then trunk, then shoulder, then elbow, then wrist. Each segment peaks just after the one before.',
    muscles: 'Legs and glutes start it, the obliques and back carry it, and the shoulder and arm muscles mostly steer and pass it on.',
    how: 'Each segment speeds up and then slows so the next one goes faster, like cracking a whip. Order matters more than raw strength.',
    cost: 'Out of order (the arm first, or hips and shoulders together), the speed doesn’t add up. The arm works harder for less, and the joints take the strain.',
    facts: [LEGS_TRUNK, SHOULDER_13, TRUNK_LOSS],
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
  /** The tennis link: what it trains in the stroke. */
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
    how: 'Take stairs two steps at a time. Push through the whole front foot, keep the knee over the toes and the chest tall, and drive up until the back leg is straight.',
    dose: 'Every flight you meet. Walk down slowly, one step at a time.',
    why: 'Each step is a deep single-leg squat and push. It trains the quads and glutes through the same bend and drive as a low forehand or a serve load.',
    care: 'Hold the rail if balance is an issue. Skip the double step with sore knees.',
    topics: ['knees', 'legs', 'weight'], drills: ['squats', 'split-squats', 'sit-and-hit', 'sit-lift', 'step-in', 'jump-squats'], ref: 'stairs',
  },
  {
    id: 'chair-stand', name: 'Stand up without your hands', kind: 'everyday',
    how: 'Whenever you get up from a chair, sofa or car seat, stand with arms folded. Sit back with control, hips first, instead of dropping.',
    dose: 'Every time. Add 5 slow extra reps once a day.',
    why: 'This is a bodyweight box squat: hips back, knees out, weight in the heels. It is the leg pattern for "Bend knees" and "Sit and hit".',
    topics: ['knees', 'legs'], drills: ['squats', 'sit-and-hit', 'sit-lift', 'trophy-sit'],
  },
  {
    id: 'pick-up', name: 'Squat, don’t stoop', kind: 'everyday',
    how: 'Pick things up from the floor or a low shelf by bending the knees with a flat back, not by folding at the waist.',
    dose: 'Every time you pick something up.',
    why: 'This is the same mistake as on court: bending at the waist instead of the knees. Grooving it at home makes the low-ball position feel normal.',
    topics: ['knees'], drills: ['sit-and-hit', 'low-shuffle', 'squats'],
  },
  {
    id: 'look-back', name: 'Turn with your chest, not your neck', kind: 'everyday',
    how: 'When someone calls you from behind, or you check over your shoulder, turn the shoulders and hips together like a unit turn, then look.',
    dose: 'Every time you turn to look.',
    why: 'It trains the habit of turning the whole upper body as one block. That is exactly the unit turn the moment you read the ball.',
    topics: ['early-prep', 'shoulder-turn'], drills: ['turn-freeze', 'call-side', 'mirror-turns', 'back-to-net'],
  },
  {
    id: 'kettle-coil', name: 'Kettle coils', kind: 'everyday',
    how: 'While the kettle boils, stand side-on to the counter with your hands on it, hips facing the counter. Turn the shoulders away as far as you can while the belt buckle stays put. Hold 3 s, then switch sides.',
    dose: '8 each side, once or twice a day.',
    why: 'It separates the hips from the shoulders, the same coil you need in the backswing (shoulders 20–30° past the hips).',
    topics: ['coil', 'shoulder-turn'], drills: ['hips-still-turns', 'split-turns', 'coil-hold', 'coil-band'], ref: 'forehand',
  },
  {
    id: 'one-leg-brush', name: 'Brush your teeth on one leg', kind: 'everyday',
    how: 'Stand on one leg with a soft knee while you brush, and switch legs halfway. Once it is easy, close your eyes for a few seconds.',
    dose: '2 minutes, twice a day.',
    why: 'Single-leg balance controls the front leg you rotate over, and the landing leg after a serve. It is the base for moving your weight forward.',
    topics: ['weight', 'contact-front', 'legs'], drills: ['step-in', 'split-squats', 'freeze-contact'],
  },
  {
    id: 'top-shelf', name: 'Reach the top shelf on your toes', kind: 'everyday',
    how: 'Reach for high shelves with a long arm, up on the toes, ribs tall, and let the shoulder blade rotate up. Hold the reach for a second.',
    dose: 'Whenever you reach up, plus 10 slow reaches a day.',
    why: 'It is the serve contact position: full reach, arm about 100° from the side, legs extended. It also keeps the upward rotation of the shoulder blade working.',
    topics: ['reach-up', 'toss'], drills: ['reach-freeze', 'toss-catch', 'overhead-throw'], ref: 'serve8',
  },
  {
    id: 'key-toss', name: 'Keys toss and catch', kind: 'everyday',
    how: 'Toss your keys (or a rolled pair of socks) straight up from a straight arm with the palm up, and catch them with the same arm still high.',
    dose: '10 tosses whenever you come home.',
    why: 'It grooves a straight, lifted toss arm with a quiet wrist. That keeps the shoulders tilted and the trunk from opening early.',
    topics: ['toss'], drills: ['toss-catch', 'toss-target'], ref: 'serve8',
  },
  {
    id: 'queue-shifts', name: 'Queue weight shifts', kind: 'everyday',
    how: 'Waiting in a queue or at the bus stop, stand in a small split stance and slowly move your weight from the back foot to the front foot and back, keeping the head level.',
    dose: '1 to 2 minutes whenever you wait.',
    why: 'It teaches you to feel the weight move forward over a firm front leg instead of sitting back.',
    topics: ['weight'], drills: ['step-in', 'step-throw'],
  },
  {
    id: 'catch-front', name: 'Catch things in front of you', kind: 'everyday',
    how: 'Playing catch, or catching anything that is thrown to you, step toward it and take it out in front of your front hip with a long arm. Don’t let it come into your body.',
    dose: 'Whenever you play catch. 20 catches with each hand is a good session.',
    why: 'It trains your eyes and feet to meet the ball in front, where the racket is fastest and the face is square.',
    topics: ['contact-front', 'arm-space', 'weight'], drills: ['catch-in-front', 'shadow-contact', 'freeze-contact', 'spacing-feeds'],
  },
  {
    id: 'underarm', name: 'Bowling or an underarm toss', kind: 'everyday',
    how: 'Ten-pin bowling, boules or an underarm throw to a friend: bend the knees, swing the arm down low, then lift through to a high finish with the legs straightening.',
    dose: '10 to 20 throws.',
    why: 'A low-to-high swing powered by the legs straightening. It is the same path that makes topspin and a high finish.',
    topics: ['finish-high', 'legs'], drills: ['over-the-rope', 'drop-to-finish', 'sit-lift'],
  },
  {
    id: 'throw-ball', name: 'Throw for the dog, or skim stones', kind: 'everyday',
    how: 'Throw side-on: step toward the target, let the hips turn first, and let the arm come last. Skimming stones is a low, sideways throw, close to a forehand.',
    dose: '10 to 20 relaxed throws, with both arms now and then.',
    why: 'Overarm throwing uses the serve’s chain (legs, hips, trunk, then arm with a lagging forearm). Skimming uses the forehand’s chain: hips lead, arm follows, and the finish goes across.',
    care: 'Warm up first. Don’t throw hard with a cold shoulder.',
    topics: ['chain', 'racket-drop', 'finish-across', 'trophy'], drills: ['rot-throw', 'overhead-throw', 'towel-serve', 'slow-chain', 'chain-overhead'], ref: 'chain',
  },
  {
    id: 'rake', name: 'Rake, sweep or vacuum from the hips', kind: 'everyday',
    how: 'Stand in a split stance and drive each stroke by turning the hips and shifting your weight, not by pulling with the arms.',
    dose: 'Whenever you do the chore.',
    why: 'Hips turn, then the trunk, then the arms. It is the same proximal-to-distal order as the forward swing, in slow motion.',
    topics: ['chain', 'finish-across', 'weight'], drills: ['slow-chain', 'shadow-finish', 'step-in'],
  },
  {
    id: 'bag-carry', name: 'Carry a bag in one hand, standing tall', kind: 'everyday',
    how: 'Carry shopping in one hand (a suitcase carry) without leaning to either side. Ribs down, shoulders level. Switch hands every block.',
    dose: 'Whenever you carry bags.',
    why: 'Resisting the side bend builds the side trunk muscles that tilt the shoulders in the serve and keep the core steady while the arm whips.',
    topics: ['trophy', 'reach-up', 'chain'], drills: ['trophy-hold', 'reach-freeze', 'rot-throw'], ref: 'usta',
  },
  {
    id: 'doorway-turn', name: 'Doorway two-hand turns', kind: 'everyday',
    how: 'Hold a broom handle or a rolled towel in both hands like a two-handed backhand. Turn the shoulders back, then swing through to finish over the shoulder with both hands on.',
    dose: '10 slow swings each way while the TV ads run.',
    why: 'It keeps the two-hander’s triangle together through the turn and the finish, and lets the trunk, not the arms, move the handle.',
    topics: ['bh2-hands', 'bh1-throat'], drills: ['bh2-finish-hold', 'throat-shadow', 'bh2-medball'],
  },

  // ——— Yoga ———
  {
    id: 'thread-needle', name: 'Thread the needle', kind: 'yoga',
    how: 'On all fours, slide one arm under the body, resting the shoulder and temple on the floor, then open the same arm up to the ceiling. Hips stay over the knees.',
    dose: '5 slow reps each side, then hold 5 breaths.',
    why: 'Upper-back (thoracic) rotation is where the shoulder turn comes from. This keeps it free without twisting the lower back.',
    topics: ['shoulder-turn', 'coil', 'early-prep', 'bh1-throat'], drills: ['back-to-net', 'hips-still-turns', 'split-turns', 'mirror-turns', 'throat-shadow'], ref: 'yoga',
  },
  {
    id: 'revolved-lunge', name: 'Revolved high lunge', kind: 'yoga',
    how: 'From a high lunge, put your palms together and twist toward the front knee, hooking the elbow outside it. Keep the back leg long and the hips level.',
    dose: 'Hold 5 breaths each side.',
    why: 'You rotate the trunk over a stable split stance with the hips quiet. That is the coil position, with a hip-flexor stretch for the leg drive.',
    topics: ['coil', 'chain', 'shoulder-turn'], drills: ['split-turns', 'coil-hold', 'coil-band'], ref: 'yoga',
  },
  {
    id: 'revolved-triangle', name: 'Revolved triangle', kind: 'yoga',
    how: 'With a long stance, hips square, hinge and turn the chest open toward the front leg, reaching one arm down and the other up.',
    dose: 'Hold 5 breaths each side.',
    why: 'Hamstring length plus upper-back rotation, with the hips fixed. It is the same separation the coil needs.',
    topics: ['coil', 'shoulder-turn'], drills: ['hips-still-turns', 'split-turns'], ref: 'yoga',
  },
  {
    id: 'chair-pose', name: 'Chair pose (utkatasana)', kind: 'yoga',
    how: 'Feet together or hip-width apart, sit back as if into a chair with the arms reaching up. Weight in the heels, chest lifted.',
    dose: '3 holds of 5 to 8 breaths.',
    why: 'This is an isometric hold in the loaded position: quads, glutes and back working together, with the knees bent and the chest up.',
    topics: ['knees', 'legs'], drills: ['squats', 'sit-and-hit', 'trophy-sit'],
  },
  {
    id: 'garland', name: 'Garland squat (malasana)', kind: 'yoga',
    how: 'Squat deep with your feet wider than your hips, heels down, elbows pressing the knees out and your chest tall.',
    dose: 'Hold 30 to 60 s, once or twice a day.',
    why: 'It builds the ankle and hip mobility you need to get low to the ball without your heels lifting or your back rounding.',
    topics: ['knees'], drills: ['squats', 'low-shuffle', 'sit-and-hit'],
  },
  {
    id: 'crescent', name: 'Low lunge (crescent)', kind: 'yoga',
    how: 'Back knee down, front knee over the ankle. Tuck the pelvis under and lift the arms until you feel the front of the back hip stretch.',
    dose: 'Hold 5 breaths each side.',
    why: 'Tight hip flexors stop the back hip from extending, and back-hip extension drives the weight forward and helps the trunk rotate.',
    topics: ['weight', 'legs', 'chain'], drills: ['step-in', 'split-squats', 'sit-lift'], ref: 'forehand',
  },
  {
    id: 'warrior2', name: 'Warrior II', kind: 'yoga',
    how: 'Long side stance, front knee bent over the ankle, arms long at shoulder height. Look past the front hand.',
    dose: 'Hold 5 breaths each side.',
    why: 'A side-on, loaded stance with long arms. It is close to the forehand’s turned position with space between the arm and the body.',
    topics: ['arm-space', 'knees', 'shoulder-turn'], drills: ['spacing-feeds', 'point-off-hand', 'long-arm-throw'],
  },
  {
    id: 'cow-face', name: 'Cow face and eagle arms', kind: 'yoga',
    how: 'Cow face: reach one hand down the back from above and the other up from below, and hold or use a strap. Eagle: cross the arms at the elbows and wrap the forearms.',
    dose: 'Hold 5 breaths each side, daily.',
    why: 'Serving tends to cost the hitting shoulder internal rotation. These keep it, which helps both the deep racket drop and the follow-through across the body.',
    care: 'Don’t force the hands together. Use a strap.',
    topics: ['racket-drop', 'finish-across', 'trophy'], drills: ['drop-pause', 'towel-serve', 'serve-finish'], ref: 'yoga',
  },
  {
    id: 'plank-dog', name: 'Down dog to plank flow', kind: 'yoga',
    how: 'Flow from downward dog forward to plank and back, pushing the floor away so the shoulder blades wrap around the ribs.',
    dose: '8 slow cycles.',
    why: 'Shoulder-blade control (serratus anterior) and cuff stability hold the arm safe in the trophy, at full reach and on a straight-arm backhand.',
    topics: ['trophy', 'reach-up', 'bh1-straight'], drills: ['trophy-hold', 'reach-freeze', 'bh-contact-freeze'], ref: 'yoga',
  },
  {
    id: 'side-plank', name: 'Side plank', kind: 'yoga',
    how: 'On one forearm or hand, with the body in a straight line from head to heels. Lift the top arm to the ceiling.',
    dose: '3 holds of 20 to 30 s each side.',
    why: 'The side trunk muscles tilt the shoulders in the serve, and the elite trunk tilt at contact is 48° above horizontal. They also stabilise the shoulder.',
    topics: ['toss', 'reach-up', 'trophy'], drills: ['toss-catch', 'reach-freeze', 'trophy-mirror'], ref: 'serve8',
  },
  {
    id: 'tree', name: 'Tree pose', kind: 'yoga',
    how: 'Stand on one leg and press the other foot into the inner calf or thigh. Hands at the chest, then overhead.',
    dose: 'Hold 30 s each side.',
    why: 'Balance over one leg is what lets you rotate over a firm front leg and hold the finish.',
    topics: ['weight', 'contact-front'], drills: ['step-in', 'freeze-contact', 'catch-in-front'],
  },

  // ——— Other sports ———
  {
    id: 'rowing', name: 'Rowing (or the rowing machine)', kind: 'sport',
    how: 'Each stroke goes legs, then body swing, then arms, and back again: arms, body, legs. Focus on a hard push from the legs, not a pull with the arms.',
    dose: '15 to 20 min steady, or 8 × 250 m hard with easy rests, once a week.',
    why: 'The stroke is the kinetic chain in a straight line: the legs drive first, then the trunk, then the arms. It trains the order behind "hips lead the swing", strengthens the upper back that brakes the arm after contact, and builds match stamina without impact.',
    care: 'Keep a neutral back and don’t yank with the arms. It adds pulling volume, so balance it with chest and rotation work.',
    topics: ['chain', 'legs', 'finish-across'], drills: ['slow-chain', 'sit-lift', 'jump-squats', 'shadow-finish'], ref: 'chain',
  },
  {
    id: 'swimming', name: 'Swimming (freestyle and backstroke)', kind: 'sport',
    how: 'Freestyle with a long reach and a full body roll from the hips. Mix in backstroke lengths, which open the chest and use the back of the shoulder.',
    dose: '20 to 30 min easy, once or twice a week on non-tennis days.',
    why: 'The body roll links hip and shoulder rotation, and the long overhead reach trains the full-reach contact position. Backstroke balances the forward-rounded posture tennis builds, and it is low-impact recovery for knees and back.',
    care: 'Swimming is overhead work too, so don’t do a hard swim the same day as a heavy serve session.',
    topics: ['reach-up', 'shoulder-turn', 'coil', 'finish-across'], drills: ['reach-freeze', 'back-to-net', 'split-turns'],
  },
  {
    id: 'skipping', name: 'Skipping rope', kind: 'sport',
    how: 'Light, quick hops on the balls of the feet, knees soft. Mix two feet, alternate feet and side-to-side hops.',
    dose: '5 to 10 rounds of 30 s on, 30 s off.',
    why: 'It builds the springy calf and ankle action of the split step and quick adjustment steps, and teaches soft landings.',
    topics: ['early-prep', 'arm-space', 'legs'], drills: ['turn-freeze', 'adjust-steps', 'low-shuffle', 'jump-squats'],
  },
  {
    id: 'cycling', name: 'Cycling', kind: 'sport',
    how: 'Keep a steady cadence, with hills seated to load the quads and glutes. The saddle height should leave a slight knee bend at the bottom of the stroke.',
    dose: '30 to 60 min easy, or hill repeats, on off days.',
    why: 'It builds leg endurance so you can stay low late in matches, with almost no impact on the knees.',
    topics: ['knees', 'legs'], drills: ['low-shuffle', 'squats', 'sit-and-hit'],
  },
  {
    id: 'hiking', name: 'Hill walking and hiking', kind: 'sport',
    how: 'Walk uphill with long strides, pushing through the whole foot. Step down slowly on the descents.',
    dose: 'An hour or more at the weekend.',
    why: 'Uphill trains the hip and knee drive like stairs, and controlled downhill trains the braking the legs do when you plant to hit.',
    topics: ['legs', 'knees', 'weight'], drills: ['split-squats', 'step-in', 'squats'], ref: 'stairs',
  },
  {
    id: 'boxing', name: 'Shadow boxing', kind: 'sport',
    how: 'Throw crosses and hooks from a side-on stance. Each punch starts with the back foot turning and the hip rotating, and the fist arrives last.',
    dose: '3 rounds of 2 minutes.',
    why: 'A cross is a forehand in miniature: back foot, hip, trunk, shoulder, then arm. It teaches the order and the move onto the front leg.',
    topics: ['chain', 'weight', 'coil'], drills: ['slow-chain', 'step-in', 'rot-throw'], ref: 'chain',
  },
  {
    id: 'golf', name: 'Golf (range or swing drills)', kind: 'sport',
    how: 'A full turn with the trail hip quiet, then let the hips start the downswing while the shoulders stay back for a beat.',
    dose: 'A bucket of balls, or 20 slow swings with a club.',
    why: 'Golf’s hip–shoulder separation (the "X-factor") is the same coil as the tennis backswing, and the hip-first downswing is the same order.',
    topics: ['coil', 'shoulder-turn', 'chain', 'bh2-hands'], drills: ['coil-hold', 'split-turns', 'slow-chain', 'bh2-finish-hold'],
  },
  {
    id: 'throwing', name: 'Throwing (cricket, baseball, frisbee)', kind: 'sport',
    how: 'Overarm: side-on, elbow up at shoulder height, step and turn, and let the forearm lag. Frisbee backhand: turn the shoulders, then release with a straight arm.',
    dose: '20 to 30 easy throws after a warm-up.',
    why: 'The overarm throw is the serve without a racket: trophy, drop and reach. The frisbee backhand is the one-handed backhand’s shoulder turn and straight-arm release.',
    care: 'Build up gradually. Don’t add a lot of throwing on heavy serving days.',
    topics: ['trophy', 'racket-drop', 'reach-up', 'bh1-straight', 'bh1-throat'], drills: ['trophy-hold', 'drop-pause', 'overhead-throw', 'bh-slow-shadow', 'throat-turn'], ref: 'serve8',
  },
  {
    id: 'table-tennis', name: 'Table tennis', kind: 'sport',
    how: 'Play with a proper side-on turn and take the ball early, in front of the body. Finish the forehand across, toward the opposite shoulder.',
    dose: 'Any game. 20 to 30 minutes is plenty.',
    why: 'It is fast reading and early preparation in a small space. It trains meeting the ball in front at a comfortable distance from the body, with a finish across.',
    topics: ['contact-front', 'arm-space', 'finish-across', 'early-prep'], drills: ['shadow-contact', 'catch-racket', 'freeze-contact', 'adjust-steps', 'call-side'],
  },
  {
    id: 'paddle', name: 'Kayaking or paddleboarding', kind: 'sport',
    how: 'Drive each stroke by turning the trunk, with the arms fairly straight like a frame, rather than pulling with the arms.',
    dose: 'An outing at the weekend.',
    why: 'Two hands linked by the paddle, powered by trunk rotation: the same triangle and turn as the two-handed backhand.',
    topics: ['bh2-hands', 'coil'], drills: ['bh2-finish-hold', 'bh2-medball', 'coil-band'],
  },

  // ——— Gym ———
  {
    id: 'step-ups', name: 'Step-ups', kind: 'gym',
    how: 'Put one foot on a knee-high box and drive up through that heel until you stand tall. Lower slowly.',
    dose: '3 × 8 each leg.',
    why: 'Single-leg drive with stairs-like mechanics, under load. It is the push that starts both the forehand and the serve.',
    topics: ['legs', 'knees', 'weight'], drills: ['split-squats', 'sit-lift', 'jump-serve'], ref: 'usta',
  },
  {
    id: 'woodchop', name: 'Cable or band woodchops', kind: 'gym',
    how: 'Side-on to a cable, pull it from high to low (or low to high) across the body by turning the hips and trunk, with the arms long.',
    dose: '3 × 10 each side.',
    why: 'Loaded trunk rotation in the stroke’s order. Low to high matches the topspin path, and high to low matches the serve.',
    topics: ['chain', 'finish-across', 'finish-high', 'bh2-hands'], drills: ['rot-throw', 'shadow-finish', 'drop-to-finish', 'over-the-rope', 'bh2-medball'], ref: 'usta',
  },
  {
    id: 'pallof', name: 'Pallof press', kind: 'gym',
    how: 'Stand side-on to a band, hands at the chest. Press straight out and hold while the band tries to turn you.',
    dose: '3 × 10 presses with a 2 s hold, each side.',
    why: 'It trains the core to resist rotation, which is how you keep the hips quiet while the shoulders coil, and how the trunk stays a stable base for the arm.',
    topics: ['coil', 'chain'], drills: ['coil-band', 'band-turns', 'hips-still-turns'],
  },
  {
    id: 'cuff', name: 'Band external rotations and face pulls', kind: 'gym',
    how: 'Elbow at your side (or at 90° up for the serve), rotate the forearm out against a light band. For face pulls, pull the band to eye level with the elbows high.',
    dose: '2 to 3 × 15, slow, 3 times a week.',
    why: 'The back of the rotator cuff brakes the arm after every serve and forehand. These keep it strong enough to carry that load.',
    care: 'Use a light band. These are control exercises, not strength records.',
    topics: ['trophy', 'finish-across', 'racket-drop', 'bh1-straight'], drills: ['trophy-mirror', 'serve-finish', 'bh-slow-shadow'], ref: 'serve8',
  },
  {
    id: 'sleeper', name: 'Sleeper and cross-body stretches', kind: 'gym',
    how: 'Sleeper: lie on the hitting side with the arm at 90° in front and gently press the forearm down. Cross-body: pull the straight arm across the chest.',
    dose: 'Hold 30 s, 3 times, after playing.',
    why: 'Serving can cost 10–15° of internal rotation in the hitting shoulder. These stretches have been shown to win it back.',
    care: 'Gentle pressure only. Stop if you feel a pinch at the front of the shoulder.',
    topics: ['racket-drop', 'finish-across', 'trophy'], drills: ['drop-pause', 'towel-serve', 'serve-finish'], ref: 'serve8',
  },
  {
    id: 'kb-swing', name: 'Kettlebell swings', kind: 'gym',
    how: 'Hinge at the hips with the bell between the legs, then snap the hips forward so the bell floats to chest height. The arms only guide it.',
    dose: '3 × 12 to 15.',
    why: 'Explosive hip extension from a loaded hinge. It is the leg-and-hip drive that lifts the racket from low to high.',
    care: 'Hinge, don’t squat, and keep the back flat.',
    topics: ['legs', 'finish-high', 'chain'], drills: ['sit-lift', 'drop-to-finish', 'jump-squats'], ref: 'usta',
  },
  {
    id: 'goblet', name: 'Goblet squats', kind: 'gym',
    how: 'Hold a dumbbell or kettlebell at your chest. Squat between your knees with the elbows inside the knees and the chest tall.',
    dose: '3 × 8 to 10.',
    why: 'Loaded squats with an upright trunk. They build the leg strength to stay low, which is the hold position of "Bend knees".',
    topics: ['knees', 'legs'], drills: ['squats', 'sit-and-hit', 'jump-squats'], ref: 'usta',
  },
];

/** Activities that help a fix, those linked to the drill first. */
export function activitiesFor(topicId: string, drillId?: string): Activity[] {
  const list = ACTIVITIES.filter((a) => a.topics.includes(topicId) || (drillId && a.drills.includes(drillId)));
  return list.sort((a, b) => Number(!!drillId && b.drills.includes(drillId)) - Number(!!drillId && a.drills.includes(drillId)));
}
