import type { BallKey, Key, Motion, Pose, Prop, V3 } from './body';

/**
 * The drill animations, written as key poses for a right-hander (left-handers get the mirror).
 * Hands and racket are in the net frame: [right, up, toward the net] from the shoulder centre.
 * Each key only lists what changes from the key before.
 */

// ---------- shared poses ----------

const READY: Pose = {
  drop: 0.09, hipYaw: 0, chestYaw: 0, lean: 14, tilt: 0,
  lf: { at: [-0.28, 0], yaw: -8, lift: 0, heel: 0 }, rf: { at: [0.28, 0], yaw: 8, lift: 0, heel: 0 },
  rh: [0.13, -0.42, 0.3], lh: [-0.03, -0.4, 0.36],
  racket: [-0.18, 0.3, 0.94], face: [-1, 0, 0],
};

/** Standing tall, arms relaxed, no racket: the start of the gym exercises. */
const STAND: Pose = {
  drop: 0.0, hipYaw: 0, chestYaw: 0, lean: 3, tilt: 0,
  lf: { at: [-0.16, 0], yaw: -6, lift: 0, heel: 0 }, rf: { at: [0.16, 0], yaw: 6, lift: 0, heel: 0 },
  rh: [0.24, -0.53, 0.05], lh: [-0.24, -0.53, 0.05], racket: null,
};

const k = (t: number, p: Partial<Pose>): Key => ({ t, ...p });
const ready = (t: number, extra: Partial<Pose> = {}): Key => k(t, { ...READY, ...extra });

/** Shift every key (and ball key) by dt and optionally stretch time by s around 0. */
function retime<T extends { t: number }>(keys: T[], s = 1, dt = 0): T[] {
  return keys.map((x) => ({ ...x, t: x.t * s + dt }));
}

// ---------- groundstrokes ----------

export interface StrokeOpts {
  /** Show an incoming ball and hit it. */
  ball?: boolean;
  /** Hold at a position for a coaching freeze (seconds). */
  hold?: { at: 'unit' | 'back' | 'contact' | 'finish'; for: number }[];
  /** Knee bend on the load (m of hip drop). */
  load?: number;
  /** Step forward into the ball (neutral stance) instead of an open/semi-open stance. */
  stepIn?: boolean;
  /** Extra shoulder turn at the backswing (degrees). */
  turn?: number;
  /** No racket (shadow with an empty hand, or a towel). */
  noRacket?: boolean;
  /** Slow-motion factor (2 = half speed). */
  slow?: number;
  /** Start from a split step. */
  split?: boolean;
  /** Contact point further forward (m). */
  contactFwd?: number;
  /** Skip the hit: turn and freeze then recover (unit-turn drills). */
  turnOnly?: boolean;
}

interface Built { keys: Key[]; ball?: BallKey[]; stills: Motion['stills']; duration: number }

/** Insert holds: every key after `time` moves later by `len`, with a copy of the pose at `time`. */
function withHolds(b: Built, marks: Record<string, number>, holds: { at: string; for: number }[] | undefined): Built {
  if (!holds?.length) return b;
  let keys = b.keys.slice();
  let ball = b.ball?.slice();
  let stills = b.stills.slice();
  let dur = b.duration;
  const sorted = holds.map((h) => ({ t: marks[h.at], len: h.for })).filter((h) => h.t !== undefined).sort((a, c) => c.t - a.t);
  for (const h of sorted) {
    const idx = keys.findIndex((x) => Math.abs(x.t - h.t) < 1e-6);
    if (idx < 0) continue;
    const later = (x: { t: number }) => (x.t > h.t + 1e-6 ? { ...x, t: x.t + h.len } : x);
    keys = keys.map(later);
    keys.splice(idx + 1, 0, { ...keys[idx], t: h.t + h.len });
    // The ball waits too (frozen in the air with the player).
    if (ball) ball = ball.map(later);
    stills = stills.map((x) => later(x) as typeof x);
    dur += h.len;
  }
  return { keys, ball, stills, duration: dur };
}

export function forehand(o: StrokeOpts = {}): Motion {
  const load = o.load ?? 0.2;
  const turn = 100 + (o.turn ?? 0);
  const racket = !o.noRacket;
  const cf = o.contactFwd ?? 0;
  const R = (v: V3): V3 | null => (racket ? v : null);
  const step = o.stepIn;
  const keys: Key[] = [ready(0)];
  let t = 0.3;
  if (o.split !== false) {
    keys.push(k(t, { drop: 0.02, lf: { at: [-0.27, 0], lift: 0.06 }, rf: { at: [0.27, 0], lift: 0.06 } }));
    t += 0.17;
    keys.push(k(t, { drop: 0.15, lf: { at: [-0.32, 0], lift: 0 }, rf: { at: [0.32, 0], lift: 0 } }));
  }
  const tUnit = t + 0.32;
  keys.push(k(tUnit, {
    drop: 0.17, hipYaw: 45, chestYaw: 82, lean: 10,
    rf: { at: [0.46, -0.12], yaw: 70 }, lf: { at: [-0.3, 0.04], yaw: 25 },
    rh: [0.36, -0.22, 0.12], lh: [0.42, -0.18, 0.26], racket: R([0.25, 0.72, 0.55]), face: [0.2, -0.3, 0.9],
  }));
  const tBack = tUnit + 0.3;
  keys.push(k(tBack, {
    drop: load, hipYaw: 52, chestYaw: turn, lean: 9,
    rh: [0.3, -0.06, -0.33], lh: [0.45, -0.06, 0.24], racket: R([0.18, 0.6, -0.78]), face: [0.6, -0.2, 0.1],
    ...(step ? { lf: { at: [-0.12, 0.45], yaw: 40 } } : {}),
  }));
  const tDrop = tBack + 0.22;
  keys.push(k(tDrop, {
    hipYaw: 30, chestYaw: turn - 22, drop: load - 0.02,
    rh: [0.42, -0.42, -0.24], lh: [0.35, -0.18, 0.28], racket: R([0.25, -0.55, -0.8]), face: [0.1, -0.9, 0.3],
    rf: { at: [0.46, -0.12], yaw: 70, heel: 0.15 },
  }));
  const tContact = tDrop + 0.17;
  keys.push(k(tContact, {
    drop: load - 0.09, hipYaw: -2, chestYaw: 12, lean: 8,
    rh: [0.5, -0.42, 0.4 + cf], lh: [-0.28, -0.26, 0.18], racket: R([0.9, 0.12, -0.22]), face: [0, 0.1, 1],
    rf: { at: [0.46, -0.12], yaw: 45, heel: 0.55 },
    ...(step ? { pelvis: [0.05, 0.22] as [number, number] } : {}),
  }));
  const tExt = tContact + 0.14;
  keys.push(k(tExt, {
    drop: load - 0.12, hipYaw: -25, chestYaw: -32,
    rh: [0.05, -0.08, 0.62], lh: [-0.36, -0.22, 0.05], racket: R([-0.1, 0.72, 0.68]), face: [-0.7, 0.1, 0.7],
    rf: { at: [0.42, -0.08], yaw: 20, heel: 0.85 },
    ...(step ? { pelvis: [-0.02, 0.3] as [number, number] } : {}),
  }));
  const tFinish = tExt + 0.22;
  keys.push(k(tFinish, {
    drop: Math.max(0.05, load - 0.13), hipYaw: -40, chestYaw: -68, lean: 6,
    rh: [-0.36, 0.1, 0.06], lh: [-0.3, -0.24, 0.24], racket: R([-0.32, 0.22, -0.92]), face: [-0.6, 0, -0.2],
    rf: { at: [0.36, 0.0], yaw: -10, heel: 1 },
    ...(step ? { pelvis: [-0.06, 0.32] as [number, number] } : {}),
  }));
  keys.push(k(tFinish + 0.3, { rh: [-0.34, 0.08, 0.1] }));
  const tEnd = tFinish + 0.75;
  keys.push(ready(tEnd));

  const marks = { unit: tUnit, back: tBack, contact: tContact, finish: tFinish };
  let built: Built = {
    keys, duration: tEnd + 0.15,
    stills: [
      { t: tUnit, label: 'Unit turn' }, { t: tBack, label: 'Load' }, { t: tDrop, label: 'Racket drop' },
      { t: tContact, label: 'Contact' }, { t: tFinish, label: 'Finish' },
    ],
  };
  if (o.ball) {
    built.ball = [
      { t: tUnit - 0.35, p: [0.2, 1.1, 11.5] },
      { t: tBack + 0.05, p: [0.9, 0, 2.6], arc: 1.3 },
      { t: tContact, at: 'racket', arc: 0.45 },
      { t: tContact + 0.75, p: [-0.4, 1.0, 12], arc: 0.9 },
    ];
  }
  built = withHolds(built, marks, o.hold);
  return finish(built, o.slow);
}

