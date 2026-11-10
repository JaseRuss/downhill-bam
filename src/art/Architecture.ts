import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { QUALITY } from '../core/Platform';
import { color } from './Materials';
import { extrude, lathe, Parts, q, V3 } from './Model';
import { bakeFigure, buildHuman, Outfit, Rig } from './Humanoid';

/**
 * Masonry for the modelling toolkit: walls with real openings, pitched roofs, crow-steps,
 * buttresses, pinnacles and battlements. Big wall faces keep the ashlar texture (their UVs are laid
 * out in metres, so every wall shares one material); dressings are plain colours, which Parts folds
 * into vertex colour.
 */

/** Desktop gets the finest ornament (crockets, corbels, window dressings); phones skip it. */
export const FINE = QUALITY.detail >= 1;
/** Metres of wall covered by one repeat of a stone texture. */
export const TILE = 8;

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const OCTA = new THREE.OctahedronGeometry(1);
/** A plain box as [w, h, d] of the shared unit cube: `p.add(UNIT, mat, pos, rot, [w, h, d])`. */
export { UNIT, OCTA };

/** Dressed stone in a plain colour, to sit beside the ashlar texture of the same hue and lightness. */
export function dressed(hue: number, light: number, tint?: number) {
  // a touch under the texture's nominal lightness: its joints and soot pull the ashlar down
  const c = new THREE.Color().setHSL(hue / 360, 0.14, (light / 100) * 0.9);
  if (tint !== undefined) c.multiply(new THREE.Color(tint));
  return color(c.getHex(), 0.86);
}

