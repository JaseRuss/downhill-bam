import * as THREE from 'three';
import { RAPIER } from '../core/Physics';
import { G } from '../ctx';
import { addStatic } from '../world/Batcher';
import { M, color, mapMat } from '../art/Materials';
import { clockTex, heartTex, saltireTex, signTex, stainedGlassTex, checkerTex } from '../art/Textures';
import { H, HALF_STREET, START_S, FINISH_S, baseH, theta, toWorld, toWorldAbs, roadGroup, right, forward } from '../world/Road';
import { staticBox, tenement } from './Buildings';
import { barrel, barrier, hatCone, haggis, scaffold, yawQ, aBoard, communalBin, lampPost, bollard, bench, cone as coneProp } from '../props/Props';
import type { Part } from '../destruction/Destruction';
import { buildHuman } from '../art/Humanoid';
import { cyl as mcyl, lathe, loft, model, Parts, q as mq, rbox } from '../art/Model';
import * as LM from '../art/Landmarks';

// ---------- helpers ----------
function bx(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat as any);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cone(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const add = (o: THREE.Object3D) => addStatic(o);
const q = (s: number, extra = 0) => yawQ(theta(s) + extra);
const once = (fn: () => void) => {
  let done = false;
  return () => {
    if (!done) {
      done = true;
      fn();
    }
  };
};
/** Banner of crenellations along the top of a wall in a group. */
function crenellate(g: THREE.Group, x: number, y: number, z0: number, z1: number, depth: number, mat: THREE.Material, alongX = false) {
  for (let z = z0; z < z1; z += 1.2) {
    const m = alongX ? bx(0.7, 0.8, depth, mat, z + 0.35, y, x) : bx(depth, 0.8, 0.7, mat, x, y, z + 0.35);
    g.add(m);
  }
}

/** A static ramp from (sA, ground) up to (sB, ground + rise). */
export function staticRamp(sA: number, sB: number, u0: number, u1: number, rise: number, mat: THREE.Material) {
  const um = (u0 + u1) / 2, hw = Math.abs(u1 - u0) / 2;
  const yA = H(sA, um), yB = H(sB, um) + rise;
  const len = Math.hypot(sB - sA, yB - yA);
  const phi = Math.atan2(yB - yA, sB - sA);
  const th = 0.25;
  const sm = (sA + sB) / 2;
  const center = toWorld(sm, um, 0);
  center.y = (yA + yB) / 2 - (th / 2) * Math.cos(phi);
  const quat = yawQ(theta(sm)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -phi));
  const body = G.physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }),
  );
  G.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(hw, th / 2, len / 2).setFriction(0.6), body);
  const m = bx(hw * 2, th, len, mat);
  m.position.copy(center);
  m.quaternion.copy(quat);
  add(m);
  return m;
}

/**
 * A builder's-plank kicker ramp (planks on beer crates) whose lip ends at sEnd, for set pieces
 * you need to get airborne for. Chevron side boards and a sign make it obvious.
 */
export function kicker(sEnd: number, u: number, len: number, height: number, signText: string[]) {
  const hw = 0.95;
  staticRamp(sEnd - len, sEnd, u - hw, u + hw, height, M.planks());
  const chev = M.stripes('#f2c14e', '#161616');
  const top = H(sEnd, u) + height;
  // chevron boards along both sides, following the slope
  const yA = H(sEnd - len, u), phi = Math.atan2(top - yA, len);
  for (const side of [-1, 1]) {
    const g = roadGroup(sEnd - len / 2, u + side * (hw + 0.03), 0);
    g.position.y = (yA + top) / 2 - 0.12;
    const b = bx(0.05, 0.22, Math.hypot(len, top - yA), chev);
    b.rotation.x = -phi;
    g.add(b);
    add(g);
  }
  // beer crates holding up the high end
  const cg = roadGroup(sEnd - 0.35, u, 0);
  for (const x of [-0.55, 0, 0.55]) {
    const n = Math.max(1, Math.floor(height / 0.3));
    for (let k = 0; k < n; k++) cg.add(bx(0.5, 0.28, 0.4, color(k % 2 ? 0x2b6a3a : 0xb22222, 0.7), x, 0.14 + k * 0.3, 0));
  }
  add(cg);
  // the sign: a board on a post beside the run-up
  const sg = roadGroup(sEnd - len - 1.5, u + (u >= 0 ? -1.6 : 1.6), 0);
  sg.add(cyl(0.04, 0.04, 1.6, M.wood(28, 30, 2), 0, 0.8, 0, 8));
  const face = mapMat(signTex(signText, '#f2c14e', '#161616', 256, 160));
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), [M.wood(28, 30, 2), M.wood(28, 30, 2), M.wood(28, 30, 2), M.wood(28, 30, 2), M.wood(28, 30, 2), face]);
  board.position.y = 1.65;
  board.rotation.y = Math.PI; // face uphill, towards the player
  sg.add(board);
  add(sg);
  staticBox(sEnd - len - 1.5, u + (u >= 0 ? -1.6 : 1.6), H(sEnd - len - 1.5, u) + 0.8, 0.05, 0.8, 0.05);
}

// =====================================================================
// 0. Castle Esplanade: gatehouse, cannon (the launcher itself is the Big Boot, see Boot.ts)
// =====================================================================
/** `castle: false` leaves out the rock and keep behind the gatehouse (the long course builds its own). */
export function castleEsplanade(opts: { castle?: boolean } = {}) {
  const stone = M.stone(34, 46, 11, 4, 2);
  const dark = M.stone(30, 34, 12, 2, 2);
  // parapet walls along the esplanade
  for (const side of [-1, 1]) {
    const g = roadGroup(-28, side * 8.6, 0);
    g.add(LM.esplanadeWallModel(48));
    add(g);
    staticBox(-28, side * 8.6, baseH(-28) + 0.6, 0.4, 1.2, 24);
  }
  // gatehouse across the top of the esplanade
  const s0 = -50;
  const g = roadGroup(s0, 0, 0);
  g.position.y = baseH(s0) - 0.5;
  g.add(LM.gatehouseModel());
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9), new THREE.MeshStandardMaterial({ map: saltireTex(), side: THREE.DoubleSide }));
  const flagGroup = roadGroup(s0, 0, 0);
  flagGroup.position.y = baseH(s0) - 0.5;
  flag.position.set(1.55, 20, -1);
  flagGroup.add(flag);
  G.scene.add(flagGroup);
  // castle rock & keep looming behind
  if (opts.castle !== false) {
    const dark = color(0x5a554d, 0.95);
    for (const [i, x, y, z, sx, sy, sz, yaw] of [[0, 0, -6, -32, 46, 23, 29, 0], [1, -26, -9, -30, 26, 20, 24, 1.1], [2, 27, -10, -34, 24, 19, 22, 2.3]]) {
      const c = LM.cragModel(i, sx, sy, sz, yaw, dark);
      c.position.set(x, y, z);
      g.add(c);
    }
    g.add(LM.castleKeepModel());
  }
  add(g);
  staticBox(s0, 0, baseH(s0) + 6, 15, 7, 2);
  G.updaters.push((dt) => {
    flag.rotation.y = Math.sin(performance.now() / 500) * 0.15;
  });

  // One O'Clock Gun
  const cg = roadGroup(-30, -6.6, 0);
  cg.add(LM.gunModel());
  cg.rotation.y += -0.5;
  add(cg);
  staticBox(-30, -6.6, baseH(-30) + 0.6, 0.6, 0.6, 1.0);

  // MILE START banner
  const bg = roadGroup(-4, 0, 0);
  for (const x of [-7.3, 7.3]) {
    const post = LM.postModel(5.5);
    post.position.x = x;
    bg.add(post);
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(14.4, 1.3),
    new THREE.MeshStandardMaterial({ map: signTex(['THE ROYAL MILE · 0.0 MILES · NAE BRAKES'], '#14284a', '#f2c14e', 1024, 128), side: THREE.DoubleSide }),
  );
  banner.position.set(0, 4.8, 0);
  banner.rotation.y = Math.PI;
  bg.add(banner);
  add(bg);
  for (const side of [-1, 1]) staticBox(-4, side * 7.3, baseH(-4) + 2.7, 0.12, 2.7, 0.12);
}

