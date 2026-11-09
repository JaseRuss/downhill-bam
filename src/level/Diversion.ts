import * as THREE from 'three';
import { RAPIER, Entity } from '../core/Physics';
import { G } from '../ctx';
import { addStatic } from '../world/Batcher';
import { M, color, mapMat } from '../art/Materials';
import { clockTex, signTex, checkerTex, rng } from '../art/Textures';
import { hatMesh } from '../art/Humanoid';
import * as Road from '../world/Road';
import {
  MARKS, JOIN_S, HALF_ROAD, HALF_STREET, baseH, theta, toWorld, toWorldAbs, toRoad, roadGroup, right, forward, edgeL, edgeR, H,
} from '../world/Road';
import { buildStreet, guideWalls, sideStreet, tenement, staticBox, Reserved, StreetStyle } from './Buildings';
import * as SP from './SetPieces';
import { bx, cyl, cone, once, crenellate, stall, staticRamp } from './SetPieces';
import { barrier, bench, bollard, communalBin, lampPost, aBoard, cone as coneProp, scaffold, yawQ } from '../props/Props';
import type { Part } from '../destruction/Destruction';
import { TOUR as RM_TOUR, TourInfo, Level, tourStops } from './RoyalMile';
import { princesGardens, inGardens, GARDEN_START } from './Gardens';
import { skooshCan } from '../props/Pickups';
import { marchers, policeCar, policeBox, arcadeCabinet } from '../props/Homages';
import { shopWindow } from '../art/Interiors';

/**
 * The long course: the Royal Mile is shut, so it's down George IV Bridge and Victoria Street to the
 * Grassmarket, up King's Stables Road and Lothian Road to Princes Street, then Leith Street, Leith
 * Walk, Great Junction Street and Starbank Road, and off the slipway into the Firth of Forth.
 * Each tier opens one more stretch; the road is closed beyond the current finish.
 */

const add = <T extends THREE.Object3D>(o: T) => addStatic(o);
const q = (s: number, extra = 0) => yawQ(theta(s) + extra);
const edge = (s: number, side: number) => (side > 0 ? edgeR(s) : edgeL(s));
let LIMIT = Infinity;
/** Is s on the open part of the course? */
const on = (s: number) => s < LIMIT;

/** Run fn once when the vehicle first passes s. */
function trigger(s: number, fn: () => void) {
  let done = false;
  G.updaters.push(() => {
    if (!done && G.armed && G.trolley.roadS > s) {
      done = true;
      fn();
    }
  });
}

/** Hi-vis and a cap for traffic wardens and workies. */
function dressUp(t: { rig: any }, vest: number, cap: number) {
  const r = t.rig;
  const v = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.165, 0.31, 12), color(vest, 0.6));
  v.position.y = 0.155;
  r.chest.add(v);
  const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.208, 0.2, 0.04, 12), color(0xe8e8e8, 0.2, 0.6));
  strip.position.y = 0.1;
  r.chest.add(strip);
  if (r.hat) r.hat.visible = false;
  const h = hatMesh('cap', color(cap, 0.6));
  if (h) {
    h.position.set(-0.01, 0.118, 0);
    r.head.add(h);
  }
}

// =====================================================================
// helpers: blocked side streets, road-closed walls, finish lines
// =====================================================================

/** A side street off the route, shut with council barriers. `dir` is the world direction it runs. */
function blocked(s: number, side: 1 | -1, name: string, dir?: THREE.Vector3, width = 9) {
  if (!on(s + 6)) return;
  let angle = 90;
  if (dir) {
    const out = right(s).multiplyScalar(side);
    angle = (Math.atan2(dir.dot(out), dir.dot(forward(s))) * 180) / Math.PI;
  }
  sideStreet(s + width / 2, side, name, angle, width, Math.round(s));
  // barriers across the mouth, inside the guide rail so they can be skittled
  const e = edge(s + width / 2, side);
  for (let k = 0; k < 4; k++) barrier(s + 1.4 + k * 2.2, side * (e - 0.5), 0);
  const sg = roadGroup(s + width / 2, side * (e - 0.9), 0);
  sg.add(cyl(0.04, 0.04, 1.3, M.steel(), 0, 0.65, 0, 6));
  const face = mapMat(signTex(['ROAD', 'CLOSED'], '#c4161c', '#fff', 128, 128));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), [M.white(), face, face]);
  disc.rotation.z = Math.PI / 2;
  disc.rotation.y = Math.PI / 2;
  disc.position.y = 1.55;
  sg.add(disc);
  add(sg);
}

function finishLine(s: number, text: string) {
  const w = edgeL(s) + edgeR(s);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.8), new THREE.MeshStandardMaterial({ map: checkerTex(), polygonOffset: true, polygonOffsetFactor: -2 }));
  (fl.material as THREE.MeshStandardMaterial).map!.repeat.set(Math.round(w / 3.6), 1);
  fl.rotation.x = -Math.PI / 2;
  fl.rotation.z = theta(s);
  fl.position.copy(toWorld(s, (edgeR(s) - edgeL(s)) / 2, 0.03));
  add(fl);
  const bg = roadGroup(s, 0, 0);
  for (const u of [-edgeL(s) + 0.4, edgeR(s) - 0.4]) bg.add(cyl(0.12, 0.14, 6, M.metal(), -u, 3, 0));
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.8, 1.3), new THREE.MeshStandardMaterial({ map: signTex([text], '#c4161c', '#fff', 1024, 96), side: THREE.DoubleSide }));
  banner.position.set(-(edgeR(s) - edgeL(s)) / 2, 5.4, 0);
  banner.rotation.y = Math.PI;
  bg.add(banner);
  add(bg);
}

/** End of the open course: cones, barriers and a solid "ROAD CLOSED" hoarding across the street. */
function roadClosed(s: number, next: string) {
  const el = edgeL(s), er = edgeR(s);
  const g = roadGroup(s, 0, 0);
  g.position.y = Math.min(baseH(s - 1), baseH(s + 1)) - 0.3;
  const w = el + er + 1.2;
  const board = mapMat(signTex(['ROAD CLOSED', next], '#f2c14e', '#161616', 1024, 256));
  g.add(bx(w, 3.4, 0.4, [M.planks(), M.planks(), M.planks(), M.planks(), M.planks(), board] as any, -(er - el) / 2, 1.7, 0));
  for (let x = -el; x <= er; x += 2.4) g.add(bx(0.14, 3.6, 0.14, M.steel(), -x, 1.8, -0.3));
  add(g);
  staticBox(s, (er - el) / 2, baseH(s) + 1.7, w / 2, 1.9, 0.3);
  // cones and barriers in front
  for (let u = -el + 1; u < er - 0.5; u += 1.4) coneProp(s - 6, u);
  for (let u = -4; u <= 4; u += 2.3) barrier(s - 3, u);
  // the street carries on beyond, just closed
}

/** Lamp posts, bins, benches, tourists and pigeons along a stretch. */
function scatterAlong(from: number, to: number, exclude: [number, number][], gulls = false) {
  const free = (s: number) => on(s + 2) && !exclude.some(([a, b]) => s > a && s < b);
  let k = 0;
  for (let s = from; s < to; s += 23) {
    for (const side of [-1, 1] as const) {
      const ss = s + side * 3;
      if (free(ss) && !(side > 0 && ss > Road.SEA_S0)) lampPost(ss, side * Math.min(6.9, edge(ss, side) - 0.7));
    }
  }
  for (let s = from + 2; s < to; s += 7 + Math.random() * 7) {
    if (!free(s)) continue;
    const side = Math.random() < 0.5 ? -1 : 1;
    const e = edge(s, side);
    const r = Math.random();
    k++;
    if (r < 0.2) {
      bollard(s, side * 4.95);
      bollard(s + 1.4, side * 4.95);
    } else if (r < 0.33) communalBin(s, side * Math.min(6.6, e - 1));
    else if (r < 0.5) aBoard(s, side * Math.min(6.3, e - 1.3), k);
    else if (r < 0.6) bench(s, side * Math.min(6.8, e - 0.8));
    else if (r < 0.7) coneProp(s, (Math.random() - 0.5) * 6);
    else if (r < 0.9) G.crowd.group(s, side * (5.4 + Math.random() * Math.min(1.4, e - 6.2)), 1 + Math.floor(Math.random() * 3), 1.2);
    else G.crowd.tourist(s, (Math.random() - 0.5) * 6);
  }
  for (let s = from + 10; s < to; s += 36 + Math.random() * 22) if (free(s)) G.crowd.pigeons(s, (Math.random() - 0.5) * 5, 5 + Math.floor(Math.random() * 5), gulls);
}

