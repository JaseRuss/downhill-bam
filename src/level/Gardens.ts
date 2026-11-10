import * as THREE from 'three';
import { addStatic } from '../world/Batcher';
import { M, color, mapMat } from '../art/Materials';
import { canvas, rng, signTex } from '../art/Textures';
import { MARKS, JOIN_S, baseH, edgeL, edgeR, roadGroup, toRoad, toWorld } from '../world/Road';
import { bx, cyl, cone } from './SetPieces';
import * as LM2 from '../art/Landmarks2';

/**
 * Princes Street Gardens: the valley between Princes Street and the Old Town. A grassy bank drops
 * from the railings to the lawns, the railway runs along the bottom in a cutting, and the far side
 * climbs (castle rock in the west, grass further east) up to the Royal Mile, whose tenements sit on
 * top of it. The Mound crosses the middle with the two galleries; Waverley's roof fills the east end.
 */

/** Gardens start this far along Princes Street (before that, Lothian Road is too close). */
export const GARDEN_START = 14;
/** The Mound crosses the valley here (offsets along Princes Street). */
const MOUND: [number, number] = [150, 170];
/** Waverley Station's roof from here to the East End. */
const WAVERLEY = 238;

const DROP = 7; // the lawns sit this far below the street
const add = <T extends THREE.Object3D>(o: T) => addStatic(o);
/** Same look, drawn from both sides (for upright strips whose winding faces away). */
const twoSided = (m: THREE.Material) => {
  const c = m.clone();
  c.side = THREE.DoubleSide;
  return c;
};
const P0 = () => MARKS.princes;

/** Room behind the street before the ground would run into another road (the Royal Mile, Lothian Road). */
function room(s: number) {
  let ok = 12;
  for (let u = 12; u <= 84; u += 1) {
    const p = toWorld(s, u, 0);
    const r = toRoad(p.x, p.z);
    const other = r.s < MARKS.princes - 6 || r.s > MARKS.eastend + 6;
    const e = r.u >= 0 ? edgeR(r.s) : edgeL(r.s);
    if (other && Math.abs(r.u) < e + 5) break;
    ok = u;
  }
  return ok;
}

/** Ground level of the Old Town above the gardens at a world z (the Royal Mile runs along +z). */
function oldTownH(z: number) {
  return baseH(Math.max(-50, Math.min(JOIN_S, z))) - 0.7;
}

/**
 * A strip of ground following the street: `section(s)` gives [u, height] points across it (the same
 * number every time). Built in ~30 m pieces so the scenery batcher can chunk and cull it.
 */
function ribbon(sA: number, sB: number, step: number, section: (s: number) => [number, number][], mat: THREE.Material, uvScale = 4) {
  for (let s0 = sA; s0 < sB - 0.01; s0 += 30) {
    const s1 = Math.min(sB, s0 + 30);
    const rows: number[] = [];
    for (let s = s0; s < s1 - 0.001; s += step) rows.push(s);
    rows.push(s1);
    const secs = rows.map(section);
    const n = secs[0].length;
    const c = toWorld((s0 + s1) / 2, secs[0][n >> 1][0], 0);
    c.y = 0;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    rows.forEach((s, i) => {
      for (const [u, y] of secs[i]) {
        const p = toWorld(s, u, 0);
        pos.push(p.x - c.x, y, p.z - c.z);
        uv.push(u / uvScale, s / uvScale);
      }
    });
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = a + 1, d = a + n, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(c);
    m.receiveShadow = true;
    add(m);
  }
}

