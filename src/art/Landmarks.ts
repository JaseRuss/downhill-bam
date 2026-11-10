import * as THREE from 'three';
import { M, color } from './Materials';
import { ball, cyl, extrude, lathe, loft, model, Parts, pipe, q, rbox, torus, V3 } from './Model';
import {
  FINE, OCTA, UNIT, archFrame, archH, archPane, archSlab, archWall, band, battlements, buttress, cast, corbels, dressed, drum, gable,
  moulding, pierced, pinnacle, planar, ringBattlements, roof, sbox, spire, statue, tracery,
} from './Architecture';
import { clockTex, stainedGlassTex } from './Textures';

/**
 * The landmarks, as models. Each is built in the local frame its set piece already used (so the
 * colliders in the level code still fit) and handed back as a group for the scenery batcher.
 */
const DARK = () => color(0x0b0c0e, 0.9);
const GLASS = () => color(0x1e2a33, 0.2, 0.4);
const LEAD = () => color(0x58646e, 0.5, 0.3);
const HALF = Math.PI / 2;

/** Craggy rock: a faceted lump with strata, radius about 1. Three shapes are shared by every crag. */
function rockGeo(seed: number, detail = FINE ? 3 : 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  const shade = new Float32Array(p.count);
  const v = new THREE.Vector3();
  const n3 = (x: number, y: number, z: number) => Math.sin(x * 2.3 + seed) * Math.sin(y * 3.1 + seed * 1.7) * Math.sin(z * 2.7 - seed) + 0.5 * Math.sin(x * 5.9 - seed * 2) * Math.sin(z * 6.3 + seed) * Math.sin(y * 4.7);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // stepped strata: ledges and faces rather than a smooth blob
    const k = 1 + 0.2 * n3(v.x, v.y, v.z) + 0.05 * Math.round(Math.sin(v.y * 9 + seed) * 2);
    shade[i] = 0.8 + 0.3 * (0.5 + 0.5 * Math.sin(v.y * 14 + n3(v.z, v.x, v.y) * 3)) + (v.y > 0.55 ? 0.1 : 0);
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  g.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
  return g;
}
const rocks: THREE.BufferGeometry[] = [];
export function rock(i: number) {
  const k = ((i % 3) + 3) % 3;
  return (rocks[k] ??= rockGeo(1.3 + k * 2.1));
}
export const ROCK = () => color(0x7a7165, 0.95);

/** One crag as a model: radius, squash/stretch, turn. */
export function cragModel(i: number, sx: number, sy: number, sz: number, yaw = 0, tint = ROCK()) {
  const p = new Parts();
  p.add(rock(i), tint, null, [0, yaw, 0], [sx, sy, sz]);
  return p.build();
}

