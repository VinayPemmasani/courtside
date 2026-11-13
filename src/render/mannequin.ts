import * as THREE from 'three';
import { basis, ellipsoid, flipZ, Loft, type Grip, type Pt } from './athlete';

/**
 * The studio mannequin: a glossy, jointed figure in the style of an artist's posing model.
 *
 * Every body part is its own rounded piece (head, chest, abdomen, pelvis, tapered limbs, hands
 * with fingers, feet) with a ball joint at each landmark, and the pieces stop just short of each
 * other so the joints read as articulation. One porcelain-white clear-coated material for the
 * shell and a slightly cooler grey for the joints keeps it clean under the arena spotlight, and
 * makes rotation and body angles easy to judge: nothing (clothes, skin tone, hair) distracts from
 * the shape of the movement.
 */

const UP = new THREE.Vector3(0, 1, 0);

export function mannequinMaterials() {
  const shell = new THREE.MeshPhysicalMaterial({
    color: '#eceef2',
    roughness: 0.36,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
    sheen: 0.3,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#dfe8ff'),
    envMapIntensity: 1.1,
  });
  const joint = shell.clone();
  joint.color.set('#c7cbd4');
  joint.roughness = 0.42;
  const dark = new THREE.MeshPhysicalMaterial({ color: '#23262d', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  return { shell, joint, dark };
}

/**
 * A rounded, tapered segment of unit length along +y: radius r0 at the base to r1 at the end, with
 * an optional muscle bulge, and rounded ends so neighbouring pieces meet like a jointed model.
 */
function segment(r0: number, r1: number, bulge = 0, at = 0.35, segs = 32) {
  const pts: THREE.Vector2[] = [];
  const N = 24;
  const end = 0.13;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    let r = r0 + (r1 - r0) * t + bulge * Math.exp(-(((t - at) / 0.25) ** 2));
    // Round the ends over the last `end` of the length.
    const e = t < end ? (end - t) / end : t > 1 - end ? (t - (1 - end)) / end : 0;
    r *= Math.sqrt(Math.max(0, 1 - e * e));
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), t));
  }
  return new THREE.LatheGeometry(pts, segs);
}

/** Place a unit segment between a and b, pulled back from each end by the given gaps. */
function span(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, gapA: number, gapB: number) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-4) { m.visible = false; return; }
  m.visible = true;
  d.multiplyScalar(1 / len);
  const ga = Math.min(gapA, len * 0.3), gb = Math.min(gapB, len * 0.3);
  m.position.copy(a).addScaledVector(d, ga);
  m.quaternion.setFromUnitVectors(UP, d);
  m.scale.set(1, Math.max(1e-3, len - ga - gb), 1);
}

type Seg = { mesh: THREE.Mesh; a: number; b: number; gapA: number; gapB: number };

export class Mannequin {
  readonly group = new THREE.Group();
  private m = mannequinMaterials();
  private segs: Seg[] = [];
  private balls: { mesh: THREE.Mesh; i: number }[] = [];
  private chest: Loft;
  private belly: Loft;
  private pelvis: Loft;
  private neck: THREE.Mesh;
  private head: THREE.Mesh;
  private jaw: THREE.Mesh;
  private hands: { palm: THREE.Mesh; fingers: THREE.Mesh[][]; thumb: THREE.Mesh[] }[] = [];
  private feet: { foot: THREE.Mesh; toes: THREE.Mesh }[] = [];

