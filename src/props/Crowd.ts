import * as THREE from 'three';
import { RAPIER, Entity } from '../core/Physics';
import { G } from '../ctx';
import { QUALITY } from '../core/Platform';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, color } from '../art/Materials';
import { theta, toWorld, toRoad, forward, right } from '../world/Road';
import { buildHuman, fanOutfit, ghostOutfit, mimeOutfit, piperOutfit, poseFlail, poseSplat, poseStand, Rig, touristOutfit } from '../art/Humanoid';

export type TouristKind = 'tourist' | 'ghost' | 'mime' | 'piper' | 'hearts' | 'hibs';

class Tourist implements Entity {
  kind = 'tourist';
  mass: number;
  body: RAPIER.RigidBody;
  mesh = new THREE.Group();
  rig: Rig;
  state: 'idle' | 'dodging' | 'flying' | 'down' = 'idle';
  downAt = 0;
  scored = false;
  dodgeChance: number;
  faceYaw: number;
  bob = Math.random() * 10;
  seed = Math.random() * 10;
  half: number;
  photographer = Math.random() < 0.35;
  /** Far away and standing still: one merged mesh per material instead of ~27 jointed parts. */
  private lod: THREE.Group | null = null;
  private lodOff = false;

  constructor(s: number, u: number, public type: TouristKind, public label: string, public points: number, yOff = 0) {
    const fan = type === 'hearts' || type === 'hibs';
    const outfit = fan ? fanOutfit(type, Math.random) : type === 'ghost' ? ghostOutfit() : type === 'mime' ? mimeOutfit() : type === 'piper' ? piperOutfit() : touristOutfit(Math.random);
    this.rig = buildHuman(outfit);
    this.half = this.rig.height / 2;
    const p = toWorld(s, u, this.half + yOff + 0.03);
    // face roughly towards the middle of the street (figures face +X)
    const d = forward(s).multiplyScalar((Math.random() - 0.5) * 1.6).add(right(s).multiplyScalar(-Math.sign(u || 1)));
    this.faceYaw = Math.atan2(-d.z, d.x);
    this.body = G.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).lockRotations().setLinearDamping(0.4).setCcdEnabled(true),
    );
    const col = G.physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.half - 0.24, 0.24).setDensity(150).setFriction(0.9).setRestitution(0.35)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(600),
      this.body,
    );
    this.mass = this.body.mass() || 45;
    G.physics.register(col, this);
    // fans are too busy shouting at each other to get out of the way
    this.dodgeChance = type === 'tourist' ? 0.45 : type === 'ghost' ? 0.2 : fan ? 0.08 : 0;
    this.rig.root.position.y = -this.half;
    this.mesh.add(this.rig.root);
    this.props();
    G.scene.add(this.mesh);
  }

  /** Bits and bobs: bagpipes, a lantern, a camera. */
  private props() {
    const r = this.rig;
    if (this.type === 'piper') {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), M.tartan('green'));
      bag.scale.set(0.9, 0.75, 1.25);
      bag.position.set(0.16, 0.12, 0.12);
      r.chest.add(bag);
      for (let i = 0; i < 3; i++) {
        const drone = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.55 + i * 0.12, 6), M.black());
        drone.position.set(0.05 - i * 0.04, 0.45 + i * 0.05, 0.16 + i * 0.03);
        drone.rotation.set(0.5, 0, -0.35 + i * 0.1);
        r.chest.add(drone);
      }
      const chanter = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.32, 6), M.black());
      chanter.position.set(0.3, 0.02, 0);
      chanter.rotation.z = 0.5;
      r.chest.add(chanter);
    } else if (this.type === 'ghost') {
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), M.emissive(0xffb84d, 2));
      lantern.position.y = -0.32;
      r.elbowR.add(lantern);
    } else if (this.type === 'hearts' || this.type === 'hibs') {
      // a two-colour bar scarf round the neck
      const sc = this.type === 'hearts' ? M.stripes('#7a1f3d', '#f2f2f2') : M.stripes('#0b6b3a', '#f2f2f2');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), sc);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.33;
      r.chest.add(ring);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.09), sc);
      tail.position.set(0.12, 0.14, 0.05);
      r.chest.add(tail);
    } else if (this.type === 'tourist') {
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.12), M.black());
      if (this.photographer) {
        cam.position.set(0.04, -0.3, 0);
        r.elbowR.add(cam);
      } else {
        cam.position.set(0.2, 0.12, 0);
        r.chest.add(cam);
      }
      if (Math.random() < 0.4) {
        const bb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.26), color(0x3a86ff, 0.7));
        bb.position.set(0.16, 0.02, 0);
        r.pelvis.add(bb);
      }
    }
  }

  onForce(force: number, other: Entity | undefined) {
    const load = force / this.mass;
    if (!G.armed || load < 40 || this.state === 'down' || this.state === 'flying') return;
    const tp = this.body.translation(), cp = G.trolley.body.translation();
    if (Math.hypot(tp.x - cp.x, tp.z - cp.z) > 40) return;
    this.knockDown(other);
  }

  /** Off they go, in the most undignified way physics allows. */
  knockDown(other?: Entity) {
    this.dropLod();
    this.state = 'flying';
    this.downAt = G.time;
    this.body.setEnabledRotations(true, true, true, true);
    this.body.setLinearDamping(0.05);
    this.body.setGravityScale(0.55, true); // floaty, cartoon hang-time
    let src: THREE.Vector3;
    if (other?.kind === 'trolley') src = G.trolley.velocity;
    else if (other?.kind === 'rider') src = forward(G.trolley.roadS).multiplyScalar(8);
    else {
      const v = this.body.linvel();
      src = new THREE.Vector3(v.x, v.y, v.z);
    }
    const launch = src.clone().setY(0).multiplyScalar(1.35).add(new THREE.Vector3((Math.random() - 0.5) * 4, 7 + Math.random() * 6, (Math.random() - 0.5) * 4));
    this.body.setLinvel({ x: launch.x, y: launch.y, z: launch.z }, true);
    this.body.setAngvel({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 16, z: (Math.random() - 0.5) * 30 }, true);
    // the hat goes its own way
    const hat = this.rig.hat;
    if (hat && hat.parent) {
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
      hat.getWorldPosition(wp);
      hat.getWorldQuaternion(wq);
      hat.parent.remove(hat);
      hat.position.set(0, 0, 0);
      hat.rotation.set(0, 0, 0);
      const part = G.destruction.add(wp, wq, [0.16, 0.06, 0.16], { visual: hat, dynamic: true, density: 40, sound: 'soft', shape: 'cyl' });
      part.body.setLinvel({ x: launch.x * 0.6, y: launch.y + 5, z: launch.z * 0.6 }, true);
      part.body.setAngvel({ x: 3, y: 18, z: 2 }, true);
      this.rig.hat = null;
    }
    G.sfx.scream(this.type === 'mime' ? 0 : 0.8 + Math.random() * 0.6);
    if (!this.scored) {
      this.scored = true;
      G.scoring.award(this.label, this.points, this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), other?.kind === 'trolley', this.type === 'piper' ? 'piper' : 'tourist');
      if (this.type === 'piper') {
        G.sfx.sadPipes();
        G.commentary.say('piper', true);
      } else if (this.type === 'mime') G.commentary.show('The mime screamed. Silently. Respect.');
      else G.commentary.maybe('tourist', 0.6);
    }
  }

  update(dt: number, trolleyPos: THREE.Vector3, trolleyVel: THREE.Vector3) {
    const t = this.body.translation();
    if (this.state === 'idle' && this.dodgeChance > 0) {
      const dx = t.x - trolleyPos.x, dz = t.z - trolleyPos.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.hypot(trolleyVel.x, trolleyVel.z);
      if (d < 9 && sp > 3) {
        const approach = (dx * trolleyVel.x + dz * trolleyVel.z) / (d * sp);
        if (approach > 0.6) {
          this.state = 'dodging';
          if (Math.random() < this.dodgeChance) {
            const side = new THREE.Vector3(-trolleyVel.z, 0, trolleyVel.x).normalize();
            const dir = dx * side.x + dz * side.z >= 0 ? 1 : -1;
            this.body.applyImpulse({ x: side.x * dir * this.mass * 4.2, y: this.mass * 3.2, z: side.z * dir * this.mass * 4.2 }, true);
          }
        }
      }
    }
    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (this.state === 'flying' && G.time - this.downAt > 0.6 && (speed < 2.5 || G.time - this.downAt > 5)) {
      this.state = 'down';
      this.downAt = G.time;
      this.body.setGravityScale(1, true);
      this.body.setLinearDamping(0.3);
    }
    if (this.state === 'down' && G.time - this.downAt > 2.6 && speed < 0.6) {
      // pops back up, dizzy
      this.state = 'idle';
      this.dodgeChance = 0.9; // fool me once
      this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setTranslation({ x: t.x, y: t.y + 0.5, z: t.z }, true);
      this.body.lockRotations(true, true);
      G.fx.dizzy(this.mesh, this.half + 0.15, 4);
    }
  }

  sync(dt: number) {
    const t = this.body.translation(), r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.bob += dt;
    if (this.state === 'flying' || this.state === 'down') {
      this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (this.state === 'flying') poseFlail(this.rig, this.bob, this.seed);
      else poseSplat(this.rig);
      return;
    }
    this.mesh.rotation.set(0, this.faceYaw, 0);
    const rig = this.rig;
    if (!this.lodOff && this.state === 'idle') {
      const c = G.camera.position;
      const far = (c.x - t.x) ** 2 + (c.z - t.z) ** 2 > QUALITY.lodDistance * QUALITY.lodDistance;
      if (far && this.lod) {
        this.lod.visible = true;
        rig.root.visible = false;
        return;
      }
      if (this.lod) this.lod.visible = false;
      rig.root.visible = true;
    }
    poseStand(rig, this.bob + this.seed);
    if (this.type === 'piper') {
      rig.shoulderL.rotation.set(-0.3, 0, 0.9);
      rig.shoulderR.rotation.set(0.3, 0, 1.0);
      rig.elbowL.rotation.z = 1.5;
      rig.elbowR.rotation.z = 1.4 + Math.sin(this.bob * 8) * 0.08;
      rig.chest.rotation.z = Math.sin(this.bob * 3) * 0.05; // swaying to the tune
      rig.kneeL.rotation.z = -Math.max(0, Math.sin(this.bob * 3)) * 0.3; // tapping a foot
    } else if (this.type === 'mime') {
      // trapped in an invisible box
      const push = Math.sin(this.bob * 2.2);
      rig.shoulderL.rotation.set(-0.25, 0, 1.45 + push * 0.1);
      rig.shoulderR.rotation.set(0.25, 0, 1.45 - push * 0.1);
      rig.elbowL.rotation.z = 0.15;
      rig.elbowR.rotation.z = 0.15;
    } else if (this.type === 'ghost') {
      rig.shoulderR.rotation.set(0.2, 0, 0.9);
      rig.elbowR.rotation.z = 0.9;
      rig.shoulderL.rotation.set(-0.3, 0, 1.6 + Math.sin(this.bob * 1.5) * 0.4); // "and on yer left..."
    } else if (this.type === 'hearts' || this.type === 'hibs') {
      // squaring up: fists pumping, leaning in, bouncing on their toes
      const ph = this.bob * 5 + this.seed * 3;
      rig.shoulderL.rotation.set(-0.35, 0, 2.3 + Math.sin(ph) * 0.55);
      rig.shoulderR.rotation.set(0.35, 0, 1.4 + Math.max(0, Math.sin(ph * 1.3 + 1)) * 1.2);
      rig.elbowL.rotation.z = 0.6 + Math.sin(ph * 1.7) * 0.4;
      rig.elbowR.rotation.z = 1.2;
      rig.chest.rotation.z = -0.18 + Math.sin(ph * 0.5) * 0.06;
      rig.head.rotation.z = 0.15;
      rig.root.position.y = -this.half + Math.abs(Math.sin(ph * 0.9)) * 0.06;
    } else if (this.photographer) {
      rig.shoulderR.rotation.set(0.1, 0, 1.55);
      rig.elbowR.rotation.z = 1.9;
    }
  }

  /** Bake the figure in its current pose into a few merged meshes (one per material). */
  private buildLod() {
    const root = this.rig.root;
    this.mesh.updateMatrixWorld(true);
    const inv = this.mesh.matrixWorld.clone().invert();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    root.traverse((o: any) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const g = (o.geometry as THREE.BufferGeometry).clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.index) return;
      g.applyMatrix4(inv.clone().multiply(o.matrixWorld));
      let l = byMat.get(o.material);
      if (!l) byMat.set(o.material, (l = []));
      l.push(g);
    });
    const lod = new THREE.Group();
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true;
      lod.add(m);
    }
    lod.visible = false;
    this.mesh.add(lod);
    this.lod = lod;
  }

  private dropLod() {
    this.lodOff = true;
    if (this.lod) {
      this.mesh.remove(this.lod);
      this.lod.traverse((o: any) => o.geometry?.dispose());
      this.lod = null;
    }
    this.rig.root.visible = true;
  }

  dispose() {
    G.scene.remove(this.mesh);
  }

  /** Called after the first frame's pose is applied. */
  ensureLod() {
    if (!this.lod && !this.lodOff && this.state === 'idle') this.buildLod();
  }
}