// =====================================================================
// the castle (it can't sit where the Royal Mile's rock does: King's Stables Road runs under it)
// =====================================================================
function castleHill() {
  const rockMat = color(0x7a7165, 0.95);
  const crag = new THREE.MeshStandardMaterial({ color: 0x7a7165, roughness: 0.95, flatShading: true });
  const stone = M.stone(34, 46, 11, 4, 2);
  const dark = M.stone(30, 34, 12, 2, 2);
  const g = roadGroup(-50, 0, 0);
  g.position.y = baseH(-50) - 0.5;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(30, 1), rockMat);
  rock.scale.set(1.0, 0.8, 0.75);
  rock.position.set(12, -6, -22);
  g.add(rock);
  g.add(bx(26, 14, 14, dark, 10, 12, -26));
  g.add(bx(12, 10, 10, stone, 4, 22, -26));
  g.add(bx(9, 8, 8, stone, 16, 20, -28));
  crenellate(g, -19.5, 19.4, -3, 23, 1, stone, true);
  add(g);

  // the cliff along King's Stables Road: crags rising from the pavement to the castle walls
  const s0 = MARKS.westport + 4, s1 = MARKS.lothian - 2;
  const r = rng(77);
  for (let s = s0; s < s1 && on(s - 10); s += 7) {
    const e = edgeR(s);
    const k = Math.sin(((s - s0) / (s1 - s0)) * Math.PI);
    const R = 7 + r() * 4;
    // crags stretched upwards only (spun about the vertical, so they never bulge into the street)
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(R, 1), crag);
    const p = toWorld(s, e + R * 1.05, 0);
    m.position.set(p.x, baseH(s) - 2 + R * (0.3 + k * 0.9), p.z);
    m.scale.set(1, 1.3 + k * 1.6, 1);
    m.rotation.y = r() * 3;
    add(m);
    // a higher tier of rock behind
    const m2 = new THREE.Mesh(new THREE.DodecahedronGeometry(R * 1.3, 1), crag);
    const p2 = toWorld(s, e + R * 2.2, 0);
    m2.position.set(p2.x, baseH(s) + 6 + k * 16, p2.z);
    m2.scale.set(1, 1.4, 1);
    add(m2);
  }
  // castle curtain wall along the top of the crags
  for (let s = s0 + 20; s < s1 - 10 && on(s - 10); s += 10) {
    const k = Math.sin(((s - s0) / (s1 - s0)) * Math.PI);
    const wg = roadGroup(s, edgeR(s) + 17, 0);
    wg.position.y = baseH(s) + 18 + k * 18;
    wg.add(bx(3, 7, 10.4, stone, 0, 3.5, 0));
    crenellate(wg, 0, 7.4, -5, 5, 3, stone);
    add(wg);
  }
  // low stone wall at the foot of the cliff
  for (let s = s0; s < s1 && on(s); s += 6) {
    const wg = roadGroup(s + 3, edgeR(s + 3) + 0.3, 0);
    wg.add(bx(0.6, 1.2, 6.1, M.stone(30, 40, 4), 0, 0.5, 0));
    add(wg);
  }
}

// =====================================================================
// 1. The diversion at the George IV Bridge junction
// =====================================================================
function diversionJunction() {
  // the Royal Mile carries straight on, shut
  blocked(JOIN_S + 18, -1, 'ROYAL MILE', forward(JOIN_S - 5), 14);
  // yellow diversion signs pointing right
  const yellow = mapMat(signTex(['DIVERSION', '→ → →'], '#f2c14e', '#161616', 256, 160));
  for (const [s, u] of [[96, -5.8], [106, -6.2], [114, -5.6]] as [number, number][]) {
    const g = new THREE.Group();
    g.add(bx(1.3, 0.9, 0.04, [M.black(), M.black(), M.black(), M.black(), M.black(), yellow] as any, 0, 0.35, 0));
    g.add(bx(0.04, 1.2, 0.04, M.steel(), 0, -0.5, 0));
    G.destruction.add(toWorld(s, u, 1.1), theta(s), [0.65, 1.0, 0.1], { visual: g, dynamic: true, density: 60, points: 150, label: 'Diversion Sign', sound: 'metal' });
  }
  // the portaloo, occupied
  const ps = JOIN_S + 13, pu = -5.0;
  const pv = new THREE.Group();
  const blue = color(0x1b4f9c, 0.5);
  pv.add(bx(1.2, 2.3, 1.2, blue));
  pv.add(bx(1.3, 0.12, 1.3, color(0xdddddd, 0.6), 0, 1.2, 0));
  const occ = mapMat(signTex(['OCCUPIED'], '#c4161c', '#fff', 128, 32));
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), occ);
  tag.position.set(0.61, 0.2, 0);
  tag.rotation.y = Math.PI / 2;
  pv.add(tag);
  let tipped = false;
  G.destruction.add(toWorld(ps, pu, 1.16), theta(ps), [0.6, 1.15, 0.6], {
    visual: pv, dynamic: true, density: 55, points: 800, label: 'Portaloo', sound: 'soft',
    onHit: (p) => {
      if (tipped) return;
      tipped = true;
      G.fx.splash(p.mesh.position.clone(), 0x2a6fc9, 30);
      G.commentary.show("Somebody was IN that! The portaloo's away!", 3);
    },
  });
  trigger(JOIN_S - 22, () => G.commentary.say('diversion', true));
}

// =====================================================================
// 2. Victoria Street: painted shopfronts, Victoria Terrace and the broom shop
// =====================================================================
const VIC_TINTS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0x16a085, 0xd35400];
const VIC_NAMES = ['BIBLIOMANIA BOOKS', 'THE CHEESE CAVE', 'MOODY MAGIC CO.', 'OINK HOG ROAST', 'THE BAGPIPE LOFT', 'TARTAN TOFFEE', 'CURIOUS OWL GIFTS', 'THE HAT SHOP'];

function victoriaStreet() {
  const sA = MARKS.victoria + 6, sB = MARKS.westbow - 4;
  // Victoria Terrace: a raised walkway over a row of wee shops on the outside of the bend
  const r = rng(5);
  for (let s = sA; s < sB; s += 6) {
    const e = edgeL(s + 3);
    const tint = VIC_TINTS[Math.floor(r() * VIC_TINTS.length)];
    const g = roadGroup(s + 3, -(e + 2.2), 0);
    g.position.y = baseH(s + 3) - 0.4;
    g.add(bx(4.4, 4.8, 6.2, color(tint, 0.85), 0, 2.4, 0));
    // shop window + name on the street face (+X local = towards the street for the left side)
    const sm = mapMat(signTex([VIC_NAMES[Math.floor(r() * VIC_NAMES.length)]], '#1c1c1c', '#f2c14e', 512, 64));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.6), sm);
    sign.position.set(-2.22, 3.8, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    // a room behind the glass, same interior mapping as every other shopfront
    const win = shopWindow(4.6, 2.0);
    win.position.set(-2.215, 0.6, 0);
    win.rotation.y = -Math.PI / 2; // facing the street (local -x on this side)
    g.add(win);
    // window frame
    g.add(bx(0.06, 2.1, 0.08, color(0x1c1c1c, 0.6), -2.21, 1.6, -2.34));
    g.add(bx(0.06, 2.1, 0.08, color(0x1c1c1c, 0.6), -2.21, 1.6, 2.34));
    g.add(bx(0.06, 0.08, 4.76, color(0x1c1c1c, 0.6), -2.21, 0.58, 0));
    // the terrace deck and railings
    g.add(bx(4.6, 0.3, 6.3, M.stone(36, 58, 3), 0, 4.95, 0));
    for (let z = -3; z < 3; z += 0.5) g.add(bx(0.04, 0.95, 0.04, M.black(), -2.25, 5.55, z));
    g.add(bx(0.06, 0.06, 6.3, M.black(), -2.25, 6.02, 0));
    // the buildings behind the terrace
    g.add(bx(8, 16, 6.3, M.stone(30, 40 + Math.floor(r() * 3) * 5, 3, 1, 2), 6.2, 8, 0));
    add(g);
    staticBox(s + 3, -(e + 2.2), g.position.y + 4.95, 2.3, 0.15, 3.15);
  }
  for (let s = sA + 4; s < sB - 4; s += 9) G.crowd.tourist(s, -(edgeL(s) + 1.4), 'tourist', baseH(s + 3) - 0.4 + 5.12 - H(s, -(edgeL(s) + 1.4)));
  G.crowd.pigeons((sA + sB) / 2, -(edgeL((sA + sB) / 2) + 1.4), 6);

  // the street the wizard films borrowed from: fans in robes waving wands, and influencers
  // posing for selfies (a few of them in the middle of the road, naturally)
  const people = rng(1997);
  const bsAt = MARKS.victoria + 26;
  const wizards: { scored: boolean }[] = [], influencers: { scored: boolean }[] = [];
  const spot = (inRoad: boolean): [number, number] => {
    for (let k = 0; k < 20; k++) {
      const s = sA + 2 + people() * (sB - sA - 4);
      const side = people() < 0.5 ? -1 : 1;
      const u = inRoad ? side * (0.8 + people() * 2.6) : side * (5.3 + people() * Math.min(1.6, edge(s, side) - 6.2));
      if (!inRoad && side > 0 && Math.abs(s - bsAt) < 6) continue; // leave the brooms clear
      return [s, u];
    }
    return [sA + 10, 5.6];
  };
  for (let i = 0; i < 10; i++) {
    const [s, u] = spot(i < 2);
    wizards.push(G.crowd.tourist(s, u, 'wizard', 0, 'Wizard Fan', 150));
  }
  for (let i = 0; i < 8; i++) {
    const [s, u] = spot(i < 3);
    const t = G.crowd.tourist(s, u, 'influencer', 0, 'Influencer', 150);
    // the ones in the road pose with their backs to the shops, phone towards the traffic
    if (Math.abs(u) < 4) {
      const f = forward(s).multiplyScalar(-1);
      t.faceYaw = Math.atan2(-f.z, f.x) + (people() - 0.5) * 0.6;
    }
    influencers.push(t);
  }
  const wandsDown = once(() => {
    G.scoring.award('WANDS DOWN!', 1000, G.trolley.position.add(new THREE.Vector3(0, 2.5, 0)), true, 'wizards');
    G.commentary.show("Five wizards down! Somebody owl the council.", 3.5);
  });
  const viral = once(() => {
    G.scoring.award('GONE VIRAL!', 1000, G.trolley.position.add(new THREE.Vector3(0, 2.5, 0)), true, 'influencers');
    G.commentary.show("Five influencers flattened! That's going viral for all the wrong reasons.", 3.5);
  });
  G.updaters.push(() => {
    if (wizards.filter((w) => w.scored).length >= 5) wandsDown();
    if (influencers.filter((w) => w.scored).length >= 5) viral();
  });

  // the broom shop, with a rack of besoms on the pavement
  const bs = MARKS.victoria + 26;
  tenement(bs - 6, 12, 1, 13, 4711, 'BROOMS & BESOMS · EST. 1692', edgeR(bs), 0x6b3f8a, 9);
  const handle = M.wood(30, 40, 3);
  const bristle = color(0xb88a3a, 0.95);
  let swept = 0;
  const award = once(() => {
    G.scoring.award('BROOM BROOM!', 1200, toWorld(bs, 5, 2.5), true, 'brooms');
    G.commentary.show('Brooms everywhere! Hamish has always wanted tae fly.', 3);
  });
  for (let i = 0; i < 7; i++) {
    const s = bs - 4.2 + i * 1.3;
    const v = new THREE.Group();
    v.add(cyl(0.025, 0.025, 1.5, handle, 0, 0.2, 0, 6));
    v.add(cone(0.16, 0.5, bristle, 0, -0.75, 0, 10));
    v.children[1].rotation.x = Math.PI;
    G.destruction.add(toWorld(s, edgeR(s) - 0.9, 1.05), theta(s), [0.08, 1.0, 0.08], {
      shape: 'cyl', visual: v, dynamic: true, density: 120, points: 120, label: 'Broomstick', sound: 'wood',
      onHit: (p) => {
        if (!(p as any).swept) {
          (p as any).swept = true;
          if (++swept >= 4) award();
        }
      },
    });
  }
}

