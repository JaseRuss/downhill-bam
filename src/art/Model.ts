import * as THREE from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { QUALITY } from '../core/Platform';
import { envReady } from './Materials';

/**
 * Modelling toolkit. Shapes are lofted, lathed, swept and extruded rather than stacked from boxes,
 * then a whole model is merged into a handful of meshes: every plain coloured surface becomes
 * vertex colour on a shared material, so a prop that used to be forty draw calls is three or four.
 */
export type V3 = [number, number, number];
const TAU = Math.PI * 2;

/** A segment count scaled to the device (phones get fewer). */
export function q(n: number, min = 3, detail = QUALITY.detail) {
  return Math.max(min, Math.round(n * detail));
}

// ------------------------------------------------------------------ loft
/** One cross-section of a loft. */
export interface Ring {
  /** Position along the loft's axis. */
  t: number;
  /** Half-width (sideways). */
  w: number;
  /** Half-depth: one number, or [front, back] for a belly, a chest, a heel. Defaults to w. */
  d?: number | [number, number];
  /** Centre offset, forwards and sideways. */
  x?: number;
  z?: number;
  /** Squareness: 2 is an ellipse, 4 and up a rounded box. */
  n?: number;
  /** Shade baked into the vertex colour (1 = none). */
  sh?: number;
}
type Cap = 'flat' | 'round' | 'none';
export interface LoftOpts {
  /** Segments round the section. */
  seg?: number;
  /** Extra rings between each pair of key rings, on a smooth curve through them. */
  sub?: number;
  /** End caps: one for both, or [start, end]. */
  cap?: Cap | [Cap, Cap];
  /** How far a round cap bulges: one for both, or [start, end]. Defaults to 60% of the end ring. */
  dome?: number | [number, number];
  /** Which way the loft runs. For 'x' and 'z' the section's front is up. */
  axis?: 'x' | 'y' | 'z';
  /** Texture repeats [around, along]; leave out for vertex-coloured models. */
  uv?: [number, number];
  /** Run the texture's U along the loft instead of round it (bands across a scarf). */
  swap?: boolean;
  /** Radius multiplier by angle (0 = front) and distance along (0..1): pleats, folds, tufts. */
  mod?: (a: number, v: number) => number;
  /** Extra shade by angle and distance along. */
  shade?: (a: number, v: number) => number;
  /** Default squareness. */
  n?: number;
  /** Edges sharper than this many degrees stay hard. */
  crease?: number;
}
interface FullRing { t: number; w: number; df: number; db: number; x: number; z: number; n: number; sh: number }
const KEYS = ['w', 'df', 'db', 'x', 'z', 'n', 'sh'] as const;

function full(r: Ring, n0: number): FullRing {
  const d = r.d ?? r.w;
  return { t: r.t, w: r.w, df: Array.isArray(d) ? d[0] : d, db: Array.isArray(d) ? d[1] : d, x: r.x ?? 0, z: r.z ?? 0, n: r.n ?? n0, sh: r.sh ?? 1 };
}

/** A monotone cubic through the key rings: limbs swell and taper without overshooting. */
function refine(rings: FullRing[], sub: number): FullRing[] {
  if (sub < 1 || rings.length < 3) return rings;
  const n = rings.length;
  const tang = {} as Record<(typeof KEYS)[number], number[]>;
  for (const k of KEYS) {
    const sec = (i: number) => {
      const dt = rings[i + 1].t - rings[i].t;
      return dt < 1e-6 ? 0 : (rings[i + 1][k] - rings[i][k]) / dt;
    };
    const m: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) m.push(sec(0));
      else if (i === n - 1) m.push(sec(n - 2));
      else {
        const a = sec(i - 1), b = sec(i);
        m.push(a * b <= 0 ? 0 : (2 * a * b) / (a + b));
      }
    }
    tang[k] = m;
  }
  const out: FullRing[] = [];
  for (let i = 0; i < n - 1; i++) {
    out.push(rings[i]);
    const h = rings[i + 1].t - rings[i].t;
    if (h < 1e-6) continue;
    for (let j = 1; j <= sub; j++) {
      const u = j / (sub + 1), u2 = u * u, u3 = u2 * u;
      const r = { t: rings[i].t + h * u } as FullRing;
      for (const k of KEYS) {
        r[k] = (2 * u3 - 3 * u2 + 1) * rings[i][k] + (u3 - 2 * u2 + u) * h * tang[k][i] + (-2 * u3 + 3 * u2) * rings[i + 1][k] + (u3 - u2) * h * tang[k][i + 1];
      }
      out.push(r);
    }
  }
  out.push(rings[n - 1]);
  return out;
}

