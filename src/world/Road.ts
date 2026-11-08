import * as THREE from 'three';

/**
 * The course in "road space": s = distance along the street (metres), u = sideways offset
 * (positive = right when looking along the course). The centre line is a sampled path so the
 * course can wind through Edinburgh: the Royal Mile is a gentle S-bend, the long course takes the
 * diversion down Victoria Street, through the Grassmarket, up to Princes Street and down Leith Walk.
 */
export type CourseId = 'royalmile' | 'diversion';

export const HALF_ROAD = 4.6; // carriageway half width
export const HALF_STREET = 7.6; // to the building facades
export const KERB = 0.08;
export const BAY_T = 8;

export interface Bay {
  s0: number;
  s1: number;
  w: number;
  name: string;
}
interface Zone {
  s0: number;
  s1: number;
  l: number;
  r: number;
}

const RM_BAYS: Bay[] = [
  { s0: 134, s1: 222, w: 12.2, name: 'Parliament Square' },
  { s0: 332, s1: 372, w: 11.0, name: 'Hunter Square' },
  { s0: 466, s1: 506, w: 10.8, name: 'Canongate' },
];

export let COURSE: CourseId = 'royalmile';
/** 1 = Royal Mile, 2 = to the Grassmarket, 3 = to Princes Street, 4 = Leith Walk and the sea. */
export let TIER = 1;
export let S_MIN = -52;
export let S_MAX = 660;
export let START_S = -14;
export let FINISH_S = 590;
export let U_MIN = -9.5;
export let U_MAX = 13.5;
/** Engines start here (Infinity = never). */
export let ENGINE_S = Infinity;
/** The cheeky downhill nudge for stalled vehicles stops here. */
export let ASSIST_END = 600;
/** Building lines / guide rails run between these. */
export let WALL_S0 = -4;
export let WALL_S1 = 570;
/** Height of the Firth of Forth (only on the full course). */
export let SEA_Y = -1000;
/** From here on, the ground right of the sea wall drops into the Forth. */
export let SEA_S0 = Infinity;
export let BAYS: Bay[] = RM_BAYS;
let ZONES: Zone[] = [];
/** Named places along the course (start of each stretch). */
export const MARKS: Record<string, number> = {};

/** Where the long course leaves the Royal Mile (the George IV Bridge junction). */
export const JOIN_S = 112;

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Distance from the centre line to the building line on the right (+u) side. */
export function edgeR(s: number) {
  for (const b of BAYS) {
    if (s <= b.s0 || s >= b.s1) continue;
    const k = Math.min(1, (s - b.s0) / BAY_T, (b.s1 - s) / BAY_T);
    return HALF_STREET + (b.w - HALF_STREET) * k;
  }
  for (const z of ZONES) {
    if (s <= z.s0 || s >= z.s1) continue;
    const k = Math.min(1, (s - z.s0) / BAY_T, (z.s1 - s) / BAY_T);
    return HALF_STREET + (z.r - HALF_STREET) * k;
  }
  return HALF_STREET;
}

/** Distance from the centre line to the building line on the left (-u) side. */
export function edgeL(s: number) {
  for (const z of ZONES) {
    if (s <= z.s0 || s >= z.s1) continue;
    const k = Math.min(1, (s - z.s0) / BAY_T, (z.s1 - s) / BAY_T);
    return HALF_STREET + (z.l - HALF_STREET) * k;
  }
  return HALF_STREET;
}

// ------------------------------------------------------------------ the Royal Mile profile
function rmGrade(s: number) {
  if (s < -11) return 0.0; // Castle Esplanade (flat)
  if (s < 4) return 0.09 * smooth(-11, 0, s); // gentle roll-off from the launch pad
  if (s > 600) return 0.008; // palace forecourt
  const g = 0.078 + 0.032 * Math.sin(s / 47) + 0.014 * Math.sin(s / 13 + 2);
  return g * (1 - smooth(585, 600, s)) + 0.008 * smooth(585, 600, s);
}

function rmCx(s: number) {
  const k = smooth(0, 70, s) * (1 - smooth(545, 595, s));
  return k * (6 * Math.sin(s / 95) + 3.2 * Math.sin(s / 41 + 1));
}

// ------------------------------------------------------------------ the long course
/**
 * The diversion, as a turtle path from the George IV Bridge junction: [length, turn (degrees,
 * + = left), grade (+ = downhill), name]. Headings follow the real streets; the long straights
 * are squashed so the run stays a few minutes long.
 */