/** A vertical face hanging below a cross-section (closes the end of the Mound). */
function endWall(s: number, top: [number, number][], bottom: number, mat: THREE.Material, facing: 1 | -1) {
  const pos: number[] = [], idx: number[] = [];
  const c = toWorld(s, top[top.length >> 1][0], 0);
  c.y = 0;
  top.forEach(([u, y]) => {
    const p = toWorld(s, u, 0);
    pos.push(p.x - c.x, y, p.z - c.z, p.x - c.x, bottom, p.z - c.z);
  });
  for (let j = 0; j < top.length - 1; j++) {
    const a = j * 2, b = a + 1, d = a + 2, e = a + 3;
    if (facing > 0) idx.push(a, d, b, d, e, b);
    else idx.push(a, b, d, d, b, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(c);
  add(m);
}

let grassMat: THREE.MeshStandardMaterial | null = null;
function grass() {
  if (grassMat) return grassMat;
  const c = canvas(128, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#5c8a3e';
  g.fillRect(0, 0, 128, 128);
  // mowing stripes and a bit of texture
  for (let x = 0; x < 128; x += 32) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x, 0, 16, 128);
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(40,70,25,0.35)' : 'rgba(150,190,90,0.25)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  grassMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  return grassMat;
}

function tree(p: THREE.Vector3, r: () => number) {
  const g = new THREE.Group();
  g.position.copy(p);
  const h = 3 + r() * 2.5;
  if (r() < 0.22) {
    // a conifer
    g.add(cyl(0.22, 0.32, h * 0.5, M.wood(24, 22, 2), 0, h * 0.25, 0, 6));
    for (let k = 0; k < 3; k++) g.add(cone(2.4 - k * 0.6, 3.2, color(0x2f5a34, 0.9), 0, h * 0.45 + k * 1.6, 0, 8));
  } else {
    const greens = [0x5e8f45, 0x6c9a4a, 0x4f7f3c, 0x78a552, 0x587f3a];
    g.add(cyl(0.22, 0.34, h, M.wood(24, 26, 3), 0, h / 2, 0, 7));
    const R = 2.2 + r() * 1.4;
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(R * (0.7 + r() * 0.35), 1), color(greens[Math.floor(r() * greens.length)], 0.9));
      m.position.set((r() - 0.5) * R, h + (r() - 0.2) * R * 0.8, (r() - 0.5) * R);
      m.scale.y = 0.85;
      g.add(m);
    }
  }
  g.traverse((o: any) => o.isMesh && (o.castShadow = true));
  add(g);
}

/** One of the galleries on the Mound: a sandstone temple with a portico facing Princes Street. */
function gallery(s: number, u: number, y: number, len: number) {
  const g = roadGroup(s, u, 0);
  g.position.y = y;
  // long axis runs across the street (local x = -u); the portico faces Princes Street (+x)
  g.add(LM2.galleryModel(len));
  add(g);
}

/** The Ross Fountain: ornate cast iron, all teal and gold, in the West Gardens. */
function rossFountain(s: number, u: number, y: number) {
  const g = roadGroup(s, u, 0);
  g.position.y = y;
  g.add(LM2.rossFountainModel());
  add(g);
}

/** The floral clock, planted on the bank by the railings and tilted towards the street. */
function floralClock(s: number, u: number, y: number) {
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3f7a2e';
  g.fillRect(0, 0, 256, 256);
  const cols = ['#e33b5b', '#f2c14e', '#f6f0dc', '#8e44ad', '#ff7a1a'];
  for (let i = 0; i < 1800; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 124;
    const ring = Math.floor(r / 22);
    g.fillStyle = cols[ring % cols.length];
    g.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 3, 3);
  }
  g.fillStyle = '#1d3a14';
  g.font = 'bold 22px Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][h - 1], 128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const grp = roadGroup(s, u, 0);
  grp.position.y = y;
  const face = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  // lie it on the bank, tipped up towards Princes Street (+x local)
  face.rotation.set(-Math.PI / 2, 0, 0);
  const tilt = new THREE.Group();
  tilt.rotation.z = -0.45;
  tilt.add(face);
  const hand = (len: number, a: number) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, len), M.black());
    h.position.set(Math.sin(a) * len * 0.5, 0.06, -Math.cos(a) * len * 0.5);
    h.rotation.y = -a;
    tilt.add(h);
  };
  hand(2.2, 2.2);
  hand(2.9, 4.4);
  grp.add(tilt);
  add(grp);
}

