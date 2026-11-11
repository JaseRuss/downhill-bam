import * as THREE from 'three';
import { M, color } from './Materials';
import { aim, ball, cyl, enc, extrude, lathe, loft, matrix, model, Parts, pipe, placed, Place, q, rbox, Ring, V3, vcMat } from './Model';
import { QUALITY } from '../core/Platform';

/**
 * Shared character builder. Figures face +X, Z is the lateral axis, feet sit at y = 0.
 * Proportions follow a ~1.75 m adult (7.5 heads tall).
 *
 * A figure is one skinned body, a head and whatever it wears on top: three or four draw calls.
 * Bodies and heads are sculpted once per shape (legwear, sleeves, build, hair) and shared; each
 * person only owns their colours. Height and build are applied through the skeleton, so one
 * sculpt fits everybody. Every joint is a bone and can be posed: shoulders and hips rotate about
 * Z to swing limbs forward (+) and back (-).
 */
export type LegStyle = 'kilt' | 'trousers' | 'shorts' | 'robe';
export type HatStyle = 'tam' | 'bucket' | 'cap' | 'feather' | 'top' | 'beret' | null;
export type HairStyle = 'short' | 'wild' | 'bald' | 'long' | 'bun';

export interface Outfit {
  skin: THREE.Material;
  shirt: THREE.Material;
  longSleeves?: boolean;
  legs: LegStyle;
  legMat: THREE.Material;
  socks?: THREE.Material;
  shoes: THREE.Material;
  hair?: THREE.Material;
  hairStyle?: HairStyle;
  beard?: THREE.Material;
  hat?: HatStyle;
  hatMat?: THREE.Material;
  gloves?: THREE.Material;
  build?: number; // 0.85 skinny … 1.25 hefty
  height?: number; // metres
  /** Extra modelling detail for a figure the camera lives next to. */
  detail?: number;
}

export interface Rig {
  root: THREE.Group;
  pelvis: THREE.Bone;
  chest: THREE.Bone;
  head: THREE.Bone;
  hat: THREE.Object3D | null;
  shoulderL: THREE.Bone;
  shoulderR: THREE.Bone;
  elbowL: THREE.Bone;
  elbowR: THREE.Bone;
  hipL: THREE.Bone;
  hipR: THREE.Bone;
  kneeL: THREE.Bone;
  kneeR: THREE.Bone;
  kilt: THREE.Mesh | null;
  height: number;
  /** The skinned body and the head mesh. */
  body: THREE.SkinnedMesh;
  face: THREE.Mesh;
  /** Everything needed to rebuild the figure at another level of detail. */
  bones: THREE.Bone[];
  inv: THREE.Matrix4[];
  pal: THREE.Color[];
  outfit: Outfit;
}

// Segment lengths for a 1.75 m figure.
export const D = {
  shin: 0.43, thigh: 0.44, foot: 0.07, pelvisY: 0.95, abdomen: 0.2, chest: 0.3,
  neck: 0.08, headR: 0.112, upperArm: 0.29, forearm: 0.26, hand: 0.09, shoulderW: 0.2, hipW: 0.095,
};

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Angle from straight ahead, 0..π. */
const off = (a: number) => Math.abs(a > Math.PI ? a - TAU : a);

// ------------------------------------------------------------------ skeleton
const PELVIS = 0, CHEST = 1, HEAD = 2, SH_L = 3, EL_L = 4, SH_R = 5, EL_R = 6, HIP_L = 7, KN_L = 8, HIP_R = 9, KN_R = 10;
const PARENT = [-1, PELVIS, CHEST, CHEST, SH_L, CHEST, SH_R, PELVIS, HIP_L, PELVIS, HIP_R];
/** How much of the build each bone takes: the trunk and upper limbs all of it, forearms and shins half. */
const GIRTH = [1, 1, 0, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5];

/** Where the joints are for a figure of this height scale and build. */
function layout(s: number, b: number) {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const chestY = (D.pelvisY + D.abdomen) * s;
  const shY = chestY + (D.chest - 0.035) * s, shZ = D.shoulderW * s * b + 0.02 * s;
  const hipY = (D.pelvisY - 0.04) * s, hipZ = D.hipW * s * b;
  return [
    v(0, D.pelvisY * s, 0), v(0, chestY, 0), v(0, chestY + (D.chest + D.neck + D.headR * 0.95) * s, 0),
    v(0, shY, shZ), v(0, shY - D.upperArm * s, shZ), v(0, shY, -shZ), v(0, shY - D.upperArm * s, -shZ),
    v(0, hipY, hipZ), v(0, hipY - D.thigh * s, hipZ), v(0, hipY, -hipZ), v(0, hipY - D.thigh * s, -hipZ),
  ];
}
const J0 = layout(1, 1);
const SH_Y = J0[SH_L].y, SH_Z = J0[SH_L].z, EL_Y = J0[EL_L].y, HIP_Y = J0[HIP_L].y, HIP_Z = J0[HIP_L].z, KN_Y = J0[KN_L].y;
const WRIST_Y = EL_Y - D.forearm, ANKLE_Y = KN_Y - D.shin;

// ------------------------------------------------------------------ sculpting
/** What a vertex is made of; each person supplies a colour per slot. */
const S = {
  skin: 0, shirt: 1, lower: 2, legs: 3, socks: 4, shoes: 5, sole: 6, hair: 7, beard: 8, hands: 9, white: 10, iris: 11,
  mouth: 12, lips: 13, brow: 14, belt: 15, metal: 16, leather: 17, flash: 18, robe: 19, collar: 20, teeth: 21, N: 22,
};

interface Template {
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  uv: THREE.BufferAttribute;
  skinIndex: THREE.BufferAttribute;
  skinWeight: THREE.BufferAttribute;
  index: THREE.BufferAttribute;
  slot: Uint8Array;
  shade: Float32Array;
  /** Two bones and the first one's weight, per vertex (for baking a pose on the CPU). */
  bone: Uint8Array;
  w0: Float32Array;
  /** Triangles past this index are the shirt, which may be textured. */
  split: number;
  sphere: THREE.Sphere;
}

type Bind = number | ((x: number, y: number, z: number) => [number, number, number]);
interface AddOpts { tex?: number; shade?: number }

/** Gathers the pieces of a body or a head in its rest pose. */
class Sculpt {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private slot: number[] = [];
  private shade: number[] = [];
  private bone: number[] = [];
  private w0: number[] = [];
  private idx: number[][] = [[], []];

  /** `tex` marks a piece of shirt: the number is how many stripe repeats run down it. */
  add(geo: THREE.BufferGeometry, slot: number, bind: Bind = 0, pos?: Place, rot?: V3 | null, scale?: number | V3 | null, o: AddOpts = {}) {
    const g = placed(geo, matrix(pos, rot, scale));
    const base = this.pos.length / 3;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv'), sh = g.getAttribute('shade');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      // stripes run round the body, so the texture's U goes down it
      if (o.tex && u) this.uv.push(u.getY(i) * o.tex, u.getX(i));
      else this.uv.push(0, 0);
      this.slot.push(slot);
      this.shade.push((sh ? sh.getX(i) : 1) * (o.shade ?? 1));
      const b = typeof bind === 'number' ? [bind, bind, 1] : bind(x, y, z);
      this.bone.push(b[0], b[1]);
      this.w0.push(b[2]);
    }
    const ix = g.index!.array, out = this.idx[o.tex ? 1 : 0];
    for (let i = 0; i < ix.length; i++) out.push(ix[i] + base);
    return this;
  }

  finish(): Template {
    const n = this.pos.length / 3;
    const index = [...this.idx[0], ...this.idx[1]];
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = this.bone[i * 2];
      si[i * 4 + 1] = this.bone[i * 2 + 1];
      sw[i * 4] = this.w0[i];
      sw[i * 4 + 1] = 1 - this.w0[i];
    }
    const position = new THREE.Float32BufferAttribute(this.pos, 3);
    const sphere = new THREE.Sphere();
    sphere.setFromPoints(Array.from({ length: n }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i)));
    return {
      position, normal: new THREE.Float32BufferAttribute(this.nor, 3), uv: new THREE.Float32BufferAttribute(this.uv, 2),
      skinIndex: new THREE.BufferAttribute(si, 4), skinWeight: new THREE.BufferAttribute(sw, 4),
      index: new THREE.BufferAttribute(n > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1),
      slot: Uint8Array.from(this.slot), shade: Float32Array.from(this.shade), bone: Uint8Array.from(this.bone), w0: Float32Array.from(this.w0),
      split: this.idx[0].length, sphere,
    };
  }
}