interface Pigeon {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  flying: boolean;
  t: number;
}

class Flock {
  birds: Pigeon[] = [];
  center: THREE.Vector3;
  startled = false;
  scored = false;

  constructor(s: number, u: number, n: number, public gulls = false) {
    this.center = toWorld(s, u, 0);
    const grey = color(gulls ? 0xf2f2ee : 0x7d8590, 0.8), neck = color(gulls ? 0xffffff : 0x4c7a6a, 0.5, 0.3), beak = color(gulls ? 0xf2b630 : 0x333333);
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), grey);
      body.scale.set(1.4, 0.9, 0.9);
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), neck);
      head.position.set(0.13, 0.08, 0);
      g.add(head);
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 5), beak);
      b.rotation.z = -Math.PI / 2;
      b.position.set(0.19, 0.08, 0);
      g.add(b);
      for (const z of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.12), grey);
        wing.position.set(-0.02, 0.04, z * 0.1);
        wing.name = 'wing';
        g.add(wing);
      }
      const p = toWorld(s + (Math.random() - 0.5) * 3, u + (Math.random() - 0.5) * 2.5, 0.1);
      g.position.copy(p);
      g.rotation.y = Math.random() * 6;
      G.scene.add(g);
      this.birds.push({ mesh: g, vel: new THREE.Vector3(), flying: false, t: Math.random() * 5 });
    }
  }

  update(dt: number, trolleyPos: THREE.Vector3) {
    if (!this.startled && trolleyPos.distanceTo(this.center) < 7) {
      this.startled = true;
      const close = trolleyPos.distanceTo(this.center) < 3.2;
      for (const b of this.birds) {
        b.flying = true;
        b.vel.set((Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 6);
      }
      G.sfx.impact(0.4, 'soft');
      if (close && !this.scored) {
        this.scored = true;
        G.fx.feathers(this.center.clone().add(new THREE.Vector3(0, 0.6, 0)), 22);
        G.scoring.award(this.gulls ? 'Seagull Scramble' : 'Pigeon Panic', 60 * this.birds.length, this.center.clone().add(new THREE.Vector3(0, 1.2, 0)), true, 'pigeon');
        G.commentary.maybe('pigeon', 0.7);
      }
    }
    for (const b of this.birds) {
      b.t += dt;
      if (b.flying) {
        b.vel.y += dt * 1.5;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.rotation.y = Math.atan2(-b.vel.z, b.vel.x);
        b.mesh.children.forEach((c) => {
          if (c.name === 'wing') c.rotation.x = Math.sin(b.t * 40) * 0.9 * (c.position.z > 0 ? 1 : -1);
        });
      } else {
        // peck peck
        b.mesh.children[1].position.y = 0.08 - Math.max(0, Math.sin(b.t * 6)) * 0.07;
      }
    }
  }

  dispose() {
    for (const b of this.birds) G.scene.remove(b.mesh);
  }
}