function finish(b: Built, slow = 1): Motion {
  return {
    duration: b.duration * slow,
    keys: retime(b.keys, slow),
    ball: b.ball ? retime(b.ball, slow) : undefined,
    stills: retime(b.stills, slow),
  };
}


/** Split step, turn and freeze in the backswing, then recover: the unit-turn reaction drill. */
export function turnFreeze(side: 'fh' | 'bh' | 'both', o: { hold?: number; ball?: boolean } = {}): Motion {
  const hold = o.hold ?? 0.6;
  const one = (t0: number, s: 'fh' | 'bh'): Key[] => {
    const sg = s === 'fh' ? 1 : -1;
    const keys: Key[] = [
      ready(t0),
      k(t0 + 0.28, { drop: 0.02, lf: { at: [-0.27, 0], lift: 0.06 }, rf: { at: [0.27, 0], lift: 0.06 } }),
      k(t0 + 0.45, { drop: 0.16, lf: { at: [-0.32, 0], lift: 0 }, rf: { at: [0.32, 0], lift: 0 } }),
    ];
    if (s === 'fh') {
      keys.push(k(t0 + 0.72, {
        drop: 0.19, hipYaw: 48, chestYaw: 90 * sg, lean: 10,
        rf: { at: [0.46, -0.12], yaw: 70 }, lf: { at: [-0.3, 0.04], yaw: 25 },
        rh: [0.34, -0.16, -0.05], lh: [0.44, -0.12, 0.26], racket: [0.2, 0.72, 0.35], face: [0.3, -0.3, 0.9],
      }));
    } else {
      keys.push(k(t0 + 0.72, {
        drop: 0.19, hipYaw: -50, chestYaw: -95, lean: 10,
        lf: { at: [-0.46, -0.12], yaw: -70 }, rf: { at: [0.3, 0.04], yaw: -25 },
        rh: [-0.3, -0.24, -0.06], lh: [-0.3, -0.16, -0.1], racket: [-0.25, 0.7, -0.4], face: [0, 0.2, -1], lPalm: [0.5, 0, 0.5],
      }));
    }
    keys.push({ ...keys[keys.length - 1], t: t0 + 0.72 + hold });
    keys.push(ready(t0 + 1.2 + hold));
    return keys;
  };
  let keys: Key[];
  let stills: Motion['stills'];
  let dur: number;
  if (side === 'both') {
    const a = one(0, 'fh');
    const b = one(1.3 + hold, 'bh').slice(1);
    keys = [...a, ...b];
    dur = 2.6 + 2 * hold;
    stills = [{ t: 0.28, label: 'Split step' }, { t: 0.72, label: 'Forehand turn' }, { t: 1.3 + hold + 0.45, label: 'Land and read' }, { t: 1.3 + hold + 0.72, label: 'Backhand turn' }];
  } else {
    keys = one(0, side);
    dur = 1.35 + hold;
    stills = [{ t: 0, label: 'Ready' }, { t: 0.28, label: 'Split step' }, { t: 0.45, label: 'Land' }, { t: 0.72, label: 'Turn and freeze' }];
  }
  const ball: BallKey[] | undefined = o.ball && side !== 'both' ? [
    { t: 0.0, p: [side === 'fh' ? 0.3 : -0.3, 1.0, 11.5] },
    { t: 0.72 + hold * 0.6, p: [side === 'fh' ? 1.0 : -1.0, 0, 3.2], arc: 1.3 },
    { t: 0.72 + hold + 0.25, p: [side === 'fh' ? 1.1 : -1.1, 0.8, 1.6], arc: 0.6 },
  ] : undefined;
  return { duration: dur, keys, ball, stills };
}

export interface BackhandOpts extends StrokeOpts { twoHands?: boolean }