/** Waverley Station's ridge-and-furrow glass roof, just below street level at the east end. */
function waverley(sA: number, sB: number) {
  const glass = color(0x8fa3ad, 0.25, 0.4), steel = color(0x5a6168, 0.5, 0.6);
  const y = (s: number) => baseH(s) - 2.4;
  const uMax = Math.max(40, room((sA + sB) / 2) - 2);
  for (let u = 15; u < uMax; u += 6) {
    ribbon(sA, sB, 4, (s) => [[u, y(s)], [u + 3, y(s) + 1.3], [u + 6, y(s)]], glass, 6);
    ribbon(sA, sB, 4, (s) => [[u + 2.9, y(s) + 1.31], [u + 3.1, y(s) + 1.31]], steel, 6);
  }
  // a skirt along the street side and a sign
  ribbon(sA, sB, 4, (s) => [[14.6, baseH(s) - 0.1], [14.8, y(s) - 4]], twoSided(steel), 6);
  const sg = roadGroup((sA + sB) / 2, 14.4, 0);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), mapMat(signTex(['WAVERLEY STATION'], '#14284a', '#fff', 512, 64)));
  plate.position.set(0, 1.2, 0);
  plate.rotation.y = Math.PI / 2;
  sg.add(plate);
  sg.add(bx(0.1, 1.4, 9.4, M.metal(), -0.06, 1.2, 0));
  add(sg);
}

/** A parked train on the line through the gardens. */
function train(sA: number, u: number, y: number) {
  for (let k = 0; k < 4; k++) {
    const s = sA + k * 21;
    const g = roadGroup(s, u, 0);
    g.position.y = y;
    g.add(LM2.trainCarModel(k === 3));
    add(g);
  }
}

