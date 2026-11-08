import * as THREE from 'three';
import { G } from '../ctx';
import { M, color, mapMat } from '../art/Materials';
import { signTex } from '../art/Textures';
import { theta, toWorld, toWorldAbs } from '../world/Road';
import type { Part, PartOpts } from '../destruction/Destruction';

const Y = new THREE.Vector3(0, 1, 0);
export const yawQ = (a: number) => new THREE.Quaternion().setFromAxisAngle(Y, a);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat as any);
  m.position.set(x, y, z);
  return m;
}

export function communalBin(s: number, u: number) {
  const g = new THREE.Group();
  const plastic = color(0x3d4a3e, 0.6);
  g.add(mesh(new THREE.BoxGeometry(1.2, 1.15, 0.9), plastic, 0, 0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(1.26, 0.1, 0.96), color(0x2b332c, 0.6), 0, 0.66, 0));
  const label = mesh(new THREE.PlaneGeometry(0.8, 0.3), mapMat(signTex(['COMMUNAL WASTE', 'no haggis'], '#2b332c', '#e5e5e5', 256, 96)), 0, 0.25, 0.452);
  g.add(label);
  for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]) {
    const w = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), M.black(), x, -0.58, z);
    w.rotation.x = Math.PI / 2;
    g.add(w);
  }
  return G.destruction.add(toWorld(s, u, 0.66), theta(s), [0.6, 0.66, 0.45], {
    visual: g, dynamic: true, density: 90, points: 100, label: 'Communal Bin', sound: 'metal', restitution: 0.3,
  });
}

export function bollard(s: number, u: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.9, 12), M.black()));
  g.add(mesh(new THREE.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.black(), 0, 0.45, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.06, 12), M.gold(), 0, 0.3, 0));
  return G.destruction.add(toWorld(s, u, 0.45), 0, [0.12, 0.45, 0.12], {
    shape: 'cyl', visual: g, density: 1800, release: 45, points: 40, label: 'Bollard', sound: 'metal', retain: 0.85,
  });
}

export function lampPost(s: number, u: number) {
  const g = new THREE.Group();
  const iron = color(0x1d2226, 0.5, 0.6);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.6, 10), iron));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), iron, 0, -2.1, 0));
  const lantern = new THREE.Group();
  lantern.add(mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), M.emissive(0xffcf7a, 1.6)));
  lantern.add(mesh(new THREE.ConeGeometry(0.3, 0.25, 4), iron, 0, 0.37, 0));
  lantern.children[1].rotation.y = Math.PI / 4;
  lantern.position.y = 2.55;
  g.add(lantern);
  return G.destruction.add(toWorld(s, u, 2.3), theta(s), [0.09, 2.3, 0.09], {
    shape: 'cyl', visual: g, density: 1200, release: 35, points: 120, label: 'Lamp Post', sound: 'metal', retain: 0.88,
  });
}

const BOARD_TEXT = [
  ['HAGGIS SUPPER', '£14'], ['GHOST TOURS', '↓ THIS WAY ↓'], ['KILTS', '50% OFF*'], ['TABLET', 'TOOTH ROT GUARANTEED'],
  ['FREE WIFI', 'ASK INSIDE'], ['TODAY:', 'DREICH'], ['WHISKY', 'TASTINGS 10AM'], ['SHORTBREAD', 'BUY 1 GET 1 HEAVY'],
  ['SLOW', 'TROLLEYS'], ['NO', 'TROLLEYS'],
];

export function aBoard(s: number, u: number, i = Math.floor(Math.random() * BOARD_TEXT.length)) {
  const g = new THREE.Group();
  const t = BOARD_TEXT[i % BOARD_TEXT.length];
  const face = mapMat(signTex(t, '#1b1b1b', '#f4f1e6', 192, 256, 'Special Elite, monospace'));
  const wood = M.wood(30, 40, 3);
  for (const sgn of [-1, 1]) {
    const b = mesh(new THREE.BoxGeometry(0.6, 0.9, 0.03), [wood, wood, wood, wood, sgn > 0 ? face : wood, sgn < 0 ? face : wood]);
    b.position.z = sgn * 0.1;
    b.rotation.x = -sgn * 0.2;
    g.add(b);
  }
  return G.destruction.add(toWorld(s, u, 0.46), theta(s), [0.3, 0.45, 0.14], {
    visual: g, dynamic: true, density: 90, points: 30, label: 'A-Board', fracture: [2, 2, 1], fractureLoad: 300,
  });
}

export function cone(s: number, u: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.15, 0.5, 12), color(0xff6a13, 0.6)));
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.08, 12), M.white(), 0, 0.02, 0));
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), color(0xff6a13, 0.6), 0, -0.25, 0));
  return G.destruction.add(toWorld(s, u, 0.27), 0, [0.15, 0.25, 0.15], {
    shape: 'cyl', visual: g, dynamic: true, density: 60, points: 15, label: 'Traffic Cone', sound: 'soft', restitution: 0.5,
  });
}

/** Cone on a statue's head, a fine Scottish tradition. */
export function hatCone(pos: THREE.Vector3) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.15, 0.5, 12), color(0xff6a13, 0.6)));
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.08, 12), M.white(), 0, 0.02, 0));
  return G.destruction.add(pos, 0, [0.15, 0.25, 0.15], { shape: 'cyl', visual: g, dynamic: true, density: 60, points: 15, label: 'Traffic Cone', sound: 'soft' });
}