// =====================================================================
// Edinburgh Castle
// =====================================================================
/** The gatehouse across the head of the esplanade: gate tower, curtain walls, two drum towers. Faces +Z. */
export function gatehouseModel() {
  return model('gatehouse', () => {
    const p = new Parts();
    const stone = M.stone(34, 46, 11), pale = dressed(34, 58), mid = dressed(34, 44), dark = DARK(), iron = M.metal();
    // curtain walls with a battered foot, a corbelled parapet and arrow loops
    for (const sx of [-1, 1]) {
      p.add(sbox(11.6, 12, 3.6), stone, [sx * 9.3, 6, -1.2]);
      p.add(planar(extrude([[0, 0], [0.5, 0], [0.12, 1.6], [0, 1.6]], 11.6)), stone, [sx * 9.3, 0, 0.6], [0, -HALF, 0]);
      p.add(moulding(11.6, 0.3, 0.3), pale, [sx * 9.3, 11.2, 0.6], [0, -HALF, 0]);
      corbels(p, mid, [sx * 15, 11.75, 0.8], [sx * 3.6, 11.75, 0.8], 0.34, 0.8);
      p.add(sbox(11.6, 0.5, 0.5), stone, [sx * 9.3, 12.2, 0.75]);
      battlements(p, stone, [sx * 15, 12.45, 0.75], [sx * 3.6, 12.45, 0.75], { h: 0.85, t: 0.5, cope: pale });
      for (const x of [5.9, 12.6]) {
        p.add(UNIT, dark, [sx * x, 8.6, 0.61], null, [0.16, 1.5, 0.06]);
        p.add(UNIT, dark, [sx * x, 8.6, 0.61], null, [0.6, 0.16, 0.06]);
      }
      // a niche for a hero: canopy, corbel, dark recess
      const nx = sx * 4.9;
      p.add(archSlab(1.5, 2.3, 0.1, 0.8), dark, [nx, 1.9, 0.62]);
      p.add(archFrame(1.5, 2.3, 0.2, 0.3, 0.8), pale, [nx, 1.9, 0.68]);
      p.add(lathe([[0.2, 1.3], [0.62, 1.82], [0.66, 1.9]], q(10, 6), { cap: ['none', 'flat'] }), pale, [nx, 0, 0.75]);
    }
    // the gate tower: a real arch through its front wall, the pend dark behind a portcullis
    const AW = 4.2, SP = 3.6, K = 0.62, gateTop = archH(AW, SP, K);
    p.add(archWall(7.2, 15, 1.0, AW, SP, K), stone, [0, 0, 1.2]);
    p.add(sbox(7.2, 15, 3.9), stone, [0, 7.5, -1.25]);
    p.add(UNIT, dark, [0, gateTop / 2, 0.74], null, [AW + 0.2, gateTop + 0.2, 0.06]);
    p.add(archFrame(AW, SP, 0.36, 0.3, K), pale, [0, 0, 1.72]);
    if (FINE) p.add(archFrame(AW + 0.9, SP, 0.16, 0.16, K), mid, [0, 0, 1.74]);
    const R = AW * K, cx = AW / 2 - R;
    const yAt = (x: number) => SP + Math.sqrt(Math.max(0, R * R - (Math.abs(x) - cx) ** 2)) - 0.05;
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.6, h = yAt(x);
      p.add(UNIT, iron, [x, h / 2, 1.0], null, [0.09, h, 0.09]);
    }
    for (let j = 0; j < 5; j++) {
      const y = 0.9 + j * 1.05, hw = y < SP ? AW / 2 : Math.max(0.3, cx + Math.sqrt(Math.max(0, R * R - (y - SP) ** 2)));
      p.add(UNIT, iron, [0, y, 1.0], null, [hw * 2 - 0.05, 0.09, 0.07]);
    }
    // a shield over the gate, a window above it, string courses, a corbelled parapet
    p.add(extrude([[-0.7, 0.9], [0.7, 0.9], [0.7, 0.1], [0, -0.85], [-0.7, 0.1]], 0.16, 0.03), color(0xa3122a, 0.5), [0, 8.3, 1.76]);
    p.add(extrude([[-0.84, 1.04], [0.84, 1.04], [0.84, 0.05], [0, -1.04], [-0.84, 0.05]], 0.1), M.gold(), [0, 8.3, 1.73]);
    for (const sgn of [-1, 1]) p.add(UNIT, M.gold(), [0, 8.35, 1.85], [0, 0, sgn * 0.7], [1.5, 0.14, 0.03]);
    band(p, pale, 7.0, 7.2, 0.22, 0.3, [0, 0, -0.75]);
    p.add(archSlab(1.5, 1.5, 0.1, 0.9), GLASS(), [0, 10.2, 1.66]);
    tracery(p, pale, [0, 10.2, 1.74], 0, 1.5, 1.5, { t: 0.14, depth: 0.2, k: 0.9 });
    band(p, pale, 13.4, 7.2, 0.3, 0.34, [0, 0, -0.75]);
    for (const [a, b] of [[[-3.6, 14.3, 1.9], [3.6, 14.3, 1.9]], [[3.8, 14.3, 1.7], [3.8, 14.3, -3.2]], [[-3.8, 14.3, -3.2], [-3.8, 14.3, 1.7]]] as [V3, V3][]) {
      corbels(p, mid, [a[0], 14.0, a[2]], [b[0], 14.0, b[2]], 0.3, 0.7);
      battlements(p, stone, [a[0], 14.3, a[2]], [b[0], 14.3, b[2]], { h: 0.8, base: 0.9, t: 0.45, w: 0.8, gap: 0.6, cope: pale });
    }
    // corbelled turrets on the front corners, with slated caps
    for (const sx of [-1, 1]) {
      const t = new Parts();
      t.add(lathe([[0.1, 9.6], [0.45, 10.2], [0.7, 11.0], [0.95, 11.5], [0.95, 15.9], [1.08, 16.0], [1.08, 16.25]], q(12, 7), { cap: 'none', uv: [1, 0.8] }), stone);
      t.add(spire(1.12, 2.3, q(12, 7)), M.slate(), [0, 16.25, 0]);
      t.add(ball(0.13, 6), M.gold(), [0, 18.6, 0]);
      for (const a of [0.5, 1.6]) t.add(UNIT, dark, [Math.sin(a * sx) * 0.95, 13.6, Math.cos(a * sx) * 0.95], [0, a * sx, 0], [0.14, 1.0, 0.06]);
      p.sub(t, [sx * 3.5, 0, 1.6]);
    }
    // the drum towers
    for (const sx of [-1, 1]) {
      const t = new Parts();
      t.add(drum(3.0, 16.2, { batter: 0.5 }), stone);
      for (const y of [6.2, 11.4]) t.add(lathe([[3.0, y], [3.12, y + 0.06], [3.12, y + 0.24], [3.0, y + 0.32]], q(22, 10), { cap: 'none' }), pale);
      t.add(lathe([[3.0, 15.4], [3.32, 16.1], [3.38, 16.25], [3.38, 17.05], [2.9, 17.05], [2.9, 16.6], [0.0001, 16.6]], q(22, 10), { cap: 'none', uv: [3, 0.25] }), stone);
      ringBattlements(p, stone, [sx * 9, 17.05, 0.5], 3.14, 14, { h: 0.85, cope: pale });
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45 + (i % 2) * 0.1, y = i % 2 ? 12.9 : 8.4;
        t.add(UNIT, dark, [Math.sin(a) * 3.0, y, Math.cos(a) * 3.0], [0, a, 0], [0.16, 1.5, 0.08]);
        if (i % 2) t.add(UNIT, dark, [Math.sin(a) * 3.0, y, Math.cos(a) * 3.0], [0, a, 0], [0.56, 0.16, 0.08]);
      }
      p.sub(t, [sx * 9, 0, 0.5]);
    }
    // the flagstaff (the saltire flies from it in the level code)
    p.add(lathe([[0.16, 15.2], [0.1, 15.6], [0.08, 21], [0.0001, 21.02]], 8, { cap: 'none' }), M.white(), [0, 0, -1]);
    p.add(ball(0.14, 8), M.gold(), [0, 21.12, -1]);
    const g = p.build();
    // Wallace and Bruce in their niches, in bronze
    const bronze = color(0x4d5a52, 0.5, 0.5);
    const wallace = statue(cast(bronze, 2.2, { beard: bronze, hairStyle: 'long', build: 1.2 }), (r) => {
      r.shoulderR.rotation.set(0.1, 0, 2.5);
      r.elbowR.rotation.z = 0.3;
      r.shoulderL.rotation.set(-0.2, 0, 0.4);
      r.elbowL.rotation.z = 0.9;
    });
    const bruce = statue(cast(bronze, 2.2, { beard: bronze, build: 1.15 }), (r) => {
      r.shoulderR.rotation.set(0.2, 0, 0.5);
      r.elbowR.rotation.z = 1.2;
      r.shoulderL.rotation.set(-0.3, 0, 0.2);
    });
    const props = new Parts();
    // a claymore held aloft, a battle-axe at rest, a crown
    props.add(UNIT, bronze, [-4.9 - 0.34, 4.95, 1.25], [0, 0, 0.08], [0.07, 1.9, 0.03]);
    props.add(UNIT, bronze, [-4.9 - 0.3, 4.12, 1.25], null, [0.4, 0.05, 0.05]);
    props.add(UNIT, bronze, [4.9 + 0.38, 2.6, 1.3], null, [0.05, 1.5, 0.05]);
    props.add(extrude([[0, 0], [0.26, 0.2], [0.26, -0.2]], 0.03), bronze, [4.9 + 0.4, 3.3, 1.3]);
    props.add(lathe([[0.13, 0], [0.14, 0.05], [0.12, 0.06], [0.16, 0.13]], 8, { cap: 'none' }), bronze, [4.9, 1.95 + 2.2, 1.02]);
    props.build(g);
    for (const [fig, x] of [[wallace, -4.9], [bruce, 4.9]] as [THREE.Mesh, number][]) {
      fig.position.set(x, 1.92, 1.02);
      fig.rotation.y = -HALF; // statues face +X; the niche looks out along +Z
      g.add(fig);
    }
    return g;
  });
}