export function backhand(o: BackhandOpts = {}): Motion {
  const two = !!o.twoHands;
  const load = o.load ?? 0.2;
  const turn = -(two ? 100 : 112) - (o.turn ?? 0);
  const cf = o.contactFwd ?? 0;
  const R = (v: V3): V3 | null => (o.noRacket ? null : v);
  // Left hand on the racket: a hand's width up the handle from the right.
  const L = (rh: V3, dir: V3, off = 0.09): V3 => [rh[0] + dir[0] * off, rh[1] + dir[1] * off, rh[2] + dir[2] * off];
  const keys: Key[] = [ready(0)];
  let t = 0.3;
  if (o.split !== false) {
    keys.push(k(t, { drop: 0.02, lf: { at: [-0.27, 0], lift: 0.06 }, rf: { at: [0.27, 0], lift: 0.06 } }));
    t += 0.17;
    keys.push(k(t, { drop: 0.15, lf: { at: [-0.32, 0], lift: 0 }, rf: { at: [0.32, 0], lift: 0 } }));
  }
  const tUnit = t + 0.32;
  const uDir: V3 = [-0.25, 0.72, -0.45];
  const uRh: V3 = two ? [-0.34, -0.3, -0.04] : [-0.3, -0.26, -0.06];
  keys.push(k(tUnit, {
    drop: 0.17, hipYaw: -50, chestYaw: turn + 15, lean: 10,
    lf: { at: [-0.46, -0.12], yaw: -70 }, rf: { at: [0.3, 0.04], yaw: -25 },
    rh: uRh, lh: two ? L(uRh, uDir) : [-0.3, -0.17, -0.12], racket: R(uDir), face: [0.2, 0.1, -1], lPalm: [0.6, 0, 0.4],
  }));
  const tBack = tUnit + 0.3;
  const bDir: V3 = two ? [-0.35, 0.55, -0.75] : [-0.2, 0.5, -0.85];
  const bRh: V3 = two ? [-0.3, -0.2, -0.32] : [-0.22, -0.16, -0.36];
  keys.push(k(tBack, {
    drop: load, hipYaw: -58, chestYaw: turn, lean: 9,
    rf: { at: [0.02, 0.42], yaw: -40 },
    rh: bRh, lh: two ? L(bRh, bDir) : [-0.24, -0.06, -0.38], racket: R(bDir), face: [0.3, 0.2, -0.6],
  }));
  const tDrop = tBack + 0.22;
  const dDir: V3 = [-0.3, -0.55, -0.78];
  const dRh: V3 = two ? [-0.3, -0.42, -0.2] : [-0.2, -0.45, -0.24];
  keys.push(k(tDrop, {
    drop: load - 0.02, hipYaw: -40, chestYaw: turn + 20,
    rh: dRh, lh: two ? L(dRh, dDir) : [-0.36, -0.2, -0.32], racket: R(dDir), face: [0, -0.9, 0.3],
  }));
  const tContact = tDrop + 0.17;
  const cDir: V3 = two ? [-0.92, 0.1, -0.15] : [-0.93, 0.05, 0.05];
  const cRh: V3 = two ? [-0.02, -0.46, 0.44 + cf] : [0.16, -0.44, 0.48 + cf];
  keys.push(k(tContact, {
    drop: load - 0.09, hipYaw: two ? -12 : -38, chestYaw: two ? -28 : -78, lean: 8,
    lf: { at: [-0.46, -0.12], yaw: -55, heel: 0.45 },
    rh: cRh, lh: two ? L(cRh, cDir) : [-0.56, -0.18, -0.34], racket: R(cDir), face: [0, 0.1, 1],
    rPole: two ? undefined : [0.3, -0.6, -0.5],
  }));
  const tExt = tContact + 0.14;
  const eDir: V3 = two ? [0.2, 0.72, 0.65] : [0.05, 0.75, 0.66];
  const eRh: V3 = two ? [0.06, -0.06, 0.58] : [0.38, -0.06, 0.44];
  keys.push(k(tExt, {
    drop: load - 0.12, hipYaw: two ? 10 : -32, chestYaw: two ? 15 : -68,
    lf: { at: [-0.42, -0.08], yaw: -20, heel: 0.8 },
    rh: eRh, lh: two ? L(eRh, eDir) : [-0.6, -0.1, -0.36], racket: R(eDir), face: [0.7, 0.1, 0.7],
  }));
  const tFinish = tExt + 0.22;
  const fDir: V3 = two ? [0.35, 0.25, -0.9] : [0.25, 0.85, -0.45];
  const fRh: V3 = two ? [0.34, 0.1, 0.08] : [0.48, 0.24, 0.18];
  keys.push(k(tFinish, {
    drop: Math.max(0.05, load - 0.13), hipYaw: two ? 35 : -28, chestYaw: two ? 62 : -58, lean: 6,
    lf: { at: [-0.36, 0.0], yaw: 10, heel: 1 },
    rh: fRh, lh: two ? L(fRh, fDir) : [-0.62, -0.08, -0.38], racket: R(fDir), face: [0.6, 0, 0.2],
  }));
  keys.push(k(tFinish + 0.3, {}));
  const tEnd = tFinish + 0.75;
  keys.push(ready(tEnd));
  const marks = { unit: tUnit, back: tBack, contact: tContact, finish: tFinish };
  let built: Built = {
    keys, duration: tEnd + 0.15,
    stills: [
      { t: tUnit, label: 'Unit turn' }, { t: tBack, label: 'Load' }, { t: tDrop, label: 'Racket drop' },
      { t: tContact, label: 'Contact' }, { t: tFinish, label: 'Finish' },
    ],
  };
  if (o.ball) {
    built.ball = [
      { t: tUnit - 0.35, p: [-0.2, 1.1, 11.5] },
      { t: tBack + 0.05, p: [-0.9, 0, 2.6], arc: 1.3 },
      { t: tContact, at: 'racket', arc: 0.45 },
      { t: tContact + 0.75, p: [0.4, 1.0, 12], arc: 0.9 },
    ];
  }
  built = withHolds(built, marks, o.hold);
  return finish(built, o.slow);
}

export interface ServeOpts {
  hold?: { at: 'trophy' | 'drop' | 'contact' | 'finish'; for: number }[];
  /** Knee bend in the trophy (m). */
  load?: number;
  /** Toss only: toss, hold the arm up, catch. */
  tossOnly?: boolean;
  slow?: number;
  /** Jump height at contact (m). */
  jump?: number;
}

const SERVE_START: Pose = {
  drop: 0.03, hipYaw: 62, chestYaw: 78, lean: 2, tilt: 0,
  lf: { at: [-0.05, 0.18], yaw: 45, lift: 0, heel: 0 }, rf: { at: [0.33, -0.22], yaw: 92, lift: 0, heel: 0 },
  rh: [0.34, -0.34, 0.12], lh: [0.38, -0.31, 0.2], racket: [0.3, 0.35, 0.88], face: [0.9, 0, -0.2],
};

