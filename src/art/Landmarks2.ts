import * as THREE from 'three';
import { M, color, mapMat } from './Materials';
import { ball, cyl, extrude, lathe, loft, model, Parts, pipe, q, rbox, torus, V3, Ring } from './Model';
import {
  FINE, OCTA, UNIT, archFrame, archSlab, band, battlements, corbels, dressed, drum, gable, moulding, pinnacle, planar, ringBattlements, roof, sbox, spire,
} from './Architecture';
import { clockTex, saltireTex } from './Textures';

/**
 * More landmarks: the Mercat Cross, the Tron, the Tolbooth, Holyrood, the market stalls, and the
 * long course's hotels, wheel, lighthouse, train, fountain and galleries. Same rule as Landmarks.ts:
 * each model keeps the local frame and footprint its set piece always had.
 */
const HALF = Math.PI / 2;
const DARK = () => color(0x0b0c0e, 0.9);
const GLASS = () => color(0x1e2a33, 0.2, 0.4);
let clockMat: THREE.Material | null = null;
const clock = () => (clockMat ??= new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.5 }));

/** A sash window standing on `at`, looking out along `yaw` (0 = +Z): glass, sill, lintel, and on desktop a surround. */
export function win(p: Parts, at: V3, yaw: number, w: number, h: number, trim: THREE.Material, o: { ped?: boolean; round?: boolean } = {}) {
  const s = new Parts();
  if (o.round) {
    s.add(archSlab(w, h - w / 2, 0.05, 0.5), GLASS(), [0, 0, 0.02]);
    s.add(archFrame(w, h - w / 2, 0.14, 0.14, 0.5), trim, [0, 0, 0.05]);
  } else {
    s.add(UNIT, GLASS(), [0, h / 2, 0.02], null, [w, h, 0.04]);
    s.add(UNIT, trim, [0, h + 0.08, 0.05], null, [w + 0.26, 0.16, 0.12]);
    if (FINE) for (const sx of [-1, 1]) s.add(UNIT, trim, [sx * (w / 2 + 0.06), h / 2, 0.04], null, [0.12, h, 0.08]);
  }
  s.add(UNIT, trim, [0, -0.06, 0.07], null, [w + 0.3, 0.12, 0.18]);
  if (FINE) {
    s.add(UNIT, trim, [0, h * 0.5, 0.045], null, [0.05, o.round ? h * 0.8 : h, 0.04]);
    s.add(UNIT, trim, [0, h * 0.5, 0.045], null, [w, 0.05, 0.04]);
    if (o.ped) s.add(extrude([[-w / 2 - 0.22, 0], [w / 2 + 0.22, 0], [0, 0.42]], 0.12), trim, [0, h + 0.16, 0.06]);
  }
  p.sub(s, at, [0, yaw, 0]);
}

/** A round column with a base, a little entasis and a square abacus, `h` tall from y = 0. */
export function column(r: number, h: number, seg = q(12, 7)) {
  return lathe([[r * 1.35, 0], [r * 1.35, h * 0.02], [r * 1.12, h * 0.04], [r, h * 0.06], [r * 1.02, h * 0.4], [r * 0.86, h * 0.93], [r * 1.05, h * 0.95], [r * 1.25, h * 0.975], [r * 1.25, h]], seg, { cap: 'none' });
}

/** An iron railing along X: bars with spear heads between two rails, `h` tall from y = 0. */
export function railing(p: Parts, len: number, h: number, at: V3, yaw = 0, o: { gap?: number; tip?: THREE.Material; mat?: THREE.Material } = {}) {
  const iron = o.mat ?? M.black(), gap = (o.gap ?? 0.18) * (FINE ? 1 : 2);
  const s = new Parts();
  const n = Math.max(2, Math.round(len / gap));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    s.add(UNIT, iron, [x, h / 2, 0], null, [0.03, h, 0.03]);
    if (o.tip) s.add(OCTA, o.tip, [x, h + 0.05, 0], null, [0.035, 0.1, 0.035]);
  }
  for (const y of [0.18, h - 0.14]) s.add(UNIT, iron, [0, y, 0], null, [len, 0.05, 0.045]);
  p.sub(s, at, [0, yaw, 0]);
}