/**
 * The castle on its rock, behind the gatehouse: the Half Moon Battery, the palace with its clock
 * tower, the Great Hall and the wee chapel. `k` squeezes it sideways (the long course has less room).
 */
export function castleKeepModel(k = 1) {
  return model(`keep|${k}`, () => {
    const p = new Parts();
    const stone = M.stone(34, 46, 11), dark = M.stone(30, 34, 12), pale = dressed(34, 56), slate = M.slate(), blk = DARK();
    const X = (x: number) => x * k;
    // the outer curtain round the summit
    p.add(sbox(X(42), 11, 17), dark, [0, 10.5, -26]);
    battlements(p, dark, [X(-21), 16, -17.7], [X(21), 16, -17.7], { h: 0.9, base: 0.6, t: 0.6, w: 1.1, gap: 0.8 });
    for (const sx of [-1, 1]) battlements(p, dark, [X(sx * 20.7), 16, -17.7], [X(sx * 20.7), 16, -34.3], { h: 0.9, base: 0.6, t: 0.6, w: 1.1, gap: 0.8 });
    // the Half Moon Battery, bulging out over the gate
    const hm = new Parts();
    hm.add(drum(8, 13, { batter: 0.8, seg: q(28, 14) }), stone);
    hm.add(cyl(8, 8, 0.2, q(28, 14)), dark, [0, 12.9, 0]);
    ringBattlements(hm, stone, [0, 13, 0], 7.75, 22, { h: 0.9, t: 0.6, cope: pale });
    for (let i = 0; i < 6; i++) {
      const a = -1.2 + i * 0.48;
      hm.add(UNIT, blk, [Math.sin(a) * 8.0, 10.6, Math.cos(a) * 8.0], [0, a, 0], [0.8, 0.7, 0.14]);
    }
    p.sub(hm, [X(11), 5, -20]);
    // the palace block, crow-stepped, with its octagonal clock tower
    const pal = new Parts();
    pal.add(sbox(16, 9, 8), stone, [0, 4.5, 0]);
    pal.add(roof(8.6, 3.6, 16, { ends: false }), slate, [0, 9, 0], [0, HALF, 0]);
    for (const sx of [-1, 1]) pal.add(gable(8.2, 3.6, 0.6, true), stone, [sx * 7.9, 9, 0], [0, HALF, 0]);
    for (let i = 0; i < 5; i++) for (const y of [2.6, 6.2]) pal.add(UNIT, blk, [-6 + i * 3, y, 4.02], null, [0.9, 1.6, 0.08]);
    pal.add(moulding(16, 0.25, 0.3), pale, [0, 8.7, 4], [0, -HALF, 0]);
    pal.add(lathe([[1.9, 0], [1.9, 12.4], [2.15, 12.7], [2.15, 13.6]], 8, { cap: 'none', crease: 30, uv: [2, 1.6] }), stone, [0, 0, 4.3], [0, Math.PI / 8, 0]);
    pal.add(lathe([[2.0, 13.6], [1.5, 14.6], [1.2, 15.0], [1.05, 16.2], [0.0001, 17.6]], 8, { cap: 'none', crease: 30 }), LEAD(), [0, 0, 4.3], [0, Math.PI / 8, 0]);
    pal.add(cyl(0.05, 0.07, 3.4, 6), M.white(), [0, 19.2, 4.3]);
    const cf = new THREE.CircleGeometry(0.8, q(20, 12));
    pal.add(cf, new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.6 }), [0, 10.6, 6.1]);
    p.sub(pal, [X(-8), 16, -27]);
    // the Great Hall
    const hall = new Parts();
    hall.add(sbox(12, 7, 7), stone, [0, 3.5, 0]);
    hall.add(roof(7.6, 3.4, 12, { ends: false }), slate, [0, 7, 0], [0, HALF, 0]);
    for (const sx of [-1, 1]) hall.add(gable(7.2, 3.4, 0.6, true), stone, [sx * 5.9, 7, 0], [0, HALF, 0]);
    for (let i = 0; i < 4; i++) hall.add(archSlab(0.9, 2.2, 0.08), blk, [-4.2 + i * 2.8, 2.2, 3.52]);
    p.sub(hall, [X(10), 16, -30]);
    // St Margaret's Chapel, the oldest thing up here, and the gate tower on the way up
    p.add(sbox(5.4, 3.6, 3.6), dark, [X(-17), 17.8, -22]);
    p.add(roof(4, 1.7, 5.6), slate, [X(-17), 19.6, -22], [0, HALF, 0]);
    p.add(sbox(5, 9, 5), stone, [X(18), 20.5, -24]);
    for (const [a, b] of [[[-2.5, 0, 2.5], [2.5, 0, 2.5]], [[2.5, 0, 2.5], [2.5, 0, -2.5]], [[-2.5, 0, -2.5], [-2.5, 0, 2.5]]] as [V3, V3][]) {
      battlements(p, stone, [X(18) + a[0], 25, -24 + a[2]], [X(18) + b[0], 25, -24 + b[2]], { h: 0.7, t: 0.4, w: 0.8, gap: 0.5 });
    }
    return p.build();
  });
}