/** Lay a texture over any flat-faced shape in metres, projected along each face's normal. */
export function planar(geo: THREE.BufferGeometry, tile = TILE) {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay > ax && ay > az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax > az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A block of textured stone. */
export const sbox = (w: number, h: number, d: number, tile = TILE) => planar(new THREE.BoxGeometry(w, h, d), tile);

// ------------------------------------------------------------------ roofs
/**
 * A pitched roof: eaves at y = 0, `span` across X, ridge along Z. `hip` slopes the ends in by that
 * much (half the length makes a pyramid). Slates run along the eaves.
 */
export function roof(span: number, rise: number, len: number, o: { hip?: number; tile?: number; ends?: boolean } = {}) {
  const t = o.tile ?? 5, hip = Math.min(o.hip ?? 0, len / 2), hw = span / 2, hl = len / 2;
  const sl = Math.hypot(hw, rise), sh = Math.hypot(hip, rise);
  const pos: number[] = [], uv: number[] = [];
  const face = (pts: number[][], uvs: number[][]) => {
    for (let i = 1; i < pts.length - 1; i++) {
      for (const k of [0, i, i + 1]) {
        pos.push(pts[k][0], pts[k][1], pts[k][2]);
        uv.push(uvs[k][0] / t, uvs[k][1] / t);
      }
    }
  };
  face([[hw, 0, hl], [hw, 0, -hl], [0, rise, -hl + hip], [0, rise, hl - hip]], [[hl, 0], [-hl, 0], [-hl + hip, sl], [hl - hip, sl]]);
  face([[-hw, 0, -hl], [-hw, 0, hl], [0, rise, hl - hip], [0, rise, -hl + hip]], [[-hl, 0], [hl, 0], [hl - hip, sl], [-hl + hip, sl]]);
  if (o.ends !== false || hip > 0) {
    const v = hip > 0 ? sh : rise;
    face([[-hw, 0, hl], [hw, 0, hl], [0, rise, hl - hip]], [[-hw, 0], [hw, 0], [0, v]]);
    face([[hw, 0, -hl], [-hw, 0, -hl], [0, rise, -hl + hip]], [[hw, 0], [-hw, 0], [0, v]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A conical (or, with few segments, faceted) roof with a kick at the eaves. */
export function spire(r: number, h: number, seg = q(16, 8), o: { tile?: number; bell?: number; crease?: number } = {}) {
  const t = o.tile ?? 4, b = o.bell ?? 0.12;
  const prof: [number, number][] = b > 0
    ? [[r * (1 + b), 0], [r * 0.96, h * 0.05], [r * 0.52, h * 0.5], [0.0001, h]]
    : [[r, 0], [0.0001, h]];
  return lathe(prof, seg, { cap: 'none', uv: [Math.max(1, Math.round((Math.PI * 2 * r) / t)), Math.hypot(r, h) / t], crease: o.crease });
}

/** A round tower wall, open at both ends, optionally battered out at the foot. */
export function drum(r: number, h: number, o: { batter?: number; seg?: number; tile?: number; top?: number } = {}) {
  const b = o.batter ?? 0, t = o.tile ?? TILE;
  const prof: [number, number][] = b > 0 ? [[r + b, 0], [r + b * 0.25, h * 0.14], [r, h * 0.28], [o.top ?? r, h]] : [[r, 0], [o.top ?? r, h]];
  return lathe(prof, o.seg ?? q(22, 10), { cap: 'none', uv: [Math.max(1, Math.round((Math.PI * 2 * r) / t)), h / t] });
}

// ------------------------------------------------------------------ arches
/**
 * The outline of an arched opening `w` wide, from its right foot, over the top, to its left foot.
 * `k` shapes the head: 0.5 is a round arch, 1 an equilateral pointed one. `off` grows it outwards
 * (for the moulding round an opening).
 */
export function arcPath(w: number, spring: number, k = 1, off = 0, n = q(7, 3)): [number, number][] {
  const hw = w / 2, R = w * k, r = R + off, am = Math.acos((R - hw) / r);
  const pts: [number, number][] = [];
  if (spring > 1e-4) pts.push([hw + off, 0]);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * am;
    pts.push([hw - R + r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const a = (i / n) * am;
    pts.push([-(hw - R + r * Math.cos(a)), spring + r * Math.sin(a)]);
  }
  if (spring > 1e-4) pts.push([-hw - off, 0]);
  return pts;
}

/** How tall an arched opening is. */
export function archH(w: number, spring: number, k = 1, off = 0) {
  const R = w * k, r = R + off;
  return spring + r * Math.sin(Math.acos((R - w / 2) / r));
}

/** The moulding round an arched opening: `t` wide, `depth` deep, standing on y = 0. */
export function archFrame(w: number, spring: number, t: number, depth: number, k = 1) {
  const inner = arcPath(w, spring, k).reverse();
  return extrude([...arcPath(w, spring, k, t), ...inner], depth);
}

/** An arched slab (a dark opening, a door, a blind niche). */
export const archSlab = (w: number, spring: number, depth: number, k = 1) => extrude(arcPath(w, spring, k), depth);

/** A wall `w` x `h` with an arched gateway through it at ground level, centred on `ax`. */
export function archWall(w: number, h: number, depth: number, aw: number, spring: number, k = 1, ax = 0) {
  const arc = arcPath(aw, spring, k).reverse().map(([x, y]) => [x + ax, y] as [number, number]);
  return planar(extrude([[-w / 2, 0], ...arc, [w / 2, 0], [w / 2, h], [-w / 2, h]], depth));
}

/** A wall `w` x `h` pierced by arched openings: [x, y, width, springing height, head shape]. */
export function pierced(w: number, h: number, depth: number, holes: [number, number, number, number, number?][]) {
  return planar(extrude([[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]], depth, 0, holes.map(([x, y, aw, sp, k]) => arcPath(aw, sp, k ?? 1).map(([px, py]) => [px + x, py + y] as [number, number]))));
}

/** A flat arched pane facing +Z with its texture stretched over it (stained glass). */
export function archPane(w: number, spring: number, k = 1) {
  const H = archH(w, spring, k);
  const g = new THREE.ShapeGeometry(new THREE.Shape(arcPath(w, spring, k, 0, q(8, 4)).map(([x, y]) => new THREE.Vector2(x, y))));
  const p = g.getAttribute('position'), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / H);
  return g;
}

/**
 * A traceried window frame: jambs and arch, a mullion, and on desktop two lights with a circle in
 * the head. Stands on y = 0 facing +Z.
 */
export function tracery(p: Parts, mat: THREE.Material, at: V3, yaw: number, w: number, spring: number, o: { t?: number; depth?: number; k?: number; lights?: number } = {}) {
  const t = o.t ?? w * 0.1, d = o.depth ?? 0.3, k = o.k ?? 1, n = o.lights ?? 2;
  const s = new Parts();
  s.add(archFrame(w, spring, t, d, k), mat);
  const lw = w / n;
  for (let i = 1; i < n; i++) s.add(UNIT, mat, [-w / 2 + i * lw, spring / 2 + lw * 0.2, 0], null, [t * 0.6, spring + lw * 0.4, d * 0.7]);
  if (FINE) {
    const sub = spring - lw * 0.15;
    for (let i = 0; i < n; i++) s.add(archFrame(lw - t * 0.6, sub, t * 0.45, d * 0.6, k), mat, [-w / 2 + (i + 0.5) * lw, 0, 0]);
    const top = archH(w, spring, k), subTop = archH(lw - t * 0.6, sub, k);
    const cr = Math.min(lw * 0.36, (top - subTop) * 0.42);
    if (cr > 0.08) s.add(new THREE.TorusGeometry(cr, t * 0.28, 4, q(12, 8)), mat, [0, (top + subTop) / 2 - cr * 0.1, 0]);
  }
  p.sub(s, at, [0, yaw, 0]);
}

// ------------------------------------------------------------------ gothic
/** A crocketed pinnacle `w` square and `h` tall, standing on `at`. */
export function pinnacle(p: Parts, mat: THREE.Material, at: V3, w: number, h: number, o: { tip?: THREE.Material; yaw?: number; shade?: number; plain?: boolean } = {}) {
  const s = new Parts();
  const hs = h * 0.42, sh = o.shade ?? 1;
  s.add(UNIT, mat, [0, hs / 2, 0], null, [w, hs, w], sh);
  s.add(UNIT, mat, [0, hs, 0], null, [w * 1.24, w * 0.18, w * 1.24], sh * 1.1);
  const base = hs + w * 0.09, r0 = w * 0.54 * Math.SQRT2;
  s.add(lathe([[r0, base], [0.0001, h]], 4), mat, null, [0, Math.PI / 4, 0], null, sh);
  if (FINE && !o.plain) {
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      s.add(extrude([[-w * 0.5, 0], [w * 0.5, 0], [0, w * 0.95]], w * 0.12), mat, [Math.sin(a) * w * 0.52, hs + w * 0.09, Math.cos(a) * w * 0.52], [0, a, 0], null, sh * 1.12);
      const ca = a + Math.PI / 4;
      for (let i = 1; i <= 3; i++) {
        const f = i / 4.2, r = r0 * (1 - f) + w * 0.05;
        s.add(OCTA, mat, [Math.cos(ca) * r, base + (h - base) * f, Math.sin(ca) * r], [0, -ca, 0], w * 0.13, sh * 1.1);
      }
    }
  }
  s.add(OCTA, o.tip ?? mat, [0, h, 0], null, [w * 0.2, w * 0.3, w * 0.2], sh * 1.15);
  p.sub(s, at, [0, o.yaw ?? 0, 0]);
}

/** A stepped buttress, `w` wide, standing on y = 0 and projecting `d` along +X, weathered at each stage. */
export function buttress(w: number, d: number, h: number, stages = 2) {
  const step = (d * 0.55) / stages;
  const pts: [number, number][] = [[0, 0], [d, 0]];
  for (let i = 1; i <= stages; i++) {
    const x = d - step * (i - 1), y = (h * i) / stages;
    if (i < stages) pts.push([x, y - step * 1.4], [x - step, y]);
    else pts.push([x, y - x * 1.1], [0, y]);
  }
  return planar(extrude(pts, w));
}

/** The outline of a crow-stepped gable `span` wide rising `rise`, standing `lift` proud of the roof. */
export function crowsteps(span: number, rise: number, steps = 6, lift = 0.4): [number, number][] {
  const sw = span / (2 * steps + 1), shh = rise / steps;
  const left: [number, number][] = [];
  for (let i = 0; i < steps; i++) left.push([-span / 2 + i * sw, lift + (i + 1) * shh], [-span / 2 + (i + 1) * sw, lift + (i + 1) * shh]);
  const top = lift + rise + shh * 0.7;
  const pts: [number, number][] = [[-span / 2, 0], [span / 2, 0]];
  const right = left.map(([x, y]) => [-x, y] as [number, number]);
  pts.push(...right, [sw / 2, top], [-sw / 2, top], ...left.slice().reverse());
  return pts;
}

/** A gable wall for the end of a roof: crow-stepped, or with plain raised skews. Lies in XY. */
export function gable(span: number, rise: number, depth: number, stepped: boolean, lift = 0.4) {
  const outline: [number, number][] = stepped ? crowsteps(span, rise, FINE ? 6 : 4, lift) : [[-span / 2, 0], [span / 2, 0], [span / 2, lift], [0, rise + lift], [-span / 2, lift]];
  return planar(extrude(outline, depth));
}

/** A run of moulding `len` long (along Z), projecting `proj` along +X and `h` high. */
export function moulding(len: number, proj: number, h: number) {
  if (!FINE) return new THREE.BoxGeometry(proj, h, len).translate(proj / 2, h / 2, 0);
  return extrude([[0, 0], [proj * 0.3, 0], [proj * 0.44, h * 0.34], [proj * 0.8, h * 0.46], [proj, h * 0.72], [proj, h], [0, h]], len);
}

/** A band of moulding round a square tower `w` across, at height `y`. */
export function band(p: Parts, mat: THREE.Material, y: number, w: number, proj: number, h: number, c: V3 = [0, 0, 0], shade = 1) {
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    p.add(moulding(w + proj * 2, proj, h), mat, [c[0] + Math.cos(a) * (w / 2), c[1] + y, c[2] - Math.sin(a) * (w / 2)], [0, a, 0], null, shade);
  }
}

/** Battlements along a wall top from a to b: an optional parapet course, then merlons. */
export function battlements(p: Parts, mat: THREE.Material, a: V3, b: V3, o: { h?: number; w?: number; t?: number; gap?: number; base?: number; cope?: THREE.Material } = {}) {
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
  const gap = o.gap ?? 0.7, h = o.h ?? 0.8, t = o.t ?? 0.5, base = o.base ?? 0;
  const n = Math.max(1, Math.round((len + gap) / ((o.w ?? 0.9) + gap)));
  const pitch = (len + gap) / n, mw = pitch - gap;
  const rot: V3 = [0, -Math.atan2(dz, dx), 0];
  if (base > 0) p.add(sbox(len, base, t), mat, [(a[0] + b[0]) / 2, a[1] + base / 2, (a[2] + b[2]) / 2], rot);
  const m = sbox(mw, h, t);
  for (let i = 0; i < n; i++) {
    const f = (i * pitch + mw / 2) / len;
    const at: V3 = [a[0] + dx * f, a[1] + base + h / 2, a[2] + dz * f];
    p.add(m, mat, at, rot);
    if (FINE && o.cope) p.add(UNIT, o.cope, [at[0], at[1] + h / 2 + 0.05, at[2]], rot, [mw + 0.12, 0.1, t + 0.14]);
  }
}

/** Battlements round the top of a drum tower. */
export function ringBattlements(p: Parts, mat: THREE.Material, c: V3, r: number, n: number, o: { h?: number; t?: number; cope?: THREE.Material } = {}) {
  const h = o.h ?? 0.8, t = o.t ?? 0.45, mw = ((Math.PI * 2 * r) / n) * 0.58;
  const m = sbox(mw, h, t);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const at: V3 = [c[0] + Math.cos(a) * r, c[1] + h / 2, c[2] + Math.sin(a) * r];
    const rot: V3 = [0, -(a + Math.PI / 2), 0];
    p.add(m, mat, at, rot);
    if (FINE && o.cope) p.add(UNIT, o.cope, [at[0], at[1] + h / 2 + 0.05, at[2]], rot, [mw + 0.1, 0.1, t + 0.12]);
  }
}

/** A row of corbels under a parapet from a to b (desktop only). */
export function corbels(p: Parts, mat: THREE.Material, a: V3, b: V3, size = 0.3, every = 0.75) {
  if (!FINE) return;
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.round(len / every));
  const rot: V3 = [0, -Math.atan2(dz, dx), 0];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    p.add(UNIT, mat, [a[0] + dx * f, a[1], a[2] + dz * f], rot, [size * 0.8, size, size], 0.9);
  }
}

// ------------------------------------------------------------------ statues
/**
 * A figure posed and cast in one material (bronze, marble), as plain static geometry. It stands on
 * its feet at the origin, facing +X.
 */
export function statue(o: Outfit, pose: (r: Rig) => void) {
  const rig = buildHuman(o);
  pose(rig);
  rig.root.updateMatrixWorld(true);
  const { geos, mat } = bakeFigure(rig, new THREE.Matrix4(), QUALITY.detail);
  const m = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
  m.castShadow = true;
  return m;
}

/** An outfit for a statue: everything the one material, in a long robe or breeches. */
export function cast(mat: THREE.Material, height: number, o: Partial<Outfit> = {}): Outfit {
  return { skin: mat, shirt: mat, longSleeves: true, legs: 'robe', legMat: mat, shoes: mat, hair: mat, hairStyle: 'short', build: 1.1, height, ...o };
}