// =====================================================================
// The Mercat Cross
// =====================================================================
/** The eight-sided drum: arcaded panels with painted medallions. 2.6 m tall, centred. */
export function mercatDrumModel() {
  return model('mercatdrum', () => {
    const p = new Parts();
    const stone = M.stone(36, 54, 31), pale = dressed(36, 62), gold = M.gold();
    p.add(lathe([[2.14, -1.3], [2.14, -1.1], [2.0, -1.0], [2.0, 1.0], [2.14, 1.14], [2.14, 1.3]], 8, { cap: 'flat', crease: 30, uv: [2, 0.35] }), stone);
    p.add(cyl(2.24, 2.24, 0.16, 8), pale, [0, 1.38, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
      p.add(cyl(0.42, 0.42, 0.06, q(14, 8)), color([0xc4161c, 0x1b4f9c, 0xd8a93a, 0x2b8a3e][i % 4], 0.5), [c * 1.86, 0.3, s * 1.86], [0, -a, HALF]);
      if (FINE) {
        p.add(torus(0.44, 0.035, q(14, 8), 4), gold, [c * 1.88, 0.3, s * 1.88], [0, HALF - a, 0]);
        p.add(archFrame(1.2, 0.95, 0.08, 0.08, 0.5), pale, [c * 1.85, -0.75, s * 1.85], [0, HALF - a, 0]);
      }
      // a wee turret on each corner
      const va = (i / 8) * Math.PI * 2;
      p.add(lathe([[0.16, 1.3], [0.16, 1.7], [0.2, 1.74], [0.0001, 2.0]], 6, { cap: 'none' }), pale, [Math.cos(va) * 2.05, 0, Math.sin(va) * 2.05]);
    }
    return p.build();
  });
}

/** A drum of the shaft, 1.7 m tall, centred. */
export function mercatShaftModel() {
  return model('mercatshaft', () => {
    const p = new Parts();
    p.add(lathe([[0.3, -0.85], [0.3, -0.76], [0.25, -0.7], [0.24, 0.72], [0.29, 0.78], [0.29, 0.85]], 8, { cap: 'flat', crease: 30, uv: [1, 0.25] }), M.stone(36, 60, 32));
    return p.build();
  });
}

/** The capital the unicorn stands on. 0.4 m tall, centred. */
export function mercatCapitalModel() {
  return model('mercatcap', () => {
    const p = new Parts();
    const pale = dressed(36, 66);
    p.add(lathe([[0.26, -0.2], [0.3, -0.12], [0.36, -0.08], [0.52, 0.06], [0.52, 0.1]], q(12, 8), { cap: 'flat' }), pale);
    p.add(rbox(1.0, 0.1, 1.0, 0.02, 1), pale, [0, 0.15, 0]);
    return p.build();
  });
}

/** The unicorn, rampant, gilt horn and mane, a saltire shield at its chest. Faces +Z; 1.2 m, centred. */
export function unicornModel() {
  const g = model('unicorn', () => {
    const p = new Parts();
    const white = M.white(), gold = M.gold();
    // haunches to chest, reared up
    p.add(loft([{ t: -0.42, w: 0.13, d: 0.14 }, { t: -0.28, w: 0.19, d: 0.21 }, { t: 0.05, w: 0.16, d: 0.18 }, { t: 0.3, w: 0.17, d: 0.2 }, { t: 0.42, w: 0.12, d: 0.14 }], { axis: 'z', seg: q(12, 6), sub: 1, cap: 'round' }), white, [0, 0.08, -0.02], [-0.95, 0, 0]);
    p.add(pipe([[0, 0.38, 0.2], [0, 0.6, 0.3], [0, 0.82, 0.34]], [0.13, 0.1, 0.085], { curve: true, seg: q(8, 5) }), white);
    p.add(loft([{ t: -0.1, w: 0.085, d: 0.1 }, { t: 0.06, w: 0.08, d: 0.095 }, { t: 0.26, w: 0.05, d: 0.06 }], { axis: 'z', seg: q(10, 6), sub: 1, cap: 'round' }), white, [0, 0.86, 0.4], [0.35, 0, 0]);
    for (const x of [-0.06, 0.06]) p.add(OCTA, white, [x, 0.98, 0.34], null, [0.025, 0.07, 0.025]);
    // the horn, with a twist to it
    p.add(lathe([[0.035, 0], [0.0001, 0.46]], 6, { mod: (a, v) => 1 + 0.25 * Math.sin(a * 2 + v * 14) }), gold, [0, 0.96, 0.46], [0.75, 0, 0]);
    p.add(pipe([[0, 0.95, 0.3], [0, 0.72, 0.18], [0, 0.5, 0.06]], [0.03, 0.045, 0.03], { curve: true, seg: 5, flat: [0.5, 1.4] }), gold);
    for (const x of [-0.1, 0.1]) {
      // forelegs pawing the air, hind legs braced
      p.add(pipe([[x, 0.32, 0.26], [x, 0.36, 0.5], [x, 0.2, 0.56]], [0.05, 0.04, 0.03], { seg: 5, bend: 0.06 }), white);
      p.add(pipe([[x * 1.3, -0.2, -0.18], [x * 1.3, -0.36, -0.02], [x * 1.3, -0.58, -0.1]], [0.07, 0.05, 0.035], { seg: 5, bend: 0.06 }), white);
      p.add(rbox(0.07, 0.05, 0.1, 0.015, 1), gold, [x * 1.3, -0.585, -0.07]);
    }
    p.add(pipe([[0, -0.2, -0.28], [0, 0.0, -0.46], [0, -0.3, -0.52]], [0.025, 0.03, 0.05], { curve: true, seg: 5 }), white);
    p.add(extrude([[-0.24, 0.26], [0.24, 0.26], [0.24, 0], [0, -0.3], [-0.24, 0]], 0.04, 0.008), gold, [0, 0.2, 0.5]);
    return p.build();
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), mapMat(saltireTex()));
  face.position.set(0, 0.3, 0.523);
  g.add(face);
  return g;
}

// =====================================================================
// The Tron Kirk
// =====================================================================
/**
 * Nave 12 m across (the street is on -X), `len` long, walls `top` high; the steeple stands forward
 * of it at x = -3.25, 46 m to the ball. Its clock looks over the street.
 */
export function tronKirkModel(len: number, top: number) {
  const p = new Parts();
  const stone = M.stone(25, 36, 41), pale = dressed(27, 46), mid = dressed(25, 38), leadC = color(0x2f3a45, 0.6, 0.3), dark = DARK();
  // built with the street on +X, then mirrored
  p.add(sbox(12, top, len), stone, [0, top / 2, 0]);
  p.add(roof(12.6, 4.6, len, { ends: false }), M.slate(), [0, top + 0.3, 0]);
  for (const sz of [-1, 1]) p.add(gable(12.3, 4.6, 0.5, false, 0.65), stone, [0, top, sz * (len / 2 - 0.25)]);
  p.add(moulding(len, 0.34, 0.44), pale, [6, top - 0.44, 0]);
  p.add(planar(extrude([[0, 0], [0.3, 0], [0.1, 1.3], [0, 1.3]], len)), stone, [6, 0, 0]);
  for (let z = -len / 2 + 3; z < len / 2 - 2; z += 4) {
    p.add(sbox(0.35, top - 0.5, 0.8), stone, [6.1, (top - 0.5) / 2, z - 2]);
    if (Math.abs(z) < 4) continue;
    win(p, [6.02, top * 0.55 - 3, z], HALF, 1.6, 6.8, pale, { round: true });
    if (FINE) p.add(UNIT, pale, [6.12, top * 0.55 + 3.9, z], null, [0.16, 0.5, 0.36]);
  }
  // the steeple
  const t = new Parts();
  t.add(sbox(5.5, 26, 5.5), stone, [0, 13, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.add(sbox(0.8, 25.4, 0.8), stone, [sx * 2.5, 12.7, sz * 2.5]);
  for (const y of [9, 17.6]) band(t, pale, y, 5.5, 0.22, 0.3);
  band(t, pale, 25.3, 5.5, 0.4, 0.7);
  for (let k = 0; k < 4; k++) {
    const f = new Parts();
    for (const x of [-0.9, 0.9]) {
      f.add(archSlab(1.0, 2.6, 0.1, 0.5), dark, [x, 11.6, 2.75]);
      f.add(archFrame(1.0, 2.6, 0.14, 0.2, 0.5), pale, [x, 11.6, 2.8]);
      if (FINE) for (let i = 0; i < 5; i++) f.add(UNIT, mid, [x, 11.9 + i * 0.5, 2.78], [0.6, 0, 0], [0.95, 0.05, 0.28]);
    }
    f.add(torus(1.1, 0.1, q(20, 12), 5), M.gold(), [0, 21, 2.8]);
    if (k !== 1) f.add(cyl(1.0, 1.0, 0.06, q(20, 12)), color(0xe8e2d0, 0.6), [0, 21, 2.76], [HALF, 0, 0]);
    // a balustrade between corner obelisks
    for (let i = -4; i <= 4; i++) f.add(lathe([[0.07, 26], [0.11, 26.25], [0.06, 26.6], [0.09, 26.8]], 5, { cap: 'none' }), pale, [i * 0.52, 0, 2.6]);
    f.add(UNIT, pale, [0, 26.86, 2.6], null, [5.0, 0.12, 0.26]);
    t.sub(f, null, [0, (k * Math.PI) / 2, 0]);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pinnacle(t, pale, [sx * 2.55, 26, sz * 2.55], 0.6, 2.6, { plain: true });
  // the doorway to the street
  t.add(archSlab(2.0, 2.9, 0.1, 0.5), M.wood(24, 22, 6), [2.76, 0.6, 0], [0, HALF, 0]);
  t.add(archFrame(2.0, 2.9, 0.3, 0.3, 0.5), pale, [2.78, 0.6, 0], [0, HALF, 0]);
  t.add(extrude([[-1.7, 0], [1.7, 0], [0, 1.0]], 0.3), pale, [2.8, 5.0, 0], [0, HALF, 0]);
  // an eight-sided stage, then the spire and its gilt ball
  const o8: V3 = [0, Math.PI / 8, 0];
  t.add(lathe([[2.6, 26], [2.35, 26.5], [2.05, 31.4], [2.3, 31.7], [2.3, 32]], 8, { cap: 'none', crease: 30, uv: [2, 0.75] }), stone, null, o8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    t.add(archSlab(0.7, 2.2, 0.08, 0.5), dark, [Math.sin(a) * 2.06, 27.6, Math.cos(a) * 2.06], [0, a, 0]);
  }
  t.add(lathe([[2.2, 32], [1.7, 33], [0.16, 45.6], [0.0001, 45.9]], 8, { cap: 'none', crease: 30 }), leadC, null, o8);
  t.add(ball(0.32, q(12, 8)), M.gold(), [0, 46.2, 0]);
  t.add(cyl(0.03, 0.03, 1.6, 5), M.gold(), [0, 47.2, 0]);
  t.add(extrude([[-0.5, 0], [0.3, 0], [0.3, 0.12], [0.55, -0.02], [0.3, -0.16], [0.3, -0.04], [-0.5, -0.04]], 0.03), M.gold(), [0, 47.6, 0]);
  p.sub(t, [3.25, 0, 0]);
  const out = new Parts();
  out.sub(p, null, null, [-1, 1, 1]);
  const g = out.build();
  const cf = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), clock());
  cf.position.set(-6.07, 21, 0);
  cf.rotation.y = -HALF;
  g.add(cf);
  return g;
}

// =====================================================================
// The Canongate Tolbooth
// =====================================================================
/** The Tolbooth: a 10 x 20 m block `top` high (street on +X) and its turreted tower at (3, -4). */
export function tolboothModel(top: number) {
  const p = new Parts();
  const stone = M.stone(32, 42, 71), pale = dressed(32, 52), dark = DARK(), slate = M.slate();
  p.add(sbox(10, top, 20), stone, [0, top / 2, 0]);
  p.add(roof(10.5, 4, 20, { ends: false }), slate, [0, top + 0.3, 0]);
  for (const sz of [-1, 1]) p.add(gable(10.3, 4, 0.5, true, 0.65), stone, [0, top, sz * 9.75]);
  p.add(moulding(20, 0.3, 0.4), pale, [5, top - 0.4, 0]);
  for (const z of [1.5, 5, 8.2]) {
    for (const y of [top - 3.4, top - 7.2]) if (y > 3) win(p, [5.02, y, z], HALF, 1.1, 1.9, pale);
    // dormers breaking the wallhead
    p.add(gable(1.8, 1.5, 0.4, true, 0.2), stone, [4.9, top, z], [0, HALF, 0]);
    p.add(UNIT, GLASS(), [5.11, top + 0.75, z], null, [0.04, 0.9, 0.7]);
  }
  // the forestair up to the first-floor door
  p.add(sbox(1.4, 3.2, 4.6), stone, [5.7, 1.6, 5.4]);
  for (let i = 0; i < 6; i++) p.add(sbox(1.4, 3.2 - i * 0.5, 0.6), stone, [5.7, (3.2 - i * 0.5) / 2, 8 + i * 0.6]);
  p.add(UNIT, M.wood(24, 22, 6), [5.03, 4.3, 5], null, [0.06, 2.1, 1.1]);
  // the tower: a pend through its foot, a bell-cast spire between two corbelled turrets
  const t = new Parts();
  t.add(sbox(4, 20, 6), stone, [0, 10, 0]);
  t.add(archSlab(2.4, 2.4, 0.1, 0.5), dark, [2.02, 0.5, 0], [0, HALF, 0]);
  t.add(archFrame(2.4, 2.4, 0.3, 0.26, 0.5), pale, [2.03, 0.5, 0], [0, HALF, 0]);
  for (const y of [6.4, 13.2]) t.add(moulding(6, 0.2, 0.28), pale, [2, y, 0]);
  for (const y of [7.5, 10.8, 14.4]) win(t, [2.02, y, 0], HALF, 0.8, 1.5, pale);
  corbels(t, pale, [2.15, 19.5, -3], [2.15, 19.5, 3], 0.3, 0.6);
  battlements(t, stone, [2.2, 19.7, -3], [2.2, 19.7, 3], { h: 0.5, base: 0.5, t: 0.35, w: 0.6, gap: 0.4 });
  for (const z of [-2.6, 2.6]) {
    t.add(lathe([[0.1, 15.4], [0.5, 16], [0.9, 16.6], [0.9, 19.6], [1.0, 19.7], [1.0, 19.9]], q(12, 7), { cap: 'none', uv: [1, 0.6] }), stone, [2.2, 0, z]);
    t.add(spire(1.02, 2.8, q(12, 7)), slate, [2.2, 19.9, z]);
    t.add(ball(0.1, 6), M.gold(), [2.2, 22.8, z]);
    t.add(UNIT, dark, [3.1, 18, z], null, [0.06, 0.9, 0.14]);
  }
  t.add(roof(4.3, 7, 6.3, { hip: 2.7 }), slate, [0, 20, 0]);
  t.add(cyl(0.03, 0.03, 1.2, 5), M.gold(), [0, 27.5, 0]);
  t.add(ball(0.12, 6), M.gold(), [0, 27.1, 0]);
  p.sub(t, [3, 0, -4]);
  return p.build();
}

/** The Tolbooth's clock on its bracket: a gilt case, a face each side. 1.3 m square, centred. */
export function tolboothClockModel() {
  const g = model('tolclock', () => {
    const p = new Parts();
    const gold = M.gold();
    p.add(rbox(1.3, 1.3, 0.34, 0.08, 2), gold);
    p.add(extrude([[-0.7, 0], [0.7, 0], [0, 0.34]], 0.36, 0.02), gold, [0, 0.64, 0]);
    for (const sx of [-1, 1]) p.add(lathe([[0.07, 0.6], [0.1, 0.7], [0.0001, 0.86]], 6, { cap: 'none' }), gold, [sx * 0.56, 0, 0]);
    p.add(ball(0.12, 8), gold, [0, 1.08, 0]);
    for (const sz of [-1, 1]) p.add(torus(0.56, 0.035, q(18, 10), 4), M.black(), [0, 0, sz * 0.175]);
    return p.build();
  });
  for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), clock());
    f.position.z = sz * 0.176;
    if (sz < 0) f.rotation.y = Math.PI;
    g.add(f);
  }
  return g;
}

