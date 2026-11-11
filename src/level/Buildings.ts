import * as THREE from 'three';
import { RAPIER } from '../core/Physics';
import { G } from '../ctx';
import { addStatic } from '../world/Batcher';
import { M, color } from '../art/Materials';
import { facadeTex, shopTex, signTex, SHOP_NAMES, rng } from '../art/Textures';
import { shopWindow } from '../art/Interiors';
import { ball, cyl, lathe, Parts, pipe, q, rbox, V3 } from '../art/Model';
import { FINE, UNIT, archFrame, dressed, gable, moulding, roof, sbox } from '../art/Architecture';
import { HALF_STREET, BAYS, BAY_T, baseH, theta, toWorld, toRoad, L, roadGroup, right, edgeL, edgeR, forward } from '../world/Road';

export interface Reserved {
  side: 1 | -1;
  s0: number;
  s1: number;
}

/** Look of a stretch of street: tint for painted fronts, height range, shop names. */
export interface StreetStyle {
  tints?: number[];
  hMin?: number;
  hMax?: number;
  names?: string[];
  depth?: number;
}

/** How much wider a facade must be on the outside of a bend (and narrower on the inside). */
export function bendScale(s: number, side: 1 | -1, dist: number) {
  const k = theta(s + 0.5) - theta(s - 0.5); // curvature, + = bending left
  return Math.max(0.3, 1 + side * k * dist);
}

const CLOSES = ["ADVOCATE'S", 'FLESHMARKET', "WARRISTON'S", "MARY KING'S", 'BAKEHOUSE', "WHITE HORSE", "BLACKFRIARS", "OLD FISHMARKET", "WORLD'S END", "SUGARHOUSE"];

/** Static box collider in road space. */
export function staticBox(s: number, u: number, yCenterAbs: number, halfAcross: number, halfY: number, halfAlong: number, yaw = theta(s)) {
  const p = toWorld(s, u, 0);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const body = G.physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, yCenterAbs, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
  G.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(halfAcross, halfY, halfAlong).setFriction(0.05).setRestitution(0.25), body);
  return body;
}

let shopIdx = 0;
const SHOP_PAINTS = ['#1e3d2f', '#5a1420', '#14284a', '#1c1c1c', '#3d2a5a', '#0f4a4a', '#6a3a12']; // as shopTex picks them
const AWNINGS = ['#8e1c1c', '#1d5c3a', '#1b4f9c'];
let potGeo: THREE.BufferGeometry | null = null;
/** A clay chimney can. */
const pot = () => (potGeo ??= lathe([[0.16, 0], [0.13, 0.1], [0.105, 0.5], [0.14, 0.54], [0.14, 0.6], [0.0001, 0.6]], q(8, 5), { cap: 'none' }));

/** A slated roof with a gable at each end over a block `depth` x `width`, its wallhead at `y`. */
export function roofOver(p: Parts, stone: THREE.Material, depth: number, width: number, y: number, stepped: boolean, pitch = 0.4) {
  const rise = depth * pitch;
  p.add(roof(depth + 0.5, rise, width, { ends: false }), M.slate(), [0, y + 0.3, 0]);
  for (const sz of [-1, 1]) p.add(gable(depth + 0.3, rise, 0.45, stepped, 0.65), stone, [0, y, sz * (width / 2 - 0.225)]);
  return rise;
}

/** A chimney stack across the ridge at `z`, with a cope and a row of cans. */
export function chimney(p: Parts, stone: THREE.Material, cope: THREE.Material, ridge: number, z: number, pots = 4, x = 0) {
  const top = ridge + 1.8, bot = ridge - 1.3;
  p.add(sbox(1.1, top - bot, 1.9), stone, [x, (top + bot) / 2, z]);
  p.add(UNIT, cope, [x, top + 0.09, z], null, [1.3, 0.18, 2.1]);
  const clay = color(0xa8552e, 0.9);
  for (let k = 0; k < pots; k++) p.add(pot(), clay, [x, top + 0.18, z + (k - (pots - 1) / 2) * 0.44], null, null, 0.85 + (k % 2) * 0.2);
}