export function princesGardens(limit: number) {
  const p0 = P0();
  const sA = p0 + GARDEN_START, sB = Math.min(MARKS.eastend - 1, limit);
  const sGardensEnd = Math.min(p0 + WAVERLEY, sB);
  const [m0, m1] = [p0 + MOUND[0], p0 + MOUND[1]];
  const street = (s: number) => baseH(s);
  const lawn = (s: number) => baseH(s) - DROP;
  const rooms = new Map<number, number>();
  const roomAt = (s: number) => {
    const k = Math.round(s);
    let v = rooms.get(k);
    if (v === undefined) rooms.set(k, (v = room(k)));
    return v;
  };

  // railings along the street (the full length, gardens or station)
  for (let s = p0 + 2; s < sB; s += 4) {
    const g = roadGroup(s + 2, edgeR(s + 2) + 0.15, 0);
    for (let z = -2; z < 2; z += 0.25) g.add(bx(0.03, 1.4, 0.03, M.black(), 0, 0.7, z));
    g.add(bx(0.05, 0.05, 4.05, M.black(), 0, 1.35, 0));
    g.add(bx(0.4, 0.4, 4.05, M.stone(30, 40, 6), 0, 0.1, 0));
    add(g);
  }

  // the bank from the pavement down to the lawns (the full length; under the station roof too)
  const bankMat = color(0x55803c, 0.95);
  ribbon(sA, sB, 3, (s) => [[13.4, street(s) + 0.02], [14.5, street(s) - 1.2], [16.5, street(s) - 4.4], [18.5, lawn(s) + 0.3], [19.5, lawn(s)]], bankMat);
  // retaining wall face under the edge of the pavement
  ribbon(sA, sB, 6, (s) => [[13.5, street(s) + 0.05], [13.55, street(s) - 1.6]], twoSided(M.stone(30, 44, 7)), 4);

  // the lawns, the railway cutting and the far side climbing to the Old Town
  ribbon(sA, sGardensEnd, 3, (s) => [[19.5, lawn(s)], [43, lawn(s)]], grass());
  ribbon(sA, sGardensEnd, 3, (s) => [[43, lawn(s)], [43.6, lawn(s) - 0.6], [49.6, lawn(s) - 0.6], [50.2, lawn(s)]], color(0x6b5f55, 0.95));
  for (const ru of [44.8, 46.2, 47.6, 49.0]) ribbon(sA, sGardensEnd, 6, (s) => [[ru - 0.05, lawn(s) - 0.45], [ru + 0.05, lawn(s) - 0.45]], color(0x9a9a9a, 0.3, 0.8), 6);
  const farSide = (s: number): [number, number][] => {
    const top = Math.max(56, roomAt(s) - 1);
    const zTop = toWorld(s, top, 0).z;
    const h = Math.max(lawn(s) + 3, oldTownH(zTop));
    // the Old Town's buildings start a few metres short of `top` (it stops just inside their
    // footprint), so reach full height well before that or their backs hang out over the slope
    const crest = Math.max(54.5, Math.min(top - 7, 64));
    const foot = 50.2;
    return [[foot, lawn(s)], [foot + (crest - foot) * 0.35, lawn(s) + (h - lawn(s)) * 0.45], [crest, h], [top, h]];
  };
  // castle rock where the far side is under the castle, grass further east
  const rockEnd = Math.min(sGardensEnd, p0 + 118);
  const rock = new THREE.MeshStandardMaterial({ color: 0x7a7165, roughness: 0.95, flatShading: true });
  // the rock gets a craggy, uneven face
  const crag = (s: number): [number, number][] => {
    const f = farSide(s);
    const j = Math.sin(s * 0.9) * 1.4 + Math.sin(s * 0.37 + 1) * 1.8;
    return [f[0], [f[1][0] + Math.sin(s * 0.5) * 1.2, f[1][1] + j], [f[2][0], f[2][1] + Math.max(0, j * 0.4)], f[3]];
  };
  ribbon(sA, rockEnd, 2, crag, rock, 6);
  if (sGardensEnd > rockEnd) ribbon(rockEnd, sGardensEnd, 4, farSide, color(0x4f7a38, 0.95), 6);

  // gravel paths and cross paths
  const gravel = color(0xcab79a, 0.95);
  for (const [a, b] of [[sA, m0], [m1, sGardensEnd]] as [number, number][]) {
    if (b <= a) continue;
    for (const pu of [24, 38]) ribbon(a, b, 6, (s) => [[pu - 1.2, lawn(s) + 0.04], [pu + 1.2, lawn(s) + 0.04]], gravel, 4);
  }
  for (const d of [60, 110, 200]) {
    const s = p0 + d;
    if (s > sGardensEnd - 3) continue;
    ribbon(s - 1.2, s + 1.2, 2.4, (ss) => [[19.5, lawn(ss) + 0.035], [43, lawn(ss) + 0.035]], gravel, 4);
  }

  // the Mound: an earth causeway from the street up to the Old Town, with the two galleries on it
  if (m1 < sGardensEnd) {
    const top = (s: number): [number, number][] => {
      const fs = farSide(s);
      const h = fs[2][1];
      return [[13.4, street(s) + 0.05], [30, street(s) + (h - street(s)) * 0.25], [50, street(s) + (h - street(s)) * 0.7], [fs[2][0], h], [fs[3][0], h]];
    };
    // paved road along the top, grass verges down the sides
    ribbon(m0 + 2.5, m1 - 2.5, 2, top, M.stone(30, 48, 142, 2, 2), 6);
    ribbon(m0, m0 + 2.5, 2.5, top, color(0x55803c, 0.95), 6);
    ribbon(m1 - 2.5, m1, 2.5, top, color(0x55803c, 0.95), 6);
    const wall = twoSided(M.stone(32, 46, 141, 3, 1));
    endWall(m0, top(m0), lawn(m0) - 1, wall, -1);
    endWall(m1, top(m1), lawn(m1) - 1, wall, 1);
    const mid = (m0 + m1) / 2;
    const yAt = (u: number) => {
      const t = top(mid);
      for (let i = 0; i < t.length - 1; i++) if (u <= t[i + 1][0]) return t[i][1] + ((t[i + 1][1] - t[i][1]) * (u - t[i][0])) / (t[i + 1][0] - t[i][0]);
      return t[t.length - 1][1];
    };
    gallery(mid, 26, yAt(20) - 0.6, 15);
    gallery(mid, 45, yAt(39) - 0.8, 13);
  }

  // the Ross Fountain and the floral clock
  if (p0 + 60 < sGardensEnd) rossFountain(p0 + 52, 31, lawn(p0 + 52));
  if (m0 - 6 < sGardensEnd) floralClock(m0 - 6, 15.2, street(m0 - 6) - 2.5);

  // trees, keeping off the paths, the railway, the Mound and the landmarks
  const r = rng(321);
  const clearOf: [number, number, number][] = [[p0 + 52, 31, 7], [p0 + 210, 30, 9]];
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < 75; tries++) {
    const s = sA + 3 + r() * (sGardensEnd - sA - 6);
    const u = 20.5 + r() * 21.5;
    if (Math.abs(u - 24) < 2.4 || Math.abs(u - 38) < 2.4) continue;
    if (s > m0 - 4 && s < m1 + 4) continue;
    if (clearOf.some(([cs, cu, cr]) => Math.hypot(cs - s, cu - u) < cr)) continue;
    const p = toWorld(s, u, 0);
    p.y = lawn(s);
    tree(p, r);
    placed++;
  }
  // a few on the far slope too
  for (let s = sA + 8; s < sGardensEnd - 4; s += 17) {
    if (s > m0 - 4 && s < m1 + 4) continue;
    const fs = farSide(s);
    const u = fs[1][0] + r() * 2;
    const p = toWorld(s, u, 0);
    p.y = fs[1][1] - 0.4;
    if (s > p0 + 118) tree(p, r);
  }
  // benches beside the paths
  for (let s = sA + 10; s < sGardensEnd - 5; s += 26) {
    if (s > m0 - 4 && s < m1 + 4) continue;
    const g = roadGroup(s, 26, 0);
    g.position.y = lawn(s);
    g.add(bx(0.5, 0.06, 1.8, M.wood(30, 40, 5), 0, 0.45, 0));
    g.add(bx(0.06, 0.45, 1.8, M.wood(30, 40, 5), -0.25, 0.7, 0));
    add(g);
  }

  if (p0 + 60 < sGardensEnd) train(p0 + 60, 47.6, lawn(p0 + 60) - 0.45);
  if (sGardensEnd < sB) waverley(sGardensEnd, sB);
}

/**
 * Is a world point inside the gardens/station area (keeps the backdrop city out)? Measured from
 * Princes Street itself, not the nearest road: much of the valley is nearer the Royal Mile.
 */
let line: { s: number; x: number; z: number; rx: number; rz: number }[] = [];
let lineFor = NaN;
export function inGardens(x: number, z: number) {
  if (lineFor !== MARKS.princes) {
    lineFor = MARKS.princes;
    line = [];
    for (let s = MARKS.princes; s <= MARKS.eastend; s += 2) {
      const p = toWorld(s, 0, 0), q = toWorld(s, 1, 0);
      line.push({ s, x: p.x, z: p.z, rx: q.x - p.x, rz: q.z - p.z });
    }
  }
  let best = Infinity, b = line[0];
  for (const q of line) {
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d < best) {
      best = d;
      b = q;
    }
  }
  const u = (x - b.x) * b.rx + (z - b.z) * b.rz;
  return b.s > MARKS.princes + GARDEN_START - 4 && b.s < MARKS.eastend + 2 && u > 0 && u < 84;
}