// =====================================================================
// Holyrood
// =====================================================================
/** The forecourt wall and its railings: runs `len` along Z, 3 m to the spear heads. */
export function forecourtWallModel(len: number) {
  return model(`forecourt|${len}`, () => {
    const p = new Parts();
    const stone = M.stone(36, 52, 81), pale = dressed(36, 60);
    p.add(sbox(0.6, 2.4, len), stone, [0, 0.2, 0]);
    p.add(extrude([[-0.4, 0], [0.4, 0], [0.4, 0.06], [0, 0.2], [-0.4, 0.06]], len), pale, [0, 1.4, 0]);
    railing(p, len, 1.5, [0, 1.5, 0], HALF, { gap: 0.35, tip: M.gold() });
    for (let z = -len / 2; z <= len / 2 + 0.01; z += len / 8) {
      p.add(sbox(0.9, 3.4, 0.9), stone, [0, 0.7, z]);
      p.add(UNIT, pale, [0, 2.46, z], null, [1.1, 0.14, 1.1]);
      p.add(ball(0.26, q(10, 6)), pale, [0, 2.76, z]);
    }
    return p.build();
  });
}

/** A gate pier: panelled stone, a moulded cap, a gilt urn. 3.8 m of stone, centred. */
export function gatePostModel() {
  return model('gatepost', () => {
    const p = new Parts();
    const stone = M.stone(36, 52, 81), pale = dressed(36, 60), gold = M.gold();
    p.add(sbox(0.9, 3.8, 0.9), stone);
    p.add(sbox(1.06, 0.5, 1.06), stone, [0, -1.65, 0]);
    for (let k = 0; k < 4; k++) p.add(UNIT, pale, [Math.sin(k * HALF) * 0.455, 0.1, Math.cos(k * HALF) * 0.455], [0, k * HALF, 0], [0.5, 2.2, 0.03]);
    band(p, pale, 1.72, 0.9, 0.14, 0.32);
    p.add(lathe([[0.4, 2.04], [0.0001, 2.2]], 4), pale, null, [0, Math.PI / 4, 0]);
    p.add(lathe([[0.1, 2.14], [0.08, 2.24], [0.26, 2.42], [0.3, 2.6], [0.2, 2.74], [0.24, 2.8], [0.0001, 2.9]], q(12, 7), { cap: 'none' }), gold);
    return p.build();
  });
}

/** The fixed railings beside the gates: 3.9 m along X, 2.2 m high, standing on y = 0. */
export function sideRailingModel() {
  return model('siderail', () => {
    const p = new Parts();
    railing(p, 3.9, 2.2, [0, 0, 0], 0, { gap: 0.2, tip: M.gold() });
    return p.build();
  });
}

/** One leaf of the palace gates: 3.2 x 2.8 m of ironwork with a gilt cartouche, centred. */
export function gateLeafModel() {
  return model('gateleaf', () => {
    const p = new Parts();
    const iron = M.black(), gold = M.gold();
    for (let i = 0; i <= 20; i++) {
      const x = -1.55 + i * 0.155;
      // the tops sweep up to the meeting stile
      const h = 2.8 + 0.3 * Math.sin((i / 20) * Math.PI);
      p.add(UNIT, iron, [x, -1.4 + h / 2, 0], null, [0.03, h, 0.03]);
      p.add(OCTA, gold, [x, -1.4 + h + 0.06, 0], null, [0.04, 0.12, 0.04]);
    }
    for (const y of [-1.2, 0, 1.2]) p.add(UNIT, iron, [0, y, 0], null, [3.2, 0.06, 0.05]);
    p.add(UNIT, iron, [0, -0.98, 0], null, [3.2, 0.44, 0.02]);
    if (FINE) for (let i = 0; i < 6; i++) p.add(torus(0.2, 0.02, q(12, 8), 4), iron, [-1.3 + i * 0.52, 0.28, 0]);
    p.add(cyl(0.42, 0.42, 0.07, q(18, 10)), gold, [0, 0.75, 0], [HALF, 0, 0]);
    p.add(torus(0.5, 0.04, q(18, 10), 5), gold, [0, 0.75, 0]);
    p.add(extrude([[-0.2, 0], [-0.26, 0.2], [-0.13, 0.12], [0, 0.26], [0.13, 0.12], [0.26, 0.2], [0.2, 0]], 0.06), gold, [0, 1.22, 0]);
    return p.build();
  });
}

