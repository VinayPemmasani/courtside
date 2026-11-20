/**
 * Synthetic right-handed cricketers filmed side-on, for the analysis tests. Pose world points are
 * metres around the hips (x right, y down, z away from the camera); image points are the same body
 * placed in a 0..1 frame with the hips moving as the player strides or runs in.
 */
import type { ImagePoint, PoseFrame, Vec3 } from '../types';

type V = Vec3;
const v = (x: number, y: number, z: number): V => ({ x, y, z });
const lerp = (a: V, b: V, t: number): V => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
/** Piecewise path through keyframes [time, point], smoothstep between them. */
function path(keys: [number, V][], t: number): V {
  if (t <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    if (t <= keys[k][0]) return lerp(keys[k - 1][1], keys[k][1], smooth((t - keys[k - 1][0]) / (keys[k][0] - keys[k - 1][0])));
  }
  return keys[keys.length - 1][1];
}

interface Body {
  /** Hip centre in the image (normalised), for the camera's view. */
  hipImg: { x: number; y: number };
  lShoulder: V; rShoulder: V; lElbow: V; rElbow: V; lWrist: V; rWrist: V;
  lHip: V; rHip: V; lKnee: V; rKnee: V; lAnkle: V; rAnkle: V; nose: V;
}

function frameOf(b: Body, t: number): PoseFrame {
  const w: V[] = new Array(33).fill(null).map(() => v(0, 0, 0));
  w[0] = b.nose;
  // Eyes and ears around the nose, level.
  for (const [i, dx] of [[1, -0.02], [2, -0.03], [3, -0.04], [4, 0.02], [5, 0.03], [6, 0.04], [7, -0.07], [8, 0.07], [9, -0.02], [10, 0.02]] as [number, number][]) {
    w[i] = v(b.nose.x + dx, b.nose.y - (i <= 6 ? 0.03 : i >= 9 ? -0.04 : 0), b.nose.z + 0.04);
  }
  w[11] = b.lShoulder; w[12] = b.rShoulder; w[13] = b.lElbow; w[14] = b.rElbow; w[15] = b.lWrist; w[16] = b.rWrist;
  const knuckles = (wr: V, el: V, s: number) => { const d = v(wr.x - el.x, wr.y - el.y, wr.z - el.z); return [v(wr.x + d.x * 0.25, wr.y + d.y * 0.25, wr.z + 0.02 * s), v(wr.x + d.x * 0.3, wr.y + d.y * 0.3, wr.z - 0.02 * s), v(wr.x + d.x * 0.2, wr.y + d.y * 0.2, wr.z)]; };
  [w[17], w[19], w[21]] = knuckles(b.lWrist, b.lElbow, 1);
  [w[18], w[20], w[22]] = knuckles(b.rWrist, b.rElbow, -1);
  w[23] = b.lHip; w[24] = b.rHip; w[25] = b.lKnee; w[26] = b.rKnee; w[27] = b.lAnkle; w[28] = b.rAnkle;
  w[29] = v(b.lAnkle.x + 0.05, b.lAnkle.y + 0.04, b.lAnkle.z); w[30] = v(b.rAnkle.x + 0.05, b.rAnkle.y + 0.04, b.rAnkle.z);
  w[31] = v(b.lAnkle.x - 0.15, b.lAnkle.y + 0.05, b.lAnkle.z); w[32] = v(b.rAnkle.x - 0.15, b.rAnkle.y + 0.05, b.rAnkle.z);
  const S = 0.28;
  const image: ImagePoint[] = w.map((p) => ({ x: b.hipImg.x + p.x * S, y: b.hipImg.y + p.y * S, v: 0.95 }));
  return { t, world: w, image };
}

/** A knee between hip and ankle, bent forward (toward the camera, −z) by `bend` metres. */
const knee = (hip: V, ankle: V, bend: number) => v((hip.x + ankle.x) / 2, (hip.y + ankle.y) / 2, (hip.z + ankle.z) / 2 - bend);

