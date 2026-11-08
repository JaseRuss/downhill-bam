import * as THREE from 'three';
import { M, color } from '../art/Materials';
import { canvas, signTex } from '../art/Textures';

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

let wireMat: THREE.Material | null = null;
function wire() {
  if (wireMat) return wireMat;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.strokeStyle = '#d6dbe0';
  g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  wireMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.3 });
  return wireMat;
}

function box(g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat as any);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
function cylX(g: THREE.Object3D, r: number, len: number, x: number, y: number, z: number, mat: THREE.Material, axis: 'x' | 'y' | 'z' = 'z', seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** A wheel group with a 'spin' child (rotates about local Z). */
function wheel(r: number, width: number, tyre: THREE.Material, hubMat: THREE.Material, fork = false) {
  const g = new THREE.Group();
  if (fork) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.06), M.steel());
    f.position.y = 0.03;
    g.add(f);
  }
  const spin = new THREE.Group();
  spin.name = 'spin';
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 16), tyre);
  t.rotation.x = Math.PI / 2;
  spin.add(t);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, width + 0.01, 10), hubMat);
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);
  // a spoke so you can see it turning
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.18, width + 0.02), hubMat);
  spin.add(spoke);
  g.add(spin);
  g.traverse((o: any) => o.isMesh && (o.castShadow = true));
  return g;
}

/** Yellow coil spring, unit length (scaled to the suspension). */
function coil(r: number) {
  const spring = new THREE.Group();
  const coilMat = color(0xe8c020, 0.35, 0.6);
  for (let k = 0; k < 6; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.2, 6, 14), coilMat);
    ring.rotation.x = Math.PI / 2 + (k % 2 ? 0.25 : -0.25);
    ring.position.y = -(k + 0.5) / 6;
    spring.add(ring);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 1, 6), M.steel());
  rod.position.y = -0.5;
  spring.add(rod);
  return spring;
}

function wheelsAndSprings(g: THREE.Group, spec: { wheels: [number, number][]; wheelR: number }, width: number, tyre: THREE.Material, hub: THREE.Material, fork: boolean, coilR: number, springTop: number): VehicleParts {
  const wheels: THREE.Object3D[] = [];
  const springs: THREE.Object3D[] = [];
  for (const [x, z] of spec.wheels) {
    const w = wheel(spec.wheelR, width, tyre, hub, fork);
    g.add(w);
    wheels.push(w);
    const s = coil(coilR);
    s.position.set(x, springTop, z);
    g.add(s);
    springs.push(s);
  }
  return { wheels, springs };
}

