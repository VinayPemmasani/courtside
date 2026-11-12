import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  anchorIndices, ballFlight, centreOfMass, COURT, deeperKnee, dirToCourt, estimateRacket, shareAt, strokeSpace, toCourt,
  type AnchorJoint, type BallFlight, type Handedness, type PoseFrame, type Status, type Stroke, type StrokeSpace, type Vec3, type WeightTransfer,
} from '../core';
import { alongPath, alongSegment, bodyDiscs, type Disc } from './layout';
import { copyFrames, steadyBones } from '../core/tracking';
import { Athlete } from './athlete';

/**
 * The 3D studio: the player as a dressed 3D athlete (see athlete.ts) driven by the pose's world landmarks,
 * standing on a dark wireframe court with glowing lines, ball and highlight rings.
 */

const NEON = new THREE.Color(1.35, 0.85, 0.22); // amber #f5b544 pushed past 1 so it blooms
const RED = new THREE.Color(2.2, 0.42, 0.7); // rose #ff5c7a, bloomed
const LINE = new THREE.Color(0.16, 0.6, 0.55); // teal court lines, just under bloom
const NET = new THREE.Color(0.85, 0.89, 0.98);
const VIOLET = new THREE.Color(0.75, 0.62, 1.6); // ball flight, bloomed
const BALL = new THREE.Color(1.15, 1.35, 0.35);

export interface Ring {
  anchor: AnchorJoint;
  status: Status;
}

export interface SceneInput {
  frames: PoseFrame[];
  i: number;
  fps: number;
  hand: Handedness;
  stroke?: Stroke;
  weight?: WeightTransfer | null;
  rings?: Ring[];
  /** Show the ball and its flight. */
  ball?: boolean;
  /** Extra camera swing around the player, radians (for a slow orbit in reels). */
  orbit?: number;
  /** Camera distance factor: 1 is the usual view, smaller moves in on the player. */
  zoom?: number;
  /**
   * 'video' (default): the 3D camera stands where the real camera stood, so the figure matches the
   * clip's angle, facing and lean. 'coach': behind the player looking down the court to the net.
   */
  view?: 'video' | 'coach';
}

const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const UP = new THREE.Vector3(0, 1, 0);