// =====================================================================
// 1. Whisky barrel pyramid
// =====================================================================
export function whiskyPyramid(s: number, u: number) {
  tenement(36, 20, 1, 18, 4242, 'THE AULD SCUNNER WHISKY EXPERIENCE');
  // giant barrel sign over the door
  const sg = roadGroup(46, HALF_STREET - 1.2, 4.5);
  const big = cyl(1.1, 1.1, 1.8, M.barrel(), 0, 0, 0, 18);
  big.rotation.x = Math.PI / 2;
  sg.add(big);
  add(sg);
  const barrels: Part[] = [];
  const rows = 5, gap = 0.7;
  const tops: number[][] = [];
  for (let r = 0; r < rows; r++) {
    tops.push([]);
    const n = rows - r;
    for (let i = 0; i < n; i++) {
      const uu = u + (i - (n - 1) / 2) * gap;
      let base: number;
      if (r === 0) base = H(s, uu) + 0.003;
      else base = Math.max(tops[r - 1][i], tops[r - 1][i + 1]) + 0.004;
      const p = barrel(toWorldAbs(s, uu, base + 0.44, new THREE.Vector3()), theta(s), { retain: 0.9 });
      barrels.push(p);
      tops[r].push(base + 0.88);
    }
  }
  // a few lying about on the pavement
  for (let i = 0; i < 4; i++) barrel(toWorld(s - 6 + i * 1.4, 6.6, 0.45), theta(s));
  let bonus = false;
  G.updaters.push(() => {
    if (bonus) return;
    const n = barrels.filter((b) => b.scored).length;
    if (n >= 8) {
      bonus = true;
      G.scoring.award('BARREL BOWLING!', 1500, toWorld(s, u, 3), true, 'barrels');
      G.commentary.say('barrels', true);
      G.fx.splash(toWorld(s, u, 1), 0xc77a1a, 40);
    }
  });
}

// =====================================================================
// 2. The Piper & the Tartan Tat Emporium
// =====================================================================
function mannequin(s: number, u: number, tartan: 'red' | 'green' | 'blue' | 'dress') {
  // a tailor's dummy on a stand, in a wee pleated kilt
  const g = model(`mannequin|${tartan}`, () => {
    const p = new Parts();
    const linen = color(0xe8e0cf, 0.9), wood = color(0x6b4a2a, 0.6), iron = M.metal();
    p.add(loft([
      { t: 0.06, w: 0.15, d: [0.1, 0.11] }, { t: 0.2, w: 0.13, d: [0.095, 0.09] }, { t: 0.42, w: 0.17, d: [0.12, 0.1] },
      { t: 0.56, w: 0.19, d: [0.1, 0.1] }, { t: 0.63, w: 0.12, d: [0.07, 0.075] }, { t: 0.68, w: 0.05, d: 0.05 },
    ], { seg: mq(16, 8), sub: 1, n: 2.3 }), linen);
    p.add(lathe([[0.05, 0.68], [0.045, 0.74], [0.02, 0.76], [0.03, 0.79], [0.0001, 0.8]], mq(10, 6), { cap: 'none' }), wood);
    const seg = mq(40, 16) & ~1;
    const pleats = (a: number, v: number) => (Math.abs(a > Math.PI ? a - Math.PI * 2 : a) < 0.9 ? 1 : 1 + (Math.round((a / (Math.PI * 2)) * seg) % 2 ? 0.035 : -0.035) * (1 - v * 0.7));
    p.add(loft([{ t: -0.34, w: 0.26, d: [0.2, 0.22] }, { t: -0.1, w: 0.2, d: [0.15, 0.16] }, { t: 0.1, w: 0.155, d: [0.105, 0.115] }], { seg, cap: 'none', uv: [2, 0.5], mod: pleats, crease: 40 }), M.tartan(tartan));
    p.add(loft([{ t: 0.08, w: 0.16, d: [0.11, 0.12] }, { t: 0.115, w: 0.158, d: [0.108, 0.118] }], { seg: mq(16, 8), n: 2.3 }), color(0x1a1410, 0.5));
    p.add(mcyl(0.018, 0.018, 0.62, 6), iron, [0, -0.6, 0]);
    p.add(lathe([[0.22, -0.95], [0.22, -0.93], [0.05, -0.9], [0.03, -0.86]], mq(14, 8), { cap: 'none' }), iron);
    return p.build();
  });
  return G.destruction.add(toWorld(s, u, 0.98), theta(s), [0.2, 0.97, 0.15], {
    visual: g, dynamic: true, density: 60, points: 120, label: 'Mannequin', sound: 'soft', restitution: 0.3,
  });
}

export function piperAndTartan(s: number) {
  // the shop itself
  tenement(s - 8, 18, -1, 16, 777, 'TARTAN TAT EMPORIUM · EVERY CLAN* (*SOME)');
  const panes: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const ss = s - 7 + i * 2;
    panes.push(
      G.destruction.add(toWorld(ss, -6.25, 1.55), theta(ss), [0.02, 1.4, 0.96], {
        mat: M.glass(), glass: true, density: 300, release: 25, fracture: [1, 4, 3], fractureLoad: 25,
        points: 150, label: 'Shop Window', retain: 0.92, shadow: false,
      }),
    );
    if (i < 6) {
      // timber mullions
      G.destruction.add(toWorld(ss + 1, -6.25, 1.55), theta(ss), [0.06, 1.4, 0.05], { mat: M.wood(350, 20, 3), density: 500, release: 30, sound: 'wood' });
    }
    const tartans = ['red', 'green', 'blue', 'dress'] as const;
    if (i % 2 === 0) mannequin(ss + 0.3, -6.8, tartans[i % 4]);
  }
  // canopy over the window display
  const cg = roadGroup(s - 1, -6.6, 3.1);
  cg.add(bx(1.0, 0.08, 14.5, M.stripes('#1b4f9c', '#f4ecd8'), 0, 0, 0));
  add(cg);

  // tartan bolts on a cart
  const cart = G.destruction.add(toWorld(s + 5, -5.6, 0.45), theta(s), [0.45, 0.3, 0.9], {
    mat: M.wood(30, 35, 8), density: 300, release: 30, fracture: [2, 1, 3], fractureLoad: 140, points: 60, label: 'Tartan Cart',
  });
  const names = ['red', 'green', 'blue', 'dress', 'red'] as const;
  for (let i = 0; i < 5; i++) {
    const p = toWorld(s + 4.3 + i * 0.35, -5.6, 0.9);
    G.destruction.add(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, theta(s), Math.PI / 2)), [0.14, 0.42, 0.14], {
      shape: 'cyl', mat: M.tartan(names[i]), dynamic: true, density: 200, points: 40, label: 'Tartan Bolt', sound: 'soft', supports: [cart],
    });
  }

  // the piper, on his plinth, playing since 6am
  const plinthMat = M.stone(34, 58, 3);
  G.destruction.add(toWorld(s + 2, -3.4, 0.3), theta(s), [0.6, 0.3, 0.6], { mat: plinthMat, density: 700, release: 2, sound: 'stone', retain: 0.8 });
  const piper = G.crowd.tourist(s + 2, -3.4, 'piper', 0.62);
  // busking hat with coins
  const hat = roadGroup(s + 2.9, -3.0, 0.05);
  hat.add(cyl(0.2, 0.16, 0.1, M.black()));
  for (let i = 0; i < 6; i++) hat.add(cyl(0.03, 0.03, 0.01, M.gold(), (Math.random() - 0.5) * 0.2, 0.06, (Math.random() - 0.5) * 0.2, 8));
  add(hat);
  return piper;
}

