import type { Handedness, Vec3 } from '../core/types';
import type { StudioScene } from '../render/scene3d';
import { Animation, propAt, type Motion } from './body';

/** Drives a StudioScene through a drill motion: props once, then any time on request. */
export class DrillPlayer {
  readonly anim: Animation;
  private trailFps = 60;

  /** Where the camera looks: the middle of where the hips travel, so moving drills don't drag the view. */
  readonly target: Vec3;

  constructor(private scene: StudioScene, readonly motion: Motion, readonly hand: Handedness) {
    this.anim = new Animation(motion, hand);
    let x = 0, z = 0, n = 0;
    for (let t = 0; t < this.anim.duration; t += 0.1) {
      const f = this.anim.at(t);
      x += (f.pts[23].x + f.pts[24].x) / 2; z += (f.pts[23].z + f.pts[24].z) / 2; n++;
    }
    this.target = { x: x / n, y: 0.95, z: z / n };
    scene.setDrillProps((motion.props ?? []).filter((p) => p.p && p.kind !== 'band').map((p) => ({ kind: p.kind, at: propAt(p.p!, hand), size: p.size, yaw: p.yaw })));
  }

  get duration() {
    return this.anim.duration;
  }

  /** Racket head (or the hands, without a racket) over the last `span` seconds. */
  private trail(t: number, span: number): Vec3[] {
    const out: Vec3[] = [];
    const n = Math.max(2, Math.round(span * this.trailFps));
    for (let i = n; i >= 0; i--) {
      const tt = t - (i / n) * span;
      if (tt < 0) continue;
      const f = this.anim.at(tt);
      const w = f.pts[this.hand === 'left' ? 15 : 16];
      if (f.racket) out.push({ x: w.x + f.racket.dir.x * 0.49, y: w.y + f.racket.dir.y * 0.49, z: w.z + f.racket.dir.z * 0.49 });
      else out.push(w);
    }
    return out;
  }

  render(t: number, cam: { yaw: number; dist?: number; height?: number; aimY?: number }, opts: { trail?: boolean; fast?: boolean } = {}) {
    const tt = Math.max(0, Math.min(this.duration - 1e-3, t));
    const f = this.anim.at(tt);
    const band = this.motion.props?.find((p) => p.kind === 'band');
    const bandHands = band?.hold === 'lh' ? (this.hand === 'left' ? 'r' : 'l') : band?.hold === 'rh' ? (this.hand === 'left' ? 'l' : 'r') : 'both';
    this.scene.renderDrill({
      pts: f.pts, hand: this.hand, racket: f.racket, ball: f.ball, medball: f.medball,
      band: band?.p ? { from: propAt(band.p, this.hand), hands: bandHands } : null,
      trail: opts.trail === false || !f.racket ? undefined : this.trail(tt, 0.45),
      fast: opts.fast,
      camera: { target: { ...this.target, y: cam.aimY ?? this.target.y }, ...cam },
    });
  }
}