/** The low wall down the side of the esplanade: saddleback cope, a pier every eight metres. Runs along Z. */
export function esplanadeWallModel(len: number) {
  return model(`espwall|${len}`, () => {
    const p = new Parts();
    const stone = M.stone(34, 46, 11), pale = dressed(34, 58);
    p.add(sbox(0.8, 1.3, len), stone, [0, 0.3, 0]);
    p.add(extrude([[-0.52, 0], [0.52, 0], [0.52, 0.07], [0, 0.26], [-0.52, 0.07]], len), pale, [0, 0.95, 0]);
    for (let z = -len / 2; z <= len / 2 + 0.01; z += 8) {
      p.add(sbox(1.15, 1.95, 1.15), stone, [0, 0.62, z]);
      p.add(UNIT, pale, [0, 1.65, z], null, [1.35, 0.14, 1.35]);
      p.add(lathe([[0.9, 1.72], [0.0001, 2.3]], 4), pale, [0, 0, z], [0, Math.PI / 4, 0]);
      if (FINE) p.add(ball(0.17, 8), pale, [0, 2.36, z]);
    }
    return p.build();
  });
}

/** The One O'Clock Gun on a field carriage. The muzzle points along +Z; the ground is y = 0. */
export function gunModel() {
  return model('gun', () => {
    const p = new Parts();
    const iron = color(0x17181a, 0.45, 0.6), wood = M.wood(20, 25, 2), band_ = M.gold(), steel = color(0x2a2c30, 0.45, 0.7);
    const b = new Parts();
    b.add(lathe([
      [0.0001, -1.56], [0.08, -1.54], [0.11, -1.46], [0.06, -1.39], [0.24, -1.33], [0.33, -1.24], [0.32, -0.6], [0.345, -0.58], [0.345, -0.5], [0.3, -0.47],
      [0.26, 0.45], [0.285, 0.47], [0.285, 0.55], [0.245, 0.58], [0.22, 1.12], [0.275, 1.19], [0.28, 1.3], [0.0001, 1.3],
    ], q(16, 9), { cap: 'none' }), iron);
    b.add(cyl(0.14, 0.14, 0.01, q(12, 8)), DARK(), [0, 1.303, 0]);
    b.add(cyl(0.347, 0.347, 0.05, q(16, 9), true), band_, [0, -0.54, 0]);
    b.add(cyl(0.09, 0.09, 0.95, 8), iron, [0, -0.35, 0], [0, 0, HALF]);
    p.sub(b, [0, 0.95, 0.3], [HALF - 0.15, 0, 0]);
    // cheeks stepped down to the trail, an axle, two spoked wheels
    const cheek: [number, number][] = [[-1.05, 0.12], [0.75, 0.3], [0.75, 0.82], [0.35, 0.82], [0.35, 0.66], [-0.1, 0.66], [-0.1, 0.5], [-0.55, 0.5], [-0.55, 0.34], [-1.05, 0.3]];
    for (const x of [-0.34, 0.34]) p.add(extrude(cheek, 0.12, 0.01), wood, [x, 0, 0], [0, -HALF, 0]);
    p.add(rbox(0.6, 0.1, 1.5, 0.02, 1), wood, [0, 0.3, -0.1], [0.1, 0, 0]);
    p.add(cyl(0.05, 0.05, 1.25, 8), steel, [0, 0.52, 0.35], [0, 0, HALF]);
    for (const x of [-0.56, 0.56]) {
      const w = new Parts();
      w.add(lathe([[0.44, -0.05], [0.52, -0.05], [0.52, 0.05], [0.44, 0.05]], q(18, 10), { cap: 'none' }), wood);
      w.add(cyl(0.525, 0.525, 0.07, q(18, 10), true), steel);
      w.add(cyl(0.1, 0.1, 0.2, 8), wood);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        w.add(UNIT, wood, [Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27], [0, -a, 0], [0.36, 0.05, 0.04]);
      }
      p.sub(w, [x, 0.52, 0.35], [0, 0, HALF]);
    }
    return p.build();
  });
}

/** A banner post: flared foot, ball on top, `h` tall from y = 0. */
export function postModel(h: number, r = 0.1) {
  return model(`post|${h}|${r}`, () => {
    const p = new Parts();
    p.add(lathe([[r * 2.4, 0], [r * 2.4, 0.08], [r * 1.5, 0.16], [r * 1.25, 0.6], [r * 1.6, 0.64], [r, 0.72], [r * 0.8, h - 0.1], [r * 1.3, h - 0.06], [r * 1.3, h], [0.0001, h]], q(10, 6), { cap: 'none' }), M.metal());
    p.add(ball(r * 1.3, 8), M.gold(), [0, h + r, 0]);
    return p.build();
  });
}

// =====================================================================
// St Giles
// =====================================================================
const glassMats: THREE.Material[] = [];
/** Four stained-glass designs do for every window. */
function stained(i: number) {
  const k = ((i % 4) + 4) % 4;
  return (glassMats[k] ??= new THREE.MeshStandardMaterial({ map: stainedGlassTex(50 + k * 9), emissive: 0xffffff, emissiveMap: stainedGlassTex(50 + k * 9), emissiveIntensity: 0.5, roughness: 0.4 }));
}

/**
 * The nave: 12 m across X (the street is on +X), `len` along Z, walls `top` high. Buttressed bays
 * of traceried glass, a parapet, a leaded roof between two gables; the porch sits at `doorZ`.
 * Bays within 4.5 m of `towerZ` are left for the tower.
 */