// =====================================================================
// 3. St Giles' Cathedral and its crown spire
// =====================================================================
export function stGiles() {
  const sA = 142, sB = 198;
  const stone = M.stone(28, 40, 21, 6, 2);
  const stoneHi = M.stone(30, 48, 22, 1, 1);
  const towerS = 170, towerU = 15.4, towerH = 24;
  const ground = baseH(sB) - 0.5;
  // nave (one long block, set back behind Parliament Square)
  const ng = roadGroup((sA + sB) / 2, 18.2, 0);
  ng.position.y = ground;
  const len = sB - sA;
  const top = baseH(sA) - ground + 16;
  ng.add(LM.stGilesNaveModel(len, top, towerS - (sA + sB) / 2, -len / 2 + 4, baseH(sA + 4) - ground));
  add(ng);
  staticBox((sA + sB) / 2, 18.2, ground + 10, 6, 10, len / 2);

  // tower
  const tg = roadGroup(towerS, towerU, 0);
  tg.position.y = ground;
  const tH = baseH(towerS) - ground + towerH;
  tg.add(LM.stGilesTowerModel(tH));
  add(tg);
  staticBox(towerS, towerU, ground + tH / 2, 3.2, tH / 2, 3.2);

  // ---- the crown spire (fixed until the scaffolding goes) ----
  const crownBase = baseH(towerS) + towerH;
  const crown: Part[] = [];
  const crownMat = M.stone(32, 52, 23);
  const gold = M.gold();
  const center = toWorldAbs(towerS, towerU, crownBase, new THREE.Vector3());
  const yaw = theta(towerS);
  const qy = yawQ(yaw);
  const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(qy).add(center);
  const copts = { density: 600, release: 9999, points: 120, label: 'Crown Spire', sound: 'stone' as const, fracture: [2, 2, 2] as [number, number, number], fractureLoad: 900, pieceMat: crownMat };
  // parapet
  for (const [x, z, hx, hz] of [[0, 3.0, 3.2, 0.2], [0, -3.0, 3.2, 0.2], [3.0, 0, 0.2, 2.8], [-3.0, 0, 0.2, 2.8]]) {
    const v = new THREE.Group();
    const m = LM.crownParapetModel(Math.max(hx, hz) * 2, 0.4);
    if (hz > hx) m.rotation.y = Math.PI / 2;
    v.add(m);
    crown.push(G.destruction.add(local(x, 0.45, z), qy, [hx, 0.45, hz], { visual: v, ...copts }));
  }
  // corner pinnacles
  for (const [x, z] of [[2.9, 2.9], [-2.9, 2.9], [2.9, -2.9], [-2.9, -2.9]]) {
    crown.push(G.destruction.add(local(x, 2.0, z), qy, [0.28, 1.6, 0.28], { visual: LM.crownPinnacleModel(), ...copts }));
  }
  // flying ribs from the corners to the lantern
  const lanternY = 4.4;
  for (const [x, z] of [[2.7, 2.7], [-2.7, 2.7], [2.7, -2.7], [-2.7, -2.7], [2.9, 0], [-2.9, 0], [0, 2.9], [0, -2.9]]) {
    const a = new THREE.Vector3(x, 1.0, z), b = new THREE.Vector3(0, lanternY, 0);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const rq = qy.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    const hl = Math.hypot(x, z);
    crown.push(G.destruction.add(mid.applyQuaternion(qy).add(center), rq, [0.16, len / 2, 0.16], { visual: LM.crownRibModel(len, -x / hl, -z / hl), ...copts }));
  }
  // lantern + spire + weathercock
  const lantern = G.destruction.add(local(0, lanternY + 1.0, 0), qy, [0.7, 1.0, 0.7], { visual: LM.crownLanternModel(), ...copts, points: 400 });
  crown.push(lantern);
  crown.push(G.destruction.add(local(0, lanternY + 3.6, 0), qy, [0.5, 1.6, 0.5], { visual: LM.crownSpireModel(), ...copts, points: 400 }));

  const fall = once(() => {
    const toStreet = right(towerS).multiplyScalar(-1).add(forward(towerS).multiplyScalar(0.35)).normalize();
    for (const p of crown) {
      p.opts.onRelease = (pp) => {
        const k = pp.mass * (3.5 + Math.random() * 2.5);
        pp.body.applyImpulse({ x: toStreet.x * k, y: pp.mass * 2, z: toStreet.z * k }, true);
      };
    }
    G.destruction.releaseAll(crown, 0.6);
    G.scoring.award('CROWN JEWEL!', 5000, center.clone(), true, 'spire');
    G.commentary.say('spire', true);
    G.sfx.crunch(1);
    G.sfx.cheer(3);
    G.shake(1.2);
    G.bigMoment(1);
  });

  // scaffolding on the west front: knock out enough poles and the crown comes down
  let knocked = 0;
  scaffold(144, 156, 9.6, 8, {
    onRelease: () => {
      knocked++;
      if (knocked >= 3) fall();
    },
  });
  // works sign
  const ws = roadGroup(141, 8.6, 1.2);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), mapMat(signTex(['RESTORATION WORKS', 'DO NOT TOUCH THE POLES'], '#f2c14e', '#111', 384, 144)));
  sign.rotation.y = Math.PI / 2;
  ws.add(sign);
  add(ws);

  return crown;
}

