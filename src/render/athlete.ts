import * as THREE from 'three';

/**
 * The 3D player: a dressed athlete rather than a jointed mannequin.
 *
 * Limbs are lathed with a muscle profile (deltoid, biceps, forearm, thigh, calf) and meet at joint
 * spheres of the same material, so elbows and knees read as one smooth surface. The torso is a loft
 * of elliptical rings rebuilt every frame between the hip line and the shoulder line, so it bends
 * and twists with the player (the hip-shoulder separation that drives a groundstroke is visible).
 * Clothing (shirt, sleeves, shorts, socks, shoes) and a head with hair and a nose for facing direction
 * give the figure a body instead of a robot's segments.
 */

const UP = new THREE.Vector3(0, 1, 0);

export type Pt = (i: number) => THREE.Vector3;

const COLORS = {
  skin: '#b98468',
  shirt: '#eef1f6',
  trim: '#f5b544',
  shorts: '#1c2536',
  sock: '#e4e7ed',
  shoe: '#d9dde5',
  sole: '#2a2f3a',
  hair: '#241b16',
};

function mats() {
  const fabric = (color: string, rough = 0.85) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') });
  return {
    skin: new THREE.MeshPhysicalMaterial({ color: COLORS.skin, roughness: 0.55, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6, sheen: 0.25, sheenColor: new THREE.Color('#ffd9c2') }),
    shirt: fabric(COLORS.shirt),
    sleeve: Object.assign(fabric(COLORS.shirt), { side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: COLORS.trim, roughness: 0.6, emissive: new THREE.Color(COLORS.trim), emissiveIntensity: 0.25 }),
    shorts: Object.assign(fabric(COLORS.shorts, 0.75), { side: THREE.DoubleSide }),
    sock: fabric(COLORS.sock),
    shoe: new THREE.MeshPhysicalMaterial({ color: COLORS.shoe, roughness: 0.6, clearcoat: 0.15 }),
    sole: new THREE.MeshStandardMaterial({ color: COLORS.sole, roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ color: COLORS.hair, roughness: 0.95 }),
  };
}

/** A unit-length (0..1 along +y) lathe from a radius profile [t, r][]. */
function lathe(profile: [number, number][], segs = 28) {
  const pts = profile.map(([t, r]) => new THREE.Vector2(r, t));
  return new THREE.LatheGeometry(pts, segs);
}

/** Stretch a unit-height mesh (base at the origin, along +y) from a to b, twisting so local +z follows `front` when given. */
function place(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(d.length(), 1e-4);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  m.scale.set(1, len, 1);
}

