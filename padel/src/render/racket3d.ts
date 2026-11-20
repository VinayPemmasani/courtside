import * as THREE from 'three';

/**
 * A padel paddle modelled to real proportions (455 mm long, 260 mm wide, 38 mm thick, round
 * head with a solid perforated face, short handle with a wrist cord), in its own frame:
 * origin in the middle of the hand on the handle, +y along the shaft to the tip, +x across the
 * face and +z out of the hitting face.
 */

export const RACKET_MODEL = {
  /** Head centre and tip, from the hand (m). */
  head: 0.255,
  tip: 0.39,
  butt: -0.065,
};

const HEAD_A = 0.13; // half width
const HEAD_B = 0.138; // half length
const DEPTH = 0.038;

function paddleOutline(cy: number, n = 96) {
  // Round head that narrows into a short open bridge above the handle.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2;
    let x = Math.cos(t) * HEAD_A, y = cy + Math.sin(t) * HEAD_B;
    if (Math.sin(t) < -0.55) x *= 0.82 + 0.18 * (1 + Math.sin(t)) / 0.45; // taper toward the throat
    pts.push(new THREE.Vector2(x, y));
  }
  return pts;
}

/** Face: carbon weave look with the drilled hole pattern and a lime brand band. */
function faceTexture() {
  const W = 512, H = 544;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#121820';
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 8) { x.fillStyle = i % 16 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)'; x.fillRect(i, 0, 4, H); }
  x.fillStyle = '#d7ff3a';
  x.beginPath(); x.moveTo(0, H * 0.78); x.lineTo(W, H * 0.6); x.lineTo(W, H * 0.66); x.lineTo(0, H * 0.84); x.fill();
  x.fillStyle = '#5fd4ff';
  x.fillRect(0, H * 0.12, W, 6);
  // Holes: a hex grid inside the sweet spot.
  x.fillStyle = '#05080c';
  for (let r = 0; r < 9; r++) for (let k = 0; k < 9; k++) {
    const hx = W / 2 + (k - 4 + (r % 2) * 0.5) * 42, hy = H * 0.2 + r * 38;
    if (((hx - W / 2) / (W * 0.4)) ** 2 + ((hy - H * 0.38) / (H * 0.3)) ** 2 > 1) continue;
    x.beginPath(); x.arc(hx, hy, 8, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildRacket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'paddle-model';
  const frame = new THREE.MeshPhysicalMaterial({ color: '#0e1218', roughness: 0.4, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.2 });
  const grip = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.92 });
  const cord = new THREE.MeshStandardMaterial({ color: '#d7ff3a', roughness: 0.6 });
  const hc = RACKET_MODEL.head;

  // Head: solid foam-core body, extruded to 38 mm with rounded edges.
  const outline = paddleOutline(hc);
  const headGeo = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: DEPTH - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 3, curveSegments: 96 });
  headGeo.translate(0, 0, -(DEPTH - 0.012) / 2);
  const head = new THREE.Mesh(headGeo, frame);
  head.name = 'frame';
  g.add(head);

  // Printed faces on both sides, just proud of the body.
  const faceGeo = new THREE.ShapeGeometry(new THREE.Shape(paddleOutline(hc, 64).map((p) => p.clone().multiplyScalar(0.985).setY(hc + (p.y - hc) * 0.985))), 64);
  const uv = faceGeo.attributes.uv as THREE.BufferAttribute;
  const pos = faceGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + HEAD_A) / (2 * HEAD_A), (pos.getY(i) - (hc - HEAD_B)) / (2 * HEAD_B));
  const faceMat = new THREE.MeshPhysicalMaterial({ map: faceTexture(), roughness: 0.45, clearcoat: 0.6 });
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(faceGeo, faceMat);
    f.name = 'strings';
    f.position.z = s * (DEPTH / 2 + 0.0006);
    if (s < 0) f.rotation.y = Math.PI;
    g.add(f);
  }

  // Bridge: short neck from the head into the handle.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.024, 0.06, 16).translate(0, 0.095, 0), frame);
  neck.scale.z = 1.2;
  g.add(neck);
  // Handle wrapped in overgrip, with a butt cap and a wrist cord loop.
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0175, 0.135, 8, 1).translate(0, 0.0, 0), grip);
  handle.rotation.y = Math.PI / 8;
  g.add(handle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.018, 0.012, 8).translate(0, RACKET_MODEL.butt - 0.002, 0), frame);
  g.add(cap);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.003, 6, 32), cord);
  loop.position.set(0, RACKET_MODEL.butt - 0.055, 0);
  loop.rotation.y = Math.PI / 2;
  g.add(loop);

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  return g;
}

/** Put the racket model in a hand: grip point, shaft direction and string-face normal (court axes). */
export function placeRacket(model: THREE.Object3D, grip: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3) {
  const y = dir.clone().normalize();
  const z = face.clone().addScaledVector(y, -face.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  model.position.copy(grip);
  model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
