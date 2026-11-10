import * as THREE from 'three';
import { M, color } from './Materials';
import { aim, ball, cyl, lathe, loft, model, Parts, pipe, q, rbox, torus, V3 } from './Model';
import { D, HEAD_K, hatMesh, Rig, seatHat } from './Humanoid';

/**
 * What people carry and wear on top of their clothes: specs, scarves, cameras, bagpipes.
 * Each one is modelled life size for an average build, then scaled to whoever is wearing it.
 */
const R = D.headR; // head space is in head radii, like the head itself
const scaleOf = (r: Rig) => r.height / 1.75;
const hefty = (r: Rig) => ((r.outfit.build ?? 1) > 1.1 ? 0.07 : 0);

/** Fit to the head: same scale as the face. */
function onHead(r: Rig, g: THREE.Object3D) {
  g.scale.setScalar(scaleOf(r) * HEAD_K);
  r.head.add(g);
  return g;
}
/** Fit to the trunk: wider people wear wider things. */
function onTrunk(r: Rig, bone: THREE.Object3D, g: THREE.Object3D) {
  const s = scaleOf(r), b = r.outfit.build ?? 1;
  g.scale.set(s * b, s, s * b);
  bone.add(g);
  return g;
}
function inHand(r: Rig, g: THREE.Object3D) {
  g.scale.setScalar(scaleOf(r));
  r.elbowR.add(g);
  return g;
}
const hr = (x: number, y: number, z: number): V3 => [x * R, y * R, z * R];

/** The arms of a pair of glasses, back over the ears. */
function temples(p: Parts, mat: THREE.Material, y: number) {
  for (const z of [-1, 1]) p.add(pipe([hr(0.98, y, z * 0.6), hr(0.1, y + 0.03, z * 0.95), hr(-0.2, y - 0.12, z * 0.94)], 0.02 * R, { seg: 4 }), mat);
}

/** Round wire-rimmed specs. */
export function specs(r: Rig) {
  return onHead(r, model('specs', () => {
    const p = new Parts();
    const wire = color(0x15120f, 0.4, 0.6);
    for (const z of [-1, 1]) p.add(torus(0.21 * R, 0.026 * R, q(16, 8), 5), wire, hr(1.0, 0.2, z * 0.36), [0, Math.PI / 2, 0]);
    p.add(cyl(0.02 * R, 0.02 * R, 0.32 * R, 5), wire, hr(1.0, 0.25, 0), [Math.PI / 2, 0, 0]);
    temples(p, wire, 0.2);
    return p.build();
  }));
}

/** Big dark sunglasses. */
export function shades(r: Rig) {
  return onHead(r, model('shades', () => {
    const p = new Parts();
    const lens = color(0x0a0a0a, 0.15, 0.6), frame = color(0x111111, 0.4);
    for (const z of [-1, 1]) p.add(rbox(0.06 * R, 0.32 * R, 0.46 * R, 0.028 * R, 1), lens, hr(0.99, 0.19, z * 0.31), [0, -z * 0.12, 0]);
    p.add(rbox(0.07 * R, 0.07 * R, 1.16 * R, 0.03 * R, 1), frame, hr(0.985, 0.34, 0));
    temples(p, frame, 0.3);
    return p.build();
  }));
}

/** A striped scarf: once round the neck, one end down the front. */
export function scarf(r: Rig, a: string, b: string, side = 1) {
  const mat = M.stripes(a, b);
  const g = model(`scarf|${a}|${b}|${side}|${hefty(r)}`, () => {
    const p = new Parts();
    p.add(loft([
      { t: 0.285, w: 0.084, d: [0.088, 0.09] },
      { t: 0.325, w: 0.094, d: [0.098, 0.1] },
      { t: 0.362, w: 0.082, d: [0.086, 0.088] },
    ], { seg: q(16, 8), sub: 1, uv: [3, 1] }), mat);
    // the loose end, lying on the chest
    p.add(loft([
      { t: -0.1, w: 0.044, d: 0.012 },
      { t: 0.05, w: 0.046, d: 0.014 },
      { t: 0.2, w: 0.044, d: 0.016 },
      { t: 0.31, w: 0.04, d: 0.02 },
    ], { seg: 8, n: 4, uv: [0.5, 1.6], swap: true }), mat, [0.142 + hefty(r) * 0.7, 0, side * 0.07], [0, 0, 0.07 - hefty(r) * 0.5]);
    return p.build();
  });
  return onTrunk(r, r.chest, g);
}