/** The fountain's basin: eight-sided, 0.7 m high, standing on y = 0. */
export function fountainBasinModel() {
  return model('basin', () => {
    const p = new Parts();
    p.add(lathe([[2.9, 0], [2.9, 0.16], [2.7, 0.24], [2.65, 0.56], [2.82, 0.62], [2.82, 0.72], [2.5, 0.72]], 8, { cap: 'none', crease: 30, uv: [2, 0.2] }), M.stone(36, 52, 81));
    return p.build();
  });
}
/** The fountain's stem (2 m), bowl (2.4 m across) and crown, each centred on its collider. */
export function fountainStemModel() {
  return model('fstem', () => {
    const p = new Parts();
    p.add(lathe([[0.36, -1], [0.36, -0.86], [0.26, -0.78], [0.2, -0.4], [0.33, 0.0], [0.33, 0.1], [0.18, 0.4], [0.2, 0.82], [0.3, 0.92], [0.3, 1]], q(14, 8), { cap: 'none', uv: [1, 0.3] }), M.stone(36, 52, 81));
    return p.build();
  });
}
export function fountainBowlModel() {
  return model('fbowl', () => {
    const p = new Parts();
    const lip = (a: number, v: number) => 1 + (v > 0.5 ? 0.04 * Math.cos(a * 8) : 0);
    p.add(lathe([[0.3, -0.15], [0.5, -0.1], [1.0, 0.04], [1.2, 0.12], [1.2, 0.16], [1.06, 0.16]], q(24, 12), { cap: ['flat', 'none'], mod: lip }), dressed(36, 62));
    p.add(cyl(1.06, 1.06, 0.02, q(24, 12)), color(0x5f8fa8, 0.1, 0.3), [0, 0.13, 0]);
    return p.build();
  });
}
export function fountainCrownModel() {
  return model('fcrown', () => {
    const p = new Parts();
    const gold = M.gold();
    p.add(lathe([[0.2, -0.25], [0.3, -0.18], [0.3, 0.0], [0.33, 0.04], [0.28, 0.08]], q(14, 8), { cap: ['flat', 'none'] }), gold);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.add(OCTA, gold, [Math.cos(a) * 0.29, 0.16, Math.sin(a) * 0.29], [0, -a, 0], [0.05, i % 2 ? 0.1 : 0.16, 0.03]);
      if (i % 2 === 0) p.add(pipe([[Math.cos(a) * 0.28, 0.08, Math.sin(a) * 0.28], [Math.cos(a) * 0.2, 0.36, Math.sin(a) * 0.2], [0, 0.44, 0]], 0.02, { curve: true, seg: 4, steps: 3 }), gold);
    }
    p.add(ball(0.06, 8), gold, [0, 0.48, 0]);
    p.add(UNIT, gold, [0, 0.6, 0], null, [0.025, 0.16, 0.025]);
    p.add(UNIT, gold, [0, 0.62, 0], null, [0.1, 0.025, 0.025]);
    return p.build();
  });
}

/** The palace front: 44 m wide, facing -Z, round towers at x = ±14. Its origin is the old one's. */
export function palaceModel() {
  return model('palace', () => {
    const p = new Parts();
    const stone = M.stone(36, 50, 84), tower = M.stone(36, 46, 86), pale = dressed(36, 60), slate = M.slate(), gold = M.gold();
    // built facing +Z with the block behind, then turned round
    p.add(sbox(44, 16, 14), stone, [0, 8, -7]);
    p.add(roof(14.6, 4.2, 44.6, { hip: 5 }), slate, [0, 16.5, -7], [0, HALF, 0]);
    p.add(moulding(44, 0.4, 0.5), pale, [0, 15.5, 0], [0, -HALF, 0]);
    p.add(moulding(44, 0.2, 0.26), pale, [0, 6.4, 0], [0, -HALF, 0]);
    for (let x = -11; x <= 11; x += 1.1) if (Math.abs(x) > 4.6) p.add(lathe([[0.08, 16], [0.13, 16.3], [0.07, 16.7], [0.1, 16.9]], 5, { cap: 'none' }), pale, [x, 0, 0.1]);
    for (const sx of [-1, 1]) p.add(UNIT, pale, [sx * 7.6, 16.96, 0.1], null, [7.2, 0.12, 0.3]);
    for (let x = -20; x <= 20; x += 3) {
      if ((Math.abs(x) > 10 && Math.abs(x) < 18) || Math.abs(x) < 4) continue;
      [3.0, 7.5, 11.5].forEach((y, i) => win(p, [x, y, 0.02], 0, 1.2, i === 1 ? 2.4 : 2.0, pale, { ped: i === 1 }));
    }
    for (const x of [-9, -3, 3, 9]) for (const y of [18.4]) {
      p.add(sbox(1.3, 3.6, 1.0), stone, [x, y, -7]);
      p.add(UNIT, pale, [x, 20.3, -7], null, [1.5, 0.2, 1.2]);
    }
    // the frontispiece: paired columns round the door, a clock and a crowned cupola over it
    const f = new Parts();
    f.add(sbox(8.4, 19, 1.2), stone, [0, 9.5, 0.3]);
    f.add(archSlab(3.0, 4.6, 0.1, 0.5), color(0x1c1410, 0.8), [0, 0, 0.92]);
    f.add(archFrame(3.0, 4.6, 0.36, 0.3, 0.5), pale, [0, 0, 0.95]);
    for (const x of [-3.3, -2.3, 2.3, 3.3]) f.add(column(0.36, 7.2), pale, [x, 0, 1.5]);
    f.add(sbox(8.8, 1.0, 1.9), stone, [0, 7.7, 0.9]);
    f.add(moulding(8.8, 0.3, 0.4), pale, [0, 8.2, 1.85], [0, -HALF, 0]);
    win(f, [0, 9.6, 0.92], 0, 2.2, 3.2, pale, { ped: true });
    f.add(extrude([[-0.7, 0.8], [0.7, 0.8], [0.7, 0], [0, -0.7], [-0.7, 0]], 0.14, 0.03), gold, [0, 14.6, 0.96]);
    f.add(extrude([[-4.4, 0], [4.4, 0], [0, 2.2]], 1.3), stone, [0, 19, 0.3]);
    f.add(extrude([[-4.7, 0], [0, 2.5], [4.7, 0], [4.2, 0], [0, 2.1], [-4.2, 0]], 0.3), pale, [0, 19, 1.0]);
    const o8: V3 = [0, Math.PI / 8, 0];
    f.add(lathe([[1.9, 19.5], [1.9, 23.2], [2.15, 23.5], [2.15, 23.8]], 8, { cap: 'none', crease: 30, uv: [2, 0.6] }), stone, [0, 0, -1.6], o8);
    f.add(lathe([[2.1, 23.8], [1.8, 24.6], [0.9, 25.6], [0.5, 26.6], [0.6, 27.0], [0.0001, 27.5]], 8, { cap: 'none', crease: 30 }), color(0x58646e, 0.5, 0.3), [0, 0, -1.6], o8);
    f.add(ball(0.2, 8), gold, [0, 27.6, -1.6]);
    p.sub(f);
    for (const sx of [-1, 1]) {
      const t = new Parts();
      t.add(drum(4, 20), tower);
      for (const y of [6.4, 13.6]) t.add(lathe([[4.0, y], [4.14, y + 0.06], [4.14, y + 0.26], [4.0, y + 0.32]], q(22, 10), { cap: 'none' }), pale);
      t.add(lathe([[4.0, 19.3], [4.4, 19.9], [4.4, 20.3]], q(22, 10), { cap: 'none' }), pale);
      for (let i = -2; i <= 2; i++) for (const y of [3.4, 9.2, 15.6]) {
        const a = i * 0.5;
        win(t, [Math.sin(a) * 3.99, y, Math.cos(a) * 3.99], a, 0.9, 1.8, pale);
      }
      t.add(spire(4.5, 7, q(22, 10)), slate, [0, 20.3, 0]);
      t.add(ball(0.22, 8), gold, [0, 27.5, 0]);
      t.add(cyl(0.03, 0.03, 1.4, 5), gold, [0, 28.2, 0]);
      // a slim turret in each angle with the front
      t.add(lathe([[1.1, 0], [1.1, 21.6], [1.25, 21.8], [1.25, 22]], q(10, 6), { cap: 'none', uv: [1, 3] }), tower, [-sx * 3.6, 0, 1.6]);
      t.add(spire(1.3, 3.2, q(10, 6)), slate, [-sx * 3.6, 22, 1.6]);
      p.sub(t, [sx * 14, 0, 0]);
    }
    p.add(lathe([[0.14, 16], [0.1, 16.4], [0.08, 23], [0.0001, 23.02]], 8, { cap: 'none' }), M.white(), [0, 0, -6]);
    const out = new Parts();
    out.sub(p, null, [0, Math.PI, 0]);
    return out.build();
  });
}

