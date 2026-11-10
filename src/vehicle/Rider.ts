import * as THREE from 'three';
import { RAPIER, Entity } from '../core/Physics';
import { G } from '../ctx';
import { toRoad, toWorld, edgeL, edgeR } from '../world/Road';
import { buildHuman, D, hamishOutfit, poseFlail, poseRun, Rig } from '../art/Humanoid';

/** Hamish: ginger beard, tam o' shanter, kilt, unwavering confidence. */
export interface SeatedRider {
  group: THREE.Group;
  rig: Rig;
}

/** Seated in the trolley basket (trolley-local: forward = +X), arms up, legs over the front. */
export function buildSeatedRider(): SeatedRider {
  const rig = buildHuman(hamishOutfit());
  const s = rig.height / 1.75;
  const group = new THREE.Group();
  group.add(rig.root);
  // sit the pelvis on the basket floor
  rig.root.position.set(-0.12, 0.36 - D.pelvisY * s, 0);
  rig.pelvis.rotation.z = 0.25; // leaning back like a king
  rig.hipL.rotation.set(-0.12, 0, 1.75);
  rig.hipR.rotation.set(0.12, 0, 1.75);
  rig.kneeL.rotation.set(0, 0, -1.25);
  rig.kneeR.rotation.set(0, 0, -1.25);
  rig.shoulderL.rotation.set(-0.45, 0, 2.6);
  rig.shoulderR.rotation.set(0.45, 0, 2.6);
  seatKilt(rig);
  return { group, rig };
}

/**
 * Sitting down, the kilt lies along his thighs instead of hanging through the seat. In the air
 * (`air` 0..1) it billows.
 */
export function seatKilt(rig: Rig, air = 0, flutter = 0) {
  const k = rig.kilt;
  if (!k) return;
  const s = rig.height / 1.75;
  const a = rig.hipL.rotation.z; // which way the thighs point
  const len = 0.95 - air * 0.2 + flutter;
  k.rotation.z = a;
  k.scale.set(0.62 * (1 + air * 0.8), len, 1 + air * 0.25);
  k.position.set(Math.sin(a) * 0.21 * s * len, -0.04 * s - Math.cos(a) * 0.21 * s * len + air * 0.04, 0);
}

interface RagPart {
  body: RAPIER.RigidBody;
  /** What follows the body: one of the figure's bones, or the hat. */
  mesh: THREE.Object3D;
  /** From the body's centre to where `mesh` sits, in the body's frame. */
  off?: THREE.Vector3;
}

/**
 * Physics ragdoll for when Hamish leaves the trolley: 11 bodies (pelvis, torso, head, upper and
 * lower arms, thighs, shins) on ball joints, plus a hat that goes its own way. The bodies drive
 * the bones of an ordinary figure, so his skin stretches over the joints instead of coming apart.
 */
export class Ragdoll implements Entity {
  kind = 'rider';
  mass = 80;
  parts: RagPart[] = [];
  torso!: RagPart;
  hat: RagPart | null = null;
  private rig: Rig;
  private lastOof = 0;

  constructor(private scene: THREE.Scene, origin: THREE.Matrix4, vel: THREE.Vector3) {
    const o = hamishOutfit();
    const s = (o.height ?? 1.75) / 1.75;
    const b = o.build ?? 1;
    const world = G.physics.world;
    const rot = new THREE.Quaternion().setFromRotationMatrix(origin);
    // the ridiculous part: way up, way forward, spinning like a sycamore seed
    const launch = vel.clone().multiplyScalar(1.15).add(new THREE.Vector3(0, 6 + Math.random() * 3, 0));
    const spin = new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 16);

    // the figure: every bone hangs straight off the root, so each can follow its own body
    const rig = (this.rig = buildHuman(o));
    const joint0 = rig.bones.map((bn) => bn.getWorldPosition(new THREE.Vector3()).sub(rig.pelvis.position));
    for (const bn of rig.bones) rig.root.add(bn);
    rig.body.frustumCulled = false;
    scene.add(rig.root);