// =====================================================================
// 3. The Grassmarket: engines on, beer garden, the Covenanters' Memorial
// =====================================================================
function grassmarket() {
  // engine-start gantry over the street
  const es = Road.ENGINE_S;
  const g = roadGroup(es, 0, 0);
  const el = edgeL(es) - 0.5, er = edgeR(es) - 0.5;
  for (const u of [-el, er]) g.add(bx(0.3, 6, 0.3, M.steel(), -u, 3, 0));
  g.add(bx(el + er + 0.6, 0.4, 0.4, M.steel(), -(er - el) / 2, 6, 0));
  const face = mapMat(signTex(['ENGINES ON · IT\'S UPHILL FROM HERE'], '#1b4f9c', '#fff', 1024, 96));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.3), face);
  sign.position.set(-(er - el) / 2, 6.9, -0.25);
  sign.rotation.y = Math.PI;
  g.add(sign);
  add(g);
  for (const u of [-el, er]) staticBox(es, u, baseH(es) + 3, 0.15, 3, 0.15);
  trigger(MARKS.grassmarket - 4, () => G.commentary.say('grassmarket', true));

  // beer garden on the wide south pavement: picnic benches, pints, drinkers
  const bgA = MARKS.grassmarket + 22;
  let spilt = 0;
  const round = once(() => {
    G.scoring.award("ROUND'S ON YOU!", 1500, toWorld(bgA + 10, -8, 2), true, 'pints');
    G.commentary.say('pints', true);
  });
  const glass = new THREE.MeshStandardMaterial({ color: 0xc98a20, roughness: 0.1, transparent: true, opacity: 0.8 });
  const head = color(0xf6f0dc, 0.9);
  for (let i = 0; i < 4; i++) {
    const s = bgA + i * 6;
    const u = -(edgeL(s) - 2.6);
    const tv = new THREE.Group();
    const wood = M.wood(30, 42, 6);
    tv.add(bx(1.0, 0.06, 2.0, wood, 0, 0.36, 0));
    for (const x of [-0.75, 0.75]) tv.add(bx(0.3, 0.05, 2.0, wood, x, 0.0, 0));
    for (const z of [-0.8, 0.8]) tv.add(bx(1.9, 0.05, 0.08, wood, 0, -0.2, z));
    const table = G.destruction.add(toWorld(s, u, 0.4), theta(s), [0.95, 0.38, 1.0], {
      visual: tv, dynamic: true, density: 90, points: 150, label: 'Picnic Bench', sound: 'wood', retain: 0.85,
    });
    void table;
    for (let k = 0; k < 4; k++) {
      const pv = new THREE.Group();
      pv.add(cyl(0.05, 0.045, 0.16, glass, 0, 0, 0, 10));
      pv.add(cyl(0.052, 0.052, 0.03, head, 0, 0.09, 0, 10));
      G.destruction.add(toWorld(s - 0.7 + k * 0.45, u + (k % 2 ? 0.2 : -0.2), 0.88), 0, [0.05, 0.1, 0.05], {
        shape: 'cyl', visual: pv, dynamic: true, density: 400, points: 60, label: 'Pint', glass: true, sound: 'glass',
        onHit: (p) => {
          if (!(p as any).spilt) {
            (p as any).spilt = true;
            G.fx.splash(p.mesh.position.clone(), 0xc98a20, 10);
            if (++spilt >= 6) round();
          }
        },
      });
    }
    G.crowd.tourist(s + 1.2, u - 1.3, 'tourist', 0, 'Drinker Spilled', 150);
  }

  // the Covenanters' Memorial: a round of setts behind railings, a saltire in stone
  const cs = MARKS.grassmarket + 66, cu = edgeR(cs) - 2.2;
  const cg = roadGroup(cs, cu, 0);
  cg.add(cyl(1.9, 1.9, 0.12, M.stone(30, 44, 51), 0, 0.06, 0, 24));
  const saltire = mapMat(signTex(['✕'], '#1b4f9c', '#fff', 64, 64));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), saltire);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.13;
  cg.add(disc);
  add(cg);
  const rails: Part[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const p = toWorld(cs + Math.cos(a) * 1.8, cu + Math.sin(a) * 1.8, 0.5);
    rails.push(G.destruction.add(p, 0, [0.03, 0.5, 0.03], { shape: 'cyl', mat: M.black(), density: 3000, release: 6, points: 60, label: 'Memorial Railing', sound: 'metal', retain: 0.92 }));
  }
  const say = once(() => G.commentary.say('covenanters', true));
  G.destruction.add(toWorld(cs, cu, 0.55), theta(cs), [0.35, 0.45, 0.35], {
    mat: M.stone(30, 50, 52), density: 2400, release: 20, points: 1200, label: 'Covenanters Memorial', sound: 'stone', fracture: [2, 2, 2], fractureLoad: 120,
    onHit: () => say(),
  });
  void rails;
  // a market stall or two on the north side
  stall(MARKS.grassmarket + 40, edgeR(MARKS.grassmarket + 40) - 2.4, 'fudge', 'GRASSMARKET FUDGE', ['#8e2c48', '#f4ecd8']);
  stall(MARKS.grassmarket + 50, edgeR(MARKS.grassmarket + 50) - 2.4, 'scarf', 'CASHMERE (ISH)', ['#1b4f9c', '#f4ecd8']);
}

// =====================================================================
// 4. King's Stables Road: parked cars and a traffic warden
// =====================================================================
function car(s: number, u: number, tint: number, seed: number) {
  const v = new THREE.Group();
  const paint = color(tint, 0.35, 0.4);
  v.add(bx(4.0, 0.7, 1.75, paint, 0, -0.15, 0));
  v.add(bx(2.2, 0.6, 1.6, paint, -0.25, 0.5, 0));
  v.add(bx(2.1, 0.5, 1.62, color(0x2a3540, 0.15, 0.5), -0.25, 0.48, 0));
  for (const x of [-1.3, 1.3]) for (const z of [-0.85, 0.85]) {
    const w = cyl(0.33, 0.33, 0.24, M.black(), x, -0.5, z, 12);
    w.rotation.x = Math.PI / 2;
    v.add(w);
  }
  v.add(bx(0.05, 0.16, 0.4, M.emissive(0xfff2c0, 0.8), 2.0, -0.05, 0.6));
  v.add(bx(0.05, 0.16, 0.4, M.emissive(0xfff2c0, 0.8), 2.0, -0.05, -0.6));
  if (seed % 3 === 0) {
    // a parking ticket on the windscreen, naturally
    v.add(bx(0.02, 0.2, 0.14, color(0xf2c14e, 0.8), 0.86, 0.5, 0.3));
  }
  let honked = false;
  G.destruction.add(toWorld(s, u, 0.85), theta(s) - Math.PI / 2, [2.0, 0.85, 0.88], {
    visual: v, dynamic: true, density: 115, points: 400, label: 'Parked Car', sound: 'metal', restitution: 0.25, friction: 0.9,
    onHit: () => {
      if (honked) return;
      honked = true;
      G.sfx.engineStart('buggy');
      G.commentary.maybe('cars', 0.6);
    },
  });
}

function kingsStables() {
  const tints = [0xb3122e, 0x1b4f9c, 0xdcdcdc, 0x222222, 0x2e7d32, 0xf2c14e];
  let i = 0;
  for (let s = MARKS.ksr + 8; s < MARKS.lothian - 6 && on(s + 3); s += 9 + (i % 3) * 3) {
    if (i % 4 !== 3) car(s, -3.4, tints[i % tints.length], i);
    i++;
  }
  // the warden, ticketing the lot
  const ws = MARKS.ksrbend + 16;
  if (on(ws)) {
    const w = G.crowd.tourist(ws, -(edgeL(ws) - 1.4), 'tourist', 0, 'Traffic Warden', 2500);
    dressUp(w, 0xd8f020, 0x1c1c1c);
    const say = once(() => G.commentary.say('warden', true));
    const orig = w.onForce?.bind(w);
    w.onForce = (f: number, o: any) => {
      orig?.(f, o);
      if (o?.kind === 'trolley' && w.scored) say();
    };
  }
}

