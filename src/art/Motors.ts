import * as THREE from 'three';
import { M, color } from './Materials';
import { ball, cyl, lathe, loft, model, Parts, pipe, q, rbox, Ring, V3 } from './Model';

/**
 * Things with engines that aren't Hamish's: parked cars, the polis, the tram, the digger.
 * Road vehicles face +X and sit with the ground 0.85 m below their origin; the tram runs along Z
 * with its origin on the rails.
 */
const AXLE: V3 = [Math.PI / 2, 0, 0];
const GLASS = () => color(0x1c2730, 0.12, 0.5);

/** A cross-section for a loft along X or Z: half-width, and from how low to how high. */
const sec = (t: number, w: number, y0: number, y1: number, n = 4.5): Ring => ({ t, w, x: (y0 + y1) / 2, d: (y1 - y0) / 2, n });

/** A road wheel: tyre, alloy and spokes, axle along Z. */
export function roadWheel(p: Parts, r: number, width: number, at: V3, hub: THREE.Material = color(0xb9bec4, 0.3, 0.85), spokes = 5) {
  const h = width / 2;
  const w = new Parts();
  w.add(lathe([[r * 0.62, -h * 0.9], [r * 0.92, -h], [r, -h * 0.5], [r, h * 0.5], [r * 0.92, h], [r * 0.62, h * 0.9]], q(18, 10), { cap: 'none', crease: 30 }), color(0x141416, 0.85), null, AXLE);
  w.add(lathe([[0.0001, -h * 0.8], [r * 0.2, -h * 0.84], [r * 0.3, -h * 0.66], [r * 0.64, -h * 0.72], [r * 0.64, h * 0.72], [r * 0.3, h * 0.66], [r * 0.2, h * 0.84], [0.0001, h * 0.8]], q(14, 8), { cap: 'none' }), hub, null, AXLE);
  for (let i = 0; i < spokes; i++) w.add(rbox(r * 0.5, r * 0.12, width * 0.8, r * 0.03, 1), hub, new THREE.Matrix4().makeRotationZ((i / spokes) * Math.PI * 2).multiply(new THREE.Matrix4().makeTranslation(r * 0.38, 0, 0)), null, null, 0.8);
  p.sub(w, at);
}

/** A family hatchback, from bumper to bumper. */
function carBody(p: Parts, paint: THREE.Material) {
  const glass = GLASS(), black = color(0x101012, 0.7), chrome = color(0xc4c9cf, 0.28, 0.85);
  // the body up to the waistline
  p.add(loft([
    sec(-2.02, 0.74, -0.42, -0.02), sec(-1.9, 0.86, -0.55, 0.16), sec(-1.2, 0.88, -0.56, 0.2), sec(0.7, 0.88, -0.56, 0.18),
    sec(1.5, 0.87, -0.56, 0.1), sec(1.92, 0.84, -0.55, 0.0), sec(2.03, 0.72, -0.42, -0.1),
  ], { axis: 'x', seg: q(20, 10), sub: 1, cap: 'round', dome: 0.04 }), paint);
  // glass all round, a roof on top, pillars between
  p.add(loft([sec(-1.72, 0.8, 0.12, 0.3, 3), sec(-1.3, 0.76, 0.12, 0.78, 3), sec(-0.2, 0.74, 0.12, 0.84, 3), sec(0.35, 0.74, 0.12, 0.8, 3), sec(1.0, 0.8, 0.12, 0.22, 3)], { axis: 'x', seg: q(16, 8), cap: 'round', dome: 0.02 }), glass);
  p.add(loft([sec(-1.34, 0.71, 0.77, 0.815, 4), sec(-0.2, 0.7, 0.83, 0.875, 4), sec(0.39, 0.7, 0.79, 0.835, 4)], { axis: 'x', seg: q(12, 6), cap: 'round', dome: 0.03 }), paint);
  for (const z of [1, -1]) {
    p.add(pipe([[1.02, 0.2, z * 0.8], [0.38, 0.8, z * 0.72], [-0.2, 0.845, z * 0.715], [-1.3, 0.785, z * 0.735], [-1.74, 0.28, z * 0.8]], 0.04, { seg: 5, bend: 0.08 }), paint);
    p.add(rbox(0.09, 0.64, 0.035, 0.012, 1), paint, [-0.42, 0.5, z * 0.752]);
    // arches, wheels, mirrors, handles
    for (const x of [-1.3, 1.3]) {
      p.add(cyl(0.42, 0.42, 0.04, q(16, 8)), black, [x, -0.5, z * 0.868], AXLE);
      roadWheel(p, 0.33, 0.22, [x, -0.52, z * 0.8]);
    }
    p.add(rbox(0.1, 0.075, 0.17, 0.025), paint, [0.86, 0.22, z * 0.95]);
    for (const x of [0.25, -0.75]) p.add(rbox(0.15, 0.028, 0.02, 0.008, 1), chrome, [x, 0.06, z * 0.885]);
    // lamps
    p.add(rbox(0.07, 0.13, 0.36, 0.03), M.emissive(0xfff2c0, 0.8), [1.975, -0.07, z * 0.58], [0, -z * 0.35, 0]);
    p.add(rbox(0.06, 0.14, 0.34, 0.03), color(0xc01018, 0.2), [-1.985, 0.02, z * 0.6], [0, z * 0.3, 0]);
  }
  // bumpers, grille, plates
  p.add(rbox(0.1, 0.2, 1.52, 0.04), black, [2.0, -0.38, 0]);
  p.add(rbox(0.1, 0.2, 1.52, 0.04), black, [-2.0, -0.38, 0]);
  p.add(rbox(0.04, 0.11, 0.72, 0.02), black, [2.035, -0.14, 0]);
  p.add(ball(0.035, 8, 1, 0.4), chrome, [2.055, -0.14, 0]);
  p.add(rbox(0.02, 0.11, 0.46, 0.006, 1), color(0xf2f2ee, 0.5), [2.055, -0.38, 0]);
  p.add(rbox(0.02, 0.11, 0.46, 0.006, 1), color(0xf2c81e, 0.5), [-2.055, -0.2, 0]);
}

