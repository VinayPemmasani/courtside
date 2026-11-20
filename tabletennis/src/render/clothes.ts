import * as THREE from 'three';

/**
 * Clothes for the clay athlete: a t-shirt, shorts and trainers made as skinned shells over the body.
 *
 * Each garment takes the body triangles in its region, pushes them out along the surface normal
 * (looser toward hems, like cloth hanging off the body) and keeps the body's bone weights, so the
 * clothes bend with the skeleton. Regions are in the model's bind pose: a T-pose about 1.81 m tall,
 * facing +z with its left side on +x.
 */

interface Garment {
  name: string;
  /** Is a triangle (by its centroid) part of the garment? */
  has: (p: THREE.Vector3) => boolean;
  /** How far out from the skin, in metres, at a vertex. */
  offset: (p: THREE.Vector3) => number;
  /** Smoothing passes: how much the cloth hides the body's shape. */
  relax: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const GARMENTS: Garment[] = [
  {
    // Short sleeves to mid upper arm, hem over the top of the shorts, open round the neck.
    name: 'shirt',
    has: (p) => {
      const ax = Math.abs(p.x);
      if (p.y < 0.86 || p.y > 1.62 || ax > 0.335) return false;
      // Round neckline: leave the neck and the front of the collar bone open.
      if (ax < 0.075 && p.y > 1.45 - (p.z > 0 ? 0.03 : -0.02)) return false;
      if (ax < 0.12 && p.y > 1.53) return false;
      return true;
    },
    offset: (p) => 0.016 + 0.028 * smooth(1.12, 0.9, p.y) + 0.012 * smooth(0.25, 0.335, Math.abs(p.x)) + 0.008 * smooth(1.2, 1.4, p.y),
    relax: 14,
  },
  {
    // Shorts from the waist to just above the knee, loose at the leg openings.
    name: 'shorts',
    has: (p) => p.y > 0.6 && p.y < 1.1 && Math.abs(p.x) < 0.3,
    offset: (p) => 0.016 + 0.028 * smooth(0.8, 0.6, p.y),
    relax: 8,
  },
  {
    // Trainers: the foot, padded, with a thicker sole.
    name: 'shoes',
    has: (p) => p.y < 0.135,
    offset: (p) => 0.014 + 0.01 * smooth(0.05, 0.0, p.y),
    relax: 12,
  },
];

/** Build the garments for a skinned body and add them beside it, sharing its skeleton. */
export function dress(body: THREE.SkinnedMesh, material: THREE.Material): THREE.SkinnedMesh[] {
  const g = body.geometry;
  const pos = g.attributes.position as THREE.BufferAttribute;
  if (!g.attributes.normal) g.computeVertexNormals();
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const si = g.attributes.skinIndex as THREE.BufferAttribute;
  const sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const index = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);

  // Average the normals of vertices that share a position (UV seams) so shells don't split open.
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const sum = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const n = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
    const s = sum.get(k);
    if (s) s.add(n); else sum.set(k, n);
  }

  const out: THREE.SkinnedMesh[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  for (const garment of GARMENTS) {
    const map = new Map<number, number>();
    const tris: number[] = [];
    for (let t = 0; t < index.length; t += 3) {
      a.fromBufferAttribute(pos, index[t]);
      b.fromBufferAttribute(pos, index[t + 1]);
      c.fromBufferAttribute(pos, index[t + 2]);
      if (!garment.has(p.copy(a).add(b).add(c).divideScalar(3))) continue;
      for (let k = 0; k < 3; k++) {
        const v = index[t + k];
        if (!map.has(v)) map.set(v, map.size);
        tris.push(map.get(v)!);
      }
    }
    if (!tris.length) continue;
    const n = map.size;
    const P = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    const skin: THREE.Vector3[] = [], dirs: THREE.Vector3[] = [], mins: number[] = [];
    // Vertices that share a position (UV seams) move as one.
    const weld = new Map<string, number>();
    const wid: number[] = [];
    for (const [v, i] of map) {
      p.fromBufferAttribute(pos, v);
      const dir = sum.get(key(v))!.clone().normalize();
      skin[i] = p.clone();
      dirs[i] = dir;
      const off = garment.offset(p);
      mins[i] = off * 0.6;
      p.addScaledVector(dir, off);
      P.set([p.x, p.y, p.z], i * 3);
      SI.set([si.getX(v), si.getY(v), si.getZ(v), si.getW(v)], i * 4);
      SW.set([sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], i * 4);
      const k = key(v);
      if (!weld.has(k)) weld.set(k, weld.size);
      wid[i] = weld.get(k)!;
    }
    // Cloth doesn't follow every muscle: relax the shell (Laplacian smoothing over welded
    // neighbours), then push back out wherever it sank too close to the skin.
    const nb: Set<number>[] = Array.from({ length: weld.size }, () => new Set<number>());
    for (let t = 0; t < tris.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const x = wid[tris[t + k]], y = wid[tris[t + (k + 1) % 3]];
        nb[x].add(y);
        nb[y].add(x);
      }
    }
    const W = new Float32Array(weld.size * 3);
    const cnt = new Uint16Array(weld.size);
    for (let it = 0; it < garment.relax; it++) {
      W.fill(0);
      cnt.fill(0);
      for (let i = 0; i < n; i++) {
        if (cnt[wid[i]]) continue;
        W[wid[i] * 3] = P[i * 3]; W[wid[i] * 3 + 1] = P[i * 3 + 1]; W[wid[i] * 3 + 2] = P[i * 3 + 2];
        cnt[wid[i]] = 1;
      }
      const avg = new Float32Array(weld.size * 3);
      for (let w = 0; w < weld.size; w++) {
        let ax = 0, ay = 0, az = 0;
        for (const o of nb[w]) { ax += W[o * 3]; ay += W[o * 3 + 1]; az += W[o * 3 + 2]; }
        const m = nb[w].size || 1;
        avg[w * 3] = W[w * 3] * 0.4 + (ax / m) * 0.6;
        avg[w * 3 + 1] = W[w * 3 + 1] * 0.4 + (ay / m) * 0.6;
        avg[w * 3 + 2] = W[w * 3 + 2] * 0.4 + (az / m) * 0.6;
      }
      for (let i = 0; i < n; i++) {
        p.set(avg[wid[i] * 3], avg[wid[i] * 3 + 1], avg[wid[i] * 3 + 2]);
        const out = p.clone().sub(skin[i]).dot(dirs[i]);
        if (out < mins[i]) p.addScaledVector(dirs[i], mins[i] - out);
        P.set([p.x, p.y, p.z], i * 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    geo.setIndex(tris);
    geo.computeVertexNormals();
    // Welded vertices share one normal, so seams in the body's UVs don't show as creases.
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const acc = new Float32Array(weld.size * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) acc[wid[i] * 3 + k] += nrm.array[i * 3 + k];
    for (let i = 0; i < n; i++) {
      p.set(acc[wid[i] * 3], acc[wid[i] * 3 + 1], acc[wid[i] * 3 + 2]).normalize();
      nrm.setXYZ(i, p.x, p.y, p.z);
    }
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.name = garment.name;
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    mesh.scale.copy(body.scale);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    body.parent!.add(mesh);
    mesh.bind(body.skeleton, body.bindMatrix);
    out.push(mesh);
  }
  return out;
}
