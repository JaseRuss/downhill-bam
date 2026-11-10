import * as THREE from 'three';
import { M, color, envReady } from '../art/Materials';
import { canvas, signTex } from '../art/Textures';
import { aim, ball, cyl, extrude, lathe, loft, model, Parts, pipe, q, rbox, torus, V3 } from '../art/Model';

export type VehicleId = 'trolley' | 'blower' | 'scooter' | 'buggy' | 'bathtub';

export interface VehicleSpec {
  id: VehicleId;
  name: string;
  blurb: string;
  /** Engine kicks in at the Grassmarket. null = gravity only. */
  engine: null | { accel: number; top: number; sound: number; start: string };
  /** Main body collider: half extents + centre height, density. */
  body: [number, number, number, number, number];
  /** Low, heavy deck that keeps it the right way up. */
  deck: [number, number, number, number, number];
  ballast: [number, number, number, number, number];
  /** Where Hamish's collider sits (local x, y). */
  riderCol: [number, number];
  /** Where Hamish's seated model goes (local x, y) and how far he leans back. */
  seat: [number, number, number];
  wheels: [number, number][];
  wheelR: number;
  wheelY: number;
  suspRest: number;
  stiffness: number;
  travel: number;
  /** Footprint for shoving rubble out from underneath. */
  under: [number, number, number];
  hop: number;
  /** Multiplier on how hard a hit must be to throw Hamish out. */
  grip: number;
  stats: { speed: number; weight: number; engine: number };
  build(g: THREE.Group): VehicleParts;
}

export interface VehicleParts {
  wheels: THREE.Object3D[];
  springs: THREE.Object3D[];
  /** Spins when the engine runs (blower fan, outboard prop). */
  spinner?: THREE.Object3D;
  /** Puffs smoke from here when the engine runs. */
  exhaust?: THREE.Object3D;
}

// ------------------------------------------------------------------ shared bits
let wireMat: THREE.Material | null = null;
/** Welded wire mesh: one cell per UV unit, so panels choose how fine it is. */
function wire() {
  if (wireMat) return wireMat;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4e8ec';
  g.fillRect(0, 0, 10, 64);
  g.fillRect(0, 0, 64, 7);
  g.fillStyle = 'rgba(40,46,54,0.55)'; // a shadow line gives the wire some roundness
  g.fillRect(7, 0, 3, 64);
  g.fillRect(0, 5, 64, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  wireMat = envReady(new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35 }), 0.8);
  return wireMat;
}

/** A flat four-cornered panel (a, b along the bottom; c, d above them), UVs in wire cells. */
function panel(a: V3, b: V3, c: V3, d: V3, cell: [number, number] = [0.04, 0.1]) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), vc = new THREE.Vector3(...c);
  const u = va.distanceTo(vb) / cell[0], v = va.distanceTo(vc) / cell[1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, 0, v, u, v], 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  g.computeVertexNormals();
  return g;
}

/** Turns a shape spun about Y into one spun about Z (an axle). */
const AXLE: V3 = [Math.PI / 2, 0, 0];

interface WheelOpts {
  tyre: THREE.Material;
  hub: THREE.Material;
  /** A castor fork over the top. */
  fork?: THREE.Material;
  spokes?: number;
  /** Knobbly tread blocks round the tyre. */
  tread?: boolean;
}
/** A wheel group with a 'spin' child (rotates about local Z). */
function wheel(r: number, width: number, o: WheelOpts) {
  const g = new THREE.Group();
  if (o.fork) {
    // a castor: swivel plate, two cheeks down to the axle
    const f = new Parts();
    f.add(cyl(r * 0.5, r * 0.5, 0.012, q(10, 6)), o.fork, [-r * 0.25, r * 1.32, 0]);
    f.add(cyl(r * 0.2, r * 0.2, 0.05, 6), o.fork, [-r * 0.25, r * 1.5, 0]);
    for (const z of [-1, 1]) {
      f.add(extrude([[-r * 0.7, r * 1.32], [r * 0.15, r * 1.32], [r * 0.32, 0], [0, -r * 0.3], [-r * 0.32, 0]], 0.008), o.fork, [0, 0, z * (width / 2 + 0.008)]);
    }
    f.add(cyl(0.008, 0.008, width + 0.03, 6), o.fork, null, AXLE);
    f.build(g);
  }
  const p = new Parts();
  const h = width / 2;
  p.add(lathe([[r * 0.6, -h * 0.9], [r * 0.9, -h], [r, -h * 0.55], [r, h * 0.55], [r * 0.9, h], [r * 0.6, h * 0.9]], q(20, 10), { cap: 'none', crease: 30 }), o.tyre, null, AXLE);
  p.add(lathe([[0.0001, -h * 0.72], [r * 0.2, -h * 0.76], [r * 0.3, -h * 0.6], [r * 0.62, -h * 0.66], [r * 0.62, h * 0.66], [r * 0.3, h * 0.6], [r * 0.2, h * 0.76], [0.0001, h * 0.72]], q(16, 8), { cap: 'none' }), o.hub, null, AXLE);
  // spokes, so you can see it turning
  const n = o.spokes ?? 3;
  for (let i = 0; i < n; i++) p.add(rbox(r * 0.5, r * 0.13, width * 0.74, r * 0.03, 1), o.hub, aim([0, 0, 0], [0, 0, 1]).multiply(new THREE.Matrix4().makeRotationY((i / n) * Math.PI * 2)).multiply(new THREE.Matrix4().makeTranslation(r * 0.36, 0, 0)), null, null, 0.8);
  if (o.tread) {
    const m = q(18, 9);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      p.add(rbox(r * 0.16, r * 0.07, width * 0.92, r * 0.02, 1), o.tyre, [Math.cos(a) * r, Math.sin(a) * r, 0], [0, 0, a + Math.PI / 2], null, 0.85);
    }
  }
  const spin = p.build(new THREE.Group());
  spin.name = 'spin';
  g.add(spin);
  return g;
}

