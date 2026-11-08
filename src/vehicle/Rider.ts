import * as THREE from 'three';
import { RAPIER, Entity } from '../core/Physics';
import { G } from '../ctx';
import { toRoad, toWorld, edgeL, edgeR } from '../world/Road';
import { buildHuman, D, foot, hamishOutfit, hand, hatMesh, headMesh, poseFlail, poseRun, Rig, segment } from '../art/Humanoid';

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
  return { group, rig };
}

interface RagPart {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
}

/**
 * Physics ragdoll for when Hamish leaves the trolley: 11 bodies (pelvis, torso, head, upper and
 * lower arms, thighs, shins) on ball joints, plus a hat that goes its own way.
 */
export class Ragdoll implements Entity {
  kind = 'rider';
  mass = 80;
  parts: RagPart[] = [];
  torso!: RagPart;
  hat: RagPart | null = null;
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

    const mk = (local: THREE.Vector3, desc: RAPIER.ColliderDesc, visual: THREE.Object3D, density: number) => {
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
      visual.traverse((x: any) => x.isMesh && (x.castShadow = true));
      this.scene.add(visual);
      const part = { body, mesh: visual };
      this.parts.push(part);
      return part;
    };
    /** A limb segment mesh centred on its body (segment() hangs from its top). */
    const limbVis = (len: number, r0: number, r1: number, mat: THREE.Material, end?: THREE.Object3D) => {
      const g = new THREE.Group();
      const seg = segment(len, r0, r1, mat);
      seg.position.y = len / 2;
      g.add(seg);
      if (end) {
        end.position.y = -len / 2;
        g.add(end);
      }
      return g;
    };
    const joint = (a: RagPart, bb: RagPart, at: THREE.Vector3, ca: THREE.Vector3, cb: THREE.Vector3) =>
      world.createImpulseJoint(RAPIER.JointData.spherical(at.clone().sub(ca), at.clone().sub(cb)), a.body, bb.body, true);

    // layout in the figure frame (pelvis at the seated position, standing upright)
    const P = new THREE.Vector3(-0.12, 0.45, 0);
    const pelvisC = P.clone();
    const torsoC = P.clone().add(new THREE.Vector3(0, 0.27 * s, 0));
    const headC = P.clone().add(new THREE.Vector3(0, (D.abdomen + D.chest + D.neck + D.headR) * s, 0));

    const pelvisVis = new THREE.Group();
    const kilt = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s * b, 0.25 * s * b, 0.36 * s, 16, 1, true), o.legMat);
    kilt.position.y = -0.12 * s;
    pelvisVis.add(kilt);
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.15 * s * b, 12, 8), o.shirt);
    hips.scale.set(0.85, 0.7, 1.15);
    pelvisVis.add(hips);
    const sporran = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a3a22 }));
    sporran.position.set(0.17, -0.08, 0);
    pelvisVis.add(sporran);
    const pelvis = mk(pelvisC, RAPIER.ColliderDesc.cuboid(0.12, 0.1, 0.17), pelvisVis, 900);

    const torsoVis = new THREE.Group();
    const ribs = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * s * b, 0.145 * s * b, 0.5 * s, 12), o.shirt);
    ribs.scale.set(0.75, 1, 1.12);
    torsoVis.add(ribs);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s * b, 12, 8), o.shirt);
    belly.position.set(0.06, -0.1, 0);
    torsoVis.add(belly);
    const torso = mk(torsoC, RAPIER.ColliderDesc.cuboid(0.13, 0.25 * s, 0.2), torsoVis, 900);
    joint(pelvis, torso, P.clone().add(new THREE.Vector3(0, 0.03, 0)), pelvisC, torsoC);

    const headVis = new THREE.Group();
    headVis.add(headMesh(o, s));
    const head = mk(headC, RAPIER.ColliderDesc.ball(0.14 * s), headVis, 700);
    joint(torso, head, P.clone().add(new THREE.Vector3(0, (D.abdomen + D.chest + 0.03) * s, 0)), torsoC, headC);

    for (const z of [1, -1]) {
      const sh = P.clone().add(new THREE.Vector3(0, (D.abdomen + D.chest - 0.04) * s, z * (D.shoulderW * b + 0.03) * s));
      const uC = sh.clone().add(new THREE.Vector3(0, (-D.upperArm * s) / 2, 0));
      const upper = mk(uC, RAPIER.ColliderDesc.capsule((D.upperArm * s) / 2 - 0.04, 0.05), limbVis(D.upperArm * s, 0.048 * b, 0.04 * b, o.shirt), 700);
      joint(torso, upper, sh, torsoC, uC);
      const el = sh.clone().add(new THREE.Vector3(0, -D.upperArm * s, 0));
      const fC = el.clone().add(new THREE.Vector3(0, (-D.forearm * s) / 2, 0));
      const lower = mk(fC, RAPIER.ColliderDesc.capsule((D.forearm * s) / 2 - 0.03, 0.04), limbVis(D.forearm * s, 0.038 * b, 0.03, o.shirt, hand(o.skin, s)), 700);
      joint(upper, lower, el, uC, fC);

      const hp = P.clone().add(new THREE.Vector3(0, -0.04, z * D.hipW * b * s));
      const tC = hp.clone().add(new THREE.Vector3(0, (-D.thigh * s) / 2, 0));
      const thigh = mk(tC, RAPIER.ColliderDesc.capsule((D.thigh * s) / 2 - 0.06, 0.07), limbVis(D.thigh * s, 0.075 * b, 0.055 * b, o.skin), 800);
      joint(pelvis, thigh, hp, pelvisC, tC);
      const kn = hp.clone().add(new THREE.Vector3(0, -D.thigh * s, 0));
      const sC = kn.clone().add(new THREE.Vector3(0, (-D.shin * s) / 2, 0));
      const shin = mk(sC, RAPIER.ColliderDesc.capsule((D.shin * s) / 2 - 0.05, 0.055), limbVis(D.shin * s, 0.052 * b, 0.038, o.socks ?? o.skin, foot(o.shoes, s)), 800);
      joint(thigh, shin, kn, tC, sC);
    }
    this.torso = torso;

    const hatVis = hatMesh('tam', o.hatMat, s)!;
    this.hat = mk(headC.clone().add(new THREE.Vector3(0, 0.16, 0)), RAPIER.ColliderDesc.cylinder(0.03, 0.18), hatVis, 80);
    this.hat.body.setLinvel({ x: launch.x * 0.5, y: launch.y + 6, z: launch.z * 0.5 }, true);
    this.hat.body.setAngvel({ x: 2, y: 14, z: 3 }, true);
    this.hat.body.setLinearDamping(0.8);
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
    for (const p of this.parts) {
      G.physics.removeBody(p.body);
      this.scene.remove(p.mesh);
    }
    this.parts = [];
  }

  get position() {
    const t = this.torso.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  sync() {
    for (const p of this.parts) {
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}

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
  }
}
