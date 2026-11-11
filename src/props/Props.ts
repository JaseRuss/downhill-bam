import * as THREE from 'three';
import { G } from '../ctx';
import { M, color, mapMat } from '../art/Materials';
import { signTex } from '../art/Textures';
import { ball, cyl, lathe, loft, model, Parts, pipe, q, rbox } from '../art/Model';
import { theta, toWorld, toWorldAbs } from '../world/Road';
import type { Part, PartOpts } from '../destruction/Destruction';

const Y = new THREE.Vector3(0, 1, 0);
export const yawQ = (a: number) => new THREE.Quaternion().setFromAxisAngle(Y, a);

// ------------------------------------------------------------------ the models
/** One of the council's big wheeled bins. */
export function binModel() {
  const g = model('bin', () => {
    const p = new Parts();
    const plastic = color(0x3d4a3e, 0.6), lid = color(0x2b332c, 0.6), black = color(0x151515, 0.7);
    // a tub that widens towards the top, with stiffening ribs and lifting trunnions
    p.add(loft([{ t: -0.46, w: 0.4, d: 0.55 }, { t: 0.54, w: 0.45, d: 0.6 }], { seg: q(16, 8), n: 7 }), plastic);
    for (const y of [-0.2, 0.1, 0.4]) p.add(loft([{ t: y, w: 0.42 + (y + 0.46) * 0.05 + 0.012, d: 0.57 + (y + 0.46) * 0.05 + 0.012 }, { t: y + 0.05, w: 0.42 + (y + 0.5) * 0.05 + 0.012, d: 0.57 + (y + 0.5) * 0.05 + 0.012 }], { seg: q(16, 8), n: 7 }), plastic, null, null, null, 0.85);
    for (const x of [-1, 1]) p.add(cyl(0.035, 0.035, 0.1, 8), lid, [x * 0.63, 0.36, 0], [0, 0, Math.PI / 2]);
    // domed lid with a grab bar
    p.add(loft([{ t: 0.54, w: 0.47, d: 0.62 }, { t: 0.6, w: 0.47, d: 0.62 }, { t: 0.69, w: 0.36, d: 0.52 }], { seg: q(16, 8), sub: 1, n: 6, cap: ['flat', 'round'], dome: 0.03 }), lid);
    p.add(pipe([[-0.3, 0.6, 0.47], [-0.3, 0.6, 0.52], [0.3, 0.6, 0.52], [0.3, 0.6, 0.47]], 0.014, { seg: 5, bend: 0.03 }), lid);
    // castors
    for (const [x, z] of [[-0.48, -0.32], [0.48, -0.32], [-0.48, 0.32], [0.48, 0.32]]) {
      p.add(rbox(0.08, 0.1, 0.07, 0.01, 1), black, [x, -0.5, z]);
      p.add(cyl(0.1, 0.1, 0.05, q(10, 6)), black, [x, -0.56, z], [Math.PI / 2, 0, 0]);
    }
    return p.build();
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), mapMat(signTex(['COMMUNAL WASTE', 'no haggis'], '#2b332c', '#e5e5e5', 256, 96)));
  label.position.set(0, 0.2, 0.458);
  label.rotation.x = -0.05;
  g.add(label);
  return g;
}

/** A cast-iron bollard with a gilt band. */
export function bollardModel() {
  return model('bollard', () => {
    const p = new Parts();
    p.add(lathe([[0.13, -0.45], [0.135, -0.4], [0.108, -0.36], [0.098, 0.2], [0.118, 0.22], [0.118, 0.27], [0.094, 0.29], [0.09, 0.33], [0.112, 0.38], [0.1, 0.43], [0.05, 0.47], [0.0001, 0.48]], q(14, 8), { cap: 'none' }), color(0x161616, 0.5, 0.3));
    p.add(cyl(0.121, 0.121, 0.03, q(14, 8), true), M.gold(), [0, 0.245, 0]);
    return p.build();
  });
}