const templates = new Map<string, Template>();
function template(key: string, make: () => Sculpt) {
  let t = templates.get(key);
  if (!t) templates.set(key, (t = make().finish()));
  return t;
}

/** A person's colours over a shared sculpt. */
function tint(t: Template, pal: THREE.Color[]) {
  const n = t.slot.length;
  const a = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = pal[t.slot[i]], s = t.shade[i];
    a[i * 3] = enc(c.r * s);
    a[i * 3 + 1] = enc(c.g * s);
    a[i * 3 + 2] = enc(c.b * s);
  }
  return new THREE.BufferAttribute(a, 3, true);
}

function dress(t: Template, pal: THREE.Color[], skinned: boolean, textured = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', t.position);
  g.setAttribute('normal', t.normal);
  if (textured) g.setAttribute('uv', t.uv);
  if (skinned) {
    g.setAttribute('skinIndex', t.skinIndex);
    g.setAttribute('skinWeight', t.skinWeight);
  }
  g.setIndex(t.index);
  g.setAttribute('color', tint(t, pal));
  g.boundingSphere = t.sphere.clone();
  return g;
}

/** Rings written in head radii (or any unit), scaled to metres. */
function unit(k: number, rings: Ring[]): Ring[] {
  return rings.map((r) => ({
    ...r, t: r.t * k, w: r.w * k, x: (r.x ?? 0) * k, z: (r.z ?? 0) * k,
    d: r.d === undefined ? undefined : Array.isArray(r.d) ? [r.d[0] * k, r.d[1] * k] : r.d * k,
  }));
}
/** The same rings moved sideways (limbs are sculpted on the left and mirrored). */
const side = (z: number, rings: Ring[]): Ring[] => rings.map((r) => ({ ...r, z }));
const grow = (k: number, rings: Ring[]): Ring[] =>
  rings.map((r) => ({ ...r, w: r.w + k, d: r.d === undefined ? undefined : Array.isArray(r.d) ? [r.d[0] + k, r.d[1] + k] : r.d + k }));

// ------------------------------------------------------------------ the body
const armBind: Bind = (_x, y, z) => [z > 0 ? SH_L : SH_R, z > 0 ? EL_L : EL_R, smooth(EL_Y - 0.035, EL_Y + 0.035, y)];
const legBind: Bind = (_x, y, z) => [z > 0 ? HIP_L : HIP_R, z > 0 ? KN_L : KN_R, smooth(KN_Y - 0.04, KN_Y + 0.04, y)];
const trunkBind: Bind = (_x, y) => [CHEST, PELVIS, smooth(1.07, 1.22, y)];
const foreBind: Bind = (_x, _y, z) => [z > 0 ? EL_L : EL_R, 0, 1];
const shinBind: Bind = (_x, _y, z) => [z > 0 ? KN_L : KN_R, 0, 1];
const MIRROR: V3 = [1, 1, -1];
type LoftO = NonNullable<Parameters<typeof loft>[1]>;

/** A bare arm from the wrist to the shoulder. */
const ARM: Ring[] = [
  { t: WRIST_Y, w: 0.027, d: 0.023 },
  { t: 0.9, w: 0.032, d: 0.029 },
  { t: 0.98, w: 0.041, d: 0.039 },
  { t: 1.06, w: 0.044, d: 0.043 },
  { t: EL_Y, w: 0.04, d: [0.039, 0.043] },
  { t: 1.19, w: 0.043, d: 0.044 },
  { t: 1.26, w: 0.05, d: [0.052, 0.048] },
  { t: 1.34, w: 0.056, d: 0.057 },
  { t: SH_Y - 0.01, w: 0.058, d: 0.058 },
];
/** A bare leg from the ankle to the hip. */
const LEG: Ring[] = [
  { t: 0.052, w: 0.034, d: [0.036, 0.038] },
  { t: 0.12, w: 0.036, d: [0.036, 0.043] },
  { t: 0.25, w: 0.054, d: [0.046, 0.068] },
  { t: 0.34, w: 0.057, d: [0.048, 0.07] },
  { t: 0.42, w: 0.05, d: [0.05, 0.053] },
  { t: KN_Y, w: 0.05, d: [0.057, 0.048] },
  { t: 0.53, w: 0.054, d: [0.056, 0.052] },
  { t: 0.7, w: 0.07, d: [0.072, 0.07] },
  { t: 0.84, w: 0.082, d: [0.08, 0.084] },
  { t: HIP_Y, w: 0.085, d: [0.082, 0.088] },
];
const TROUSER: Ring[] = [
  { t: 0.07, w: 0.046, d: [0.05, 0.05], sh: 0.3 },
  { t: 0.074, w: 0.053, d: [0.058, 0.056], sh: 0.85 },
  { t: 0.25, w: 0.058, d: [0.055, 0.066] },
  { t: 0.42, w: 0.058, d: [0.058, 0.058] },
  { t: KN_Y, w: 0.06, d: [0.065, 0.056] },
  { t: 0.55, w: 0.064, d: [0.066, 0.062] },
  { t: 0.7, w: 0.078, d: [0.08, 0.078] },
  { t: 0.84, w: 0.089, d: [0.087, 0.091] },
  { t: HIP_Y, w: 0.091, d: [0.088, 0.094] },
];