export function serve(o: ServeOpts = {}): Motion {
  const load = o.load ?? 0.2;
  const jump = o.jump ?? 0.1;
  const keys: Key[] = [k(0, SERVE_START), k(0.35, {})];
  const tToss = 0.85;
  keys.push(k(tToss, {
    drop: load * 0.4, hipYaw: 68, chestYaw: 90, tilt: 10, lean: -3,
    rh: [0.4, -0.15, -0.3], lh: [0.12, 0.42, 0.2], racket: [0.3, 0.55, -0.75], face: [0.6, 0, 0.6],
    pelvis: [0.12, 0.0],
  }));
  const tTrophy = 1.12;
  keys.push(k(tTrophy, {
    drop: load, hipYaw: 70, chestYaw: 100, tilt: 26, lean: -10,
    rh: [0.3, 0.2, -0.2], lh: [0.0, 0.53, 0.18], racket: [0.15, 0.95, -0.15], face: [0.6, 0, 0.7],
    rPole: [0.6, -0.1, -0.5], pelvis: [0.2, 0.12], look: [10, 62],
  }));
  if (o.tossOnly) {
    keys.push(k(tTrophy + 0.85, { look: [10, 55] }));
    keys.push(k(tTrophy + 1.35, { ...SERVE_START, look: [20, 10] }));
    keys.push(k(tTrophy + 1.7, SERVE_START));
    const ball: BallKey[] = [
      { t: 0, at: 'lh', hold: true }, { t: tToss, at: 'lh' },
      { t: tTrophy + 0.25, p: [0.12, 3.05, 0.42], arc: 0.25 },
      { t: tTrophy + 0.85, at: 'lh', arc: 0.05, hold: true },
      { t: tTrophy + 1.7, at: 'lh' },
    ];
    return { duration: tTrophy + 1.7, keys, ball, stills: [{ t: 0.35, label: 'Start' }, { t: tToss, label: 'Release high' }, { t: tTrophy, label: 'Arm up, watch the ball' }, { t: tTrophy + 0.85, label: 'Catch it above your head' }] };
  }
  const tDrop = tTrophy + 0.24;
  keys.push(k(tDrop, {
    drop: load * 0.35, hipYaw: 50, chestYaw: 70, tilt: 14, lean: -6,
    rh: [0.32, 0.12, -0.22], lh: [0.18, 0.0, 0.32], racket: [0.1, -0.95, -0.25], face: [-0.2, 0, -1],
    rPole: [0.7, 0.3, 0.2], lf: { at: [-0.05, 0.18], heel: 0.6 }, rf: { at: [0.3, -0.18], yaw: 80, heel: 0.6 }, look: [8, 55],
  }));
  const tContact = tDrop + 0.13;
  keys.push(k(tContact, {
    drop: -0.02, hipYaw: 25, chestYaw: 18, tilt: -20, lean: 8,
    rh: [0.06, 0.55, 0.2], lh: [-0.22, -0.18, 0.2], racket: [0.05, 0.85, 0.5], face: [0, 0.3, 1],
    lf: { at: [-0.02, 0.28], lift: jump, heel: 1, yaw: 30 }, rf: { at: [0.18, -0.02], lift: jump, heel: 1, yaw: 50 },
    pelvis: [0.08, 0.3], look: [4, 50],
  }));
  const tFollow = tContact + 0.2;
  keys.push(k(tFollow, {
    drop: 0.12, hipYaw: -10, chestYaw: -35, tilt: 0, lean: 32,
    rh: [-0.3, -0.5, 0.32], lh: [-0.3, -0.25, 0.1], racket: [-0.55, -0.55, 0.4], face: [-0.8, 0, 0.3],
    lf: { at: [0.0, 0.62], lift: 0, heel: 0, yaw: 10 }, rf: { at: [0.26, 0.2], lift: 0.22, heel: 1, yaw: 20 },
    pelvis: [0.06, 0.55], look: [0, -5],
  }));
  const tLand = tFollow + 0.28;
  keys.push(k(tLand, {
    drop: 0.12, hipYaw: -5, chestYaw: -20, lean: 18,
    rh: [-0.25, -0.45, 0.3], racket: [-0.45, -0.3, 0.6],
    rf: { at: [0.32, 0.55], lift: 0, heel: 0, yaw: 10 }, lf: { at: [-0.25, 0.65], yaw: -5 }, pelvis: [0.04, 0.6],
  }));
  keys.push(k(tLand + 0.6, { ...READY, lf: { at: [-0.28, 0.6], yaw: -8 }, rf: { at: [0.28, 0.6], yaw: 8 }, pelvis: [0, 0.6] }));
  const tEnd = tLand + 1.05;
  keys.push(k(tEnd, SERVE_START));
  let built: Built = {
    keys, duration: tEnd,
    ball: [
      { t: 0, at: 'lh', hold: true }, { t: tToss, at: 'lh' },
      { t: tContact, at: 'racket', arc: 0.42 },
      { t: tContact + 0.55, p: [-0.3, 0.2, 9], arc: -0.2 },
    ],
    stills: [
      { t: 0.35, label: 'Start' }, { t: tToss, label: 'Toss' }, { t: tTrophy, label: 'Trophy' },
      { t: tDrop, label: 'Racket drop' }, { t: tContact, label: 'Contact' }, { t: tFollow, label: 'Finish' },
    ],
  };
  built = withHolds(built, { trophy: tTrophy, drop: tDrop, contact: tContact, finish: tFollow }, o.hold);
  return finish(built, o.slow);
}

// ---------- off-court exercises ----------

/** Squats: bodyweight, jump or split (lunge) squats. */
export function squat(o: { kind?: 'squat' | 'jump' | 'split' | 'lateral'; reps?: number; depth?: number } = {}): Motion {
  const kind = o.kind ?? 'squat';
  const reps = o.reps ?? 2;
  const depth = o.depth ?? 0.36;
  const base: Pose = kind === 'split'
    ? { ...STAND, lf: { at: [-0.14, 0.38], yaw: -4, lift: 0, heel: 0 }, rf: { at: [0.14, -0.4], yaw: 6, lift: 0, heel: 0.75 }, rh: [0.22, -0.5, 0.05], lh: [-0.22, -0.5, 0.05] }
    : kind === 'lateral' ? { ...STAND, lf: { at: [-0.45, 0], yaw: -15, lift: 0, heel: 0 }, rf: { at: [0.45, 0], yaw: 15, lift: 0, heel: 0 } }
    : { ...STAND, lf: { at: [-0.2, 0], yaw: -14, lift: 0, heel: 0 }, rf: { at: [0.2, 0], yaw: 14, lift: 0, heel: 0 } };
  const keys: Key[] = [k(0, base), k(0.3, {})];
  const stills: Motion['stills'] = [{ t: 0.3, label: 'Tall start' }];
  let t = 0.3;
  for (let r = 0; r < reps; r++) {
    const down = t + 0.85;
    if (kind === 'lateral') {
      const right = r % 2 === 0;
      keys.push(k(down, { drop: depth * 0.9, lean: 22, pelvis: [right ? 0.3 : -0.3, 0], hipYaw: 0, rh: [0.12, -0.25, 0.42], lh: [-0.12, -0.25, 0.42] }));
    } else if (kind === 'split') {
      keys.push(k(down, { drop: depth, lean: 4, pelvis: [0, -0.02], rh: [0.22, -0.5, 0.08], lh: [-0.22, -0.5, 0.08] }));
    } else {
      keys.push(k(down, { drop: depth, lean: 30, rh: [0.14, -0.08, 0.5], lh: [-0.14, -0.08, 0.5] }));
    }
    keys.push(k(down + 0.25, {}));
    if (r === 0) stills.push({ t: down, label: kind === 'lateral' ? 'Sit into one hip' : 'Hips back and down' });
    if (kind === 'jump') {
      const air = down + 0.55;
      keys.push(k(air, { drop: -0.02, lean: 2, rh: [0.25, 0.3, 0.1], lh: [-0.25, 0.3, 0.1], lf: { at: [-0.2, 0], lift: 0.28, heel: 1 }, rf: { at: [0.2, 0], lift: 0.28, heel: 1 } }));
      keys.push(k(air + 0.35, { drop: 0.16, lean: 18, rh: [0.2, -0.3, 0.3], lh: [-0.2, -0.3, 0.3], lf: { at: [-0.2, 0], lift: 0, heel: 0 }, rf: { at: [0.2, 0], lift: 0, heel: 0 } }));
      if (r === 0) stills.push({ t: air, label: 'Explode up' }, { t: air + 0.35, label: 'Land soft' });
      t = air + 0.9;
      keys.push(k(t, { ...base, lf: base.lf, rf: base.rf }));
    } else {
      t = down + 1.0;
      keys.push(k(t, { drop: 0, lean: 3, pelvis: undefined, rh: base.rh, lh: base.lh }));
      if (r === 0) stills.push({ t, label: 'Drive up tall' });
    }
  }
  keys.push(k(t + 0.3, {}));
  return { duration: t + 0.3, keys, stills };
}

