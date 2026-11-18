/**
 * Strike lab 3D cards: the stroke as six numbered coaching cards ("1 Turn early", "2 Drop the racket
 * head", ...), each holding on one frame of the 3D figure with a pass/fix verdict and the numbers
 * behind it. Built from the step-by-step breakdown (camera, body lines, ghost rackets) and the
 * Strike lab reading (face, drive, brake, extension). Pure: the renderer and exports draw from it.
 */
import { formatReading, type Breakdown, type Chapter, type Reading } from './breakdown';
import type { Strike, StrikeCheck } from './strike';
import type { Stroke } from './types';

export type StatTag = 'MEAS.' | 'EST.' | 'MODEL';

export interface CardStat {
  label: string;
  value: string;
  tag: StatTag;
  status?: 'good' | 'fix';
}

export interface StrikeCard {
  n: number;
  id: 'turn' | 'drop' | 'front' | 'face' | 'drive' | 'finish';
  title: string;
  /** One plain sentence under the title. */
  line: string;
  /** Breakdown chapter whose 3D look and body readouts the card uses (look may be adjusted). */
  chapter: Chapter;
  /** Frame the card holds on, and where its slow-motion run starts. */
  frame: number;
  from: number;
  /** Body readouts from the breakdown layer on the figure (gauges, dimension lines). */
  body: boolean;
  verdict?: { ok: boolean | null; text: string };
  stats: CardStat[];
}

const tag = (r: Reading): StatTag => (r.source === 'estimated' ? 'EST.' : 'MEAS.');
const stat = (r: Reading | undefined, label?: string): CardStat | null =>
  r ? { label: label ?? r.label, value: formatReading(r), tag: tag(r), status: r.status === 'fix' ? 'fix' : r.status === 'good' ? 'good' : undefined } : null;
const okStatus = (c?: StrikeCheck) => (c?.ok === true ? 'good' : c?.ok === false ? 'fix' : undefined);
const keep = <T,>(xs: (T | null | undefined | false)[]) => xs.filter(Boolean) as T[];

const HEIGHT_WORD = { low: 'below the net strap', net: 'at net height', high: 'above the net' } as const;
const faceWord = (v: number) => (Math.abs(v) < 0.5 ? 'vertical' : v > 0 ? `${Math.round(v)}° closed` : `${Math.round(-v)}° open`);