function bodyTemplate(legs: LegStyle, long: boolean, cls: number, det: number) {
  return template(`b|${legs}|${long}|${cls}|${det}`, () => {
    const sc = new Sculpt();
    const lo = det < 0.5;
    const ts = q(20, 7, det), ls = q(12, 5, det), sub = det >= 1.1 ? 1 : 0, cr = lo ? 180 : 46;
    const belly = cls === 2 ? 1 : 0, slim = cls === 0 ? 1 : 0;
    const wst = 1 + 0.08 * belly - 0.07 * slim; // waist width
    const bf = 0.07 * belly - 0.008 * slim; // how far the belly comes out
    const L = (rings: Ring[], o: LoftO = {}) => loft(rings, { seg: ls, sub, crease: cr, ...o });
    /** Sculpted on the left, mirrored to the right. */
    const both = (g: THREE.BufferGeometry, slot: number, bind: Bind, add: AddOpts = {}) => {
      sc.add(g, slot, bind, null, null, null, add);
      sc.add(g, slot, bind, null, null, MIRROR, add);
    };
    const robe = legs === 'robe';

    // ---- trunk: hips, then the shirt with its hem hanging over the waistband
    sc.add(loft([
      { t: 0.872, w: 0.1, d: [0.072, 0.082] },
      { t: 0.9, w: 0.15, d: [0.104, 0.116] },
      { t: 0.93, w: 0.168, d: [0.113, 0.126] },
      { t: 0.97, w: 0.17 * (1 + 0.04 * belly), d: [0.115 + bf * 0.6, 0.122] },
      { t: 1.02, w: 0.16 * wst, d: [0.112 + bf, 0.108] },
      { t: 1.055, w: 0.153 * wst, d: [0.11 + bf, 0.1] },
    ], { seg: ts, sub, n: 2.4, cap: ['round', 'flat'], dome: 0.012, crease: cr }), S.lower, PELVIS);
    sc.add(loft([
      { t: 1.03, w: 0.161 * wst, d: [0.118 + bf * 1.05, 0.108], sh: 0.88 },
      { t: 1.09, w: 0.15 * wst, d: [0.11 + bf * 1.1, 0.097] },
      { t: 1.16, w: 0.158 * (1 + 0.05 * belly - 0.04 * slim), d: [0.114 + bf, 0.1] },
      { t: 1.26, w: 0.184, d: [0.136 + bf * 0.5, 0.116] },
      { t: 1.34, w: 0.206, d: [0.144 + bf * 0.2, 0.128] },
      { t: 1.395, w: 0.228, d: [0.128, 0.124] },
      { t: 1.432, w: 0.224, d: [0.106, 0.11] },
      { t: 1.456, w: 0.16, d: [0.086, 0.092] },
      { t: 1.47, w: 0.086, d: [0.066, 0.072] },
    ], { seg: ts, sub, n: 2.4, cap: 'flat', uv: [1, 1], crease: cr }), S.shirt, trunkBind, null, null, null, { tex: 1.75 });
    sc.add(L([
      { t: 1.43, w: 0.054, d: [0.056, 0.058] },
      { t: 1.5, w: 0.048, d: 0.05, sh: 0.88 },
      { t: 1.58, w: 0.05, d: 0.052, sh: 0.8 },
    ], { cap: 'none' }), S.skin, CHEST);
    if (!lo) {
      sc.add(L([
        { t: 1.45, w: 0.073, d: [0.075, 0.077] },
        { t: 1.486, w: 0.062, d: [0.064, 0.066] },
      ], { seg: q(14, 6, det) }), robe ? S.robe : S.collar, CHEST);
    }

    // ---- arms
    const A = (rings: Ring[], slot: number, o: LoftO = {}, add: AddOpts = {}) => both(L(side(SH_Z, rings), o), slot, armBind, add);
    if (robe) {
      // bell sleeves, dark inside the cuff
      A([
        { t: 0.898, w: 0.058, d: 0.052, sh: 0.3 },
        { t: 0.902, w: 0.07, d: 0.062, sh: 0.85 },
        { t: 1.0, w: 0.062, d: 0.058 },
        { t: EL_Y, w: 0.052, d: 0.052 },
        { t: 1.26, w: 0.056, d: 0.056 },
        { t: 1.34, w: 0.064, d: 0.064 },
        { t: SH_Y - 0.01, w: 0.066, d: 0.066 },
      ], S.robe, { cap: ['flat', 'round'], dome: 0.046 });
    } else if (long) {
      const sleeve = grow(0.004, ARM);
      sleeve.splice(0, 2, { t: WRIST_Y + 0.004, w: 0.033, d: 0.03, sh: 0.86 }, { t: WRIST_Y + 0.03, w: 0.033, d: 0.03, sh: 0.86 }, { t: WRIST_Y + 0.034, w: 0.036, d: 0.033 });
      A(sleeve, S.shirt, { cap: ['flat', 'round'], dome: 0.042, uv: [1, 1] }, { tex: 2.3 });
    } else {
      A(ARM.slice(0, 8), S.skin, { cap: ['flat', 'none'] });
      A([
        { t: 1.25, w: 0.048, d: 0.048, sh: 0.3 },
        { t: 1.254, w: 0.056, d: 0.056, sh: 0.85 },
        { t: 1.34, w: 0.062, d: 0.063 },
        { t: SH_Y - 0.01, w: 0.064, d: 0.064 },
      ], S.shirt, { cap: ['flat', 'round'], dome: 0.044, uv: [1, 1] }, { tex: 0.8 });
    }
    // hands: a palm, four fingers and a thumb (a mitten from far away)
    both(loft(side(SH_Z, lo ? [
      { t: WRIST_Y - 0.15, w: 0.01, d: 0.026 },
      { t: WRIST_Y - 0.09, w: 0.014, d: 0.038 },
      { t: WRIST_Y + 0.006, w: 0.02, d: 0.024 },
    ] : [
      { t: WRIST_Y - 0.093, w: 0.011, d: 0.034 },
      { t: WRIST_Y - 0.065, w: 0.0135, d: 0.04 },
      { t: WRIST_Y - 0.025, w: 0.015, d: 0.036 },
      { t: WRIST_Y + 0.008, w: 0.02, d: 0.024 },
    ]), { seg: q(8, 4, det), n: 2.6, cap: ['round', 'flat'], dome: 0.008, crease: cr }), S.hands, foreBind);
    if (!lo) {
      const ky = WRIST_Y - 0.088;
      const digit = { seg: sub ? 6 : 4, curve: !!sub, steps: 2 };
      for (let i = 0; i < 4; i++) {
        const x = -0.027 + i * 0.018, len = i === 0 || i === 3 ? 0.056 : 0.066;
        both(pipe([[x, ky, SH_Z], [x, ky - len * 0.55, SH_Z - 0.004], [x * 0.95, ky - len, SH_Z - 0.016]], [0.0086, 0.008, 0.0064], digit), S.hands, foreBind);
      }
      both(pipe([[0.028, WRIST_Y - 0.02, SH_Z - 0.004], [0.05, WRIST_Y - 0.05, SH_Z - 0.008], [0.056, WRIST_Y - 0.082, SH_Z - 0.014]], [0.0115, 0.0098, 0.0072], digit), S.hands, foreBind);
    }

    // ---- legs
    const G = (rings: Ring[], slot: number, o: LoftO = {}) => both(L(side(HIP_Z, rings), o), slot, legBind);
    const top: LoftO = { cap: ['flat', 'round'], dome: 0.06 };
    if (legs === 'trousers' || robe) G(TROUSER, S.legs, top);
    else {
      G(LEG, S.skin, top);
      if (legs === 'shorts') {
        G([
          { t: 0.585, w: 0.062, d: [0.064, 0.06], sh: 0.3 },
          { t: 0.59, w: 0.079, d: [0.081, 0.079], sh: 0.85 },
          { t: 0.7, w: 0.083, d: [0.085, 0.083] },
          { t: 0.84, w: 0.09, d: [0.088, 0.092] },
          { t: HIP_Y, w: 0.092, d: [0.089, 0.095] },
        ], S.legs, top);
        G(grow(0.004, LEG.slice(0, 2)), S.socks, { cap: 'flat', sub: 0 });
      } else {
        // kilt hose: knee-length socks with a turned-over cuff and a flash on the outside
        G(grow(0.004, [...LEG.slice(0, 4), { t: 0.385, w: 0.053, d: [0.05, 0.06] }]), S.socks, { cap: 'flat' });
        G([
          { t: 0.372, w: 0.062, d: [0.058, 0.071], sh: 0.9 },
          { t: 0.425, w: 0.06, d: [0.06, 0.065], sh: 0.9 },
        ], S.socks, { cap: 'flat', sub: 0 });
        if (!lo) {
          for (const z of [1, -1]) sc.add(rbox(0.03, 0.075, 0.012, 0.004, 1), S.flash, legBind, [0.006, 0.345, z * (HIP_Z + 0.062)], [z * 0.12, 0, 0]);
        }
      }
    }
    // shoes: a sole and an upper, toes forward
    const fy = ANKLE_Y;
    const shoe = loft(([
      { t: -0.078, w: 0.028, d: [0.05, 0.004] },
      { t: -0.05, w: 0.04, d: [0.082, 0.004] },
      { t: -0.005, w: 0.045, d: [0.088, 0.004] },
      { t: 0.03, w: 0.046, d: [0.074, 0.004] },
      { t: 0.075, w: 0.05, d: [0.055, 0.004] },
      { t: 0.125, w: 0.053, d: [0.048, 0.004] },
      { t: 0.165, w: 0.049, d: [0.043, 0.004] },
      { t: 0.192, w: 0.034, d: [0.032, 0.004] },
    ] as Ring[]).map((r) => ({ ...r, x: fy - 0.05, z: HIP_Z })), { axis: 'x', seg: q(12, 6, det), sub, n: 2.5, cap: 'round', dome: [0.012, 0.016], crease: cr });
    const sole = loft([
      { t: -0.084, w: 0.03 },
      { t: -0.055, w: 0.043 },
      { t: 0.02, w: 0.047 },
      { t: 0.1, w: 0.056 },
      { t: 0.165, w: 0.051 },
      { t: 0.2, w: 0.034 },
    ].map((r) => ({ ...r, d: 0.012, x: fy - 0.058, z: HIP_Z })), { axis: 'x', seg: q(12, 6, det), n: 5, cap: 'round', dome: [0.008, 0.012], crease: lo ? 180 : 40 });
    both(shoe, S.shoes, shinBind);
    both(sole, S.sole, shinBind);

    // ---- what goes over the top
    if (legs === 'kilt') {
      sc.add(loft([
        { t: 1.004, w: 0.176 * wst, d: [0.128 + bf, 0.124] },
        { t: 1.046, w: 0.174 * wst, d: [0.127 + bf, 0.122] },
      ], { seg: ts, n: 2.4, crease: cr }), S.belt, PELVIS);
      if (!lo) {
        const fx = 0.156 + bf * 0.55;
        sc.add(rbox(0.014, 0.04, 0.056, 0.005, 1), S.metal, PELVIS, [0.131 + bf, 1.025, 0]);
        // the sporran: a leather pouch, a metal cantle and three tassels
        sc.add(ball(0.05, q(12, 6, det), 1.15, 0.55, 1.1), S.leather, PELVIS, [fx + 0.012, 0.86, 0]);
        sc.add(ball(0.05, q(12, 6, det), 0.6, 0.6, 1.14), S.leather, PELVIS, [fx + 0.014, 0.892, 0], null, null, { shade: 0.6 });
        sc.add(rbox(0.022, 0.016, 0.092, 0.006, 1), S.metal, PELVIS, [fx + 0.016, 0.912, 0]);
        for (const z of [-0.026, 0, 0.026]) {
          sc.add(cyl(0.007, 0.011, 0.05, 6), S.white, PELVIS, [fx + 0.04, 0.85, z]);
          sc.add(ball(0.009, 6), S.metal, PELVIS, [fx + 0.04, 0.878, z]);
        }
      }
    }
    if (robe) {
      const folds = (a: number, v: number) => 1 + 0.045 * Math.sin(a * 8) * (1 - v) ** 1.5;
      sc.add(loft([
        { t: 0.066, w: 0.29, d: [0.26, 0.31], sh: 0.25 },
        { t: 0.07, w: 0.33, d: [0.3, 0.35], sh: 0.8 },
        { t: 0.45, w: 0.26, d: [0.22, 0.25] },
        { t: 0.8, w: 0.2, d: [0.155, 0.17] },
        { t: 0.97, w: 0.178, d: [0.125 + bf * 0.6, 0.132] },
        { t: 1.06, w: 0.166 * wst, d: [0.12 + bf, 0.11] },
      ], { seg: q(24, 8, det), sub, cap: ['flat', 'none'], mod: folds, crease: cr }), S.robe, PELVIS);
      // the top of the robe, open down the front over the shirt
      sc.add(loft([
        { t: 1.04, w: 0.172 * wst, d: [0.126 + bf * 1.05, 0.116] },
        { t: 1.16, w: 0.168, d: [0.122 + bf, 0.108] },
        { t: 1.26, w: 0.194, d: [0.144 + bf * 0.5, 0.124] },
        { t: 1.34, w: 0.216, d: [0.152, 0.136] },
        { t: 1.395, w: 0.238, d: [0.136, 0.132] },
        { t: 1.434, w: 0.234, d: [0.114, 0.118] },
        { t: 1.46, w: 0.168, d: [0.094, 0.1] },
        { t: 1.48, w: 0.096, d: [0.074, 0.08] },
      ], { seg: q(24, 8, det), sub, n: 2.4, cap: 'flat', crease: cr, mod: (a, v) => (off(a) < 0.1 + 0.32 * v ? 0.9 : 1) }), S.robe, trunkBind);
      sc.add(ball(0.085, q(12, 6, det), 0.75, 0.9, 1.25), S.robe, CHEST, [-0.09, 1.452, 0], null, null, { shade: 0.9 });
    }
    return sc;
  });
}