/** A wand, held out in front. */
export function wand(r: Rig) {
  const g = model('wand', () => {
    const p = new Parts();
    p.add(lathe([[0.0001, 0], [0.012, 0.004], [0.014, 0.05], [0.009, 0.1], [0.011, 0.11], [0.008, 0.12], [0.004, 0.37], [0.0001, 0.375]]), color(0x5a3a22, 0.6));
    return p.build();
  });
  g.position.set(0.02, -0.31, 0);
  g.rotation.z = -1.3;
  return inHand(r, g);
}

/** A tall pointy hat with a bent tip. */
export function pointyHat(r: Rig, dark: boolean) {
  const g = model(`pointy|${dark}`, () => {
    const p = new Parts();
    const felt = color(dark ? 0x161616 : 0x2a1d3a, 0.9);
    p.add(lathe([[0.9, -0.54], [1.95, -0.52], [1.9, -0.45], [1.0, -0.42]].map(([x, y]) => [x * R, y * R] as [number, number]), q(24, 10), { cap: 'none' }), felt);
    p.add(loft([
      { t: -0.46, w: 1.0, d: [1.05, 1.1] },
      { t: 0.5, w: 0.74, x: -0.04 },
      { t: 1.5, w: 0.44, x: -0.22 },
      { t: 2.4, w: 0.18, x: -0.58 },
      { t: 2.95, w: 0, x: -0.98 },
    ].map((k) => ({ ...k, t: k.t * R, w: k.w * R, x: (k.x ?? 0) * R, d: k.d ? [k.d[0] * R, k.d[1] * R] as [number, number] : undefined })), { seg: q(18, 8), sub: 2 }), felt);
    p.add(cyl(0.99 * R, 1.03 * R, 0.16 * R, q(18, 8), true), color(0x7a5a1e, 0.5, 0.3), hr(0, -0.36, 0.04));
    return p.build();
  });
  seatHat(g, scaleOf(r));
  r.head.add(g);
  return g;
}

/** Great Highland bagpipes: tartan bag under the arm, three drones over the shoulder. */
export function bagpipes(r: Rig) {
  const g = model('bagpipes', () => {
    const p = new Parts();
    const wood = color(0x15110e, 0.45), ivory = color(0xe9e2cf, 0.5);
    p.add(ball(0.14, q(14, 8), 0.8, 0.9, 1.15), M.tartan('green'), [0.13, 0.1, 0.14], [0.2, 0, 0.3]);
    const drone = (len: number, at: V3, dir: V3) => {
      const d = new Parts();
      d.add(cyl(0.013, 0.016, len, 7), wood, [0, len / 2, 0]);
      for (const k of [0.32, 0.62]) d.add(cyl(0.019, 0.019, 0.022, 7), ivory, [0, len * k, 0]);
      d.add(cyl(0.024, 0.016, 0.05, 8), wood, [0, len + 0.02, 0]);
      d.add(cyl(0.025, 0.025, 0.012, 8), ivory, [0, len + 0.05, 0]);
      p.sub(d, aim(at, dir));
    };
    drone(0.82, [0.04, 0.2, 0.2], [-0.42, 1, 0.1]);
    drone(0.5, [0.08, 0.2, 0.17], [-0.3, 1, 0.02]);
    drone(0.5, [0.0, 0.2, 0.22], [-0.52, 1, 0.2]);
    p.add(pipe([[0.16, 0.19, 0.1], [0.2, 0.33, 0.04], [0.15, 0.43, 0]], 0.011, { seg: 6, curve: true }), wood);
    p.add(pipe([[0.2, 0.1, 0.09], [0.25, -0.04, 0.03], [0.27, -0.2, 0]], [0.012, 0.014, 0.02], { seg: 6, curve: true }), wood);
    p.add(cyl(0.024, 0.024, 0.012, 8), ivory, aim([0.271, -0.2, 0], [0.1, -1, -0.12]));
    return p.build();
  });
  return onTrunk(r, r.chest, g);
}