export function stGilesNaveModel(len: number, top: number, towerZ: number, doorZ: number, doorY: number) {
  const p = new Parts();
  const stone = M.stone(28, 40, 21), pale = dressed(30, 50), mid = dressed(28, 42), dark = DARK(), lead = LEAD();
  p.add(sbox(12, top, len), stone, [0, top / 2, 0]);
  p.add(moulding(len, 0.22, 0.3), pale, [6, top * 0.3, 0]);
  // the wallhead: a string course, a parapet of wee battlements, the roof behind
  p.add(moulding(len, 0.3, 0.36), pale, [6, top - 0.4, 0]);
  battlements(p, stone, [6.05, top, -len / 2], [6.05, top, len / 2], { h: 0.5, base: 0.55, t: 0.35, w: 0.7, gap: 0.45, cope: pale });
  p.add(sbox(0.4, 1.0, len), stone, [-5.9, top + 0.5, 0]);
  p.add(roof(11.2, 4.4, len - 0.6, { ends: false }), lead, [0, top + 0.25, 0]);
  if (FINE) for (let z = -len / 2 + 1; z < len / 2; z += 1.6) p.add(OCTA, lead, [0, top + 4.75, z], null, [0.1, 0.22, 0.1]);
  for (const sz of [-1, 1]) {
    p.add(gable(12, 4.9, 0.7, false, 0.5), stone, [0, top, sz * (len / 2 - 0.35)]);
    p.add(UNIT, pale, [0, top + 6.1, sz * (len / 2 - 0.35)], null, [0.16, 1.3, 0.16]);
    p.add(UNIT, pale, [0, top + 6.3, sz * (len / 2 - 0.35)], null, [0.7, 0.16, 0.16]);
  }
  // the great west window in the gable end the trolley comes down towards
  const ww = 3.6, wsp = top * 0.42, wy = top * 0.2;
  const west = new THREE.Group();
  const pane = new THREE.Mesh(archPane(ww, wsp), stained(3));
  pane.position.set(0, wy, -len / 2 - 0.02);
  pane.rotation.y = Math.PI;
  west.add(pane);
  tracery(p, pale, [0, wy, -len / 2 - 0.1], Math.PI, ww, wsp, { t: 0.26, depth: 0.36, lights: 4 });
  // bays down the street side
  const sp = 5.0, wy0 = top * 0.55 - 3.5;
  let bay = 0;
  for (let z = -len / 2 + 3; z < len / 2 - 2; z += 4.5, bay++) {
    if (Math.abs(z - towerZ) < 4.5) continue;
    const bh = top * 0.86;
    p.add(buttress(1.0, 1.35, bh, 3), stone, [6, 0, z]);
    pinnacle(p, mid, [6.55, bh - 0.75, z], 0.55, 3.0, { yaw: Math.PI / 4 });
    if (z + 2.25 > len / 2 - 1.5 || Math.abs(z + 2.25 - doorZ) < 2.6) continue;
    const g = new THREE.Mesh(archPane(2.0, sp), stained(bay));
    g.position.set(6.02, wy0, z + 2.25);
    g.rotation.y = HALF;
    west.add(g);
    tracery(p, pale, [6.1, wy0, z + 2.25], HALF, 2.0, sp, { t: 0.2, depth: 0.3 });
    p.add(moulding(2.5, 0.2, 0.2), pale, [6, wy0 - 0.22, z + 2.25]);
  }
  // the porch: a gabled doorway with oak doors in a moulded arch
  const d = new Parts();
  d.add(archWall(4.6, 6.2, 0.9, 2.6, 2.5), stone);
  d.add(gable(4.6, 2.0, 0.9, false, 0.3), stone, [0, 6.2, 0]);
  d.add(archFrame(2.6, 2.5, 0.3, 0.3), pale, [0, 0, 0.4]);
  if (FINE) d.add(archFrame(3.2, 2.5, 0.14, 0.2), mid, [0, 0, 0.42]);
  d.add(archSlab(2.6, 2.5, 0.08), M.wood(24, 22, 6), [0, 0, -0.2]);
  d.add(UNIT, dark, [0, 2.2, -0.14], null, [0.05, 4.4, 0.04]);
  for (const sx of [-1, 1]) for (const y of [1.0, 2.6]) d.add(UNIT, M.metal(), [sx * 0.7, y, -0.14], null, [1.0, 0.07, 0.03]);
  pinnacle(d, mid, [0, 8.4, 0], 0.4, 1.6);
  p.sub(d, [6.4, doorY, doorZ], [0, HALF, 0]);
  const g = p.build();
  g.add(west);
  return g;
}

/**
 * The tower under the crown: 6.4 m square and `h` tall, the street on +X. Clasping buttresses,
 * louvred belfry lights, a gilt-rimmed clock, a corbel table for the crown to stand on.
 */
export function stGilesTowerModel(h: number) {
  const p = new Parts();
  const stone = M.stone(28, 40, 21), pale = dressed(30, 50), mid = dressed(28, 40), dark = DARK();
  p.add(sbox(6.4, h, 6.4), stone, [0, h / 2, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.add(sbox(1.2, h - 1.2, 1.2), stone, [sx * 2.85, (h - 1.2) / 2, sz * 2.85]);
    p.add(lathe([[0.85, h - 1.2], [0.0001, h - 0.35]], 4), mid, [sx * 2.85, 0, sz * 2.85], [0, Math.PI / 4, 0]);
  }
  for (const y of [h - 10.6, h - 6.3]) band(p, pale, y, 6.4, 0.2, 0.28);
  band(p, pale, h - 0.5, 6.4, 0.34, 0.5);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, f = new Parts();
    // two belfry lights a face, louvred
    for (const x of [-1.2, 1.2]) {
      f.add(archSlab(1.05, 2.5, 0.1), dark, [x, h - 5.7, 3.2]);
      f.add(archFrame(1.05, 2.5, 0.16, 0.24), pale, [x, h - 5.7, 3.26]);
      if (FINE) for (let i = 0; i < 6; i++) f.add(UNIT, mid, [x, h - 5.5 + i * 0.46, 3.24], [0.6, 0, 0], [1.0, 0.05, 0.3]);
    }
    corbels(f, mid, [-3.2, h - 0.75, 3.4], [3.2, h - 0.75, 3.4], 0.3, 0.64);
    // a tall lancet lower down
    f.add(archSlab(0.8, 3.0, 0.1), GLASS(), [0, h - 15.5, 3.2]);
    f.add(archFrame(0.8, 3.0, 0.14, 0.2), pale, [0, h - 15.5, 3.25]);
    p.sub(f, null, [0, a, 0]);
  }
  p.add(torus(0.98, 0.09, q(20, 12), 5), M.gold(), [3.24, h - 8, 0], [0, HALF, 0]);
  const g = p.build();
  const cf = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.8 }));
  cf.position.set(3.23, h - 8, 0);
  cf.rotation.y = HALF;
  g.add(cf);
  return g;
}