// =====================================================================
// 3b. Adam Smith, father of economics, on his plinth in Parliament Square
// =====================================================================
export function adamSmith(s: number, u: number) {
  const bronze = color(0x55684f, 0.42, 0.7);
  const granite = M.stone(20, 46, 41);
  const plinthH = 2.4;
  // the figure: a 2.4 m bronze in his academic gown, lecturing, book under his arm
  const rig = buildHuman({
    skin: bronze, shirt: bronze, longSleeves: true, legs: 'robe', legMat: bronze, shoes: bronze,
    hair: bronze, hairStyle: 'short', build: 1.1, height: 2.4,
  });
  rig.shoulderR.rotation.set(0.25, 0, 1.9); // making a point about the division of labour
  rig.elbowR.rotation.z = 0.5;
  rig.shoulderL.rotation.set(-0.15, 0, 0.5);
  rig.elbowL.rotation.z = 1.4;
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.24), bronze);
  book.position.set(0.05, -0.3, 0.05);
  rig.elbowL.add(book);
  rig.head.rotation.z = -0.15;
  const fig = new THREE.Group();
  rig.root.position.y = -1.2; // centred on the part
  fig.add(rig.root);
  // his beehive (it's on the real statue, honest) and a plough
  const hive = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), bronze);
  hive.position.set(-0.35, -1.0, 0.45);
  fig.add(hive);
  const plough = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.08), bronze);
  plough.position.set(-0.2, -1.1, -0.45);
  plough.rotation.z = 0.3;
  fig.add(plough);
  // face the street
  const yaw = theta(s); // figure +X points towards -u (the street)
  const statue = G.destruction.add(toWorld(s, u, plinthH + 1.2), yaw, [0.45, 1.2, 0.45], {
    visual: fig, density: 1100, release: 9999, points: 2000, label: 'Adam Smith', sound: 'metal', fracture: [1, 3, 1], fractureLoad: 600,
  });
  const cone = hatCone(toWorld(s, u, plinthH + 2.4 + 0.35));

  // the granite plinth, with a plaque
  const pg = roadGroup(s, u, 0);
  pg.add(bx(1.6, plinthH, 1.6, granite, 0, plinthH / 2, 0));
  pg.add(bx(1.9, 0.25, 1.9, granite, 0, plinthH - 0.05, 0));
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.7),
    mapMat(signTex(['ADAM SMITH', '1723 – 1790', 'FATHER OF ECONOMICS', 'value subject to market forces'], '#7a5c1e', '#f2dc98', 256, 160, 'Georgia')),
  );
  plaque.position.set(0.81, 1.3, 0); // street side (+X local = -u)
  plaque.rotation.y = Math.PI / 2;
  pg.add(plaque);
  add(pg);

  const topple = once(() => {
    const dir = right(s).multiplyScalar(-1).add(forward(s).multiplyScalar(0.5)).normalize();
    statue.opts.onRelease = (p) => {
      const k = p.mass * 3;
      p.body.applyImpulse({ x: dir.x * k, y: p.mass * 1.5, z: dir.z * k }, true);
      p.body.applyTorqueImpulse({ x: dir.z * p.mass * 2, y: 0, z: -dir.x * p.mass * 2 }, true);
    };
    G.destruction.releaseAll([statue], 0);
    G.scoring.award('MARKET CORRECTION!', 1500, toWorld(s, u, 4), true, 'smith');
    G.commentary.say('smith', true);
    G.sfx.impact(1, 'metal');
    G.bigMoment(0.6);
  });
  // the plinth is solid granite: hitting it knocks the bronze off the top
  G.destruction.add(toWorld(s, u, plinthH / 2), theta(s), [0.8, plinthH / 2, 0.8], {
    visual: new THREE.Group(), density: 2600, hitLoad: 0.02, sound: 'stone',
    onHit: (_p, _l, other) => {
      if (other?.kind === 'trolley' || other?.kind === 'rider') topple();
    },
  });
}

// =====================================================================
// 4. Mercat Cross with its unicorn
// =====================================================================
export function mercatCross(s: number, u: number) {
  const stone = M.stone(36, 54, 31, 3, 1);
  const dg = new THREE.Group();
  const drum = cyl(2.0, 2.0, 2.6, stone, 0, 0, 0, 8);
  dg.add(drum);
  dg.add(cyl(2.15, 2.15, 0.25, M.stone(36, 60, 2), 0, 1.35, 0, 8));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const medal = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), color([0xc4161c, 0x1b4f9c, 0xd8a93a, 0x2b8a3e][i % 4], 0.5));
    medal.position.set(Math.cos(a) * 1.86, 0.3, Math.sin(a) * 1.86);
    medal.lookAt(Math.cos(a) * 5, 0.3, Math.sin(a) * 5);
    dg.add(medal);
  }
  const column: Part[] = [];
  const trigger = once(() => {
    const dir = right(s).multiplyScalar(-Math.sign(u)).add(forward(s).multiplyScalar(0.4)).normalize();
    for (const p of column) {
      p.opts.onRelease = (pp) => {
        const k = pp.mass * 2.5;
        pp.body.applyImpulse({ x: dir.x * k, y: 0, z: dir.z * k }, true);
      };
    }
    G.destruction.releaseAll(column, 0.25);
    G.commentary.say('mercat', true);
    G.sfx.impact(1, 'stone');
  });
  G.destruction.add(toWorld(s, u, 1.3), 0, [2.0, 1.3, 2.0], {
    shape: 'cyl', visual: dg, density: 2000, hitLoad: 0.02, sound: 'stone',
    onHit: (_p, _l, other) => {
      if (other?.kind === 'trolley' || other?.kind === 'rider') trigger();
    },
  });
  let y = 2.6;
  const colMat = M.stone(36, 60, 32);
  for (let i = 0; i < 4; i++) {
    column.push(G.destruction.add(toWorld(s, u, y + 0.85), 0, [0.28, 0.85, 0.28], { shape: 'cyl', mat: colMat, density: 900, release: 9999, sound: 'stone', fracture: [1, 2, 1], fractureLoad: 500 }));
    y += 1.7;
  }
  column.push(G.destruction.add(toWorld(s, u, y + 0.2), theta(s), [0.45, 0.2, 0.45], { mat: M.stone(36, 64, 33), density: 900, release: 9999, sound: 'stone' }));
  y += 0.4;
  // the unicorn, rampant, holding a saltire shield
  const ug = new THREE.Group();
  const white = M.white();
  const body = bx(0.32, 0.38, 0.8, white, 0, 0.1, 0);
  body.rotation.x = -0.9;
  ug.add(body);
  const neck = bx(0.2, 0.5, 0.22, white, 0, 0.55, 0.25);
  neck.rotation.x = 0.3;
  ug.add(neck);
  ug.add(bx(0.22, 0.24, 0.42, white, 0, 0.85, 0.42));
  ug.add(cone(0.04, 0.45, M.gold(), 0, 1.05, 0.62, 8));
  ug.children[ug.children.length - 1].rotation.x = 1.0;
  for (const x of [-0.12, 0.12]) ug.add(bx(0.08, 0.5, 0.08, white, x, -0.35, -0.2));
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.5), [white, white, white, white, mapMat(saltireTex()), white]);
  shield.position.set(0, 0.25, 0.42);
  shield.rotation.y = Math.PI / 2;
  ug.add(shield);
  ug.add(bx(0.06, 0.06, 0.45, M.gold(), 0, 0.88, 0.1)); // golden mane
  const unicorn = G.destruction.add(toWorld(s, u, y + 0.6), q(s, -Math.PI / 2 * Math.sign(u)), [0.3, 0.6, 0.45], {
    visual: ug, density: 400, release: 9999, points: 2500, label: 'Mercat Cross', sound: 'stone',
  });
  column.push(unicorn);
}

// =====================================================================
// 5. Heart of Midlothian
// =====================================================================
export function heartOfMidlothian(s: number, u: number) {
  kicker(s - 5.5, u, 3.0, 0.5, ['RAMP ↑', 'LAND ON', 'THE HEART']);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: heartTex(), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = theta(s) + Math.PI;
  m.position.copy(toWorld(s, u, 0.03));
  m.receiveShadow = true;
  add(m);
  let lastAir = -10, done = false, entered = false;
  const center = toWorld(s, u, 0);
  G.updaters.push(() => {
    if (done || !G.trolley.launched) return;
    const p = G.trolley.position;
    const d = Math.hypot(p.x - center.x, p.z - center.z);
    if (!G.trolley.grounded && d < 6) lastAir = G.time;
    if (d < 2.0) {
      entered = true;
      if (G.trolley.grounded && G.time - lastAir < 0.6) {
        done = true;
        G.scoring.award('SPAT ON THE HEART!', 1500, center.clone().add(new THREE.Vector3(0, 1.5, 0)), true, 'heart');
        G.commentary.say('heart_spit', true);
        G.sfx.cheer(1.5);
      }
    } else if (entered) {
      done = true;
      G.scoring.award('Heart of Midlothian', 250, center.clone().add(new THREE.Vector3(0, 1.5, 0)), true, 'heart');
      G.commentary.say('heart', true);
    }
  });
}

