import * as THREE from 'three';
import { M, color, mapMat } from '../art/Materials';
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

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat as any);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
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

    // the gantry it hangs from
    const gs = s - this.back;
    const g = (this.gantry = roadGroup(gs, 0, 0));
    const wood = M.wood(28, 34, 6);
    for (const x of [-1.9, 1.9]) g.add(mesh(new THREE.BoxGeometry(0.3, HIP_H + 0.9, 0.3), wood, x, (HIP_H + 0.9) / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(4.2, 0.34, 0.4), wood, 0, HIP_H + 0.75, 0));
    for (const x of [-1.9, 1.9]) {
      const brace = mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), wood, x, 1.0, -0.7);
      brace.rotation.x = -0.6;
      g.add(brace);
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.6), mapMat(signTex(['THE BIG BOOT™ · TROLLEY LAUNCHER'], '#5a1420', '#f2c14e', 640, 96)));
    plate.position.set(0, HIP_H + 1.25, 0.21);
    plate.rotation.y = Math.PI;
    const plate2 = plate.clone();
    plate2.rotation.y = 0;
    plate2.position.z = -0.21;
    g.add(plate, plate2);
    scene.add(g);
    for (const u of [-1.9, 1.9]) staticBox(gs, u, baseH(gs) + (HIP_H + 0.9) / 2, 0.15, (HIP_H + 0.9) / 2, 0.15);
    this.aim(0);
  }

  private build() {
    const leg = this.leg;
    const skin = hairyShin();
    const kilt = M.tartan('red');
    // belt, kilt and sporran
    leg.add(mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.22, 20), M.black(), 0, 0.2, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.22, 0.16, 0.06), M.gold(), 0, 0.2, 0.79));
    const k = mesh(new THREE.CylinderGeometry(0.78, 1.02, 1.5, 22, 1, true), kilt, 0, -0.62, 0);
    leg.add(k);
    // pleats (vertical fins round the back)
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.6 + (i / 8) * Math.PI * 0.8;
      const p = mesh(new THREE.BoxGeometry(0.05, 1.45, 0.16), kilt, Math.sin(a) * 0.9, -0.64, Math.cos(a) * 0.9);
      p.rotation.y = a;
      p.rotation.x = Math.cos(a) * 0.12;
      leg.add(p);
    }
    const spor = mesh(new THREE.SphereGeometry(0.28, 12, 10), color(0xf2efe8, 0.95), 0, -0.55, 0.98);
    spor.scale.set(1, 1.2, 0.5);
    leg.add(spor);
    for (const x of [-0.12, 0, 0.12]) leg.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 6), M.black(), x, -0.95, 1.06));
    // thigh, knee, shin
    leg.add(mesh(new THREE.CylinderGeometry(0.46, 0.38, 2.2, 14), skin, 0, -1.2, 0));
    leg.add(mesh(new THREE.SphereGeometry(0.4, 14, 10), skin, 0, -2.35, 0.04));
    leg.add(mesh(new THREE.CylinderGeometry(0.38, 0.27, 1.6, 14), skin, 0, -3.1, 0));
    // kilt hose with flashes
    const hose = color(0xe9e2d0, 0.95);
    leg.add(mesh(new THREE.CylinderGeometry(0.36, 0.3, 1.0, 14), hose, 0, -4.05, 0));
    const cuff = mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 16), hose, 0, -3.55, 0);
    cuff.rotation.x = Math.PI / 2;
    leg.add(cuff);
    for (const x of [-0.18, 0.18]) leg.add(mesh(new THREE.BoxGeometry(0.1, 0.32, 0.05), color(0xc4161c, 0.7), x, -3.75, 0.36));
    // the boot: a giant black brogue-ish Doc
    const shine = color(0x141414, 0.22, 0.15);
    const sole = color(0x3a2a1c, 0.8);
    leg.add(mesh(new THREE.BoxGeometry(0.82, 0.2, 1.8), sole, 0, -5.09, 0.32));
    leg.add(mesh(new THREE.BoxGeometry(0.76, 0.62, 1.3), shine, 0, -4.7, 0.18));
    const toe = mesh(new THREE.SphereGeometry(0.42, 14, 10), shine, 0, -4.78, 0.92);
    toe.scale.set(0.95, 0.72, 0.9);
    leg.add(toe);
    leg.add(mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.55, 14), shine, 0, -4.35, -0.05));
    // yellow stitching round the welt and the laces
    leg.add(mesh(new THREE.BoxGeometry(0.84, 0.03, 1.82), color(0xf2c14e, 0.6), 0, -4.98, 0.32));
    for (let i = 0; i < 4; i++) leg.add(mesh(new THREE.BoxGeometry(0.5, 0.035, 0.05), M.white(), 0, -4.38 - i * 0.04, 0.42 + i * 0.16));
    leg.traverse((o: any) => o.isMesh && (o.castShadow = true));
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