export class StudioScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 200);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private athlete = new Athlete();
  /** Frames with constant limb lengths, per input clip, so the figure doesn't stretch. */
  private steady = new WeakMap<PoseFrame[], PoseFrame[]>();
  private racket = new THREE.Group();
  private ball: THREE.Mesh;
  private ballLight: THREE.PointLight;
  private trail: THREE.Mesh | null = null;
  private path: THREE.Mesh | null = null;
  private ringMeshes: THREE.Mesh[] = [];
  private glow: THREE.Mesh;
  private footGlow: THREE.Mesh[];
  private spaces = new WeakMap<Stroke, { key: string; space: StrokeSpace; flight: BallFlight | null }>();
  private lastSpace: StrokeSpace | null = null;
  /** Court-space racket, swing path and ball flight of the last frame, for keeping text off them. */
  private shown: { racket: THREE.Vector3[]; path: THREE.Vector3[]; flight: THREE.Vector3[] } = { racket: [], path: [], flight: [] };

  constructor(width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.scene.background = new THREE.Color('#05070c');
    this.scene.fog = new THREE.Fog('#05070c', 14, 38);

    this.buildCourt();
    this.buildLights();

    this.scene.add(this.athlete.group);

    // Racket: dark shaft, neon frame, faint strings.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1, 10).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.5 }));
    shaft.name = 'shaft';
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 10, 48), new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false }));
    frame.name = 'frame';
    const strings = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.7, 0.28), transparent: true, opacity: 0.16, side: THREE.DoubleSide, toneMapped: false }));
    strings.name = 'strings';
    this.racket.add(shaft, frame, strings);
    this.scene.add(this.racket);

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), new THREE.MeshBasicMaterial({ color: BALL, toneMapped: false }));
    this.ballLight = new THREE.PointLight(new THREE.Color('#e9ff6a'), 1.6, 2, 2);
    this.scene.add(this.ball, this.ballLight);

    // Soft violet pool under the player, and an amber glow under each foot for the weight split.
    this.glow = this.floorGlow('157,140,255', 1.6, 0.22);
    this.footGlow = [this.floorGlow('245,181,68', 0.6, 0.55), this.floorGlow('245,181,68', 0.6, 0.55)];

    // Multisampled target: thin court lines stay solid instead of breaking into dashes at a distance.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.38, 0.25, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setSize(width, height);
  }

  get canvas() {
    return this.renderer.domElement;
  }

  setSize(width: number, height: number) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
    this.camera.aspect = width / height;
    // Portrait frames need a wider vertical view to keep the court in.
    this.camera.fov = width < height ? 50 : 38;
    this.camera.updateProjectionMatrix();
  }

  private floorGlow(rgb: string, size: number, alpha: number) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.005;
    this.scene.add(m);
    return m;
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#c8d0ff', '#05070c', 0.45));
    const key = new THREE.DirectionalLight('#ffffff', 1.5);
    key.position.set(-4, 9, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.045;
    const sc = key.shadow.camera;
    sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 40;
    key.target.position.set(1, 0, 12);
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight('#9d8cff', 1.8);
    rim.position.set(3, 4, 0);
    this.scene.add(rim);
    const under = new THREE.PointLight('#9d8cff', 0.35, 2.5, 2);
    under.position.set(1, 0.3, 12.6);
    under.name = 'under';
    this.scene.add(under);
  }

  private buildCourt() {
    // An unlit near-black floor, so the court reads like the app's dark panels, with shadows laid on a separate catcher.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({ color: '#07090f' }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const shadows = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.6 }));
    shadows.rotation.x = -Math.PI / 2;
    shadows.position.y = 0.001;
    shadows.receiveShadow = true;
    this.scene.add(shadows);
    const grid = new THREE.GridHelper(80, 80, '#1b2232', '#121826');
    grid.position.y = 0.002;
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.55;
    this.scene.add(grid);

    const lineMat = new THREE.MeshBasicMaterial({ color: LINE, toneMapped: false });
    const line = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, len), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(x1 - x0, z1 - z0);
      m.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2);
      this.scene.add(m);
    };
    const L = COURT.length / 2, D = COURT.doubles / 2, S = COURT.singles / 2, V = COURT.service;
    line(-D, -L, -D, L); line(D, -L, D, L); line(-S, -L, -S, L); line(S, -L, S, L);
    line(-D, -L, D, -L); line(-D, L, D, L);
    line(-S, -V, S, -V); line(-S, V, S, V); line(0, -V, 0, V);
    line(0, L, 0, L - 0.15); line(0, -L, 0, -L + 0.15);

    // Net: posts, a glowing top band, and a faint mesh.
    const post = new THREE.MeshBasicMaterial({ color: NET, toneMapped: false });
    for (const x of [-(D + 0.9), D + 0.9]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, COURT.netPost, 8), post);
      p.position.set(x, COURT.netPost / 2, 0);
      this.scene.add(p);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(COURT.doubles + 1.8, 0.05, 0.02), post);
    band.position.set(0, COURT.net, 0);
    this.scene.add(band);
    const pts: THREE.Vector3[] = [];
    const w = D + 0.9;
    for (let x = -w; x <= w + 1e-6; x += 0.25) pts.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, COURT.net, 0));
    for (let y = 0; y <= COURT.net + 1e-6; y += 0.15) pts.push(new THREE.Vector3(-w, y, 0), new THREE.Vector3(w, y, 0));
    const mesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#6c768b', transparent: true, opacity: 0.16 }));
    this.scene.add(mesh);
  }

  private spaceFor(input: SceneInput): { space: StrokeSpace; flight: BallFlight | null } {
    const st = input.stroke;
    if (!st) return { space: this.lastSpace ?? strokeSpace(input.frames, { startFrame: input.i, endFrame: input.i, contactFrame: input.i }, input.hand), flight: null };
    const key = `${st.startFrame}:${st.endFrame}:${st.contactFrame}:${st.type}`;
    let hit = this.spaces.get(st);
    if (!hit || hit.key !== key) {
      const space = strokeSpace(input.frames, st, input.hand);
      hit = { key, space, flight: ballFlight(input.frames, st, space, input.hand, st.type === 'serve') };
      this.spaces.set(st, hit);
    }
    this.lastSpace = hit.space;
    return hit;
  }

  /** Last frame's court transform, for placing labels. */
  private current: { w: Vec3[]; space: StrokeSpace } | null = null;

  /** Screen position (canvas pixels) of a pose world point in the last rendered frame. */
  project(p: Vec3): { x: number; y: number } | null {
    if (!this.current) return null;
    const v = v3(toCourt(p, this.current.space)).project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.canvas.width, y: ((1 - v.y) / 2) * this.canvas.height };
  }

  /** Screen position of a callout anchor in the last rendered frame. */
  projectAnchor(anchor: AnchorJoint, hand: Handedness) {
    if (!this.current) return null;
    const w = this.current.w;
    const idx = anchorIndices(anchor, hand, deeperKnee(w));
    const p = idx.reduce((s, i) => ({ x: s.x + w[i].x / idx.length, y: s.y + w[i].y / idx.length, z: s.z + w[i].z / idx.length }), { x: 0, y: 0, z: 0 });
    return this.project(p);
  }

  /**
   * The mannequin, racket, swing path and ball of the last rendered frame as discs in canvas
   * pixels, so labels can be placed in the empty space around them.
   */
  screenDiscs(): Disc[] {
    if (!this.current) return [];
    const { w, space } = this.current;
    const screen = (p: THREE.Vector3) => {
      const v = p.clone().project(this.camera);
      return v.z > 1 ? null : { x: ((v.x + 1) / 2) * this.canvas.width, y: ((1 - v.y) / 2) * this.canvas.height };
    };
    const pts = w.map((p) => screen(v3(toCourt(p, space))));
    const out = bodyDiscs(pts);
    // Sizes on screen follow the torso, as the limbs do.
    const sm = pts[11] && pts[12] ? { x: (pts[11].x + pts[12].x) / 2, y: (pts[11].y + pts[12].y) / 2 } : null;
    const hm = pts[23] && pts[24] ? { x: (pts[23].x + pts[24].x) / 2, y: (pts[23].y + pts[24].y) / 2 } : null;
    const torso = sm && hm ? Math.hypot(sm.x - hm.x, sm.y - hm.y) : this.canvas.height * 0.08;
    // Feet and hands are drawn bigger than their landmarks.
    for (const i of [15, 16, 29, 30, 31, 32]) if (pts[i]) out.push({ ...pts[i]!, r: torso * 0.22 });
    const [grip, head, tip] = this.shown.racket.map(screen);
    if (grip && tip) out.push(...alongSegment(grip, tip, torso * 0.12));
    if (head) out.push({ ...head, r: torso * 0.38 });
    const line = (vs: THREE.Vector3[]) => vs.map(screen).filter((p): p is { x: number; y: number } => !!p);
    out.push(...alongPath(line(this.shown.path), torso * 0.1));
    out.push(...alongPath(line(this.shown.flight), torso * 0.12));
    const ball = this.ball.visible ? screen(this.ball.position) : null;
    if (ball) out.push({ ...ball, r: torso * 0.4 });
    return out;
  }

  private steadyFrames(frames: PoseFrame[]) {
    let f = this.steady.get(frames);
    if (!f) {
      f = copyFrames(frames);
      steadyBones(f);
      this.steady.set(frames, f);
    }
    return f;
  }

  render(raw: SceneInput) {
    const input = { ...raw, frames: this.steadyFrames(raw.frames) };
    const w = input.frames[input.i]?.world;
    const { space, flight } = this.spaceFor(input);
    this.athlete.group.visible = !!w;
    this.racket.visible = !!w;
    this.current = w ? { w, space } : null;
    const P = (i: number) => v3(toCourt(w![i], space));
    if (w) this.pose(w, P, space, input.hand);

    const o = space.origin;
    const z = input.zoom ?? 1;
    if ((input.view ?? 'video') === 'video') this.videoCamera(space, input.orbit ?? 0, z);
    else this.coachCamera(space, input.orbit ?? 0, z);

    this.racketPath(input, space);
    this.ballAndTrail(input, flight);
    this.drawRings(input, P);
    this.weightGlow(input, P);
    (this.scene.getObjectByName('under') as THREE.PointLight).position.set(o.x, 0.3, o.z + 0.4);
    this.composer.render();
  }

  /**
   * Put the 3D camera where the filming camera was. Pose world landmarks are in the camera's own
   * axes, so "toward the camera" and "camera up" map straight onto the court; the levelling in
   * StrokeSpace keeps the court flat while the view keeps the camera's real tilt.
   */
  private videoCamera(space: StrokeSpace, orbit: number, zoom: number) {
    const toCam = v3(dirToCourt({ x: 0, y: 0, z: -1 }, space)).normalize();
    const camUp = v3(dirToCourt({ x: 0, y: -1, z: 0 }, space)).normalize();
    if (orbit) { toCam.applyAxisAngle(UP, orbit); camUp.applyAxisAngle(UP, orbit); }
    // Hips are the pose origin; aim a little above them so the whole body sits in frame.
    const target = new THREE.Vector3(space.origin.x, Math.max(0.6, space.floor * 0.95), space.origin.z);
    // Distance that makes a ~1.75 m player fill about 62% of the frame height.
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const d = (1.75 / (0.62 * 2 * half)) * zoom;
    this.camera.position.copy(target).addScaledVector(toCam, d);
    // Never below the court surface.
    this.camera.position.y = Math.max(0.25, this.camera.position.y);
    this.camera.up.copy(camUp);
    this.camera.lookAt(target);
  }

  /** Behind and above the player, looking past them to the net. */
  private coachCamera(space: StrokeSpace, orbit: number, z: number) {
    const o = space.origin;
    const back = 5.2 * z, height = 0.9 + 1.7 * z;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(o.x + Math.sin(orbit) * back + 0.5, height, o.z + Math.cos(orbit) * back);
    // z = 1 looks past the player to the net; by z = 0.4 the aim is on the player's chest.
    const t = Math.min(1, Math.max(0, (z - 0.4) / 0.6));
    this.camera.lookAt(o.x * (0.6 * t + (1 - t)), 0.15 * t + 1.0 * (1 - t), o.z - 6.5 * t);
  }

  private pose(w: Vec3[], P: (i: number) => THREE.Vector3, space: StrokeSpace, hand: Handedness) {
    // Keep the shoes on the court: lift the figure if tracking puts a foot below the floor.
    const lowest = Math.min(...[29, 30, 31, 32].map((i) => P(i).y));
    const lift = lowest < 0.0 ? -lowest : 0;
    this.athlete.group.position.y = lift;
    this.racket.position.y = lift;
    this.athlete.update(P);

    // Racket.
    const r = estimateRacket(w, hand);
    this.racket.visible = !!r;
    this.shown.racket = [];
    if (!r) return;
    const grip = v3(toCourt(r.grip, space));
    const head = v3(toCourt(r.head, space));
    const tip = v3(toCourt(r.tip, space));
    this.shown.racket = [grip, head, tip];
    const dir = tip.clone().sub(grip).normalize();
    const shaft = this.racket.getObjectByName('shaft') as THREE.Mesh;
    place(shaft, grip, grip.clone().lerp(tip, 0.5));
    const face = r.face ? v3(toCourt({ x: r.grip.x + r.face.x, y: r.grip.y + r.face.y, z: r.grip.z + r.face.z }, space)).sub(grip).normalize() : new THREE.Vector3().crossVectors(dir, UP).normalize();
    const across = new THREE.Vector3().crossVectors(face, dir).normalize();
    const basis = new THREE.Matrix4().makeBasis(across, dir, face);
    for (const name of ['frame', 'strings']) {
      const m = this.racket.getObjectByName(name) as THREE.Mesh;
      m.position.copy(head);
      m.quaternion.setFromRotationMatrix(basis);
      m.scale.set(0.125, 0.165, name === 'frame' ? 0.15 : 1);
    }
  }

  private racketPath(input: SceneInput, space: StrokeSpace) {
    if (this.path) { this.scene.remove(this.path); this.path.geometry.dispose(); this.path = null; }
    this.shown.path = [];
    const st = input.stroke;
    if (!st) return;
    const pts: THREE.Vector3[] = [];
    for (let i = st.startFrame; i <= Math.min(input.i, st.endFrame); i++) {
      const r = estimateRacket(input.frames[i]?.world ?? null, input.hand);
      if (r) pts.push(v3(toCourt(r.head, space)));
    }
    if (pts.length < 3) return;
    this.shown.path = pts;
    this.path = tube(pts, 0.018, NEON);
    this.scene.add(this.path);
  }

  private ballAndTrail(input: SceneInput, flight: BallFlight | null) {
    if (this.trail) { this.scene.remove(this.trail); this.trail.geometry.dispose(); this.trail = null; }
    const st = input.stroke;
    const t = st ? (input.i - st.contactFrame) / input.fps : 0;
    const now = input.ball !== false && flight ? flight.at(t) : null;
    this.ball.visible = !!now;
    this.ballLight.visible = !!now;
    this.shown.flight = [];
    if (!now || !flight) return;
    this.ball.position.copy(v3(now));
    this.shown.flight = [this.ball.position.clone()];
    this.ballLight.position.copy(this.ball.position);
    const pts: THREE.Vector3[] = [];
    for (let k = Math.max(-flight.before, t - 0.45); k <= t + 1e-6; k += 1 / 60) {
      const p = flight.at(k);
      if (p) pts.push(v3(p));
    }
    if (pts.length < 3) return;
    this.shown.flight = [...pts, this.ball.position.clone()];
    this.trail = tube(pts, 0.016, VIOLET);
    this.scene.add(this.trail);
  }

  private drawRings(input: SceneInput, P: (i: number) => THREE.Vector3) {
    for (const m of this.ringMeshes) { this.scene.remove(m); m.geometry.dispose(); }
    this.ringMeshes = [];
    const w = input.frames[input.i]?.world;
    if (!w || !input.rings) return;
    for (const r of input.rings) {
      const idx = anchorIndices(r.anchor, input.hand, deeperKnee(w));
      const c = idx.map(P).reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / idx.length);
      const big = r.anchor === 'shoulders' || r.anchor === 'hips';
      const m = new THREE.Mesh(new THREE.TorusGeometry(big ? 0.34 : 0.16, 0.008, 8, 64), new THREE.MeshBasicMaterial({ color: r.status === 'fix' ? RED : NEON, toneMapped: false }));
      m.position.copy(c);
      m.rotation.x = Math.PI / 2;
      this.scene.add(m);
      this.ringMeshes.push(m);
    }
  }

  private weightGlow(input: SceneInput, P: (i: number) => THREE.Vector3) {
    const w = input.frames[input.i]?.world;
    const share = shareAt(input.weight ?? null, input.i);
    this.glow.visible = !!w;
    if (w) {
      const com = v3(toCourt(centreOfMass(w), this.current!.space));
      this.glow.position.set(com.x, 0.004, com.z);
    }
    const wt = input.weight;
    this.footGlow.forEach((g, k) => {
      g.visible = !!(w && wt && share !== null);
      if (!g.visible) return;
      const ankle = P(k === 0 ? wt!.front : wt!.back);
      const amount = k === 0 ? share! : 1 - share!;
      g.position.set(ankle.x, 0.006, ankle.z);
      g.scale.setScalar(0.35 + 0.7 * amount);
      (g.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.6 * amount;
    });
  }

  dispose() {
    this.renderer.dispose();
    this.composer.dispose();
  }
}

/** Stretch a unit-height mesh (base at the origin, along +y) from a to b. */
function place(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(d.length(), 1e-4);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  m.scale.set(1, len, 1);
}

/** Place a unit sphere as an ellipsoid with the given side (x) and up (y) directions and radii. */
function orient(m: THREE.Object3D, centre: THREE.Vector3, side: THREE.Vector3, up: THREE.Vector3, radii: THREE.Vector3) {
  const y = up.clone().normalize();
  let x = side.clone().addScaledVector(y, -side.dot(y));
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3(1, 0, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  m.position.copy(centre);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  m.scale.copy(radii);
}

function tube(pts: THREE.Vector3[], r: number, color: THREE.Color) {
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(200, pts.length * 3), r, 8, false), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.95 }));
}