  constructor() {
    const { shell, joint } = this.m;
    const add = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const x = new THREE.Mesh(g, mat);
      x.castShadow = true;
      x.receiveShadow = true;
      this.group.add(x);
      return x;
    };
    const seg = (a: number, b: number, g: THREE.BufferGeometry, gapA: number, gapB: number) => this.segs.push({ mesh: add(g, shell), a, b, gapA, gapB });
    const upperArm = segment(0.047, 0.036, 0.008, 0.3);
    const forearm = segment(0.04, 0.026, 0.006, 0.22);
    const thigh = segment(0.07, 0.046, 0.01, 0.3);
    const shin = segment(0.052, 0.034, 0.01, 0.25);
    for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
      seg(s, e, upperArm, 0.05, 0.036);
      seg(e, w, forearm, 0.03, 0.026);
    }
    for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) {
      seg(h, k, thigh, 0.055, 0.05);
      seg(k, a, shin, 0.045, 0.034);
    }
    const sphere = new THREE.SphereGeometry(1, 32, 20);
    const ball = (i: number, r: number) => {
      const mesh = add(sphere, joint);
      mesh.scale.setScalar(r);
      this.balls.push({ mesh, i });
    };
    ball(11, 0.052); ball(12, 0.052);
    ball(13, 0.036); ball(14, 0.036);
    ball(15, 0.025); ball(16, 0.025);
    ball(23, 0.046); ball(24, 0.046);
    ball(25, 0.048); ball(26, 0.048);
    ball(27, 0.032); ball(28, 0.032);

    // Torso in three shells: rib cage, abdomen, pelvis, each turning with the hips or shoulders.
    this.chest = new Loft([
      { h: 0.43, a: () => 0.06, b: 0.045 },
      { h: 0.47, a: () => 0.098, b: 0.074 },
      { h: 0.56, a: () => 0.116, b: 0.086, fwd: 0.004 },
      { h: 0.7, a: (_, sh) => Math.max(0.13, sh * 0.8), b: 0.1, fwd: 0.014 },
      { h: 0.84, a: (_, sh) => Math.max(0.15, sh * 0.93), b: 0.1, fwd: 0.012 },
      { h: 0.95, a: (_, sh) => Math.max(0.13, sh * 0.85), b: 0.086 },
      { h: 1.02, a: (_, sh) => Math.max(0.08, sh * 0.55), b: 0.066 },
      { h: 1.05, a: () => 0.05, b: 0.045 },
    ], shell, 40);
    this.belly = new Loft([
      { h: 0.13, a: () => 0.05, b: 0.04 },
      { h: 0.17, a: () => 0.084, b: 0.066 },
      { h: 0.24, a: () => 0.098, b: 0.076, fwd: 0.006 },
      { h: 0.36, a: () => 0.1, b: 0.078, fwd: 0.008 },
      { h: 0.45, a: () => 0.088, b: 0.068 },
      { h: 0.49, a: () => 0.05, b: 0.04 },
    ], joint, 36);
    this.pelvis = new Loft([
      { h: 0.15, a: () => 0.07, b: 0.055 },
      { h: 0.11, a: (hp) => hp + 0.01, b: 0.082 },
      { h: 0.06, a: (hp) => hp + 0.045, b: 0.1, fwd: 0.004 },
      { h: -0.06, a: (hp) => hp + 0.058, b: 0.108 },
      { h: -0.17, a: (hp) => hp + 0.028, b: 0.09, fwd: 0.01 },
      { h: -0.23, a: () => 0.05, b: 0.06, fwd: 0.012 },
    ], shell, 40);
    for (const l of [this.chest, this.belly, this.pelvis]) this.group.add(l.mesh);

    this.neck = add(segment(0.04, 0.036, 0, 0.5, 24), joint);
    this.head = add(sphere, shell);
    this.jaw = add(sphere, shell);

    // Hands: palm, four two-part fingers and a two-part thumb.
    const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 12).translate(0, l / 2 + r, 0);
    for (let k = 0; k < 2; k++) {
      this.hands.push({
        palm: add(sphere, shell),
        fingers: [0, 1, 2, 3].map(() => [add(cap(0.0082, 0.022), shell), add(cap(0.0075, 0.016), shell)]),
        thumb: [add(cap(0.0095, 0.02), shell), add(cap(0.0085, 0.014), shell)],
      });
    }
    for (let k = 0; k < 2; k++) this.feet.push({ foot: add(sphere, shell), toes: add(sphere, shell) });
  }

  update(P: Pt, _dominant?: 'l' | 'r', _grip?: Grip | null) {
    for (const s of this.segs) span(s.mesh, P(s.a), P(s.b), s.gapA, s.gapB);
    for (const b of this.balls) b.mesh.position.copy(P(b.i));

    const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
    const sm = ls.clone().add(rs).multiplyScalar(0.5);
    const hm = lh.clone().add(rh).multiplyScalar(0.5);
    const up = sm.clone().sub(hm);
    const hipHalf = lh.distanceTo(rh) / 2;
    const shHalf = ls.distanceTo(rs) / 2;
    const qHip = basis(rh.clone().sub(lh).negate(), up);
    const qSh = basis(rs.clone().sub(ls).negate(), up);
    const nose = P(0);
    if (new THREE.Vector3(0, 0, 1).applyQuaternion(qHip).dot(nose.clone().sub(sm)) < 0) { flipZ(qHip); flipZ(qSh); }
    this.chest.update(hm, sm, qHip, qSh, hipHalf, shHalf);
    this.belly.update(hm, sm, qHip, qSh, hipHalf, shHalf);
    this.pelvis.update(hm, sm, qHip, qHip, hipHalf, shHalf);
    const spineUp = up.clone().normalize();

    // Head: a smooth egg with a jaw that juts the way the face points; no features.
    const ears = P(7).add(P(8)).multiplyScalar(0.5);
    let headC = ears.clone().addScaledVector(spineUp, 0.02);
    const rise = headC.clone().sub(sm).dot(spineUp);
    if (rise > 0.21) headC = headC.addScaledVector(spineUp, 0.21 - rise);
    const neckBase = sm.clone().addScaledVector(spineUp, Math.max(0.03, up.length() * 0.08));
    span(this.neck, neckBase, headC.clone().lerp(neckBase, 0.2), 0, 0);
    const headUp = headC.clone().sub(neckBase).normalize();
    let face = nose.clone().sub(ears);
    face.addScaledVector(headUp, -face.dot(headUp));
    if (face.lengthSq() < 1e-6) face = new THREE.Vector3(0, 0, 1).applyQuaternion(qSh);
    face.normalize();
    const side = new THREE.Vector3().crossVectors(headUp, face).normalize();
    const qHead = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, headUp, face));
    ellipsoid(this.head, headC.clone().addScaledVector(headUp, 0.012), qHead, new THREE.Vector3(0.076, 0.1, 0.09));
    const qJaw = qHead.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35));
    ellipsoid(this.jaw, headC.clone().addScaledVector(headUp, -0.04).addScaledVector(face, 0.03), qJaw, new THREE.Vector3(0.056, 0.062, 0.066));

    // Hands.
    [[13, 15, 19, 17, 21], [14, 16, 20, 18, 22]].forEach(([el, wr, ix, pk, th], k) => {
      const w = P(wr);
      const kn = P(ix).add(P(pk)).multiplyScalar(0.5);
      let d = kn.clone().sub(w);
      if (d.length() < 0.02) d = w.clone().sub(P(el));
      d.normalize();
      let across = P(ix).sub(P(pk));
      if (across.lengthSq() < 1e-6) across = new THREE.Vector3().crossVectors(d, UP);
      const q = basis(across, d);
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q); // pinky -> index
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // palm normal
      const h = this.hands[k];
      ellipsoid(h.palm, w.clone().addScaledVector(d, 0.05), q, new THREE.Vector3(0.04, 0.05, 0.017));
      // Fingers curl around the grip: first segment bends ~45°, the second another ~60°.
      const bend = (deg: number) => d.clone().multiplyScalar(Math.cos((deg * Math.PI) / 180)).addScaledVector(n, Math.sin((deg * Math.PI) / 180)).normalize();
      const d1 = bend(45), d2 = bend(105);
      h.fingers.forEach(([a, b], f) => {
        const base = w.clone().addScaledVector(d, 0.092 - Math.abs(f - 1.2) * 0.004).addScaledVector(ax, -0.026 + f * 0.0175);
        a.position.copy(base);
        a.quaternion.setFromUnitVectors(UP, d1);
        const tip = base.clone().addScaledVector(d1, 0.036);
        b.position.copy(tip);
        b.quaternion.setFromUnitVectors(UP, d2);
      });
      let td = P(th).sub(w);
      if (td.length() < 0.01) td = d.clone().add(ax);
      td = td.normalize().add(d).normalize();
      const tb = w.clone().addScaledVector(d, 0.03).addScaledVector(ax, 0.03).addScaledVector(n, 0.01);
      h.thumb[0].position.copy(tb);
      h.thumb[0].quaternion.setFromUnitVectors(UP, td);
      const t2 = tb.clone().addScaledVector(td, 0.036);
      const td2 = td.clone().addScaledVector(n, 0.6).normalize();
      h.thumb[1].position.copy(t2);
      h.thumb[1].quaternion.setFromUnitVectors(UP, td2);
    });

    // Feet: a sculpted wedge from heel to toe with a separate toe piece.
    [[27, 29, 31], [28, 30, 32]].forEach(([ank, heel, toe], k) => {
      const a = P(heel), b = P(toe);
      let d = b.clone().sub(a);
      if (d.length() < 0.05) d = new THREE.Vector3(0, 0, -0.2);
      const zf = d.clone().setY(d.y * 0.6).normalize();
      const xf = new THREE.Vector3().crossVectors(UP, zf).normalize();
      const yf = new THREE.Vector3().crossVectors(zf, xf).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xf, yf, zf));
      const len = Math.max(0.22, d.length() * 1.1);
      const ankle = P(ank);
      const groundY = Math.min(a.y, b.y);
      const mid = a.clone().lerp(b, 0.42);
      const f = this.feet[k];
      ellipsoid(f.foot, new THREE.Vector3(mid.x, Math.max(groundY + 0.035, (ankle.y + groundY) / 2 - 0.02), mid.z).lerp(ankle, 0.12), q, new THREE.Vector3(0.042, 0.04, len * 0.4));
      const toeC = a.clone().addScaledVector(zf, len * 0.82);
      ellipsoid(f.toes, new THREE.Vector3(toeC.x, groundY + 0.022, toeC.z), q, new THREE.Vector3(0.038, 0.022, 0.05));
    });
  }
}