// =====================================================================
// Market stalls
// =====================================================================
/** A stall's striped canopy: pitched, with a scalloped valance. 1.7 x 2.1 m, centred on its eaves. */
export function stallCanopyModel(stripes: THREE.Material) {
  const p = new Parts();
  p.add(roof(1.8, 0.42, 2.2, { tile: 1.1 }), stripes, [0, -0.06, 0]);
  const n = FINE ? 8 : 4;
  for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
    p.add(extrude([[-1.1 / n, 0], [1.1 / n, 0], [0, -0.16]], 0.02), i % 2 ? M.white() : color(0xd8d2c2, 0.8), [sx * 0.9, -0.06, -1.1 + (i + 0.5) * (2.2 / n)], [0, HALF, 0]);
  }
  return p.build();
}

/** A stall's counter: boarded front, a worn top, a crate underneath. 1.24 x 0.9 x 1.7 m, centred. */
export function stallCounterModel() {
  return model('stallcounter', () => {
    const p = new Parts();
    const wood = M.wood(30, 36, 7), top = M.wood(28, 30, 2);
    p.add(rbox(1.1, 0.8, 1.6, 0.02, 1), wood, [0, -0.05, 0]);
    p.add(rbox(1.26, 0.07, 1.72, 0.02, 1), top, [0, 0.41, 0]);
    for (const sx of [-1, 1]) for (const z of [-0.5, 0, 0.5]) p.add(rbox(0.03, 0.74, 0.06, 0.008, 1), top, [sx * 0.56, -0.05, z]);
    p.add(rbox(1.2, 0.06, 0.06, 0.01, 1), top, [0, -0.42, 0.8]);
    return p.build();
  });
}

// =====================================================================
// The long course
// =====================================================================
/** The Caledonian's corner turret: 26 m of red sandstone under a copper-green dome. The street is on -X. */
export function caledonianModel() {
  return model('caley', () => {
    const p = new Parts();
    const red = color(0xa4513b, 0.9), pale = color(0xc98a6f, 0.9), green = color(0x3f6b5a, 0.6, 0.4), gold = M.gold();
    const courses = (_a: number, v: number) => (Math.floor(v * 52) % 2 ? 0.93 : 1);
    p.add(lathe([[4.5, 0], [4.5, 1.2], [4.2, 1.6], [4.2, 26]], q(26, 12), { cap: 'none', shade: courses }), red);
    for (const y of [5.2, 12.2, 19.2]) p.add(lathe([[4.2, y], [4.4, y + 0.08], [4.4, y + 0.32], [4.2, y + 0.42]], q(26, 12), { cap: 'none' }), pale);
    p.add(lathe([[4.2, 24.6], [4.5, 25.0], [4.85, 25.7], [4.85, 26.1]], q(26, 12), { cap: 'none' }), pale);
    for (let i = -3; i <= 3; i++) {
      const a = -HALF + i * 0.42;
      [1.8, 6.6, 9.6, 13.6, 16.6, 20.6].forEach((y, k) => win(p, [Math.sin(a) * 4.2, y, Math.cos(a) * 4.2], a, 1.2, k === 0 ? 2.6 : 2.1, pale, { round: k === 0 || k === 5, ped: k === 1 || k === 3 }));
    }
    // a balcony at the first floor, the dome, its lantern and finial
    p.add(lathe([[4.2, 5.7], [4.9, 6.0], [4.9, 6.14]], q(26, 12), { cap: 'none' }), pale);
    for (let i = 0; i < (FINE ? 40 : 20); i++) {
      const a = (i / (FINE ? 40 : 20)) * Math.PI * 2;
      p.add(UNIT, M.black(), [Math.sin(a) * 4.82, 6.6, Math.cos(a) * 4.82], null, [0.04, 0.95, 0.04]);
    }
    p.add(torus(4.82, 0.035, q(40, 16), 4), M.black(), [0, 7.08, 0], [HALF, 0, 0]);
    p.add(lathe([[4.95, 26.1], [4.6, 27.2], [3.9, 29.4], [2.6, 31.6], [1.3, 32.9], [1.1, 33.2]], q(26, 12), { cap: 'none', shade: (a) => 0.92 + 0.08 * Math.cos(a * 12) }), green);
    for (let k = 0; k < 4; k++) {
      const a = k * HALF + 0.4;
      p.add(UNIT, green, [Math.sin(a) * 3.9, 28.2, Math.cos(a) * 3.9], [0, a, 0], [1.2, 1.5, 1.4]);
      p.add(UNIT, GLASS(), [Math.sin(a) * 4.6, 28.2, Math.cos(a) * 4.6], [0, a, 0], [0.8, 1.0, 0.06]);
      p.add(roof(1.4, 0.6, 1.6), green, [Math.sin(a) * 3.9, 28.95, Math.cos(a) * 3.9], [0, a, 0]);
    }
    p.add(lathe([[1.1, 33.2], [1.1, 34.6], [1.3, 34.7], [0.7, 35.5], [0.12, 36], [0.08, 39], [0.0001, 39.2]], q(12, 8), { cap: 'none' }), green);
    p.add(ball(0.22, 8), gold, [0, 36.3, 0]);
    return p.build();
  });
}

/**
 * The Balmoral: a 22 x 24 x 30 m block with the street on +X, and the clock tower at (4, -11),
 * 59 m to the top of its roof. The four clock faces are added by the caller's frame of reference.
 */