const CROWN = () => M.stone(32, 52, 23);
const CROWN_TRIM = () => dressed(32, 56);

/** A length of the crown's parapet: 0.9 high, centred, long axis along X. */
export function crownParapetModel(len: number, thick: number) {
  return model(`crownparapet|${len}|${thick}`, () => {
    const p = new Parts();
    p.add(sbox(len, 0.42, thick), CROWN(), [0, -0.24, 0]);
    p.add(UNIT, CROWN_TRIM(), [0, -0.01, 0], null, [len + 0.1, 0.08, thick + 0.12]);
    battlements(p, CROWN(), [-len / 2, 0.03, 0], [len / 2, 0.03, 0], { h: 0.42, t: thick * 0.8, w: 0.5, gap: 0.34 });
    return p.build();
  });
}

/** A corner pinnacle of the crown, centred on its 3.2 m collider. */
export function crownPinnacleModel() {
  return model('crownpinnacle', () => {
    const p = new Parts();
    pinnacle(p, CROWN_TRIM(), [0, -1.6, 0], 0.52, 3.9, { tip: M.gold() });
    return p.build();
  });
}

/**
 * One of the crown's flying ribs: `len` long up its own Y axis, arched upwards. `hx, hz` is the
 * level direction it leans (towards the lantern), so the crockets go on the outside of the curve.
 */
export function crownRibModel(len: number, hx: number, hz: number) {
  const p = new Parts();
  const bow = len * 0.07;
  const rings = [];
  for (let i = 0; i <= 6; i++) {
    const f = i / 6, k = Math.sin(f * Math.PI) * bow;
    rings.push({ t: (f - 0.5) * len, w: 0.17, x: -hx * k, z: -hz * k, n: 6 });
  }
  p.add(loft(rings, { seg: 8, crease: 50 }), CROWN());
  const n = FINE ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.7) / (n + 0.4), k = Math.sin(f * Math.PI) * bow + 0.22;
    p.add(OCTA, CROWN_TRIM(), [-hx * k, (f - 0.5) * len, -hz * k], null, [0.11, 0.16, 0.11]);
  }
  return p.build();
}

/** The open lantern where the ribs meet: eight-sided, 2 m tall, centred. */
export function crownLanternModel() {
  return model('crownlantern', () => {
    const p = new Parts();
    const stone = CROWN_TRIM(), o8: V3 = [0, Math.PI / 8, 0];
    p.add(lathe([[0.76, -1.0], [0.76, -0.8], [0.66, -0.72]], 8, { cap: 'none', crease: 30 }), stone, null, o8);
    p.add(lathe([[0.5, -0.72], [0.5, 0.66]], 8, { cap: 'none', crease: 30 }), DARK(), null, o8);
    p.add(lathe([[0.66, 0.6], [0.78, 0.74], [0.78, 0.92], [0.6, 1.0], [0.0001, 1.0]], 8, { cap: 'none', crease: 30 }), stone, null, o8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.add(UNIT, stone, [Math.cos(a) * 0.63, -0.06, Math.sin(a) * 0.63], [0, -a, 0], [0.16, 1.36, 0.16]);
      if (FINE) p.add(archFrame(0.3, 0.9, 0.05, 0.08), stone, [Math.cos(a + Math.PI / 8) * 0.6, -0.72, Math.sin(a + Math.PI / 8) * 0.6], [0, HALF - a - Math.PI / 8, 0]);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      pinnacle(p, stone, [Math.cos(a) * 0.72, 0.9, Math.sin(a) * 0.72], 0.16, 0.8, { plain: true });
    }
    return p.build();
  });
}

/** The spirelet on top, with its gilt orb and weathercock. 3.2 m of stone, centred. */
export function crownSpireModel() {
  return model('crownspire', () => {
    const p = new Parts();
    const stone = CROWN_TRIM(), gold = M.gold(), o8: V3 = [0, Math.PI / 8, 0];
    p.add(lathe([[0.56, -1.6], [0.6, -1.5], [0.5, -1.42], [0.06, 1.55], [0.0001, 1.6]], 8, { cap: 'none', crease: 30 }), stone, null, o8);
    if (FINE) for (let k = 0; k < 4; k++) for (let i = 1; i <= 4; i++) {
      const a = (k * Math.PI) / 2 + Math.PI / 8, f = i / 5, r = 0.5 * (1 - f) + 0.08;
      p.add(OCTA, stone, [Math.cos(a) * r, -1.42 + f * 2.97, Math.sin(a) * r], [0, -a, 0], [0.08, 0.12, 0.08]);
    }
    p.add(ball(0.17, q(10, 6)), gold, [0, 1.72, 0]);
    p.add(cyl(0.02, 0.02, 0.7, 5), gold, [0, 2.1, 0]);
    // the cockerel: comb, breast, a fan of tail
    p.add(extrude([[0.3, 0.02], [0.36, 0.12], [0.3, 0.2], [0.27, 0.3], [0.2, 0.26], [0.16, 0.14], [0.02, 0.1], [-0.12, 0.2], [-0.3, 0.36], [-0.34, 0.2], [-0.26, 0.04], [-0.1, -0.08], [0.12, -0.1], [0.24, -0.04]], 0.04), gold, [0, 2.3, 0]);
    p.add(UNIT, gold, [0, 2.0, 0], null, [0.5, 0.025, 0.025]);
    return p.build();
  });
}

