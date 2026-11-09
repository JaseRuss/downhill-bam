import * as THREE from 'three';
import { RAPIER, Entity, STEP } from '../core/Physics';
import { G } from '../ctx';
import * as Road from '../world/Road';
import { theta, toWorld, toRoad, forward, right, edgeL, edgeR } from '../world/Road';
import { buildSeatedRider, Ragdoll, Runner, SeatedRider } from './Rider';
import { VEHICLES, VehicleId, VehicleParts, VehicleSpec } from './Vehicles';

const HOP_RECHARGE = 5;

export class Trolley implements Entity {
  kind = 'trolley';
  mass = 120;
  spec: VehicleSpec;
  parts!: VehicleParts;
  engineOn = false;
  /** Seconds of SKOOSH boost left. */
  boostT = 0;
  private fizzT = 0;
  /** Seconds until a used hop comes back (0 = not recharging). */
  hopCharge = 0;
  splashed = false;
  private smokeT = 0;
  private spinA = 0;
  body: RAPIER.RigidBody;
  vc: RAPIER.DynamicRayCastVehicleController;
  mesh = new THREE.Group();
  wheels: THREE.Object3D[] = [];
  springs: THREE.Object3D[] = [];
  rider: SeatedRider;
  ragdoll: Ragdoll | null = null;
  runner: Runner | null = null;
  private getUpAt = 0;
  private ejectedAt = 0;
  private boardedAt = -10;
  private underShape: RAPIER.Cuboid;
  riderCol: RAPIER.Collider;
  ballastCol: RAPIER.Collider;

  ejected = false;
  launched = false;
  steer = 0;
  hops = 1;
  grounded = true;
  airTime = 0;
  maxAir = 0;
  minVy = 0;
  topSpeed = 0;
  lastGrounded = 0;
  flippedTime = 0;
  private prevVel = new THREE.Vector3();
  private prevAng = new THREE.Vector3();
  private wobbleT = Math.random() * 10;
  private lastHitShake = 0;