/** Yellow coil spring over a damper rod, unit length hanging from its origin (scaled to the suspension). */
function coil(r: number) {
  return model(`coil|${r}`, () => {
    const p = new Parts();
    const pts: V3[] = [];
    const turns = 5, steps = q(9, 6);
    for (let i = 0; i <= turns * steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push([Math.cos(a) * r, -0.04 - (i / (turns * steps)) * 0.92, Math.sin(a) * r]);
    }
    p.add(pipe(pts, r * 0.2, { seg: 5 }), color(0xe8c020, 0.35, 0.6));
    p.add(cyl(r * 0.36, r * 0.36, 1, 6), M.steel(), [0, -0.5, 0]);
    for (const y of [-0.02, -0.98]) p.add(cyl(r * 1.25, r * 1.25, 0.04, q(10, 6)), M.metal(), [0, y, 0]);
    return p.build();
  });
}

function wheelsAndSprings(g: THREE.Group, spec: { wheels: [number, number][]; wheelR: number }, width: number, w: WheelOpts, coilR: number, springTop: number): VehicleParts {
  const wheels: THREE.Object3D[] = [];
  const springs: THREE.Object3D[] = [];
  const proto = wheel(spec.wheelR, width, w);
  for (const [x, z] of spec.wheels) {
    const wh = proto.clone(true);
    g.add(wh);
    wheels.push(wh);
    const s = coil(coilR);
    s.position.set(x, springTop, z);
    g.add(s);
    springs.push(s);
  }
  return { wheels, springs };
}

// ------------------------------------------------------------------ the shopping trolley
/**
 * A proper supermarket trolley: a tapered wire basket on a tubular chassis that sweeps up at the
 * back into the handle, child-seat flap, plastic bumpers and the coin lock.
 */
function trolleyBody(g: THREE.Group, gold = false) {
  const p = new Parts();
  const chrome = gold ? M.gold() : color(0xc4c9cf, 0.28, 0.85);
  const red = color(0xd02030, 0.4);
  const w = wire();
  // the basket is taller and wider at the handle end than at the nose
  const B = { x: -0.5, z: 0.31, y0: 0.2, y1: 0.76 }, F = { x: 0.5, z: 0.265, y0: 0.25, y1: 0.72 };
  for (const z of [1, -1]) p.add(panel([B.x, B.y0, z * B.z], [F.x, F.y0, z * F.z], [B.x, B.y1, z * B.z], [F.x, F.y1, z * F.z]), w);
  p.add(panel([F.x, F.y0, F.z], [F.x, F.y0, -F.z], [F.x, F.y1, F.z], [F.x, F.y1, -F.z]), w);
  p.add(panel([B.x, B.y0, -B.z], [B.x, B.y0, B.z], [B.x, B.y1, -B.z], [B.x, B.y1, B.z]), w);
  p.add(panel([B.x, B.y0, B.z], [F.x, F.y0, F.z], [B.x, B.y0, -B.z], [F.x, F.y0, -F.z], [0.04, 0.05]), w);
  const loop = (k: number, r: number) => {
    const yb = B.y0 + (B.y1 - B.y0) * k, yf = F.y0 + (F.y1 - F.y0) * k;
    p.add(pipe([[B.x, yb, B.z], [F.x, yf, F.z], [F.x, yf, -F.z], [B.x, yb, -B.z]], r, { closed: true, bend: 0.05, seg: q(6, 4) }), chrome);
  };
  loop(1, 0.013);
  loop(0, 0.009);
  loop(0.5, 0.006);
  for (const z of [1, -1]) {
    p.add(pipe([[B.x, B.y0, z * B.z], [B.x, B.y1, z * B.z]], 0.008, { seg: 5 }), chrome);
    p.add(pipe([[F.x, F.y0, z * F.z], [F.x, F.y1, z * F.z]], 0.008, { seg: 5 }), chrome);
    // chassis rail: along the bottom, then up the back to the handle
    p.add(pipe([[0.47, 0.11, z * 0.25], [-0.34, 0.11, z * 0.3], [-0.52, 0.2, z * 0.3], [-0.64, 0.92, z * 0.3], [-0.7, 1.06, z * 0.3]], 0.016, { bend: 0.1, seg: q(8, 5) }), chrome);
    // struts up to the basket
    p.add(pipe([[0.36, 0.11, z * 0.255], [0.36, 0.25, z * 0.265]], 0.01, { seg: 5 }), chrome);
    p.add(pipe([[-0.26, 0.11, z * 0.295], [-0.3, 0.21, z * 0.3]], 0.01, { seg: 5 }), chrome);
    // bumper corners on the nose
    p.add(rbox(0.07, 0.11, 0.06, 0.02), red, [0.5, 0.26, z * 0.265]);
    p.add(rbox(0.05, 0.05, 0.05, 0.015), red, [0.5, 0.72, z * 0.265]);
  }
  for (const x of [0.47, -0.34]) p.add(pipe([[x, 0.11, 0.3 - (x > 0 ? 0.05 : 0)], [x, 0.11, -0.3 + (x > 0 ? 0.05 : 0)]], 0.013, { seg: 6 }), chrome);
  // the handle: bar, plastic grip, end caps
  p.add(cyl(0.014, 0.014, 0.62, 8), chrome, [-0.7, 1.06, 0], AXLE);
  p.add(cyl(0.024, 0.024, 0.48, q(12, 8)), red, [-0.7, 1.06, 0], AXLE);
  for (const z of [1, -1]) p.add(ball(0.022, 8), red, [-0.7, 1.06, z * 0.32]);
  // child seat: the flap at the back, folded up
  p.add(rbox(0.02, 0.2, 0.5, 0.008), red, [-0.47, 0.62, 0], [0, 0, -0.12]);
  p.add(rbox(0.012, 0.06, 0.4, 0.004), color(0xf2efe8, 0.6), [-0.458, 0.64, 0], [0, 0, -0.12]);
  // the coin lock, obviously, with its chain
  const lock = color(0xe0b020, 0.4, 0.6);
  p.add(rbox(0.05, 0.07, 0.085, 0.012), lock, [-0.7, 1.065, 0.385]);
  p.add(rbox(0.012, 0.02, 0.03, 0.004), color(0x222222, 0.5), [-0.672, 1.07, 0.385]);
  p.add(pipe([[-0.7, 1.03, 0.385], [-0.71, 0.93, 0.38], [-0.68, 0.87, 0.36], [-0.66, 0.9, 0.34]], 0.005, { seg: 4, curve: true }), chrome);
  p.build(g);
}