export function bench(s: number, u: number) {
  const g = new THREE.Group();
  const iron = M.black();
  const planks = M.planks();
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(1.6, 0.04, 0.12), planks, 0, 0.0, -0.16 + i * 0.15));
  for (let i = 0; i < 2; i++) {
    const b = mesh(new THREE.BoxGeometry(1.6, 0.12, 0.03), planks, 0, 0.3 + i * 0.16, (u > 0 ? 1 : -1) * 0.24);
    g.add(b);
  }
  for (const x of [-0.7, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.45, 0.5), iron, x, -0.2, 0));
  const q = yawQ(theta(s) + Math.PI / 2);
  return G.destruction.add(toWorld(s, u, 0.45), q, [0.8, 0.25, 0.26], {
    visual: g, density: 400, release: 40, fracture: [4, 1, 2], fractureLoad: 160, points: 80, label: 'Bench', pieceMat: planks, retain: 0.86,
  });
}

export function barrier(s: number, u: number, yaw = 0) {
  const g = new THREE.Group();
  const steel = M.steel();
  g.add(mesh(new THREE.BoxGeometry(2.2, 0.05, 0.05), steel, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(2.2, 0.05, 0.05), steel, 0, -0.35, 0));
  for (let i = 0; i < 12; i++) g.add(mesh(new THREE.BoxGeometry(0.02, 0.85, 0.02), steel, -1.05 + i * 0.19, 0.07, 0));
  for (const x of [-1.05, 1.05]) {
    g.add(mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), steel, x, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.7), steel, x, -0.53, 0));
  }
  return G.destruction.add(toWorld(s, u, 0.58), theta(s) + yaw, [1.1, 0.55, 0.12], {
    visual: g, dynamic: true, density: 120, points: 30, label: 'Crowd Barrier', sound: 'metal', restitution: 0.3,
  });
}

export function barrel(pos: THREE.Vector3, quat: THREE.Quaternion | number = 0, extra: Partial<PartOpts> = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.88, 18, 1, true), M.barrel());
  g.add(body);
  for (const y of [-0.44, 0.44]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.32, 18), M.barrelEnd());
    cap.rotation.x = y > 0 ? -Math.PI / 2 : Math.PI / 2;
    cap.position.y = y;
    g.add(cap);
  }
  // bulge
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.5, 18, 1, true), M.barrel());
  g.add(mid);
  return G.destruction.add(pos, quat, [0.33, 0.44, 0.33], {
    shape: 'cyl', visual: g, dynamic: true, density: 85, points: 80, label: 'Whisky Barrel', sound: 'wood', retain: 0.92,
    fracture: [3, 2, 3], fractureLoad: 260, pieceMat: M.wood(26, 28, 9), restitution: 0.25,
    onRelease: (p) => G.fx.splash(p.mesh.position.clone(), 0xc77a1a, 26),
    ...extra,
  });
}

/** Scaffolding against a facade: front poles hold up the planks. Returns all parts. */
export function scaffold(s0: number, s1: number, u: number, height: number, extra: Partial<PartOpts> = {}): Part[] {
  const out: Part[] = [];
  const side = Math.sign(u);
  const steel = M.steel();
  const planks = M.planks();
  const poles: Part[][] = [];
  for (let s = s0; s <= s1 + 0.01; s += 2) {
    const col: Part[] = [];
    for (const du of [0, side * 1.1]) {
      const p = G.destruction.add(toWorld(s, u + du, height / 2), 0, [0.04, height / 2, 0.04], {
        shape: 'cyl', mat: steel, density: 3000, release: du === 0 ? 8 : 30, points: du === 0 ? 25 : 0, label: 'Scaffolding',
        sound: 'metal', retain: 0.93, ...extra,
      });
      col.push(p);
      out.push(p);
    }
    poles.push(col);
  }
  const base = toWorld(s0, u, 0).y;
  for (let lvl = 2; lvl <= height; lvl += 2) {
    for (let i = 0; i < poles.length - 1; i++) {
      const sm = s0 + i * 2 + 1;
      const pos = toWorldAbs(sm, u + side * 0.55, base + lvl, new THREE.Vector3());
      const p = G.destruction.add(pos, theta(sm), [0.62, 0.03, 1.0], {
        mat: planks, density: 500, release: 40, supports: [...poles[i], ...poles[i + 1]], label: 'Scaffolding', sound: 'wood', ...extra,
      });
      out.push(p);
      // little cross brace for looks
      const brace = G.destruction.add(toWorldAbs(sm, u, base + lvl - 1, new THREE.Vector3()), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8, theta(sm), 0)), [0.02, 1.25, 0.02], {
        shape: 'cyl', mat: steel, density: 2000, release: 30, supports: [poles[i][0]], sound: 'metal', ...extra,
      });
      out.push(brace);
    }
  }
  return out;
}

export function haggis(pos: THREE.Vector3) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), color(0x6b3b22, 0.8));
  m.scale.set(1.3, 0.9, 1);
  g.add(m);
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.06, 6), color(0xc2a070, 0.9));
  tie.position.x = 0.18;
  tie.rotation.z = Math.PI / 2;
  g.add(tie);
  return G.destruction.add(pos, Math.random() * 6, [0.14, 0.14, 0.14], {
    shape: 'ball', visual: g, dynamic: true, density: 600, points: 40, label: 'Haggis', sound: 'soft', restitution: 0.55, hitLoad: 15,
  });
}