/**
 * Medicine-ball rotational throw from a groundstroke stance: load the back hip, let the hips start,
 * the trunk follows and the arms release last.
 */
export function medThrow(side: 'fh' | 'bh' = 'fh', o: { step?: boolean } = {}): Motion {
  const s = side === 'fh' ? 1 : -1;
  const X = (v: V3): V3 => [v[0] * s, v[1], v[2]];
  const start: Pose = {
    drop: 0.12, hipYaw: 0, chestYaw: 0, lean: 8, tilt: 0,
    lf: { at: [-0.32, 0], yaw: -8, lift: 0, heel: 0 }, rf: { at: [0.32, 0], yaw: 8, lift: 0, heel: 0 },
    rh: [0.1, -0.35, 0.3], lh: [-0.1, -0.35, 0.3], racket: null,
  };
  const keys: Key[] = [k(0, start), k(0.4, {})];
  keys.push(k(1.2, {
    drop: 0.24, hipYaw: 45 * s, chestYaw: 95 * s, lean: 10,
    ...(side === 'fh' ? { rf: { at: [0.42, -0.1], yaw: 60 } } : { lf: { at: [-0.42, -0.1], yaw: -60 } }),
    ...(o.step ? (side === 'fh' ? { lf: { at: [-0.1, 0.4], yaw: 45 } } : { rf: { at: [0.1, 0.4], yaw: -45 } }) : {}),
    rh: X([0.42, -0.42, -0.05]), lh: X([0.34, -0.4, -0.12]),
  }));
  keys.push(k(1.45, { hipYaw: 15 * s, chestYaw: 70 * s, drop: 0.22, rh: X([0.42, -0.42, 0.05]), lh: X([0.34, -0.4, -0.02]) }));
  keys.push(k(1.62, {
    hipYaw: -25 * s, chestYaw: -15 * s, drop: 0.14, lean: 6,
    rh: X([0.05, -0.2, 0.55]), lh: X([-0.08, -0.22, 0.53]),
    ...(side === 'fh' ? { rf: { at: [0.42, -0.1], yaw: 30, heel: 0.7 } } : { lf: { at: [-0.42, -0.1], yaw: -30, heel: 0.7 } }),
  }));
  keys.push(k(1.85, { hipYaw: -40 * s, chestYaw: -55 * s, drop: 0.1, rh: X([-0.28, -0.12, 0.42]), lh: X([-0.42, -0.14, 0.3]), ...(side === 'fh' ? { rf: { at: [0.36, 0], yaw: -5, heel: 1 } } : { lf: { at: [-0.36, 0], yaw: 5, heel: 1 } }) }));
  keys.push(k(2.3, {}));
  keys.push(k(3.0, start));
  return {
    duration: 3.2, keys,
    props: [{ kind: 'medball', from: 0, to: 1.62, flight: [{ t: 1.62, at: 'hands' }, { t: 2.25, p: [-0.6 * s, 1.0, 4.2], arc: 0.35 }, { t: 2.6, p: [-0.75 * s, 0.12, 3.6], arc: 0.25 }] }, { kind: 'wall', p: [0, 0, 4.6], size: 5 }],
    stills: [{ t: 0.4, label: 'Athletic stance' }, { t: 1.2, label: 'Load the back hip' }, { t: 1.45, label: 'Hips start first' }, { t: 1.62, label: 'Release out front' }, { t: 1.85, label: 'Finish facing the wall' }],
  };
}

/** Overhead medicine-ball throw: knee bend, arch, explode up and forward (serve chain). */
export function medOverhead(): Motion {
  const start: Pose = { ...STAND, lf: { at: [-0.12, 0.2], yaw: 0, lift: 0, heel: 0 }, rf: { at: [0.2, -0.2], yaw: 20, lift: 0, heel: 0 }, rh: [0.1, -0.3, 0.35], lh: [-0.1, -0.3, 0.35] };
  const keys: Key[] = [k(0, start), k(0.4, {})];
  keys.push(k(1.2, { drop: 0.22, lean: -14, rh: [0.11, 0.38, -0.12], lh: [-0.11, 0.38, -0.12], look: [0, 15] }));
  keys.push(k(1.45, { drop: 0.03, lean: 4, rh: [0.11, 0.5, 0.15], lh: [-0.11, 0.5, 0.15], rf: { at: [0.2, -0.2], heel: 0.9 }, lf: { at: [-0.12, 0.2], heel: 0.5 }, look: [0, 10] }));
  keys.push(k(1.62, { drop: 0.06, lean: 24, rh: [0.12, -0.05, 0.55], lh: [-0.12, -0.05, 0.55], rf: { at: [0.2, -0.05], heel: 1, lift: 0.04 }, look: [0, 0] }));
  keys.push(k(2.0, { drop: 0.1, lean: 16, rh: [0.15, -0.35, 0.4], lh: [-0.15, -0.35, 0.4], rf: { at: [0.18, 0.22], heel: 0, lift: 0 } }));
  keys.push(k(2.8, start));
  return {
    duration: 3.0, keys,
    props: [{ kind: 'medball', from: 0, to: 1.5, flight: [{ t: 1.5, at: 'hands' }, { t: 2.2, p: [0, 1.5, 4.4], arc: 0.4 }, { t: 2.6, p: [0, 0.12, 3.8], arc: 0.2 }] }, { kind: 'wall', p: [0, 0, 4.6], size: 5 }],
    stills: [{ t: 0.4, label: 'Start' }, { t: 1.2, label: 'Bend and arch' }, { t: 1.45, label: 'Drive up from the legs' }, { t: 1.62, label: 'Release high and forward' }],
  };
}

