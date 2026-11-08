import * as THREE from 'three';
import { RAPIER } from '../core/Physics';
import { G } from '../ctx';
import { addStatic } from '../world/Batcher';
import { M, color } from '../art/Materials';
import { facadeTex, shopTex, signTex, SHOP_NAMES, rng } from '../art/Textures';
import { HALF_STREET, BAYS, BAY_T, baseH, theta, toWorld, L, roadGroup, right, edgeL, edgeR, forward } from '../world/Road';

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

  const hue = 26 + Math.floor(r() * 4) * 4;
  const light = 40 + Math.floor(r() * 4) * 5;
  const [fmap, femit] = facadeTex(hue, light, 1 + Math.floor(r() * 3));
  const map = fmap.clone();
  map.repeat.set(width / 12, hTotal / 12.8);
  map.needsUpdate = true;
  const em = femit.clone();
  em.repeat.copy(map.repeat);
  em.needsUpdate = true;
  const facade = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 });
  if (tint !== undefined) facade.color.setHex(tint);
  const plain = M.stone(hue, light - 6, 3, width / 8, hTotal / 8);
  const roofMat = M.slate();
  // +X face is local left (-u). The face pointing at the road is +X for right-side buildings.
  const mats = side > 0 ? [facade, plain, plain, plain, plain, plain] : [plain, facade, plain, plain, plain, plain];
  const box = new THREE.Mesh(new THREE.BoxGeometry(depth, hTotal, width), mats);
  box.position.y = hTotal / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);

  // pitched slate roof (a box turned 45° makes a ridge)
  const rw = depth / Math.SQRT2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(rw, rw, width + 0.2), roofMat);
  roof.rotation.z = Math.PI / 4;
  roof.position.y = hTotal;
  roof.castShadow = true;
  g.add(roof);

  // crow-stepped gable facing the street on some lands
  if (r() < 0.35) {
    const gw = Math.min(width - 1, 7);
    const face = side > 0 ? 1 : -1; // local x of the street-facing side
    for (let i = 0; i < 5; i++) {
      const w2 = gw * (1 - i / 5);
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, w2), M.stone(hue, light, 2, w2 / 6, 0.2));
      step.position.set(face * (depth / 2 - 0.35), hTotal + 0.45 + i * 0.9, 0);
      step.castShadow = true;
      g.add(step);
    }
  }
  // chimney stacks with pots
  const nCh = 1 + Math.floor(r() * 3);
  for (let i = 0; i < nCh; i++) {
    const z = (-0.4 + (0.8 * (i + 0.5)) / nCh) * width;
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.6, 2.2), M.stone(hue, light - 8, 4));
    ch.position.set((r() - 0.5) * 2, hTotal + 2.1, z);
    ch.castShadow = true;
    g.add(ch);
    for (let k = 0; k < 4; k++) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.6, 8), color(0xa8552e, 0.9));
      pot.position.set(ch.position.x, hTotal + 3.7, z - 0.75 + k * 0.5);
      g.add(pot);
    }
  }

  // ground floor shopfront
  const name = forcedName ?? SHOP_NAMES[shopIdx++ % SHOP_NAMES.length];
  const [smap, semit] = shopTex(name, seed);
  const shopW = Math.min(width - 0.8, 12);
  const shopMat = new THREE.MeshStandardMaterial({ map: smap, emissiveMap: semit, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.6 });
  const shopFrame = color(0x222222, 0.6);
  const shopMats = side > 0 ? [shopMat, shopFrame, shopFrame, shopFrame, shopFrame, shopFrame] : [shopFrame, shopMat, shopFrame, shopFrame, shopFrame, shopFrame];
  const shop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, shopW), shopMats);
  const groundLocal = baseH(sc) + 0.14 - ground;
  shop.position.set((side > 0 ? 1 : -1) * (depth / 2 + 0.1), groundLocal + 1.8, 0);
  shop.receiveShadow = true;
  g.add(shop);

  // projecting hanging sign now and again
  if (r() < 0.3) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.06), M.black());
    const bx = (side > 0 ? 1 : -1) * (depth / 2 + 0.7);
    bracket.position.set(bx, groundLocal + 4.4, -shopW / 2 + 1);
    g.add(bracket);
    const sm = new THREE.MeshStandardMaterial({ map: signTex([name.split(' ')[0], '★'], '#5a1420', '#e8c45a', 128, 128, 'Georgia') });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.06), [M.black(), M.black(), M.black(), M.black(), sm, sm]);
    sign.position.set(bx + (side > 0 ? 0.15 : -0.15), groundLocal + 3.85, -shopW / 2 + 1);
    g.add(sign);
  }
  addStatic(g);
  // no collider here: the smooth guide rail along the building line does the job without corners
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
  road.position.y = y - 0.12;
  road.rotation.y = yaw;
  road.receiveShadow = true;
  addStatic(road);
  // buildings down both sides of it
  const r = rng(seed * 31 + 7);
  for (const k of [-1, 1]) {
    let d = 0;
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
      const m = new THREE.Mesh(new THREE.BoxGeometry(9, h, w), k > 0 ? [plain, fm, M.slate(), plain, plain, plain] : [fm, plain, M.slate(), plain, plain, plain]);
      const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(k * (width / 2 + 4.5));
      m.position.copy(mouth).addScaledVector(dir, d + w / 2 + 1.5).add(lateral);
      m.position.y = y - 0.6 + h / 2;
      m.rotation.y = yaw;
      m.castShadow = true;
      addStatic(m);
      d += w;
    }
  }
  // street sign on the corner
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshStandardMaterial({ map: signTex([name], '#f4f1e6', '#111', 384, 72, 'Lilita One, Arial Black') }));
  sg.position.copy(mouth).addScaledVector(fwd, -width / 2 - 0.3).addScaledVector(out, 0.2);
  sg.position.y = y + 3.2;
  sg.rotation.y = Math.atan2(-out.x, -out.z) + Math.PI;
  addStatic(sg);
  return { mouth, dir, out, width };
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
  m.rotation.y = yaw;
  m.castShadow = true;
  m.receiveShadow = true;
  addStatic(m);
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