export function strikeCards(b: Breakdown, strike: Strike | undefined, stroke: Stroke): StrikeCard[] {
  const ch = (id: Chapter['id']) => b.chapters.find((c) => c.id === id)!;
  const coil = ch('coil'), swing = ch('swing'), contact = ch('contact'), finish = ch('finish');
  const r = (c: Chapter, id: string) => c.readings.find((x) => x.id === id);
  const check = (id: StrikeCheck['id']) => strike?.checks.find((c) => c.id === id);
  const cards: StrikeCard[] = [];

  // 1. Turn.
  const sh = r(coil, 'shoulderTurn'), sep = r(coil, 'sep');
  const turned = sh ? sh.value >= 80 : null;
  cards.push({
    n: 1, id: 'turn', title: 'Turn early', line: 'Shoulders turn past the hips while the ball is still coming.',
    // A raised view from behind: the shoulder and hip lines read as clearly as from above, and the body still reads as a player.
    chapter: { ...coil, look: { ...coil.look, camera: { yaw: 20, height: 2.6, dist: 3.2 } } }, frame: coil.frame, from: coil.from, body: true,
    verdict: sh ? { ok: sh.status === 'fix' ? false : turned, text: turned ? 'Shoulders turned side-on' : 'Turn the shoulders further' } : undefined,
    stats: keep([stat(sh), stat(r(coil, 'hipTurn')), stat(sep), stat(r(coil, 'kneeCoil'), 'Knee bend')]),
  });

  // 2. Racket drop.
  const drop = r(swing, 'drop');
  const dropped = drop ? drop.value >= 5 : null;
  cards.push({
    n: 2, id: 'drop', title: 'Drop the racket head', line: 'The head falls below the hand before swinging up and through the ball.',
    chapter: swing, frame: swing.frame, from: swing.from, body: true,
    verdict: drop ? { ok: dropped, text: dropped ? 'Drops below the hands' : 'Stops at hand level' } : undefined,
    stats: keep([stat(drop), stat(r(swing, 'chain')), stat(r(swing, 'comDrop')), stat(r(swing, 'hipSpeed'))]),
  });

  // 3. Contact in front.
  const fwd = r(contact, 'contactForward');
  cards.push({
    n: 3, id: 'front', title: 'Hit it in front', line: 'Body behind, ball ahead: the power goes into the ball, not past it.',
    chapter: contact, frame: contact.frame, from: contact.from, body: true,
    verdict: fwd ? { ok: fwd.status === 'fix' ? false : fwd.value >= 0.2, text: fwd.status !== 'fix' && fwd.value >= 0.2 ? 'Contact out in front' : 'Contact too close to the body' } : undefined,
    stats: keep([
      stat(fwd, 'In front of the hips'),
      strike?.ballHeight !== undefined ? { label: `Contact height · ${HEIGHT_WORD[strike.height!]}`, value: `${strike.ballHeight.toFixed(2)} m`, tag: 'EST.' } : null,
      stat(r(contact, 'kneeFront')), stat(r(contact, 'weight')),
    ]),
  });

  if (strike) {
    // 4. Face for the bounce.
    const face = check('face');
    cards.push({
      n: 4, id: 'face', title: `Square face, ${strike.stage} ball`, line: `On a ${strike.stage} ball the face should be ${strike.faceTarget.words}.`,
      chapter: { ...contact, look: { ...contact.look, camera: { yaw: 100, height: 1.1, dist: 2.4 }, lines: [], ghostsFrom: Math.max(stroke.startFrame, contact.frame - 4) } },
      frame: contact.frame, from: Math.max(contact.from, contact.frame - 8), body: false,
      verdict: face ? { ok: face.ok, text: face.ok ? 'Face meets the ball square' : face.ok === false ? 'Face not square to the ball' : 'Face could not be read' } : { ok: null, text: 'Face not readable from this angle' },
      stats: keep([
        strike.face !== undefined ? { label: 'Racket face', value: faceWord(strike.face), tag: 'EST.' as const, status: okStatus(face) } : null,
        { label: 'Target', value: strike.faceTarget.words, tag: 'MODEL' as const },
        { label: 'Ball at contact', value: strike.stage, tag: strike.stageSource === 'ball' ? 'MEAS.' as const : 'EST.' as const },
        strike.shot ? { label: 'Into the ball', value: `${Math.round(strike.shot.square)}%`, tag: 'MODEL' as const } : null,
      ]),
    });

    // 5. Drive through.
    const drive = check('drive'), brake = check('brake');
    cards.push({
      n: 5, id: 'drive', title: 'Drive through the ball', line: strike.brushing ? 'The swing goes up more than through: the ball gets spin but little pace.' : 'Swing through the ball along the shot, not just up its back.',
      chapter: { ...contact, look: { ...contact.look, camera: { yaw: 70, height: 1.35, dist: 3.4 }, lines: ['spine'], ghostsFrom: swing.frame } },
      frame: Math.min(finish.frame, contact.frame + 2), from: swing.frame, body: false,
      verdict: drive ? { ok: drive.ok && !strike.brushing, text: strike.brushing ? 'Brushing up the back of the ball' : drive.ok ? 'Drives through the ball' : 'Too much lift, not enough drive' } : undefined,
      stats: keep([
        strike.path !== undefined ? { label: 'Swing path', value: `${strike.path >= 0 ? '+' : ''}${Math.round(strike.path)}°`, tag: 'MEAS.' as const } : null,
        strike.drive !== undefined ? { label: 'Drive / lift', value: `${Math.round(strike.drive)} / ${100 - Math.round(strike.drive)}%`, tag: 'MEAS.' as const, status: okStatus(drive) } : null,
        strike.brake !== undefined ? { label: 'Trunk brake', value: `${Math.round(strike.brake)}%`, tag: 'MEAS.' as const, status: okStatus(brake) } : null,
        strike.shot ? { label: 'Off the strings', value: `${Math.round(strike.shot.speed * 3.6)} km/h`, tag: 'MODEL' as const } : null,
      ]),
    });
  }

  // 6. Finish and extend.
  const ext = check('extension');
  const high = r(finish, 'finishHigh');
  cards.push({
    n: cards.length + 1, id: 'finish', title: 'Extend, then finish', line: 'The hand keeps going toward the target, then wraps up and across.',
    chapter: finish, frame: finish.frame, from: finish.from, body: true,
    verdict: ext ? { ok: ext.ok, text: ext.ok ? 'Extends through the ball' : 'Swing cut short after contact' } : high ? { ok: high.status !== 'fix', text: high.status !== 'fix' ? 'Full finish' : 'Finish higher' } : undefined,
    stats: keep([
      strike?.extension !== undefined ? { label: 'Extension after contact', value: `${strike.extension.toFixed(2)} m`, tag: 'MEAS.' as const, status: okStatus(ext) } : null,
      stat(r(finish, 'uncoil')), stat(high), stat(r(finish, 'balance')),
    ]),
  });
  return cards;
}
