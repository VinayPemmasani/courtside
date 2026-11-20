import * as THREE from 'three';

/**
 * A table tennis bat to real proportions (blade 158 x 152 mm, 6 mm thick with two 2 mm rubbers,
 * red on the forehand side and black on the backhand, flared 100 mm handle), in its own frame:
 * origin in the middle of the hand on the handle, +y along the handle to the top of the blade, +x
 * across the blade and +z out of the forehand (red) face.
 */

export const RACKET_MODEL = {
  /** Blade centre and tip, from the hand (m). */
  head: 0.135,
  tip: 0.215,
  butt: -0.055,
};

const BLADE_W = 0.079; // half width
const BLADE_H = 0.076; // half height
const BLADE_T = 0.0062; // wood
const RUBBER_T = 0.0021; // sponge + topsheet

/** The blade outline: slightly wider than tall, flattening into the shoulders above the handle. */
function bladeShape(inset = 0) {
  const s = new THREE.Shape();
  const cy = RACKET_MODEL.head;
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(t) * (BLADE_W - inset);
    let y = Math.sin(t) * (BLADE_H - inset);
    // Shoulders: flatten the bottom of the ellipse where it meets the handle.
    if (y < -BLADE_H * 0.72) y = -BLADE_H * 0.72 + (y + BLADE_H * 0.72) * 0.35;
    if (i === 0) s.moveTo(x, cy + y); else s.lineTo(x, cy + y);

  }
  return s;
}

function pimpleTexture(base: string) {
  const W = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = W;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, W, W);
  // A faint sheen and fine grain, like an inverted rubber topsheet.
  const g = x.createLinearGradient(0, 0, W, W);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, W);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.035)`;
    x.fillRect(Math.random() * W, Math.random() * W, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRacket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'racket-model';
  const wood = new THREE.MeshStandardMaterial({ color: '#d8b07a', roughness: 0.55 });
  const red = new THREE.MeshPhysicalMaterial({ map: pimpleTexture('#c8102e'), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const black = new THREE.MeshPhysicalMaterial({ map: pimpleTexture('#141518'), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.4 });
  const handleMat = new THREE.MeshPhysicalMaterial({ color: '#e9d2a6', roughness: 0.5, clearcoat: 0.4 });
  const capMat = new THREE.MeshStandardMaterial({ color: '#1f6feb', roughness: 0.4, metalness: 0.2 });

  // Blade: wood core with an edge, rubbers on either face, slightly inset from the edge.
  const core = new THREE.ExtrudeGeometry(bladeShape(), { depth: BLADE_T, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 64 });
  core.translate(0, 0, -BLADE_T / 2);
  g.add(new THREE.Mesh(core, wood));
  for (const [side, mat] of [[1, red], [-1, black]] as const) {
    const rub = new THREE.ExtrudeGeometry(bladeShape(0.0012), { depth: RUBBER_T, bevelEnabled: false, curveSegments: 64 });
    rub.translate(0, 0, side > 0 ? BLADE_T / 2 + 0.0008 : -BLADE_T / 2 - 0.0008 - RUBBER_T);
    // UVs for the texture.
    const pos = rub.attributes.position as THREE.BufferAttribute;
    const uv = rub.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + BLADE_W) / (2 * BLADE_W), (pos.getY(i) - RACKET_MODEL.head + BLADE_H) / (2 * BLADE_H));
    const m = new THREE.Mesh(rub, mat);
    m.name = side > 0 ? 'rubber-fh' : 'rubber-bh';
    g.add(m);
  }

  // Flared handle: wider at the butt, wooden, with a coloured end cap.
  const top = RACKET_MODEL.head - BLADE_H * 0.72;
  const len = top - RACKET_MODEL.butt;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0165, len, 20).translate(0, RACKET_MODEL.butt + len / 2, 0), handleMat);
  handle.scale.z = 0.95;
  g.add(handle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.017, 0.008, 20).translate(0, RACKET_MODEL.butt - 0.003, 0), capMat);
  cap.scale.z = 0.95;
  g.add(cap);

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