// =====================================================================
// 5. The West End: the Caledonian Hotel
// =====================================================================
function caledonian() {
  const s = MARKS.westend + 22;
  if (!on(s)) return;
  // corner turret and dome above the hotel frontage (the frontage itself comes from buildStreet)
  const e = edgeL(s);
  const g = roadGroup(s, -(e + 6), 0);
  g.position.y = baseH(s) - 0.5;
  const red = color(0xa4513b, 0.9);
  g.add(cyl(4.2, 4.2, 26, red, 0, 13, 0, 16));
  g.add(cone(4.8, 7, color(0x3f6b5a, 0.6, 0.4), 0, 29.5, 0, 16));
  g.add(cyl(0.12, 0.12, 4, M.steel(), 0, 34, 0, 6));
  const sm = mapMat(signTex(['THE CALEDONIAN'], '#5a1420', '#f2c14e', 512, 80, 'Georgia'));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), sm);
  sign.position.set(-4.25, 9, 0);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  add(g);
  const d = G.crowd.tourist(s - 5, -(e - 1.2), 'tourist', 0, 'Hotel Doorman', 500);
  dressUp(d, 0x5a1420, 0x111111);
  trigger(MARKS.westend - 6, () => G.commentary.say('caley', true));
}

// =====================================================================
// 6. Princes Street: gardens, tram, Christmas market, big wheel, Scott Monument
// =====================================================================
function scottMonument(s: number, u: number) {
  if (!on(s - 40)) return;
  const black = M.stone(28, 22, 61, 2, 4);
  const g = roadGroup(s, u, 0);
  g.position.y = baseH(s) - 7;
  // four-legged base with arches, then tapering tiers of pinnacles up to a spike
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    g.add(bx(2.4, 20, 2.4, black, x, 10, z));
    g.add(cone(0.7, 5, black, x, 22.5, z, 6));
  }
  g.add(bx(12.4, 3, 12.4, black, 0, 21, 0));
  // Sir Walter, in white marble, sitting under the canopy with his dog
  g.add(bx(1.6, 1.4, 1.6, M.stone(36, 60, 2), 0, 0.7, 0));
  g.add(cyl(0.6, 0.8, 2.4, color(0xf2efe8, 0.6), 0, 2.6, 0, 10));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), color(0xf2efe8, 0.6)));
  g.children[g.children.length - 1].position.y = 4.1;
  let y = 22.5;
  let w = 10;
  for (let k = 0; k < 5; k++) {
    const h = 8 - k;
    g.add(bx(w, h, w, black, 0, y + h / 2, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cone(0.5, 4, black, (x * w) / 2, y + h + 1.5, (z * w) / 2, 6));
    for (let a = 0; a < 4; a++) g.add(bx(1.4, h * 0.6, 0.2, M.black(), Math.sin((a * Math.PI) / 2) * (w / 2 + 0.05), y + h / 2, Math.cos((a * Math.PI) / 2) * (w / 2 + 0.05)));
    y += h;
    w *= 0.72;
  }
  g.add(cone(w * 0.7, 9, black, 0, y + 4.5, 0, 8));
  add(g);
  trigger(s - 30, () => G.commentary.say('scott'));
}

/** The tram: it comes the other way down Princes Street, slowly, inevitably. */
function tram() {
  const sStart = MARKS.princes + 250, sGo = MARKS.princes + 40, sStop = MARKS.princes + 4;
  if (!on(sStart)) return;
  const u = 2.4;
  const world = G.physics.world;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0));
  const ent: Entity & { scored: boolean } = {
    kind: 'tram',
    mass: 40000,
    scored: false,
    onForce: (_f, other) => {
      if (other?.kind === 'trolley' && !ent.scored) {
        ent.scored = true;
        G.scoring.award('TRAM-BOOZLED!', 3000, G.trolley.position.add(new THREE.Vector3(0, 2.5, 0)), true, 'tram');
        G.commentary.say('tram', true);
        G.sfx.impact(1, 'metal');
        G.bigMoment(1);
      }
    },
  };
  const LEN = 9.6, N = 3, GAP = 0.5;
  const vis = new THREE.Group();
  const white = color(0xf2f2ee, 0.35, 0.2), red = color(0xb3122e, 0.4, 0.2), glassM = color(0x1d2630, 0.1, 0.6);
  for (let i = 0; i < N; i++) {
    const z = (i - (N - 1) / 2) * (LEN + GAP);
    const c = new THREE.Group();
    c.add(bx(2.65, 2.7, LEN, white, 0, 1.75, 0));
    c.add(bx(2.67, 0.35, LEN, red, 0, 0.6, 0));
    c.add(bx(2.68, 1.0, LEN - 1.2, glassM, 0, 2.2, 0));
    c.add(bx(2.4, 0.3, LEN - 1, color(0x888888, 0.5), 0, 3.25, 0));
    c.position.z = z;
    vis.add(c);
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.33, 1.6, LEN / 2).setTranslation(0, 1.8, z).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(3000),
      body,
    );
    G.physics.register(col, ent);
  }
  // cab ends and a pantograph
  for (const sgn of [-1, 1]) {
    const nose = bx(2.6, 2.4, 0.9, white, 0, 1.65, sgn * ((N * (LEN + GAP)) / 2 - 0.1));
    vis.add(nose);
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), mapMat(signTex(['NEWHAVEN'], '#111', '#ffb000', 256, 48)));
    dest.position.set(0, 2.95, sgn * ((N * (LEN + GAP)) / 2 + 0.36));
    if (sgn < 0) dest.rotation.y = Math.PI;
    vis.add(dest);
  }
  const pant = bx(0.06, 1.2, 1.4, M.metal(), 0, 4.0, 0);
  pant.rotation.x = 0.5;
  vis.add(pant);
  vis.traverse((o: any) => o.isMesh && (o.castShadow = true));
  vis.visible = false;
  G.scene.add(vis);
  // tracks (both lanes)
  const rail = color(0x6b6b6b, 0.3, 0.8);
  for (let s = MARKS.princes + 2; s < Math.min(MARKS.eastend, LIMIT); s += 6) {
    const g = roadGroup(s + 3, 0, 0);
    for (const uu of [-u, u]) for (const d of [-0.72, 0.72]) g.add(bx(0.08, 0.05, 6.05, rail, -(uu + d), 0.0, 0));
    add(g);
  }
  let s = sStart;
  let moving = false;
  G.updaters.push((dt) => {
    if (!moving) {
      if (G.armed && G.trolley.roadS > sGo) {
        moving = true;
        vis.visible = true;
        G.sfx.whoosh();
      } else return;
    }
    if (s > sStop) s -= dt * 6.5;
    const p = toWorld(s, u, 0);
    const yaw = theta(s) + Math.PI;
    const qq = yawQ(yaw);
    body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    body.setNextKinematicRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w });
    vis.position.copy(p);
    vis.quaternion.copy(qq);
  });
}

/** The Christmas market on the gardens pavement, and the big wheel that breaks loose. */
function christmasMarket() {
  const mA = MARKS.princes + 95;
  if (!on(mA)) return;
  const kinds: ['fudge' | 'scarf' | 'haggis', string, [string, string]][] = [
    ['fudge', 'GLÜHWEIN', ['#8e1c1c', '#f4ecd8']],
    ['scarf', 'WOOLLY HATS', ['#1d5c3a', '#f4ecd8']],
    ['haggis', 'HAGGIS BRATWURST', ['#c4161c', '#f2c14e']],
    ['fudge', 'CHURROS', ['#f2c14e', '#8e1c1c']],
    ['scarf', 'BAUBLES', ['#1b4f9c', '#f4ecd8']],
  ];
  kinds.forEach(([k, name, stripe], i) => {
    const s = mA + i * 8;
    stall(s, edgeR(s) - 2.6, k, name, stripe);
  });
  trigger(mA - 8, () => G.commentary.say('market'));
  for (let i = 0; i < 6; i++) G.crowd.group(mA + 4 + i * 7, edgeR(mA) - 4.5, 2, 1.0);

  // the big wheel: a fixed part held up by two A-frames; knock a leg out and away it rolls
  const ws = mA + 50, wu = edgeR(ws) - 2.2;
  const R = 8.5;
  const rv = new THREE.Group();
  const white = color(0xf2efe8, 0.4, 0.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 8, 48), white);
  ring.rotation.x = Math.PI / 2;
  rv.add(ring);
  const ring2 = ring.clone();
  ring2.scale.setScalar(0.94);
  rv.add(ring2);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, R, 6), white);
    sp.position.set(Math.cos(a) * R * 0.5, 0, Math.sin(a) * R * 0.5);
    sp.rotation.set(0, -a, Math.PI / 2);
    rv.add(sp);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), color(i % 2 ? 0xc4161c : 0x1b4f9c, 0.4));
    pod.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    rv.add(pod);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 16), M.steel());
  rv.add(hub);
  // bulbs round the rim
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), M.emissive(0xffe08a, 2));
    b.position.set(Math.cos(a) * (R + 0.2), 0, Math.sin(a) * (R + 0.2));
    rv.add(b);
  }
  // cylinder axis (local Y) points across the street
  const axis = right(ws);
  const qw = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const legs: Part[] = [];
  for (const d of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const p = toWorld(ws + lean * 2.6, wu + d * 0.95, R / 2 + 0.6);
      const qq = q(ws).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean * 0.3));
      legs.push(G.destruction.add(p, qq, [0.12, R / 2 + 0.7, 0.12], { mat: M.steel(), density: 2500, release: 10, points: 300, label: 'Big Wheel Leg', sound: 'metal', retain: 0.9 }));
    }
  }
  const wheel = G.destruction.add(toWorld(ws, wu, R + 0.9), qw, [R, 0.5, R], {
    shape: 'cyl', visual: rv, density: 30, release: 9999, points: 4000, label: 'Big Wheel', sound: 'metal', supports: legs, restitution: 0.2, friction: 1.0,
    onRelease: (p) => {
      const f = forward(ws);
      const v = 9;
      p.body.setLinvel({ x: f.x * v, y: 0, z: f.z * v }, true);
      const w = right(ws).multiplyScalar(-v / R);
      p.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
      p.body.setAngularDamping(0.05);
      G.commentary.say('wheel', true);
      G.bigMoment(1);
    },
  });
  void wheel;
  // a ticket booth in front, easy to clip
  G.destruction.add(toWorld(ws - 6, wu - 1.6, 1.2), theta(ws), [0.7, 1.2, 0.7], {
    mat: [M.red(), M.red(), M.white(), M.white(), M.red(), M.red()] as any, density: 150, release: 20, fracture: [2, 2, 2], fractureLoad: 60, points: 300, label: 'Ticket Booth', sound: 'wood',
    onHit: () => G.destruction.releaseAll(legs.slice(0, 2), 0.2),
  });
}