/** Re-index with hard edges only where the surface really turns a corner. */
export function crease(geo: THREE.BufferGeometry, deg = 46) {
  const g = mergeVertices(toCreasedNormals(geo, (deg * Math.PI) / 180), 1e-5);
  g.computeBoundingSphere();
  return g;
}

function flip(geo: THREE.BufferGeometry) {
  const ix = geo.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < ix.length; i += 3) {
    const t = ix[i + 1];
    ix[i + 1] = ix[i + 2];
    ix[i + 2] = t;
  }
  return geo;
}

/**
 * Skin a surface over a run of cross-sections. Sections are superellipses that can be deeper at
 * the front than the back, so one loft makes a torso, a shoe, a car body or a boot.
 */
export function loft(input: Ring[], o: LoftOpts = {}) {
  const seg = o.seg ?? q(12);
  const n0 = o.n ?? 2;
  let rings = refine(input.map((r) => full(r, n0)).sort((a, b) => a.t - b.t), o.sub ?? 0);
  const caps: [Cap, Cap] = Array.isArray(o.cap) ? o.cap : [o.cap ?? 'flat', o.cap ?? 'flat'];
  const domes = Array.isArray(o.dome) ? o.dome : [o.dome, o.dome];
  const t0 = rings[0].t, t1 = rings[rings.length - 1].t;
  // round caps: a few shrinking rings and a point
  const apex: [FullRing | null, FullRing | null] = [null, null];
  const domeSeg = Math.max(2, Math.round(seg / 6));
  const tiny = (r: FullRing) => r.w < 1e-5 && r.df < 1e-5 && r.db < 1e-5;
  for (const end of [0, 1] as const) {
    const edge = end === 0 ? rings[0] : rings[rings.length - 1];
    if (tiny(edge)) {
      apex[end] = edge;
      if (end === 0) rings = rings.slice(1);
      else rings = rings.slice(0, -1);
      continue;
    }
    if (caps[end] !== 'round') continue;
    const h = domes[end] ?? Math.min(edge.w, (edge.df + edge.db) / 2) * 0.6;
    const extra: FullRing[] = [];
    for (let k = 1; k < domeSeg; k++) {
      const ph = (k / domeSeg) * (Math.PI / 2);
      const c = Math.cos(ph);
      extra.push({ ...edge, t: edge.t + (end ? 1 : -1) * h * Math.sin(ph), w: edge.w * c, df: edge.df * c, db: edge.db * c });
    }
    apex[end] = { ...edge, t: edge.t + (end ? 1 : -1) * h, w: 0, df: 0, db: 0 };
    rings = end === 0 ? [...extra.reverse(), ...rings] : [...rings, ...extra];
  }
  const cols = o.uv ? seg + 1 : seg;
  const pos: number[] = [], uv: number[] = [], shade: number[] = [], idx: number[] = [];
  let shaded = !!o.shade;
  const span = t1 - t0 || 1;
  for (const r of rings) {
    const v = Math.min(1, Math.max(0, (r.t - t0) / span));
    const e = 2 / r.n;
    for (let j = 0; j < cols; j++) {
      const a = (j / seg) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      const k = o.mod ? o.mod(a, v) : 1;
      const px = Math.sign(c) * Math.abs(c) ** e * (c >= 0 ? r.df : r.db) * k;
      const pz = Math.sign(s) * Math.abs(s) ** e * r.w * k;
      pos.push(r.x + px, r.t, r.z + pz);
      if (o.uv) {
        // U runs the way lettering reads from outside
        const ua = (1 - j / seg) * o.uv[0];
        if (o.swap) uv.push(v * o.uv[1], ua);
        else uv.push(ua, v * o.uv[1]);
      }
      const sh = r.sh * (o.shade ? o.shade(a, v) : 1);
      if (sh !== 1) shaded = true;
      shade.push(sh);
    }
  }
  const at = (i: number, j: number) => i * cols + (o.uv ? j : j % seg);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      idx.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  const fan = (end: 0 | 1) => {
    const ring = end === 0 ? rings[0] : rings[rings.length - 1];
    const tip = apex[end] ?? ring;
    if (!apex[end] && caps[end] === 'none') return;
    const c = pos.length / 3;
    pos.push(tip.x, tip.t, tip.z);
    if (o.uv) uv.push(0.5 * o.uv[0], end * o.uv[1]);
    shade.push(tip.sh);
    const i = end === 0 ? 0 : rings.length - 1;
    for (let j = 0; j < seg; j++) {
      if (end === 0) idx.push(c, at(i, j), at(i, j + 1));
      else idx.push(c, at(i, j + 1), at(i, j));
    }
  };
  fan(0);
  fan(1);
  const axis = o.axis ?? 'y';
  if (axis !== 'y') {
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], t = pos[i + 1], z = pos[i + 2];
      if (axis === 'x') { pos[i] = t; pos[i + 1] = x; pos[i + 2] = z; }
      else { pos[i] = z; pos[i + 1] = x; pos[i + 2] = t; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (o.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (shaded) g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(idx);
  if (axis === 'x') flip(g);
  return crease(g, o.crease);
}

/** Spin a profile of [radius, height] points about the Y axis. */
export function lathe(profile: [number, number][], seg = q(16), o: LoftOpts = {}) {
  const pts = profile[0][1] <= profile[profile.length - 1][1] ? profile : profile.slice().reverse();
  // a loft needs rising heights, so nudge any overhang
  let last = -Infinity;
  const rings = pts.map(([r, y]) => {
    const t = y <= last ? last + 1e-4 : y;
    last = t;
    return { t, w: r };
  });
  return loft(rings, { seg, cap: 'none', ...o });
}

// ------------------------------------------------------------------ pipes
export interface PipeOpts {
  seg?: number;
  /** Round the corners of the path to this radius. */
  bend?: number;
  /** Run a smooth curve through the points instead. */
  curve?: boolean;
  closed?: boolean;
  /** Cap the ends (default true). */
  cap?: boolean;
  /** Points per rounded corner or curve span. */
  steps?: number;
  /** Squash the section: [across, along the first normal]. */
  flat?: [number, number];
}

function roundCorners(pts: THREE.Vector3[], bend: number, steps: number, closed: boolean) {
  const out: THREE.Vector3[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    if (!closed && (i === 0 || i === n - 1)) { out.push(p.clone()); continue; }
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const c = Math.min(bend, da.length() * 0.48, db.length() * 0.48);
    const p0 = p.clone().addScaledVector(da.normalize(), c), p1 = p.clone().addScaledVector(db.normalize(), c);
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      out.push(p0.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(p, 2 * u * (1 - u)).addScaledVector(p1, u * u));
    }
  }
  return out;
}

/** A tube along a path: trolley frames, handlebars, railings, bagpipe drones. Radius may vary. */
export function pipe(path: (V3 | THREE.Vector3)[], r: number | number[], o: PipeOpts = {}) {
  const seg = o.seg ?? q(8, 4);
  const closed = !!o.closed;
  let pts = path.map((p) => (Array.isArray(p) ? new THREE.Vector3(...p) : p.clone()));
  let radii: number[] | null = Array.isArray(r) ? r : null;
  const steps = o.steps ?? q(5, 2);
  if (o.curve) {
    const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
    const m = (closed ? pts.length : pts.length - 1) * steps;
    const src = radii;
    const np: THREE.Vector3[] = [];
    const nr: number[] = [];
    for (let i = 0; i <= (closed ? m - 1 : m); i++) {
      const u = i / m;
      np.push(c.getPoint(u));
      if (src) {
        const f = u * (src.length - 1), k = Math.min(src.length - 2, Math.floor(f));
        nr.push(src[k] + (src[k + 1] - src[k]) * (f - k));
      }
    }
    pts = np;
    radii = src ? nr : null;
  } else if (o.bend) pts = roundCorners(pts, o.bend, steps, closed);
  const n = pts.length;
  const rad = (i: number) => (radii ? radii[Math.min(radii.length - 1, i)] : (r as number));
  const pos: number[] = [], idx: number[] = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.copy(b).sub(a).normalize();
    if (i === 0) {
      N.set(0, 1, 0);
      if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
    }
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N);
    const fx = o.flat ? o.flat[0] : 1, fy = o.flat ? o.flat[1] : 1;
    for (let j = 0; j < seg; j++) {
      const an = (j / seg) * TAU;
      const c = Math.cos(an) * rad(i) * fy, s = Math.sin(an) * rad(i) * fx;
      pos.push(pts[i].x + N.x * c + B.x * s, pts[i].y + N.y * c + B.y * s, pts[i].z + N.z * c + B.z * s);
    }
  }
  const at = (i: number, j: number) => (i % n) * seg + (j % seg);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    for (let j = 0; j < seg; j++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
  }
  if (!closed && o.cap !== false) {
    for (const end of [0, 1]) {
      const i = end ? n - 1 : 0;
      const c = pos.length / 3;
      pos.push(pts[i].x, pts[i].y, pts[i].z);
      for (let j = 0; j < seg; j++) {
        if (end) idx.push(c, at(i, j), at(i, j + 1));
        else idx.push(c, at(i, j + 1), at(i, j));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return crease(g, 50);
}

// ------------------------------------------------------------------ solids
/** A box with rounded edges. */
export function rbox(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.2, seg = 1) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
}

/** A flat outline of [x, y] points pushed out along Z (centred), with an optional bevel. */
export function extrude(outline: [number, number][], depth: number, bevel = 0, holes: [number, number][][] = []) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: bevel > 0 ? q(2, 1) : 0, curveSegments: 1,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.deleteAttribute('uv');
  return crease(g, 40);
}