/** One tenement land. Returns its group. */
export function tenement(s0: number, width: number, side: 1 | -1, height: number, seed: number, forcedName?: string, front = HALF_STREET, tint?: number, depthIn = 10) {
  const r = rng(seed);
  const sc = s0 + width / 2;
  const depth = depthIn;
  const along = width;
  width = width * bendScale(sc, side, front);
  const u = side * (front + depth / 2);
  const ground = Math.min(baseH(s0), baseH(s0 + along)) - 0.6;
  const g = roadGroup(sc, u, 0);
  g.position.y = ground;
  const hTotal = height + 0.6;
  const f = side > 0 ? 1 : -1; // local x of the street face (+X is local left, -u)
  const X = (f * depth) / 2;
  const mirror: V3 = [f, 1, 1];
  const groundLocal = baseH(sc) + 0.14 - ground;

  const hue = 26 + Math.floor(r() * 4) * 4;
  const light = 40 + Math.floor(r() * 4) * 5;
  const [fmap, femit] = facadeTex(hue, light, 1 + Math.floor(r() * 3));
  // the painted front is 4 bays x 4 storeys a tile: fit whole bays across the land, and whole
  // storeys between the top of the shop and the wallhead, so no window is cut by an edge
  const y0 = Math.min(groundLocal + 3.75, hTotal - 2.2);
  const nf = Math.max(1, Math.round((hTotal - y0) / 3.2)), fh = (hTotal - y0) / nf;
  const nb = Math.max(1, Math.round(width / 3)), bw = width / nb;
  const map = fmap.clone();
  map.repeat.set(nb / 4, hTotal / (4 * fh));
  map.offset.set(0, 1 - ((y0 / (4 * fh)) % 1));
  map.needsUpdate = true;
  const em = femit.clone();
  em.repeat.copy(map.repeat);
  em.offset.copy(map.offset);
  em.needsUpdate = true;
  const facade = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 });
  if (tint !== undefined) facade.color.setHex(tint);
  const plain = M.stone(hue, light - 6, 3, width / 8, hTotal / 8);
  const stone = M.stone(hue, light - 6, 3); // the same stone, for pieces laid out in metres
  const trim = dressed(hue, light + 7, tint), trimLo = dressed(hue, light - 5, tint);
  // +X face is local left (-u). The face pointing at the road is +X for right-side buildings.
  const mats = side > 0 ? [facade, plain, plain, plain, plain, plain] : [plain, facade, plain, plain, plain, plain];
  const box = new THREE.Mesh(new THREE.BoxGeometry(depth, hTotal, width), mats);
  box.position.y = hTotal / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);

  const p = new Parts();
  // slates between two gables (crow-stepped on the older lands), a cornice along the wallhead
  const stepped = r() < 0.4;
  const rise = roofOver(p, stone, depth, width, hTotal, stepped);
  const ridge = hTotal + 0.3 + rise;
  p.add(moulding(width, 0.32, 0.42), trim, [X, hTotal - 0.42, 0], null, mirror);
  p.add(UNIT, trimLo, [X - f * 0.06, hTotal + 0.16, 0], null, [0.3, 0.32, width]);
  // the ground floor is plain stone either side of the shop
  p.add(sbox(0.14, y0, width), stone, [X + f * 0.07, y0 / 2, 0]);
  p.add(UNIT, trim, [X + f * 0.1, y0 + 0.06, 0], null, [0.2, 0.12, width]);

  // chimney stacks on the gables, with their cans
  const nCh = 1 + Math.floor(r() * 3);
  const end = Math.max(0, width / 2 - 1.0);
  const stacks = nCh === 1 ? [(r() < 0.5 ? -1 : 1) * end] : nCh === 2 || width < 9 ? [-end, end] : [-end, 0, end];
  for (const z of stacks) chimney(p, stone, trim, ridge, z, FINE ? 4 : 3);

  // on the roof: a crow-stepped gable to the street on some lands, dormers on others
  const top = r();
  const pane = color(0x1e2a33, 0.2, 0.4);
  if (top < 0.3 && width > 5.5) {
    const gw = Math.min(width - 1.6, 6.4), gr = Math.min(gw * 0.6, rise * 0.92), wh = Math.min(1.5, gr * 0.5);
    p.add(gable(gw, gr, 0.5, true, 0.25), stone, [X - f * 0.25, hTotal, 0], [0, Math.PI / 2, 0]);
    p.add(roof(gw - 0.2, gr, depth / 2 + 0.3, { ends: false }), M.slate(), [X / 2 - f * 0.1, hTotal + 0.3, 0], [0, Math.PI / 2, 0]);
    p.add(UNIT, pane, [X + f * 0.005, hTotal + gr * 0.42, 0], null, [0.05, wh, 0.9]);
    p.add(UNIT, trim, [X + f * 0.05, hTotal + gr * 0.42 - wh / 2 - 0.06, 0], null, [0.14, 0.1, 1.2]);
  } else if (top < 0.62 && width > 6.5) {
    const n = width > 11 ? 3 : 2;
    const leadGrey = color(0x4a5158, 0.6, 0.3);
    for (let i = 0; i < n; i++) {
      const z = ((i + 0.5) / n - 0.5) * width * 0.86;
      p.add(UNIT, leadGrey, [X - f * 1.5, hTotal + 1.1, z], null, [1.9, 1.6, 1.3]);
      p.add(UNIT, trim, [X - f * 0.56, hTotal + 1.1, z], null, [0.1, 1.6, 1.4]);
      p.add(UNIT, pane, [X - f * 0.5, hTotal + 1.2, z], null, [0.05, 1.0, 0.8]);
      p.add(roof(1.7, 0.6, 2.2), M.slate(), [X - f * 1.5, hTotal + 1.9, z], [0, Math.PI / 2, 0]);
    }
  }

  // stone dressings picked out in relief where the painted front has them (desktop only)
  if (FINE) {
    const ww = (50 / 128) * bw, hooded = r() < 0.55;
    for (let k = 0; k < nf; k++) {
      const yf = y0 + k * fh;
      if (k > 0) p.add(UNIT, trimLo, [X + f * 0.04, yf + 0.045 * fh, 0], null, [0.08, 0.05 * fh, width]);
      for (let b = 0; b < nb; b++) {
        const z = -width / 2 + (b + 0.5) * bw;
        p.add(UNIT, trimLo, [X + f * 0.08, yf + 0.172 * fh, z], null, [0.16, 0.05 * fh, ww * 1.42]);
        if (hooded) p.add(UNIT, trim, [X + f * 0.06, yf + 0.935 * fh, z], null, [0.12, 0.04 * fh, ww * 1.42]);
      }
    }
    if (r() < 0.5) {
      // rusticated quoins up both corners
      let i = 0;
      for (let y = y0 + 0.25; y < hTotal - 0.9; y += 0.62, i++) {
        const w = i % 2 ? 0.48 : 0.8;
        for (const sz of [-1, 1]) p.add(UNIT, trim, [X + f * 0.035, y + 0.2, sz * (width / 2 - w / 2)], null, [0.07, 0.42, w]);
      }
    }
    // a cast-iron downpipe and its hopper
    const iron = color(0x1d2226, 0.5, 0.6);
    const pz = (r() < 0.5 ? -1 : 1) * (width / 2 - 0.22);
    p.add(cyl(0.06, 0.06, hTotal - 0.5 - groundLocal, 6), iron, [X + f * 0.1, (hTotal - 0.5 + groundLocal) / 2, pz]);
    p.add(UNIT, iron, [X + f * 0.12, hTotal - 0.55, pz], null, [0.22, 0.24, 0.26]);
  }

  // ground floor shopfront
  const name = forcedName ?? SHOP_NAMES[shopIdx++ % SHOP_NAMES.length];
  // phones skip the window glow map (memory); the interior-mapped windows cover the glass anyway
  const [smap, semit] = shopTex(name, seed);
  const shopW = Math.min(width - 0.8, 12);
  const shopMat = semit
    ? new THREE.MeshStandardMaterial({ map: smap, emissiveMap: semit, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.6 })
    : new THREE.MeshStandardMaterial({ map: smap, roughness: 0.6 });
  const shopFrame = color(0x222222, 0.6);
  const shopMats = side > 0 ? [shopMat, shopFrame, shopFrame, shopFrame, shopFrame, shopFrame] : [shopFrame, shopMat, shopFrame, shopFrame, shopFrame, shopFrame];
  const shop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, shopW), shopMats);
  shop.position.set(f * (depth / 2 + 0.1), groundLocal + 1.8, 0);
  shop.receiveShadow = true;
  g.add(shop);
  // shopTex picks its paint with its first random number and puts the door left or right with its
  // second; the glass is 80-220 px down
  const rr = rng(seed);
  const paintHex = new THREE.Color(SHOP_PAINTS[Math.floor(rr() * SHOP_PAINTS.length)]);
  const doorLeft = rr() < 0.5;
  // a real room behind the shop window (interior-mapped), laid over the window painted in shopTex
  {
    const [a, b] = doorLeft ? [136, 488] : [24, 376];
    const ww = ((b - a) / 512) * shopW, wh = ((220 - 80) / 256) * 3.6;
    const uc = (a + b) / 2 / 512;
    const zc = side > 0 ? shopW / 2 - uc * shopW : -shopW / 2 + uc * shopW;
    const win = shopWindow(ww, wh);
    win.position.set(f * (depth / 2 + 0.262), groundLocal + ((256 - 220) / 256) * 3.6, zc);
    win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(win);
  }
  // the shopfront's joinery: pilasters, console brackets and a cornice over the fascia
  const SX = X + f * 0.25;
  const paint = color(paintHex.getHex(), 0.55), paintLo = color(paintHex.clone().multiplyScalar(0.6).getHex(), 0.55);
  for (const sz of [-1, 1]) {
    const z = sz * (shopW / 2 - 0.06);
    p.add(UNIT, paint, [SX + f * 0.04, groundLocal + 1.8, z], null, [0.12, 3.6, 0.3]);
    p.add(UNIT, paintLo, [SX + f * 0.06, groundLocal + 0.2, z], null, [0.17, 0.4, 0.36]);
    if (FINE) p.add(rbox(0.3, 0.46, 0.3, 0.08, 1), paintLo, [SX + f * 0.12, groundLocal + 3.3, z]);
  }
  p.add(moulding(shopW + 0.5, 0.36, 0.2), paintLo, [SX, groundLocal + 3.58, 0], null, mirror);
  if (r() < 0.18 && shopW > 4) {
    // a striped awning out over the pavement
    p.add(new THREE.BoxGeometry(1.5, 0.04, shopW - 0.9), M.stripes(AWNINGS[Math.floor(r() * AWNINGS.length)], '#f4ecd8'), [SX + f * 0.72, groundLocal + 2.56, 0], [0, 0, -f * 0.3]);
    for (const sz of [-1, 1]) p.add(cyl(0.015, 0.015, 1.5, 4), M.metal(), [SX + f * 0.72, groundLocal + 2.54, sz * (shopW / 2 - 0.47)], [0, 0, Math.PI / 2 - f * 0.3]);
  }

  // projecting hanging sign now and again
  if (r() < 0.3) {
    const bxs = f * (depth / 2 + 0.7), bz = -shopW / 2 + 1;
    const iron = M.black();
    p.add(UNIT, iron, [bxs, groundLocal + 4.4, bz], null, [1.4, 0.05, 0.05]);
    p.add(pipe([[bxs - f * 0.68, groundLocal + 3.75, bz], [bxs - f * 0.5, groundLocal + 4.2, bz], [bxs + f * 0.1, groundLocal + 4.38, bz]], 0.018, { curve: true, seg: 4, steps: 3 }), iron);
    p.add(ball(0.05, 6), iron, [bxs + f * 0.72, groundLocal + 4.4, bz]);
    const sm = new THREE.MeshStandardMaterial({ map: signTex([name.split(' ')[0], '★'], '#5a1420', '#e8c45a', 128, 128, 'Georgia') });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.06), [M.black(), M.black(), M.black(), M.black(), sm, sm]);
    sign.position.set(bxs + f * 0.15, groundLocal + 3.85, bz);
    g.add(sign);
  }
  p.build(g);
  addStatic(g);
  // no collider here: the smooth guide rail along the building line does the job without corners
  return g;
}