export function balmoralModel() {
  const g = model('balmoral', () => {
    const p = new Parts();
    const stone = M.stone(34, 50, 71), pale = dressed(34, 60), slate = M.slate(), gold = M.gold();
    p.add(sbox(22, 24, 30), stone, [0, 12, 0]);
    p.add(roof(22.4, 5.5, 30.4, { hip: 6 }), slate, [0, 24.6, 0]);
    for (const [y, pr, h] of [[5.2, 0.3, 0.4], [16.4, 0.22, 0.3], [23.4, 0.5, 0.7]]) {
      p.add(moulding(30, pr, h), pale, [11, y, 0]);
      p.add(moulding(22, pr, h), pale, [0, y, -15], [0, HALF, 0]);
    }
    // five storeys of windows to the street and round the corner
    const ys = [1.4, 6.6, 10.2, 13.6, 17.6, 20.8];
    for (let z = -13; z <= 13.1; z += 2.6) {
      if (z < -7) continue; // the tower stands in front of these
      ys.forEach((y, k) => {
        if (k === 0 && Math.abs(z) < 5) return; // the name board
        win(p, [11.02, y, z], HALF, 1.3, k === 0 ? 3.0 : 2.0, pale, { round: k === 0, ped: k === 1 });
      });
    }
    for (let x = -9; x <= 0; x += 2.6) ys.forEach((y, k) => win(p, [x, y, -15.02], Math.PI, 1.3, k === 0 ? 3.0 : 2.0, pale, { round: k === 0, ped: k === 1 }));
    // dormers along the mansard, turrets on the far corners
    for (let z = -5; z <= 13; z += 3.6) {
      p.add(UNIT, pale, [10.4, 25.5, z], null, [1.2, 1.9, 1.5]);
      p.add(UNIT, GLASS(), [11.02, 25.5, z], null, [0.05, 1.2, 0.9]);
      p.add(roof(1.8, 0.8, 1.6), slate, [10.4, 26.45, z], [0, HALF, 0]);
    }
    for (const [x, z] of [[11, 15], [-11, -15]]) {
      p.add(lathe([[0.2, 17], [1.0, 18.4], [1.5, 19], [1.5, 26], [1.7, 26.2], [1.7, 26.5]], q(12, 7), { cap: 'none', uv: [1, 1.2] }), stone, [x, 0, z]);
      p.add(spire(1.75, 4.4, q(12, 7)), slate, [x, 26.5, z]);
      p.add(ball(0.14, 6), gold, [x, 31, z]);
    }
    // the clock tower
    const t = new Parts();
    t.add(sbox(7, 44, 7), stone, [0, 22, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.add(sbox(1.2, 43, 1.2), stone, [sx * 3.1, 21.5, sz * 3.1]);
    for (const y of [8, 24.4, 33.4]) band(t, pale, y, 7, 0.25, 0.36);
    band(t, pale, 42.8, 7, 0.55, 0.9);
    for (let k = 0; k < 4; k++) {
      const f = new Parts();
      for (const y of [11, 15.5, 20, 27]) win(f, [0, y, 3.52], 0, 1.4, 2.4, pale, { ped: y === 27 });
      // the clock in its aedicule
      f.add(torus(2.5, 0.16, q(26, 14), 5), gold, [0, 38, 3.56]);
      for (const sx of [-1, 1]) f.add(UNIT, pale, [sx * 2.85, 38, 3.56], null, [0.36, 6.2, 0.3]);
      f.add(extrude([[-3.3, 0], [3.3, 0], [0, 1.5]], 0.34), pale, [0, 41.2, 3.58]);
      f.add(UNIT, pale, [0, 34.8, 3.58], null, [6.4, 0.3, 0.36]);
      for (let i = -3; i <= 3; i++) f.add(lathe([[0.09, 44], [0.15, 44.3], [0.08, 44.8], [0.12, 45]], 5, { cap: 'none' }), pale, [i * 0.8, 0, 3.6]);
      f.add(UNIT, pale, [0, 45.06, 3.6], null, [6.6, 0.14, 0.3]);
      t.sub(f, null, [0, k * HALF, 0]);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      t.add(lathe([[0.9, 44], [0.9, 47.4], [1.05, 47.6], [1.05, 47.8]], q(10, 6), { cap: 'none', uv: [1, 0.5] }), stone, [sx * 3.0, 0, sz * 3.0]);
      t.add(lathe([[1.1, 47.8], [0.9, 48.4], [0.3, 49.3], [0.0001, 50.2]], q(10, 6), { cap: 'none' }), color(0x58646e, 0.5, 0.3), [sx * 3.0, 0, sz * 3.0]);
    }
    const o8: V3 = [0, Math.PI / 8, 0];
    t.add(lathe([[3.4, 44], [3.2, 44.4], [3.2, 49.6], [3.5, 49.9], [3.5, 50.2]], 8, { cap: 'none', crease: 30, uv: [3, 0.8] }), stone, null, o8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      t.add(archSlab(1.1, 2.6, 0.08, 0.5), DARK(), [Math.sin(a) * 2.97, 45.4, Math.cos(a) * 2.97], [0, a, 0]);
    }
    t.add(lathe([[3.6, 50.2], [3.0, 51.2], [2.2, 53.6], [1.2, 56.4], [0.9, 57.4], [1.0, 58], [0.0001, 59.2]], 8, { cap: 'none', crease: 30, uv: [3, 2] }), slate, null, o8);
    t.add(lathe([[0.12, 59], [0.08, 59.4], [0.06, 63.4], [0.0001, 63.5]], 6, { cap: 'none' }), M.white());
    t.add(ball(0.2, 8), gold, [0, 59.4, 0]);
    p.sub(t, [4, 0, -11]);
    return p.build();
  });
  for (let a = 0; a < 4; a++) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), clock());
    c.position.set(4 + Math.sin(a * HALF) * 3.55, 38, -11 + Math.cos(a * HALF) * 3.55);
    c.rotation.y = a * HALF;
    g.add(c);
  }
  return g;
}

/** The "Walnut Whip": a glazed podium and a coil of bronze ribbon, 40 m to its tip. */
export function walnutWhipModel() {
  return model('whip', () => {
    const p = new Parts();
    const clad = color(0xcfcac2, 0.6), glass = color(0x2a3540, 0.2, 0.5), bronze = color(0x8a5a2b, 0.35, 0.8);
    p.add(UNIT, clad, [0, 7, 0], null, [26, 14, 36]);
    for (let y = 2; y < 14; y += 3) p.add(UNIT, glass, [0, y, 0], null, [26.1, 1.6, 36.1]);
    // fins down the glazing, a canopy over the door
    const fins = FINE ? 2 : 4;
    for (let z = -17; z <= 17; z += fins) for (const sx of [-1, 1]) p.add(UNIT, clad, [sx * 13.1, 7, z], null, [0.25, 14, 0.3], 0.9);
    for (let x = -12; x <= 12; x += fins) for (const sz of [-1, 1]) p.add(UNIT, clad, [x, 7, sz * 18.1], null, [0.3, 14, 0.25], 0.9);
    p.add(UNIT, clad, [0, 14.3, 0], null, [26.8, 0.6, 36.8], 1.08);
    p.add(rbox(3, 0.3, 9, 0.1, 1), bronze, [-14.4, 3.6, 0]);
    // a dark glass core for the ribbon to wind round
    p.add(lathe([[7.2, 14.6], [6.6, 20], [4.6, 30], [2.2, 38], [0.0001, 40]], q(24, 12), { cap: 'none' }), glass);
    // the ribbon: two flat bands coiling up and in
    for (const ph of [0, Math.PI]) {
      const n = q(110, 60), pts: V3[] = [], rad: number[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = t * Math.PI * 2 * 2.6 + ph, r = 8.2 * (1 - t * 0.78);
        pts.push([Math.cos(a) * r, 14.4 + t * 26, Math.sin(a) * r * 1.15]);
        rad.push(1.7 * (1 - t * 0.6));
      }
      p.add(pipe(pts, rad, { seg: 6, flat: [0.22, 1] }), bronze);
    }
    return p.build();
  });
}