export function ball(r: number, seg = q(14, 6), sy = 1, sx = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7)));
  if (sy !== 1 || sx !== 1 || sz !== 1) g.scale(sx, sy, sz);
  return g;
}

export function cyl(r0: number, r1: number, h: number, seg = q(14, 6), open = false) {
  return new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
}

export function torus(r: number, tube: number, seg = q(20, 8), tseg = q(8, 4), arc = TAU) {
  return new THREE.TorusGeometry(r, tube, tseg, seg, arc);
}

// ------------------------------------------------------------------ vertex-colour materials
const vcCache = new Map<string, THREE.MeshStandardMaterial>();
const ROUGH = [0.22, 0.42, 0.62, 0.86];
const METAL = [0, 0.3, 0.85];
const nearest = (a: number[], v: number) => a.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b));

/**
 * The shared material for a class of surface (how rough, how metallic). Colour comes from the
 * vertices, stored as one byte per channel with a gamma of 2 so dark cloth keeps its shading.
 */
export function vcMat(rough: number, metal = 0, side: THREE.Side = THREE.FrontSide, snap = true) {
  const r = snap ? nearest(ROUGH, rough) : rough, m = snap ? nearest(METAL, metal) : metal;
  const key = `${r}|${m}|${side}`;
  let mat = vcCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: m, side });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\n\tvColor.rgb *= vColor.rgb;\n#endif');
    };
    mat.userData.vc = true;
    if (m > 0 || r < 0.5) envReady(mat, m > 0.5 ? 1 : m > 0 ? 0.7 : 0.45);
    vcCache.set(key, mat);
  }
  return mat;
}