/** Banded trunk rotation: arms long, hips quiet, shoulders turn against the band. */
export function bandTurn(o: { side?: 'fh' | 'bh'; hipsQuiet?: boolean } = {}): Motion {
  const s = (o.side ?? 'fh') === 'fh' ? 1 : -1;
  const hips = o.hipsQuiet === false ? 1 : 0.25;
  const start: Pose = {
    drop: 0.12, hipYaw: 60 * s * hips, chestYaw: 80 * s, lean: 6, tilt: 0,
    lf: { at: [-0.3, 0], yaw: -5, lift: 0, heel: 0 }, rf: { at: [0.3, 0], yaw: 5, lift: 0, heel: 0 },
    rh: [0.52 * s, -0.22, 0.05], lh: [0.5 * s, -0.24, 0.0], racket: null,
  };
  const keys: Key[] = [k(0, start), k(0.4, {})];
  keys.push(k(1.25, { hipYaw: -20 * s * hips, chestYaw: -30 * s, rh: [-0.25 * s, -0.22, 0.48], lh: [-0.3 * s, -0.24, 0.45], ...(s > 0 ? { rf: { at: [0.3, 0], yaw: -10, heel: 0.6 } } : { lf: { at: [-0.3, 0], yaw: 10, heel: 0.6 } }) }));
  keys.push(k(1.55, {}));
  keys.push(k(2.5, start));
  return {
    duration: 2.7, keys,
    props: [{ kind: 'band', p: [1.6 * s, 1.15, 0.05], hold: 'hands' }],
    stills: [{ t: 0.4, label: 'Coiled against the band' }, { t: 0.85, label: 'Hips lead' }, { t: 1.25, label: 'Shoulders follow' }, { t: 2.0, label: 'Slow return' }],
  };
}

/** Hips square, arms crossed on the chest, turn only the shoulders. */
export function seatedTurn(o: { lunge?: boolean } = {}): Motion {
  const start: Pose = o.lunge
    ? { ...STAND, drop: 0.32, lean: 0, lf: { at: [-0.14, 0.42], yaw: 0, lift: 0, heel: 0 }, rf: { at: [0.14, -0.42], yaw: 5, lift: 0, heel: 0.8 }, rh: [-0.16, -0.08, 0.14], lh: [0.16, -0.08, 0.14] }
    : { ...STAND, drop: 0.12, lean: 8, lf: { at: [-0.28, 0], yaw: -8, lift: 0, heel: 0 }, rf: { at: [0.28, 0], yaw: 8, lift: 0, heel: 0 }, rh: [-0.16, -0.08, 0.14], lh: [0.16, -0.08, 0.14] };
  const keys: Key[] = [k(0, start), k(0.3, {})];
  keys.push(k(1.1, { chestYaw: 60, hipYaw: 8, rh: [-0.16, -0.08, 0.14], lh: [0.16, -0.08, 0.14] }));
  keys.push(k(1.5, {}));
  keys.push(k(2.4, { chestYaw: -60, hipYaw: -8 }));
  keys.push(k(2.8, {}));
  keys.push(k(3.5, { chestYaw: 0, hipYaw: 0 }));
  return { duration: 3.6, keys, stills: [{ t: 0.3, label: 'Hips square' }, { t: 1.1, label: 'Turn right, hips still' }, { t: 2.4, label: 'Turn left, hips still' }] };
}

/** Low lateral shuffle between two cones and back. */
export function shuffle(): Motion {
  const low = 0.24;
  const pose = (x: number, wide: number): Partial<Pose> => ({ pelvis: [x, 0], lf: { at: [x - wide, 0], yaw: -10 }, rf: { at: [x + wide, 0], yaw: 10 } });
  const base: Pose = { ...READY, drop: low, lean: 18 };
  const keys: Key[] = [k(0, { ...base, ...pose(0, 0.34) })];
  let t = 0;
  const path = [0.7, 1.4, 0.7, 0, -0.7, -1.4, -0.7, 0];
  let x = 0;
  for (const nx of path) {
    const dir = Math.sign(nx - x);
    // Lead foot out, trail foot follows: never cross, stay low.
    t += 0.2;
    keys.push(k(t, dir > 0 ? { pelvis: [x + 0.18 * dir, 0], rf: { at: [x + 0.62, 0], lift: 0.04, yaw: 10 } } : { pelvis: [x + 0.18 * dir, 0], lf: { at: [x - 0.62, 0], lift: 0.04, yaw: -10 } }));
    t += 0.16;
    keys.push(k(t, { pelvis: [nx, 0], lf: { at: [nx - 0.32, 0], lift: 0, yaw: -10 }, rf: { at: [nx + 0.32, 0], lift: 0, yaw: 10 } }));
    x = nx;
  }
  keys.push(k(t + 0.3, {}));
  return {
    duration: t + 0.3, keys,
    props: [{ kind: 'cone', p: [-1.8, 0, 0] }, { kind: 'cone', p: [1.8, 0, 0] }],
    stills: [{ t: 0, label: 'Low, wide base' }, { t: 0.2, label: 'Push off, lead foot out' }, { t: 0.36, label: 'Trail foot follows' }, { t: 1.08, label: 'Stay low at the cone' }],
  };
}

// ---------- table tennis strokes ----------
// The table's near end line is 0.5 m in front of the drill spot, its top 0.76 m up (about 0.64 m
// below the shoulder centre), the net 1.87 m ahead.

/** Table tennis ready stance: knees bent, leaning over the table, bat in front at waist height. */
const TT_READY: Pose = {
  drop: 0.14, hipYaw: 0, chestYaw: 0, lean: 20, tilt: 0,
  lf: { at: [-0.3, 0.04], yaw: -10, lift: 0, heel: 0 }, rf: { at: [0.3, -0.06], yaw: 10, lift: 0, heel: 0 },
  rh: [0.18, -0.36, 0.36], lh: [-0.2, -0.36, 0.32],
  racket: [-0.25, 0.45, 0.85], face: [0.1, 0, 1],
};
const ttReady = (t: number, extra: Partial<Pose> = {}): Key => k(t, { ...TT_READY, ...extra });

export interface TTOpts {
  ball?: boolean;
  hold?: { at: 'back' | 'contact' | 'finish'; for: number }[];
  slow?: number;
  /** Extra knee bend (m). */
  load?: number;
  /** Shadow without a bat. */
  noRacket?: boolean;
}