// ------------------------------------------------------------------ the head
function headTemplate(hs: HairStyle, beard: boolean, det: number) {
  return template(`h|${hs}|${beard}|${det}`, () => {
    const sc = new Sculpt();
    const R = D.headR;
    const lo = det < 0.5;
    const seg = q(22, 8, det), sub = det >= 1.1 ? 1 : 0, cr = lo ? 180 : 46;
    const es = q(10, 6, det);
    const H = (rings: Ring[], o: LoftO = {}) => loft(unit(R, rings), { seg, sub, n: 2.15, crease: cr, ...o });
    const at = (x: number, y: number, z: number): V3 => [x * R, y * R, z * R];

    // skull, cheeks and jaw in one skin
    sc.add(H([
      { t: -1.1, w: 0.2, d: [0.3, 0.2], x: 0.4 },
      { t: -1.0, w: 0.4, d: [0.52, 0.42], x: 0.3 },
      { t: -0.8, w: 0.62, d: [0.78, 0.62], x: 0.16 },
      { t: -0.55, w: 0.78, d: [0.92, 0.82], x: 0.06 },
      { t: -0.25, w: 0.86, d: [0.98, 0.96] },
      { t: 0.1, w: 0.9, d: [0.98, 1.03] },
      { t: 0.45, w: 0.89, d: [0.96, 1.04] },
      { t: 0.8, w: 0.76, d: [0.82, 0.9] },
      { t: 1.02, w: 0.5, d: [0.54, 0.6] },
    ], { cap: 'round', dome: [0.05 * R, 0.12 * R] }), S.skin);

    // eyes, wide open in permanent mild alarm
    for (const z of [-1, 1]) {
      sc.add(ball(0.17 * R, es), S.white, 0, at(0.8, 0.2, z * 0.36));
      sc.add(ball(0.084 * R, q(8, 5, det), 1, 0.5, 1), S.iris, 0, at(0.94, 0.2, z * 0.355));
      if (!lo) {
        sc.add(new THREE.SphereGeometry(0.184 * R, es, 5, 0, TAU, 0, Math.PI * 0.36), S.skin, 0, at(0.8, 0.2, z * 0.36), [0, 0, -0.3], null, { shade: 0.9 });
        sc.add(rbox(0.07 * R, 0.066 * R, 0.37 * R, 0.03 * R, 1), S.brow, 0, at(0.935, 0.51, z * 0.36), [z * 0.22, 0, 0]);
        sc.add(ball(0.2 * R, q(8, 5, det), 1.2, 0.5, 0.35), S.skin, 0, at(-0.05, 0, z * 0.9), [0, -z * 0.3, 0], null, { shade: 0.93 });
      }
    }
    // nose
    sc.add(H([
      { t: -0.3, w: 0.1, d: [0.06, 0.05], x: 0.96 },
      { t: -0.2, w: 0.155, d: [0.17, 0.08], x: 0.98 },
      { t: -0.05, w: 0.11, d: [0.13, 0.08], x: 0.97 },
      { t: 0.2, w: 0.07, d: [0.07, 0.06], x: 0.94 },
      { t: 0.32, w: 0.05, d: [0.03, 0.05], x: 0.92 },
    ], { seg: q(10, 5, det), sub: 1, cap: 'round', dome: 0.03 * R, crease: 100 }), S.skin);
    // mouth: further out when there's a beard to clear
    const mx = beard ? 0.16 : 0;
    sc.add(ball(0.2 * R, q(10, 5, det), 0.55, 0.3, 1), S.mouth, 0, at(0.95 + mx, -0.53, 0));
    if (!lo) {
      sc.add(rbox(0.03 * R, 0.05 * R, 0.24 * R, 0.012 * R, 1), S.teeth, 0, at(0.985 + mx, -0.47, 0));
      if (!beard) sc.add(ball(0.16 * R, q(8, 5, det), 0.3, 0.32, 1), S.lips, 0, at(0.972, -0.655, 0));
    }

    if (beard) {
      const scruff = (a: number, v: number) => 1 + 0.035 * Math.sin(a * 9 + v * 7) * Math.sin(v * 11 + a * 2);
      sc.add(H([
        { t: -1.58, w: 0.2, d: [0.26, 0.18], x: 0.52 },
        { t: -1.3, w: 0.54, d: [0.52, 0.34], x: 0.4 },
        { t: -1.0, w: 0.78, d: [0.76, 0.36], x: 0.26 },
        { t: -0.7, w: 0.91, d: [0.94, 0.3], x: 0.14 },
        { t: -0.42, w: 0.935, d: [1.0, 0.25], x: 0.08 },
        { t: -0.12, w: 0.915, d: [0.8, 0.2], x: 0.05 },
      ], { cap: ['round', 'flat'], dome: 0.08 * R, mod: scruff }), S.beard);
      for (const z of [-1, 1]) sc.add(ball(0.2 * R, q(8, 5, det), 0.42, 0.5, 1), S.beard, 0, at(1.07, -0.34, z * 0.14), [z * 0.35, z * 0.25, 0]);
    }

    if (hs !== 'bald') {
      // a shell of hair over the skull, dipping inside it where the face and ears show
      const big = hs === 'wild' ? 1.09 : 1.0;
      const t0 = -0.42, t1 = 1.04;
      const hairline = (a: number, v: number) => {
        const aa = off(a), t = t0 + v * (t1 - t0);
        const line = aa < 0.9 ? 0.6 : aa < 1.75 ? 0.6 - ((aa - 0.9) / 0.85) * 0.55 : -9;
        const tuft = hs === 'wild' ? 0.07 * Math.sin(a * 7 + v * 9) * Math.sin(a * 3 - v * 5) : 0.012 * Math.sin(a * 11 + v * 5);
        return t < line ? 0.88 / big : 1 + tuft;
      };
      sc.add(H([
        { t: t0, w: 0.8, d: [0.5, 0.86], x: -0.02 },
        { t: -0.25, w: 0.9, d: [0.6, 1.0] },
        { t: 0.1, w: 0.955, d: [0.9, 1.085] },
        { t: 0.45, w: 0.945, d: [1.0, 1.095] },
        { t: 0.8, w: 0.81, d: [0.875, 0.955] },
        { t: t1, w: 0.55, d: [0.6, 0.66] },
      ].map((r) => ({ ...r, w: r.w * big, d: [r.d[0] * big, r.d[1] * big] as [number, number] })), { cap: ['flat', 'round'], dome: 0.14 * R * big, mod: hairline }), S.hair);
      if (hs === 'wild' && !lo) {
        // tufts sticking out every which way
        const curl = ball(0.22 * R, q(7, 5, det), 1.35);
        const n = sub ? 14 : 9;
        for (let i = 0; i < n; i++) {
          const a = 1.0 + (i / (n - 1)) * (TAU - 2.0) + (i % 2) * 0.1; // round the back and sides, not over the face
          const up = [0.5, 0.0, 0.3, -0.22][i % 4];
          const r = 0.93 - Math.max(0, up) * 0.2;
          sc.add(curl, S.hair, 0, aim(at(Math.cos(a) * r - 0.05, up, Math.sin(a) * r), [Math.cos(a) * 0.7, 0.7, Math.sin(a) * 0.7], 0.85 + (i % 3) * 0.16), null, null, { shade: 0.9 + (i % 3) * 0.06 });
        }
      }
      if (hs === 'bun') sc.add(ball(0.38 * R, q(10, 6, det)), S.hair, 0, at(-0.92, 0.72, 0));
      if (hs === 'long') {
        // a curtain down to the shoulders
        sc.add(H([
          { t: -1.95, w: 0.86, d: [0.3, 1.0], x: -0.1 },
          { t: -1.2, w: 0.98, d: [0.4, 1.12], x: -0.06 },
          { t: -0.4, w: 0.99, d: [0.6, 1.1] },
          { t: 0.1, w: 0.96, d: [0.7, 1.08] },
        ], { cap: ['round', 'flat'], dome: 0.1 * R, mod: (a) => (off(a) < 1.3 ? 0.55 : 1) }), S.hair, 0, null, null, null, { shade: 0.92 });
      }
    }
    return sc;
  });
}

