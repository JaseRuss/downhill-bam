import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collects static scenery and merges it into one mesh per (material, street chunk).
 * Thousands of building/landmark pieces become a few hundred draw calls.
 */
const statics: THREE.Object3D[] = [];

export function addStatic<T extends THREE.Object3D>(o: T): T {
  statics.push(o);
  return o;
}

const canon = new Map<string, THREE.Material>();

function repeatOf(m: any): THREE.Texture | null {
  const t: THREE.Texture | undefined = m.map;
  if (!t) return null;
  if (t.repeat.x === 1 && t.repeat.y === 1 && t.offset.x === 0 && t.offset.y === 0) return null;
  return t;
}

/** A shared material whose texture has repeat 1 (the repeat gets baked into UVs instead). */
function canonical(m: THREE.Material): THREE.Material {
  const t = repeatOf(m);
  if (!t) return m;
  const s: any = m;
  const key = [
    m.type, s.map?.source?.uuid, s.emissiveMap?.source?.uuid, s.color?.getHex(), s.emissive?.getHex(),
    s.emissiveIntensity, s.roughness, s.metalness, m.transparent, m.opacity, m.side,
  ].join('|');
  let c = canon.get(key);
  if (!c) {
    c = m.clone();
    const cs: any = c;
    for (const k of ['map', 'emissiveMap']) {
      if (cs[k]) {
        const tt: THREE.Texture = cs[k].clone();
        tt.repeat.set(1, 1);
        tt.offset.set(0, 0);
        tt.needsUpdate = true;
        cs[k] = tt;
      }
    }
    canon.set(key, c);
  }
  return c;
}

function subGeometry(geo: THREE.BufferGeometry, start: number, count: number, painted: boolean) {
  const g = new THREE.BufferGeometry();
  // models painted with vertex colour keep that and need no UVs; everything else is textured
  for (const name of ['position', 'normal', painted ? 'color' : 'uv']) {
    const a = geo.getAttribute(name);
    if (a) g.setAttribute(name, a.clone());
  }
  if (!painted && !g.getAttribute('uv')) {
    const n = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  let index: ArrayLike<number>;
  if (geo.index) index = geo.index.array;
  else index = Array.from({ length: geo.getAttribute('position').count }, (_, i) => i);
  const end = Math.min(index.length, start + count);
  const sub = new Uint32Array(end - start);
  for (let i = start; i < end; i++) sub[i - start] = index[i];
  g.setIndex(new THREE.BufferAttribute(sub, 1));
  return g;
}

export function bake(scene: THREE.Scene, chunk = 90) {
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  for (const root of statics) {
    root.updateMatrixWorld(true);
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      const mesh = o as THREE.Mesh;
      const geo = mesh.geometry;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = Array.isArray(mesh.material) && geo.groups.length
        ? geo.groups
        : [{ start: 0, count: geo.index ? geo.index.count : geo.getAttribute('position').count, materialIndex: 0 }];
      const wp = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
      const ci = `${Math.floor(wp.x / chunk)},${Math.floor(wp.z / chunk)}`;
      for (const gr of groups) {
        const mat = mats[gr.materialIndex ?? 0];
        if (!mat) continue;
        const sub = subGeometry(geo, gr.start, gr.count, !!mat.userData.vc && !!geo.getAttribute('color'));
        const rep = repeatOf(mat);
        if (rep) {
          const uv = sub.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep.repeat.x + rep.offset.x, uv.getY(i) * rep.repeat.y + rep.offset.y);
        }
        sub.applyMatrix4(mesh.matrixWorld);
        const cm = canonical(mat);
        const key = `${cm.uuid}|${ci}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat: cm, geos: [] }));
        b.geos.push(sub);
      }
    });
  }
  let n = 0;
  for (const { mat, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mat);
    const transparent = (mat as any).transparent;
    m.castShadow = !transparent;
    m.receiveShadow = true;
    scene.add(m);
    n++;
  }
  statics.length = 0;
  return n;
}