// =====================================================================
// 7. The East End: the Balmoral and its clock
// =====================================================================
function balmoral() {
  const s = MARKS.eastend + 6;
  if (!on(s - 20)) return;
  const e = edgeR(s);
  const g = roadGroup(s, e + 12, 0);
  g.position.y = baseH(s) - 0.6;
  const stone = M.stone(34, 50, 71, 3, 3);
  g.add(bx(22, 24, 30, stone, 0, 12, 0));
  crenellate(g, 11, 24.4, -15, 15, 0.6, stone);
  // the clock tower on the corner
  const tg = new THREE.Group();
  tg.position.set(4, 0, -11);
  tg.add(bx(7, 44, 7, stone, 0, 22, 0));
  const face = new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.4 });
  for (let a = 0; a < 4; a++) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), face);
    c.position.set(Math.sin((a * Math.PI) / 2) * 3.52, 38, Math.cos((a * Math.PI) / 2) * 3.52);
    c.rotation.y = (a * Math.PI) / 2;
    tg.add(c);
  }
  tg.add(cyl(3.2, 4.2, 6, stone, 0, 47, 0, 8));
  tg.add(cone(3.0, 9, M.slate(), 0, 54.5, 0, 8));
  tg.add(cyl(0.1, 0.1, 5, M.white(), 0, 61, 0, 6));
  g.add(tg);
  const sm = mapMat(signTex(['THE BALMORAL'], '#14284a', '#f2c14e', 512, 80, 'Georgia'));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.3), sm);
  sign.position.set(11.05, 8, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  add(g);
  trigger(s - 22, () => G.commentary.say('balmoral'));
}

// =====================================================================
// 8. Leith Street: the "Walnut Whip"
// =====================================================================
function walnutWhip() {
  const s = MARKS.leithst + 30;
  if (!on(s)) return;
  const e = edgeR(s);
  const g = roadGroup(s, e + 14, 0);
  g.position.y = baseH(s) - 0.6;
  g.add(bx(26, 14, 36, color(0xcfcac2, 0.6), 0, 7, 0));
  for (let y = 2; y < 14; y += 3) g.add(bx(26.1, 1.2, 36.1, color(0x2a3540, 0.2, 0.5), 0, y, 0));
  // the bronze ribbon, coiled like a certain chocolate
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    const a = t * Math.PI * 2 * 3.2;
    const r = 8 * (1 - t * 0.75);
    pts.push(new THREE.Vector3(Math.cos(a) * r, 14 + t * 26, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 1.3, 6, false), color(0x8a5a2b, 0.35, 0.8));
  ribbon.scale.set(1, 1, 1.15);
  g.add(ribbon);
  add(g);
  trigger(s - 20, () => G.commentary.say('walnut'));
}

// =====================================================================
// 9. Leith Walk: the tram works
// =====================================================================
function digger(s: number, u: number) {
  const v = new THREE.Group();
  const yellow = color(0xf2b01e, 0.45, 0.2);
  v.add(bx(3.2, 0.5, 2.2, M.black(), 0, -0.85, 0));
  v.add(bx(2.6, 1.3, 2.2, yellow, -0.2, 0.05, 0));
  v.add(bx(1.2, 1.2, 1.4, color(0x2a3540, 0.2, 0.5), -0.4, 1.3, 0.3));
  const arm = bx(0.35, 0.35, 3.2, yellow, 1.6, 1.0, 0);
  arm.rotation.set(0, Math.PI / 2, 0.6);
  v.add(arm);
  v.add(bx(0.8, 0.7, 1.1, M.metal(), 2.9, -0.2, 0));
  G.destruction.add(toWorld(s, u, 1.1), theta(s) - Math.PI / 2, [1.6, 1.1, 1.1], {
    visual: v, dynamic: true, density: 180, points: 1500, label: 'Digger', sound: 'metal', restitution: 0.2,
  });
}

/** Which tram-works closure is left out to make room for the derby squabble. */
const DERBY_GAP = 3;

/**
 * Match day on Leith Walk: Hearts fans squaring up to Hibs fans across the whole street. Knock
 * them over; the side with more fans still standing at full time wins.
 */
function derby() {
  const s0 = MARKS.leithwalk + 22 + DERBY_GAP * 44 - 6;
  if (!on(s0 + 30)) return;
  const el = document.getElementById('derby')!;
  el.style.display = 'none';
  el.classList.remove('ft');
  const teams = { hearts: [] as { scored: boolean }[], hibs: [] as { scored: boolean }[] };
  const r = rng(1874);
  const squad = (team: 'hearts' | 'hibs', sA: number, facing: number) => {
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4; k++) {
        const s = sA + row * 1.9 + (r() - 0.5) * 0.7;
        const u = -6.9 + k * 4.6 + (r() - 0.5) * 1.4;
        const t = G.crowd.tourist(s, u, team, 0, team === 'hearts' ? 'Hearts Fan' : 'Hibs Fan', 150);
        const f = forward(s).multiplyScalar(facing);
        t.faceYaw = Math.atan2(-f.z, f.x) + (r() - 0.5) * 0.5;
        teams[team].push(t);
      }
    }
  };
  squad('hearts', s0, 1); // uphill, facing down the Walk
  squad('hibs', s0 + 9.5, -1); // downhill, facing back up
  const n = teams.hearts.length;
  // a flag for each end
  for (const [team, s, u, bg, fg, txt] of [
    ['hearts', s0 - 1, -8.2, '#7a1f3d', '#ffffff', 'JAMBOS'],
    ['hibs', s0 + 16, 8.2, '#0b6b3a', '#ffffff', 'HIBEES'],
  ] as const) {
    void team;
    const g = roadGroup(s, u, 0);
    g.add(cyl(0.03, 0.03, 3.2, M.steel(), 0, 1.6, 0, 6));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ map: signTex([txt], bg, fg, 256, 160), side: THREE.DoubleSide }));
    flag.position.set(0, 2.7, 0.8);
    flag.rotation.y = Math.PI / 2;
    g.add(flag);
    add(g);
  }

  const down = (team: 'hearts' | 'hibs') => teams[team].filter((t) => t.scored).length;
  let shown = false;
  let ftAt = -1;
  trigger(s0 - 45, () => {
    G.commentary.show("It's derby day on Leith Walk! Hearts and Hibs are squaring up in the middle of the road!", 4);
    shown = true;
  });
  G.updaters.push(() => {
    if (!shown) return;
    if (ftAt < 0) {
      el.style.display = 'block';
      el.innerHTML = `<small>LEITH WALK DERBY · KNOCKED OVER</small>HEARTS ${down('hearts')} &nbsp;–&nbsp; ${down('hibs')} HIBS`;
      if (G.trolley.roadS > s0 + 34 || (G.trolley.ejected && G.trolley.roadS > s0 - 5 && !G.trolley.runner)) {
        // full time: whoever has more fans still on their feet wins
        ftAt = G.time;
        const hs = n - down('hearts'), bs = n - down('hibs');
        const knocked = down('hearts') + down('hibs');
        let verdict: string, line: string;
        if (hs === bs) {
          verdict = hs === 0 ? 'EVERYBODY DOWN!' : 'SCORE DRAW!';
          line = hs === 0 ? "Both sets of fans flattened. The polis are calling it a draw." : `${hs} apiece still standing. A score draw. Nobody's happy. Typical derby.`;
        } else if (hs > bs) {
          verdict = 'HEARTS WIN!';
          line = `Full time on Leith Walk: ${hs} Hearts fans still standing to ${bs} Hibs. The Jambos take the derby!`;
        } else {
          verdict = 'HIBS WIN!';
          line = `Full time on Leith Walk: ${bs} Hibs fans still standing to ${hs} Hearts. Sunshine on Leith!`;
        }
        el.classList.add('ft');
        el.innerHTML = `<small>FULL TIME · STILL STANDING</small>HEARTS ${hs} &nbsp;–&nbsp; ${bs} HIBS<br/>${verdict}`;
        G.commentary.show(line, 5);
        G.sfx.cheer(2.5);
        if (knocked > 0) G.scoring.award('DERBY DAY!', Math.min(1500, 75 * knocked), G.trolley.position.add(new THREE.Vector3(0, 2.5, 0)), true, 'derby');
      }
    } else if (G.time - ftAt > 5.5) {
      el.style.display = 'none';
      shown = false;
    }
  });
}