/**
 * A back land: a block of tenements set behind the street line, windowed all round. On the outside
 * of a bend, straight-fronted lands fan apart and leave wedges you can see sky through: these fill them.
 */
export function backLand(s: number, u: number, along: number, across: number, h: number, seed = 1) {
  const r = rng(seed * 13 + 5);
  const [fmap, femit] = facadeTex(28 + Math.floor(r() * 3) * 4, 40 + Math.floor(r() * 3) * 4, 1 + Math.floor(r() * 3));
  const face = (w: number) => {
    const map = fmap.clone();
    map.repeat.set(w / 12, h / 12.8);
    map.needsUpdate = true;
    const em = femit.clone();
    em.repeat.copy(map.repeat);
    em.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 });
  };
  const sideM = face(across), endM = face(along);
  const g = roadGroup(s, u, 0);
  g.position.y = baseH(s) - 0.6 + h / 2;
  const m = new THREE.Mesh(new THREE.BoxGeometry(across, h, along), [sideM, sideM, M.slate(), M.stone(30, 40, 3), endM, endM]);
  m.castShadow = true;
  g.add(m);
  const rp = new Parts();
  const plain = M.stone(30, 40, 3);
  const rise = roofOver(rp, plain, across, along, h / 2, false, 0.3);
  chimney(rp, plain, dressed(30, 48), h / 2 + 0.3 + rise, along / 4, 4);
  chimney(rp, plain, dressed(30, 48), h / 2 + 0.3 + rise, -along / 4, 4);
  rp.build(g);
  addStatic(g);
  return g;
}