/** A Victorian lamp standard: fluted base, ladder bar, a lantern with a wee roof. */
export function lampPostModel() {
  return model('lamp', () => {
    const p = new Parts();
    const iron = color(0x1d2226, 0.5, 0.6);
    p.add(lathe([[0.2, -2.3], [0.2, -2.2], [0.16, -2.14], [0.13, -1.9], [0.15, -1.86], [0.1, -1.78], [0.085, -1.0], [0.1, -0.96], [0.075, -0.9], [0.055, 1.9], [0.08, 1.94], [0.05, 2.0], [0.05, 2.2], [0.13, 2.27]], q(12, 8), { cap: 'none' }), iron);
    p.add(cyl(0.018, 0.018, 0.7, 6), iron, [0, 1.75, 0], [Math.PI / 2, 0, 0]);
    for (const z of [-0.36, 0.36]) p.add(ball(0.03, 6), iron, [0, 1.75, z]);
    // the lantern: four panes that widen upwards, bars on the corners, a pitched cap and a finial
    p.add(rbox(0.3, 0.03, 0.3, 0.01, 1), iron, [0, 2.285, 0]);
    p.add(lathe([[0.17, 2.3], [0.26, 2.74]], 4, { cap: 'none' }), M.emissive(0xffcf7a, 1.6), null, [0, Math.PI / 4, 0]);
    for (let k = 0; k < 4; k++) {
      const c = Math.cos(k * 1.5708 + 0.7854), s = Math.sin(k * 1.5708 + 0.7854);
      p.add(pipe([[c * 0.172, 2.3, s * 0.172], [c * 0.264, 2.74, s * 0.264]], 0.012, { seg: 4 }), iron);
    }
    p.add(lathe([[0.3, 2.74], [0.3, 2.77], [0.1, 2.95], [0.05, 2.97], [0.05, 3.02], [0.0001, 3.08]], 4, { cap: 'none' }), iron, null, [0, Math.PI / 4, 0]);
    p.add(ball(0.035, 6), iron, [0, 3.07, 0]);
    return p.build();
  });
}

/** A traffic cone (with its foot, unless it's being worn). */
export function coneModel(foot = true) {
  return model(`cone|${foot}`, () => {
    const p = new Parts();
    const orange = color(0xff6a13, 0.55), white = color(0xf4f4f0, 0.35);
    p.add(lathe([[0.15, -0.235], [0.142, -0.22], [0.108, -0.08], [0.075, 0.07], [0.04, 0.235], [0.03, 0.25], [0.0001, 0.25]], q(14, 8), { cap: 'none' }), orange);
    p.add(lathe([[0.112, -0.08], [0.079, 0.07]], q(14, 8), { cap: 'none' }), white);
    if (foot) p.add(rbox(0.38, 0.035, 0.38, 0.05), orange, [0, -0.25, 0]);
    return p.build();
  });
}

/** A park bench: iron ends that sweep up into the arms, timber slats. */
export function benchModel(back: number) {
  return model(`bench|${back}`, () => {
    const p = new Parts();
    const iron = color(0x141414, 0.5, 0.3), planks = M.planks();
    for (let i = 0; i < 4; i++) p.add(rbox(1.6, 0.035, 0.1, 0.01, 1), planks, [0, 0.0 + (i === 3 ? 0.02 : 0), -0.18 + i * 0.115]);
    for (let i = 0; i < 3; i++) p.add(rbox(1.6, 0.11, 0.03, 0.01, 1), planks, [0, 0.19 + i * 0.14, 0.235 + i * 0.03], [-0.2, 0, 0]);
    for (const x of [-0.72, 0.72]) {
      p.add(pipe([[x, -0.45, 0.2], [x, -0.02, 0.2], [x, 0.56, 0.32]], 0.024, { seg: 6, bend: 0.1 }), iron);
      p.add(pipe([[x, -0.45, -0.22], [x, 0.02, -0.2], [x, 0.22, -0.22], [x, 0.24, 0.24]], 0.024, { seg: 6, bend: 0.08 }), iron);
      p.add(pipe([[x, -0.03, -0.2], [x, -0.03, 0.2]], 0.02, { seg: 5 }), iron);
      for (const z of [-0.22, 0.2]) p.add(cyl(0.04, 0.045, 0.02, 8), iron, [x, -0.44, z]);
    }
    p.add(pipe([[-0.72, -0.25, 0.2], [0.72, -0.25, 0.2]], 0.014, { seg: 5 }), iron);
    const out = new Parts();
    out.sub(p, null, null, [1, 1, back]);
    return out.build();
  });
}