function leithWalkWorks() {
  const sA = MARKS.leithwalk + 22, sB = MARKS.foot - 20;
  if (!on(sA)) return;
  trigger(sA - 15, () => G.commentary.say('tramworks', true));
  const orange = color(0xff6a13, 0.6);
  let i = 0;
  for (let s = sA; s < sB && on(s); s += 44, i++) {
    if (i === DERBY_GAP) continue; // the fans have taken over this bit of road
    const side = i % 2 ? 1 : -1;
    const len = 24;
    // taper of cones into the closure
    for (let k = 0; k < 6; k++) coneProp(s - 8 + k * 1.4, side * (4.4 - k * 0.7));
    // orange mesh fence along the closure
    for (let d = 0; d < len; d += 2.4) {
      const ss = s + d;
      const fv = new THREE.Group();
      fv.add(bx(0.05, 1.0, 2.2, orange, 0, 0, 0));
      fv.add(bx(0.4, 0.15, 0.4, M.black(), 0, -0.55, -1.0));
      fv.add(bx(0.4, 0.15, 0.4, M.black(), 0, -0.55, 1.0));
      G.destruction.add(toWorld(ss + 1.2, side * 0.5, 0.62), theta(ss), [0.05, 0.55, 1.1], {
        visual: fv, dynamic: true, density: 160, points: 30, label: 'Road Works Fence', sound: 'soft',
      });
    }
    // inside: a digger or a skip of rubble, a worker, and a ROAD WORKS sign
    if (i % 2 === 0) digger(s + len / 2, side * 2.8);
    else {
      const skip = new THREE.Group();
      skip.add(bx(1.8, 1.0, 3.2, color(0xf2b01e, 0.6), 0, 0, 0));
      G.destruction.add(toWorld(s + len / 2, side * 2.8, 0.55), theta(s), [0.9, 0.5, 1.6], { visual: skip, dynamic: true, density: 260, points: 600, label: 'Skip', sound: 'metal' });
      for (let k = 0; k < 6; k++) G.destruction.add(toWorld(s + len / 2 - 1 + k * 0.4, side * 2.8, 1.3 + (k % 2) * 0.25), Math.random() * 3, [0.18, 0.1, 0.12], { mat: M.stone(30, 40, k), dynamic: true, density: 1200, points: 15, label: 'Rubble', sound: 'stone' });
    }
    const wk = G.crowd.tourist(s + len - 4, side * 2.2, 'tourist', 0, 'Workie', 300);
    dressUp(wk, 0xff7a1a, 0xf2f2ee);
    const sg = new THREE.Group();
    const face = mapMat(signTex(['TRAM WORKS', 'BACK BY POPULAR DEMAND'], '#c4161c', '#fff', 256, 160));
    sg.add(bx(1.2, 0.8, 0.04, [M.black(), M.black(), M.black(), M.black(), M.black(), face] as any, 0, 0.4, 0));
    sg.add(bx(0.05, 1.0, 0.05, M.steel(), 0, -0.5, 0));
    G.destruction.add(toWorld(s - 10, side * 3.4, 1.0), theta(s), [0.6, 1.0, 0.1], { visual: sg, dynamic: true, density: 60, points: 100, label: 'Road Works Sign', sound: 'metal' });
  }
  // rails being laid down the middle
  const rail = color(0x6b6b6b, 0.3, 0.8);
  for (let s = MARKS.leithwalk + 4; s < Math.min(MARKS.foot - 4, LIMIT); s += 6) {
    const g = roadGroup(s + 3, 0, 0);
    for (const d of [-0.72, 0.72]) g.add(bx(0.08, 0.05, 6.05, rail, -d, 0.0, 0));
    add(g);
  }
}

// =====================================================================
// 10. Foot of the Walk: Queen Victoria
// =====================================================================
function queenVictoria(s: number, u: number) {
  if (!on(s)) return;
  const bronze = color(0x4e5d4a, 0.42, 0.7);
  const plinthH = 2.6;
  const fig = new THREE.Group();
  // the Queen: a bell of a skirt, a sash, a wee crown and the sceptre
  fig.add(cyl(0.25, 0.75, 1.5, bronze, 0, -0.55, 0, 16));
  fig.add(cyl(0.2, 0.25, 0.6, bronze, 0, 0.5, 0, 12));
  fig.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), bronze));
  fig.children[2].position.y = 1.0;
  fig.add(cyl(0.12, 0.15, 0.12, M.gold(), 0, 1.2, 0, 10));
  const sceptre = cyl(0.025, 0.025, 0.9, bronze, 0.3, 0.6, 0.25, 6);
  sceptre.rotation.z = -0.3;
  fig.add(sceptre);
  const statue = G.destruction.add(toWorld(s, u, plinthH + 1.3), theta(s), [0.6, 1.3, 0.6], {
    visual: fig, density: 1100, release: 9999, points: 2500, label: 'Queen Victoria', sound: 'metal', fracture: [1, 3, 1], fractureLoad: 600,
  });
  const pg = roadGroup(s, u, 0);
  pg.add(bx(1.7, plinthH, 1.7, M.stone(20, 46, 41), 0, plinthH / 2, 0));
  pg.add(bx(2.0, 0.25, 2.0, M.stone(20, 46, 41), 0, plinthH - 0.05, 0));
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.7), mapMat(signTex(['VICTORIA R.I.', '1819 – 1901', 'not amused'], '#7a5c1e', '#f2dc98', 256, 160, 'Georgia')));
  plaque.position.set(0.86, 1.3, 0);
  plaque.rotation.y = Math.PI / 2;
  pg.add(plaque);
  add(pg);
  const topple = once(() => {
    const dir = right(s).multiplyScalar(-Math.sign(u)).add(forward(s).multiplyScalar(0.6)).normalize();
    statue.opts.onRelease = (p) => {
      const k = p.mass * 3;
      p.body.applyImpulse({ x: dir.x * k, y: p.mass * 1.5, z: dir.z * k }, true);
      p.body.applyTorqueImpulse({ x: dir.z * p.mass * 2, y: 0, z: -dir.x * p.mass * 2 }, true);
    };
    G.destruction.releaseAll([statue], 0);
    G.scoring.award('WE ARE NOT AMUSED!', 2000, toWorld(s, u, 4), true, 'victoria');
    G.commentary.say('victoria', true);
    G.sfx.impact(1, 'metal');
    G.bigMoment(0.6);
  });
  G.destruction.add(toWorld(s, u, plinthH / 2), theta(s), [0.85, plinthH / 2, 0.85], {
    visual: new THREE.Group(), density: 2600, hitLoad: 0.02, sound: 'stone',
    onHit: (_p, _l, other) => {
      if (other?.kind === 'trolley' || other?.kind === 'rider') topple();
    },
  });
}

// =====================================================================
// 11. Newhaven and Starbank: the lighthouse, the sea wall, the slipway, the Forth
// =====================================================================
function shore() {
  const lh = Road.SEA_S0 + 12;
  // the harbour pier and its wee lighthouse
  const pg = roadGroup(lh, 22, 0);
  pg.position.y = Road.SEA_Y;
  pg.add(bx(18, 6, 5, M.stone(30, 44, 91), 5, 2, 0));
  const tower = new THREE.Group();
  tower.add(cyl(1.3, 1.6, 9, M.white(), -2, 9.5, 0, 16));
  tower.add(cyl(1.0, 1.0, 1.4, color(0x2a3540, 0.2, 0.6), -2, 14.7, 0, 12));
  tower.add(cone(1.3, 1.4, color(0xc4161c, 0.5), -2, 16.1, 0, 12));
  tower.add(cyl(1.6, 1.6, 0.2, M.black(), -2, 14.0, 0, 16));
  pg.add(tower);
  add(pg);
  trigger(lh - 30, () => G.commentary.say('lighthouse', true));

  // the sea wall along Starbank: low enough to hop, and it hides the drop to the water
  const sA = Road.SEA_S0, sB = MARKS.end + 0.5;
  const body = G.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (let s = sA; s < sB; s += 2) {
    const s2 = Math.min(sB, s + 2);
    const A = toWorld(s, edgeR(s) + 0.25, 0), B = toWorld(s2, edgeR(s2) + 0.25, 0);
    const d = B.clone().sub(A).setY(0);
    const len = d.length();
    const yaw = Math.atan2(d.x, d.z);
    const c = A.clone().add(B).multiplyScalar(0.5);
    const top = (A.y + B.y) / 2 + 0.55;
    const h = top - (Road.SEA_Y - 3.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, len + 0.04), M.stone(30, 44, 92, 1, 2));
    m.position.set(c.x, top - h / 2, c.z);
    m.rotation.y = yaw;
    m.receiveShadow = true;
    add(m);
    const qq = yawQ(yaw);
    G.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.25, 0.4, len / 2 + 0.03).setTranslation(c.x, top - 0.4, c.z).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }).setFriction(0.1),
      body,
    );
  }
  for (let s = sA + 6; s < sB - 10; s += 22) G.crowd.pigeons(s, edgeR(s) - 1.0, 6, true);
  for (let s = sA + 12; s < sB - 14; s += 26) bench(s, edgeR(s) - 1.0);

  // the slipway: a full-width ramp at the very end, straight into the Forth
  const sEnd = MARKS.end - 1.5;
  staticRamp(sEnd - 6.5, sEnd, -HALF_ROAD - 0.6, HALF_ROAD + 0.6, 1.25, M.stone(30, 38, 93));
  const chev = M.stripes('#f2c14e', '#161616');
  for (const u of [-HALF_ROAD - 0.7, HALF_ROAD + 0.7]) {
    const g = roadGroup(sEnd - 0.3, u, 0);
    g.add(bx(0.3, 1.6, 0.3, chev, 0, 0.8, 0));
    add(g);
  }
  const sg = roadGroup(sEnd - 10, -(HALF_ROAD + 1.4), 0);
  sg.add(cyl(0.05, 0.05, 2.2, M.steel(), 0, 1.1, 0, 6));
  const face = mapMat(signTex(['SLIPWAY', 'NO VEHICLES', '(SERIOUSLY)'], '#f4f1e6', '#c4161c', 256, 192));
  sg.add(bx(1.2, 0.9, 0.04, [M.white(), M.white(), M.white(), M.white(), M.white(), face] as any, 0, 2.4, 0));
  add(sg);
  for (let u = -4; u <= 4; u += 2.3) barrier(sEnd - 12, u);
  // a harbour wall on the left of the slipway
  for (let s = Road.WALL_S1 - 1; s < MARKS.end + 6; s += 4) {
    const g = roadGroup(s + 2, -(edgeL(s) + 0.6), 0);
    g.add(bx(1.2, 3.2, 4.1, M.stone(30, 44, 94), 0, 0.8, 0));
    add(g);
    staticBox(s + 2, -(edgeL(s) + 0.6), baseH(s) + 0.9, 0.6, 1.6, 2.05);
  }
  // banner over the end of the road
  const bg = roadGroup(sEnd - 4, 0, 0);
  for (const x of [-6.6, 6.6]) bg.add(cyl(0.12, 0.14, 6, M.metal(), x, 3, 0));
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.3), new THREE.MeshStandardMaterial({ map: signTex(['THE FIRTH OF FORTH · END OF THE ROAD · MIND THE GAP'], '#14284a', '#fff', 1024, 96), side: THREE.DoubleSide }));
  banner.position.y = 5.4;
  banner.rotation.y = Math.PI;
  bg.add(banner);
  add(bg);
}