const DIVERSION: [number, number, number, string?][] = [
  [38, -98, 0.04, 'junction'], // right off the Royal Mile onto George IV Bridge
  [22, 0, 0.02, 'givb'],
  [70, -73, 0.1, 'victoria'], // Victoria Street, steep and curving
  [14, -20, 0.05, 'westbow'],
  [95, 0, 0.004, 'grassmarket'],
  [12, -11, -0.02, 'westport'],
  [60, 0, -0.045, 'ksr'], // King's Stables Road, climbing under the castle rock
  [18, -23, -0.05, 'ksrbend'],
  [50, 0, -0.05, 'ksr2'],
  [10, -13, -0.04, 'lothianbend'],
  [45, 0, -0.03, 'lothian'],
  [45, -117, 0.0, 'westend'], // right onto Princes Street
  [270, 0, 0.004, 'princes'],
  [20, 45, 0.03, 'eastend'], // left onto Leith Street
  [75, 0, 0.05, 'leithst'],
  [8, -7, 0.03, 'picardy'],
  [300, 0, 0.028, 'leithwalk'],
  [36, 85, 0.012, 'foot'], // the Foot of the Walk, left towards Newhaven
  [90, 0, 0.015, 'junctionst'],
  [20, 37, 0.01, 'newhaven'],
  [90, 0, 0.008, 'starbank'],
  [14, -14, -0.03, 'seawall'], // kink towards the sea wall and up the slipway
];

// ------------------------------------------------------------------ sampled tables
const TS = 0.25;
let N = 0;
let PX = new Float32Array(0);
let PZ = new Float32Array(0);
let TH = new Float32Array(0);
let HB = new Float32Array(0);
let GR = new Float32Array(0);

/** Rebuild the road for a course. Must run before anything is placed. */
export function setCourse(course: CourseId, tier: number) {
  COURSE = course;
  TIER = tier;
  for (const k of Object.keys(MARKS)) delete MARKS[k];
  S_MIN = -52;
  START_S = -14;
  if (course === 'royalmile') {
    S_MAX = 660;
    FINISH_S = 590;
    U_MIN = -9.5;
    U_MAX = 13.5;
    ENGINE_S = Infinity;
    ASSIST_END = 600;
    WALL_S0 = -4;
    WALL_S1 = 570;
    SEA_Y = -1000;
    SEA_S0 = Infinity;
    BAYS = RM_BAYS;
    ZONES = [];
  } else {
    // the stretch marks along the turtle path
    let s = JOIN_S;
    for (const [len, , , name] of DIVERSION) {
      if (name) MARKS[name] = s;
      s += len;
    }
    MARKS.end = s;
    U_MIN = -12;
    U_MAX = 13.5;
    BAYS = [];
    ENGINE_S = MARKS.grassmarket + 10;
    ASSIST_END = ENGINE_S;
    WALL_S0 = -4;
    SEA_Y = -1000;
    SEA_S0 = Infinity;
    if (tier <= 2) FINISH_S = MARKS.westport - 2;
    else if (tier === 3) FINISH_S = MARKS.eastend - 6;
    else FINISH_S = MARKS.end - 1;
    S_MAX = tier >= 4 ? MARKS.end + 0.5 : FINISH_S + 40;
    WALL_S1 = S_MAX - (tier >= 4 ? 14 : 0);
    ZONES = [
      { s0: MARKS.grassmarket - 4, s1: MARKS.westport + 4, l: 10.6, r: 11.2 },
      { s0: MARKS.princes + 4, s1: MARKS.eastend, l: 9.2, r: 11.0 },
      { s0: MARKS.leithwalk + 6, s1: MARKS.foot - 4, l: 9.0, r: 9.0 },
    ];
  }
  buildTables();
  buildHash();
  if (course === 'diversion' && tier >= 4) {
    SEA_Y = baseH(MARKS.end) - 5.5;
    SEA_S0 = MARKS.starbank + 6;
  }
}

function gradeAt(s: number) {
  if (COURSE === 'royalmile' || s < JOIN_S) return rmGrade(s);
  // blend between the stretches over a few metres
  let s0 = JOIN_S;
  let prev = rmGrade(JOIN_S);
  for (const [len, , g] of DIVERSION) {
    if (s < s0 + len) {
      const k = smooth(s0 - 6, s0 + 6, s);
      return prev + (g - prev) * k;
    }
    prev = g;
    s0 += len;
  }
  return prev;
}

function curvatureAt(s: number) {
  let s0 = JOIN_S;
  for (const [len, turn] of DIVERSION) {
    if (s < s0 + len) return ((turn * Math.PI) / 180) / len;
    s0 += len;
  }
  return 0;
}

function buildTables() {
  N = Math.ceil((S_MAX - S_MIN) / TS) + 2;
  PX = new Float32Array(N);
  PZ = new Float32Array(N);
  TH = new Float32Array(N);
  HB = new Float32Array(N);
  GR = new Float32Array(N);
  let h = 52;
  let x = 0, z = 0, th = 0;
  for (let i = 0; i < N; i++) {
    const s = S_MIN + i * TS;
    if (COURSE === 'royalmile' || s <= JOIN_S) {
      x = rmCx(s);
      z = s;
      th = Math.atan(rmCx(s + 0.5) - rmCx(s - 0.5));
    } else {
      const k = curvatureAt(s - TS * 0.5);
      th += k * TS;
      x += Math.sin(th - k * TS * 0.5) * TS;
      z += Math.cos(th - k * TS * 0.5) * TS;
    }
    PX[i] = x;
    PZ[i] = z;
    TH[i] = th;
    HB[i] = h;
    const g = gradeAt(s + TS * 0.5);
    GR[i] = g;
    h -= g * TS;
  }
}

