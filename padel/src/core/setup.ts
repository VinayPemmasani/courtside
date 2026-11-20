import type { PoseFrame } from './types';

/**
 * Setup check: how well the clip was filmed for analysis. Most wrong numbers come from the
 * camera, not the player, so after each analysis Vidrio scores the filming and says what to
 * change next time.
 */

export type SetupIssueId = 'not-found' | 'cut-off' | 'too-small' | 'too-big' | 'low-fps' | 'tilted' | 'jumpy';

export interface SetupIssue {
  id: SetupIssueId;
  /** What was seen. */
  problem: string;
  /** What to change next time. */
  fix: string;
  severity: 'high' | 'medium';
}

export interface SetupReport {
  /** 0..100, 100 = ideal filming. */
  score: number;
  /** Share of frames where the player was found. */
  found: number;
  /** Share of found frames with head and both feet inside the picture. */
  wholeBody: number;
  /** Median player height as a share of the frame height. */
  size: number;
  issues: SetupIssue[];
}

const HEAD = 0;
const FEET = [27, 28];
const EDGE = 0.015;

const inside = (p: { x: number; y: number; v: number } | undefined) =>
  !!p && p.v >= 0.5 && p.x > EDGE && p.x < 1 - EDGE && p.y > EDGE && p.y < 1 - EDGE;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * @param fps   the samples per second the clip was analysed at
 * @param aspect frame width / height (portrait clips change how big the player should be)
 */
export function checkSetup(frames: PoseFrame[], fps: number, aspect = 16 / 9): SetupReport {
  const issues: SetupIssue[] = [];
  const n = frames.length || 1;
  const seen = frames.filter((f) => f.image);
  const found = seen.length / n;
  const whole = seen.filter((f) => inside(f.image![HEAD]) && FEET.every((i) => inside(f.image![i])));
  const wholeBody = seen.length ? whole.length / seen.length : 0;
  const heights = seen.map((f) => {
    const ys = f.image!.filter((p) => p.v >= 0.5).map((p) => p.y);
    return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  });
  const size = median(heights);

  let score = 100;
  if (found < 0.8) {
    score -= Math.round((0.8 - found) * 100);
    issues.push({
      id: 'not-found', severity: found < 0.5 ? 'high' : 'medium',
      problem: `The player was found in only ${Math.round(found * 100)}% of the frames.`,
      fix: 'Keep one player in the picture the whole time and avoid other people walking through the frame.',
    });
  }
  if (seen.length && wholeBody < 0.85) {
    score -= Math.round((0.85 - wholeBody) * 60);
    issues.push({
      id: 'cut-off', severity: wholeBody < 0.6 ? 'high' : 'medium',
      problem: `The head or feet left the picture in ${Math.round((1 - wholeBody) * 100)}% of the frames.`,
      fix: 'Step the tripod back or zoom out so there is space above the head and below the feet, even when the player moves.',
    });
  }
  // A portrait frame fits a taller player; a landscape frame should still show them at a usable size.
  const minSize = aspect < 1 ? 0.3 : 0.22;
  if (seen.length && size < minSize) {
    score -= Math.round((minSize - size) * 150);
    issues.push({
      id: 'too-small', severity: size < minSize * 0.6 ? 'high' : 'medium',
      problem: `The player fills only ${Math.round(size * 100)}% of the frame height.`,
      fix: 'Move the camera closer (6–8 m from the player) or zoom in, keeping the whole body in view.',
    });
  }
  if (size > 0.92) {
    score -= 10;
    issues.push({ id: 'too-big', severity: 'medium', problem: 'The player fills almost the whole frame height.', fix: 'Move the camera a step back so the swing never leaves the picture.' });
  }
  if (fps < 50) {
    score -= 12;
    issues.push({
      id: 'low-fps', severity: 'medium',
      problem: `The clip was analysed at ${fps} samples per second.`,
      fix: 'Film at 60 fps (or 120/240 slow motion) and choose 60 on the import screen; contact and paddle speed get much more precise.',
    });
  }
  // Tilt: the line between the hips should be roughly level in the picture over the clip.
  const tilts = seen
    .map((f) => {
      const a = f.image![23];
      const b = f.image![24];
      if (a.v < 0.5 || b.v < 0.5 || Math.abs(b.x - a.x) < 0.02) return null;
      return Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    })
    .filter((x): x is number => x !== null)
    .map((d) => Math.min(d, 180 - d));
  const tilt = median(tilts);
  if (tilts.length > 10 && tilt > 12) {
    score -= 8;
    issues.push({ id: 'tilted', severity: 'medium', problem: `The picture looks tilted by about ${Math.round(tilt)}°.`, fix: 'Level the phone on the tripod; most phone cameras have a level in their grid settings.' });
  }
  // Jumps: the hips moving more than a tenth of the frame between neighbouring frames means a handheld or shaky camera.
  let jumps = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].image;
    const b = frames[i].image;
    if (!a || !b) continue;
    const ax = (a[23].x + a[24].x) / 2, ay = (a[23].y + a[24].y) / 2;
    const bx = (b[23].x + b[24].x) / 2, by = (b[23].y + b[24].y) / 2;
    if (Math.hypot(bx - ax, by - ay) > 0.1 * (30 / Math.max(fps, 1))) jumps++;
  }
  if (seen.length > 10 && jumps / seen.length > 0.05) {
    score -= 10;
    issues.push({ id: 'jumpy', severity: 'medium', problem: 'The camera or the tracking jumps between frames.', fix: 'Use a tripod rather than filming by hand, and keep the lens clean and the player well lit.' });
  }

  return { score: Math.max(0, Math.min(100, score)), found, wholeBody, size, issues };
}

export function setupGrade(score: number): 'great' | 'ok' | 'poor' {
  return score >= 80 ? 'great' : score >= 55 ? 'ok' : 'poor';
}