/** Can this material be folded into vertex colour? Plain colours only. */
export function isPlain(m: any) {
  return !!m && m.isMeshStandardMaterial && !m.map && !m.emissiveMap && !m.alphaMap && !m.normalMap && !m.transparent && !m.vertexColors
    && m.alphaTest === 0 && m.opacity === 1 && m.emissive.getHex() === 0;
}

export const enc = (v: number) => Math.round(Math.sqrt(Math.min(1, Math.max(0, v))) * 255);

/** A vertex-colour attribute of one colour, optionally shaded per vertex. */
export function paint(count: number, c: THREE.Color, shade?: ArrayLike<number> | null, k = 1) {
  const a = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    const s = (shade ? shade[i] : 1) * k;
    a[i * 3] = enc(c.r * s);
    a[i * 3 + 1] = enc(c.g * s);
    a[i * 3 + 2] = enc(c.b * s);
  }
  return new THREE.BufferAttribute(a, 3, true);
}

// ------------------------------------------------------------------ parts
interface Item { geo: THREE.BufferGeometry; mat: THREE.Material; shade: number }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export type Place = V3 | THREE.Matrix4 | null;

export function matrix(pos?: Place, rot?: V3 | null, scale?: number | V3 | null) {
  if (pos instanceof THREE.Matrix4) return _m.copy(pos);
  _p.set(pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0);
  _q.setFromEuler(_e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0));
  if (typeof scale === 'number') _s.setScalar(scale);
  else _s.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1);
  return _m.compose(_p, _q, _s);
}