/** The ghost-tour guide's lantern, swinging from the hand. */
export function lantern(r: Rig) {
  const g = model('lantern', () => {
    const p = new Parts();
    const iron = color(0x1a1a1c, 0.5, 0.5);
    p.add(rbox(0.086, 0.13, 0.086, 0.01, 1), M.emissive(0xffb84d, 2), [0, -0.12, 0]);
    p.add(lathe([[0.062, -0.05], [0.066, -0.04], [0.03, -0.01], [0.012, 0.0], [0.0001, 0.004]], 4), iron, null, [0, Math.PI / 4, 0]);
    p.add(rbox(0.11, 0.016, 0.11, 0.005, 1), iron, [0, -0.192, 0]);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.add(cyl(0.005, 0.005, 0.14, 4), iron, [x * 0.045, -0.12, z * 0.045]);
    p.add(torus(0.03, 0.005, 10, 4), iron, [0, 0.03, 0]);
    return p.build();
  });
  g.position.y = -0.4;
  return inHand(r, g);
}

/** A tourist's camera: round the neck, or up in one hand. */
export function camera(r: Rig, held: boolean) {
  const g = model(`camera|${held}`, () => {
    const p = new Parts();
    const body = color(0x18181a, 0.5), chrome = color(0xb9bec4, 0.3, 0.8), glass = color(0x0c1420, 0.1, 0.6);
    p.add(rbox(0.06, 0.082, 0.13, 0.012, 1), body);
    p.add(rbox(0.05, 0.022, 0.06, 0.008, 1), chrome, [0, 0.048, 0]);
    p.add(cyl(0.036, 0.04, 0.05, q(14, 8)), body, [0.05, -0.004, 0], [0, 0, -Math.PI / 2]);
    p.add(cyl(0.03, 0.03, 0.006, q(14, 8)), glass, [0.076, -0.004, 0], [0, 0, -Math.PI / 2]);
    p.add(cyl(0.008, 0.008, 0.01, 6), chrome, [0, 0.046, 0.045]);
    if (!held) p.add(pipe([[0, 0.04, 0.062], [-0.08, 0.2, 0.1], [-0.25, 0.22, 0], [-0.08, 0.2, -0.1], [0, 0.04, -0.062]], 0.006, { seg: 4, curve: true, steps: 3 }), body);
    return p.build();
  });
  if (held) {
    g.position.set(0.05, -0.31, 0);
    return inHand(r, g);
  }
  g.position.set(0.19 + hefty(r) * 0.6, 0.1, 0);
  return onTrunk(r, r.chest, g);
}

/** A bum bag, worn at the front like a pro. */
export function bumbag(r: Rig, hex = 0x3a86ff) {
  const bf = hefty(r);
  const g = model(`bumbag|${hex}|${bf}`, () => {
    const p = new Parts();
    const nylon = color(hex, 0.7);
    p.add(loft([{ t: 0.035, w: 0.172, d: [0.124 + bf, 0.124] }, { t: 0.068, w: 0.168, d: [0.122 + bf, 0.12] }], { seg: q(18, 8), n: 2.4 }), color(0x16161a, 0.7));
    p.add(ball(0.07, q(12, 6), 0.72, 0.6, 1.5), nylon, [0.14 + bf, 0.04, 0.02]);
    p.add(rbox(0.01, 0.012, 0.13, 0.004, 1), color(0x16161a, 0.5), [0.176 + bf, 0.058, 0.02]);
    return p.build();
  });
  return onTrunk(r, r.pelvis, g);
}

