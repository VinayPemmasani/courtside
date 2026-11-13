import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  anchorIndices, ballFlight, centreOfMass, COURT, deeperKnee, dirToCourt, estimateRacket, shareAt, strokeSpace, toCourt,
  type AnchorJoint, type BallFlight, type Handedness, type PoseFrame, type Status, type Stroke, type StrokeSpace, type Vec3, type WeightTransfer,
} from '../core';
import { alongPath, alongSegment, bodyDiscs, type Disc } from './layout';
import { copyFrames, steadyBones } from '../core/tracking';
import { Athlete } from './athlete';
import { Mannequin, mannequinMaterials } from './mannequin';
import { RiggedMannequin } from './rigged';

/**
 * The 3D studio ("arena" look): the player as a glossy jointed mannequin (mannequin.ts; the dressed
 * athlete in athlete.ts is still available) driven by the pose's world landmarks, on a blue hard court
 * under a single overhead spotlight, in the style of a broadcast explainer.
 *
 * How the look is built, all real time in WebGL:
 *  - Physically based materials: a clear-coated porcelain shell lit by a soft studio environment map
 *    (PMREM of RoomEnvironment) for the glossy highlights, plus one spotlight with soft PCF shadows.
 *  - A visible light shaft (an additive cone with a soft edge) and a navy gradient backdrop with fog,
 *    so the court falls away into darkness outside the pool of light.
 *  - Post-processing: ground-truth ambient occlusion (GTAO) for contact shadows where feet meet the
 *    court and limbs cross, a shallow depth of field focused on the player, gentle bloom on the traces,
 *    and a vignette.
 *  - Coaching traces: the swing path, the ball flight and a dashed eye line from the head to the ball.
 */