/**
 * A right-handed batter (front = left side, toward the bowler at −x) playing a front-foot drive.
 * Stance until 0.6 s, backlift top at 1.1 s, front foot lands at 1.2 s, impact at 1.4 s, high finish by 1.8 s.
 */
export function syntheticDrive(fps = 60, seconds = 2.4): PoseFrame[] {
  const out: PoseFrame[] = [];
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    const t = i / fps;
    const hipX = path([[0, v(0, 0, 0)], [0.9, v(0, 0, 0)], [1.2, v(-0.25, 0, 0)], [2.4, v(-0.3, 0, 0)]], t).x;
    const lAnkle = path([[0, v(-0.25, 0.9, 0)], [0.9, v(-0.25, 0.9, 0)], [1.2, v(-0.6, 0.85, 0)]], t);
    const rAnkle = path([[0, v(0.25, 0.9, 0)], [0.9, v(0.25, 0.9, 0)], [1.2, v(0.35, 0.92, 0)]], t);
    const lHip = v(-0.12, 0, 0), rHip = v(0.12, 0, 0);
    // Shoulders stay side-on, head leans over the front knee by impact.
    const lean = path([[0, v(0, 0, 0)], [1.0, v(0, 0, 0)], [1.4, v(-0.3, 0.05, 0)], [2.4, v(-0.3, 0.05, 0)]], t);
    const lShoulder = v(-0.17 + lean.x, -0.5 + lean.y, -0.02), rShoulder = v(0.17 + lean.x * 0.8, -0.5 + lean.y, 0.02);
    const nose = v(-0.05 + lean.x * 1.25, -0.66 + lean.y, -0.08);
    // Hands together on the handle: low stance → high backlift → fast down to impact → high finish.
    const hands = path([[0, v(0.05, -0.02, -0.25)], [0.6, v(0.05, -0.02, -0.25)], [1.1, v(0.25, -0.5, -0.12)], [1.25, v(0.12, -0.3, -0.2)], [1.4, v(-0.3, 0.08, -0.3)], [1.8, v(-0.45, -0.75, -0.15)]], t);
    // Make the downswing accelerate into impact: add extra speed through 1.25–1.45 s.
    const lWrist = v(hands.x - 0.04, hands.y - 0.05, hands.z);
    const rWrist = v(hands.x + 0.04, hands.y + 0.05, hands.z);
    // High front elbow: above the front wrist when the hands are low.
    const lElbow = v((lShoulder.x + lWrist.x) / 2 - 0.05, Math.min((lShoulder.y + lWrist.y) / 2, lWrist.y - 0.06), (lShoulder.z + lWrist.z) / 2 - 0.06);
    const rElbow = v((rShoulder.x + rWrist.x) / 2 + 0.05, (rShoulder.y + rWrist.y) / 2 + 0.03, (rShoulder.z + rWrist.z) / 2);
    out.push(frameOf({
      hipImg: { x: 0.5 + hipX * 0.28, y: 0.4 },
      lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip,
      lKnee: knee(lHip, lAnkle, t > 1.15 ? 0.12 : 0.05), rKnee: knee(rHip, rAnkle, 0.05), lAnkle, rAnkle, nose,
    }, t));
  }
  return out;
}

/**
 * A right-arm bowler running in toward −x, filmed side-on. Gather (front arm up) at 0.8 s, back foot
 * lands at 1.05 s, front foot at 1.25 s, release at 1.4 s, follow-through across the body by 1.75 s.
 * `elbowBend` (degrees) is how bent the bowling elbow is when the upper arm passes horizontal; it
 * straightens fully by release, so it is also the true elbow extension.
 */
