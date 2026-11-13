import * as THREE from 'three';

/**
 * A tennis racket modelled to real proportions (685 mm long, 100 sq in head, 22 mm beam, open
 * throat, octagonal handle with an overgrip, 16 x 19 string bed), in its own frame:
 * origin in the middle of the hand on the handle, +y along the shaft to the tip, +x across the
 * strings and +z out of the string face.
 */

export const RACKET_MODEL = {
  /** Head centre and tip, from the hand (m). */
  head: 0.47,
  tip: 0.625,
  butt: -0.06,
};

const HEAD_A = 0.128; // half width, outside of the frame
const HEAD_B = 0.162; // half length
const BEAM_W = 0.0125; // frame thickness in the string plane
const BEAM_D = 0.022; // frame depth

function ellipse(a: number, b: number, cy: number, n = 96) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(t) * a, cy + Math.sin(t) * b));
  }
  return pts;
}

/** The string bed: 16 mains, 19 crosses, pale strings on a transparent background. */
function stringTexture() {
  const W = 512, H = 640;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, W, H);
  const mains = 16, crosses = 19;
  x.lineCap = 'round';
  // Crosses under, mains over, with a faint shadow where they weave.
  for (let i = 0; i < crosses; i++) {
    const y = ((i + 0.5) / crosses) * H;
    x.strokeStyle = 'rgba(30,34,44,0.35)';
    x.lineWidth = 7;
    x.beginPath(); x.moveTo(0, y + 1.5); x.lineTo(W, y + 1.5); x.stroke();
    x.strokeStyle = 'rgba(232,236,242,0.96)';
    x.lineWidth = 5;
    x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
  }
  for (let i = 0; i < mains; i++) {
    const X = ((i + 0.5) / mains) * W;
    x.strokeStyle = 'rgba(30,34,44,0.35)';
    x.lineWidth = 7;
    x.beginPath(); x.moveTo(X + 1.5, 0); x.lineTo(X + 1.5, H); x.stroke();
    x.strokeStyle = 'rgba(244,246,250,0.98)';
    x.lineWidth = 5;
    x.beginPath(); x.moveTo(X, 0); x.lineTo(X, H); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildRacket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'racket-model';
  const graphite = new THREE.MeshPhysicalMaterial({ color: '#16181d', roughness: 0.38, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.18 });
  const accent = new THREE.MeshPhysicalMaterial({ color: '#c8a23a', roughness: 0.35, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.2 });
  const grip = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.92 });
  const bumper = new THREE.MeshStandardMaterial({ color: '#0d0e11', roughness: 0.7 });
  const hc = RACKET_MODEL.head;

  // Head: a flat elliptical beam, extruded to the frame depth with softened edges.
  const outer = new THREE.Shape(ellipse(HEAD_A, HEAD_B, hc));
  outer.holes.push(new THREE.Path(ellipse(HEAD_A - BEAM_W, HEAD_B - BEAM_W, hc).reverse()));
  const headGeo = new THREE.ExtrudeGeometry(outer, { depth: BEAM_D - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 96 });
  headGeo.translate(0, 0, -(BEAM_D - 0.004) / 2);
  const head = new THREE.Mesh(headGeo, graphite);
  head.name = 'frame';
  g.add(head);
  // Bumper guard over the top of the head.
  const bump = new THREE.Mesh(new THREE.TorusGeometry(1, 0.0045, 6, 48, Math.PI * 0.55), bumper);
  bump.scale.set(HEAD_A + 0.0005, HEAD_B + 0.0005, 2.6);
  bump.rotation.z = Math.PI * 0.225;
  bump.position.y = hc;
  g.add(bump);

  // Strings, inside the beam.
  const sa = HEAD_A - BEAM_W + 0.0005, sb = HEAD_B - BEAM_W + 0.0005;
  const bed = new THREE.ShapeGeometry(new THREE.Shape(ellipse(sa, sb, hc, 64)), 64);
  const uv = bed.attributes.uv as THREE.BufferAttribute;
  const pos = bed.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + sa) / (2 * sa), (pos.getY(i) - (hc - sb)) / (2 * sb));
  const strings = new THREE.Mesh(bed, new THREE.MeshStandardMaterial({ map: stringTexture(), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.55, depthWrite: true }));
  strings.name = 'strings';
  g.add(strings);

  // Open throat: two arms from the shaft splitting into the bottom of the head.
  const throatBase = 0.255;
  const join = hc - HEAD_B * 0.93;
  const joinX = HEAD_A * 0.36;
  for (const s of [-1, 1]) {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(s * 0.006, throatBase, 0),
      new THREE.Vector3(s * 0.012, throatBase + 0.04, 0),
      new THREE.Vector3(s * joinX * 0.7, join - 0.03, 0),
      new THREE.Vector3(s * joinX * 1.05, join + 0.012, 0),
    );
    const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1, 10), graphite);
    // Tube of radius 1 squashed to the beam's rectangle-ish section.
    arm.geometry.computeBoundingBox();
    const p = arm.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      // Points are curve + normal*1; rebuild as curve + scaled offset.
      const tParam = Math.floor(i / 11) / 24;
      const c = curve.getPoint(Math.min(1, tParam));
      const off = new THREE.Vector3(p.getX(i) - c.x, p.getY(i) - c.y, p.getZ(i) - c.z);
      off.x *= 0.0065; off.y *= 0.0065; off.z *= 0.0105;
      p.setXYZ(i, c.x + off.x, c.y + off.y, c.z + off.z);
    }
    p.needsUpdate = true;
    arm.geometry.computeVertexNormals();
    g.add(arm);
  }

  // Shaft from the handle up to the throat, slightly flattened.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0135, throatBase - 0.13 + 0.01, 16).translate(0, (throatBase + 0.13) / 2, 0), graphite);
  shaft.scale.z = 1.25;
  shaft.name = 'shaft';
  g.add(shaft);
  // A thin metallic band where the grip ends.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0142, 0.0142, 0.012, 8).translate(0, 0.134, 0), accent);
  collar.rotation.y = Math.PI / 8;
  g.add(collar);

  // Handle: octagonal, wrapped in a white overgrip, with a butt cap.
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0162, 0.19, 8, 1).translate(0, 0.128 - 0.095, 0), grip);
  handle.rotation.y = Math.PI / 8;
  g.add(handle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0168, 0.014, 8).translate(0, RACKET_MODEL.butt - 0.002, 0), graphite);
  cap.rotation.y = Math.PI / 8;
  g.add(cap);

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = m.name !== 'strings'; }
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