export function carModel(tint: number) {
  return model(`car|${tint}`, () => {
    const p = new Parts();
    carBody(p, color(tint, 0.25, 0.4));
    return p.build();
  });
}

/** The polis: the same car in white, with battenburg checks and a light bar. Returns the two lamps. */
export function policeCarModel(checks: THREE.Material) {
  const p = new Parts();
  carBody(p, color(0xf4f4f2, 0.25, 0.3));
  const band = (z: number) => {
    const g = new THREE.PlaneGeometry(3.3, 0.3);
    p.add(g, checks, [0, -0.1, z], [0, z > 0 ? 0 : Math.PI, 0]);
  };
  band(0.893);
  band(-0.893);
  p.add(rbox(0.34, 0.05, 1.1, 0.02), color(0x101012, 0.6), [-0.2, 0.895, 0]);
  const g = p.build();
  const lamps = [-1, 1].map((z) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a5bff, emissive: 0x2a5bff, emissiveIntensity: 2, roughness: 0.3 });
    const m = new THREE.Mesh(rbox(0.3, 0.12, 0.5, 0.045), mat);
    m.position.set(-0.2, 0.965, z * 0.28);
    g.add(m);
    return mat;
  });
  return { group: g, lamps };
}

/** The tram: `n` articulated cars along Z, a cab at each end, a pantograph in the middle. */
export function tramModel(n: number, len: number, gap: number) {
  const p = new Parts();
  const white = color(0xf2f2ee, 0.3, 0.2), red = color(0xa3122a, 0.35, 0.2), glass = color(0x141c24, 0.1, 0.6), grey = color(0x7b8087, 0.5), dark = color(0x17181b, 0.7);
  const total = n * (len + gap);
  const zs = q(18, 10);
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * (len + gap), h = len / 2;
    const c = new Parts();
    c.add(loft([sec(-h, 1.325, 0.42, 3.1, 6), sec(h, 1.325, 0.42, 3.1, 6)], { axis: 'z', seg: zs }), white);
    c.add(loft([sec(-h, 1.335, 0.36, 1.12, 8), sec(h, 1.335, 0.36, 1.12, 8)], { axis: 'z', seg: zs }), red);
    c.add(loft([sec(-h + 0.4, 1.34, 1.42, 2.62, 9), sec(h - 0.4, 1.34, 1.42, 2.62, 9)], { axis: 'z', seg: zs }), glass);
    // window pillars and two sets of doors a side
    for (const x of [1, -1]) {
      for (let k = -2; k <= 2; k++) c.add(rbox(0.03, 1.24, 0.11, 0.01, 1), white, [x * 1.346, 2.02, k * 1.75]);
      for (const dz of [-h * 0.52, h * 0.52]) {
        c.add(rbox(0.03, 2.2, 1.34, 0.01, 1), red, [x * 1.345, 1.56, dz]);
        for (const k of [-0.33, 0.33]) c.add(rbox(0.035, 1.5, 0.54, 0.01, 1), glass, [x * 1.35, 1.8, dz + k]);
        c.add(rbox(0.05, 0.08, 0.14, 0.02, 1), color(0x35d06a, 0.3), [x * 1.36, 1.3, dz + 0.74]);
      }
    }
    // roof gear and the bogie skirt
    for (const dz of [-h * 0.5, h * 0.5]) c.add(rbox(1.9, 0.3, len * 0.36, 0.08), grey, [0, 3.2, dz]);
    c.add(rbox(2.3, 0.3, len - 1.4, 0.05), dark, [0, 0.26, 0]);
    p.sub(c, [0, 0, z]);
    // the bellows between cars
    if (i < n - 1) {
      for (let k = 0; k < 4; k++) p.add(loft([sec(-0.06, 1.2 + (k % 2) * 0.06, 0.5, 2.95, 6), sec(0.06, 1.2 + (k % 2) * 0.06, 0.5, 2.95, 6)], { axis: 'z', seg: 12 }), dark, [0, 0, z + h + gap / 2 - 0.18 + k * 0.12]);
    }
  }
  // a raked cab at each end
  for (const sgn of [-1, 1]) {
    const cab = new Parts();
    cab.add(loft([sec(0, 1.325, 0.42, 3.1, 6), sec(0.5, 1.28, 0.44, 3.02, 5), sec(1.0, 1.1, 0.5, 2.6, 4), sec(1.25, 0.9, 0.56, 1.5, 3.5)], { axis: 'z', seg: zs, sub: 1, cap: ['flat', 'round'], dome: 0.08 }), white);
    cab.add(loft([sec(0, 1.335, 0.36, 1.12, 8), sec(0.5, 1.29, 0.38, 1.12, 6), sec(1.0, 1.11, 0.44, 1.12, 5), sec(1.27, 0.91, 0.5, 1.1, 4)], { axis: 'z', seg: zs, sub: 1, cap: ['flat', 'round'], dome: 0.06 }), red);
    // the windscreen wraps round the nose
    cab.add(loft([sec(0.1, 1.33, 1.5, 2.6, 7), sec(0.55, 1.29, 1.5, 2.55, 5), sec(1.0, 1.12, 1.45, 2.4, 4), sec(1.2, 0.95, 1.4, 1.9, 3.5)], { axis: 'z', seg: zs, sub: 1, cap: ['flat', 'round'], dome: 0.05 }), glass);
    for (const x of [-1, 1]) {
      cab.add(rbox(0.3, 0.12, 0.06, 0.03), M.emissive(sgn > 0 ? 0xfff2c0 : 0xff2a2a, 1.2), [x * 0.6, 0.9, 1.3], [0, x * 0.5, 0]);
    }
    cab.add(rbox(0.5, 0.3, 0.3, 0.08), dark, [0, 0.5, 1.2]);
    p.sub(cab, [0, 0, sgn * (total / 2 - gap / 2)], [0, sgn > 0 ? 0 : Math.PI, 0]);
  }
  // pantograph: a diamond of arms up to the wire
  const steel = color(0x3a3d42, 0.4, 0.7);
  p.add(rbox(1.2, 0.1, 1.6, 0.03), steel, [0, 3.4, 0]);
  for (const x of [-0.4, 0.4]) {
    p.add(pipe([[x, 3.45, -0.6], [x, 4.0, 0.5], [x * 0.6, 4.55, -0.2]], 0.03, { seg: 5 }), steel);
  }
  p.add(pipe([[-0.7, 4.56, -0.2], [0.7, 4.56, -0.2]], 0.035, { seg: 5 }), color(0x202225, 0.5));
  return p.build();
}