/** A narrow close between lands: dark passage with a back wall and a name plate. */
export function close(s: number, side: 1 | -1, width: number, name: string) {
  const g = roadGroup(s + width / 2, side * (HALF_STREET + 3), 0);
  g.position.y = baseH(s) - 0.3;
  const f = side > 0 ? 1 : -1; // local x direction pointing at the street
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, width), M.stone(30, 30, 6));
  back.position.set(-f * 3, 6, 0);
  g.add(back);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, width), M.stone(30, 34, 6));
  floor.position.y = 0.3;
  g.add(floor);
  // lintel over the entrance
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, width + 0.4), M.stone(32, 44, 2));
  lintel.position.set(f * 3, 3.6, 0);
  g.add(lintel);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, 0.35), new THREE.MeshStandardMaterial({ map: signTex([`${name} CLOSE`], '#111', '#f0e6c8', 256, 48, 'Georgia') }));
  plate.position.set(f * 3.42, 3.6, 0);
  plate.rotation.y = f > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(plate);
  const above = new THREE.Mesh(new THREE.BoxGeometry(6, 14, width), M.stone(30, 42, 7, 1, 2));
  above.position.set(0, 4.2 + 7, 0);
  above.castShadow = true;
  g.add(above);
  const cp = new Parts();
  cp.add(roof(6.5, 2.4, width, { ends: false }), M.slate(), [0, 18.2, 0]);
  // a round-headed pend, with the close's name over it
  cp.add(archFrame(Math.max(0.8, width - 0.5), 2.2, 0.18, 0.3, 0.5), dressed(32, 50), [f * 3.3, 0.45, 0], [0, f * Math.PI / 2, 0]);
  cp.build(g);
  addStatic(g);
}