    /** A body at `local` (figure frame, pelvis at the seat); `bone` follows it. */
    const mk = (local: THREE.Vector3, desc: RAPIER.ColliderDesc, density: number, bone?: THREE.Object3D) => {
      const p = local.clone().applyMatrix4(origin);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y, p.z)
          .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
          .setLinvel(launch.x + (Math.random() - 0.5), launch.y, launch.z + (Math.random() - 0.5))
          .setAngvel(spin)
          .setAngularDamping(0.4)
          .setCcdEnabled(true),
      );
      const col = world.createCollider(
        desc.setDensity(density).setFriction(0.8).setRestitution(0.3)
          .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1500),
        body,
      );
      G.physics.register(col, this);
      const part: RagPart = { body, mesh: bone ?? new THREE.Object3D() };
      if (bone) {
        const i = rig.bones.indexOf(bone as THREE.Bone);
        part.off = i >= 0 ? P.clone().add(joint0[i]).sub(local) : new THREE.Vector3();
      }
      this.parts.push(part);
      return part;
    };
    const joint = (a: RagPart, bb: RagPart, at: THREE.Vector3, ca: THREE.Vector3, cb: THREE.Vector3) =>
      world.createImpulseJoint(RAPIER.JointData.spherical(at.clone().sub(ca), at.clone().sub(cb)), a.body, bb.body, true);

    // layout in the figure frame (pelvis at the seated position, standing upright)
    const P = new THREE.Vector3(-0.12, 0.45, 0);
    const pelvisC = P.clone();
    const torsoC = P.clone().add(new THREE.Vector3(0, 0.27 * s, 0));
    const headC = P.clone().add(new THREE.Vector3(0, (D.abdomen + D.chest + D.neck + D.headR) * s, 0));

    const pelvis = mk(pelvisC, RAPIER.ColliderDesc.cuboid(0.12, 0.1, 0.17), 900, rig.pelvis);
    const torso = mk(torsoC, RAPIER.ColliderDesc.cuboid(0.13, 0.25 * s, 0.2), 900, rig.chest);
    joint(pelvis, torso, P.clone().add(new THREE.Vector3(0, 0.03, 0)), pelvisC, torsoC);
    const head = mk(headC, RAPIER.ColliderDesc.ball(0.14 * s), 700, rig.head);
    joint(torso, head, P.clone().add(new THREE.Vector3(0, (D.abdomen + D.chest + 0.03) * s, 0)), torsoC, headC);

    for (const z of [1, -1]) {
      const left = z > 0;
      const sh = P.clone().add(new THREE.Vector3(0, (D.abdomen + D.chest - 0.04) * s, z * (D.shoulderW * b + 0.03) * s));
      const uC = sh.clone().add(new THREE.Vector3(0, (-D.upperArm * s) / 2, 0));
      const upper = mk(uC, RAPIER.ColliderDesc.capsule((D.upperArm * s) / 2 - 0.04, 0.05), 700, left ? rig.shoulderL : rig.shoulderR);
      joint(torso, upper, sh, torsoC, uC);
      const el = sh.clone().add(new THREE.Vector3(0, -D.upperArm * s, 0));
      const fC = el.clone().add(new THREE.Vector3(0, (-D.forearm * s) / 2, 0));
      const lower = mk(fC, RAPIER.ColliderDesc.capsule((D.forearm * s) / 2 - 0.03, 0.04), 700, left ? rig.elbowL : rig.elbowR);
      joint(upper, lower, el, uC, fC);

      const hp = P.clone().add(new THREE.Vector3(0, -0.04, z * D.hipW * b * s));
      const tC = hp.clone().add(new THREE.Vector3(0, (-D.thigh * s) / 2, 0));
      const thigh = mk(tC, RAPIER.ColliderDesc.capsule((D.thigh * s) / 2 - 0.06, 0.07), 800, left ? rig.hipL : rig.hipR);
      joint(pelvis, thigh, hp, pelvisC, tC);
      const kn = hp.clone().add(new THREE.Vector3(0, -D.thigh * s, 0));
      const sC = kn.clone().add(new THREE.Vector3(0, (-D.shin * s) / 2, 0));
      const shin = mk(sC, RAPIER.ColliderDesc.capsule((D.shin * s) / 2 - 0.05, 0.055), 800, left ? rig.kneeL : rig.kneeR);
      joint(thigh, shin, kn, tC, sC);
    }
    this.torso = torso;

    // the tam leaves his head and makes its own way down the hill
    const hatVis = rig.hat!;
    scene.add(hatVis);
    rig.hat = null;
    this.hat = mk(headC.clone().add(new THREE.Vector3(0, 0.16, 0)), RAPIER.ColliderDesc.cylinder(0.03, 0.18), 80);
    this.hat.mesh = hatVis;
    this.hat.body.setLinvel({ x: launch.x * 0.5, y: launch.y + 6, z: launch.z * 0.5 }, true);
    this.hat.body.setAngvel({ x: 2, y: 14, z: 3 }, true);
    this.hat.body.setLinearDamping(0.8);
    this.sync();
  }

  onForce(force: number) {
    if (force / this.mass > 40 && G.time - this.lastOof > 0.5) {
      this.lastOof = G.time;
      G.sfx.oof();
    }
  }

  get speed() {
    const v = this.torso.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  dispose() {
    for (const p of this.parts) G.physics.removeBody(p.body);
    if (this.hat) this.scene.remove(this.hat.mesh);
    this.scene.remove(this.rig.root);
    this.rig.body.skeleton.dispose();
    this.rig.body.geometry.dispose();
    this.rig.face.geometry.dispose();
    this.parts = [];
  }

  get position() {
    const t = this.torso.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  sync() {
    for (const p of this.parts) {
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      p.mesh.position.set(t.x, t.y, t.z);
      if (p.off) p.mesh.position.add(_off.copy(p.off).applyQuaternion(p.mesh.quaternion));
    }
  }
}

const _off = new THREE.Vector3();

/**
 * Hamish back on his feet, legging it after the trolley. A kinematic body, so anything in his
 * way (tourists, bins) gets shoved aside. He's kept inside the street.
 */
export class Runner implements Entity {
  kind = 'rider';
  mass = 80;
  body: RAPIER.RigidBody;
  mesh = new THREE.Group();
  rig: Rig;
  pos: THREE.Vector3;
  speed = 0;
  private t = 0;
  private yaw = 0;

  constructor(private scene: THREE.Scene, start: THREE.Vector3) {
    this.pos = start.clone();
    this.pos.y = G.terrain.heightAt(start.x, start.z);
    this.body = G.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y + 0.95, this.pos.z),
    );
    const col = G.physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.45, 0.25).setFriction(0.5), this.body);
    G.physics.register(col, this);
    const o = hamishOutfit();
    o.hat = null; // it's somewhere back up the hill
    this.rig = buildHuman(o);
    this.mesh.add(this.rig.root);
    scene.add(this.mesh);
  }

  /** Run towards the target. Returns the horizontal distance left. */
  update(h: number, target: THREE.Vector3) {
    this.t += h;
    const d = new THREE.Vector3(target.x - this.pos.x, 0, target.z - this.pos.z);
    const dist = d.length();
    const want = dist > 3 ? 8.5 : Math.max(2, dist * 2.5);
    this.speed += (want - this.speed) * Math.min(1, h * 2.5);
    if (dist > 0.05) {
      d.normalize();
      this.pos.addScaledVector(d, Math.min(dist, this.speed * h));
      const targetYaw = Math.atan2(-d.z, d.x);
      let dy = targetYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, h * 10);
    }
    const r = toRoad(this.pos.x, this.pos.z);
    const u = Math.max(-edgeL(r.s) + 0.6, Math.min(edgeR(r.s) - 0.6, r.u));
    if (u !== r.u) {
      const p = toWorld(r.s, u, 0);
      this.pos.x = p.x;
      this.pos.z = p.z;
    }
    this.pos.y = G.terrain.heightAt(this.pos.x, this.pos.z);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + 0.95, z: this.pos.z });
    return dist;
  }

  sync() {
    const k = Math.min(1, this.speed / 6);
    const ph = this.t * (6 + this.speed * 1.4);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += Math.abs(Math.sin(ph)) * 0.08 * k;
    this.mesh.rotation.set(0, this.yaw, 0);
    poseRun(this.rig, ph, k);
    // arms thrown up in despair every so often
    if (Math.sin(this.t * 1.7) > 0.85) poseFlail(this.rig, this.t, 1);
    if (this.rig.kilt) this.rig.kilt.scale.set(1 + 0.1 * k, 1 - Math.abs(Math.sin(ph)) * 0.15 * k, 1 + 0.1 * k);
  }

  dispose() {
    G.physics.removeBody(this.body);
    this.scene.remove(this.mesh);
    this.rig.body.skeleton.dispose();
    this.rig.body.geometry.dispose();
    this.rig.face.geometry.dispose();
  }
}
