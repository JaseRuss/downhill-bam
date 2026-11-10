import * as THREE from 'three';
import { M, color, mapMat } from '../art/Materials';
import { ball, cyl, extrude, lathe, loft, Parts, pipe, q, rbox, V3 } from '../art/Model';
import { canvas, signTex } from '../art/Textures';
import { baseH, roadGroup, theta, toWorld, forward } from '../world/Road';
import { staticBox } from './Buildings';
import type { VehicleSpec } from '../vehicle/Vehicles';

/**
 * The launcher: a giant kilted leg hanging from a gantry, with a boot the size of a sofa.
 * The leg pivots at the hip; angle 0 = hanging straight down with the toe just touching the back
 * of the vehicle, positive = swung back (uphill).
 */
export const HIP_H = 5.25;
const LEG = 5.19; // hip to sole
/** Radius of the on-screen swing arc (just outside the toe). */
export const ARC_R = 6.3;

let hairMat: THREE.Material | null = null;
function hairyShin() {
  if (hairMat) return hairMat;
  const c = canvas(128, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f0c4a2';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(70,40,20,0.55)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 2, y + 3, x + (Math.random() - 0.3) * 4, y + 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  hairMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  return hairMat;
}

export class Boot {
  /** At the hip, turned to the aim direction. */
  pivot = new THREE.Group();
  /** Swings about local X. */
  leg = new THREE.Group();
  angle = 0;
  /** How far behind the vehicle's centre the hip sits. */
  back: number;
  private s: number;
  private gantry: THREE.Group;

  constructor(scene: THREE.Scene, s: number, spec: VehicleSpec) {
    this.s = s;
    // the toe should just kiss the back of whatever's being launched
    const tail = spec.id === 'trolley' || spec.id === 'blower' ? 0.78 + (spec.id === 'blower' ? 0.32 : 0) : spec.body[0] + 0.12;
    this.back = tail + 1.25;
    this.build();
    this.pivot.add(this.leg);
    scene.add(this.pivot);

    // the gantry it hangs from: one post out on the left pavement and an arm reaching over the
    // street, so nothing stands between the cameras (behind, and off to the right) and the boot
    const gs = s - this.back;
    const g = (this.gantry = roadGroup(gs, 0, 0));
    const wood = M.wood(28, 34, 6);
    const iron = color(0x23262b, 0.5, 0.7);
    const POST_U = -5.6; // local x = -u
    const topY = HIP_H + 0.75;
    const gp = new Parts();
    const px = -POST_U;
    // a stout post on a stone footing, an arm over the street, a brace under it
    gp.add(rbox(0.42, topY + 0.2, 0.42, 0.03, 1), wood, [px, (topY + 0.2) / 2, 0]);
    gp.add(rbox(0.7, 0.35, 0.7, 0.05, 1), M.stone(30, 40, 3), [px, 0.17, 0]);
    gp.add(rbox(px + 1.6, 0.36, 0.42, 0.03, 1), wood, [(px - 1.6) / 2, topY, 0]);
    gp.add(rbox(0.18, 3.0, 0.18, 0.02, 1), wood, [px - 1.05, topY - 1.05, 0], [0, 0, Math.PI / 4]);
    // iron straps and bolts where the timbers meet
    for (const [x, y, w, h] of [[px, topY, 0.5, 0.44], [px, topY - 2.0, 0.5, 0.12], [px - 2.05, topY, 0.12, 0.44], [px, 0.6, 0.5, 0.12]] as number[][]) {
      gp.add(rbox(w, h, 0.46, 0.01, 1), iron, [x, y, 0]);
      for (const z of [-0.235, 0.235]) for (const dy of [-h * 0.3, h * 0.3]) gp.add(ball(0.03, 6), iron, [x - (w > h ? w * 0.3 : 0), y + dy, z]);
    }
    // the hinge the leg hangs from: two cheeks and a fat pin
    gp.add(rbox(1.5, 0.12, 0.62, 0.02, 1), iron, [0, topY - 0.24, 0]);
    for (const x of [-0.62, 0.62]) gp.add(extrude([[-0.28, 0], [0.28, 0], [0.16, -0.62], [-0.16, -0.62]], 0.08, 0.01), iron, [x, topY - 0.3, 0], [0, Math.PI / 2, 0]);
    gp.add(cyl(0.09, 0.09, 1.5, q(12, 8)), color(0x8a8f96, 0.35, 0.85), [0, HIP_H, 0], [0, 0, Math.PI / 2]);
    gp.build(g);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.6), mapMat(signTex(['THE BIG BOOT™ · TROLLEY LAUNCHER'], '#5a1420', '#f2c14e', 640, 96)));
    plate.position.set(-POST_U - 2.6, topY + 0.5, 0.22);
    plate.rotation.y = Math.PI;
    const plate2 = plate.clone();
    plate2.rotation.y = 0;
    plate2.position.z = -0.22;
    g.add(plate, plate2);
    scene.add(g);
    staticBox(gs, POST_U, baseH(gs) + (topY + 0.2) / 2, 0.21, (topY + 0.2) / 2, 0.21);
    this.aim(0);
  }

  /** The leg, modelled facing +X (toe forward) and turned to swing towards +Z. */
  private build() {
    const p = new Parts();
    const skin = hairyShin();
    const kilt = M.tartan('red');
    const leather = color(0x101012, 0.2, 0.15), sole = color(0x2e2118, 0.75), stitch = color(0xf2c14e, 0.6), gold = M.gold();
    const big = q(28, 12);

    // hinge barrel, belt and buckle
    p.add(cyl(0.2, 0.2, 1.1, q(14, 8)), color(0x23262b, 0.5, 0.7), [0, 0, 0], [Math.PI / 2, 0, 0]);
    p.add(loft([{ t: -0.3, w: 0.74 }, { t: 0, w: 0.5 }, { t: 0.1, w: 0.24 }], { seg: big, cap: 'flat' }), kilt);
    p.add(loft([{ t: -0.42, w: 0.8 }, { t: -0.2, w: 0.79 }], { seg: big }), color(0x15110e, 0.5));
    p.add(rbox(0.07, 0.2, 0.3, 0.03), gold, [0.8, -0.31, 0]);
    p.add(rbox(0.08, 0.04, 0.2, 0.012, 1), color(0x15110e, 0.5), [0.81, -0.31, 0]);
    // the kilt: pleated all the way round the back, flat across the apron
    const seg = q(72, 28) & ~1;
    const pleats = (a: number, v: number) => {
      const aa = Math.abs(a > Math.PI ? a - Math.PI * 2 : a);
      if (aa < 0.9) return 1;
      return 1 + (Math.round((a / (Math.PI * 2)) * seg) % 2 ? 0.03 : -0.03) * (0.3 + 0.7 * (1 - v));
    };
    p.add(loft([{ t: -1.95, w: 1.06 }, { t: -1.3, w: 0.95 }, { t: -0.36, w: 0.78 }], { seg, sub: 1, cap: 'none', uv: [4, 1], mod: pleats, crease: 40 }), kilt);
    p.add(rbox(0.03, 0.34, 0.07, 0.01, 1), color(0xc4c9cf, 0.28, 0.85), [0.99, -1.5, 0.52], [0.2, -0.5, 0.06]);
    // the sporran: a fur front, a leather flap, three tassels on a chain
    const fur = (a: number, v: number) => 1 + 0.06 * Math.sin(a * 11 + v * 13) * Math.sin(v * 9 + a * 5);
    p.add(loft([{ t: -1.33, w: 0.1, d: 0.06 }, { t: -1.2, w: 0.27, d: 0.13 }, { t: -0.95, w: 0.3, d: 0.15 }, { t: -0.78, w: 0.26, d: 0.12 }], { seg: q(16, 8), sub: 1, cap: 'round', mod: fur }), color(0xf2efe8, 0.95), [0.98, 0, 0]);
    p.add(loft([{ t: -0.86, w: 0.28, d: 0.13 }, { t: -0.74, w: 0.27, d: 0.13 }, { t: -0.68, w: 0.2, d: 0.1 }], { seg: q(16, 8), cap: 'round' }), color(0x4a2f1c, 0.6), [0.985, 0, 0]);
    p.add(rbox(0.1, 0.07, 0.36, 0.03), gold, [0.99, -0.69, 0]);
    for (const z of [-0.13, 0, 0.13]) {
      p.add(lathe([[0.02, 0], [0.05, 0.05], [0.06, 0.26], [0.04, 0.3]], 8), color(0x101012, 0.8), [1.12, -1.25, z]);
      p.add(ball(0.045, 8), gold, [1.12, -0.93, z]);
    }
    for (const z of [-1, 1]) p.add(pipe([[0.98, -0.7, z * 0.2], [0.94, -0.5, z * 0.5], [0.76, -0.36, z * 0.62]], 0.018, { seg: 5, curve: true }), color(0xc4c9cf, 0.28, 0.85));
    // thigh, knee, calf: one hairy skin
    p.add(loft([
      { t: -3.72, w: 0.36, d: [0.34, 0.44] },
      { t: -3.45, w: 0.38, d: [0.34, 0.47] },
      { t: -3.0, w: 0.34, d: [0.35, 0.38] },
      { t: -2.65, w: 0.38, d: [0.45, 0.37] },
      { t: -2.3, w: 0.4, d: [0.42, 0.4] },
      { t: -1.6, w: 0.47, d: [0.48, 0.47] },
      { t: -0.6, w: 0.52, d: 0.52 },
    ], { seg: q(22, 10), sub: 2, cap: 'none', uv: [2, 3] }), skin);
    // kilt hose: ribbed, with a turned-over cuff and flashes
    const hose = color(0xe9e2d0, 0.95);
    const ribs = (a: number) => 1 + 0.012 * Math.sin(a * 26);
    p.add(loft([
      { t: -4.5, w: 0.33, d: [0.34, 0.36] },
      { t: -4.2, w: 0.35, d: [0.34, 0.4] },
      { t: -3.85, w: 0.38, d: [0.36, 0.46] },
      { t: -3.62, w: 0.38, d: [0.37, 0.44] },
    ], { seg: q(52, 14), sub: 1, cap: 'flat', mod: ribs }), hose);
    p.add(loft([{ t: -3.76, w: 0.43, d: [0.41, 0.5] }, { t: -3.46, w: 0.42, d: [0.42, 0.47] }], { seg: q(52, 14), cap: 'flat', mod: ribs }), hose, null, null, null, 0.93);
    for (const z of [-1, 1]) {
      p.add(rbox(0.16, 0.4, 0.05, 0.015, 1), color(0xc4161c, 0.7), [0.02, -3.94, z * 0.41], [z * 0.1, 0, 0]);
      p.add(rbox(0.16, 0.4, 0.05, 0.015, 1), color(0xa01016, 0.7), [-0.09, -3.9, z * 0.415], [z * 0.1, 0, 0.12]);
    }
    // the boot: a giant black eight-eyelet, yellow-stitched
    const S = -5.19; // the sole's underside
    p.add(loft([
      { t: -0.62, w: 0.3 }, { t: -0.42, w: 0.41 }, { t: 0.2, w: 0.41 }, { t: 0.78, w: 0.46 }, { t: 1.08, w: 0.41 }, { t: 1.25, w: 0.27 },
    ].map((r) => ({ ...r, d: 0.1, x: S + 0.1, n: 5 })), { axis: 'x', seg: q(20, 10), sub: 1, cap: 'round', dome: 0.05, crease: 40 }), sole);
    // tread ridges under it and the welt round the top of it
    for (let i = 0; i < 9; i++) p.add(rbox(0.07, 0.04, 0.74, 0.01, 1), sole, [-0.4 + i * 0.19, S - 0.005, 0], null, null, 0.7);
    p.add(loft([
      { t: -0.63, w: 0.31 }, { t: -0.42, w: 0.42 }, { t: 0.2, w: 0.42 }, { t: 0.78, w: 0.47 }, { t: 1.08, w: 0.42 }, { t: 1.26, w: 0.28 },
    ].map((r) => ({ ...r, d: 0.018, x: S + 0.215, n: 5 })), { axis: 'x', seg: q(20, 10), sub: 1, cap: 'round', dome: 0.02 }), stitch);
    p.add(loft(([
      { t: -0.58, w: 0.27, d: [0.5, 0.01] },
      { t: -0.36, w: 0.37, d: [0.72, 0.01] },
      { t: -0.05, w: 0.4, d: [0.74, 0.01] },
      { t: 0.22, w: 0.4, d: [0.64, 0.01] },
      { t: 0.5, w: 0.42, d: [0.5, 0.01] },
      { t: 0.82, w: 0.44, d: [0.44, 0.01] },
      { t: 1.06, w: 0.39, d: [0.38, 0.01] },
      { t: 1.21, w: 0.26, d: [0.26, 0.01] },
    ] as { t: number; w: number; d: [number, number] }[]).map((r) => ({ ...r, x: S + 0.22 })), { axis: 'x', seg: q(22, 10), sub: 2, n: 2.6, cap: 'round', dome: 0.05 }), leather);
    // the ankle shaft and its padded collar
    p.add(loft([{ t: S + 0.7, w: 0.39, d: [0.42, 0.4], x: -0.06 }, { t: S + 1.0, w: 0.42, d: [0.44, 0.44], x: -0.04 }], { seg: q(22, 10), cap: 'flat' }), leather);
    p.add(pipe(Array.from({ length: 20 }, (_, i): V3 => [Math.cos((i / 20) * Math.PI * 2) * 0.43 - 0.04, S + 1.01, Math.sin((i / 20) * Math.PI * 2) * 0.41]), 0.05, { closed: true, seg: 6 }), color(0x1a1a1c, 0.6));
    // laces and eyelets up the front
    for (let i = 0; i < 6; i++) {
      const x = 0.56 - i * 0.1, y = S + 0.22 + 0.5 + i * 0.058;
      p.add(pipe([[x, y - 0.05, -0.17], [x + 0.03, y, 0], [x, y - 0.05, 0.17]], 0.022, { seg: 5, curve: true }), M.white());
      for (const z of [-1, 1]) p.add(cyl(0.035, 0.035, 0.02, 8), gold, [x - 0.01, y - 0.06, z * 0.185], [z * 0.9, 0, 0.5]);
    }
    // the pull loop at the heel
    p.add(pipe([[-0.46, S + 0.98, -0.06], [-0.52, S + 1.18, -0.06], [-0.52, S + 1.18, 0.06], [-0.46, S + 0.98, 0.06]], 0.03, { seg: 4, bend: 0.06, flat: [1, 0.3] }), stitch);
    const leg = new Parts();
    leg.sub(p, null, [0, -Math.PI / 2, 0]);
    leg.build(this.leg);
    this.leg.traverse((o: any) => o.isMesh && (o.castShadow = true));
  }

  /** Turn to follow the aim (radians, + = right). */
  aim(offset: number) {
    const s = this.s;
    const yaw = theta(s) - offset;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const p = toWorld(s, 0, 0).addScaledVector(f, -this.back);
    p.y = baseH(s - this.back) + HIP_H;
    this.pivot.position.copy(p);
    this.pivot.rotation.set(0, yaw, 0);
  }

  setAngle(a: number) {
    this.angle = a;
    this.leg.rotation.x = a;
  }

  get hip() {
    return this.pivot.position.clone();
  }

  /** Swing direction in the world (horizontal). */
  get dir() {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.pivot.quaternion);
  }

  /** A point on the swing arc at angle a and radius r from the hip. */
  pointAt(a: number, r: number, out = new THREE.Vector3()) {
    const f = this.dir;
    return out.copy(this.hip).addScaledVector(f, -Math.sin(a) * r).add(new THREE.Vector3(0, -Math.cos(a) * r, 0));
  }

  /** Where the boot's sole is (for dust on contact). */
  get toe() {
    return this.pointAt(this.angle, LEG).addScaledVector(this.dir, 1.0);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.pivot, this.gantry);
  }
}

export { forward };