/** A crowd barrier: a hooped tube frame, a row of bars, two flat feet. */
export function barrierModel() {
  return model('barrier', () => {
    const p = new Parts();
    const steel = M.steel();
    p.add(pipe([[-1.05, -0.42, 0], [-1.05, 0.5, 0], [1.05, 0.5, 0], [1.05, -0.42, 0]], 0.022, { closed: true, bend: 0.12, seg: q(8, 5) }), steel);
    for (let i = 0; i < 13; i++) p.add(cyl(0.009, 0.009, 0.9, 5), steel, [-0.9 + i * 0.15, 0.04, 0]);
    for (const x of [-0.85, 0.85]) {
      p.add(rbox(0.05, 0.012, 0.7, 0.004, 1), steel, [x, -0.54, 0]);
      p.add(cyl(0.02, 0.02, 0.14, 6), steel, [x, -0.47, 0]);
    }
    // the hook and eye that join them up
    p.add(pipe([[1.05, 0.2, 0], [1.12, 0.2, 0], [1.12, 0.05, 0]], 0.01, { seg: 4, bend: 0.03 }), steel);
    p.add(pipe([[-1.05, 0.22, 0], [-1.12, 0.22, 0]], 0.01, { seg: 4 }), steel);
    return p.build();
  });
}

/** A whisky cask: bulging staves, iron hoops, a bung. */
export function barrelModel() {
  return model('barrel', () => {
    const p = new Parts();
    const hoop = color(0x2a2c30, 0.45, 0.7);
    const R = (y: number) => 0.345 - 0.045 * (y / 0.44) ** 2;
    const prof: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const y = -0.44 + (i / 8) * 0.88;
      prof.push([R(y), y]);
    }
    p.add(lathe(prof, q(18, 10), { cap: 'none', uv: [1, 1] }), M.barrel());
    for (const y of [-0.4, -0.25, 0.25, 0.4]) p.add(cyl(R(y + 0.02) + 0.006, R(y - 0.02) + 0.006, 0.045, q(18, 10), true), hoop, [0, y, 0]);
    // the heads sit a wee bit inside the chime
    for (const y of [-1, 1]) p.add(cyl(R(0.42) - 0.012, R(0.42) - 0.012, 0.02, q(18, 10)), M.barrelEnd(), [0, y * 0.41, 0]);
    p.add(cyl(0.03, 0.035, 0.03, 8), color(0x3a2616, 0.8), [0.345, 0, 0], [0, 0, -Math.PI / 2]);
    return p.build();
  });
}

/** A haggis: plump, tied off at both ends. */
export function haggisModel() {
  return model('haggis', () => {
    const p = new Parts();
    const skin = color(0x6b3b22, 0.7);
    p.add(loft([{ t: -0.17, w: 0.025 }, { t: -0.13, w: 0.08, d: 0.07 }, { t: -0.04, w: 0.125, d: 0.11 }, { t: 0.06, w: 0.12, d: 0.108 }, { t: 0.14, w: 0.07, d: 0.065 }, { t: 0.175, w: 0.025 }], { axis: 'x', seg: q(12, 6), sub: 1, cap: 'round', dome: 0.01 }), skin);
    for (const x of [-0.185, 0.19]) {
      p.add(cyl(0.022, 0.03, 0.03, 6), color(0xc2a070, 0.9), [x, 0, 0], [0, 0, Math.PI / 2]);
      p.add(cyl(0.012, 0.012, 0.012, 6, true), color(0xe9e2cf, 0.8), [x * 0.93, 0, 0], [0, 0, Math.PI / 2]);
    }
    return p.build();
  });
}

// ------------------------------------------------------------------ on the street
export function communalBin(s: number, u: number) {
  return G.destruction.add(toWorld(s, u, 0.66), theta(s), [0.6, 0.66, 0.45], {
    visual: binModel(), dynamic: true, density: 90, points: 100, label: 'Communal Bin', sound: 'metal', restitution: 0.3,
  });
}

export function bollard(s: number, u: number) {
  return G.destruction.add(toWorld(s, u, 0.45), 0, [0.12, 0.45, 0.12], {
    shape: 'cyl', visual: bollardModel(), density: 1800, release: 45, points: 40, label: 'Bollard', sound: 'metal', retain: 0.85,
  });
}

export function lampPost(s: number, u: number) {
  return G.destruction.add(toWorld(s, u, 2.3), theta(s), [0.09, 2.3, 0.09], {
    shape: 'cyl', visual: lampPostModel(), density: 1200, release: 35, points: 120, label: 'Lamp Post', sound: 'metal', retain: 0.88,
  });
}

const BOARD_TEXT = [
  ['HAGGIS SUPPER', '£14'], ['GHOST TOURS', '↓ THIS WAY ↓'], ['KILTS', '50% OFF*'], ['TABLET', 'TOOTH ROT GUARANTEED'],
  ['FREE WIFI', 'ASK INSIDE'], ['TODAY:', 'DREICH'], ['WHISKY', 'TASTINGS 10AM'], ['SHORTBREAD', 'BUY 1 GET 1 HEAVY'],
  ['SLOW', 'TROLLEYS'], ['NO', 'TROLLEYS'],
];