/** A tracked excavator, parked across the works with its bucket on the ground. */
export function diggerModel() {
  return model('digger', () => {
    const p = new Parts();
    const yellow = color(0xf2b01e, 0.4, 0.2), dark = color(0x1b1c1f, 0.7), steel = color(0x3a3d42, 0.45, 0.7), chrome = color(0xc4c9cf, 0.28, 0.85), glass = GLASS();
    const G0 = -1.1; // the ground
    // tracks: a loop of rubber round two sprockets and three rollers
    for (const z of [0.86, -0.86]) {
      p.add(loft([sec(-1.62, 0.2, G0 + 0.1, G0 + 0.45, 3), sec(-1.4, 0.23, G0, G0 + 0.58, 5), sec(1.4, 0.23, G0, G0 + 0.58, 5), sec(1.62, 0.2, G0 + 0.1, G0 + 0.45, 3)], { axis: 'x', seg: q(14, 8), cap: 'round', dome: 0.05 }), dark, [0, 0, z]);
      for (let i = 0; i < 17; i++) p.add(rbox(0.07, 0.035, 0.5, 0.01, 1), dark, [-1.5 + i * 0.1875, G0 + 0.012, z], null, null, 0.7);
      for (const x of [-1.32, 1.32]) p.add(cyl(0.24, 0.24, 0.48, q(12, 8)), steel, [x, G0 + 0.29, z], AXLE);
      for (const x of [-0.66, 0, 0.66]) p.add(cyl(0.11, 0.11, 0.5, 8), steel, [x, G0 + 0.16, z], AXLE);
    }
    p.add(rbox(2.0, 0.3, 1.5, 0.06), dark, [0, G0 + 0.42, 0]);
    p.add(cyl(0.62, 0.62, 0.16, q(18, 10)), steel, [0, G0 + 0.64, 0]);
    // the house: engine cover and a fat counterweight
    p.add(loft([sec(-1.5, 0.95, G0 + 0.78, G0 + 1.6, 4), sec(-1.2, 1.08, G0 + 0.72, G0 + 1.86, 5), sec(0.9, 1.08, G0 + 0.72, G0 + 1.8, 6), sec(1.12, 1.0, G0 + 0.74, G0 + 1.5, 5)], { axis: 'x', seg: q(18, 10), cap: 'round', dome: 0.06 }), yellow);
    p.add(loft([sec(-1.56, 0.9, G0 + 0.78, G0 + 1.3, 4), sec(-1.3, 1.1, G0 + 0.7, G0 + 1.36, 5), sec(-1.05, 1.1, G0 + 0.7, G0 + 1.36, 5)], { axis: 'x', seg: q(18, 10), cap: 'round', dome: 0.05 }), dark);
    for (let i = 0; i < 5; i++) p.add(rbox(0.5, 0.03, 0.02, 0.008, 1), dark, [-0.5, G0 + 1.1 + i * 0.1, -1.085]);
    p.add(pipe([[-0.9, G0 + 1.84, -0.6], [-0.9, G0 + 2.3, -0.6], [-1.0, G0 + 2.42, -0.6]], 0.05, { seg: 6, bend: 0.06 }), steel);
    // the cab: a glass box in a yellow frame, with a beacon on top
    const cx = 0.25, cz = 0.5, cy = G0 + 1.8;
    p.add(rbox(1.16, 1.2, 0.98, 0.06), glass, [cx, cy + 0.6, cz]);
    p.add(rbox(1.24, 0.08, 1.06, 0.03), yellow, [cx, cy + 1.22, cz]);
    for (const x of [-0.58, 0.58]) for (const z of [-0.49, 0.49]) p.add(rbox(0.08, 1.2, 0.08, 0.02, 1), yellow, [cx + x, cy + 0.6, cz + z]);
    p.add(rbox(1.18, 0.34, 1.0, 0.03), yellow, [cx, cy + 0.14, cz]);
    p.add(cyl(0.07, 0.08, 0.12, 8), M.emissive(0xff8a1a, 1.4), [cx - 0.3, cy + 1.32, cz]);
    // boom, stick and bucket, with their rams
    const z0 = -0.3;
    const A: V3 = [0.95, G0 + 1.3, z0], B: V3 = [2.25, G0 + 3.0, z0], C: V3 = [3.0, G0 + 1.0, z0];
    p.add(pipe([A, [1.5, G0 + 2.5, z0], B], 0.17, { seg: 4, bend: 0.5, flat: [1.2, 1] }), yellow);
    p.add(pipe([B, C], [0.15, 0.11], { seg: 4, flat: [1.2, 1] }), yellow);
    for (const at of [A, B, C]) p.add(cyl(0.12, 0.12, 0.5, 8), steel, at, AXLE);
    const ram = (a: V3, b: V3) => {
      const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      p.add(pipe([a, mid], 0.07, { seg: 6 }), dark);
      p.add(pipe([mid, b], 0.035, { seg: 6 }), chrome);
    };
    ram([1.15, G0 + 1.2, z0], [1.75, G0 + 2.3, z0]);
    ram([1.6, G0 + 2.95, z0], [2.6, G0 + 2.55, z0]);
    // bucket: a curved scoop with teeth along its lip
    const bucket = new Parts();
    bucket.add(loft([{ t: -0.36, w: 0.34, d: [0.4, 0.1] }, { t: 0.36, w: 0.34, d: [0.4, 0.1] }], { axis: 'z', seg: 10, n: 2.2 }), steel);
    for (let i = 0; i < 4; i++) bucket.add(loft([{ t: 0, w: 0.035, d: 0.03 }, { t: 0.17, w: 0.008, d: 0.008 }], { seg: 4, n: 4 }), chrome, [0.3, -0.07, -0.27 + i * 0.18], [0, 0, -1.9]);
    p.sub(bucket, [3.0, G0 + 0.52, z0], [0, 0, 0.5]);
    return p.build();
  });
}