const castor = (fork: THREE.Material = color(0xb9bec4, 0.3, 0.85)): WheelOpts => ({ tyre: color(0x3a3d42, 0.7), hub: color(0xd0d4d8, 0.3, 0.85), fork, spokes: 2 });
/** Turns a shape spun about Y so it runs back along the vehicle (-X). */
const BACK: V3 = [0, 0, Math.PI / 2];

const TROLLEY_WHEELS: [number, number][] = [[0.42, 0.31], [0.42, -0.31], [-0.42, 0.31], [-0.42, -0.31]];

const trolley: VehicleSpec = {
  id: 'trolley',
  name: 'The Shopping Trolley',
  blurb: 'Liberated from a Leith supermarket. One wheel has opinions. No engine: gravity only.',
  engine: null,
  body: [0.48, 0.28, 0.3, 0.46, 40],
  deck: [0.45, 0.04, 0.25, 0.1, 600],
  ballast: [0.3, 0.06, 0.22, 0.12, 2300],
  riderCol: [-0.06, 1.06],
  seat: [0, 0, 0.25],
  wheels: TROLLEY_WHEELS,
  wheelR: 0.09,
  wheelY: 0.06,
  suspRest: 0.24,
  stiffness: 20,
  travel: 0.2,
  under: [0.6, 0.17, 0.36],
  hop: 1,
  grip: 1,
  stats: { speed: 2, weight: 1, engine: 0 },
  build(g) {
    trolleyBody(g);
    return wheelsAndSprings(g, this, 0.045, castor(), 0.035, 0.08);
  },
};

// ------------------------------------------------------------------ leaf-blower trolley
const blower: VehicleSpec = {
  ...trolley,
  id: 'blower',
  name: 'The Leaf-Blower Trolley',
  blurb: "A trolley with a petrol leaf blower gaffer-taped to the back. Starts at the Grassmarket. Eventually.",
  engine: { accel: 3.4, top: 11, sound: 1.6, start: 'blower' },
  ballast: [0.3, 0.06, 0.22, 0.12, 2600],
  grip: 1.1,
  stats: { speed: 2, weight: 2, engine: 1 },
  build(g) {
    trolleyBody(g);
    const parts = wheelsAndSprings(g, this, 0.045, castor(), 0.035, 0.08);
    const p = new Parts();
    const orange = color(0xff7a1a, 0.45), dark = color(0x1c1d20, 0.5), tape = color(0x8a8d90, 0.85), alloy = color(0x9aa3ad, 0.35, 0.8);
    // the blower hangs off the back of the basket: engine, fan housing, a nozzle out past the handle
    const X = -0.62, Y = 0.53;
    p.add(lathe([[0.0001, 0], [0.15, 0], [0.168, 0.03], [0.168, 0.12], [0.15, 0.15], [0.118, 0.15]], q(20, 10), { cap: 'none' }), orange, [X, Y, 0], BACK);
    p.add(torus(0.118, 0.008, q(20, 10), 4), dark, [X - 0.152, Y, 0], [0, Math.PI / 2, 0]);
    for (const a of [0, Math.PI / 2]) p.add(cyl(0.005, 0.005, 0.236, 4), dark, [X - 0.152, Y, 0], [a, 0, 0]);
    // engine block with cooling fins, a pull start and a wee fuel tank
    p.add(rbox(0.1, 0.2, 0.22, 0.02), dark, [X + 0.05, Y + 0.01, 0]);
    for (let i = 0; i < 5; i++) p.add(rbox(0.11, 0.008, 0.24, 0.002, 1), alloy, [X + 0.05, Y + 0.13 + i * 0.016, 0]);
    p.add(cyl(0.07, 0.07, 0.03, q(14, 8)), orange, [X + 0.05, Y, 0.125], AXLE);
    p.add(rbox(0.03, 0.02, 0.05, 0.006, 1), dark, [X + 0.05, Y + 0.02, 0.15]);
    p.add(rbox(0.12, 0.09, 0.16, 0.03), color(0xf2efe8, 0.5), [X - 0.02, Y + 0.25, -0.03]);
    p.add(cyl(0.022, 0.022, 0.02, 8), color(0xd02030, 0.4), [X - 0.02, Y + 0.305, -0.03]);
    // the nozzle
    p.add(pipe([[X - 0.07, Y - 0.1, 0.1], [X - 0.16, Y - 0.17, 0.14], [X - 0.32, Y - 0.2, 0.15], [X - 0.47, Y - 0.2, 0.14]], [0.07, 0.066, 0.058, 0.05], { seg: q(12, 6), curve: true, cap: false }), dark);
    p.add(cyl(0.048, 0.048, 0.004, q(12, 6)), color(0x050505, 0.9), [X - 0.455, Y - 0.2, 0.14], BACK);
    // gaffer tape: round the housing, and up to the handle on both sides
    p.add(cyl(0.171, 0.171, 0.05, q(20, 10), true), tape, [X - 0.07, Y, 0], BACK);
    for (const z of [1, -1]) {
      p.add(pipe([[X - 0.07, Y + 0.165, z * 0.05], [X + 0.02, 0.86, z * 0.24], [X + 0.0, 0.9, z * 0.3]], 0.016, { seg: 4, flat: [1.6, 0.25] }), tape);
      p.add(cyl(0.02, 0.02, 0.05, 6, true), tape, [-0.635, 0.9, z * 0.3], [0, 0, 0.16]);
    }
    // a jerry can bungeed to the side
    const can = color(0xc4161c, 0.45);
    p.add(rbox(0.22, 0.28, 0.1, 0.025), can, [-0.2, 0.44, 0.375]);
    for (const a of [0.6, -0.6]) p.add(rbox(0.2, 0.014, 0.012, 0.004, 1), can, [-0.2, 0.43, 0.428], [0, 0, a], null, 0.8);
    p.add(pipe([[-0.27, 0.58, 0.375], [-0.27, 0.62, 0.375], [-0.16, 0.62, 0.375], [-0.16, 0.58, 0.375]], 0.012, { seg: 5, bend: 0.02 }), can);
    p.add(cyl(0.022, 0.022, 0.04, 8), color(0xe0b020, 0.4), [-0.11, 0.59, 0.375]);
    p.add(pipe([[-0.2, 0.3, 0.32], [-0.2, 0.3, 0.435], [-0.2, 0.58, 0.435], [-0.2, 0.6, 0.31]], 0.006, { seg: 4, bend: 0.02 }), color(0x1e6fd0, 0.6));
    p.build(g);
    // the fan, behind its guard
    const f = new Parts();
    f.add(cyl(0.035, 0.035, 0.05, 8), alloy, null, BACK);
    for (let i = 0; i < 6; i++) f.add(rbox(0.035, 0.085, 0.012, 0.004, 1), alloy, new THREE.Matrix4().makeRotationX((i / 6) * Math.PI * 2).multiply(new THREE.Matrix4().makeTranslation(0, 0.07, 0)).multiply(new THREE.Matrix4().makeRotationY(0.5)));
    const fan = f.build(new THREE.Group());
    fan.position.set(X - 0.115, Y, 0);
    g.add(fan);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(X - 0.48, Y - 0.2, 0.14);
    g.add(exhaust);
    return { ...parts, spinner: fan, exhaust };
  },
};