/** The big wheel, radius `R`, turning about its local Y axis. */
export function bigWheelModel(R: number) {
  return model(`wheel|${R}`, () => {
    const p = new Parts();
    const white = color(0xf2efe8, 0.4, 0.5), steel = M.steel(), flat: V3 = [HALF, 0, 0];
    for (const y of [-0.5, 0.5]) {
      p.add(torus(R, 0.13, q(56, 28), 6), white, [0, y, 0], flat);
      p.add(torus(R * 0.9, 0.08, q(56, 28), 5), white, [0, y, 0], flat);
      p.add(torus(R * 0.45, 0.06, q(32, 16), 5), white, [0, y * 0.8, 0], flat);
    }
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), a2 = a + Math.PI / N;
      for (const y of [-1, 1]) {
        // spokes fan out from the hub flanges to the two rims, laced to the next one
        p.add(pipe([[c * 0.6, y * 0.65, s * 0.6], [c * R, y * 0.5, s * R]], 0.045, { seg: 4 }), white);
        p.add(pipe([[c * R * 0.9, y * 0.5, s * R * 0.9], [Math.cos(a2) * R, y * 0.5, Math.sin(a2) * R]], 0.035, { seg: 4 }), white);
      }
      p.add(pipe([[c * R, -0.5, s * R], [c * R, 0.5, s * R]], 0.05, { seg: 4 }), white);
      if (FINE) p.add(pipe([[c * R * 0.9, -0.5, s * R * 0.9], [Math.cos(a2) * R * 0.9, 0.5, Math.sin(a2) * R * 0.9]], 0.03, { seg: 4 }), white);
      // a gondola: a rounded capsule with a band of glass
      const pod = new Parts();
      pod.add(rbox(1.2, 1.0, 1.15, 0.3, FINE ? 2 : 1), color(i % 2 ? 0xc4161c : 0x1b4f9c, 0.4));
      pod.add(rbox(1.22, 0.36, 1.17, 0.12, 1), color(0x1d2630, 0.1, 0.6), [0, 0, 0]);
      pod.add(rbox(1.26, 0.08, 1.2, 0.03, 1), white, [0, 0, 0], null, [1, 1, 1]);
      p.sub(pod, [c * (R + 0.1), 0, s * (R + 0.1)], [0, -a, 0]);
    }
    p.add(lathe([[0.3, -1.0], [0.75, -0.7], [0.75, -0.55], [0.45, -0.4], [0.45, 0.4], [0.75, 0.55], [0.75, 0.7], [0.3, 1.0], [0.0001, 1.02]], q(18, 10), { cap: 'none' }), steel);
    const bulb = M.emissive(0xffe08a, 2), nb = FINE ? 48 : 24;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      p.add(OCTA, bulb, [Math.cos(a) * (R + 0.2), i % 2 ? 0.5 : -0.5, Math.sin(a) * (R + 0.2)], null, 0.14);
    }
    return p.build();
  });
}

/** Newhaven's pier and lighthouse. The pier is 18 x 6 x 5 m at (5, 2, 0); the tower stands at x = -2. */
export function lighthouseModel() {
  return model('lighthouse', () => {
    const p = new Parts();
    const stone = M.stone(30, 44, 91), white = M.white(), red = color(0xc4161c, 0.5), iron = M.black();
    p.add(sbox(18, 6, 5), stone, [5, 2, 0]);
    p.add(UNIT, dressed(30, 54), [5, 5.08, 0], null, [18.3, 0.16, 5.3]);
    for (let x = -2; x <= 13; x += 3) for (const z of [-2.2, 2.2]) p.add(lathe([[0.16, 5.16], [0.13, 5.5], [0.2, 5.56], [0.2, 5.7], [0.0001, 5.74]], 8, { cap: 'none' }), iron, [x + 1.5, 0, z]);
    const t = new Parts();
    t.add(lathe([[1.95, 5], [1.95, 5.5], [1.62, 5.9], [1.3, 13.9]], q(20, 10), { cap: 'none' }), white);
    t.add(lathe([[1.62, 5.9], [1.56, 7.4]], q(20, 10), { cap: 'none' }), red, null, null, [1.01, 1, 1.01]);
    t.add(archSlab(0.8, 1.5, 0.1, 0.5), color(0x1b4f9c, 0.6), [0, 5.5, 1.78]);
    for (const [y, a] of [[9, 0.4], [11.6, -0.5]]) t.add(UNIT, GLASS(), [Math.sin(a) * 1.46, y, Math.cos(a) * 1.46], [0, a, 0], [0.36, 0.6, 0.1]);
    // the gallery and its rail, the lantern, a domed red cap and a vane
    t.add(lathe([[1.3, 13.6], [1.75, 13.9], [1.75, 14.1], [1.0, 14.1]], q(20, 10), { cap: 'none' }), iron);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      t.add(UNIT, iron, [Math.cos(a) * 1.68, 14.55, Math.sin(a) * 1.68], null, [0.04, 0.9, 0.04]);
      if (i % 2 === 0) t.add(UNIT, iron, [Math.cos(a) * 1.0, 14.8, Math.sin(a) * 1.0], [0, -a, 0], [0.05, 1.4, 0.05]);
    }
    t.add(torus(1.68, 0.03, q(20, 10), 4), iron, [0, 15.0, 0], [HALF, 0, 0]);
    t.add(cyl(0.98, 0.98, 1.4, q(12, 8), true), color(0x2a3540, 0.2, 0.6), [0, 14.8, 0]);
    t.add(cyl(0.3, 0.3, 0.8, 8), M.emissive(0xfff2c0, 1.6), [0, 14.8, 0]);
    t.add(lathe([[1.2, 15.5], [1.15, 15.7], [0.8, 16.3], [0.25, 16.7], [0.2, 16.9], [0.0001, 17]], q(16, 8), { cap: 'none' }), red);
    t.add(ball(0.14, 6), iron, [0, 17.1, 0]);
    t.add(cyl(0.02, 0.02, 0.9, 4), iron, [0, 17.6, 0]);
    p.sub(t, [-2, 0, 0]);
    return p.build();
  });
}

/** A railway carriage along Z: 20 m, rails at y = 0. `cab` gives it a yellow driving end at +Z. */
export function trainCarModel(cab: boolean) {
  return model(`traincar|${cab}`, () => {
    const p = new Parts();
    const body = color(0x2a4b8d, 0.4, 0.3), stripe = color(0xf2c14e, 0.5), glass = color(0x1d2630, 0.1, 0.6), grey = color(0x8a9097, 0.5, 0.3), dark = color(0x1b1c1f, 0.7);
    const sec = (t: number, w: number, y0: number, y1: number, n = 5): Ring => ({ t, w, x: (y0 + y1) / 2, d: (y1 - y0) / 2, n });
    const seg = q(16, 8);
    p.add(loft([sec(-10, 1.4, 0.9, 3.5), sec(10, 1.4, 0.9, 3.5)], { axis: 'z', seg }), body);
    p.add(loft([sec(-10, 1.3, 3.2, 3.82, 3), sec(10, 1.3, 3.2, 3.82, 3)], { axis: 'z', seg }), grey);
    p.add(loft([sec(-9.2, 1.41, 2.05, 2.95, 9), sec(9.2, 1.41, 2.05, 2.95, 9)], { axis: 'z', seg }), glass);
    p.add(loft([sec(-10, 1.42, 1.0, 1.25, 9), sec(10, 1.42, 1.0, 1.25, 9)], { axis: 'z', seg }), stripe);
    for (const x of [-1, 1]) {
      for (let z = -7.5; z <= 7.6; z += 1.5) p.add(UNIT, body, [x * 1.42, 2.5, z], null, [0.03, 0.92, 0.16]);
      for (const z of [-6.4, 6.4]) {
        p.add(UNIT, stripe, [x * 1.425, 2.2, z], null, [0.03, 2.3, 1.3]);
        p.add(UNIT, glass, [x * 1.43, 2.6, z], null, [0.03, 0.9, 0.9]);
      }
    }
    // bogies and underframe gear
    for (const z of [-6.8, 6.8]) {
      p.add(rbox(2.3, 0.5, 3.4, 0.1, 1), dark, [0, 0.55, z]);
      for (const dz of [-1, 1]) for (const x of [-0.75, 0.75]) p.add(cyl(0.42, 0.42, 0.14, q(12, 8)), dark, [x, 0.42, z + dz], [0, 0, HALF]);
    }
    p.add(rbox(2.2, 0.5, 5, 0.1, 1), dark, [0, 0.65, 0]);
    if (FINE) for (const z of [-3, 3]) p.add(rbox(1.6, 0.3, 1.4, 0.08, 1), grey, [0, 3.9, z]);
    if (cab) {
      p.add(loft([sec(0, 1.4, 0.9, 3.5), sec(0.5, 1.3, 1.0, 3.3, 4), sec(0.9, 1.1, 1.1, 2.4, 3.5)], { axis: 'z', seg, cap: ['flat', 'round'], dome: 0.1 }), stripe, [0, 0, 10]);
      p.add(loft([sec(0.3, 1.2, 2.1, 3.1, 5), sec(0.75, 1.05, 2.0, 2.7, 4)], { axis: 'z', seg, cap: ['flat', 'round'], dome: 0.05 }), glass, [0, 0, 10]);
      for (const x of [-0.8, 0.8]) p.add(rbox(0.3, 0.16, 0.08, 0.04, 1), M.emissive(0xfff2c0, 1.2), [x, 1.5, 10.86]);
    }
    return p.build();
  });
}