const NEON = new THREE.Color(1.35, 0.85, 0.22); // amber #f5b544 pushed past 1 so it blooms
const RED = new THREE.Color(2.2, 0.42, 0.7); // rose #ff5c7a, bloomed
const SWING = new THREE.Color(1.5, 0.66, 0.32); // warm orange swing path
const LINE = new THREE.Color('#e9eef8'); // court lines
const NET = new THREE.Color('#f4f6fb');
const EYE = new THREE.Color(0.45, 1.05, 1.6); // eye line, cyan, bloomed
const VIOLET = new THREE.Color(0.5, 0.85, 1.5); // ball flight: pale blue
const BALL = new THREE.Color('#d9f04a');
const NAVY = '#040b1f';

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
   * 'footage' (default when `video` is given): the 3D body is built on the tracked dots and seen
   * exactly as the camera filmed it, same position, size and angle.
   * 'video': a 3D camera placed where the real camera stood, on the virtual court.
   * 'coach' (default otherwise): behind the player looking down the court to the net.
   */
  view?: 'footage' | 'video' | 'coach';
  /** Video frame size in pixels; needed for the footage view. */
  video?: { width: number; height: number };
  /** 'mannequin' (default): the glossy jointed figure. 'athlete': the dressed player. */
  figure?: 'mannequin' | 'athlete';
  /** Dashed line from the eyes to the ball while the ball is shown (default on). */
  eyeLine?: boolean;
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
  private mannequin = new Mannequin();
  private rigged = new RiggedMannequin(mannequinMaterials());
  private figure: Athlete | Mannequin | RiggedMannequin = this.mannequin;
  private gtao: GTAOPass;
  private bokeh: BokehPass;
  private spot!: THREE.SpotLight;
  private fill!: THREE.DirectionalLight;
  private shaft!: THREE.Mesh;
  private eyeLine: THREE.Object3D | null = null;
  /** Soft additive objects kept out of the depth-based passes (AO, depth of field). */
  private soft: THREE.Object3D[] = [];
  /** Court, net, grid and shadow catcher: hidden in the footage view, where they would not line up with the video. */
  private courtGroup = new THREE.Group();
  /** Front-on camera for the footage view: the video frame itself, with no perspective of our own. */
  private ortho = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 100);
  private fog = new THREE.Fog(NAVY, 7, 24);
  private renderPass!: RenderPass;
  private footageCache = new WeakMap<PoseFrame[], { key: string; frames: PoseFrame[]; w: number; h: number }>();
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
    this.renderer.toneMappingExposure = 1.0;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    // Soft studio reflections for the glossy shell; the spotlight does the shaping.
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    this.scene.environmentRotation.set(0, Math.PI * 0.75, 0);
    this.scene.background = backdrop();
    this.scene.fog = this.fog;

    this.buildCourt();
    this.buildLights();

    this.scene.add(this.athlete.group, this.mannequin.group, this.rigged.group);

    // Racket: graphite frame and shaft, pale strings.
    const graphite = new THREE.MeshPhysicalMaterial({ color: '#15171c', roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 1, 12).translate(0, 0.5, 0), graphite);
    shaft.name = 'shaft';
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 12, 64), graphite);
    frame.name = 'frame';
    const strings = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ map: stringBed(), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.6 }));
    strings.name = 'strings';
    for (const m of [shaft, frame, strings]) m.castShadow = true;
    this.racket.add(shaft, frame, strings);
    this.scene.add(this.racket);

    // Felt-yellow ball with a faint glow so it reads against the dark.
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 20), new THREE.MeshPhysicalMaterial({ color: BALL, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#f6ffb0'), emissive: new THREE.Color('#8fa21a'), emissiveIntensity: 0.35 }));
    this.ball.castShadow = true;
    this.ballLight = new THREE.PointLight(new THREE.Color('#e9ff6a'), 0.6, 1.5, 2);
    this.scene.add(this.ball, this.ballLight);

    // Amber glow under each foot for the weight split (the spotlight's shadow now grounds the figure).
    this.glow = this.floorGlow('157,140,255', 1.6, 0.0);
    this.footGlow = [this.floorGlow('245,181,68', 0.6, 0.55), this.floorGlow('245,181,68', 0.6, 0.55)];
    this.soft.push(...this.footGlow, this.glow, this.ballLight);

    // Multisampled target: thin court lines stay solid instead of breaking into dashes at a distance.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType }));
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.gtao = new GTAOPass(this.scene, this.camera, width, height);
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 16 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.gtao.blendIntensity = 0.85;
    this.composer.addPass(this.withoutSoft(this.gtao));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 5, aperture: 0.0035, maxblur: 0.0055 });
    this.composer.addPass(this.withoutSoft(this.bokeh));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.28, 0.35, 1.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(VIGNETTE));
    this.setSize(width, height);
  }

  /** Hide the additive glows, light shaft and traces while a pass draws the scene's depth or normals. */
  private withoutSoft<T extends Pass>(pass: T): T {
    const render = pass.render.bind(pass);
    pass.render = (...args: Parameters<Pass['render']>) => {
      const hidden = [...this.soft, this.shaft, this.trail, this.path, this.eyeLine, ...this.ringMeshes].filter((o): o is THREE.Object3D => !!o && o.visible);
      hidden.forEach((o) => (o.visible = false));
      try { render(...args); } finally { hidden.forEach((o) => (o.visible = true)); }
    };
    return pass;
  }

  /** Resolves when the rigged mannequin has loaded (or failed to), so first frames use the real model. */
  get ready(): Promise<boolean> {
    return this.rigged.ready;
  }

  get canvas() {
    return this.renderer.domElement;
  }

  setSize(width: number, height: number) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
    this.gtao.setSize(width, height);
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
    this.scene.add(new THREE.HemisphereLight('#9fb6ff', '#0a1430', 0.18));
    // The key: one tall spotlight with a soft edge and soft shadows, like an arena light.
    const spot = new THREE.SpotLight('#ffffff', 2.2, 0, 0.36, 0.75, 0);
    spot.name = 'key';
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.radius = 6;
    spot.shadow.bias = -0.0003;
    spot.shadow.normalBias = 0.03;
    spot.shadow.camera.near = 2;
    spot.shadow.camera.far = 30;
    this.spot = spot;
    this.scene.add(spot, spot.target);
    // Fill from the camera side so the figure never goes black where the spot doesn't reach.
    this.fill = new THREE.DirectionalLight('#cfdcff', 0.55);
    this.scene.add(this.fill, this.fill.target);
    // A cool rim from behind to separate the white shell from the backdrop.
    const rim = new THREE.DirectionalLight('#8fb0ff', 1.1);
    rim.name = 'rim';
    rim.position.set(3, 4, 0);
    this.scene.add(rim);
    const under = new THREE.PointLight('#6f8cff', 0.25, 2.5, 2);
    under.position.set(1, 0.3, 12.6);
    under.name = 'under';
    this.scene.add(under);
    // The visible light shaft: a soft additive cone from the lamp to the court.
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1, 1, 64, 1, true).translate(0, -0.5, 0), new THREE.ShaderMaterial(SHAFT));
    this.shaft.renderOrder = 10;
    this.scene.add(this.shaft);
  }

  /** Aim the spotlight (and its visible shaft) at `target` from `from`. */
  private aimSpot(from: THREE.Vector3, target: THREE.Vector3, shaft: boolean) {
    this.spot.position.copy(from);
    this.spot.target.position.copy(target);
    this.spot.target.updateMatrixWorld();
    this.shaft.visible = shaft;
    if (!shaft) return;
    const d = target.clone().sub(from);
    const len = d.length();
    const r = Math.tan(this.spot.angle) * len * 0.42;
    this.shaft.position.copy(from);
    this.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
    this.shaft.scale.set(r, len, r);
  }

  private buildCourt() {
    this.scene.add(this.courtGroup);
    const L = COURT.length / 2, D = COURT.doubles / 2, S = COURT.singles / 2, V = COURT.service;
    // Two-tone hard court: deep blue run-off, brighter blue inside the lines. Lit, so it takes the
    // spotlight pool and the soft shadows directly.
    const surface = (color: string, w: number, l: number, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, envMapIntensity: 0.08 }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.receiveShadow = true;
      this.courtGroup.add(m);
      return m;
    };
    surface('#0f2c6e', 160, 160, 0);
    surface('#1d4fb3', COURT.doubles, COURT.length, 0.001);

    const lineMat = new THREE.MeshStandardMaterial({ color: LINE, roughness: 0.5, emissive: LINE, emissiveIntensity: 0.12 });
    const line = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, len), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(x1 - x0, z1 - z0);
      m.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
      m.receiveShadow = true;
      this.courtGroup.add(m);
    };
    line(-D, -L, -D, L); line(D, -L, D, L); line(-S, -L, -S, L); line(S, -L, S, L);
    line(-D, -L, D, -L); line(-D, L, D, L);
    line(-S, -V, S, -V); line(-S, V, S, V); line(0, -V, 0, V);
    line(0, L, 0, L - 0.15); line(0, -L, 0, -L + 0.15);

    // Net: dark posts, a bright white band, and a dark see-through mesh.
    const postMat = new THREE.MeshPhysicalMaterial({ color: '#1a1f2a', roughness: 0.4, clearcoat: 0.6 });
    for (const x of [-(D + 0.9), D + 0.9]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, COURT.netPost, 12), postMat);
      p.position.set(x, COURT.netPost / 2, 0);
      p.castShadow = true;
      this.courtGroup.add(p);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(COURT.doubles + 1.8, 0.065, 0.025), new THREE.MeshStandardMaterial({ color: NET, roughness: 0.4, emissive: NET, emissiveIntensity: 0.35 }));
    band.position.set(0, COURT.net, 0);
    band.castShadow = true;
    this.courtGroup.add(band);
    const pts: THREE.Vector3[] = [];
    const w = D + 0.9;
    for (let x = -w; x <= w + 1e-6; x += 0.05) pts.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, COURT.net, 0));
    for (let y = 0; y <= COURT.net + 1e-6; y += 0.05) pts.push(new THREE.Vector3(-w, y, 0), new THREE.Vector3(w, y, 0));
    const mesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#0a0f1c', transparent: true, opacity: 0.55 }));
    this.courtGroup.add(mesh);
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
    const v = v3(toCourt(p, this.current.space)).project(this.activeCam);
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
      const v = p.clone().project(this.activeCam);
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

  private get activeCam(): THREE.Camera {
    return this.renderPass.camera;
  }

  /**
   * Frames for the footage view: every landmark sits on its tracked dot (image x and y turned into
   * metres with one scale for the whole clip) and keeps the model's depth. In pose axes, so the
   * rest of the scene (racket, path, rings, labels) works unchanged with a plain identity space.
   */
  private footageFrames(frames: PoseFrame[], video: { width: number; height: number }) {
    const key = `${video.width}x${video.height}`;
    const hit = this.footageCache.get(frames);
    if (hit && hit.key === key) return hit;
    // Pixels per metre: the image spread of the body over its world spread, median over the clip.
    const ks: number[] = [];
    for (const f of frames) {
      if (!f.world || !f.image) continue;
      let mi = { x: 0, y: 0 }, mw = { x: 0, y: 0 }, n = 0;
      for (let j = 11; j < 33; j++) { mi.x += f.image[j].x * video.width; mi.y += f.image[j].y * video.height; mw.x += f.world[j].x; mw.y += f.world[j].y; n++; }
      mi = { x: mi.x / n, y: mi.y / n }; mw = { x: mw.x / n, y: mw.y / n };
      let si = 0, sw = 0;
      for (let j = 11; j < 33; j++) {
        si += (f.image[j].x * video.width - mi.x) ** 2 + (f.image[j].y * video.height - mi.y) ** 2;
        sw += (f.world[j].x - mw.x) ** 2 + (f.world[j].y - mw.y) ** 2;
      }
      if (sw > 1e-4) ks.push(Math.sqrt(si / sw));
    }
    ks.sort((a, b) => a - b);
    const k = ks.length ? ks[Math.floor(ks.length / 2)] : video.height / 2;
    const out = frames.map((f) => ({
      ...f,
      world: f.world && f.image ? f.world.map((p, j) => ({ x: (f.image![j].x * video.width) / k, y: (f.image![j].y * video.height) / k, z: p.z })) : null,
    }));
    const res = { key, frames: out, w: video.width / k, h: video.height / k };
    this.footageCache.set(frames, res);
    return res;
  }

  render(raw: SceneInput) {
    const footage = (raw.view ?? (raw.video ? 'footage' : 'coach')) === 'footage' && raw.video;
    this.courtGroup.visible = !footage;
    this.glow.visible = false;
    this.figure = raw.figure === 'athlete' ? this.athlete : this.rigged.loaded ? this.rigged : this.mannequin;
    this.athlete.group.visible = this.mannequin.group.visible = this.rigged.group.visible = false;
    if (footage) return this.renderFootage(raw);
    this.renderPass.camera = this.camera;
    this.scene.fog = this.fog;
    const input = { ...raw, frames: this.steadyFrames(raw.frames) };
    const w = input.frames[input.i]?.world;
    const { space, flight } = this.spaceFor(input);
    this.figure.group.visible = !!w;
    this.racket.visible = !!w;
    this.current = w ? { w, space } : null;
    const P = (i: number) => v3(toCourt(w![i], space));
    if (w) this.pose(w, P, space, input.hand);

    const o = space.origin;
    const z = input.zoom ?? 1;
    if (input.view === 'video') this.videoCamera(space, input.orbit ?? 0, z);
    else this.coachCamera(space, input.orbit ?? 0, z);

    // Spotlight high above, a little beyond the player and to the camera's right, so the shaft shows
    // in the upper corner and the shadow falls toward the viewer.
    const chest = w ? P(11).add(P(12)).add(P(23)).add(P(24)).multiplyScalar(0.25) : new THREE.Vector3(o.x, 1, o.z);
    const look = chest.clone().sub(this.camera.position).setY(0);
    if (look.lengthSq() < 1e-6) look.set(0, 0, -1);
    look.normalize();
    const right = new THREE.Vector3().crossVectors(look, UP).normalize();
    const floorAt = new THREE.Vector3(chest.x, 0, chest.z);
    this.aimSpot(floorAt.clone().addScaledVector(right, 2.6).addScaledVector(look, 2.2).setY(8.5), floorAt.clone().addScaledVector(look, 0.2), true);
    this.fill.position.copy(this.camera.position).add(new THREE.Vector3(0, 2, 0));
    this.fill.target.position.copy(chest);
    (this.scene.getObjectByName('rim') as THREE.DirectionalLight).position.copy(chest).addScaledVector(look, 4).addScaledVector(right, -2).setY(4);

    this.racketPath(input, space);
    this.ballAndTrail(input, flight);
    this.drawEyeLine(input, P);
    this.drawRings(input, P);
    this.weightGlow(input, P);
    this.glow.visible = false;
    (this.scene.getObjectByName('under') as THREE.PointLight).position.set(o.x, 0.3, o.z + 0.4);

    // Depth of field focused on the player; AO for contact shading.
    this.gtao.enabled = true;
    this.gtao.camera = this.camera;
    this.bokeh.enabled = true;
    this.bokeh.camera = this.camera;
    const u = this.bokeh.uniforms as Record<string, THREE.IUniform>;
    u.focus.value = this.camera.position.distanceTo(chest);
    u.nearClip.value = this.camera.near;
    u.farClip.value = this.camera.far;
    u.aspect.value = this.camera.aspect;
    this.composer.render();
  }

  /** Identity placement for the footage view: pose axes straight into the scene (y up, z toward the camera). */
  private static FLAT: StrokeSpace = { yaw: 0, floor: 0, origin: { x: 0, y: 0, z: 0 } };

  private renderFootage(raw: SceneInput) {
    const ft = this.footageFrames(raw.frames, raw.video!);
    const input: SceneInput = { ...raw, frames: ft.frames, ball: false };
    const space = StudioScene.FLAT;
    const w = input.frames[input.i]?.world;
    this.figure.group.visible = !!w;
    this.racket.visible = !!w;
    this.current = w ? { w, space } : null;
    const P = (i: number) => v3(toCourt(w![i], space));
    if (w) this.pose(w, P, space, input.hand, false);

    // The video frame, front on: x right 0..w, y up 0..-h (image y runs down), filling the canvas.
    const canvasAspect = this.canvas.width / this.canvas.height;
    let fw = ft.w, fh = ft.h;
    if (fw / fh < canvasAspect) fw = fh * canvasAspect; else fh = fw / canvasAspect;
    const cx = ft.w / 2, cy = -ft.h / 2;
    const zoom = input.zoom ?? 1;
    Object.assign(this.ortho, { left: cx - (fw / 2) * zoom, right: cx + (fw / 2) * zoom, top: cy + (fh / 2) * zoom, bottom: cy - (fh / 2) * zoom });
    this.ortho.position.set(0, 0, 50);
    this.ortho.up.set(0, 1, 0);
    this.ortho.lookAt(0, 0, 0);
    this.ortho.updateProjectionMatrix();
    this.renderPass.camera = this.ortho;
    this.scene.fog = null;

    // Spot from the camera side, above and to the left, so the figure reads in the camera's view.
    const c = w ? P(23).add(P(24)).multiplyScalar(0.5) : new THREE.Vector3(cx, cy, 0);
    this.aimSpot(new THREE.Vector3(c.x - 2.5, c.y + 6, 7), c, false);
    this.fill.position.set(c.x + 2, c.y + 1, 10);
    this.fill.target.position.copy(c);
    (this.scene.getObjectByName('rim') as THREE.DirectionalLight).position.set(c.x + 3, c.y + 3, -4);
    // The depth-based passes assume a perspective camera.
    this.gtao.enabled = false;
    this.bokeh.enabled = false;
    (this.scene.getObjectByName('under') as THREE.PointLight).position.set(c.x, c.y - 0.9, 1);

    this.racketPath(input, space);
    this.ballAndTrail(input, null);
    this.drawEyeLine(input, P);
    this.drawRings(input, P, true);
    this.footGlow.forEach((g) => (g.visible = false));
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

  private pose(w: Vec3[], P: (i: number) => THREE.Vector3, space: StrokeSpace, hand: Handedness, onCourt = true) {
    // Keep the shoes on the court: lift the figure if tracking puts a foot below the floor.
    const side = hand === 'left' ? 'l' : 'r';
    this.figure.group.position.y = 0;
    this.figure.update(P, side);
    const rig = this.figure === this.rigged ? this.rigged : null;
    const lowest = rig ? rig.lowest() : Math.min(...[29, 30, 31, 32].map((i) => P(i).y));
    const lift = onCourt && lowest < 0.0 ? -lowest : 0;
    this.figure.group.position.y = lift;
    this.racket.position.set(0, lift, 0);
    // The rigged model keeps its own arm lengths: move the racket so its grip stays in the model's hand.
    const modelHand = rig?.hand(side);
    if (modelHand) this.racket.position.copy(modelHand.sub(P(hand === 'left' ? 15 : 16)));

    // Racket.
    const r = estimateRacket(w, hand);
    this.racket.visible = !!r;
    this.shown.racket = [];
    if (!r) return;
    const grip = v3(toCourt(r.grip, space));
    const head = v3(toCourt(r.head, space));
    const tip = v3(toCourt(r.tip, space));
    this.shown.racket = [grip, head, tip].map((p) => p.clone().add(this.racket.position));
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
    this.path = tube(pts, 0.012, SWING);
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
    this.trail = tube(pts, 0.01, VIOLET);
    this.scene.add(this.trail);
  }

  /** Dashed line from between the eyes to the ball: where the player should be looking. */
  private drawEyeLine(input: SceneInput, P: (i: number) => THREE.Vector3) {
    if (this.eyeLine) { this.scene.remove(this.eyeLine); disposeTree(this.eyeLine); this.eyeLine = null; }
    const w = input.frames[input.i]?.world;
    if (!w || input.eyeLine === false || !this.ball.visible) return;
    const eyes = (this.figure === this.rigged ? this.rigged.eyes() : null) ?? P(2).add(P(5)).multiplyScalar(0.5).add(new THREE.Vector3(0, this.figure.group.position.y, 0));
    const to = this.ball.position.clone();
    const d = to.clone().sub(eyes);
    const len = d.length();
    if (len < 0.2) return;
    // Start just in front of the face and stop short of the ball.
    this.eyeLine = dashes(eyes.addScaledVector(d, 0.09 / len), to.addScaledVector(d, -0.1 / len), EYE);
    this.scene.add(this.eyeLine);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshBasicMaterial({ color: EYE, toneMapped: false }));
    dot.position.copy(eyes);
    this.eyeLine.add(dot);
  }

  private drawRings(input: SceneInput, P: (i: number) => THREE.Vector3, frontOn = false) {
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
      // Flat on the ground plane for the court views; tipped toward the camera when seen front on.
      m.rotation.x = frontOn ? Math.PI / 2 - 0.45 : Math.PI / 2;
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

function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((k) => k.dispose()); else mat?.dispose();
  });
}