/** Forehand topspin loop: waist turns back with the bat low, then up and forward, finishing at the forehead. */
export function ttForehand(o: TTOpts = {}): Motion {
  const load = 0.2 + (o.load ?? 0);
  const R = (v: V3): V3 | null => (o.noRacket ? null : v);
  const keys: Key[] = [ttReady(0), ttReady(0.35)];
  const tBack = 0.75;
  keys.push(k(tBack, {
    drop: load, hipYaw: 30, chestYaw: 55, lean: 22, tilt: 8,
    rf: { at: [0.34, -0.12], yaw: 30, heel: 0 },
    rh: [0.42, -0.6, -0.02], lh: [0.0, -0.25, 0.35], racket: R([0.4, -0.25, 0.5]), face: [-0.1, -0.35, 0.95],
  }));
  const tContact = tBack + 0.2;
  keys.push(k(tContact, {
    drop: load - 0.05, hipYaw: 5, chestYaw: 12, lean: 18, tilt: 0,
    rh: [0.36, -0.3, 0.42], lh: [-0.15, -0.3, 0.3], racket: R([-0.2, 0.55, 0.8]), face: [-0.2, -0.4, 0.9],
    rf: { at: [0.34, -0.12], yaw: 20, heel: 0.3 },
  }));
  const tFinish = tContact + 0.15;
  keys.push(k(tFinish, {
    drop: load - 0.07, hipYaw: -15, chestYaw: -28, lean: 16,
    rh: [0.0, 0.12, 0.42], lh: [-0.25, -0.32, 0.2], racket: R([-0.55, 0.75, 0.35]), face: [-0.55, -0.3, 0.75],
    rf: { at: [0.34, -0.12], yaw: 10, heel: 0.5 },
  }));
  keys.push(ttReady(tFinish + 0.45));
  let built: Built = {
    keys, duration: tFinish + 0.6,
    stills: [{ t: 0.35, label: 'Ready' }, { t: tBack, label: 'Backswing, bat low' }, { t: tContact, label: 'Contact in front' }, { t: tFinish, label: 'Finish at forehead' }],
  };
  if (o.ball) {
    built.ball = [
      { t: tBack - 0.55, p: [-0.2, 0.95, 3.2] },
      { t: tBack - 0.05, p: [0.35, 0.78, 0.85], arc: 0.25 },
      { t: tContact, at: 'racket', arc: 0.25 },
      { t: tContact + 0.42, p: [-0.2, 0.78, 3.0], arc: 0.35 },
    ];
  }
  built = withHolds(built, { back: tBack, contact: tContact, finish: tFinish }, o.hold);
  return finish(built, o.slow);
}

/** Backhand loop / drive: square to the table, bat back to the belly, elbow forward, flick forward and up from the forearm. */
export function ttBackhand(o: TTOpts = {}): Motion {
  const load = 0.18 + (o.load ?? 0);
  const R = (v: V3): V3 | null => (o.noRacket ? null : v);
  const keys: Key[] = [ttReady(0), ttReady(0.35)];
  const tBack = 0.72;
  keys.push(k(tBack, {
    drop: load, hipYaw: -8, chestYaw: -18, lean: 24,
    rh: [-0.02, -0.5, 0.2], lh: [-0.3, -0.36, 0.25], racket: R([-0.8, -0.35, 0.3]), face: [0.1, -0.3, 0.95], rPole: [0.6, -0.2, 0.6],
  }));
  const tContact = tBack + 0.16;
  keys.push(k(tContact, {
    drop: load - 0.04, hipYaw: 0, chestYaw: -4, lean: 20,
    rh: [0.05, -0.3, 0.5], racket: R([-0.75, 0.35, 0.45]), face: [0.1, -0.4, 0.9], rPole: [0.7, -0.2, 0.4],
  }));
  const tFinish = tContact + 0.14;
  keys.push(k(tFinish, {
    drop: load - 0.06, hipYaw: 4, chestYaw: 6, lean: 17,
    rh: [0.22, -0.05, 0.58], racket: R([-0.2, 0.85, 0.45]), face: [0.3, -0.2, 0.9], rPole: [0.8, -0.1, 0.2],
  }));
  keys.push(ttReady(tFinish + 0.45));
  let built: Built = {
    keys, duration: tFinish + 0.6,
    stills: [{ t: 0.35, label: 'Ready' }, { t: tBack, label: 'Bat back to the belly' }, { t: tContact, label: 'Contact in front' }, { t: tFinish, label: 'Finish to the target' }],
  };
  if (o.ball) {
    built.ball = [
      { t: tBack - 0.5, p: [0.1, 0.95, 3.2] },
      { t: tBack, p: [0.0, 0.78, 0.9], arc: 0.25 },
      { t: tContact, at: 'racket', arc: 0.2 },
      { t: tContact + 0.42, p: [0.25, 0.78, 3.0], arc: 0.3 },
    ];
  }
  built = withHolds(built, { back: tBack, contact: tContact, finish: tFinish }, o.hold);
  return finish(built, o.slow);
}

/** Forehand push (or flick with `flick`): step in under the table, meet the ball early and short. */
export function ttPush(o: TTOpts & { flick?: boolean; side?: 'fh' | 'bh' } = {}): Motion {
  const bh = o.side === 'bh';
  const R = (v: V3): V3 | null => (o.noRacket ? null : v);
  const keys: Key[] = [ttReady(0), ttReady(0.3)];
  const tStep = 0.6;
  const stepIn = { rf: { at: [bh ? 0.05 : 0.22, 0.42] as [number, number], yaw: 0, heel: 0 }, pelvis: [0.05, 0.18] as [number, number] };
  keys.push(k(tStep, {
    drop: 0.22, lean: 30, ...stepIn,
    rh: bh ? [0.0, -0.42, 0.5] : [0.25, -0.42, 0.5], racket: R(bh ? [-0.8, 0.0, 0.55] : [0.1, 0.1, 1]), face: o.flick ? [0, -0.3, 1] : [0, 0.7, 0.7],
  }));
  const tContact = tStep + 0.14;
  keys.push(k(tContact, {
    drop: 0.22, lean: 32,
    rh: bh ? [0.05, o.flick ? -0.32 : -0.44, 0.66] : [0.25, o.flick ? -0.32 : -0.44, 0.68],
    racket: R(bh ? (o.flick ? [-0.6, 0.5, 0.6] : [-0.75, 0.05, 0.65]) : (o.flick ? [-0.3, 0.6, 0.75] : [0.0, 0.05, 1])), face: o.flick ? [0, -0.2, 1] : [0, 0.75, 0.65],
  }));
  const tFinish = tContact + 0.12;
  keys.push(k(tFinish, {
    rh: bh ? [0.12, o.flick ? -0.18 : -0.44, 0.74] : [0.2, o.flick ? -0.15 : -0.44, 0.76],
    racket: R(bh ? [-0.4, 0.6, 0.7] : (o.flick ? [-0.55, 0.65, 0.5] : [-0.1, 0.15, 1])),
  }));
  keys.push(ttReady(tFinish + 0.5));
  let built: Built = {
    keys, duration: tFinish + 0.65,
    stills: [{ t: 0.3, label: 'Ready' }, { t: tStep, label: 'Step in under the table' }, { t: tContact, label: o.flick ? 'Flick at the top of the bounce' : 'Contact early, open bat' }, { t: tFinish, label: 'Short finish' }],
  };
  if (o.ball) {
    built.ball = [
      { t: 0.1, p: [0.0, 0.95, 2.6] },
      { t: tStep - 0.02, p: [bh ? 0.0 : 0.2, 0.78, 1.2], arc: 0.15 },
      { t: tContact, at: 'racket', arc: 0.06 },
      { t: tContact + 0.4, p: [0.0, 0.78, 2.4], arc: o.flick ? 0.18 : 0.12 },
    ];
  }
  built = withHolds(built, { back: tStep, contact: tContact, finish: tFinish }, o.hold);
  return finish(built, o.slow);
}

