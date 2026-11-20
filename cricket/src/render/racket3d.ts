import * as THREE from 'three';

/**
 * A cricket bat modelled to real proportions (965 mm long, 108 mm wide blade, a ridged back with
 * the thickest part ("the middle") about a third of the way up from the toe, a cane handle under a
 * rubber grip), in its own frame: origin in the bottom hand on the handle, +y along the bat to the
 * toe, +x across the face and +z out of the hitting face.
 *
 * The exports keep the names the 3D scene uses for any hand-held implement.
 */

export const RACKET_MODEL = {
  /** The middle of the bat and the toe, from the bottom hand (m). */
  head: 0.5,
  tip: 0.7,
  /** Top of the handle, above the top hand. */
  butt: -0.17,
};

const SPLICE = 0.11; // where the handle enters the blade
const BLADE_W = 0.054; // half width
const EDGE = 0.02; // edge thickness (half)

/** The back of the blade: thin at the shoulders and toe, thickest in the middle, with a central ridge. */
function bladeGeometry() {
  const len = RACKET_MODEL.tip - SPLICE;
  const segY = 40, segX = 16;
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const idx: number[] = [];
  // Front face (flat, z = +EDGE*0.6) and back (ridged), joined at the edges.
  const spine = (t: number) => {
    // t: 0 at the shoulders, 1 at the toe. Peak profile about two thirds down.
    const peak = Math.exp(-((t - 0.66) ** 2) / 0.09);
    return 0.022 + 0.026 * peak - 0.012 * Math.max(0, t - 0.92) / 0.08;
  };
  const halfW = (t: number) => {
    // Rounded shoulders and a slightly rounded toe.
    const sh = Math.min(1, t / 0.05);
    const toe = t > 0.97 ? Math.sqrt(Math.max(0, 1 - ((t - 0.97) / 0.03) ** 2)) : 1;
    return BLADE_W * (0.82 + 0.18 * Math.sqrt(sh)) * (0.9 + 0.1 * toe);
  };
  const front = 0.012;
  for (let j = 0; j <= segY; j++) {
    const t = j / segY;
    const y = SPLICE + t * len;
    const w = halfW(t);
    // Front face row.
    for (let i = 0; i <= segX; i++) {
      const x = -w + (2 * w * i) / segX;
      pos.push(x, y, front);
    }
    // Back row: the edges are EDGE thick, the spine bulges.
    for (let i = 0; i <= segX; i++) {
      const u = -1 + (2 * i) / segX;
      const x = u * w;
      const z = -(EDGE + (spine(t) - EDGE * 0.6) * Math.pow(1 - Math.abs(u), 1.4));
      pos.push(x, y, z);
    }
  }
  const row = (segX + 1) * 2;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d); // front, facing +z
      const A = a + segX + 1, B = A + 1, C = A + row, D = C + 1;
      idx.push(A, B, C, B, D, C); // back, facing -z
    }
    // Edges: front corner to back corner.
    for (const [f, k] of [[0, segX + 1], [segX, 2 * segX + 1]] as const) {
      const a = j * row + f, b = j * row + k, c = a + row, d = b + row;
      if (f === 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  // Toe cap.
  const last = segY * row;
  for (let i = 0; i < segX; i++) idx.push(last + i, last + i + 1, last + segX + 1 + i, last + i + 1, last + segX + 2 + i, last + segX + 1 + i);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Willow grain on the face: pale cream with fine straight grains. */
function willowTexture() {
  const W = 256, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ecd9ac';
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const px = (i + 0.5) * (W / 26) + (Math.random() - 0.5) * 4;
    x.strokeStyle = `rgba(160,120,60,${0.12 + Math.random() * 0.12})`;
    x.lineWidth = 1 + Math.random() * 1.5;
    x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (Math.random() - 0.5) * 6, H); x.stroke();
  }
  // Maker's band near the shoulders: the app's own simple mark.
  x.fillStyle = '#123d2a';
  x.fillRect(0, 40, W, 70);
  x.fillStyle = '#f2c14e';
  x.font = 'bold 44px sans-serif';
  x.textAlign = 'center';
  x.fillText('CREASE', W / 2, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildRacket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'racket-model';
  const willow = new THREE.MeshPhysicalMaterial({ color: '#f1e2bd', map: willowTexture(), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, side: THREE.DoubleSide });
  const gripMat = new THREE.MeshStandardMaterial({ color: '#b3202c', roughness: 0.85 });
  const cane = new THREE.MeshStandardMaterial({ color: '#c9a66b', roughness: 0.7 });
  const twine = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.8 });

  const blade = new THREE.Mesh(bladeGeometry(), willow);
  blade.name = 'blade';
  // UVs from position so the grain runs along the bat.
  const pos = blade.geometry.attributes.position as THREE.BufferAttribute;
  const uv: number[] = [];
  for (let i = 0; i < pos.count; i++) uv.push((pos.getX(i) + BLADE_W) / (2 * BLADE_W), 1 - (pos.getY(i) - SPLICE) / (RACKET_MODEL.tip - SPLICE));
  blade.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.add(blade);

  // Handle: an oval cane under a rubber grip, with twine binding where it meets the blade.
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0175, SPLICE - RACKET_MODEL.butt, 20).translate(0, (SPLICE + RACKET_MODEL.butt) / 2, 0), gripMat);
  handle.scale.z = 0.85;
  g.add(handle);
  const bind = new THREE.Mesh(new THREE.CylinderGeometry(0.0182, 0.0182, 0.035, 20).translate(0, SPLICE - 0.012, 0), twine);
  bind.scale.z = 0.85;
  g.add(bind);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.024, 0.04, 20).translate(0, SPLICE + 0.01, -0.006), cane);
  neck.scale.z = 0.9;
  g.add(neck);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0178, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gripMat);
  cap.position.y = RACKET_MODEL.butt;
  cap.rotation.x = Math.PI;
  cap.scale.z = 0.85;
  g.add(cap);

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  return g;
}

/** Put the bat in the hands: bottom-hand point, bat direction (handle to toe) and face normal (scene axes). */
export function placeRacket(model: THREE.Object3D, grip: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3) {
  const y = dir.clone().normalize();
  const z = face.clone().addScaledVector(y, -face.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  model.position.copy(grip);
  model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