/** A phone at arm's length (on a stick, if `len` says so). Returns the screen, which can flash. */
export function phone(r: Rig, stick: boolean) {
  const len = stick ? 0.75 : 0.02;
  const g = model(`phone|${stick}`, () => {
    const p = new Parts();
    const black = color(0x101012, 0.35);
    if (stick) {
      p.add(cyl(0.013, 0.014, 0.12, 8), color(0x1a1a1a, 0.8), [0, -0.33, 0]);
      p.add(cyl(0.007, 0.008, len, 6), M.steel(), [0, -0.33 - len / 2, 0]);
      p.add(rbox(0.09, 0.02, 0.024, 0.006, 1), black, [0, -0.33 - len + 0.004, 0]);
    }
    // the phone lies across the end, screen back towards its owner
    p.add(rbox(0.075, 0.012, 0.15, 0.005, 1), black, [0, -0.33 - len, 0]);
    p.add(cyl(0.011, 0.011, 0.004, 8), color(0x30343a, 0.2, 0.6), [0.02, -0.338 - len, 0.05]);
    return p.build();
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.136), new THREE.MeshBasicMaterial({ color: 0x223344 }));
  flash.position.set(0, -0.33 - len + 0.0065, 0);
  flash.rotation.x = -Math.PI / 2;
  g.add(flash);
  inHand(r, g);
  return flash;
}

/** A brolly to float down under. */
export function umbrella() {
  return model('brolly', () => {
    const p = new Parts();
    const cloth = new THREE.MeshStandardMaterial({ color: 0xd7263d, roughness: 0.6, side: THREE.DoubleSide });
    const panels = (a: number) => 1 - 0.05 * Math.abs(Math.sin(a * 4));
    p.add(loft([
      { t: 0, w: 0.34 },
      { t: 0.07, w: 0.3 },
      { t: 0.14, w: 0.2 },
      { t: 0.175, w: 0.08 },
      { t: 0.185, w: 0 },
    ], { seg: 16, sub: 1, cap: 'none', mod: panels }), cloth);
    p.add(cyl(0.007, 0.007, 0.46, 5), M.black(), [0, -0.04, 0]);
    p.add(cyl(0.004, 0.008, 0.05, 5), M.steel(), [0, 0.205, 0]);
    p.add(pipe([[0, -0.27, 0], [0, -0.31, 0], [0.03, -0.33, 0], [0.055, -0.3, 0]], 0.011, { seg: 5, curve: true }), color(0x5a3a22, 0.6));
    return p.build();
  });
}

/** Hi-vis and a cap, for traffic wardens and workies. */
export function hiVis(r: Rig, vest: number, cap: number) {
  const bf = hefty(r);
  const g = model(`hivis|${vest}|${bf}`, () => {
    const p = new Parts();
    const cloth = color(vest, 0.6), tape = color(0xe8e8e8, 0.2, 0.6);
    const body = [
      { t: -0.1, w: 0.17, d: [0.128 + bf * 1.05, 0.118] },
      { t: 0.01, w: 0.168, d: [0.124 + bf, 0.11] },
      { t: 0.11, w: 0.194, d: [0.146 + bf * 0.5, 0.126] },
      { t: 0.19, w: 0.214, d: [0.154 + bf * 0.2, 0.138] },
      { t: 0.245, w: 0.236, d: [0.136, 0.132] },
      { t: 0.283, w: 0.232, d: [0.114, 0.118] },
      { t: 0.308, w: 0.168, d: [0.093, 0.099] },
      { t: 0.322, w: 0.094, d: [0.072, 0.078] },
    ] as { t: number; w: number; d: [number, number] }[];
    p.add(loft(body, { seg: q(20, 8), n: 2.4 }), cloth);
    const band = (t: number, w: number, df: number, db: number) =>
      p.add(loft([{ t, w: w + 0.004, d: [df + 0.004, db + 0.004] }, { t: t + 0.036, w: w + 0.004, d: [df + 0.004, db + 0.004] }], { seg: q(20, 8), n: 2.4 }), tape);
    band(-0.06, 0.169, 0.126 + bf * 1.02, 0.114);
    band(0.07, 0.185, 0.14 + bf * 0.7, 0.12);
    return p.build();
  });
  onTrunk(r, r.chest, g);
  if (r.hat) r.hat.visible = false;
  const h = hatMesh('cap', color(cap, 0.6), scaleOf(r));
  if (h) r.head.add(h);
}