/** Forehand pendulum serve: open-palm toss of at least 16 cm, strike low on the way down, short finish. */
export function ttServe(o: TTOpts & { tossOnly?: boolean } = {}): Motion {
  const R = (v: V3): V3 | null => (o.noRacket ? null : v);
  const start: Pose = {
    ...TT_READY, hipYaw: 40, chestYaw: 55, lean: 22,
    lf: { at: [-0.1, 0.25], yaw: 20, lift: 0, heel: 0 }, rf: { at: [0.32, -0.15], yaw: 70, lift: 0, heel: 0 },
    rh: [0.3, -0.38, 0.1], lh: [0.0, -0.42, 0.42], lPalm: [0, 1, 0], racket: R([0.1, 0.4, 0.9]), face: [0.8, 0, -0.4],
  };
  const keys: Key[] = [k(0, start), k(0.5, {})];
  const tToss = 0.75;
  keys.push(k(tToss, { lh: [0.0, -0.25, 0.42], rh: [0.42, -0.25, -0.05], racket: R([0.3, 0.55, -0.3]) }));
  const tTop = 1.05;
  keys.push(k(tTop, { drop: 0.2, lh: [-0.05, -0.35, 0.35], rh: [0.48, -0.22, -0.12], racket: R([0.25, 0.6, -0.4]), face: [0.8, 0.2, 0.4] }));
  const tContact = 1.32;
  keys.push(k(tContact, {
    drop: 0.24, chestYaw: 40,
    rh: [0.12, -0.48, 0.3], racket: R([-0.85, 0.1, 0.4]), face: [0.1, -0.5, 0.85],
  }));
  const tFinish = tContact + 0.12;
  keys.push(k(tFinish, { rh: [-0.05, -0.45, 0.32], racket: R([-0.85, -0.2, 0.35]), chestYaw: 30 }));
  keys.push(ttReady(tFinish + 0.55));
  const ball: BallKey[] = [
    { t: 0, at: 'lh', hold: true }, { t: tToss, at: 'lh' },
    { t: tTop, p: [0.06, 1.25, 0.5], arc: 0.05 },
  ];
  if (o.tossOnly) {
    ball.push({ t: tContact + 0.05, at: 'lh', arc: 0.02 });
    return { duration: tContact + 0.5, keys: keys.slice(0, 4), ball, stills: [{ t: 0.5, label: 'Ball on a flat palm' }, { t: tToss, label: 'Toss straight up' }, { t: tTop, label: 'At least 16 cm' }] };
  }
  ball.push({ t: tContact, at: 'racket', arc: 0.0 }, { t: tContact + 0.2, p: [0.0, 0.78, 0.9], arc: 0.08 }, { t: tContact + 0.55, p: [-0.15, 0.78, 2.4], arc: 0.18 });
  let built: Built = {
    keys, duration: tFinish + 0.7, ball,
    stills: [{ t: 0.5, label: 'Ball on a flat palm' }, { t: tTop, label: 'Toss at least 16 cm' }, { t: tContact, label: 'Contact low, brush the ball' }, { t: tFinish, label: 'Short finish' }],
  };
  built = withHolds(built, { contact: tContact, finish: tFinish, back: tTop }, o.hold);
  return finish(built, o.slow);
}

/** Falkenberg footwork: backhand, forehand from the backhand corner, forehand from the wide forehand. */
export function ttFalkenberg(o: TTOpts = {}): Motion {
  const R = (v: V3): V3 | null => (o.noRacket ? null : v);
  const keys: Key[] = [ttReady(0)];
  let t = 0.25;
  const at = (x: number) => ({ pelvis: [x, 0] as [number, number], lf: { at: [x - 0.3, 0.04] as [number, number], yaw: -10 }, rf: { at: [x + 0.3, -0.06] as [number, number], yaw: 10 } });
  // Backhand from the backhand corner.
  keys.push(k(t, { ...at(-0.3), rh: [-0.02, -0.5, 0.2], racket: R([-0.8, -0.35, 0.3]) }));
  t += 0.15; keys.push(k(t, { rh: [0.2, -0.1, 0.55], racket: R([-0.2, 0.85, 0.45]) }));
  // Step round the corner, forehand.
  t += 0.35; keys.push(k(t, { ...at(-0.75), hipYaw: 30, chestYaw: 55, rh: [0.42, -0.6, -0.02], racket: R([0.4, -0.25, 0.5]) }));
  t += 0.18; keys.push(k(t, { hipYaw: -15, chestYaw: -28, rh: [0.0, 0.12, 0.42], racket: R([-0.55, 0.75, 0.35]) }));
  // Cross over to the wide forehand.
  t += 0.45; keys.push(k(t, { ...at(0.55), hipYaw: 30, chestYaw: 55, rh: [0.42, -0.6, -0.02], racket: R([0.4, -0.25, 0.5]) }));
  t += 0.18; keys.push(k(t, { hipYaw: -15, chestYaw: -28, rh: [0.0, 0.12, 0.42], racket: R([-0.55, 0.75, 0.35]) }));
  t += 0.45; keys.push(ttReady(t, at(-0.3)));
  return finish({
    keys, duration: t + 0.2,
    stills: [{ t: 0.4, label: 'Backhand' }, { t: 0.93, label: 'Forehand from the backhand corner' }, { t: 1.56, label: 'Forehand from the wide forehand' }, { t: t, label: 'Back to the backhand corner' }],
  }, o.slow);
}

export { READY, STAND, TT_READY };
export type { Prop };