// =====================================================================
// 6. Fringe festival stage
// =====================================================================
export function fringeStage() {
  const s0 = 290, s1 = 300, u0 = -7.3, u1 = -2.2;
  const deckH = 1.1;
  const um = (u0 + u1) / 2;
  const deckMat = M.planks();
  const dg = roadGroup((s0 + s1) / 2, um, 0);
  const deckTop = H(s0, um) + deckH;
  const bottom = H(s1, um) - 0.2;
  dg.position.y = bottom;
  const hh = deckTop - bottom;
  dg.add(bx(u1 - u0, hh, s1 - s0, [M.black(), M.black(), deckMat, M.black(), M.black(), M.black()], 0, hh / 2, 0));
  // skirt with festival posters
  const poster = mapMat(signTex(['FRINGE 2026', '3,412 SHOWS', 'AUDIENCE: 4'], '#e63946', '#fff', 256, 256));
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), poster);
  p1.position.set(-(u1 - u0) / 2 - 0.01, hh - 0.6, 0);
  p1.rotation.y = -Math.PI / 2;
  dg.add(p1);
  add(dg);
  staticBox((s0 + s1) / 2, um, bottom + hh / 2, (u1 - u0) / 2, hh / 2, (s1 - s0) / 2);
  // ramp up onto the stage
  // the ramp's top edge meets the deck exactly (the deck straddles the kerb, so measure both at the ramp's centre line)
  const rampU = (u0 + u1 + 0.3) / 2;
  staticRamp(s0 - 7, s0 + 0.15, u0, u1 + 0.3, deckTop - H(s0 + 0.15, rampU) + 0.02, M.planks());

  const parts: Part[] = [];
  const fopts = { points: 120, label: 'Fringe Stage' };
  // speaker stacks
  const spk = (s: number, u: number, y: number) => {
    const v = new THREE.Group();
    v.add(bx(0.7, 1.0, 0.6, M.black()));
    for (const yy of [-0.2, 0.25]) {
      const cone_ = new THREE.Mesh(new THREE.CircleGeometry(yy < 0 ? 0.24 : 0.12, 16), color(0x333333, 0.4));
      cone_.position.set(0, yy, 0.31);
      v.add(cone_);
    }
    return G.destruction.add(toWorldAbs(s, u, y + 0.5, new THREE.Vector3()), q(s, Math.PI), [0.35, 0.5, 0.3], { visual: v, dynamic: true, density: 150, sound: 'wood', ...fopts });
  };
  for (const [s, u] of [[s0 + 0.6, -6.6], [s1 - 0.6, -6.6], [s1 - 0.6, -2.9]]) {
    const a = spk(s, u, deckTop + 0.01);
    parts.push(a);
    parts.push(spk(s, u, deckTop + 1.02));
  }
  // truss + banner
  const postA = G.destruction.add(toWorldAbs(s0 + 1, -2.5, deckTop + 2, new THREE.Vector3()), 0, [0.1, 2, 0.1], { mat: M.steel(), density: 800, release: 10, sound: 'metal', ...fopts });
  const postB = G.destruction.add(toWorldAbs(s1 - 1, -2.5, deckTop + 2, new THREE.Vector3()), 0, [0.1, 2, 0.1], { mat: M.steel(), density: 800, release: 10, sound: 'metal', ...fopts });
  const beam = G.destruction.add(toWorldAbs((s0 + s1) / 2, -2.5, deckTop + 4.05, new THREE.Vector3()), q((s0 + s1) / 2), [0.12, 0.12, (s1 - s0) / 2 - 0.9], {
    mat: M.steel(), density: 800, release: 30, supports: [postA, postB], sound: 'metal', ...fopts,
  });
  const bv = new THREE.Group();
  const bannerMat = new THREE.MeshStandardMaterial({ map: signTex(['TONIGHT: "OCH AYE THE NOO" — A ONE-MIME SHOW'], '#3d2a5a', '#f2c14e', 1024, 128), side: THREE.DoubleSide });
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.0), bannerMat);
  bp.rotation.y = -Math.PI / 2;
  bv.add(bp);
  parts.push(postA, postB, beam);
  parts.push(G.destruction.add(toWorldAbs((s0 + s1) / 2, -2.48, deckTop + 3.35, new THREE.Vector3()), q((s0 + s1) / 2), [0.03, 0.5, 3.8], {
    visual: bv, density: 100, release: 30, supports: [beam], sound: 'soft', ...fopts,
  }));
  // the star of the show
  G.crowd.tourist((s0 + s1) / 2 + 1, -4.6, 'mime', deckH + 0.05);
  // the audience (and their plastic chairs) just past the stage
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const s = s1 + 3 + r * 1.3, u = -6 + c * 1.3;
    const ch = new THREE.Group();
    ch.add(bx(0.45, 0.05, 0.45, color(0xe63946, 0.6), 0, 0, 0));
    ch.add(bx(0.45, 0.45, 0.05, color(0xe63946, 0.6), 0, 0.25, -0.2));
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) ch.add(bx(0.03, 0.45, 0.03, M.white(), x, -0.24, z));
    G.destruction.add(toWorld(s, u, 0.47), q(s, Math.PI), [0.23, 0.47, 0.23], { visual: ch, dynamic: true, density: 60, points: 30, label: 'Plastic Chair', sound: 'soft' });
  }
  G.crowd.tourist(s1 + 3.2, -4.7);
  G.crowd.tourist(s1 + 4.5, -3.4);
  G.crowd.tourist(s1 + 4.4, -6.0);
  aBoard(s0 - 9, -6.3, 4);
  let bonus = false;
  G.updaters.push(() => {
    if (bonus) return;
    if (parts.filter((p) => p.scored).length >= 4) {
      bonus = true;
      G.scoring.award('FRINGE BENEFIT!', 1500, toWorld((s0 + s1) / 2, um, 3), true, 'fringe');
      G.commentary.say('fringe', true);
      G.sfx.cheer(2);
    }
  });
}

// =====================================================================
// 7. Tron Kirk market
// =====================================================================
function stall(s: number, u: number, kind: 'haggis' | 'scarf' | 'fudge', title: string, stripe: [string, string]) {
  const posts: Part[] = [];
  const qy = q(s);
  const ctr = toWorld(s, u, 0);
  const off = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z).applyQuaternion(qy).add(ctr);
  for (const [x, z] of [[-0.7, -0.9], [0.7, -0.9], [-0.7, 0.9], [0.7, 0.9]]) {
    posts.push(G.destruction.add(off(x, 1.15, z), qy, [0.04, 1.15, 0.04], { shape: 'cyl', mat: M.wood(28, 30, 2), density: 700, release: 12, sound: 'wood', points: 30, label: 'Market Stall' }));
  }
  const canopy = G.destruction.add(off(0, 2.38, 0), qy, [0.85, 0.06, 1.05], {
    mat: M.stripes(stripe[0], stripe[1]), density: 200, release: 40, supports: posts, sound: 'soft', points: 60, label: 'Market Stall',
  });
  const counter = G.destruction.add(off(0, 0.48, 0), qy, [0.62, 0.45, 0.85], {
    mat: M.wood(30, 36, 7), density: 250, release: 25, fracture: [2, 2, 3], fractureLoad: 120, sound: 'wood', points: 80, label: 'Market Stall', retain: 0.85,
  });
  // sign
  const sg = new THREE.Group();
  const sm = mapMat(signTex([title], '#14284a', '#f2c14e', 256, 64));
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), sm);
  sp.rotation.y = u > 0 ? -Math.PI / 2 : Math.PI / 2;
  sg.add(sp);
  G.destruction.add(off(u > 0 ? 0.88 : -0.88, 2.0, 0), qy, [0.02, 0.2, 0.8], { visual: sg, density: 100, release: 20, supports: [canopy], sound: 'wood' });
  const goods: Part[] = [];
  for (let i = 0; i < 6; i++) {
    const p = off((Math.random() - 0.5) * 0.8, 1.06, -0.6 + i * 0.24);
    if (kind === 'haggis') goods.push(haggis(p));
    else if (kind === 'scarf') goods.push(G.destruction.add(p, qy, [0.15, 0.08, 0.1], { mat: M.tartan((['red', 'green', 'blue', 'dress'] as const)[i % 4]), dynamic: true, density: 150, points: 20, label: 'Scarf', sound: 'soft' }));
    else goods.push(G.destruction.add(p, qy, [0.1, 0.06, 0.1], { mat: color([0xf3d9a4, 0xd9a066, 0x7b4a2a][i % 3], 0.6), dynamic: true, density: 400, points: 20, label: 'Fudge', sound: 'soft' }));
  }
  return { posts, canopy, counter, goods };
}