/** A pavement A-board: two framed chalkboards hinged at the top. */
export function aBoardModel(i: number) {
  const t = BOARD_TEXT[i % BOARD_TEXT.length];
  const face = mapMat(signTex(t, '#1b1b1b', '#f4f1e6', 192, 256, 'Special Elite, monospace'));
  const g = model('aboard', () => {
    const p = new Parts();
    const wood = M.wood(30, 40, 3);
    for (const sgn of [-1, 1]) {
      const leaf = new Parts();
      leaf.add(rbox(0.6, 0.9, 0.028, 0.008, 1), wood);
      for (const x of [-0.28, 0.28]) leaf.add(rbox(0.045, 0.98, 0.04, 0.01, 1), wood, [x, -0.04, 0]);
      leaf.add(rbox(0.6, 0.045, 0.04, 0.01, 1), wood, [0, 0.43, 0]);
      p.sub(leaf, [0, 0, sgn * 0.1], [-sgn * 0.2, 0, 0]);
    }
    p.add(cyl(0.012, 0.012, 0.5, 6), color(0x2a2c30, 0.45, 0.7), [0, 0.44, 0], [0, 0, Math.PI / 2]);
    return p.build();
  });
  for (const sgn of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.78), face);
    f.rotation.order = 'YXZ';
    f.rotation.set(-0.2, sgn > 0 ? 0 : Math.PI, 0);
    f.position.set(0, 0, sgn * 0.1).add(new THREE.Vector3(0, 0, sgn * 0.016).applyAxisAngle(new THREE.Vector3(1, 0, 0), -sgn * 0.2));
    g.add(f);
  }
  return g;
}

export function aBoard(s: number, u: number, i = Math.floor(Math.random() * BOARD_TEXT.length)) {
  return G.destruction.add(toWorld(s, u, 0.46), theta(s), [0.3, 0.45, 0.14], {
    visual: aBoardModel(i), dynamic: true, density: 90, points: 30, label: 'A-Board', fracture: [2, 2, 1], fractureLoad: 300, pieceMat: M.wood(30, 40, 3),
  });
}

export function cone(s: number, u: number) {
  return G.destruction.add(toWorld(s, u, 0.27), 0, [0.15, 0.25, 0.15], {
    shape: 'cyl', visual: coneModel(), dynamic: true, density: 60, points: 15, label: 'Traffic Cone', sound: 'soft', restitution: 0.5,
  });
}

/** Cone on a statue's head, a fine Scottish tradition. */
export function hatCone(pos: THREE.Vector3) {
  return G.destruction.add(pos, 0, [0.15, 0.25, 0.15], { shape: 'cyl', visual: coneModel(false), dynamic: true, density: 60, points: 15, label: 'Traffic Cone', sound: 'soft' });
}

export function bench(s: number, u: number) {
  const q = yawQ(theta(s) + Math.PI / 2);
  return G.destruction.add(toWorld(s, u, 0.45), q, [0.8, 0.25, 0.26], {
    visual: benchModel(u > 0 ? 1 : -1), density: 400, release: 40, fracture: [4, 1, 2], fractureLoad: 160, points: 80, label: 'Bench', pieceMat: M.planks(), retain: 0.86,
  });
}

export function barrier(s: number, u: number, yaw = 0) {
  // the collider is as deep as the feet: a thin one toppled at a touch and lay with its feet in the cobbles
  return G.destruction.add(toWorld(s, u, 0.58), theta(s) + yaw, [1.1, 0.55, 0.33], {
    visual: barrierModel(), dynamic: true, density: 120, points: 30, label: 'Crowd Barrier', sound: 'metal', restitution: 0.3,
  });
}

export function barrel(pos: THREE.Vector3, quat: THREE.Quaternion | number = 0, extra: Partial<PartOpts> = {}) {
  return G.destruction.add(pos, quat, [0.33, 0.44, 0.33], {
    shape: 'cyl', visual: barrelModel(), dynamic: true, density: 85, points: 80, label: 'Whisky Barrel', sound: 'wood', retain: 0.92,
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
  return G.destruction.add(pos, Math.random() * 6, [0.14, 0.14, 0.14], {
    shape: 'ball', visual: haggisModel(), dynamic: true, density: 600, points: 40, label: 'Haggis', sound: 'soft', restitution: 0.55, hitLoad: 15,
  });
}