/** Fill both sides of the street with tenements, skipping reserved ranges. */
export function buildStreet(reserved: Reserved[], sFrom: number, sTo: number, style: (s: number) => StreetStyle = () => ({})) {
  const r = rng(99 + Math.round(sFrom));
  let closeIdx = 0;
  for (const side of [1, -1] as const) {
    let s = sFrom;
    let seed = (side > 0 ? 100 : 500) + Math.round(sFrom);
    const edge = (x: number) => (side > 0 ? edgeR(x) : edgeL(x));
    while (s < sTo) {
      const res = reserved.find((x) => x.side === side && s < x.s1 && s + 4 > x.s0);
      if (res) {
        s = Math.max(s + 0.5, res.s1);
        continue;
      }
      const st = style(s);
      let w = 8 + r() * 7;
      // on a tight bend, straight-fronted lands must be narrow or their ends poke into the street
      const k = Math.abs(theta(s + 3) - theta(s - 3)) / 6;
      if (k > 0.004) {
        const inner = (theta(s + 3) - theta(s - 3)) * side < 0; // bending away from this side? then it's the inside
        const rad = 1 / k + (inner ? -edge(s) : edge(s));
        w = Math.min(w, Math.max(4, 2 * Math.sqrt(2 * (inner ? 0.45 : 1.2) * Math.max(1, rad))));
      }
      const next = reserved.filter((x) => x.side === side && x.s0 >= s).sort((a, b) => a.s0 - b.s0)[0];
      if (next && s + w > next.s0) w = next.s0 - s;
      if (s + w > sTo) w = sTo - s;
      const e0 = edge(s), e1 = edge(s + w);
      if (w < 3) {
        // too narrow for a land: just a wall
        const filler = roadGroup(s + w / 2, side * (e0 + 5), 0);
        filler.position.y = baseH(s) - 1;
        const m = new THREE.Mesh(new THREE.BoxGeometry(10, 16, w * bendScale(s + w / 2, side, e0)), M.stone(32, 40, 5));
        m.position.y = 8;
        filler.add(m);
        const fp = new Parts();
        roofOver(fp, M.stone(32, 40, 5), 10, w * bendScale(s + w / 2, side, e0), 16, false);
        fp.build(filler);
        addStatic(filler);
        s += w;
        continue;
      }
      if (Math.abs(e0 - e1) > 0.25) {
        // the building line is splaying out or in here
        angledWall(s, side * e0, s + w, side * e1, seed++);
        s += w;
        continue;
      }
      const hMin = st.hMin ?? 13, hMax = st.hMax ?? 24;
      const name = st.names ? st.names[Math.floor(r() * st.names.length)] : undefined;
      const tint = st.tints ? st.tints[Math.floor(r() * st.tints.length)] : undefined;
      tenement(s, w, side, hMin + r() * (hMax - hMin), seed++, name, (e0 + e1) / 2, tint, st.depth ?? 10);
      s += w;
      if (r() < 0.22 && s < sTo - 10 && Math.abs(edge(s) - HALF_STREET) < 0.1 && Math.abs(theta(s + 2) - theta(s - 2)) < 0.02) {
        const cw = 1.6;
        close(s, side, cw, CLOSES[closeIdx++ % CLOSES.length]);
        s += cw;
      }
    }
  }
}