/** A placement that stands a piece's Y axis along `dir` at `pos`. */
export function aim(pos: V3, dir: V3, scale: number | V3 = 1) {
  const d = new THREE.Vector3(...dir).normalize();
  const sc = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d), sc);
}

/** Only the attributes a merge needs, indexed, in the model's own space. */
export function placed(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'shade']) {
    const a = geo.getAttribute(name);
    if (a) g.setAttribute(name, a.clone());
  }
  const n = g.getAttribute('position').count;
  g.setIndex(geo.index ? geo.index.clone() : Array.from({ length: n }, (_, i) => i));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.applyMatrix4(m);
  if (m.determinant() < 0) flip(g);
  return g;
}

/**
 * Collects the pieces of a model, then merges them into as few meshes as its surfaces allow.
 */
export class Parts {
  private items: Item[] = [];

  /** Add a piece. Rotation is XYZ Euler; a negative scale mirrors it. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos?: Place, rot?: V3 | null, scale?: number | V3 | null, shade = 1) {
    this.items.push({ geo: placed(geo, matrix(pos, rot, scale)), mat, shade });
    return this;
  }

  /** Add another assembly, moved into place. */
  sub(other: Parts, pos?: Place, rot?: V3 | null, scale?: number | V3 | null) {
    const m = matrix(pos, rot, scale).clone();
    for (const it of other.items) this.items.push({ geo: placed(it.geo, m), mat: it.mat, shade: it.shade });
    return this;
  }

  /** Merge everything into `into` (or a new group): one mesh per surface class or textured material. */
  build(into: THREE.Object3D = new THREE.Group()) {
    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; uv: boolean }>();
    const tints = new Map<number, number>();
    for (const it of this.items) {
      const g = it.geo;
      const n = g.getAttribute('position').count;
      const sm = it.mat as THREE.MeshStandardMaterial;
      const plain = isPlain(sm);
      const mat = plain ? vcMat(sm.roughness, sm.metalness, sm.side) : it.mat;
      const shade = g.getAttribute('shade');
      if (plain) {
        g.setAttribute('color', paint(n, sm.color, shade ? (shade.array as Float32Array) : null, it.shade));
        g.deleteAttribute('uv');
        const hex = sm.color.getHex();
        tints.set(hex, (tints.get(hex) ?? 0) + n);
      } else if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      g.deleteAttribute('shade');
      let b = buckets.get(mat.uuid);
      if (!b) buckets.set(mat.uuid, (b = { mat, geos: [], uv: !plain }));
      b.geos.push(g);
    }
    let tint = 0x888888, most = 0;
    for (const [hex, n] of tints) if (n > most) { most = n; tint = hex; }
    for (const { mat, geos } of buckets.values()) {
      const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !(mat as any).transparent;
      mesh.userData.tint = tint;
      into.add(mesh);
    }
    into.userData.tint = tint;
    this.items = [];
    return into;
  }
}

// ------------------------------------------------------------------ shared models
const protos = new Map<string, THREE.Object3D>();

/** Build a model once and hand out copies that share its geometry. */
export function model(key: string, make: () => THREE.Object3D) {
  let p = protos.get(key);
  if (!p) protos.set(key, (p = make()));
  return p.clone(true);
}