export class Crowd {
  tourists: Tourist[] = [];
  flocks: Flock[] = [];

  tourist(s: number, u: number, type: TouristKind = 'tourist', yOff = 0, labelIn?: string, ptsIn?: number) {
    const label = labelIn ?? (type === 'ghost' ? 'Ghost Tour Guide' : type === 'mime' ? 'Mime Bowled' : type === 'piper' ? 'Bagpiper Bowled' : 'Tourist Bowled');
    const pts = ptsIn ?? (type === 'piper' ? 900 : type === 'ghost' ? 300 : type === 'mime' ? 400 : 150);
    const t = new Tourist(s, u, type, label, pts, yOff);
    this.tourists.push(t);
    return t;
  }

  /** A loose group of tourists, often gathered round something. */
  group(s: number, u: number, n: number, spread = 1.6) {
    n = Math.max(QUALITY.crowd < 1 && Math.random() > QUALITY.crowd ? 0 : 1, Math.round(n * QUALITY.crowd));
    for (let i = 0; i < n; i++) this.tourist(s + (Math.random() - 0.5) * spread * 2, u + (Math.random() - 0.5) * spread);
  }

  pigeons(s: number, u: number, n = 7, gulls = false) {
    n = Math.max(2, Math.round(n * QUALITY.crowd));
    this.flocks.push(new Flock(s, u, n, gulls));
  }

  update(dt: number, trolleyPos: THREE.Vector3, trolleyVel: THREE.Vector3) {
    const near = (x: number, z: number, r: number) => (x - trolleyPos.x) ** 2 + (z - trolleyPos.z) ** 2 < r * r;
    for (const t of this.tourists) {
      const p = t.body.translation();
      if (near(p.x, p.z, 60)) t.update(dt, trolleyPos, trolleyVel);
    }
    for (const f of this.flocks) if (near(f.center.x, f.center.z, 40)) f.update(dt, trolleyPos);
  }

  sync(dt: number) {
    for (const t of this.tourists) {
      t.sync(dt);
      t.ensureLod();
    }
  }

  dispose() {
    this.tourists.forEach((t) => t.dispose());
    this.flocks.forEach((f) => f.dispose());
  }
}

export { toRoad };