function phoneBox(s: number, u: number) {
  const red = M.red();
  const qy = q(s);
  const ctr = toWorld(s, u, 0);
  const off = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z).applyQuaternion(qy).add(ctr);
  const posts: Part[] = [];
  for (const [x, z] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) {
    posts.push(G.destruction.add(off(x, 1.25, z), qy, [0.06, 1.25, 0.06], { mat: red, density: 2000, release: 30, sound: 'metal', points: 300, label: 'Phone Box', retain: 0.85 }));
  }
  // the roof: a shallow dome over a signboard frieze
  const rv = model('phoneroof', () => {
    const p = new Parts();
    p.add(rbox(1.1, 0.25, 1.1, 0.02), red);
    p.add(rbox(1.18, 0.05, 1.18, 0.02), red, [0, 0.13, 0]);
    p.add(lathe([[0.76, 0.15], [0.72, 0.22], [0.56, 0.31], [0.3, 0.37], [0.0001, 0.39]], 4, { cap: 'none', sub: 1 }), red, null, [0, Math.PI / 4, 0]);
    return p.build();
  });
  const tel = mapMat(signTex(['TELEPHONE'], '#111', '#fff', 256, 48));
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.15), tel);
    const a = (i * Math.PI) / 2;
    p.position.set(Math.sin(a) * 0.56, 0, Math.cos(a) * 0.56);
    p.rotation.y = a;
    rv.add(p);
  }
  G.destruction.add(off(0, 2.62, 0), qy, [0.55, 0.13, 0.55], { visual: rv, density: 400, release: 50, supports: posts, sound: 'metal' });
  // glass on three sides + a door
  for (const [x, z, ry] of [[0, 0.48, 0], [0, -0.48, 0], [0.48, 0, Math.PI / 2], [-0.48, 0, Math.PI / 2]] as [number, number, number][]) {
    const pq = qy.clone().multiply(yawQ(ry));
    G.destruction.add(off(x, 1.25, z), pq, [0.4, 1.05, 0.02], {
      mat: M.glass(), glass: true, density: 300, release: 20, fracture: [3, 5, 1], fractureLoad: 20, points: 80, label: 'Phone Box', retain: 0.92, shadow: false,
    });
    // glazing bars
    const bars = new THREE.Group();
    for (let k = 0; k < 6; k++) bars.add(bx(0.8, 0.03, 0.03, red, 0, -0.9 + k * 0.36, 0));
    bars.position.copy(off(x * 1.04, 1.25, z * 1.04));
    bars.quaternion.copy(pq);
    G.destruction.add(bars.position.clone(), pq, [0.4, 0.9, 0.02], { visual: bars, density: 500, release: 15, supports: posts, sound: 'metal' });
  }
  // the phone inside
  G.destruction.add(off(0, 1.3, 0), qy, [0.12, 0.18, 0.1], { mat: M.black(), dynamic: true, density: 600, sound: 'metal' });
}

export function tronKirk() {
  const sA = 336, sB = 368;
  const stone = M.stone(25, 36, 41, 4, 2);
  const g = roadGroup((sA + sB) / 2, -(HALF_STREET + 6), 0);
  const ground = baseH(sB) - 0.5;
  g.position.y = ground;
  const top = baseH(sA) - ground + 14;
  const len = sB - sA;
  g.add(bx(12, top, len, stone, 0, top / 2, 0));
  const roof = bx(12 / Math.SQRT2, 12 / Math.SQRT2, len, M.slate(), 0, top, 0);
  roof.rotation.z = Math.PI / 4;
  g.add(roof);
  // tall arched windows facing the street (-X local = +u = street for left side)
  for (let z = -len / 2 + 3; z < len / 2 - 2; z += 4) {
    if (Math.abs(z) < 4) continue;
    g.add(bx(0.1, 6, 1.6, color(0x1e2a33, 0.2, 0.4), -6.02, top * 0.55, z));
    g.add(cyl(0.8, 0.8, 0.1, color(0x1e2a33, 0.2, 0.4), -6.02, top * 0.55 + 3, z, 12).rotateZ(Math.PI / 2));
  }
  // tower + steeple + clock
  const tw = new THREE.Group();
  tw.add(bx(5.5, 26, 5.5, stone, 0, 13, 0));
  tw.add(cyl(1.6, 2.6, 6, stone, 0, 29, 0, 8));
  tw.add(cone(1.6, 14, color(0x2f3a45, 0.6, 0.3), 0, 39, 0, 8));
  tw.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.gold()));
  tw.children[3].position.y = 46.2;
  const cf = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), mapMat(clockTex()));
  cf.position.set(-2.78, 21, 0);
  cf.rotation.y = -Math.PI / 2;
  tw.add(cf);
  tw.position.set(-3.25, 0, 0); // flush with the building line
  g.add(tw);
  add(g);
  staticBox((sA + sB) / 2, -(HALF_STREET + 6), ground + top / 2, 6, top / 2, len / 2);
  staticBox((sA + sB) / 2, -10.35, ground + 13, 2.75, 13, 2.75);

  const haggisStall = stall(342, 8.4, 'haggis', 'HAGGIS TO GO · £9', ['#c4161c', '#f4ecd8']);
  stall(350, -5.4, 'scarf', 'CASHMERE (ISH)', ['#1b4f9c', '#f4ecd8']);
  stall(361, 8.4, 'fudge', 'FUDGE · TABLET · REGRET', ['#2b8a3e', '#f4ecd8']);
  phoneBox(351.5, 9.6);
  barrier(346, -1.4, 0);
  barrier(346, 1.4, 0);
  barrier(347.5, 3.7, 0.3);
  // ghost tour
  G.crowd.tourist(357, -3.2, 'ghost');
  G.crowd.group(358.5, -2.4, 4, 1.2);
  let hat = false;
  G.updaters.push(() => {
    if (hat) return;
    if (haggisStall.goods.filter((p) => p.scored).length >= 3) {
      hat = true;
      G.scoring.award('HAGGIS HAT-TRICK!', 1200, toWorld(342, 8.4, 2.5), true, 'haggis');
      G.commentary.say('haggis', true);
    }
  });
}