/** Basis from a side (x) and an up (y) direction; z = x × y. */
function basis(side: THREE.Vector3, up: THREE.Vector3) {
  const y = up.clone().normalize();
  let x = side.clone().addScaledVector(y, -side.dot(y));
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function ellipsoid(m: THREE.Object3D, centre: THREE.Vector3, q: THREE.Quaternion, radii: THREE.Vector3) {
  m.position.copy(centre);
  m.quaternion.copy(q);
  m.scale.copy(radii);
}

/** One ring of the torso loft: height along the hip→shoulder line (0 = hip line, 1 = shoulder line) and half-widths. */
interface Ring { h: number; a: (hip: number, sh: number) => number; b: number; fwd?: number }

/** A loft whose rings are positioned every frame; closed at both ends. */
class Loft {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  constructor(readonly rings: Ring[], material: THREE.Material, readonly segs = 32) {
    const R = rings.length;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array((R * segs + 2) * 3), 3);
    g.setAttribute('position', this.pos);
    const idx: number[] = [];
    for (let r = 0; r < R - 1; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * segs + s, b = r * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
        idx.push(a, c, b, b, c, d);
      }
    }
    const bot = R * segs, top = R * segs + 1;
    for (let s = 0; s < segs; s++) {
      idx.push(bot, s, (s + 1) % segs);
      const o = (R - 1) * segs;
      idx.push(top, o + ((s + 1) % segs), o + s);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  /**
   * Lay the rings between the hip frame and the shoulder frame. Each ring turns part-way from the
   * hip orientation to the shoulder orientation (slerp), which is what makes the trunk twist.
   */
  update(hipMid: THREE.Vector3, shMid: THREE.Vector3, qHip: THREE.Quaternion, qSh: THREE.Quaternion, hipHalf: number, shHalf: number) {
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const arr = this.pos.array as Float32Array;
    const centres: THREE.Vector3[] = [];
    this.rings.forEach((ring, r) => {
      const t = THREE.MathUtils.clamp(ring.h, 0, 1);
      const k = t * t * (3 - 2 * t);
      q.slerpQuaternions(qHip, qSh, k);
      const c = hipMid.clone().lerp(shMid, ring.h);
      if (ring.fwd) c.add(new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(ring.fwd));
      centres.push(c);
      const A = ring.a(hipHalf, shHalf);
      for (let s = 0; s < this.segs; s++) {
        const th = (s / this.segs) * Math.PI * 2;
        // Slightly flatter at the back than the front.
        const z = Math.sin(th) * ring.b * (Math.sin(th) < 0 ? 0.88 : 1);
        v.set(Math.cos(th) * A, 0, z).applyQuaternion(q).add(c);
        arr.set([v.x, v.y, v.z], (r * this.segs + s) * 3);
      }
    });
    arr.set(centres[0].toArray(), this.rings.length * this.segs * 3);
    arr.set(centres[centres.length - 1].toArray(), (this.rings.length * this.segs + 1) * 3);
    this.pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }
}

type Limb = { parts: THREE.Mesh[]; a: number; b: number };

export class Athlete {
  readonly group = new THREE.Group();
  private m = mats();
  private limbs: Limb[] = [];
  private joints: { mesh: THREE.Mesh; i: number }[] = [];
  private shirt: Loft;
  private shorts: Loft;
  private crotch: THREE.Mesh;
  private delts: THREE.Mesh[] = [];
  private neck: THREE.Mesh;
  private head: THREE.Mesh;
  private hair: THREE.Mesh;
  private nose: THREE.Mesh;
  private ears: THREE.Mesh[] = [];
  private hands: { palm: THREE.Mesh; fingers: THREE.Mesh; thumb: THREE.Mesh }[] = [];
  private shoes: { upper: THREE.Mesh; sole: THREE.Mesh }[] = [];
  private collar: THREE.Mesh;

  constructor() {
    const { m } = this;
    const add = <T extends THREE.Mesh>(x: T) => { x.castShadow = true; x.receiveShadow = true; this.group.add(x); return x; };
    const limb = (a: number, b: number, layers: [THREE.BufferGeometry, THREE.Material][]) => {
      this.limbs.push({ a, b, parts: layers.map(([g, mat]) => add(new THREE.Mesh(g, mat))) });
    };
    const upperArm = lathe([[0, 0.05], [0.12, 0.051], [0.35, 0.049], [0.6, 0.045], [0.85, 0.039], [1, 0.037]]);
    const forearm = lathe([[0, 0.037], [0.2, 0.042], [0.45, 0.037], [0.75, 0.03], [1, 0.025]]);
    const thigh = lathe([[0, 0.085], [0.15, 0.084], [0.45, 0.074], [0.75, 0.06], [0.92, 0.052], [1, 0.05]]);
    const shin = lathe([[0, 0.05], [0.12, 0.053], [0.3, 0.054], [0.55, 0.044], [0.8, 0.034], [1, 0.032]]);
    const sleeve = lathe([[0, 0.058], [0.2, 0.057], [0.4, 0.054], [0.42, 0.053]]);
    const sleeveHem = lathe([[0.37, 0.0555], [0.42, 0.0545]], 28);
    const shortsLeg = lathe([[0, 0.1], [0.25, 0.098], [0.45, 0.092], [0.47, 0.09]]);
    const sock = lathe([[0.7, 0.037], [0.82, 0.036], [1, 0.035]]);
    for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
      limb(s, e, [[upperArm, m.skin], [sleeve, m.sleeve], [sleeveHem, m.trim]]);
      limb(e, w, [[forearm, m.skin]]);
    }
    for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) {
      limb(h, k, [[thigh, m.skin], [shortsLeg, m.shorts]]);
      limb(k, a, [[shin, m.skin], [sock, m.sock]]);
    }
    const sphere = new THREE.SphereGeometry(1, 28, 18);
    const joint = (i: number, r: number, mat: THREE.Material = m.skin) => {
      const mesh = add(new THREE.Mesh(sphere, mat));
      mesh.scale.setScalar(r);
      this.joints.push({ mesh, i });
    };
    joint(13, 0.037); joint(14, 0.037); joint(15, 0.025); joint(16, 0.025);
    joint(25, 0.051); joint(26, 0.051); joint(27, 0.035, m.sock); joint(28, 0.035, m.sock);
    this.delts = [add(new THREE.Mesh(sphere, m.shirt)), add(new THREE.Mesh(sphere, m.shirt))];

    // Torso: shirt from the waist up, shorts from the hip line down.
    this.shirt = new Loft([
      { h: -0.03, a: (hp) => hp + 0.088, b: 0.128 },
      { h: 0.1, a: (hp) => hp + 0.078, b: 0.118 },
      { h: 0.3, a: () => 0.142, b: 0.104, fwd: 0.004 },
      { h: 0.5, a: () => 0.152, b: 0.112, fwd: 0.012 },
      { h: 0.7, a: (_, sh) => Math.max(0.16, sh * 0.86), b: 0.124, fwd: 0.02 },
      { h: 0.86, a: (_, sh) => Math.max(0.165, sh * 0.94), b: 0.112, fwd: 0.012 },
      { h: 0.98, a: (_, sh) => Math.max(0.13, sh * 0.78), b: 0.092 },
      // Trapezius rising into the neck.
      { h: 1.06, a: () => 0.1, b: 0.07 },
      { h: 1.12, a: () => 0.062, b: 0.056 },
    ], m.shirt);
    this.shorts = new Loft([
      { h: -0.2, a: (hp) => hp + 0.05, b: 0.1 },
      { h: -0.1, a: (hp) => hp + 0.072, b: 0.116 },
      { h: 0.0, a: (hp) => hp + 0.074, b: 0.116 },
      { h: 0.04, a: (hp) => hp + 0.058, b: 0.1 },
    ], m.shorts);
    this.group.add(this.shirt.mesh, this.shorts.mesh);
    this.crotch = add(new THREE.Mesh(sphere, m.shorts));
    this.collar = add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 32), m.trim));

    // Head: skull, hair cap, ears and a nose so the facing direction reads.
    this.neck = add(new THREE.Mesh(lathe([[0, 0.066], [0.4, 0.06], [1, 0.056]]), m.skin));
    this.head = add(new THREE.Mesh(sphere, m.skin));
    this.hair = add(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), m.hair));
    this.nose = add(new THREE.Mesh(sphere, m.skin));
    this.ears = [add(new THREE.Mesh(sphere, m.skin)), add(new THREE.Mesh(sphere, m.skin))];

    // Hands: palm, curled fingers, thumb.
    const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 12);
    for (let k = 0; k < 2; k++) {
      this.hands.push({
        palm: add(new THREE.Mesh(sphere, m.skin)),
        fingers: add(new THREE.Mesh(cap(0.019, 0.045), m.skin)),
        thumb: add(new THREE.Mesh(cap(0.012, 0.032), m.skin)),
      });
    }
    // Shoes: rounded upper on a darker sole.
    const soleGeo = new THREE.CapsuleGeometry(0.045, 0.17, 6, 16).rotateX(Math.PI / 2).scale(1.05, 0.3, 1);
    for (let k = 0; k < 2; k++) {
      this.shoes.push({ upper: add(new THREE.Mesh(sphere, m.shoe)), sole: add(new THREE.Mesh(soleGeo, m.sole)) });
    }
  }

  update(P: Pt) {
    for (const l of this.limbs) {
      const a = P(l.a), b = P(l.b);
      for (const part of l.parts) place(part, a, b);
    }
    for (const j of this.joints) j.mesh.position.copy(P(j.i));

    const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
    const sm = ls.clone().add(rs).multiplyScalar(0.5);
    const hm = lh.clone().add(rh).multiplyScalar(0.5);
    const up = sm.clone().sub(hm);
    const hipHalf = lh.distanceTo(rh) / 2;
    const shHalf = ls.distanceTo(rs) / 2;
    // Hip and shoulder frames: x toward the player's right, y up the spine, z forward.
    const qHip = basis(rh.clone().sub(lh).negate(), up);
    const qSh = basis(rs.clone().sub(ls).negate(), up);
    // Pick the forward direction from the nose so z points the way the chest faces.
    const nose = P(0);
    const fwdHip = new THREE.Vector3(0, 0, 1).applyQuaternion(qHip);
    if (fwdHip.dot(nose.clone().sub(sm)) < 0) { flipZ(qHip); flipZ(qSh); }
    // Shoulder line sits a little below the shoulder joints' tops; the loft ends at the base of the neck.
    this.shirt.update(hm, sm, qHip, qSh, hipHalf, shHalf);
    this.shorts.update(hm, sm, qHip, qHip, hipHalf, shHalf);
    ellipsoid(this.crotch, hm.clone().addScaledVector(up, -0.17), qHip, new THREE.Vector3(hipHalf + 0.02, 0.07, 0.085));
    const spineUp = up.clone().normalize();
    for (const [k, s] of [[0, ls], [1, rs]] as const) {
      ellipsoid(this.delts[k], s.clone().addScaledVector(spineUp, -0.005), qSh, new THREE.Vector3(0.056, 0.054, 0.058));
    }

    // Head and neck.
    const ears = P(7).add(P(8)).multiplyScalar(0.5);
    // Keep the head on a natural-length neck even when the ears are tracked high.
    let headC = ears.clone().addScaledVector(spineUp, 0.015);
    const rise = headC.clone().sub(sm).dot(spineUp);
    if (rise > 0.205) headC = headC.addScaledVector(spineUp, 0.205 - rise);
    const neckBase = sm.clone().addScaledVector(spineUp, Math.max(0.02, up.length() * 0.1));
    place(this.neck, neckBase, headC.clone().lerp(neckBase, 0.25));
    const collarQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), spineUp);
    this.collar.position.copy(neckBase);
    this.collar.quaternion.copy(collarQ);
    this.collar.scale.set(0.062, 0.062, 0.062);
    const headUp = headC.clone().sub(neckBase).normalize();
    let face = nose.clone().sub(ears);
    face.addScaledVector(headUp, -face.dot(headUp));
    if (face.lengthSq() < 1e-6) face = new THREE.Vector3(0, 0, 1).applyQuaternion(qSh);
    face.normalize();
    const side = new THREE.Vector3().crossVectors(headUp, face).normalize();
    const qHead = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, headUp, face));
    ellipsoid(this.head, headC, qHead, new THREE.Vector3(0.078, 0.108, 0.098));
    // Hair: a cap tipped back over the crown.
    const qHair = qHead.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35));
    ellipsoid(this.hair, headC.clone().addScaledVector(headUp, 0.012).addScaledVector(face, -0.008), qHair, new THREE.Vector3(0.084, 0.112, 0.104));
    ellipsoid(this.nose, headC.clone().addScaledVector(face, 0.094).addScaledVector(headUp, -0.012), qHead, new THREE.Vector3(0.012, 0.02, 0.016));
    this.ears.forEach((e, k) => ellipsoid(e, headC.clone().addScaledVector(side, (k ? 1 : -1) * 0.077).addScaledVector(face, -0.005), qHead, new THREE.Vector3(0.01, 0.026, 0.018)));

    // Hands: palm from the wrist toward the knuckles, fingers curled forward, thumb on the inside.
    [[13, 15, 19, 17, 21], [14, 16, 20, 18, 22]].forEach(([el, wr, ix, pk, th], k) => {
      const w = P(wr);
      const kn = P(ix).add(P(pk)).multiplyScalar(0.5);
      let d = kn.clone().sub(w);
      if (d.length() < 0.02) d = w.clone().sub(P(el));
      d.normalize();
      let across = P(ix).sub(P(pk));
      if (across.lengthSq() < 1e-6) across = new THREE.Vector3().crossVectors(d, UP);
      const q = basis(across, d);
      const h = this.hands[k];
      ellipsoid(h.palm, w.clone().addScaledVector(d, 0.045), q, new THREE.Vector3(0.042, 0.05, 0.022));
      const palmNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const fingerC = w.clone().addScaledVector(d, 0.1).addScaledVector(palmNormal, 0.012);
      h.fingers.position.copy(fingerC);
      // Fingers lie across the palm (around the grip).
      h.fingers.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      let thumbDir = P(th).sub(w);
      if (thumbDir.length() < 0.01) thumbDir = d.clone().add(palmNormal);
      thumbDir.normalize();
      h.thumb.position.copy(w.clone().addScaledVector(d, 0.04).addScaledVector(thumbDir, 0.035));
      h.thumb.quaternion.setFromUnitVectors(UP, thumbDir.clone().add(d).normalize());
    });

    // Shoes from heel to toe, sole on the ground side.
    [[27, 29, 31], [28, 30, 32]].forEach(([ank, heel, toe], k) => {
      const a = P(heel), b = P(toe);
      let d = b.clone().sub(a);
      if (d.length() < 0.05) d = new THREE.Vector3(0, 0, -0.2);
      // Shoe frame: z along the foot (kept fairly flat), x across it, y up.
      const zf = d.clone().setY(d.y * 0.6).normalize();
      const xf = new THREE.Vector3().crossVectors(UP, zf).normalize();
      const yf = new THREE.Vector3().crossVectors(zf, xf).normalize();
      const zq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xf, yf, zf));
      const len = Math.max(0.24, d.length() * 1.15);
      const mid = a.clone().lerp(b, 0.5);
      const ankle = P(ank);
      const groundY = Math.min(a.y, b.y);
      const upper = this.shoes[k].upper;
      ellipsoid(upper, new THREE.Vector3(mid.x, Math.max(groundY + 0.05, (ankle.y + groundY) / 2 - 0.01), mid.z).lerp(ankle, 0.15), zq, new THREE.Vector3(0.048, 0.052, len / 2));
      const sole = this.shoes[k].sole;
      sole.position.set(mid.x, groundY + 0.012, mid.z);
      sole.quaternion.copy(zq);
      sole.scale.set(1, 1, len / 0.26);
    });
  }
}

function flipZ(q: THREE.Quaternion) {
  // Rotate 180° about local y: x and z flip, y stays.
  q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
}