function lerpTable(t: Float32Array, s: number) {
  const f = (s - S_MIN) / TS;
  const i = Math.max(0, Math.min(N - 2, Math.floor(f)));
  const k = Math.min(1, Math.max(0, f - i));
  // past the ends: extrapolate along the heading so things placed just off the end still work
  return t[i] * (1 - k) + t[i + 1] * k;
}

export function grade(s: number) {
  return lerpTable(GR, s);
}

export function baseH(s: number) {
  if (s > S_MAX) return lerpTable(HB, S_MAX) - grade(S_MAX) * (s - S_MAX);
  return lerpTable(HB, s);
}

export function theta(s: number) {
  return lerpTable(TH, s);
}

function centre(s: number, out: { x: number; z: number }) {
  const sc = Math.max(S_MIN, Math.min(S_MAX, s));
  out.x = lerpTable(PX, sc);
  out.z = lerpTable(PZ, sc);
  const extra = s - sc;
  if (extra !== 0) {
    const t = theta(sc);
    out.x += Math.sin(t) * extra;
    out.z += Math.cos(t) * extra;
  }
  return out;
}

export function curb(u: number) {
  const a = Math.abs(u);
  if (a < HALF_ROAD) return -0.05 * (a / HALF_ROAD) * (a / HALF_ROAD);
  if (a < HALF_ROAD + 0.35) return -0.05 + (KERB + 0.05) * ((a - HALF_ROAD) / 0.35); // dropped kerb, easy to mount
  return KERB;
}

export function H(s: number, u: number) {
  if (s > SEA_S0 && u > edgeR(s) + 0.4) return SEA_Y - 3;
  return baseH(s) + curb(u);
}

/** Curvature at s (radians per metre, + = bending left). */
export function curvature(s: number) {
  return theta(s + 0.5) - theta(s - 0.5);
}

const _c = { x: 0, z: 0 };

/** Road coords → world position. y is added on top of the ground height. */
export function toWorld(s: number, u: number, y = 0, out = new THREE.Vector3()) {
  const t = theta(s);
  centre(s, _c);
  return out.set(_c.x - u * Math.cos(t), H(s, u) + y, _c.z + u * Math.sin(t));
}

/** Road coords → world position at an absolute height. */
export function toWorldAbs(s: number, u: number, y: number, out = new THREE.Vector3()) {
  toWorld(s, u, 0, out);
  out.y = y;
  return out;
}

// ------------------------------------------------------------------ world → road lookup
const CELL = 8;
const REACH = 22; // a query this close to the centre line always finds a candidate
let hash = new Map<number, number[]>();
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

function buildHash() {
  hash = new Map();
  const r = Math.ceil(REACH / CELL);
  for (let i = 0; i < N; i += 4) {
    const cx = Math.floor(PX[i] / CELL), cz = Math.floor(PZ[i] / CELL);
    for (let a = -r; a <= r; a++) {
      for (let b = -r; b <= r; b++) {
        const k = key(cx + a, cz + b);
        let l = hash.get(k);
        if (!l) hash.set(k, (l = []));
        l.push(i);
      }
    }
  }
}

/** World x/z → road coords (nearest point on the centre line). */
export function toRoad(x: number, z: number) {
  const list = hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  let best = -1, bd = Infinity;
  if (list) {
    for (const i of list) {
      const dx = x - PX[i], dz = z - PZ[i];
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  } else {
    for (let i = 0; i < N; i += 16) {
      const dx = x - PX[i], dz = z - PZ[i];
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  let s = S_MIN + best * TS;
  // slide along the heading to the foot of the perpendicular (twice for curves)
  for (let k = 0; k < 2; k++) {
    centre(s, _c);
    const t = theta(s);
    s += (x - _c.x) * Math.sin(t) + (z - _c.z) * Math.cos(t);
  }
  centre(s, _c);
  const t = theta(s);
  const u = -(x - _c.x) * Math.cos(t) + (z - _c.z) * Math.sin(t);
  return { s, u };
}

/** Unit forward (along the course) vector at s. */
export function forward(s: number, out = new THREE.Vector3()) {
  const t = theta(s);
  return out.set(Math.sin(t), 0, Math.cos(t));
}

/** Unit right vector (when looking along the course) at s. */
export function right(s: number, out = new THREE.Vector3()) {
  const t = theta(s);
  return out.set(-Math.cos(t), 0, Math.sin(t));
}

/**
 * Group placed at (s,u) on the ground and rotated to the street. Children use local coords where
 * +Z = along the course, -X = right (+u). Use L(u, y, ds) to build child positions.
 */
export function roadGroup(s: number, u: number, y = 0) {
  const g = new THREE.Group();
  toWorld(s, u, y, g.position);
  g.rotation.y = theta(s);
  return g;
}

/** Local vector inside a roadGroup: u to the right, y up, ds along. */
export function L(u: number, y: number, ds: number) {
  return new THREE.Vector3(-u, y, ds);
}

export { smooth };

setCourse('royalmile', 1);