// =====================================================================
// 8. The World's End: an old city wall across the street
// =====================================================================
export function worldsEnd(s: number) {
  tenement(s - 10, 18, -1, 15, 1513, "THE WORLD'S END · PUB · EST. 1513");
  // pub sign
  const ps = roadGroup(s - 3, -(HALF_STREET + 0.9), 3.6);
  const psm = mapMat(signTex(["THE", "WORLD'S", 'END'], '#1e1e1e', '#e8c45a', 128, 160, 'Georgia'));
  ps.add(bx(1.0, 1.25, 0.06, [M.black(), M.black(), M.black(), M.black(), psm, psm]));
  ps.add(bx(1.6, 0.06, 0.06, M.black(), 0.5, 0.75, 0));
  add(ps);
  const mats = [M.stone(30, 44, 61), M.stone(26, 38, 62), M.stone(34, 50, 63)];
  const bw = 0.6, bh = 0.3, rows = 6;
  const bricks: Part[] = [];
  const half = HALF_STREET - 0.05;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? bw / 2 : 0;
    for (let x = -half - offset; x < half; x += bw) {
      const a = Math.max(x, -half), b = Math.min(x + bw, half);
      const w = b - a;
      if (w < 0.15) continue;
      const uu = (a + b) / 2;
      const ground = H(s, uu);
      bricks.push(
        G.destruction.add(toWorldAbs(s, uu, ground + bh / 2 + r * bh + 0.004 + r * 0.002, new THREE.Vector3()), theta(s), [w / 2 - 0.004, bh / 2, 0.15], {
          mat: mats[(r * 7 + Math.round(x * 3)) % 3], dynamic: true, density: 330, points: 8, label: 'Wall Brick', sound: 'stone', retain: 0.94, friction: 0.8,
        }),
      );
    }
  }
  // brass plaque
  const pl = roadGroup(s - 0.3, 0, 1.2);
  const plm = mapMat(signTex(['FLODDEN WALL 1513', 'PLEASE DO NOT DRIVE INTO'], '#8a6a1a', '#1e1e1e', 256, 96, 'Georgia'));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38), plm);
  plate.rotation.y = Math.PI;
  pl.add(plate);
  add(pl);
  let bonus = false;
  G.updaters.push(() => {
    if (bonus || !G.trolley.launched) return;
    if (G.trolley.roadS > s + 2 && bricks.filter((b) => b.scored).length >= 6) {
      bonus = true;
      G.scoring.award('THROUGH THE WALL!', 1200, G.trolley.position.add(new THREE.Vector3(0, 2, 0)), true, 'wall');
      G.commentary.say('wall', true);
    }
  });
  // remove the plaque once the wall goes (it was stuck to it)
  G.updaters.push(() => {
    if (pl.parent && bricks.filter((b) => b.scored).length > 2) G.scene.remove(pl);
  });
}

// =====================================================================
// 9. Canongate Tolbooth clock
// =====================================================================
export function tolbooth(s: number) {
  const stone = M.stone(32, 42, 71, 3, 2);
  const front = 10.8;
  const g = roadGroup(s, front + 5, 0);
  const ground = baseH(s + 10) - 0.5;
  g.position.y = ground;
  const top = baseH(s - 10) - ground + 12;
  g.add(bx(10, top, 20, stone, 0, top / 2, 0));
  const roof = bx(10 / Math.SQRT2, 10 / Math.SQRT2, 20, M.slate(), 0, top, 0);
  roof.rotation.z = Math.PI / 4;
  g.add(roof);
  // the tower, poking out into the pavement
  const tw = new THREE.Group();
  tw.add(bx(4, 20, 6, stone, 0, 10, 0));
  for (const z of [-2.6, 2.6]) {
    tw.add(cyl(0.9, 0.9, 3, stone, 2.2, 18, z, 12));
    tw.add(cone(1.0, 2.6, M.slate(), 2.2, 20.8, z, 12));
  }
  tw.add(cone(2.2, 7, M.slate(), 0, 23.5, 0, 4));
  for (let k = 0; k < 4; k++) tw.add(bx(0.1, 1.4, 0.8, color(0x1e2a33, 0.2, 0.4), 2.02, 4 + k * 3.5, 0));
  tw.position.set(3.0, 0, -4); // flush with the building line
  g.add(tw);
  add(g);
  staticBox(s, front + 5, ground + top / 2, 5, top / 2, 10);
  // the overhanging clock
  const cs = s - 4, cu = 8.0;
  kicker(cs - 2.9, cu, 2.8, 0.95, ['RAMP ↑', 'CLOCK', 'THE CLOCK']);
  const yC = H(cs, cu) + 3.2;
  const bracket = G.destruction.add(toWorldAbs(cs, (cu + front) / 2, yC + 0.85, new THREE.Vector3()), theta(cs), [(front - cu) / 2, 0.06, 0.06], {
    mat: M.black(), density: 3000, release: 25, sound: 'metal',
  });
  const face = mapMat(clockTex());
  const cv = new THREE.Group();
  cv.add(bx(1.3, 1.3, 0.36, [M.gold(), M.gold(), M.gold(), M.gold(), face, face]));
  cv.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), M.gold()));
  cv.children[1].position.y = 0.8;
  G.destruction.add(toWorldAbs(cs, cu, yC, new THREE.Vector3()), theta(cs), [0.65, 0.65, 0.18], {
    visual: cv, density: 700, release: 3, fracture: [2, 2, 1], fractureLoad: 140, supports: [bracket], points: 2000, label: 'Tolbooth Clock', sound: 'metal',
    onRelease: () => {
      G.commentary.say('clock', true);
      G.sfx.coin(0.5);
      G.sfx.boing();
      G.bigMoment(0.7);
    },
  });
}