/**
 * A side street that isn't on the route: a gap in the buildings, a stub of road running off at an
 * angle with buildings either side, and a council barrier line across the mouth (breakable for points).
 */
export function sideStreet(s: number, side: 1 | -1, name: string, angle = 90, width = 9, seed = 1) {
  const e = side > 0 ? edgeR(s) : edgeL(s);
  const mouth = toWorld(s, side * e, 0);
  const out = right(s).multiplyScalar(side);
  const fwd = forward(s);
  const a = (angle * Math.PI) / 180;
  // direction the side street runs (away from the route)
  const dir = out.clone().multiplyScalar(Math.sin(a)).addScaledVector(fwd, Math.cos(a)).normalize();
  const len = 34;
  const y = baseH(s);
  const yaw = Math.atan2(dir.x, dir.z);
  const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, len), M.stone(30, 34, 9, width / 4, len / 4));
  road.position.copy(mouth).addScaledVector(dir, len / 2);
  // kept below the street surface, so where an angled stub tucks under the main road it can't show
  road.position.y = y - 0.32;
  road.rotation.y = yaw;
  road.receiveShadow = true;
  addStatic(road);
  // buildings down both sides of it
  const r = rng(seed * 31 + 7);
  // the first stretch of each side is the main street's own lands, seen end-on: start behind them
  // (overlapping them left two walls in the same plane, flickering)
  const START = 10.6;
  for (const k of [-1, 1]) {
    let d = START;
    while (d < len) {
      const w = Math.min(len - d, 7 + r() * 6);
      const h = 12 + r() * 9;
      const [fmap, femit] = facadeTex(26 + Math.floor(r() * 4) * 4, 42 + Math.floor(r() * 3) * 5, 1 + Math.floor(r() * 3));
      const map = fmap.clone();
      map.repeat.set(w / 12, h / 12.8);
      map.needsUpdate = true;
      const em = femit.clone();
      em.repeat.copy(map.repeat);
      em.needsUpdate = true;
      const fm = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 });
      const plain = M.stone(30, 40, 3);
      const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(k * (width / 2 + 4.5));
      const centre = mouth.clone().addScaledVector(dir, d + w / 2).add(lateral);
      // on a stub that leaves at a shallow angle, the near row would swing back over the main
      // street: leave out any land whose footprint reaches into it
      if (intrudes(centre, dir, 4.5, w / 2)) {
        d += w;
        continue;
      }
      const m = new THREE.Mesh(new THREE.BoxGeometry(9, h, w), k > 0 ? [plain, fm, M.slate(), plain, plain, plain] : [fm, plain, M.slate(), plain, plain, plain]);
      m.position.copy(centre);
      m.position.y = y - 0.6 + h / 2;
      m.castShadow = true;
      const blk = new THREE.Group();
      blk.position.copy(m.position);
      blk.rotation.y = yaw;
      m.position.set(0, 0, 0);
      blk.add(m);
      const rp = new Parts();
      const rise = roofOver(rp, plain, 9, w, h / 2, false);
      chimney(rp, plain, dressed(30, 48), h / 2 + 0.3 + rise, w / 2 - 1, 3);
      rp.build(blk);
      addStatic(blk);
      d += w;
    }
  }
  // and a land across the far end, so looking up the street you see buildings, not sky
  {
    const r2 = rng(seed * 17 + 3);
    const across = width + 18, h = 17 + r2() * 5;
    const [fmap, femit] = facadeTex(30, 44, 2);
    const map = fmap.clone();
    map.repeat.set(across / 12, h / 12.8);
    map.needsUpdate = true;
    const em = femit.clone();
    em.repeat.copy(map.repeat);
    em.needsUpdate = true;
    const fm = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 });
    const plain = M.stone(30, 40, 3);
    const blk = new THREE.Group();
    blk.position.copy(mouth).addScaledVector(dir, len + 4.5);
    blk.position.y = y - 0.6 + h / 2;
    blk.rotation.y = yaw;
    // facing back down the side street (local -z points at the route)
    const m = new THREE.Mesh(new THREE.BoxGeometry(across, h, 9), [plain, plain, M.slate(), plain, plain, fm]);
    m.castShadow = true;
    blk.add(m);
    // the ridge runs across the end of the street
    const rp = new Parts();
    const rise = roofOver(rp, plain, 9, across, h / 2, false);
    chimney(rp, plain, dressed(30, 48), h / 2 + 0.3 + rise, 0, 4);
    const rg = new THREE.Group();
    rg.rotation.y = Math.PI / 2;
    rp.build(rg);
    blk.add(rg);
    addStatic(blk);
  }
  // street sign on the corner
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshStandardMaterial({ map: signTex([name], '#f4f1e6', '#111', 384, 72, 'Lilita One, Arial Black') }));
  sg.position.copy(mouth).addScaledVector(fwd, -width / 2 - 0.3).addScaledVector(out, 0.2);
  sg.position.y = y + 3.2;
  sg.rotation.y = Math.atan2(-out.x, -out.z) + Math.PI;
  addStatic(sg);
  return { mouth, dir, out, width };
}