export function syntheticDelivery(fps = 60, seconds = 2.4, elbowBend = 0, frontKneeCollapse = 0): PoseFrame[] {
  const out: PoseFrame[] = [];
  const L = 0.62; // shoulder to wrist
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    const t = i / fps;
    // Run-up: the hips travel steadily left, then stop after release.
    const hipX = t < 1.45 ? -0.9 * t : -0.9 * 1.45 - 0.3 * (t - 1.45);
    const lHip = v(-0.12, 0, 0), rHip = v(0.12, 0, 0);
    // Feet: running strides, then back foot (right) plants at 1.05, front foot (left) at 1.25.
    const run = (ph: number) => v(0.35 * Math.sin(ph), 0.88 - 0.06 * Math.max(0, Math.cos(ph)), 0);
    let rAnkle = t < 0.85 ? run(t * 9) : path([[0.85, run(0.85 * 9)], [1.05, v(0.3, 0.9, 0)], [1.3, v(0.3 + 0.9 * 0.25, 0.9, 0)], [1.6, v(0.0, 0.6, 0)]], t);
    let lAnkle = t < 0.85 ? run(t * 9 + Math.PI) : path([[0.85, run(0.85 * 9 + Math.PI)], [1.05, v(-0.1, 0.55, 0)], [1.25, v(-0.75, 0.88, 0)], [2.4, v(-0.75 + 0.9 * 0.2, 0.88, 0)]], t);
    if (t > 1.25 && t < 1.45) { lAnkle = v(-0.75 + 0.9 * (t - 1.25), 0.88, 0); }
    if (t > 1.05 && t < 1.25) rAnkle = v(0.3 + 0.9 * (t - 1.05), 0.9, 0);
    const lShoulder = v(-0.17, -0.5, 0), rShoulder = v(0.17, -0.5, 0);
    const nose = v(-0.07, -0.66, -0.06);
    // Bowling arm angle θ: 0 = hanging down, 90 = pointing back, 180 = straight up, 270 = forward.
    const u = clamp01((t - 1.05) / 0.35);
    const theta = t < 1.05 ? 40 + 50 * smooth(t / 1.05) : t <= 1.4 ? 90 + 110 * u * u * u : 200 + 300 * (t - 1.4);
    const th = Math.min(theta, 360) * Math.PI / 180;
    const d = v(Math.sin(th), Math.cos(th), 0);
    const rWrist = v(rShoulder.x + d.x * L, rShoulder.y + d.y * L, t > 1.4 ? -0.2 * clamp01((t - 1.4) / 0.3) : 0);
    // Elbow: on the arm line, pushed out sideways (−z) when bent; the bend fades to zero at release.
    const bendNow = t < 1.05 ? elbowBend : t < 1.4 ? elbowBend * (1 - u) : 0;
    const off = (L / 2) * Math.tan((bendNow / 2) * Math.PI / 180);
    const rElbow = v((rShoulder.x + rWrist.x) / 2, (rShoulder.y + rWrist.y) / 2, (rShoulder.z + rWrist.z) / 2 - off);
    // Front arm: up high at the gather, pulled down to the hip by release.
    const lWrist = path([[0, v(-0.3, -0.2, -0.1)], [0.8, v(-0.3, -1.05, -0.05)], [1.05, v(-0.45, -0.95, -0.05)], [1.4, v(-0.05, 0.05, -0.2)], [2.4, v(0.0, 0.1, -0.2)]], t);
    const lElbow = v((lShoulder.x + lWrist.x) / 2 - 0.05, (lShoulder.y + lWrist.y) / 2, (lShoulder.z + lWrist.z) / 2);
    // Front knee: straight at landing, optionally collapsing by release.
    const collapse = t > 1.25 ? Math.min(1, (t - 1.25) / 0.15) * frontKneeCollapse : 0;
    out.push(frameOf({
      hipImg: { x: 0.85 + hipX * 0.28, y: 0.42 },
      lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip,
      lKnee: knee(lHip, lAnkle, 0.02 + collapse), rKnee: knee(rHip, rAnkle, 0.08), lAnkle, rAnkle, nose,
    }, t));
  }
  return out;
}