// ------------------------------------------------------------------ hats
/** A hat, already placed for a head of height scale `s`: add it to the head bone. */
export function hatMesh(style: HatStyle, mat: THREE.Material | undefined, s = 1): THREE.Object3D | null {
  if (!style) return null;
  const m = mat ?? M.black();
  const R = D.headR;
  const g = model(`hat|${style}|${m.uuid}`, () => {
    const p = new Parts();
    const H = (rings: Ring[], o: LoftO = {}) => loft(unit(R, rings), { seg: q(22, 10), sub: 1, ...o });
    const at = (x: number, y: number, z: number): V3 => [x * R, y * R, z * R];
    switch (style) {
      case 'tam': {
        // a headband, a big floppy crown and a toorie on top
        p.add(H([{ t: -0.64, w: 0.93, d: [0.99, 1.07] }, { t: -0.3, w: 0.9, d: [0.96, 1.04] }], { sub: 0 }), color(0x14161c, 0.85));
        p.add(H([
          { t: -0.42, w: 0.92, d: [0.98, 1.06] },
          { t: -0.3, w: 1.4, d: [1.45, 1.5] },
          { t: -0.1, w: 1.7, d: [1.74, 1.8] },
          { t: 0.12, w: 1.56, d: [1.58, 1.66] },
          { t: 0.3, w: 1.0, d: 1.05 },
        ], { cap: ['flat', 'round'], dome: 0.12 * R, uv: [3, 0.6] }), m, at(-0.12, 0, 0.06), [0.12, 0, -0.14]);
        p.add(ball(0.3 * R, q(12, 6), 0.85), color(0xd7263d, 0.95), at(-0.2, 0.5, 0.1));
        break;
      }
      case 'bucket':
        p.add(H([{ t: -0.5, w: 0.96, d: [1.02, 1.1] }, { t: -0.1, w: 0.9, d: [0.95, 1.02] }, { t: 0.12, w: 0.78, d: [0.82, 0.88] }], { cap: ['flat', 'round'], dome: 0.08 * R }), m);
        p.add(H([{ t: -0.76, w: 1.56, d: 1.62 }, { t: -0.71, w: 1.6, d: 1.66 }, { t: -0.46, w: 0.98, d: [1.04, 1.12] }], { sub: 0 }), m, null, null, null, 0.92);
        break;
      case 'cap': {
        p.add(H([{ t: -0.52, w: 0.95, d: [1.01, 1.09] }, { t: -0.2, w: 0.93, d: [0.98, 1.06] }, { t: 0.08, w: 0.78, d: [0.8, 0.9] }], { cap: ['flat', 'round'], dome: 0.12 * R }), m);
        const bill: [number, number][] = [];
        for (let i = 0; i <= 10; i++) {
          const a = -Math.PI / 2 + (i / 10) * Math.PI;
          bill.push([(0.5 + 1.25 * Math.cos(a)) * R, 0.88 * Math.sin(a) * R]);
        }
        p.add(extrude(bill, 0.06 * R, 0.02 * R), m, at(0, -0.5, 0), [Math.PI / 2, 0, -0.14], null, 0.9);
        p.add(ball(0.09 * R, 6, 0.6), m, at(-0.04, 0.2, 0));
        break;
      }
      case 'feather': {
        // a Highland feather bonnet: black and shaggy, diced band, white hackle
        const shag = (a: number, v: number) => 1 + 0.05 * Math.sin(a * 14 + v * 9) * Math.sin(v * 17 + a * 3);
        p.add(H([
          { t: -0.55, w: 1.0, d: [1.05, 1.12] },
          { t: -0.1, w: 1.14, d: [1.18, 1.24] },
          { t: 0.7, w: 1.28, d: [1.3, 1.36] },
          { t: 1.6, w: 1.24, d: 1.28 },
          { t: 2.3, w: 0.92, d: 0.96 },
        ], { cap: ['flat', 'round'], dome: 0.4 * R, mod: shag, seg: q(28, 10) }), color(0x111111, 0.95));
        p.add(H([{ t: -0.57, w: 1.03, d: [1.08, 1.15] }, { t: -0.26, w: 1.12, d: [1.16, 1.22] }], { sub: 0, uv: [4, 0.3], cap: 'none' }), M.tartan('red'));
        p.add(H([{ t: 0, w: 0.12 }, { t: 0.8, w: 0.3 }, { t: 1.7, w: 0.22 }, { t: 2.3, w: 0 }], { seg: 8 }), M.white(), at(0, -0.1, 1.18), [0.12, 0, 0]);
        break;
      }
      case 'top':
        p.add(lathe([[1.0, -0.31], [1.72, -0.3], [1.76, -0.24], [1.08, -0.2], [1.02, -0.19], [1.0, 1.0], [1.1, 2.0], [0, 2.0]].map(([r, y]) => [r * R, y * R] as [number, number]), q(24, 10)), m);
        p.add(cyl(1.04 * R, 1.04 * R, 0.26 * R, q(24, 10), true), color(0x3c3c40, 0.4), at(0, -0.05, 0));
        break;
      case 'beret':
        p.add(H([
          { t: -0.5, w: 0.95, d: [1.0, 1.08] },
          { t: -0.36, w: 1.4, d: [1.4, 1.5] },
          { t: -0.2, w: 1.42, d: [1.42, 1.5] },
          { t: -0.08, w: 0.9, d: 0.95 },
        ], { cap: ['flat', 'round'], dome: 0.1 * R }), m, at(-0.05, 0.02, 0.22), [0.24, 0, -0.05]);
        p.add(cyl(0.03 * R, 0.04 * R, 0.14 * R, 6), m, at(-0.05, 0.1, 0.2));
        break;
    }
    return p.build();
  });
  return seatHat(g, s);
}