/** The Ross Fountain: cast iron in teal and gilt, three tiers and a figure on top. 7 m, on y = 0. */
export function rossFountainModel() {
  return model('ross', () => {
    const p = new Parts();
    const teal = color(0x2f8f83, 0.4, 0.5), gold = M.gold(), stone = M.stone(36, 56, 131);
    const scallop = (n: number) => (a: number, v: number) => 1 + (v > 0.55 ? 0.05 * Math.cos(a * n) : 0);
    p.add(lathe([[4.5, 0], [4.5, 0.2], [4.25, 0.3], [4.2, 0.58], [4.4, 0.64], [4.4, 0.74], [3.95, 0.74]], q(28, 14), { cap: 'none', uv: [3, 0.2] }), stone);
    p.add(cyl(3.95, 3.95, 0.02, q(28, 14)), color(0x6d9fb4, 0.1, 0.3), [0, 0.62, 0]);
    p.add(lathe([[1.3, 0.4], [1.2, 0.9], [0.8, 1.3], [0.62, 2.0], [0.8, 2.5], [0.7, 2.7]], q(16, 9), { cap: 'none', mod: (a) => 1 + 0.04 * Math.cos(a * 8) }), teal);
    p.add(lathe([[0.7, 2.7], [1.4, 2.82], [2.2, 3.0], [2.4, 3.14], [2.4, 3.2], [2.2, 3.2]], q(28, 14), { cap: 'none', mod: scallop(12) }), teal);
    p.add(torus(2.4, 0.05, q(28, 14), 5), gold, [0, 3.2, 0], [HALF, 0, 0]);
    p.add(lathe([[0.5, 3.1], [0.4, 3.6], [0.55, 4.2], [0.4, 4.7], [0.5, 4.9]], q(14, 8), { cap: 'none' }), teal);
    p.add(lathe([[0.5, 4.9], [0.9, 5.0], [1.3, 5.14], [1.4, 5.26], [1.3, 5.3]], q(24, 12), { cap: 'none', mod: scallop(8) }), teal);
    p.add(torus(1.4, 0.04, q(24, 12), 5), gold, [0, 5.28, 0], [HALF, 0, 0]);
    p.add(lathe([[0.3, 5.2], [0.26, 5.6], [0.36, 5.8], [0.3, 5.9]], q(10, 6), { cap: ['none', 'flat'] }), teal);
    // gilt figures: four seated round the stem, four mermaids below, a lady on top
    const fig = (h: number) => {
      const f = new Parts();
      f.add(loft([{ t: 0, w: 0.2 * h, d: 0.17 * h }, { t: 0.35 * h, w: 0.13 * h, d: 0.11 * h }, { t: 0.62 * h, w: 0.17 * h, d: 0.12 * h }, { t: 0.76 * h, w: 0.06 * h }], { seg: q(8, 5), sub: 1, cap: 'round' }), gold);
      f.add(ball(0.09 * h, q(8, 5)), gold, [0, 0.86 * h, 0]);
      for (const z of [-1, 1]) f.add(pipe([[0, 0.66 * h, z * 0.15 * h], [0.08 * h, 0.46 * h, z * 0.2 * h], [0.2 * h, 0.42 * h, z * 0.1 * h]], 0.035 * h, { seg: 4, bend: 0.03 }), gold);
      return f;
    };
    for (let k = 0; k < 4; k++) {
      const a = k * HALF + Math.PI / 4;
      p.sub(fig(1.2), [Math.cos(a) * 1.75, 3.2, Math.sin(a) * 1.75], [0, -a, 0]);
      p.sub(fig(1.0), [Math.cos(a + 0.78) * 1.25, 0.9, Math.sin(a + 0.78) * 1.25], [0, -a - 0.78, 0.3]);
      p.add(lathe([[0.2, 0], [0.34, 0.12], [0.3, 0.3], [0.12, 0.4]], 8, { cap: 'none' }), gold, [Math.cos(a) * 0.95, 5.3, Math.sin(a) * 0.95]);
    }
    p.sub(fig(1.3), [0, 5.9, 0]);
    return p.build();
  });
}

/**
 * One of the galleries on the Mound: a sandstone temple `len` long (across the street, along X),
 * 13 m wide, with a six-column portico at the +X end and colonnades down both sides.
 */
export function galleryModel(len: number) {
  return model(`gallery|${len}`, () => {
    const p = new Parts();
    const stone = M.stone(38, 66, 121), pale = dressed(38, 76), mid = dressed(38, 66);
    // a stepped base, the cella, the entablature
    p.add(sbox(len + 4, 0.4, 14), stone, [1, 0.2, 0]);
    p.add(sbox(len + 3.2, 0.4, 13.2), stone, [1, 0.6, 0]);
    p.add(sbox(len + 2.4, 0.4, 12.4), stone, [1, 1.0, 0]);
    p.add(sbox(len - 1, 8, 10.2), stone, [0, 5.2, 0]);
    const E = len + 2.6;
    p.add(sbox(E, 1.1, 12.6), stone, [1.2, 9.75, 0]);
    for (const sz of [-1, 1]) {
      p.add(moulding(E, 0.3, 0.36), pale, [1.2, 10.3, sz * 6.3], [0, -sz * HALF, 0]);
      if (FINE) for (let x = -len / 2 + 0.6; x < len / 2 + 2; x += 1.2) p.add(UNIT, mid, [x, 9.75, sz * 6.32], null, [0.5, 0.7, 0.06]);
    }
    p.add(moulding(12.6, 0.3, 0.36), pale, [1.2 + E / 2, 10.3, 0]);
    // the roof and its pediments
    p.add(roof(13, 2.5, E, { ends: false, tile: 6 }), color(0x6f7a80, 0.6, 0.3), [1.2, 10.66, 0], [0, HALF, 0]);
    for (const sx of [-1, 1]) {
      p.add(planar(extrude([[-6.3, 0], [6.3, 0], [0, 2.4]], 0.5)), stone, [1.2 + sx * (E / 2 - 0.25), 10.66, 0], [0, HALF, 0]);
      p.add(extrude([[-6.7, 0], [0, 2.75], [6.7, 0], [6.1, 0], [0, 2.4], [-6.1, 0]], 0.3), pale, [1.2 + sx * (E / 2 - 0.05), 10.66, 0], [0, HALF, 0]);
    }
    // columns: the portico, then the flanks
    const col = column(0.42, 8.1);
    for (let k = 0; k < 6; k++) p.add(col, pale, [len / 2 + 1.5, 1.2, -5 + k * 2]);
    for (const sz of [-1, 1]) for (let x = -len / 2 + 1.2; x < len / 2 + 0.4; x += 2.4) p.add(col, pale, [x, 1.2, sz * 5.7]);
    // the door, and a sphinx on each corner of the portico
    p.add(UNIT, color(0x2a1c12, 0.7), [len / 2 - 0.46, 3.6, 0], null, [0.1, 4.8, 2.4]);
    p.add(UNIT, pale, [len / 2 - 0.42, 6.15, 0], null, [0.2, 0.3, 3.0]);
    for (const sz of [-1, 1]) {
      const s = new Parts();
      s.add(loft([{ t: -0.9, w: 0.3, d: [0.3, 0.05] }, { t: -0.4, w: 0.36, d: [0.4, 0.05] }, { t: 0.4, w: 0.34, d: [0.42, 0.05] }, { t: 0.8, w: 0.26, d: [0.36, 0.05] }], { axis: 'x', seg: q(10, 6), sub: 1, cap: 'round' }), mid);
      s.add(loft([{ t: 0.3, w: 0.2 }, { t: 0.62, w: 0.24, d: 0.2 }, { t: 0.9, w: 0.18 }], { seg: q(8, 5), cap: 'round' }), mid, [0.7, 0, 0]);
      for (const z of [-0.2, 0.2]) s.add(rbox(0.6, 0.14, 0.16, 0.05, 1), mid, [1.0, 0.07, z]);
      p.sub(s, [len / 2 + 0.6, 10.66, sz * 5.5]);
    }
    return p.build();
  });
}