/** Does a box footprint (centre, long axis `along`, half sizes) reach into the street? */
function intrudes(centre: THREE.Vector3, along: THREE.Vector3, halfAcross: number, halfAlong: number) {
  const across = new THREE.Vector3(along.z, 0, -along.x);
  for (const a of [-1, 0, 1]) {
    for (const b of [-1, 0, 1]) {
      const p = centre.clone().addScaledVector(across, a * halfAcross).addScaledVector(along, b * halfAlong);
      const r = toRoad(p.x, p.z);
      const e = r.u >= 0 ? edgeR(r.s) : edgeL(r.s);
      if (Math.abs(r.u) < e + 0.3) return true;
    }
  }
  return false;
}

/** A facade running at an angle between two road points (the splayed entry/exit of a bay). */
export function angledWall(sA: number, uA: number, sB: number, uB: number, seed: number) {
  const A = toWorld(sA, uA, 0), B = toWorld(sB, uB, 0);
  const d = B.clone().sub(A).setY(0);
  const len = d.length();
  const yaw = Math.atan2(d.x, d.z);
  const out = right((sA + sB) / 2).multiplyScalar(Math.sign(uA + uB));
  const depth = 8, height = 16;
  const ground = Math.min(baseH(sA), baseH(sB)) - 0.6;
  const [fmap, femit] = facadeTex(30, 45, 1 + (seed % 3));
  const map = fmap.clone();
  map.repeat.set((len + 1) / 12, height / 12.8);
  map.needsUpdate = true;
  const em = femit.clone();
  em.repeat.copy(map.repeat);
  em.needsUpdate = true;
  const facade = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 });
  const plain = M.stone(30, 40, 3);
  const xDir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const facadeOnPlusX = xDir.dot(out) < 0;
  const m = new THREE.Mesh(new THREE.BoxGeometry(depth, height, len + 1.2), facadeOnPlusX ? [facade, plain, M.slate(), plain, plain, plain] : [plain, facade, M.slate(), plain, plain, plain]);
  m.position.copy(A).add(B).multiplyScalar(0.5).addScaledVector(out, depth / 2);
  m.position.y = ground + height / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  const blk = new THREE.Group();
  blk.position.copy(m.position);
  blk.rotation.y = yaw;
  m.position.set(0, 0, 0);
  blk.add(m);
  const rp = new Parts();
  const rise = roofOver(rp, plain, depth, len + 1.2, height / 2, false);
  chimney(rp, plain, dressed(30, 50), height / 2 + 0.3 + rise, 0, 4);
  const fx = facadeOnPlusX ? 1 : -1;
  rp.add(moulding(len + 1.2, 0.3, 0.4), dressed(30, 52), [(fx * depth) / 2, height / 2 - 0.4, 0], null, [fx, 1, 1]);
  rp.build(blk);
  addStatic(blk);
}