/** The Firth of Forth: a sea plane beyond the Starbank sea wall and past the end of the road. */
function sea(scene: THREE.Scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f7f8f, roughness: 0.25, metalness: 0.2 });
  const s0 = Road.SEA_S0;
  const n = right(s0 + 30);
  const along = forward(s0 + 30);
  const P = toWorld(s0 + 30, edgeR(s0 + 30) + 0.45, 0);
  const W = 4000;
  // half-plane to the right of Starbank Road
  const a = new THREE.Mesh(new THREE.PlaneGeometry(W, W), mat);
  a.rotation.x = -Math.PI / 2;
  a.position.copy(P).addScaledVector(n, W / 2);
  a.position.y = Road.SEA_Y;
  a.rotation.z = Math.atan2(along.x, along.z);
  a.receiveShadow = true;
  scene.add(a);
  // and everything past the end of the slipway
  const e = MARKS.end;
  const fe = forward(e);
  const E = toWorld(e - 1, 0, 0);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(W, W), mat);
  b.rotation.x = -Math.PI / 2;
  b.position.copy(E).addScaledVector(fe, W / 2);
  b.position.y = Road.SEA_Y - 0.01;
  b.rotation.z = Math.atan2(fe.x, fe.z);
  scene.add(b);
  // a few wave crests that bob
  const crest = color(0xe8f0f2, 0.6);
  const waves: THREE.Mesh[] = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 3, 0.06, 0.25), crest);
    m.position.copy(P).addScaledVector(n, 6 + Math.random() * 120).addScaledVector(along, (Math.random() - 0.3) * 160);
    m.position.y = Road.SEA_Y + 0.05;
    m.rotation.y = Math.atan2(along.x, along.z) + Math.PI / 2;
    scene.add(m);
    waves.push(m);
  }
  let t = 0;
  G.updaters.push((dt) => {
    t += dt;
    waves.forEach((w, i) => (w.position.y = Road.SEA_Y + 0.05 + Math.sin(t * 1.3 + i) * 0.08));
  });
  // is a world point out in the water?
  return (x: number, z: number) => {
    const p = new THREE.Vector3(x, 0, z);
    const d1 = p.clone().sub(P).dot(n);
    const d2 = p.clone().sub(E).dot(fe);
    return d1 > -2 || d2 > -2;
  };
}

// =====================================================================
// the tour
// =====================================================================
const TOUR_LONG: TourInfo[] = [
  { ...RM_TOUR[0], blurb: 'The Royal Mile is closed for roadworks, so today it\'s the long way round. Line up and give it the Big Boot™.' },
  RM_TOUR[1],
  RM_TOUR[2],
  { name: 'Diversion: George IV Bridge', pts: 'PORTALOO 800 · DIVERSION SIGNS', blurb: 'The Royal Mile is shut. Hard right down George IV Bridge, and mind the portaloo. Somebody is in it.', s: JOIN_S + 6, cam: [JOIN_S - 16, -1.5, 4], look: [JOIN_S + 12, -5, 1.5] },
  { name: 'Victoria Street', pts: 'BROOM BROOM 1,200 · TERRACE', blurb: 'The painted curve down to the Grassmarket. Scatter the brooms outside the broom shop.', s: 0, cam: [0, -2, 3.5], look: [0, 7, 1.2] },
  { name: 'The Grassmarket', pts: "ROUND'S ON YOU 1,500 · ENGINES ON", blurb: "Beer garden, spilt pints, the Covenanters' Memorial. Engines fire up here: from now on it's uphill or flat.", s: 0, cam: [0, -1, 3.2], look: [0, -8, 1] },
  { name: "King's Stables Road", pts: 'TRAFFIC WARDEN 2,500 · PARKED CARS 400', blurb: 'Climb under the castle rock. The warden is ticketing everything. Return the favour.', s: 0, cam: [0, 2, 3], look: [0, -6, 1] },
  { name: 'The Caledonian', pts: 'HOTEL DOORMAN 500', blurb: 'Round the West End past the big red Caley, and on to Princes Street.', s: 0, cam: [0, 2, 4], look: [0, -12, 8] },
  { name: 'Princes Street Christmas Market', pts: 'BIG WHEEL 4,000 · TRAM-BOOZLED 3,000', blurb: 'Knock the big wheel off its legs and watch it roll down Princes Street. And look out for the tram.', s: 0, cam: [0, 0, 4.5], look: [0, 9, 6] },
  { name: 'The Scott Monument', pts: 'SIGHTSEEING ONLY', blurb: 'A 61-metre gothic rocket. You cannot reach it. Please stop trying.', s: 0, cam: [0, 3, 4], look: [0, 28, 24] },
  { name: 'The Balmoral Clock', pts: 'ALWAYS 3 MINUTES FAST', blurb: 'The East End, and the corner of the Balmoral. Leith Walk lies beyond.', s: 0, cam: [0, -1, 4], look: [0, 16, 22] },
  { name: 'The Walnut Whip', pts: 'LOCAL LANDMARK (DISPUTED)', blurb: 'Down Leith Street past the bronze ribbon hotel. Nobody calls it anything else.', s: 0, cam: [0, -4, 7], look: [0, 18, 28] },
  { name: 'Leith Walk Tram Works', pts: 'DIGGER 1,500 · SKIP 600 · CONES', blurb: 'A mile of roadworks. Slalom the closures or plough straight through. The council will never notice.', s: 0, cam: [0, 0, 5], look: [0, 0, 0] },
  { name: 'Queen Victoria', pts: '2,500 · WE ARE NOT AMUSED 2,000', blurb: 'Her Majesty at the Foot of the Walk. Clip her plinth.', s: 0, cam: [0, -1, 3], look: [0, 6.4, 3] },
  { name: 'Newhaven Lighthouse', pts: 'SEAGULLS', blurb: 'The harbour. The sea is right there. Do not look at the sea. Look at the road.', s: 0, cam: [0, -2, 4], look: [0, 21, 8] },
  { name: 'Starbank Slipway', pts: 'SPLASHDOWN 5,000', blurb: 'The end of the road. Hit the slipway and take the plunge into the Firth of Forth.', s: 0, cam: [0, -2, 4], look: [0, 3, 0] },
];

function longTour(): TourInfo[] {
  const t = TOUR_LONG.map((x) => ({ ...x, cam: [...x.cam] as [number, number, number], look: [...x.look] as [number, number, number] }));
  // place the stops that depend on the course marks
  const at = (i: number, s: number, camBack: number, lookAhead: number) => {
    t[i].s = s;
    t[i].cam[0] = s - camBack;
    t[i].look[0] = s + lookAhead;
  };
  at(4, MARKS.victoria + 26, 16, 2);
  at(5, MARKS.grassmarket + 30, 16, 2);
  at(6, MARKS.ksrbend + 16, 18, 4);
  at(7, MARKS.westend + 22, 20, 6);
  at(8, MARKS.princes + 120, 26, 24);
  at(9, MARKS.princes + 210, 14, 4);
  at(10, MARKS.eastend - 4, 16, 10);
  at(11, MARKS.leithst + 30, 34, 0);
  at(12, MARKS.leithwalk + 40, 22, 20);
  at(13, MARKS.foot + 8, 14, 0);
  at(14, Road.SEA_S0 + 12, 12, 0);
  at(15, MARKS.end - 6, 16, 14);
  return t.filter((x) => x.s <= Road.FINISH_S + 12);
}