// =====================================================================
// The Scott Monument
// =====================================================================
/** A 61-metre gothic rocket: four buttressed legs, a vaulted canopy, four dwindling stages and a spire. */
export function scottMonumentModel() {
  return model('scott', () => {
    const p = new Parts();
    const body = M.stone(28, 22, 61), trim = dressed(28, 27), deep = dressed(28, 17), dark = color(0x050506, 0.95);
    // the stepped platform
    [[16.4, 0.25], [15.0, 0.75], [13.6, 1.25]].forEach(([w, y]) => p.add(sbox(w, 0.5, w), body, [0, y, 0]));
    const Y0 = 1.5;
    // the four legs: clustered piers with angle buttresses, each carrying a great pinnacle
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new Parts();
      leg.add(sbox(2.6, 19.5, 2.6), body, [0, Y0 + 9.75, 0]);
      leg.add(buttress(1.0, 1.3, 15.5, 3), body, [1.3, Y0, 0]);
      leg.add(buttress(1.0, 1.3, 15.5, 3), body, [0, Y0, 1.3], [0, -HALF, 0]);
      for (const y of [7, 13.5]) band(leg, trim, y, 2.6, 0.14, 0.24);
      band(leg, trim, 20.5, 2.6, 0.26, 0.5);
      pinnacle(leg, trim, [0, 21, 0], 1.9, 9.5);
      for (const [x, z] of [[1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25]]) pinnacle(leg, trim, [x, 21, z], 0.5, 3.4, { plain: !FINE });
      pinnacle(leg, trim, [1.75, Y0 + 14.6, 0], 0.5, 2.6, { plain: true });
      pinnacle(leg, trim, [0, Y0 + 14.6, 1.75], 0.5, 2.6, { plain: true });
      p.sub(leg, [sx * 5, 0, sz * 5], null, [sx, 1, sz]);
    }
    // between the legs: a great pointed arch under a crocketed gable, and a gallery parapet
    for (let k = 0; k < 4; k++) {
      const f = new Parts();
      f.add(archWall(7.4, 21, 1.2, 6.0, 8.5), body, [0, Y0, 5]);
      f.add(archFrame(6.0, 8.5, 0.42, 0.3), trim, [0, Y0, 5.62]);
      if (FINE) f.add(archFrame(6.9, 8.5, 0.16, 0.2), deep, [0, Y0, 5.64]);
      f.add(extrude([[-3.9, 0], [0, 9.8], [3.9, 0], [3.4, 0], [0, 8.6], [-3.4, 0]], 0.36), trim, [0, Y0 + 9.8, 5.66]);
      if (FINE) for (const sx of [-1, 1]) for (let i = 1; i <= 6; i++) f.add(OCTA, trim, [sx * 3.8 * (1 - i / 7), Y0 + 10 + 9.7 * (i / 7), 5.7], null, [0.2, 0.3, 0.2]);
      pinnacle(f, trim, [0, Y0 + 19.4, 5.66], 0.5, 2.8, { plain: true });
      f.add(archSlab(0.8, 1.5, 0.08), dark, [0, Y0 + 14.6, 5.62]);
      f.add(archFrame(0.8, 1.5, 0.1, 0.16), trim, [0, Y0 + 14.6, 5.66]);
      battlements(f, body, [-3.7, Y0 + 21, 5.2], [3.7, Y0 + 21, 5.2], { h: 0.5, base: 0.6, t: 0.4, w: 0.55, gap: 0.4 });
      p.sub(f, null, [0, (k * Math.PI) / 2, 0]);
    }
    // the vault over Sir Walter
    p.add(sbox(10, 1, 10), body, [0, Y0 + 20.5, 0]);
    if (FINE) for (const a of [Math.PI / 4, -Math.PI / 4]) p.add(pipe([[-5, Y0 + 12, 0], [-2.6, Y0 + 18.2, 0], [0, Y0 + 20, 0], [2.6, Y0 + 18.2, 0], [5, Y0 + 12, 0]], 0.22, { curve: true, seg: 4, steps: 4 }), deep, null, [0, a, 0], [1.3, 1, 1]);
    // the stages of the tower, each with its openings, gallery and pinnacles
    const stages: [number, number, number, number][] = [[7.2, 22.5, 9, 2], [5.4, 31.5, 8.5, 1], [3.9, 40, 7.5, 1]]; // width, foot, height, lights
    stages.forEach(([w, y, h, n], si) => {
      const holes: [number, number, number, number][] = [];
      const ow = n === 2 ? w * 0.26 : w * 0.42;
      if (n === 2) holes.push([-w * 0.22, h * 0.14, ow, h * 0.46], [w * 0.22, h * 0.14, ow, h * 0.46]);
      else holes.push([0, h * 0.14, ow, h * 0.48]);
      for (let k = 0; k < 4; k++) {
        const f = new Parts();
        f.add(pierced(w, h, 0.5, holes), body, [0, y, w / 2 - 0.25]);
        for (const [hx, hy, hw, hs] of holes) {
          f.add(archFrame(hw, hs, w * 0.03, 0.2), trim, [hx, y + hy, w / 2 + 0.06]);
          f.add(UNIT, trim, [hx, y + hy + hs * 0.6, w / 2 - 0.1], null, [w * 0.022, hs * 1.3, 0.2]);
        }
        f.add(extrude([[-w * 0.36, 0], [0, w * 0.34], [w * 0.36, 0], [w * 0.3, 0], [0, w * 0.26], [-w * 0.3, 0]], 0.2), trim, [0, y + h * 0.72, w / 2 + 0.08]);
        battlements(f, body, [-w / 2 - 0.3, y + h, w / 2 + 0.3], [w / 2 + 0.3, y + h, w / 2 + 0.3], { h: 0.4, base: 0.5, t: 0.3, w: 0.45, gap: 0.32 });
        f.add(moulding(w + 0.9, 0.42, 0.5), trim, [0, y + h - 0.5, w / 2], [0, -HALF, 0]);
        p.sub(f, null, [0, (k * Math.PI) / 2, 0]);
      }
      p.add(UNIT, dark, [0, y + h / 2, 0], null, [w - 1.1, h, w - 1.1]);
      p.add(sbox(w + 0.6, 0.4, w + 0.6), body, [0, y + h - 0.2, 0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        // corner shafts, a pinnacle on each gallery corner, a flying rib up to the next stage
        p.add(sbox(w * 0.16, h, w * 0.16), body, [sx * w * 0.47, y + h / 2, sz * w * 0.47]);
        const pw = w * 0.13 + 0.25, ph = h * 0.5 + 1;
        pinnacle(p, trim, [sx * (w / 2 + 0.1), y + h + 0.4, sz * (w / 2 + 0.1)], pw, ph, { plain: !FINE && si > 0 });
        const nw = si < 2 ? stages[si + 1][0] : 3.0;
        const a: V3 = [sx * (w / 2 + 0.1), y + h + ph * 0.5, sz * (w / 2 + 0.1)], b: V3 = [sx * nw * 0.5, y + h + ph * 0.5 + (w - nw) * 0.9, sz * nw * 0.5];
        if (FINE || si === 0) p.add(pipe([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.5, (a[2] + b[2]) / 2], b], w * 0.03 + 0.06, { curve: true, seg: 4, steps: 3 }), deep);
      }
    });
    // flying buttresses from the legs' pinnacles in to the first stage
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.add(pipe([[sx * 4.6, 25, sz * 4.6], [sx * 4.0, 28.4, sz * 4.0], [sx * 3.5, 30.6, sz * 3.5]], 0.3, { curve: true, seg: 4, steps: 4 }), deep);
    }
    // the eight-sided lantern and the spire
    const o8: V3 = [0, Math.PI / 8, 0];
    p.add(lathe([[1.75, 47.5], [1.75, 52.6], [2.0, 52.9], [2.0, 53.3]], 8, { cap: 'none', crease: 30, uv: [2, 0.7] }), body, null, o8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.add(archSlab(0.5, 2.4, 0.08), dark, [Math.sin(a) * 1.63, 48.6, Math.cos(a) * 1.63], [0, a, 0]);
      pinnacle(p, trim, [Math.sin(a + Math.PI / 8) * 2.05, 47.5, Math.cos(a + Math.PI / 8) * 2.05], 0.34, 3.4, { plain: true });
    }
    p.add(lathe([[1.9, 53.3], [1.5, 53.8], [0.12, 61.2], [0.0001, 61.4]], 8, { cap: 'none', crease: 30 }), trim, null, o8);
    if (FINE) for (let k = 0; k < 8; k++) for (let i = 1; i <= 5; i++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8, f = i / 6, r = 1.5 * (1 - f) + 0.16;
      p.add(OCTA, trim, [Math.cos(a) * r, 53.8 + f * 7.4, Math.sin(a) * r], [0, -a, 0], [0.16, 0.24, 0.16]);
    }
    p.add(OCTA, trim, [0, 61.6, 0], null, [0.3, 0.5, 0.3]);
    // Sir Walter in white marble, seated, with Maida at his side
    const marble = color(0xf2efe8, 0.42), plinth = dressed(36, 60);
    p.add(rbox(3.0, 1.5, 3.0, 0.06, 1), plinth, [0, Y0 + 0.75, 0]);
    p.add(rbox(3.3, 0.24, 3.3, 0.05, 1), plinth, [0, Y0 + 1.5, 0]);
    p.add(rbox(1.5, 0.8, 1.5, 0.2, FINE ? 2 : 1), marble, [-0.3, Y0 + 2.0, 0]);
    const dog = new Parts();
    dog.add(loft([{ t: -0.55, w: 0.16, d: 0.15 }, { t: -0.3, w: 0.24, d: 0.22 }, { t: 0.25, w: 0.22, d: 0.2 }, { t: 0.5, w: 0.15, d: 0.16 }], { axis: 'x', seg: q(10, 6), sub: 1, cap: 'round' }), marble, [0, 0.22, 0]);
    dog.add(loft([{ t: 0, w: 0.12, d: 0.13 }, { t: 0.22, w: 0.1, d: 0.11 }, { t: 0.42, w: 0.06, d: 0.07 }], { axis: 'x', seg: q(8, 5), cap: 'round' }), marble, [0.5, 0.42, 0], [0, 0, 0.5]);
    for (const z of [-0.14, 0.14]) dog.add(loft([{ t: 0, w: 0.06 }, { t: 0.5, w: 0.045 }], { axis: 'x', seg: 5, cap: 'round' }), marble, [0.35, 0.06, z]);
    p.sub(dog, [0.5, Y0 + 1.62, -1.0], null, 1.5);
    const g = p.build();
    const scott = statue(cast(marble, 3.3, { build: 1.15 }), (r) => {
      r.hipL.rotation.set(-0.15, 0, 1.55);
      r.hipR.rotation.set(0.15, 0, 1.55);
      r.kneeL.rotation.set(0, 0, -1.5);
      r.kneeR.rotation.set(0, 0, -1.4);
      r.shoulderL.rotation.set(-0.2, 0, 0.5);
      r.elbowL.rotation.z = 1.1;
      r.shoulderR.rotation.set(0.25, 0, 0.6);
      r.elbowR.rotation.z = 0.9;
      r.head.rotation.z = -0.1;
    });
    scott.position.set(-0.35, Y0 + 2.5 - 1.79, 0);
    g.add(scott);
    return g;
  });
}