/** A dashed line of short glowing capsules from a to b (dash and gap in metres). */
function dashes(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, dash = 0.07, gap = 0.05, r = 0.0065) {
  const d = b.clone().sub(a);
  const len = d.length();
  const n = Math.max(1, Math.floor((len + gap) / (dash + gap)));
  const geo = new THREE.CylinderGeometry(r, r, dash, 8);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, toneMapped: false }), n);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  const m = new THREE.Matrix4();
  const step = len / n;
  for (let k = 0; k < n; k++) {
    m.compose(a.clone().addScaledVector(d, ((k + 0.5) * step) / len), q, new THREE.Vector3(1, Math.min(1, step / (dash + gap)), 1));
    mesh.setMatrixAt(k, m);
  }
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/** Navy backdrop: lighter toward the upper right where the lamp hangs, near black at the bottom. */
function backdrop() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const x = c.getContext('2d')!;
  const v = x.createLinearGradient(0, 0, 0, 512);
  v.addColorStop(0, '#0b1d4a');
  v.addColorStop(0.55, '#06122f');
  v.addColorStop(1, NAVY);
  x.fillStyle = v;
  x.fillRect(0, 0, 256, 512);
  const r = x.createRadialGradient(200, 40, 0, 200, 40, 260);
  r.addColorStop(0, 'rgba(70,110,210,0.55)');
  r.addColorStop(1, 'rgba(70,110,210,0)');
  x.fillStyle = r;
  x.fillRect(0, 0, 256, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A racket string bed: a pale cross-hatch with transparent gaps. */
function stringBed() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(236,240,248,0.95)';
  x.lineWidth = 3;
  for (let k = 8; k < 256; k += 16) {
    x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 256); x.stroke();
    x.beginPath(); x.moveTo(0, k); x.lineTo(256, k); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The light shaft: brightest along the axis and near the lamp, fading at the edges and toward the floor. */
const SHAFT: THREE.ShaderMaterialParameters = {
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  fog: false,
  uniforms: { color: { value: new THREE.Color('#7aa2ff') }, strength: { value: 0.22 } },
  vertexShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV; varying float vH;
    void main() {
      vH = -position.y; // 0 at the lamp, 1 at the floor
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float strength;
    varying vec3 vN; varying vec3 vV; varying float vH;
    void main() {
      float edge = pow(abs(dot(normalize(vN), normalize(vV))), 3.0);
      float fall = smoothstep(0.0, 0.05, vH) * (1.0 - 0.8 * vH);
      gl_FragColor = vec4(color * strength * edge * fall, 1.0);
    }`,
};

/** Darken the corners a little, like a lens. */
const VIGNETTE = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.55 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(p * vec2(1.0, 1.15)));
      gl_FragColor = vec4(c.rgb * mix(1.0 - amount, 1.0, v), c.a);
    }`,
};