// ------------------------------------------------------------------ mobility scooter
const SCOOTER_WHEELS: [number, number][] = [[0.55, 0.29], [0.55, -0.29], [-0.5, 0.31], [-0.5, -0.31]];
const scooter: VehicleSpec = {
  id: 'scooter',
  name: 'Granny McLeod\'s Mobility Scooter',
  blurb: 'Borrowed without asking. 4 mph limiter removed with a butter knife. Heavy, with a proper motor.',
  engine: { accel: 4.4, top: 14, sound: 1.0, start: 'scooter' },
  body: [0.7, 0.14, 0.33, 0.3, 300],
  deck: [0.68, 0.05, 0.3, 0.14, 900],
  ballast: [0.4, 0.07, 0.25, 0.13, 3000],
  riderCol: [-0.15, 1.0],
  seat: [-0.2, 0.32, 0.1],
  wheels: SCOOTER_WHEELS,
  wheelR: 0.13,
  wheelY: 0.12,
  suspRest: 0.22,
  stiffness: 26,
  travel: 0.18,
  under: [0.8, 0.17, 0.4],
  hop: 1.2,
  grip: 1.6,
  stats: { speed: 3, weight: 3, engine: 2 },
  build(g) {
    const p = new Parts();
    const red = color(0xb3122e, 0.25, 0.3), grey = color(0x2b2f36, 0.6), vinyl = color(0x1f1f22, 0.7), chrome = color(0xc4c9cf, 0.28, 0.85), black = color(0x121214, 0.8);
    /** A cross-section of the shell: half-width, and from how low to how high. */
    const sec = (t: number, w: number, y0: number, y1: number, n = 4) => ({ t, w, x: (y0 + y1) / 2, d: (y1 - y0) / 2, n });
    // one moulded shell: tail, motor cover, the step down to the footwell, and the nose
    p.add(loft([
      sec(-0.745, 0.24, 0.24, 0.4), sec(-0.67, 0.32, 0.2, 0.5), sec(-0.2, 0.33, 0.2, 0.52), sec(-0.13, 0.32, 0.2, 0.34),
      sec(0.5, 0.3, 0.2, 0.34), sec(0.57, 0.29, 0.2, 0.48), sec(0.69, 0.27, 0.21, 0.52), sec(0.775, 0.2, 0.25, 0.44),
    ], { axis: 'x', seg: q(20, 10), cap: 'round', dome: 0.03 }), red);
    p.add(rbox(1.5, 0.06, 0.69, 0.025), grey, [0.01, 0.215, 0]);
    // a ribbed rubber mat in the footwell
    p.add(rbox(0.56, 0.014, 0.5, 0.005, 1), black, [0.19, 0.345, 0]);
    for (let i = 0; i < 7; i++) p.add(rbox(0.5, 0.006, 0.024, 0.002, 1), black, [0.19, 0.354, -0.21 + i * 0.07]);
    // the captain's chair: squab, backrest, flip-up armrests
    p.add(rbox(0.44, 0.09, 0.46, 0.04), vinyl, [-0.33, 0.555, 0]);
    p.add(rbox(0.1, 0.44, 0.44, 0.045), vinyl, [-0.57, 0.84, 0], [0, 0, 0.12]);
    p.add(rbox(0.012, 0.3, 0.3, 0.005, 1), grey, [-0.625, 0.84, 0], [0, 0, 0.12]);
    for (const z of [1, -1]) {
      p.add(rbox(0.3, 0.04, 0.06, 0.018), vinyl, [-0.32, 0.8, z * 0.27]);
      p.add(pipe([[-0.56, 0.7, z * 0.25], [-0.56, 0.78, z * 0.27], [-0.42, 0.78, z * 0.27]], 0.012, { seg: 5, bend: 0.03 }), chrome);
      // tail lights
      p.add(rbox(0.02, 0.05, 0.1, 0.008, 1), color(0xd01020, 0.25), [-0.75, 0.38, z * 0.17]);
    }
    // tiller: column, console, handlebars, mirrors
    p.add(lathe([[0.06, 0], [0.05, 0.04], [0.058, 0.07], [0.045, 0.1], [0.052, 0.13], [0.036, 0.16]], q(12, 6), { cap: 'none' }), black, [0.62, 0.5, 0], [0, 0, 0.3]);
    p.add(pipe([[0.62, 0.52, 0], [0.45, 1.08, 0]], 0.028, { seg: q(10, 6) }), grey);
    p.add(rbox(0.12, 0.08, 0.2, 0.025), grey, [0.44, 1.1, 0], [0, 0, 0.3]);
    p.add(rbox(0.012, 0.045, 0.12, 0.004, 1), color(0x6fd08a, 0.3), [0.39, 1.12, 0], [0, 0, 0.3]);
    p.add(pipe([[0.4, 1.1, 0.29], [0.45, 1.12, 0.12], [0.45, 1.12, -0.12], [0.4, 1.1, -0.29]], 0.013, { seg: 6, bend: 0.05 }), chrome);
    for (const z of [1, -1]) {
      p.add(cyl(0.02, 0.02, 0.1, 8), black, [0.405, 1.102, z * 0.25], [Math.PI / 2 - z * 0.28, 0, 0]);
      p.add(pipe([[0.45, 1.12, z * 0.16], [0.47, 1.26, z * 0.3]], 0.006, { seg: 4 }), chrome);
      p.add(cyl(0.05, 0.05, 0.012, q(12, 8)), chrome, [0.47, 1.27, z * 0.31], [0, 0, Math.PI / 2]);
    }
    // headlight in a chrome bezel
    p.add(cyl(0.06, 0.065, 0.03, q(14, 8)), chrome, [0.765, 0.43, 0], BACK);
    p.add(cyl(0.048, 0.048, 0.012, q(14, 8)), M.emissive(0xfff2c0, 1.2), [0.782, 0.43, 0], BACK);
    // shopping basket on the front, with the messages in it
    const w = wire();
    const bx = 0.74, by = 0.82, bw = 0.13, bz = 0.19, bh = 0.2;
    p.add(panel([bx - bw, by, bz], [bx + bw, by, bz], [bx - bw, by + bh, bz], [bx + bw, by + bh, bz], [0.03, 0.05]), w);
    p.add(panel([bx + bw, by, -bz], [bx - bw, by, -bz], [bx + bw, by + bh, -bz], [bx - bw, by + bh, -bz], [0.03, 0.05]), w);
    p.add(panel([bx + bw, by, bz], [bx + bw, by, -bz], [bx + bw, by + bh, bz], [bx + bw, by + bh, -bz], [0.03, 0.05]), w);
    p.add(panel([bx - bw, by, -bz], [bx - bw, by, bz], [bx - bw, by + bh, -bz], [bx - bw, by + bh, bz], [0.03, 0.05]), w);
    p.add(panel([bx - bw, by, bz], [bx + bw, by, bz], [bx - bw, by, -bz], [bx + bw, by, -bz], [0.03, 0.03]), w);
    p.add(pipe([[bx - bw, by + bh, bz], [bx + bw, by + bh, bz], [bx + bw, by + bh, -bz], [bx - bw, by + bh, -bz]], 0.007, { closed: true, bend: 0.03, seg: 5 }), chrome);
    p.add(pipe([[0.56, 0.86, 0], [0.61, 0.9, 0]], 0.012, { seg: 5 }), grey);
    p.add(loft([{ t: -0.09, w: 0.035, d: [0.03, 0.02] }, { t: -0.05, w: 0.05, d: [0.05, 0.03] }, { t: 0.05, w: 0.05, d: [0.052, 0.03] }, { t: 0.09, w: 0.035, d: [0.03, 0.02] }], { axis: 'z', seg: 8, cap: 'round' }), color(0xc89458, 0.9), [bx, by + 0.045, 0.02], [0, 0.3, 0]);
    p.add(cyl(0.07, 0.07, 0.06, q(14, 8)), M.tartan('red'), [bx + 0.02, by + 0.04, -0.1]);
    p.add(cyl(0.072, 0.072, 0.012, q(14, 8)), color(0xd8a93a, 0.3, 0.9), [bx + 0.02, by + 0.075, -0.1]);
    // tall orange safety pennant on a whip
    p.add(pipe([[-0.62, 0.5, 0.26], [-0.63, 1.3, 0.26], [-0.67, 2.12, 0.26]], 0.006, { seg: 4, curve: true }), chrome);
    const flag = new THREE.BufferGeometry();
    flag.setAttribute('position', new THREE.Float32BufferAttribute([-0.67, 2.12, 0.26, -0.665, 1.9, 0.26, -0.34, 2.0, 0.26], 3));
    flag.setIndex([0, 1, 2]);
    flag.computeVertexNormals();
    p.add(flag, new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.7, side: THREE.DoubleSide }));
    p.build(g);
    // a "GRAN TURISMO" plate on the tail
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), new THREE.MeshStandardMaterial({ map: signTex(['GRAN TURISMO'], '#ffd23f', '#111', 256, 64) }));
    plate.position.set(-0.771, 0.3, 0);
    plate.rotation.y = -Math.PI / 2;
    g.add(plate);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(-0.75, 0.2, -0.2);
    g.add(exhaust);
    const parts = wheelsAndSprings(g, this, 0.07, { tyre: color(0x161618, 0.85), hub: color(0xc9ced4, 0.35, 0.6), spokes: 5 }, 0.04, 0.24);
    return { ...parts, exhaust };
  },
};