// =====================================================================
// street styles per stretch
// =====================================================================
function styleAt(s: number): StreetStyle {
  const m = MARKS;
  if (s < m.victoria) return {};
  if (s < m.westbow) return { tints: VIC_TINTS, hMin: 9, hMax: 14, names: VIC_NAMES };
  if (s < m.westport + 6) return { tints: [0xd8c8a8, 0xb8a080, 0xe8dcc0, 0x9a7e60], hMin: 10, hMax: 16, names: ['THE LAST DROP', 'THE WHITE HART INN', 'THE BEEHIVE INN', "MAGGIE DICKSON'S", 'THE BLACK BULL', "FIDDLER'S ARMS", 'THE BOW BAR', 'GRASSMARKET GRILL'] };
  if (s < m.lothian) return { hMin: 6, hMax: 10, names: ["KING'S STABLES LIVERY", 'CASTLE CAR PARK', 'ST CUTHBERT\'S HALL'] };
  if (s < m.westend) return { hMin: 16, hMax: 22, names: ['USHER HALL BOX OFFICE', 'THE TRAVERSE BAR', 'FILMHOUSE', 'LOTHIAN ROAD CHIPPY', 'THE SHAKESPEARE'] };
  if (s < m.princes) return { tints: [0xc07055, 0xb5604a], hMin: 20, hMax: 24, names: ['THE CALEDONIAN', 'THE CALEDONIAN', 'PEACOCK ALLEY'] };
  if (s < m.eastend + 10) return { tints: [0xf0ebe0, 0xd8d0c0, 0xc8c0b0], hMin: 18, hMax: 26, names: ["MACSPORRAN'S DEPARTMENT STORE", 'THE KILTED MILE', 'TARTAN & TWEED', 'SHORTBREAD SUPERSTORE', 'GRAND HOTEL', 'BANK OF CALEDONIA', 'BOOKS & BAGPIPES'] };
  if (s < m.leithwalk) return { tints: [0xd0d0d0, 0xbfbab4], hMin: 14, hMax: 22, names: ['ST JAMES QUARTER', 'PLAYHOUSE THEATRE', 'OMNI CENTRE'] };
  if (s < m.newhaven) return { tints: [0x9a9590, 0xb0aba5, 0x8f8a84], hMin: 12, hMax: 17, names: ['LEITH WALK FISH BAR', 'PIER PLACE KEBABS', 'CURL UP & DYE', 'POLISH DELI', 'BOOKIES', 'VINTAGE FURNITURE', 'TATTOO PARLOUR', 'CHARITY SHOP', 'THE WINDSOR BAR'] };
  return { tints: [0xe8dcc0, 0xd8ccb0, 0xf0e8d8], hMin: 7, hMax: 10, names: ['NEWHAVEN FISH MARKET', 'THE OLD CHAIN PIER', 'STARBANK INN', 'HARBOUR CHIPPY'] };
}

// =====================================================================
// build it
// =====================================================================
export function buildDiversion(tier: number): Level {
  LIMIT = Road.S_MAX - 2;
  const m = MARKS;
  const sTo = tier >= 4 ? m.end : Road.S_MAX - 1;
  const R = (side: 1 | -1, s0: number, s1: number): Reserved => ({ side, s0, s1 });
  const reserved: Reserved[] = [
    R(1, 36, 56),
    R(-1, 88, 106),
    // side streets (left)
    R(-1, JOIN_S + 17, JOIN_S + 33),
    R(-1, m.grassmarket + 7, m.grassmarket + 17),
    R(-1, m.westport + 5, m.westport + 15),
    R(-1, m.lothian + 10, m.lothian + 20),
    R(-1, m.princes + 48, m.princes + 58),
    R(-1, m.princes + 108, m.princes + 118),
    R(-1, m.princes + 168, m.princes + 178),
    R(-1, m.princes + 238, m.princes + 248),
    R(-1, m.leithwalk + 115, m.leithwalk + 125),
    R(-1, m.leithwalk + 225, m.leithwalk + 235),
    R(-1, m.junctionst + 40, m.junctionst + 50),
    // Victoria Terrace (built as a set piece)
    R(-1, m.victoria + 5, m.westbow - 3),
    // right-hand side
    R(1, m.victoria + 19, m.victoria + 33), // broom shop
    R(1, m.westport + 3, m.lothian + 4), // castle cliff
    R(1, m.princes + GARDEN_START - 1, m.eastend), // gardens (buildings on the Lothian Road corner before them)
    R(1, m.eastend, m.eastend + 22), // the Balmoral
    R(1, m.leithst + 12, m.leithst + 48), // walnut whip
    R(1, m.leithwalk + 85, m.leithwalk + 95),
    R(1, m.leithwalk + 185, m.leithwalk + 195),
    R(1, m.foot + 18, m.foot + 28),
    R(1, Road.SEA_S0 - 1, m.end + 20), // the sea
  ];
  buildStreet(reserved, -4, sTo, styleAt);
  guideWalls(-4, Road.WALL_S1, [-1]);
  guideWalls(-4, Math.min(Road.WALL_S1, Road.SEA_S0), [1]);

  // the Royal Mile end
  SP.castleEsplanade({ castle: false });
  castleHill();
  SP.whiskyPyramid(47, 1.0);
  SP.piperAndTartan(96);
  scaffold(66, 74, -6.7, 6);
  diversionJunction();

  // side streets, all shut
  blocked(m.grassmarket + 7, -1, 'CANDLEMAKER ROW', undefined, 10);
  blocked(m.westport + 5, -1, 'WEST PORT', undefined, 10);
  blocked(m.lothian + 10, -1, 'BREAD STREET', undefined, 10);
  blocked(m.princes + 48, -1, 'CASTLE STREET', undefined, 10);
  blocked(m.princes + 108, -1, 'FREDERICK STREET', undefined, 10);
  blocked(m.princes + 168, -1, 'HANOVER STREET', undefined, 10);
  blocked(m.princes + 238, -1, 'ST ANDREW STREET', undefined, 10);
  blocked(m.leithwalk + 85, 1, 'DALMENY STREET', undefined, 10);
  blocked(m.leithwalk + 115, -1, 'PILRIG STREET', undefined, 10);
  blocked(m.leithwalk + 185, 1, 'IONA STREET', undefined, 10);
  blocked(m.leithwalk + 225, -1, 'ALBERT STREET', undefined, 10);
  blocked(m.foot + 18, 1, 'CONSTITUTION STREET', forward(m.foot - 4), 10);
  blocked(m.junctionst + 40, -1, 'FERRY ROAD', undefined, 10);

  victoriaStreet();
  grassmarket();
  // SKOOSH at the start of the two long runs: across the Grassmarket, and down Leith Walk
  skooshCan(m.grassmarket + 4, 0);
  // nods to the local games industry: wee marchers, the polis (with a wanted level), arcade cabinets
  policeCar(JOIN_S - 8, -4.3); // directing the diversion, naturally
  policeBox(m.victoria + 44, edgeR(m.victoria + 44) - 1.0);
  marchers(m.grassmarket + 84, 8);
  policeCar(m.grassmarket + 92, -(edgeL(m.grassmarket + 92) - 1.4));
  arcadeCabinet(m.victoria + 14, edgeR(m.victoria + 14) - 0.8);
  if (tier >= 3) {
    kingsStables();
    policeCar(m.ksr + 64, 3.4); // booking the parked cars
    policeBox(m.princes + 62, -(edgeL(m.princes + 62) - 1.2));
    marchers(m.princes + 196, 8);
    caledonian();
    princesGardens(LIMIT);
    scottMonument(m.princes + 210, 30);
    christmasMarket();
    tram();
    balmoral();
  }
  let isSea = (_x: number, _z: number) => false;
  if (tier >= 4) {
    walnutWhip();
    leithWalkWorks();
    derby();
    // the polis are at the derby too
    policeCar(m.leithwalk + 22 + 3 * 44 - 18, edgeR(m.leithwalk + 150) - 1.6);
    policeBox(m.leithwalk + 22 + 3 * 44 + 26, -(edgeL(m.leithwalk + 180) - 1.2));
    arcadeCabinet(m.leithwalk + 66, -(edgeL(m.leithwalk + 66) - 0.8));
    marchers(m.junctionst + 30, 7);
    skooshCan(m.leithwalk + 6, 0);
    queenVictoria(m.foot + 8, 6.3);
    shore();
    isSea = sea(G.scene);
  }

  // the finish of this stage
  if (tier === 2) {
    finishLine(Road.FINISH_S, 'FINISH · THE GRASSMARKET · ROAD CLOSED BEYOND');
    roadClosed(Road.FINISH_S + 13, "KING'S STABLES ROAD: STAGE 3");
  } else if (tier === 3) {
    finishLine(Road.FINISH_S, 'FINISH · PRINCES STREET · MIND THE TRAM');
    roadClosed(Road.FINISH_S + 13, 'LEITH WALK: STAGE 4');
  }

  scatterAlong(-4, JOIN_S - 2, [[-60, 6], [38, 56], [88, 106]]);
  scatterAlong(JOIN_S + 16, sTo - 6, [
    [m.victoria + 18, m.victoria + 34],
    [m.grassmarket + 18, m.grassmarket + 56],
    [m.grassmarket + 60, m.grassmarket + 72],
    [Road.ENGINE_S - 3, Road.ENGINE_S + 3],
    [m.princes + 90, m.princes + 150],
    [m.leithwalk + 18, m.foot - 18],
    [m.foot, m.foot + 16],
    [m.end - 22, m.end + 10],
    [Road.FINISH_S - 10, Road.FINISH_S + 20],
  ], false);

  const tour = longTour();
  const keepOut = (x: number, z: number) => {
    if (isSea(x, z)) return true;
    const r = toRoad(x, z);
    // Princes Street Gardens and the castle crags stay green/rocky
    if (tier >= 3 && inGardens(x, z)) return true;
    if (r.s > m.westport && r.s < m.lothian && r.u > 0 && r.u < 40) return true;
    return false;
  };
  const name = ['The Royal Mile', 'The Grassmarket Diversion', 'Up to Princes Street', 'Leith Walk & the Shore'][tier - 1];
  return { name, tour, stops: tourStops(tour), keepOut };
}

export { H, HALF_STREET, toWorldAbs };
