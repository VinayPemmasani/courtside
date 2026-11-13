import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Pt } from './athlete';

/**
 * The studio mannequin as a professionally made, rigged model, posed from the tracked landmarks.
 *
 * Model: "Mannequiny" (Open 3D Mannequin) by Luciano Muñoz for GDQuest, CC-BY 4.0,
 * https://github.com/gdquest-demos/godot-3d-mannequin (attribution: GDQuest and contributors,
 * https://www.gdquest.com/). It has a 45-bone humanoid rig with fingers and a jointed, segmented body.
 * We use its mesh and skeleton with our own materials; its animations are not used.
 *
 * Retargeting: the model's bind pose is a T-pose facing +z with its left side on +x. Each driven bone
 * gets a target frame built from the landmarks (a main direction plus a second direction that fixes
 * the twist); the rotation from the bind frame to that frame is applied to the bone's bind world
 * rotation. Torso and head use hip, shoulder and ear lines; arms and legs use the elbow and knee bend
 * to set the twist so elbows and knees point the right way; forearms, shins and feet then swing to
 * their segment. Bone lengths stay the model's, scaled to the player's leg and trunk length.
 */

const MODEL_URL = `${import.meta.env.BASE_URL ?? '/'}studio/mannequin.glb`;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Rotation whose x axis is `a` and whose y axis is `b` made perpendicular to `a`. */
function frame(a: THREE.Vector3, b: THREE.Vector3) {
  const x = a.clone().normalize();
  let y = b.clone().addScaledVector(x, -b.dot(x));
  if (y.lengthSq() < 1e-10) y = Math.abs(x.y) < 0.9 ? Y.clone().addScaledVector(x, -x.y) : Z.clone().addScaledVector(x, -x.z);
  y.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

interface Bind {
  bone: THREE.Bone;
  /** Local rotation in the bind pose. */
  local: THREE.Quaternion;
  /** World rotation in the bind pose. */
  world: THREE.Quaternion;
}

const DRIVEN = ['pelvis', 'spine_01', 'spine_02', 'neck_01', 'head', 'claviclel', 'clavicler',
  'upperarml', 'lowerarml', 'handl', 'upperarmr', 'lowerarmr', 'handr',
  'thighl', 'calfl', 'footl', 'balll', 'thighr', 'calfr', 'footr', 'ballr'] as const;
type BoneName = (typeof DRIVEN)[number];
const FINGERS = ['index', 'middle', 'ring'];

export class RiggedMannequin {
  readonly group = new THREE.Group();
  /** Resolves true once the model is loaded and ready to pose, false if it could not be loaded. */
  readonly ready: Promise<boolean>;
  loaded = false;
  private root: THREE.Object3D | null = null;
  private bones = new Map<string, Bind>();
  /** Bind-pose measurements used for scaling and frames. */
  private bindLeg = 1;
  private bindTrunk = 1;
  private bindHand: Record<'l' | 'r', { main: THREE.Vector3; side: THREE.Vector3 }> = { l: { main: X.clone(), side: Z.clone() }, r: { main: X.clone().negate(), side: Z.clone() } };
  private pelvisAboveHips = 0.027;

  constructor(materials: { shell: THREE.Material; joint: THREE.Material; dark: THREE.Material }) {
    this.ready = new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => {
      this.setup(gltf.scene, materials);
      return true;
    }).catch((e) => {
      console.warn('Studio mannequin model could not be loaded; using the built-in figure.', e);
      return false;
    });
  }

  private setup(scene: THREE.Object3D, materials: { shell: THREE.Material; joint: THREE.Material; dark: THREE.Material }) {
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.skeleton.pose();
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const name = (m.material as THREE.Material).name;
      // Body shell in the glossy white; the joint rings and the ear discs in the cooler joint grey.
      m.material = name === 'Azul' ? materials.shell : materials.joint;
    });
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      this.bones.set(b.name, { bone: b, local: b.quaternion.clone(), world: b.getWorldQuaternion(new THREE.Quaternion()) });
    });
    const at = (n: string) => this.bones.get(n)!.bone.getWorldPosition(new THREE.Vector3());
    this.bindLeg = at('thighl').distanceTo(at('calfl')) + at('calfl').distanceTo(at('footl'));
    this.bindTrunk = at('upperarml').add(at('upperarmr')).multiplyScalar(0.5).y - at('thighl').add(at('thighr')).multiplyScalar(0.5).y;
    this.pelvisAboveHips = at('pelvis').y - at('thighl').y;
    for (const s of ['l', 'r'] as const) {
      this.bindHand[s] = { main: at(`middle_01${s}`).sub(at(`hand${s}`)), side: at(`index_01${s}`).sub(at(`ring_01${s}`)) };
    }
    this.root = scene;
    this.group.add(scene);
    this.loaded = true;
  }

  private b(n: BoneName | string) {
    return this.bones.get(n)!;
  }

  /** Give a bone a world rotation (its parent's world matrix must be current). */
  private setWorld(n: string, q: THREE.Quaternion) {
    const { bone } = this.b(n);
    const pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(pq.invert().multiply(q));
    bone.updateMatrixWorld(true);
  }

  /** Rotate a bone from its bind frame (bindMain, bindSide) to the target frame (main, side). */
  private aim(n: string, bindMain: THREE.Vector3, bindSide: THREE.Vector3, main: THREE.Vector3, side: THREE.Vector3) {
    const delta = frame(main, side).multiply(frame(bindMain, bindSide).invert());
    this.setWorld(n, delta.multiply(this.b(n).world.clone()));
    return delta;
  }

  /** Turn a bone (already placed) so the direction to its child points along `dir`, with no twist. */
  private swing(n: string, child: string, dir: THREE.Vector3) {
    const { bone } = this.b(n);
    const p = bone.getWorldPosition(new THREE.Vector3());
    const now = this.b(child).bone.getWorldPosition(new THREE.Vector3()).sub(p).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(now, dir.clone().normalize());
    this.setWorld(n, turn.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
  }

  private worldPos(n: string) {
    return this.b(n).bone.getWorldPosition(new THREE.Vector3());
  }

  /** Where the model's hand is (wrist bone), for keeping the racket in it. */
  hand(side: 'l' | 'r') {
    return this.loaded ? this.worldPos(`hand${side}`) : null;
  }

  /** A point between the model's eyes, for the eye line. */
  eyes() {
    if (!this.loaded) return null;
    const h = this.b('head');
    const turn = h.bone.getWorldQuaternion(new THREE.Quaternion()).multiply(h.world.clone().invert());
    return this.worldPos('head').add(new THREE.Vector3(0, 0.1, 0.085).multiplyScalar(this.root!.scale.x).applyQuaternion(turn));
  }

  /** Height of the lowest point of the soles. */
  lowest() {
    if (!this.loaded) return 0;
    const s = this.root!.scale.x;
    return Math.min(...['balll', 'ballr'].map((n) => this.worldPos(n).y - 0.02 * s), ...['footl', 'footr'].map((n) => this.worldPos(n).y - 0.1 * s));
  }

  update(P: Pt, dominant: 'l' | 'r' = 'r') {
    if (!this.loaded || !this.root) return;
    const root = this.root;
    const lh = P(23), rh = P(24), ls = P(11), rs = P(12);
    const hm = lh.clone().add(rh).multiplyScalar(0.5);
    const sm = ls.clone().add(rs).multiplyScalar(0.5);
    const up = sm.clone().sub(hm);

    // Scale to the player's legs and trunk (bone lengths are already steadied for the 3D view).
    const leg = (P(23).distanceTo(P(25)) + P(25).distanceTo(P(27)) + P(24).distanceTo(P(26)) + P(26).distanceTo(P(28))) / 2;
    const s = THREE.MathUtils.clamp((leg / this.bindLeg + up.length() / this.bindTrunk) / 2, 0.6, 1.6);
    root.scale.setScalar(s);
    root.position.set(0, 0, 0);
    for (const [, v] of this.bones) v.bone.quaternion.copy(v.local);
    root.updateMatrixWorld(true);

    // Torso: hips frame for the pelvis, shoulders frame for the chest, the spine halfway between.
    const fwdOf = (side: THREE.Vector3) => new THREE.Vector3().crossVectors(side, up).normalize();
    const hipSide = lh.clone().sub(rh);
    const shSide = ls.clone().sub(rs);
    const nose = P(0);
    const dPelvis = this.aim('pelvis', Y, X, up, hipSide);
    const pelvisPos = this.worldPos('pelvis');
    root.position.copy(hm.clone().addScaledVector(up.clone().normalize(), this.pelvisAboveHips * s).sub(pelvisPos));
    root.updateMatrixWorld(true);
    const dChest = frame(up, shSide).multiply(frame(Y, X).invert());
    const mid = dPelvis.clone().slerp(dChest, 0.5);
    this.setWorld('spine_01', mid.clone().multiply(this.b('spine_01').world.clone()));
    this.setWorld('spine_02', dChest.clone().multiply(this.b('spine_02').world.clone()));
    for (const c of ['claviclel', 'clavicler']) this.setWorld(c, dChest.clone().multiply(this.b(c).world.clone()));

    // Head from the ear line and the nose.
    const ears = P(7).add(P(8)).multiplyScalar(0.5);
    // Fall back to the shoulders when the ears or nose were not tracked apart.
    let earSide = P(7).sub(P(8));
    if (earSide.length() < 0.05) earSide = shSide.clone();
    let face = nose.clone().sub(ears);
    if (face.length() < 0.03) face = fwdOf(shSide);
    const dHead = frame(earSide, face).multiply(frame(X, Z).invert());
    this.setWorld('neck_01', dChest.clone().slerp(dHead, 0.5).multiply(this.b('neck_01').world.clone()));
    this.setWorld('head', dHead.clone().multiply(this.b('head').world.clone()));

    const chestFwd = Z.clone().applyQuaternion(dChest);
    const hipFwd = Z.clone().applyQuaternion(dPelvis);
    /** The way a joint's point faces: away from the line between the limb's ends, else `fallback`. */
    const bendOut = (a: THREE.Vector3, j: THREE.Vector3, c: THREE.Vector3, fallback: THREE.Vector3) =>
      j.clone().sub(a.clone().add(c).multiplyScalar(0.5)).addScaledVector(fallback, 0.015);

    // Arms: upper arm aimed at the elbow with the elbow's point behind; forearm swung to the wrist; hand framed by its knuckles.
    for (const [side, sh, el, wr, ix, pk] of [['l', 11, 13, 15, 19, 17], ['r', 12, 14, 16, 20, 18]] as const) {
      const S = P(sh), E = P(el), W = P(wr);
      const bindMain = side === 'l' ? X : X.clone().negate();
      this.aim(`upperarm${side}`, bindMain, Z.clone().negate(), E.clone().sub(S), bendOut(S, E, W, chestFwd.clone().negate()));
      this.swing(`lowerarm${side}`, `hand${side}`, W.clone().sub(E));
      let main = P(ix).add(P(pk)).multiplyScalar(0.5).sub(W);
      if (main.length() < 0.01) main = W.clone().sub(E);
      const across = P(ix).sub(P(pk));
      const bh = this.bindHand[side];
      this.aim(`hand${side}`, bh.main, bh.side, main, across.lengthSq() > 1e-8 ? across : bh.side.clone());
      this.curl(side, side === dominant ? 1 : 0.55);
    }

    // Legs: thigh aimed at the knee with the kneecap forward; shin swung to the ankle; foot to the toes.
    for (const [side, hp, kn, an, he, to] of [['l', 23, 25, 27, 29, 31], ['r', 24, 26, 28, 30, 32]] as const) {
      const H = P(hp), K = P(kn), A = P(an);
      this.aim(`thigh${side}`, Y.clone().negate(), Z, K.clone().sub(H), bendOut(H, K, A, hipFwd));
      this.swing(`calf${side}`, `foot${side}`, A.clone().sub(K));
      let foot = P(to).sub(P(he));
      if (foot.length() < 0.03) foot = hipFwd.clone();
      // The foot bone runs ankle -> ball (down and forward); aim it along the sole, tipped down a little.
      const dir = foot.normalize().addScaledVector(Y, -0.9).normalize();
      this.swing(`foot${side}`, `ball${side}`, dir);
    }
  }

  /** Close the fingers around a grip (amount 1) or half-relaxed. */
  private curl(side: 'l' | 'r', amount: number) {
    const hand = this.b(`hand${side}`).bone;
    const hq = hand.getWorldQuaternion(new THREE.Quaternion());
    const bh = this.bindHand[side];
    // Hand axes in the bind pose: across the knuckles, and the palm normal; curl about the across axis.
    const bindDelta = hq.clone().multiply(this.b(`hand${side}`).world.clone().invert());
    const across = bh.side.clone().applyQuaternion(bindDelta).normalize();
    const main = bh.main.clone().applyQuaternion(bindDelta).normalize();
    const palm = new THREE.Vector3().crossVectors(main, across).normalize().multiplyScalar(side === 'l' ? 1 : -1);
    const axis = new THREE.Vector3().crossVectors(main, palm).normalize();
    const angles = [0.95, 1.05, 0.75].map((a) => a * amount);
    for (const f of FINGERS) {
      for (let k = 1; k <= 3; k++) {
        const n = `${f}_0${k}${side}`;
        const bind = this.bones.get(n);
        if (!bind) continue;
        const pq = bind.bone.parent!.getWorldQuaternion(new THREE.Quaternion());
        const cur = pq.clone().multiply(bind.local);
        this.setWorld(n, new THREE.Quaternion().setFromAxisAngle(axis, angles[k - 1]).multiply(cur));
      }
    }
    // Thumb wraps part way.
    for (let k = 1; k <= 3; k++) {
      const n = `thumb_0${k}${side}`;
      const bind = this.bones.get(n);
      if (!bind) continue;
      const pq = bind.bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      this.setWorld(n, new THREE.Quaternion().setFromAxisAngle(axis, 0.35 * amount).multiply(pq.clone().multiply(bind.local)));
    }
  }
}