// ------------------------------------------------------------------ golf buggy
const BUGGY_WHEELS: [number, number][] = [[0.82, 0.55], [0.82, -0.55], [-0.78, 0.55], [-0.78, -0.55]];
const buggy: VehicleSpec = {
  id: 'buggy',
  name: 'The Golf Buggy',
  blurb: "From the Old Course. Fitting, given how you start. Huge, fast and very heavy: it goes through things, not round them.",
  engine: { accel: 5.2, top: 17, sound: 0.75, start: 'buggy' },
  body: [1.05, 0.22, 0.58, 0.5, 260],
  deck: [1.0, 0.06, 0.55, 0.24, 900],
  ballast: [0.6, 0.08, 0.4, 0.22, 3000],
  riderCol: [-0.05, 1.12],
  seat: [-0.18, 0.39, 0.12],
  wheels: BUGGY_WHEELS,
  wheelR: 0.2,
  wheelY: 0.2,
  suspRest: 0.24,
  stiffness: 30,
  travel: 0.2,
  under: [1.1, 0.2, 0.62],
  hop: 1.25,
  grip: 2.2,
  stats: { speed: 4, weight: 4, engine: 3 },
  build(g) {
    const p = new Parts();
    const white = color(0xf3f1ea, 0.25, 0.2), green = color(0x1d5c3a, 0.55), dark = color(0x1c1d20, 0.6), chrome = color(0xc4c9cf, 0.28, 0.85), black = color(0x121214, 0.8);
    const sec = (t: number, w: number, y0: number, y1: number, n = 3.6) => ({ t, w, x: (y0 + y1) / 2, d: (y1 - y0) / 2, n });
    // floor pan, the moulded front cowl, the seat box and the bag well
    p.add(loft([sec(-1.08, 0.48, 0.3, 0.42), sec(-0.98, 0.58, 0.27, 0.44), sec(0.96, 0.58, 0.27, 0.44), sec(1.08, 0.48, 0.3, 0.42)], { axis: 'x', seg: q(20, 10), cap: 'round', dome: 0.03 }), white);
    p.add(loft([sec(0.56, 0.56, 0.42, 0.9), sec(0.64, 0.57, 0.42, 0.87), sec(0.92, 0.54, 0.38, 0.72), sec(1.07, 0.46, 0.38, 0.58)], { axis: 'x', seg: q(20, 10), sub: 1, cap: ['flat', 'round'], dome: 0.04 }), white);
    p.add(rbox(0.56, 0.24, 1.1, 0.05), white, [-0.44, 0.54, 0]);
    p.add(loft([sec(-1.07, 0.5, 0.42, 0.62), sec(-0.98, 0.57, 0.42, 0.7), sec(-0.7, 0.57, 0.42, 0.7)], { axis: 'x', seg: q(20, 10), cap: ['round', 'flat'], dome: 0.03 }), white);
    p.add(rbox(0.74, 0.012, 1.0, 0.005, 1), black, [0.19, 0.446, 0]);
    // bench seat with piped edges
    p.add(rbox(0.52, 0.11, 1.02, 0.05), green, [-0.4, 0.61, 0]);
    p.add(rbox(0.13, 0.44, 1.02, 0.055), green, [-0.68, 0.92, 0], [0, 0, 0.14]);
    for (const z of [1, -1]) {
      p.add(pipe([[-0.66, 0.66, z * 0.54], [-0.58, 0.82, z * 0.54], [-0.3, 0.82, z * 0.54], [-0.22, 0.66, z * 0.54]], 0.016, { seg: 6, bend: 0.06 }), chrome);
      // arches over the wheels, headlights, roof posts
      for (const x of [0.82, -0.78]) p.add(torus(0.25, 0.05, q(14, 8), 6, Math.PI), white, [x, 0.08, z * 0.53]);
      p.add(cyl(0.075, 0.08, 0.04, q(14, 8)), chrome, [1.035, 0.6, z * 0.33], [0, 0, Math.PI / 2 - 0.3]);
      p.add(cyl(0.06, 0.06, 0.012, q(14, 8)), M.emissive(0xfff2c0, 1.2), [1.056, 0.607, z * 0.33], [0, 0, Math.PI / 2 - 0.3]);
      p.add(pipe([[0.6, 0.86, z * 0.54], [0.5, 1.9, z * 0.56]], 0.02, { seg: 6 }), chrome);
      p.add(pipe([[-0.84, 0.68, z * 0.54], [-0.74, 1.9, z * 0.56]], 0.02, { seg: 6 }), chrome);
    }
    // dash, cup holders, steering column and wheel
    p.add(rbox(0.06, 0.2, 1.04, 0.02), dark, [0.55, 0.78, 0]);
    for (const z of [-0.3, -0.16]) p.add(cyl(0.045, 0.04, 0.05, q(10, 6), true), dark, [0.5, 0.86, z]);
    p.add(pipe([[0.56, 0.8, 0.27], [0.36, 1.0, 0.27]], 0.018, { seg: 6 }), dark);
    const sw = new THREE.Matrix4().compose(new THREE.Vector3(0.345, 1.015, 0.27), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-0.72, 0.7, 0).normalize()), new THREE.Vector3(1, 1, 1));
    p.add(torus(0.15, 0.018, q(20, 10), 6), black, sw);
    for (let i = 0; i < 3; i++) p.add(rbox(0.15, 0.02, 0.014, 0.005, 1), dark, sw.clone().multiply(new THREE.Matrix4().makeRotationZ((i / 3) * Math.PI * 2 + 0.5)).multiply(new THREE.Matrix4().makeTranslation(0.075, 0, 0)));
    // bumpers
    p.add(pipe([[0.9, 0.36, 0.6], [1.12, 0.36, 0.44], [1.12, 0.36, -0.44], [0.9, 0.36, -0.6]], 0.035, { seg: 6, bend: 0.12 }), black);
    p.add(pipe([[-0.92, 0.36, 0.6], [-1.12, 0.36, 0.44], [-1.12, 0.36, -0.44], [-0.92, 0.36, -0.6]], 0.035, { seg: 6, bend: 0.12 }), black);
    // the roof: a crowned canopy with a striped valance
    p.add(loft([sec(-0.98, 0.56, 1.9, 1.95, 5), sec(-0.86, 0.62, 1.89, 1.975, 5), sec(0.64, 0.62, 1.89, 1.975, 5), sec(0.76, 0.56, 1.9, 1.95, 5)], { axis: 'x', seg: q(20, 10), cap: 'round', dome: 0.03 }), green);
    p.add(loft([{ t: 1.8, w: 0.625, d: [0.77, 0.99], x: -0.11, n: 9 }, { t: 1.9, w: 0.625, d: [0.77, 0.99], x: -0.11, n: 9 }], { seg: q(40, 16), cap: 'none', uv: [5, 1] }), M.stripes('#1d5c3a', '#f3f1ea'));
    // windscreen
    p.add(panel([0.6, 0.9, 0.52], [0.6, 0.9, -0.52], [0.51, 1.78, 0.54], [0.51, 1.78, -0.54], [1, 1]), M.glass());
    // golf bag strapped on the back, clubs rattling
    const bagAt = aim([-0.9, 0.7, 0.2], [-0.24, 1, 0]);
    const bag = new Parts();
    bag.add(lathe([[0.0001, 0], [0.12, 0], [0.125, 0.03], [0.12, 0.06], [0.125, 0.8], [0.14, 0.84], [0.14, 0.88], [0.12, 0.88]], q(16, 8), { cap: 'none' }), color(0x8a1c1c, 0.6));
    bag.add(cyl(0.142, 0.142, 0.03, q(16, 8), true), M.white(), [0, 0.86, 0]);
    bag.add(rbox(0.07, 0.3, 0.14, 0.03), color(0x6e1414, 0.6), [0.12, 0.34, 0]);
    bag.add(pipe([[0.1, 0.78, 0.06], [0.2, 0.6, 0.06], [0.12, 0.42, 0.06]], 0.012, { seg: 4, curve: true, flat: [2, 0.4] }), dark);
    const irons = color(0xb9bec4, 0.3, 0.85);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06, len = 0.26 + (i % 3) * 0.05;
      bag.add(cyl(0.007, 0.007, len, 5), irons, [x, 0.88 + len / 2, z]);
      if (i === 0) bag.add(ball(0.06, q(10, 6), 1.2, 0.9, 0.8), M.tartan('blue'), [x + 0.02, 0.92 + len, z]); // the driver, in its tartan cosy
      else bag.add(rbox(0.08, 0.045, 0.022, 0.008, 1), irons, [x + 0.03, 0.89 + len, z], [0, -a, 0.3]);
    }
    p.sub(bag, bagAt);
    p.add(pipe([[-0.74, 0.9, 0.36], [-0.98, 1.0, 0.36], [-1.06, 1.0, 0.2], [-0.98, 1.0, 0.04], [-0.74, 0.9, 0.04]], 0.012, { seg: 4, bend: 0.06, flat: [2, 0.4] }), dark);
    p.build(g);
    // "PLEASE KEEP TO THE PATH" on the back
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.16), new THREE.MeshStandardMaterial({ map: signTex(['PLEASE KEEP TO THE PATH'], '#1d5c3a', '#fff', 512, 96) }));
    plate.position.set(-1.076, 0.54, -0.1);
    plate.rotation.y = -Math.PI / 2;
    plate.rotation.z = 0.0;
    g.add(plate);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(-1.1, 0.3, -0.35);
    g.add(exhaust);
    const parts = wheelsAndSprings(g, this, 0.16, { tyre: color(0x1c1c1c, 0.85), hub: color(0xe4e4e0, 0.3, 0.3), spokes: 5, tread: true }, 0.06, 0.4);
    return { ...parts, exhaust };
  },
};