// ------------------------------------------------------------------ the shopping trolley
function trolleyBody(g: THREE.Group, gold = false) {
  const steel = gold ? M.gold() : M.steel();
  const red = color(0xd02030, 0.4);
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = steel) => box(g, w, h, d, x, y, z, mat);
  const w = wire();
  const side = (w2: number, h2: number, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), w);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    g.add(m);
  };
  side(1.0, 0.56, 0, 0.46, 0.31, 0);
  side(1.0, 0.56, 0, 0.46, -0.31, 0);
  side(0.62, 0.56, 0.5, 0.46, 0, Math.PI / 2);
  side(0.62, 0.56, -0.5, 0.46, 0, Math.PI / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), w);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.19;
  g.add(floor);
  for (const z of [-0.31, 0.31]) {
    bar(1.02, 0.025, 0.025, 0, 0.74, z);
    bar(1.02, 0.025, 0.025, 0, 0.18, z);
  }
  for (const x of [-0.5, 0.5]) {
    bar(0.025, 0.025, 0.64, x, 0.74, 0);
    for (const z of [-0.31, 0.31]) bar(0.025, 0.58, 0.025, x, 0.46, z);
  }
  for (const z of [-0.24, 0.24]) bar(0.9, 0.03, 0.03, 0, 0.1, z);
  bar(0.03, 0.4, 0.03, -0.62, 0.9, 0.3).rotation.z = 0.35;
  bar(0.03, 0.4, 0.03, -0.62, 0.9, -0.3).rotation.z = 0.35;
  bar(0.06, 0.06, 0.66, -0.7, 1.08, 0, red);
  for (const [x, z] of [[0.5, 0.31], [0.5, -0.31]]) bar(0.06, 0.1, 0.06, x, 0.2, z, red);
  bar(0.04, 0.06, 0.08, -0.7, 1.08, 0.38, color(0xe0b020, 0.4, 0.6)); // the coin lock, obviously
}

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
    return wheelsAndSprings(g, this, 0.045, M.black(), M.steel(), true, 0.035, 0.08);
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
    const parts = wheelsAndSprings(g, this, 0.045, M.black(), M.steel(), true, 0.035, 0.08);
    // the blower: engine block, fuel tank, a big tube pointing backwards
    const orange = color(0xff7a1a, 0.5);
    const b = new THREE.Group();
    box(b, 0.3, 0.26, 0.28, 0, 0, 0, orange);
    box(b, 0.18, 0.1, 0.22, 0.02, 0.17, 0, color(0x222222, 0.5));
    cylX(b, 0.08, 0.5, -0.32, -0.08, 0, color(0x333333, 0.5), 'x', 12).rotation.z = Math.PI / 2 - 0.35;
    const fan = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.05), M.steel());
      blade.rotation.x = (i * Math.PI) / 2;
      fan.add(blade);
    }
    fan.position.set(0.16, 0, 0);
    b.add(fan);
    // gaffer tape
    for (const z of [-0.1, 0.1]) box(b, 0.34, 0.3, 0.03, 0, 0, z, color(0x8a8a8a, 0.9));
    b.position.set(-0.68, 0.52, 0);
    g.add(b);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(-1.0, 0.36, 0);
    g.add(exhaust);
    // a jerry can strapped to the side
    box(g, 0.22, 0.28, 0.1, -0.2, 0.42, 0.37, color(0xc4161c, 0.5));
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
  seat: [-0.2, 0.06, 0.1],
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
    const red = color(0xb3122e, 0.35, 0.3);
    const grey = color(0x2b2f36, 0.6);
    // shell
    box(g, 1.45, 0.22, 0.66, 0, 0.3, 0, grey);
    box(g, 1.3, 0.08, 0.6, 0.02, 0.44, 0, red);
    const nose = box(g, 0.4, 0.3, 0.6, 0.62, 0.42, 0, red);
    nose.rotation.z = 0.25;
    // seat on a post, with armrests
    cylX(g, 0.04, 0.3, -0.25, 0.6, 0, M.steel(), 'y', 8);
    box(g, 0.48, 0.12, 0.5, -0.25, 0.78, 0, color(0x1f1f1f, 0.8));
    box(g, 0.12, 0.55, 0.5, -0.5, 1.07, 0, color(0x1f1f1f, 0.8));
    for (const z of [-0.28, 0.28]) box(g, 0.4, 0.05, 0.06, -0.22, 0.98, z, color(0x1f1f1f, 0.8));
    // tiller and handlebars
    const til = cylX(g, 0.035, 0.75, 0.55, 0.85, 0, grey, 'y', 8);
    til.rotation.z = 0.35;
    box(g, 0.08, 0.06, 0.55, 0.42, 1.18, 0, M.black());
    // shopping basket on the front
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.4), wire());
    bk.position.set(0.66, 0.92, 0);
    g.add(bk);
    // a loaf, a tin of shortbread
    box(g, 0.18, 0.08, 0.1, 0.66, 0.98, 0.08, color(0xc89458, 0.9));
    cylX(g, 0.07, 0.06, 0.66, 0.96, -0.1, M.tartan('red'), 'y', 12);
    // tall orange safety flag
    cylX(g, 0.01, 1.6, -0.6, 1.3, 0.25, M.steel(), 'y', 6);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.22), new THREE.MeshStandardMaterial({ color: 0xff6a13, side: THREE.DoubleSide }));
    flag.position.set(-0.45, 2.0, 0.25);
    g.add(flag);
    // headlight and a "GRAN TURISMO" plate
    box(g, 0.04, 0.1, 0.18, 0.86, 0.5, 0, M.emissive(0xfff2c0, 1.2));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshStandardMaterial({ map: signTex(['GRAN TURISMO'], '#ffd23f', '#111', 256, 64) }));
    plate.position.set(-0.73, 0.32, 0);
    plate.rotation.y = -Math.PI / 2;
    g.add(plate);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(-0.75, 0.2, -0.2);
    g.add(exhaust);
    const parts = wheelsAndSprings(g, this, 0.07, M.black(), color(0xb0b0b0, 0.4, 0.6), false, 0.04, 0.24);
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
  seat: [-0.05, 0.22, 0.12],
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
    const white = color(0xf3f1ea, 0.45);
    const green = color(0x1d5c3a, 0.5);
    box(g, 2.1, 0.32, 1.14, 0, 0.5, 0, white);
    const hood = box(g, 0.55, 0.3, 1.1, 0.82, 0.68, 0, white);
    hood.rotation.z = -0.2;
    // bench seat
    box(g, 0.62, 0.16, 1.0, -0.1, 0.8, 0, green);
    box(g, 0.14, 0.5, 1.0, -0.42, 1.08, 0, green);
    // dash and wheel
    box(g, 0.1, 0.3, 1.0, 0.45, 0.95, 0, color(0x222222, 0.6));
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), M.black());
    sw.position.set(0.32, 1.18, 0.25);
    sw.rotation.y = Math.PI / 2;
    sw.rotation.x = 0.6;
    g.add(sw);
    // canopy on four posts
    for (const [x, z] of [[0.45, 0.5], [0.45, -0.5], [-0.65, 0.5], [-0.65, -0.5]]) cylX(g, 0.025, 1.2, x, 1.25, z, M.steel(), 'y', 6);
    box(g, 1.45, 0.06, 1.2, -0.1, 1.86, 0, green);
    box(g, 1.47, 0.12, 1.22, -0.1, 1.8, 0, M.stripes('#1d5c3a', '#f3f1ea'));
    // golf bag on the back
    const bag = cylX(g, 0.13, 0.9, -0.95, 1.0, 0.2, color(0x8a1c1c, 0.6), 'y', 12);
    bag.rotation.z = 0.25;
    for (let i = 0; i < 4; i++) {
      const club = cylX(g, 0.012, 0.5, -1.05 + i * 0.03, 1.55, 0.14 + i * 0.04, M.steel(), 'y', 6);
      club.rotation.z = 0.25;
      box(g, 0.1, 0.06, 0.05, -1.13 + i * 0.03, 1.8, 0.14 + i * 0.04, M.steel());
    }
    // bumper and headlights
    box(g, 0.1, 0.12, 1.2, 1.08, 0.38, 0, M.black());
    for (const z of [-0.38, 0.38]) box(g, 0.04, 0.1, 0.16, 1.07, 0.66, z, M.emissive(0xfff2c0, 1.2));
    // "PLEASE KEEP TO THE PATH" sign on the back
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.18), new THREE.MeshStandardMaterial({ map: signTex(['PLEASE KEEP TO THE PATH'], '#1d5c3a', '#fff', 512, 96) }));
    plate.position.set(-1.06, 0.55, 0);
    plate.rotation.y = -Math.PI / 2;
    g.add(plate);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(-1.1, 0.3, -0.35);
    g.add(exhaust);
    const parts = wheelsAndSprings(g, this, 0.16, color(0x1c1c1c, 0.8), color(0xd8d8d8, 0.3, 0.7), false, 0.06, 0.4);
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
    const enamel = color(0xf6f4ee, 0.25, 0.1);
    const outside = color(0x2a5a4a, 0.4, 0.3);
    // the tub: a squashed open cylinder, rolled rim, flat bottom
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.5, 24, 1, true), [outside] as any);
    shell.scale.set(1.75, 1, 0.82);
    shell.position.y = 0.55;
    shell.castShadow = true;
    g.add(shell);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.37, 0.48, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.25, side: THREE.BackSide }));
    inner.scale.copy(shell.scale);
    inner.position.copy(shell.position);
    g.add(inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 8, 32), enamel);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.75, 0.82, 1);
    rim.position.y = 0.8;
    g.add(rim);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), enamel);
    bottom.rotation.x = -Math.PI / 2;
    bottom.scale.set(1.75, 0.82, 1);
    bottom.position.y = 0.31;
    g.add(bottom);
    // water (still in it), taps and a rubber duck
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.43, 24), new THREE.MeshStandardMaterial({ color: 0x8fc4d8, transparent: true, opacity: 0.7, roughness: 0.05 }));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(1.75, 0.82, 1);
    water.position.y = 0.6;
    g.add(water);
    for (const z of [-0.1, 0.1]) cylX(g, 0.025, 0.2, 0.82, 0.9, z, M.gold(), 'y', 8);
    const duck = new THREE.Group();
    const yellow = color(0xffd23f, 0.4);
    const db = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), yellow);
    db.scale.set(1.2, 0.8, 1);
    duck.add(db);
    const dh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), yellow);
    dh.position.set(0.06, 0.08, 0);
    duck.add(dh);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 6), color(0xff7a1a, 0.5));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.12, 0.08, 0);
    duck.add(beak);
    duck.position.set(0.55, 0.88, 0.2);
    g.add(duck);
    // claw feet
    for (const [x, z] of TUB_WHEELS) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.gold());
      foot.scale.set(1.2, 1.6, 1.2);
      foot.position.set(x, 0.24, z);
      g.add(foot);
    }
    // the outboard motor
    const ob = new THREE.Group();
    box(ob, 0.3, 0.35, 0.26, 0, 0, 0, color(0x1b3f8a, 0.4, 0.2));
    box(ob, 0.32, 0.08, 0.28, 0, 0.2, 0, M.white());
    cylX(ob, 0.04, 0.6, 0.02, -0.45, 0, M.metal(), 'y', 8);
    const prop = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.05), M.steel());
      blade.rotation.x = (i * Math.PI * 2) / 3;
      prop.add(blade);
    }
    prop.position.set(-0.08, -0.72, 0);
    ob.add(prop);
    ob.position.set(-0.98, 0.85, 0);
    g.add(ob);
    const exhaust = new THREE.Object3D();
    exhaust.position.set(-1.05, 0.9, 0);
    g.add(exhaust);
    const parts = wheelsAndSprings(g, this, 0.05, M.black(), M.gold(), true, 0.035, 0.22);
    return { ...parts, spinner: prop, exhaust };
  },
};

export const VEHICLES: Record<VehicleId, VehicleSpec> = { trolley, blower, scooter, buggy, bathtub };
export const VEHICLE_ORDER: VehicleId[] = ['trolley', 'blower', 'scooter', 'buggy', 'bathtub'];