/** Splayed walls and set-back tenements for each side bay. `occupied` lists [s0, s1] taken by set pieces. */
export function bayFacades(occupied: [number, number][]) {
  const r = rng(321);
  let seed = 900;
  for (const b of BAYS) {
    angledWall(b.s0, HALF_STREET, b.s0 + BAY_T, b.w, seed++);
    angledWall(b.s1 - BAY_T, b.w, b.s1, HALF_STREET, seed++);
    let s = b.s0 + BAY_T;
    const end = b.s1 - BAY_T;
    while (s < end - 0.5) {
      const occ = occupied.find(([a, z]) => s >= a - 0.01 && s < z);
      if (occ) {
        s = occ[1];
        continue;
      }
      const nextOcc = occupied.filter(([a]) => a > s).sort((x, y) => x[0] - y[0])[0];
      let w = Math.min(8 + r() * 6, end - s);
      if (nextOcc && s + w > nextOcc[0]) w = nextOcc[0] - s;
      if (w > 0.5) tenement(s, w, 1, 14 + r() * 8, seed++, undefined, b.w);
      s += w;
    }
  }
}

/**
 * One continuous, slippery rail along each building line (including the splayed bay entries).
 * Glancing blows slide off it instead of catching on building corners.
 */
export function guideWalls(sFrom: number, sTo: number, sides: (1 | -1)[] = [1, -1]) {
  const body = G.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const step = 2;
  for (const side of sides) {
    for (let s = sFrom; s < sTo; s += step) {
      const s2 = Math.min(sTo, s + step);
      const A = toWorld(s, side * (side > 0 ? edgeR(s) : edgeL(s)), 0);
      const B = toWorld(s2, side * (side > 0 ? edgeR(s2) : edgeL(s2)), 0);
      const d = B.clone().sub(A).setY(0);
      const len = d.length();
      const yaw = Math.atan2(d.x, d.z);
      const out = right(s).multiplyScalar(side);
      const c = A.clone().add(B).multiplyScalar(0.5).addScaledVector(out, 0.35);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      G.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.35, 4, len / 2 + 0.06)
          .setTranslation(c.x, (A.y + B.y) / 2 + 3, c.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0)
          .setRestitution(0.05),
        body,
      );
    }
  }
}

export { L };