// ------------------------------------------------------------------ bathtub
const TUB_WHEELS: [number, number][] = [[0.62, 0.3], [0.62, -0.3], [-0.62, 0.3], [-0.62, -0.3]];
const bathtub: VehicleSpec = {
  id: 'bathtub',
  name: 'The Clawfoot Bathtub',
  blurb: 'Cast iron, castors on the feet, an outboard motor on the back and a rubber duck for luck. Will it float? (It will not.)',
  engine: { accel: 4.8, top: 15.5, sound: 1.25, start: 'outboard' },
  body: [0.82, 0.24, 0.38, 0.5, 260],
  deck: [0.75, 0.05, 0.33, 0.2, 1400],
  ballast: [0.45, 0.07, 0.25, 0.2, 3200],
  riderCol: [-0.1, 1.02],
  seat: [-0.1, 0.06, 0.32],
  wheels: TUB_WHEELS,
  wheelR: 0.1,
  wheelY: 0.14,
  suspRest: 0.24,
  stiffness: 28,
  travel: 0.2,
  under: [0.9, 0.18, 0.42],
  hop: 1.2,
  grip: 1.9,
  stats: { speed: 3, weight: 4, engine: 3 },
  build(g) {
    const p = new Parts();
    const enamel = color(0xf6f4ee, 0.18, 0.1), outside = color(0x2a5a4a, 0.3, 0.3), gold = M.gold();
    // a roll-top tub: painted cast iron outside, white enamel inside
    const N = 2.7;
    const tub = [
      { t: 0.3, w: 0.26, d: 0.6 },
      { t: 0.36, w: 0.335, d: 0.725 },
      { t: 0.55, w: 0.385, d: 0.82 },
      { t: 0.74, w: 0.4, d: 0.855 },
      { t: 0.795, w: 0.415, d: 0.875 },
    ];
    p.add(loft(tub, { seg: q(32, 14), sub: 1, n: N, cap: ['flat', 'none'] }), outside);
    // the inside is the same shape, a skin thinner and facing inwards
    p.add(loft(tub.map((r, i) => ({ t: i ? r.t : 0.335, w: r.w - 0.028, d: r.d - 0.028 })), { seg: q(32, 14), sub: 1, n: N, cap: ['flat', 'none'] }), enamel, null, null, [1, 1, -1]);
    const rim: V3[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      rim.push([Math.sign(c) * Math.abs(c) ** (2 / N) * 0.868, 0.8, Math.sign(s) * Math.abs(s) ** (2 / N) * 0.408]);
    }
    p.add(pipe(rim, 0.032, { closed: true, seg: q(8, 5) }), enamel);
    // claw feet
    for (const [x, z] of TUB_WHEELS) {
      p.add(loft([{ t: 0.2, w: 0.05, d: [0.06, 0.04] }, { t: 0.25, w: 0.07, d: [0.08, 0.06] }, { t: 0.33, w: 0.06, d: 0.06 }, { t: 0.4, w: 0.045, d: 0.045 }], { seg: q(10, 6), sub: 1, cap: 'round' }), gold, [x * 0.96, 0, z * 0.9], [0, x > 0 ? 0 : Math.PI, 0]);
      for (const k of [-1, 0, 1]) p.add(ball(0.022, 6), gold, [x * 0.96 + Math.sign(x) * 0.055, 0.215, z * 0.9 + k * 0.03]);
    }
    // water (still in it) and a head of bubbles
    p.add(loft([{ t: 0.62, w: 0.366, d: 0.8 }, { t: 0.622, w: 0.366, d: 0.8 }], { seg: q(32, 14), n: N }), new THREE.MeshStandardMaterial({ color: 0x8fc4d8, transparent: true, opacity: 0.72, roughness: 0.05 }));
    const foam = color(0xffffff, 0.35);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, r = 0.05 + (i % 5) * 0.04;
      p.add(ball(0.035 + (i % 3) * 0.018, q(8, 5)), foam, [-0.48 + Math.cos(a) * r * 1.2, 0.635 + (i % 2) * 0.02, Math.sin(a) * r]);
    }
    // pillar taps over the front end
    for (const z of [-0.11, 0.11]) {
      p.add(lathe([[0.03, 0], [0.022, 0.03], [0.018, 0.14], [0.026, 0.16], [0.026, 0.19], [0.012, 0.2]], q(10, 6), { cap: 'none' }), gold, [0.84, 0.8, z]);
      p.add(pipe([[0.84, 0.95, z], [0.78, 0.985, z], [0.7, 0.97, z], [0.68, 0.92, z]], 0.014, { seg: 6, curve: true }), gold);
      for (const a of [0, Math.PI / 2]) p.add(cyl(0.007, 0.007, 0.075, 5), gold, [0.84, 1.01, z], [Math.PI / 2, a, 0]);
      p.add(ball(0.013, 6), color(z > 0 ? 0xc4161c : 0x1e6fd0, 0.4), [0.84, 1.02, z]);
    }
    // the rubber duck, for luck
    const yellow = color(0xffd23f, 0.35);
    const duck = new Parts();
    duck.add(loft([{ t: -0.1, w: 0.02, d: [0.05, 0.0], x: 0.03 }, { t: -0.05, w: 0.06, d: [0.05, 0.04] }, { t: 0.03, w: 0.068, d: [0.05, 0.05] }, { t: 0.09, w: 0.04, d: [0.04, 0.035] }], { axis: 'x', seg: q(10, 6), sub: 1, cap: 'round' }), yellow);
    duck.add(ball(0.05, q(10, 6)), yellow, [0.07, 0.085, 0]);
    duck.add(loft([{ t: 0.1, w: 0.024, d: 0.012 }, { t: 0.15, w: 0.018, d: 0.006 }], { axis: 'x', seg: 6, cap: 'round' }), color(0xff7a1a, 0.4), [0, 0.078, 0]);
    for (const z of [-1, 1]) duck.add(ball(0.009, 5), color(0x111111, 0.3), [0.1, 0.1, z * 0.034]);
    p.sub(duck, [0.46, 0.665, 0.17], [0, 0.6, 0]);
    // the outboard: clamp, cowling, tiller, leg and gearcase
    const blue = color(0x1b3f8a, 0.25, 0.2), leg = color(0x2a2c30, 0.4, 0.6);
    p.add(rbox(0.1, 0.16, 0.2, 0.02), leg, [-0.9, 0.78, 0]);
    p.add(loft([{ t: 0.82, w: 0.11, d: [0.13, 0.14] }, { t: 0.9, w: 0.135, d: [0.16, 0.17] }, { t: 1.06, w: 0.13, d: [0.15, 0.17] }, { t: 1.13, w: 0.09, d: [0.1, 0.13] }], { seg: q(14, 8), sub: 1, n: 3, cap: 'round', dome: 0.03 }), blue, [-1.0, 0, 0]);
    p.add(loft([{ t: 0.93, w: 0.137, d: [0.162, 0.172] }, { t: 0.96, w: 0.137, d: [0.162, 0.172] }], { seg: q(14, 8), n: 3, cap: 'none' }), M.white(), [-1.0, 0, 0]);
    p.add(pipe([[-0.86, 0.9, 0.05], [-0.62, 0.96, 0.08]], 0.014, { seg: 6 }), leg);
    p.add(cyl(0.022, 0.022, 0.12, 8), color(0x121214, 0.8), [-0.6, 0.965, 0.082], [0, 0.08, Math.PI / 2 - 0.24]);
    p.add(loft([{ t: 0.2, w: 0.03, d: [0.05, 0.07] }, { t: 0.82, w: 0.04, d: [0.06, 0.08] }], { seg: 8, cap: 'flat' }), leg, [-1.0, 0, 0]);
    p.add(rbox(0.26, 0.012, 0.16, 0.005, 1), leg, [-1.02, 0.3, 0]);
    p.add(loft([{ t: -0.14, w: 0.03, d: 0.03 }, { t: -0.06, w: 0.05, d: 0.05 }, { t: 0.06, w: 0.045, d: 0.045 }, { t: 0.14, w: 0.012, d: 0.012 }], { axis: 'x', seg: 8, sub: 1, cap: 'round' }), leg, [-1.0, 0.16, 0]);
    p.add(extrude([[-0.08, 0], [0.06, 0], [0.0, -0.12], [-0.05, -0.12]], 0.012), leg, [-1.0, 0.13, 0]);
    p.build(g);
    // the propeller
    const pr = new Parts();
    pr.add(lathe([[0.0001, 0], [0.03, 0.01], [0.034, 0.05], [0.02, 0.09], [0.0001, 0.1]], 8), M.steel(), null, BACK);
    for (let i = 0; i < 3; i++) {
      pr.add(loft([{ t: 0.02, w: 0.02, d: 0.006 }, { t: 0.07, w: 0.045, d: 0.005 }, { t: 0.115, w: 0.03, d: 0.003 }], { seg: 6, sub: 1, cap: 'round', dome: 0.01 }), M.steel(),
        new THREE.Matrix4().makeRotationX((i / 3) * Math.PI * 2).multiply(new THREE.Matrix4().makeTranslation(-0.045, 0, 0)).multiply(new THREE.Matrix4().makeRotationY(0.55)));
    }
    const prop = pr.build(new THREE.Group());
    prop.position.set(-1.14, 0.16, 0);
    g.add(prop);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(-1.05, 0.9, 0);
    g.add(exhaust);
    const parts = wheelsAndSprings(g, this, 0.05, castor(gold), 0.035, 0.22);
    return { ...parts, spinner: prop, exhaust };
  },
};

export const VEHICLES: Record<VehicleId, VehicleSpec> = { trolley, blower, scooter, buggy, bathtub };
export const VEHICLE_ORDER: VehicleId[] = ['trolley', 'blower', 'scooter', 'buggy', 'bathtub'];