// =====================================================================
// 10. Palace of Holyroodhouse: gates, finish, fountain, palace
// =====================================================================
export function holyrood() {
  const sG = 584;
  const stone = M.stone(36, 52, 81, 3, 1);
  // railings and walls along the forecourt
  for (const side of [-1, 1]) {
    const sc = 609;
    const g = roadGroup(sc, side * 8.2, 0);
    g.position.y = baseH(sc) - 0.3;
    g.add(bx(0.6, 2.4, 82, stone, 0, 0.2, 0));
    for (let z = -41; z < 41; z += 0.35) g.add(bx(0.03, 1.6, 0.03, M.black(), 0, 2.2, z));
    g.add(bx(0.05, 0.05, 82, M.black(), 0, 3.0, 0));
    add(g);
    staticBox(sc, side * 8.2, baseH(sc) + 1.2, 0.3, 2.4, 41);
  }
  // gate posts and fixed railings either side of the gates
  const posts: Part[] = [];
  for (const side of [-1, 1]) {
    const v = new THREE.Group();
    v.add(bx(0.9, 3.8, 0.9, stone));
    v.add(bx(1.1, 0.25, 1.1, M.stone(36, 60, 82), 0, 2.0, 0));
    v.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), M.gold()));
    v.children[2].position.y = 2.5;
    posts.push(G.destruction.add(toWorld(sG, side * 3.75, 1.9), theta(sG), [0.45, 1.9, 0.45], { visual: v, density: 2400, sound: 'stone' }));
    const rg = roadGroup(sG, side * 6.1, 0);
    for (let x = -1.8; x <= 1.8; x += 0.2) rg.add(bx(0.03, 2.2, 0.03, M.black(), x, 1.1, 0));
    rg.add(bx(3.9, 0.05, 0.05, M.black(), 0, 2.1, 0));
    rg.add(bx(3.9, 0.05, 0.05, M.black(), 0, 0.3, 0));
    add(rg);
    staticBox(sG, side * 6.1, baseH(sG) + 1.1, 1.95, 1.1, 0.05);
  }
  // the gates themselves: dynamic leaves on hinges
  let opened = 0;
  for (const side of [-1, 1]) {
    const v = new THREE.Group();
    for (let x = -1.55; x <= 1.55; x += 0.16) {
      v.add(bx(0.03, 2.8, 0.03, M.black(), x, 0, 0));
      v.add(cone(0.04, 0.14, M.gold(), x, 1.47, 0, 6));
    }
    for (const y of [-1.2, 0, 1.2]) v.add(bx(3.2, 0.06, 0.05, M.black(), 0, y, 0));
    const crest = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), M.gold());
    crest.position.set(0, 0.6, 0.04);
    v.add(crest);
    const crest2 = crest.clone();
    crest2.position.z = -0.04;
    crest2.rotation.y = Math.PI;
    v.add(crest2);
    const uLeaf = side * 1.66;
    const leaf = G.destruction.add(toWorld(sG, uLeaf, 1.55), theta(sG), [1.6, 1.4, 0.04], {
      visual: v, dynamic: true, density: 70, points: 1500, label: 'Palace Gates', sound: 'metal', hitLoad: 6,
      onHit: () => {
        if (++opened === 1) {
          G.commentary.say('gates', true);
          G.sfx.impact(1, 'metal');
        }
      },
    });
    leaf.body.wakeUp();
    // hinge at the post: leaf local x for u = side*3.26 is -(side*3.26 - uLeaf) = -side*1.6
    const hingeLeaf = { x: -side * 1.6, y: 0, z: 0 };
    const hingePost = { x: -side * -0.49, y: -0.35, z: 0 };
    G.physics.world.createImpulseJoint(RAPIER.JointData.revolute(hingePost, hingeLeaf, { x: 0, y: 1, z: 0 }), posts[side < 0 ? 0 : 1].body, leaf.body, true);
  }
  // finish line + banner
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(HALF_STREET * 2, 0.8), new THREE.MeshStandardMaterial({ map: checkerTex(), polygonOffset: true, polygonOffsetFactor: -2 }));
  (fl.material as THREE.MeshStandardMaterial).map!.repeat.set(4, 1);
  fl.rotation.x = -Math.PI / 2;
  fl.rotation.z = theta(FINISH_S);
  fl.position.copy(toWorld(FINISH_S, 0, 0.03));
  add(fl);
  const bg = roadGroup(FINISH_S, 0, 0);
  for (const x of [-7.2, 7.2]) bg.add(cyl(0.12, 0.14, 6, M.metal(), x, 3, 0));
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.3), new THREE.MeshStandardMaterial({ map: signTex(['FINISH · PALACE OF HOLYROODHOUSE · PLEASE WIPE YOUR FEET'], '#c4161c', '#fff', 1024, 96), side: THREE.DoubleSide }));
  banner.position.y = 5.4;
  banner.rotation.y = Math.PI;
  bg.add(banner);
  add(bg);

  // fountain in the forecourt
  const fs = 614;
  const fg = roadGroup(fs, 0, 0);
  fg.add(cyl(2.6, 2.8, 0.7, stone, 0, 0.35, 0, 8));
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshStandardMaterial({ color: 0x5f8fa8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.6;
  fg.add(water);
  add(fg);
  staticBox(fs, 0, baseH(fs) + 0.35, 2.6, 0.35, 2.6);
  const tier1 = G.destruction.add(toWorld(fs, 0, 1.6), 0, [0.35, 1.0, 0.35], { shape: 'cyl', mat: stone, density: 1200, release: 25, points: 300, label: 'Fountain', sound: 'stone', fracture: [1, 3, 1], fractureLoad: 300 });
  const bowl = G.destruction.add(toWorld(fs, 0, 2.75), 0, [1.2, 0.15, 1.2], { shape: 'cyl', mat: M.stone(36, 60, 83), density: 600, release: 40, supports: [tier1], points: 300, label: 'Fountain', sound: 'stone' });
  const crownV = new THREE.Group();
  crownV.add(cyl(0.3, 0.3, 0.5, M.gold()));
  for (let i = 0; i < 6; i++) crownV.add(cone(0.08, 0.3, M.gold(), Math.cos(i) * 0.25, 0.4, Math.sin(i) * 0.25, 6));
  G.destruction.add(toWorld(fs, 0, 3.2), 0, [0.3, 0.25, 0.3], { shape: 'cyl', visual: crownV, density: 600, release: 20, supports: [bowl], points: 500, label: 'Fountain', sound: 'metal' });

  // the palace
  const ps = 646;
  const pg = roadGroup(ps, 0, 0);
  pg.position.y = baseH(ps) - 0.4;
  pg.add(bx(44, 16, 14, M.stone(36, 50, 84, 6, 2), 0, 8, 7));
  crenellate(pg, 0, 16.4, -22, 22, 0.6, M.stone(36, 50, 85), true);
  for (const x of [-14, 14]) {
    pg.add(cyl(4, 4, 20, M.stone(36, 46, 86, 2, 2), x, 10, 0, 20));
    pg.add(cone(4.6, 6, M.slate(), x, 23, 0, 20));
  }
  // windows
  for (let x = -20; x <= 20; x += 3) {
    if (Math.abs(x) > 10 && Math.abs(x) < 18) continue;
    for (const y of [4, 8.5, 12.5]) pg.add(bx(1.2, 2, 0.2, color(0x2a3540, 0.2, 0.4), x, y, -0.05));
  }
  // entrance with columns
  pg.add(bx(5, 7, 0.4, M.black(), 0, 3.5, -0.1));
  for (const x of [-3, 3]) pg.add(cyl(0.4, 0.4, 7.5, M.stone(36, 62, 87), x, 3.75, -0.6, 12));
  pg.add(cyl(0.08, 0.1, 7, M.white(), 0, 19.5, 6));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9), new THREE.MeshStandardMaterial({ map: saltireTex(), side: THREE.DoubleSide }));
  flag.position.set(1.55, 22, 6);
  pg.add(flag);
  add(pg);
  staticBox(ps, 0, baseH(ps) + 8, 22, 8, 1);
}

// =====================================================================
// generic scatter of bins, posts, signs etc. along the street
// =====================================================================
export function scatter(exclude: [number, number][]) {
  const free = (s: number) => !exclude.some(([a, b]) => s > a && s < b);
  let k = 0;
  for (let s = 10; s < 570; s += 23) {
    for (const side of [-1, 1]) if (free(s + side * 3)) lampPost(s + side * 3, side * 6.9);
  }
  for (let s = 12; s < 570; s += 7 + Math.random() * 6) {
    if (!free(s)) continue;
    const side = Math.random() < 0.5 ? -1 : 1;
    const r = Math.random();
    k++;
    if (r < 0.22) {
      // a pair of bollards at the kerb
      bollard(s, side * 4.95);
      bollard(s + 1.4, side * 4.95);
    } else if (r < 0.36) communalBin(s, side * 6.6);
    else if (r < 0.55) aBoard(s, side * 6.3, k);
    else if (r < 0.65) bench(s, side * 6.8);
    else if (r < 0.75) coneProp(s, (Math.random() - 0.5) * 6);
    else if (r < 0.92) G.crowd.group(s, side * (5.4 + Math.random() * 1.4), 1 + Math.floor(Math.random() * 3), 1.2);
    else G.crowd.tourist(s, (Math.random() - 0.5) * 6);
  }
  for (let s = 20; s < 570; s += 34 + Math.random() * 20) if (free(s)) G.crowd.pigeons(s, (Math.random() - 0.5) * 5, 5 + Math.floor(Math.random() * 5));
}

export { START_S };
export { bx, cyl, cone, once, crenellate };
export { stall, phoneBox };