  constructor(private scene: THREE.Scene, s: number, u: number, vehicle: VehicleId = 'trolley') {
    const spec = (this.spec = VEHICLES[vehicle]);
    this.underShape = new RAPIER.Cuboid(...spec.under);
    const world = G.physics.world;
    const p = toWorld(s, u, 0.45);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta(s) - Math.PI / 2);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setCcdEnabled(true)
        .setLinearDamping(0.03)
        .setAngularDamping(0.5),
    );
    const ev = RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS;
    const add = (d: RAPIER.ColliderDesc) => {
      const c = world.createCollider(d.setActiveEvents(ev).setContactForceEventThreshold(1500), this.body);
      G.physics.register(c, this);
      return c;
    };
    const [bx, by, bz, byc, bd] = spec.body;
    add(RAPIER.ColliderDesc.cuboid(bx, by, bz).setTranslation(0, byc, 0).setDensity(bd).setFriction(0.4).setRestitution(0.2));
    const [dx, dy, dz, dyc, dd] = spec.deck;
    add(RAPIER.ColliderDesc.cuboid(dx, dy, dz).setTranslation(0, dyc, 0).setDensity(dd).setFriction(0.3));
    const [lx, ly, lz, lyc, ld] = spec.ballast;
    this.ballastCol = add(RAPIER.ColliderDesc.cuboid(lx, ly, lz).setTranslation(0, lyc, 0).setDensity(ld));
    this.riderCol = add(this.riderDesc());
    this.mass = this.body.mass() || 120;

    this.vc = world.createVehicleController(this.body);
    spec.wheels.forEach(([x, z], i) => {
      // soft, long-travel springs: it bobs over the cobbles and bounces on landings
      this.vc.addWheel({ x, y: spec.wheelY, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, spec.suspRest, spec.wheelR);
      this.vc.setWheelSuspensionStiffness(i, spec.stiffness);
      this.vc.setWheelSuspensionCompression(i, 2.2);
      this.vc.setWheelSuspensionRelaxation(i, 1.7);
      this.vc.setWheelMaxSuspensionTravel(i, spec.travel);
      this.vc.setWheelFrictionSlip(i, 1.6);
      this.vc.setWheelSideFrictionStiffness(i, 0.9);
    });

    this.parts = spec.build(this.mesh);
    this.wheels = this.parts.wheels;
    this.springs = this.parts.springs;
    this.mesh.traverse((o: any) => o.isMesh && (o.castShadow = true));
    this.rider = buildSeatedRider();
    this.rider.group.position.set(spec.seat[0], spec.seat[1], 0);
    this.rider.rig.pelvis.rotation.z = spec.seat[2];
    this.mesh.add(this.rider.group);
    scene.add(this.mesh);
    this.sync(0);
  }

  private riderDesc() {
    const [x, y] = this.spec.riderCol;
    return RAPIER.ColliderDesc.capsule(0.22, 0.24).setTranslation(x, y, 0).setDensity(150).setFriction(0.5)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1500);
  }

  onForce(force: number, other: Entity | undefined) {
    const load = force / this.mass;
    if (load > 60 && G.time - this.lastHitShake > 0.15) {
      this.lastHitShake = G.time;
      G.shake(Math.min(1, load / 500));
    }
    // smashing through breakable things shouldn't throw Hamish out; walls and landmarks will
    const o: any = (other as any)?.opts;
    const breakable = other?.kind === 'part' && o && ((o.release !== undefined && o.release < 1000) || o.fracture || o.dynamic);
    const limit = (breakable || other?.kind === 'tourist' || other?.kind === 'debris' ? 1600 : 560) * this.spec.grip;
    if (!this.ejected && this.launched && load > limit) this.eject('crash');
  }

  get position() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get velocity() {
    const v = this.body.linvel();
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  get speed() {
    return this.velocity.length();
  }

  get forwardDir() {
    const r = this.body.rotation();
    return new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
  }

  get upDir() {
    const r = this.body.rotation();
    return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
  }

  get roadS() {
    const t = this.body.translation();
    return toRoad(t.x, t.z).s;
  }

  /** Point the trolley along the street with an aim offset (radians, + = right). */
  aim(s: number, u: number, offset: number) {
    const p = toWorld(s, u, 0.32);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta(s) - Math.PI / 2 - offset);
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  launch(speed: number, wobble: number) {
    this.launched = true;
    const f = this.forwardDir;
    f.y = 0;
    f.normalize().multiplyScalar(speed);
    this.body.setLinvel({ x: f.x, y: 0.6, z: f.z }, true);
    this.body.setAngvel({ x: 0, y: wobble, z: 0 }, true);
  }

  hop() {
    if (this.ejected || this.hops <= 0) return false;
    // stuck in a hole (beached on rubble, wheels in the air)? you can still hop out
    const stuck = this.speed < 1.5;
    if (G.time - this.lastGrounded > 0.25 && !stuck) return false;
    this.hops--;
    if (this.hops <= 0 && this.hopCharge <= 0) this.hopCharge = HOP_RECHARGE;
    // a shove the way it's facing as well as up: a bit at speed, a lot when nearly stopped
    const f = this.forwardDir.setY(0);
    if (f.lengthSq() < 0.01) f.copy(forward(this.roadS));
    f.normalize();
    const fwd = this.mass * (2.0 + (stuck ? 3.0 : this.speed < 4 ? 1.5 : 0));
    this.body.applyImpulse({ x: f.x * fwd, y: this.mass * 6.2 * this.spec.hop, z: f.z * fwd }, true);
    this.body.applyTorqueImpulse({ x: 0, y: 0, z: 0 }, true);
    G.sfx.boing();
    return true;
  }

  /** A can of SKOOSH: a few seconds of shove, engine or no engine. */
  boost(secs: number) {
    this.boostT = Math.max(this.boostT, secs);
  }

  /** Called when the trolley breaks something: keep most of the speed so it ploughs through. */
  smashThrough(retain: number) {
    const cur = this.body.linvel();
    const curSpeed = Math.hypot(cur.x, cur.y, cur.z);
    const prevSpeed = this.prevVel.length();
    if (curSpeed < prevSpeed * retain) {
      const v = this.prevVel.clone().multiplyScalar(retain);
      this.body.setLinvel({ x: v.x, y: Math.max(v.y, cur.y), z: v.z }, true);
      const a = this.prevAng.clone().multiplyScalar(0.6);
      this.body.setAngvel({ x: a.x, y: a.y, z: a.z }, true);
    }
  }

  eject(reason: string) {
    if (this.ejected || G.time - this.boardedAt < 1.2) return;
    this.ejected = true;
    this.ejectedAt = G.time;
    this.getUpAt = G.time + 1.6;
    this.ragdoll?.dispose();
    this.mesh.remove(this.rider.group);
    this.mesh.updateMatrixWorld(true);
    const v = this.velocity;
    this.ragdoll = new Ragdoll(this.scene, this.mesh.matrixWorld.clone(), v.multiplyScalar(1.05));
    G.physics.unregister(this.riderCol);
    G.physics.world.removeCollider(this.riderCol, true);
    this.ballastCol.setDensity(80);
    G.sfx.oof();
    G.sfx.boing();
    G.scoring.award('EJECTED!', 750, this.position.add(new THREE.Vector3(0, 1.5, 0)), true, 'eject');
    G.commentary.say(reason === 'flip' ? 'flip' : 'eject', true);
    G.bigMoment(1);
  }

  /** Hamish has caught up: right the trolley if needed and climb back in. */
  private board() {
    if (!this.ejected) return;
    if (this.upDir.y < 0.6) {
      const f = this.forwardDir.setY(0);
      const yaw = f.lengthSq() > 0.01 ? Math.atan2(-f.z, f.x) : theta(this.roadS) - Math.PI / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const t = this.body.translation();
      this.body.setTranslation({ x: t.x, y: t.y + 0.4, z: t.z }, true);
      this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.runner?.dispose();
    this.runner = null;
    this.ragdoll?.dispose();
    this.ragdoll = null;
    this.mesh.add(this.rider.group);
    this.riderCol = G.physics.world.createCollider(this.riderDesc(), this.body);
    G.physics.register(this.riderCol, this);
    this.ballastCol.setDensity(this.spec.ballast[4]);
    this.ejected = false;
    this.flippedTime = 0;
    this.boardedAt = G.time;
    G.sfx.boing();
    G.scoring.award('BACK IN!', 300, this.position.add(new THREE.Vector3(0, 1.5, 0)), true, 'reboard');
    G.commentary.say('reboard', true);
  }

  /** After an ejection: tumble, get up, run after the trolley, hop back in. */
  private updateHamish(h: number) {
    if (!this.ejected) return;
    const tp = this.position;
    if (this.ragdoll && !this.runner) {
      const settled = this.ragdoll.speed < 2.5 || G.time > this.getUpAt + 2;
      if (G.time > this.getUpAt && settled) {
        const start = this.ragdoll.position;
        this.ragdoll.dispose();
        this.ragdoll = null;
        this.runner = new Runner(this.scene, start);
        G.commentary.say('chase', true);
      }
    }
    if (this.runner) {
      const dist = this.runner.update(h, tp);
      if (dist < 1.3 && this.speed < 5) this.board();
    }
  }

  /** Run before each physics step. */
  preStep(h: number, steerInput: number, control: boolean) {
    const v = this.body.linvel(), a = this.body.angvel();
    this.prevVel.set(v.x, v.y, v.z);
    this.prevAng.set(a.x, a.y, a.z);
    const speed = this.prevVel.length();

    const authority = control && !this.ejected ? 1 : 0;
    const maxSteer = 0.36 / (1 + speed / 10);
    const target = steerInput * maxSteer * authority;
    this.steer += (target - this.steer) * Math.min(1, h * 8);
    this.wobbleT += h;
    // one caster always has a mind of its own
    const shimmy = this.launched ? Math.sin(this.wobbleT * 17) * 0.035 * Math.min(1, speed / 6) + 0.003 : 0;
    this.vc.setWheelSteering(0, -this.steer + shimmy);
    this.vc.setWheelSteering(1, -this.steer);
    for (let i = 0; i < this.spec.wheels.length; i++) this.vc.setWheelBrake(i, this.launched ? 0 : 3);

    // gravity does the work, but give a stalled trolley a cheeky nudge downhill
    this.body.resetForces(true);
    this.body.resetTorques(true);
    // (also when beached on rubble with the wheels off the ground)
    const roadS = this.roadS;
    if (this.launched && (this.grounded || speed < 1.5) && speed < 12 && this.upDir.y > 0.3 && roadS < Road.ASSIST_END) {
      const f = forward(roadS);
      const push = speed < 1.5 ? 3.6 : speed < 4 ? 2.2 : 1.1;
      this.body.addForce({ x: f.x * this.mass * push, y: 0, z: f.z * this.mass * push }, true);
    }
    this.engine(roadS, speed);
    this.skoosh(h);
    this.buoyancy();
    // nearly stopped? Hamish paddles with his feet: steer keys swivel the trolley on the spot
    if (control && !this.ejected && this.launched && speed < 2.5 && steerInput !== 0) {
      this.body.addTorque({ x: 0, y: -steerInput * this.mass * 2.2, z: 0 }, true);
      const f = this.forwardDir;
      this.body.addForce({ x: f.x * this.mass * 1.5, y: 0, z: f.z * this.mass * 1.5 }, true);
    }
    // the nose always wants to point down the hill
    if (this.launched && this.upDir.y > 0.5) {
      const f = this.forwardDir.setY(0);
      if (f.lengthSq() > 0.01) {
        f.normalize();
        const s = this.roadS;
        const ang = Math.atan2(f.dot(right(s)), f.dot(forward(s))); // + = pointing right of downhill
        const steering = control && !this.ejected && steerInput !== 0;
        const slow = 1 + 1.5 * (1 - Math.min(1, speed / 5)); // casters swivel harder at walking pace
        const k = (this.grounded ? 2.2 * slow : 0.8) * (steering ? 0.35 : 1);
        this.body.addTorque({ x: 0, y: this.mass * k * ang, z: 0 }, true);
      }
    }
    this.clearUnderneath();
    // a soft cushion near the building lines: the trolley is eased away before it scrapes the wall
    if (this.launched) {
      const p = this.body.translation();
      const { s, u } = toRoad(p.x, p.z);
      if (s > Road.WALL_S0 && s < Road.WALL_S1 - 2) {
        const R = right(s);
        const lat = v.x * R.x + v.z * R.z; // + = moving towards the right wall
        const zone = 1.3;
        const dR = edgeR(s) - u, dL = u + edgeL(s);
        let push = 0;
        if (dR < zone) push -= (1 - Math.max(0, dR) / zone) * (lat > 0 ? 10 : 4);
        if (dL < zone) push += (1 - Math.max(0, dL) / zone) * (lat < 0 ? 10 : 4);
        if (push) this.body.addForce({ x: R.x * this.mass * push, y: 0, z: R.z * this.mass * push }, true);
      }
    }
    // arcade "stay upright" assist: strong on the ground, gentle in the air, off once Hamish is gone
    if (this.launched) {
      const up = this.upDir;
      const k = this.ejected ? 0 : this.grounded ? 22 : 7;
      const tq = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).multiplyScalar(this.mass * k);
      // only correct roll/pitch, leave yaw alone
      const av = this.body.angvel();
      const roll = new THREE.Vector3(av.x, 0, av.z).multiplyScalar(-this.mass * (this.ejected ? 0 : 1.2));
      this.body.addTorque({ x: tq.x + roll.x, y: 0, z: tq.z + roll.z }, true);
    }
    this.vc.updateVehicle(h);
  }

  /**
   * Motorised vehicles freewheel down the Royal Mile, then fire up at the Grassmarket for the climb
   * to Princes Street. The engine cuts out if Hamish falls off (dead man's handle).
   */
  private engine(roadS: number, speed: number) {
    const e = this.spec.engine;
    if (!e || !this.launched || this.splashed) return;
    if (!this.engineOn && roadS > Road.ENGINE_S) {
      this.engineOn = true;
      G.sfx.engineStart(e.start);
      G.commentary.say('engine_' + e.start, true);
      G.scoring.award('ENGINE ON!', 250, this.position.add(new THREE.Vector3(0, 1.8, 0)), true, 'engine');
    }
    if (!this.engineOn || this.ejected || !this.grounded || this.upDir.y < 0.5) return;
    const f = this.forwardDir.setY(0);
    if (f.lengthSq() < 0.01) return;
    f.normalize();
    const along = this.prevVel.dot(f);
    if (along >= e.top) return;
    // full shove from a standstill, easing off near top speed
    const k = Math.min(1, (e.top - along) / (e.top * 0.35));
    const a = e.accel * k + (along < 2 ? 1.5 : 0);
    this.body.addForce({ x: f.x * this.mass * a, y: 0, z: f.z * this.mass * a }, true);
  }

  /** The boost: a hard push the way it's facing, up to a (silly) top speed. */
  private skoosh(h: number) {
    if (this.boostT <= 0) return;
    this.boostT = Math.max(0, this.boostT - h);
    if (this.ejected || this.splashed || !this.grounded || this.upDir.y < 0.5) return;
    const f = this.forwardDir.setY(0);
    if (f.lengthSq() < 0.01) return;
    f.normalize();
    const along = this.prevVel.dot(f);
    if (along > 26) return; // about 58 mph
    const a = 8.5 * Math.min(1, this.boostT / 0.6 + 0.2);
    this.body.addForce({ x: f.x * this.mass * a, y: 0, z: f.z * this.mass * a }, true);
  }

  /** In the Forth: thick water drag, and down it goes. */
  private buoyancy() {
    if (Road.SEA_Y < -500) return;
    const t = this.body.translation();
    if (t.y > Road.SEA_Y) return;
    const v = this.body.linvel();
    // drag everything to a slow, stately sink
    this.body.addForce({ x: -v.x * this.mass * 2.5, y: this.mass * 7.5 - v.y * this.mass * 2.5, z: -v.z * this.mass * 2.5 }, true);
  }

  /** Shove anything wedged under the trolley at ground level out to the side. */
  private clearUnderneath() {
    if (!this.launched) return;
    const r = this.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const c = new THREE.Vector3(0, -0.06, 0).applyQuaternion(q).add(this.position);
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const fwd = this.forwardDir.setY(0).normalize();
    // collect first: bodies can't be modified from inside the physics query callback
    const found: RAPIER.RigidBody[] = [];
    G.physics.world.intersectionsWithShape(c, r, this.underShape, (col) => {
      const b = col.parent();
      if (b && found.length < 12 && !found.includes(b)) found.push(b);
      return true;
    }, undefined, undefined, undefined, this.body);
    for (const b of found) {
      if (!b.isDynamic()) continue;
      const bp = b.translation();
      const rel = new THREE.Vector3(bp.x - c.x, 0, bp.z - c.z);
      let sgn = Math.sign(rel.dot(side));
      if (sgn === 0) sgn = Math.random() < 0.5 ? -1 : 1;
      const v = b.linvel();
      const lateral = v.x * side.x * sgn + v.z * side.z * sgn;
      if (lateral < 4) {
        const m = b.mass();
        const dv = 0.45;
        b.applyImpulse({ x: (side.x * sgn + fwd.x * 0.3) * m * dv, y: m * 0.05, z: (side.z * sgn + fwd.z * 0.3) * m * dv }, true);
      }
    }
  }

  /** Run after each physics step. */
  postStep(h: number) {
    this.updateHamish(h);
    if (this.hopCharge > 0) {
      this.hopCharge -= h;
      if (this.hopCharge <= 0) {
        this.hopCharge = 0;
        if (this.hops < 1) {
          this.hops = 1;
          G.sfx.coin(1.6);
        }
      }
    }
    if (!this.launched) {
      this.airTime = 0;
      this.minVy = 0;
    }
    let contact = false;
    for (let i = 0; i < this.spec.wheels.length; i++) if (this.vc.wheelIsInContact(i)) contact = true;
    const v = this.body.linvel();
    if (contact) {
      if (!this.grounded && this.airTime > 0.15) this.land();
      this.grounded = true;
      this.lastGrounded = G.time;
      this.airTime = 0;
      this.minVy = 0;
    } else {
      this.grounded = false;
      this.airTime += h;
      this.minVy = Math.min(this.minVy, v.y);
    }
    const sp = Math.hypot(v.x, v.y, v.z);
    if (this.launched) this.topSpeed = Math.max(this.topSpeed, sp);
    // upside down for a while? Hamish is leaving.
    if (this.launched && !this.ejected) {
      if (this.upDir.y < 0.25) this.flippedTime += h;
      else this.flippedTime = 0;
      if (this.flippedTime > 0.6) this.eject('flip');
    }
  }

  private land() {
    const air = this.airTime;
    if (air > 0.7 && !this.ejected) {
      G.scoring.award('KILT LIFT!', Math.round(air * 350), this.position.add(new THREE.Vector3(0, 2, 0)), true, 'air');
      G.commentary.say('airtime');
    }
    if (this.minVy < -8.5) {
      const p = this.position;
      G.terrain.crater(p.x, p.z, Math.min(2, 0.6 + (-this.minVy - 8.5) * 0.15), 0.18);
    }
    G.sfx.impact(Math.min(1, -this.minVy / 10), 'metal');
  }

  sync(dt: number) {
    const t = this.body.translation(), r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    const sp = this.spec;
    for (let i = 0; i < sp.wheels.length; i++) {
      const w = this.wheels[i];
      const len = this.vc.wheelSuspensionLength(i) ?? sp.suspRest;
      w.position.set(sp.wheels[i][0], sp.wheelY - len, sp.wheels[i][1]);
      const top = this.springs[i].position.y;
      this.springs[i].scale.y = Math.max(0.02, top - (sp.wheelY - len) - 0.03);
      // casters swivel to follow travel; front ones also follow steering
      w.rotation.y = i < 2 ? -(this.vc.wheelSteering(i) ?? 0) : 0;
      const spin = w.getObjectByName('spin')!;
      spin.rotation.z = -(this.vc.wheelRotation(i) ?? 0);
    }
    if (this.parts.spinner && this.engineOn) {
      this.spinA += dt * (this.ejected ? 8 : 40);
      this.parts.spinner.rotation.x = this.spinA;
    }
    // orange fizz streaming off the back while boosting
    if (this.boostT > 0 && !this.ejected) {
      this.fizzT -= dt;
      if (this.fizzT <= 0) {
        this.fizzT = 0.05;
        const back = this.forwardDir.multiplyScalar(-0.8).add(this.position).add(new THREE.Vector3(0, 0.5, 0));
        G.fx.dust(back, 0.35, Math.random() < 0.5 ? 0x9b59d0 : 0xffd400, 2);
      }
    }
    if (this.parts.exhaust && this.engineOn && !this.ejected && this.launched) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.12;
        this.mesh.updateMatrixWorld(true);
        const p = new THREE.Vector3().setFromMatrixPosition(this.parts.exhaust.matrixWorld);
        G.fx.dust(p, 0.3, 0x8d9096, 1);
      }
    }
    if (!this.ejected) {
      const sp = this.speed;
      const tt = G.time;
      const flail = Math.min(1, sp / 12);
      const rig = this.rider.rig;
      // arms up, waving wildly the faster he goes
      rig.shoulderL.rotation.set(-0.45 - Math.sin(tt * 9) * 0.35 * flail, 0, 2.6 + Math.sin(tt * 7) * 0.4 * flail);
      rig.shoulderR.rotation.set(0.45 + Math.sin(tt * 8 + 1) * 0.35 * flail, 0, 2.6 + Math.cos(tt * 7) * 0.4 * flail);
      rig.elbowL.rotation.z = 0.3 + Math.sin(tt * 11) * 0.4 * flail;
      rig.elbowR.rotation.z = 0.3 + Math.cos(tt * 10) * 0.4 * flail;
      rig.head.rotation.z = -0.1 - flail * 0.15 + Math.sin(tt * 13) * 0.05 * flail;
      const air = this.grounded ? 0 : Math.min(1, this.airTime * 2);
      if (rig.kilt) {
        rig.kilt.scale.set(1 + air * 0.4, 1 - air * 0.35 + Math.sin(tt * 20) * 0.04 * flail, 1 + air * 0.4);
        rig.kilt.position.y = -0.14 + air * 0.1;
      }
      // legs kick in the air
      rig.kneeL.rotation.z = -1.25 + air * Math.sin(tt * 15) * 0.6;
      rig.kneeR.rotation.z = -1.25 + air * Math.cos(tt * 15) * 0.6;
      if (rig.hat) rig.hat.rotation.z = -flail * 0.3 + Math.sin(tt * 13) * 0.08 * flail;
    }
    this.ragdoll?.sync();
    this.runner?.sync();
  }

  get focus() {
    return this.position;
  }
}

export { STEP };