/** Put something built in hat space (origin just above the crown, life size) on a head. */
export function seatHat<T extends THREE.Object3D>(g: T, s: number) {
  g.scale.setScalar(s * HEAD_K);
  g.position.set(-0.01 * s, D.headR * 1.05 * s * HEAD_K, 0);
  return g;
}

/** A pleated kilt, flat across the apron. Centred on its own origin so it can billow. */
function kiltMesh(mat: THREE.Material, s: number, b: number, cls: number) {
  const k = s * b;
  const bf = cls === 2 ? 0.055 : cls === 0 ? -0.008 : 0, wst = cls === 2 ? 1.08 : cls === 0 ? 0.93 : 1;
  const seg = q(56, 24) & ~1;
  const pleats = (a: number, v: number) => {
    if (off(a) < 0.95) return 1;
    const j = Math.round((a / TAU) * seg);
    return 1 + (j % 2 ? 0.035 : -0.035) * (0.3 + 0.7 * (1 - v));
  };
  const geo = loft([
    { t: -0.21 * s, w: 0.24 * k, d: [0.205 * k, 0.22 * k] },
    { t: -0.05 * s, w: 0.205 * k, d: [0.165 * k, 0.18 * k] },
    { t: 0.1 * s, w: 0.187 * k, d: [(0.138 + bf * 0.6) * k, 0.147 * k] },
    { t: 0.14 * s, w: 0.181 * k, d: [(0.129 + bf * 0.6) * k, 0.137 * k] },
    { t: 0.21 * s, w: 0.171 * wst * k, d: [(0.123 + bf) * k, 0.119 * k] },
  ], { seg, n: 2.4, cap: 'none', uv: [2, 0.5], mod: pleats, crease: 40 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

// ------------------------------------------------------------------ people
const WHITE = new THREE.Color(1, 1, 1);
const fixed = (hex: number) => new THREE.Color(hex);
const FIXED = {
  white: fixed(0xf4f4f0), iris: fixed(0x1c130c), mouth: fixed(0x4a1a1a), teeth: fixed(0xf0ece0), belt: fixed(0x1a1410), metal: fixed(0xd8a93a),
  leather: fixed(0x5a3a22), flash: fixed(0xc4161c), black: fixed(0x161616), paleSole: fixed(0xd9d6cf), darkSole: fixed(0x1a1512), sock: fixed(0xe8e8e4),
};

/** One colour per slot, from the outfit's materials. */
function palette(o: Outfit, mono: boolean) {
  const c = (m?: THREE.Material) => ((m as any)?.color as THREE.Color | undefined) ?? WHITE;
  const pal: THREE.Color[] = new Array(S.N);
  const skin = c(o.skin);
  if (mono) return pal.fill(skin);
  const shirt = c(o.shirt), leg = c(o.legMat), shoe = c(o.shoes);
  const hair = o.hair ? c(o.hair) : o.beard ? c(o.beard) : FIXED.black;
  pal[S.skin] = skin;
  pal[S.shirt] = shirt;
  pal[S.collar] = shirt.clone().multiplyScalar(0.86);
  // under a kilt, the tartan's ground colour (he sits on the back of it)
  pal[S.lower] = o.legs === 'kilt' ? new THREE.Color(o.legMat.userData.tint ?? 0x7a1820) : leg;
  pal[S.legs] = leg;
  pal[S.robe] = leg;
  pal[S.socks] = o.socks ? c(o.socks) : FIXED.sock;
  pal[S.shoes] = shoe;
  pal[S.sole] = shoe.r + shoe.g + shoe.b > 0.6 ? FIXED.paleSole : FIXED.darkSole;
  pal[S.hair] = hair;
  pal[S.beard] = o.beard ? c(o.beard) : hair;
  pal[S.brow] = hair.clone().multiplyScalar(0.55);
  pal[S.hands] = c(o.gloves ?? o.skin);
  pal[S.lips] = new THREE.Color(skin.r * 0.8, skin.g * 0.5, skin.b * 0.5);
  pal[S.white] = FIXED.white;
  pal[S.iris] = FIXED.iris;
  pal[S.mouth] = FIXED.mouth;
  pal[S.teeth] = FIXED.teeth;
  pal[S.belt] = FIXED.belt;
  pal[S.metal] = FIXED.metal;
  pal[S.leather] = FIXED.leather;
  pal[S.flash] = FIXED.flash;
  return pal;
}

/** Heads are a touch bigger than life: they read better from a chase camera. */
export const HEAD_K = 1.12;
/** Skin, cloth and shoe leather all share the one material; the differences are in the colour. */
const figureMat = () => vcMat(0.74, 0, THREE.FrontSide, false);
/** The detail the far-off crowd is baked at. */
const FAR = 0.4;
const shapeOf = (o: Outfit) => ({
  long: o.legs === 'robe' || !!o.longSleeves,
  cls: (o.build ?? 1) < 0.96 ? 0 : (o.build ?? 1) > 1.1 ? 2 : 1,
  hair: (o.hair ? o.hairStyle ?? 'short' : 'bald') as HairStyle,
});

/** A complete posable figure. */
export function buildHuman(o: Outfit): Rig {
  const h = o.height ?? 1.75;
  const s = h / 1.75;
  const b = o.build ?? 1;
  const det = Math.round(QUALITY.detail * (o.detail ?? 1) * 100) / 100;
  const root = new THREE.Group();

  // the skeleton, laid out for this height and build
  const J = layout(s, b);
  const bones = J.map(() => new THREE.Bone());
  J.forEach((p, i) => {
    const par = PARENT[i];
    bones[i].position.copy(par < 0 ? p : p.clone().sub(J[par]));
    (par < 0 ? root : bones[par]).add(bones[i]);
  });
  // the sculpt is a 1.75 m figure of average build: each bone stretches its share to fit
  const inv = J0.map((p, i) => {
    const k = 1 + (b - 1) * GIRTH[i];
    return new THREE.Matrix4().makeScale(s * k, s, s * k).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  });

  // a statue is one material all over; people are vertex colour
  const mono = o.skin === o.shirt && o.shirt === o.legMat;
  const sm = o.skin as THREE.MeshStandardMaterial;
  const fig = mono ? vcMat(sm.roughness, sm.metalness) : figureMat();
  const pal = palette(o, mono);
  const shape = shapeOf(o);
  const tpl = bodyTemplate(o.legs, shape.long, shape.cls, det);
  const textured = !mono && !!(o.shirt as any).map;
  const geo = dress(tpl, pal, true, textured);
  if (textured) {
    geo.addGroup(0, tpl.split, 0);
    geo.addGroup(tpl.split, tpl.index.count - tpl.split, 1);
  }
  const body = new THREE.SkinnedMesh(geo, textured ? [fig, o.shirt] : fig);
  body.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9 * s, 0), 1.7 * s);
  body.userData.fig = true;
  root.add(body);

  const head = bones[HEAD];
  const face = new THREE.Mesh(dress(headTemplate(shape.hair, !!o.beard, det), pal, false), fig);
  face.scale.setScalar(s * HEAD_K);
  face.userData.fig = true;
  head.add(face);
  const hat = hatMesh(o.hat ?? null, o.hatMat, s);
  if (hat) head.add(hat);
  let kilt: THREE.Mesh | null = null;
  if (o.legs === 'kilt') {
    kilt = kiltMesh(o.legMat, s, b, shape.cls);
    kilt.position.y = -0.14 * s;
    bones[PELVIS].add(kilt);
  }
  root.traverse((x: any) => x.isMesh && (x.castShadow = true));
  return {
    root, pelvis: bones[PELVIS], chest: bones[CHEST], head, hat,
    shoulderL: bones[SH_L], shoulderR: bones[SH_R], elbowL: bones[EL_L], elbowR: bones[EL_R],
    hipL: bones[HIP_L], hipR: bones[HIP_R], kneeL: bones[KN_L], kneeR: bones[KN_R],
    kilt, height: h, body, face, bones, inv, pal, outfit: o,
  };
}

/**
 * The figure as it is posed right now, baked into plain low-detail geometry (for the far-off
 * crowd, which is merged into a few meshes). `to` takes world space to wherever it's going.
 */
export function bakeFigure(rig: Rig, to: THREE.Matrix4, det = FAR) {
  const o = rig.outfit;
  const shape = shapeOf(o);
  const out: THREE.BufferGeometry[] = [];
  const bake = (t: Template, mats: THREE.Matrix4[]) => {
    const n = t.slot.length;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const p = new THREE.Vector3(), a = new THREE.Vector3(), nn = new THREE.Vector3(), na = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const m0 = mats[t.bone[i * 2]], m1 = mats[t.bone[i * 2 + 1]], w = t.w0[i];
      p.fromBufferAttribute(t.position, i);
      nn.fromBufferAttribute(t.normal, i);
      a.copy(p).applyMatrix4(m0);
      na.copy(nn).transformDirection(m0);
      if (w < 0.999 && m1 !== m0) {
        a.multiplyScalar(w).addScaledVector(p.applyMatrix4(m1), 1 - w);
        na.multiplyScalar(w).addScaledVector(nn.transformDirection(m1), 1 - w).normalize();
      }
      pos.set([a.x, a.y, a.z], i * 3);
      nor.set([na.x, na.y, na.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', tint(t, rig.pal));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(t.index.array), 1));
    out.push(g);
  };
  bake(bodyTemplate(o.legs, shape.long, shape.cls, det), rig.bones.map((bn, i) => new THREE.Matrix4().multiplyMatrices(to, bn.matrixWorld).multiply(rig.inv[i])));
  const hm = new THREE.Matrix4().multiplyMatrices(to, rig.face.matrixWorld);
  bake(headTemplate(shape.hair, !!o.beard, det), [hm]);
  return { geos: out, mat: rig.face.material as THREE.Material };
}

// ------------------------------------------------------------------ poses
export function poseStand(r: Rig, t = 0) {
  const sway = Math.sin(t * 1.3) * 0.04;
  r.shoulderL.rotation.set(-0.12, 0, 0.05 + sway);
  r.shoulderR.rotation.set(0.12, 0, 0.05 - sway);
  r.elbowL.rotation.set(0, 0, 0.15);
  r.elbowR.rotation.set(0, 0, 0.15);
  r.hipL.rotation.set(0, 0, 0);
  r.hipR.rotation.set(0, 0, 0);
  r.kneeL.rotation.set(0, 0, 0);
  r.kneeR.rotation.set(0, 0, 0);
  r.chest.rotation.set(0, 0, sway * 0.5);
}

export function poseRun(r: Rig, phase: number, k = 1) {
  const s = Math.sin(phase);
  r.hipL.rotation.set(0, 0, s * 0.9 * k);
  r.hipR.rotation.set(0, 0, -s * 0.9 * k);
  r.kneeL.rotation.set(0, 0, -Math.max(0, -Math.cos(phase)) * 1.4 * k - 0.15);
  r.kneeR.rotation.set(0, 0, -Math.max(0, Math.cos(phase)) * 1.4 * k - 0.15);
  r.shoulderL.rotation.set(-0.15, 0, -s * 1.1 * k);
  r.shoulderR.rotation.set(0.15, 0, s * 1.1 * k);
  r.elbowL.rotation.set(0, 0, 1.3);
  r.elbowR.rotation.set(0, 0, 1.3);
  r.chest.rotation.set(0, s * 0.15 * k, -0.25 * k);
}

/** Flying through the air: arms and legs windmill, utterly undignified. */
export function poseFlail(r: Rig, t: number, seed = 0) {
  const a = t * 14 + seed;
  r.shoulderL.rotation.set(-1.2 - Math.sin(a) * 0.8, 0, Math.cos(a) * 2.2);
  r.shoulderR.rotation.set(1.2 + Math.sin(a + 1) * 0.8, 0, Math.cos(a + 2) * 2.2);
  r.elbowL.rotation.set(0, 0, 0.6 + Math.sin(a * 1.3) * 0.6);
  r.elbowR.rotation.set(0, 0, 0.6 + Math.cos(a * 1.1) * 0.6);
  r.hipL.rotation.set(-0.5 - Math.sin(a * 0.9) * 0.4, 0, Math.sin(a) * 1.1);
  r.hipR.rotation.set(0.5 + Math.cos(a * 0.8) * 0.4, 0, -Math.sin(a) * 1.1);
  r.kneeL.rotation.set(0, 0, -0.4 - Math.abs(Math.sin(a * 1.2)) * 1.0);
  r.kneeR.rotation.set(0, 0, -0.4 - Math.abs(Math.cos(a * 1.2)) * 1.0);
}

/** Lying in a heap: limbs splayed. */
export function poseSplat(r: Rig) {
  r.shoulderL.rotation.set(-1.4, 0, 0.3);
  r.shoulderR.rotation.set(1.4, 0, -0.2);
  r.elbowL.rotation.set(0, 0, 0.4);
  r.elbowR.rotation.set(0, 0, 0.8);
  r.hipL.rotation.set(-0.4, 0, 0.2);
  r.hipR.rotation.set(0.3, 0, -0.1);
  r.kneeL.rotation.set(0, 0, -0.3);
  r.kneeR.rotation.set(0, 0, -0.6);
}

// ------------------------------------------------------------------ outfits
export const SKINS = [0xf1c7a5, 0xe0ac8a, 0x8d5a3b, 0xf6d6c0, 0xb57a52, 0x6b4430];
const SHIRTS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xffd166, 0x8e44ad, 0x06d6a0, 0xef476f, 0xf1f1f1, 0x3a86ff, 0xff8fab];
const PANTS = [0x2b2d42, 0x6c584c, 0x3d5a80, 0x22223b, 0xa3a380, 0xc2b280, 0x4a5a6a];
const HAIR = [0x2a1d14, 0x5a3a22, 0xc9a35b, 0x111111, 0xb5541c, 0x9a9a9a, 0xe0d6c0];

export function hamishOutfit(): Outfit {
  return {
    skin: color(0xf3c3a3, 0.7), shirt: color(0xf4f1ea, 0.8), longSleeves: true,
    legs: 'kilt', legMat: M.tartan('red'), socks: color(0xe9e4d6, 0.9), shoes: color(0x1a1a1a, 0.5),
    hair: color(0xc2541c, 0.95), hairStyle: 'wild', beard: color(0xc2541c, 0.95),
    hat: 'tam', hatMat: M.tartan('blue'), build: 1.15, height: 1.78, detail: 1.2,
  };
}

export function touristOutfit(r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const hats: HatStyle[] = ['bucket', 'cap', null, null, 'tam', 'bucket'];
  const hat = pick(hats);
  const legs: LegStyle = r() < 0.55 ? 'shorts' : 'trousers';
  return {
    skin: color(pick(SKINS), 0.7), shirt: color(pick(SHIRTS), 0.85), longSleeves: r() < 0.3,
    legs, legMat: color(pick(PANTS), 0.85), shoes: color(r() < 0.5 ? 0xf2f2f2 : 0x333333, 0.6),
    hair: color(pick(HAIR), 0.9), hairStyle: pick(['short', 'short', 'long', 'bun', 'bald'] as HairStyle[]),
    beard: r() < 0.15 ? color(pick(HAIR), 0.9) : undefined,
    hat, hatMat: hat === 'tam' ? M.tartan('red') : color(pick([0xf4e3b2, 0x1b4f9c, 0xd7263d, 0x2a2a2a]), 0.85),
    build: 0.9 + r() * 0.35, height: 1.55 + r() * 0.35,
  };
}

/** Match-day fan: Hearts in maroon, Hibs in green, both in jeans. */
export function fanOutfit(team: 'hearts' | 'hibs', r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const shirt = team === 'hearts' ? 0x7a1f3d : 0x0b6b3a;
  const hat: HatStyle = pick(['bucket', null, null, 'cap', 'bucket'] as HatStyle[]);
  return {
    skin: color(pick(SKINS), 0.7), shirt: color(shirt, 0.75), longSleeves: r() < 0.4,
    legs: 'trousers', legMat: color(pick([0x2b3a55, 0x3d5a80, 0x22223b]), 0.85), shoes: color(r() < 0.5 ? 0xf2f2f2 : 0x222222, 0.6),
    hair: color(pick(HAIR), 0.9), hairStyle: pick(['short', 'short', 'bald', 'wild'] as HairStyle[]),
    beard: r() < 0.3 ? color(pick(HAIR), 0.9) : undefined,
    hat, hatMat: color(team === 'hearts' ? (r() < 0.5 ? 0x7a1f3d : 0xf2f2f2) : r() < 0.5 ? 0x0b6b3a : 0xf2f2f2, 0.8),
    build: 1.0 + r() * 0.3, height: 1.65 + r() * 0.25,
  };
}

/** A wizard-film fan: a maroon robe over maroon, the hair is anybody's. */
export function wizardOutfit(r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  return {
    skin: color(pick(SKINS), 0.7), shirt: color(0x5a1424, 0.85), longSleeves: true,
    legs: 'robe', legMat: color(0x6b1a2c, 0.9), shoes: M.black(),
    hair: color(pick(HAIR), 0.9), hairStyle: pick(['wild', 'short', 'long', 'bun'] as HairStyle[]),
    build: 0.85 + r() * 0.3, height: 1.45 + r() * 0.4,
  };
}

/** An Instagrammer: something bright, something pastel, a cap now and then. */
export function influencerOutfit(r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const hat: HatStyle = r() < 0.3 ? 'cap' : r() < 0.15 ? 'bucket' : null;
  return {
    skin: color(pick(SKINS), 0.65), shirt: color(pick([0xff5fa2, 0xf6f1e9, 0xc8a2ff, 0xffd84d, 0x7fe0c8, 0xff8a5c]), 0.7), longSleeves: r() < 0.3,
    legs: r() < 0.5 ? 'shorts' : 'trousers', legMat: color(pick([0xe8e0d0, 0x87a8d0, 0x2b2d42, 0xf2f2f2]), 0.8), shoes: color(0xf6f6f6, 0.5),
    hair: color(pick(HAIR), 0.85), hairStyle: pick(['long', 'bun', 'long', 'short'] as HairStyle[]),
    hat, hatMat: color(pick([0xf6f1e9, 0x111111, 0xff5fa2]), 0.8),
    build: 0.9 + r() * 0.15, height: 1.6 + r() * 0.2,
  };
}

/** A wee marcher: green hair, blue robe, about knee high. (A nod to a certain Dundee classic.) */
export function marcherOutfit(): Outfit {
  const blue = color(0x2f55d4, 0.6);
  return {
    skin: color(0xf3d2b8, 0.6), shirt: blue, longSleeves: true, legs: 'robe', legMat: blue, shoes: blue,
    hair: color(0x2fbf3a, 0.7), hairStyle: 'wild', build: 1.15, height: 0.72,
  };
}

/** A commuter in lycra: something loud on top, black below. */
export function cyclistOutfit(r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  return {
    skin: color(pick(SKINS), 0.7), shirt: color(pick([0xffd400, 0x1e6fd0, 0xff3b8d, 0x35d06a, 0xff7a1a, 0xd8ff2a]), 0.35), longSleeves: r() < 0.5,
    legs: r() < 0.6 ? 'shorts' : 'trousers', legMat: color(0x151518, 0.4), socks: color(0xf2f2f2, 0.8), shoes: color(pick([0xf2f2f2, 0x222222, 0xff3b3b]), 0.4),
    hair: color(pick(HAIR), 0.9), hairStyle: pick(['short', 'short', 'bun', 'bald'] as HairStyle[]),
    beard: r() < 0.2 ? color(pick(HAIR), 0.9) : undefined, build: 0.85 + r() * 0.2, height: 1.65 + r() * 0.25,
  };
}

export function mimeOutfit(): Outfit {
  return {
    skin: color(0xf7f7f7, 0.6), shirt: M.stripes('#111111', '#f2f2f2'), longSleeves: true,
    legs: 'trousers', legMat: M.black(), shoes: M.black(), gloves: M.white(),
    hair: M.black(), hairStyle: 'short', hat: 'beret', hatMat: M.black(), build: 0.85, height: 1.72,
  };
}

export function piperOutfit(): Outfit {
  return {
    skin: color(0xe9b796, 0.7), shirt: color(0x111827, 0.7), longSleeves: true,
    legs: 'kilt', legMat: M.tartan('green'), socks: color(0xe9e4d6, 0.9), shoes: M.black(),
    hair: color(0x5a3a22), hairStyle: 'short', beard: color(0x5a3a22, 0.9), hat: 'feather', build: 1.05, height: 1.8,
  };
}

export function ghostOutfit(): Outfit {
  return {
    skin: color(0xe8e4dc, 0.7), shirt: M.black(), longSleeves: true,
    legs: 'robe', legMat: color(0x141414, 0.9), shoes: M.black(),
    hair: color(0x9a9a9a), hairStyle: 'long', hat: 'top', hatMat: M.black(), build: 0.9, height: 1.85,
  };
}
