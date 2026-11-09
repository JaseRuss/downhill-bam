import * as THREE from 'three';
import { RAPIER, Entity } from '../core/Physics';
import { G } from '../ctx';
import { QUALITY } from '../core/Platform';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, color } from '../art/Materials';
import { theta, toWorld, toRoad, forward, right } from '../world/Road';
import { buildHuman, fanOutfit, wizardOutfit, influencerOutfit, marcherOutfit, poseRun, D, ghostOutfit, mimeOutfit, piperOutfit, poseFlail, poseSplat, poseStand, Rig, touristOutfit } from '../art/Humanoid';

export type TouristKind = 'tourist' | 'ghost' | 'mime' | 'piper' | 'hearts' | 'hibs' | 'wizard' | 'influencer' | 'marcher';

/** How a wee marcher behaves: walking back and forth across the street, blocking, or floating down. */
export type MarchRole = 'walker' | 'blocker' | 'floater';

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
  /** Influencers: the phone screen that flashes. */
  private flash: THREE.Mesh | null = null;
  private flashT = 1 + Math.random() * 4;
  /** Wee marchers: what they're doing, and the stretch of street they pace across. */
  role: MarchRole | null = null;
  private walkS = 0;
  private walkU: [number, number] = [0, 0];
  private walkDir = 1;
  private umbrella: THREE.Object3D | null = null;
  /** Far away and standing still: one merged mesh per material instead of ~27 jointed parts. */
  private lod: THREE.Group | null = null;
  private lodOff = false;

  constructor(s: number, u: number, public type: TouristKind, public label: string, public points: number, yOff = 0) {
    const fan = type === 'hearts' || type === 'hibs';
    const outfit = type === 'marcher' ? marcherOutfit() : type === 'wizard' ? wizardOutfit(Math.random) : type === 'influencer' ? influencerOutfit(Math.random) : fan ? fanOutfit(type, Math.random) : type === 'ghost' ? ghostOutfit() : type === 'mime' ? mimeOutfit() : type === 'piper' ? piperOutfit() : touristOutfit(Math.random);
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
    // fans are too busy shouting at each other (and influencers at their phones) to get out of the way
    this.dodgeChance = type === 'tourist' ? 0.45 : type === 'ghost' ? 0.2 : type === 'wizard' ? 0.25 : fan || type === 'influencer' ? 0.08 : 0; // marchers never look up
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
    } else if (this.type === 'wizard') {
      const s = r.height / 1.75, R = D.headR * s;
      // round specs
      for (const z of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.TorusGeometry(R * 0.26, R * 0.04, 5, 14), M.black());
        lens.position.set(R * 0.98, R * 0.2, z * R * 0.36);
        lens.rotation.y = Math.PI / 2;
        r.head.add(lens);
      }
      // a striped scarf in one of four colour pairs
      const pairs: [string, string][] = [['#7a1f1f', '#d4a017'], ['#1d5c3a', '#b8b8b8'], ['#1b3f8a', '#b08d57'], ['#d4a017', '#222222']];
      const [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
      const sc = M.stripes(a, b);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), sc);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.33;
      r.chest.add(ring);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.09), sc);
      tail.position.set(0.12, 0.12, -0.05);
      r.chest.add(tail);
      // the wand
      const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.34, 6), color(0x5a3a22, 0.6));
      wand.position.set(0.08, -0.36, 0);
      wand.rotation.z = -1.3;
      r.elbowR.add(wand);
      // a pointy hat on some
      if (Math.random() < 0.4) {
        if (r.hat) r.hat.visible = false;
        const hat = new THREE.Group();
        const felt = color(Math.random() < 0.5 ? 0x2a1d3a : 0x161616, 0.9);
        hat.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.9, R * 1.9, R * 0.08, 16), felt));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(R * 1.05, R * 3.6, 12), felt);
        tip.position.y = R * 1.8;
        tip.rotation.z = 0.25;
        hat.add(tip);
        hat.position.set(-0.01 * s, R * 0.95, 0);
        r.head.add(hat);
      }
    } else if (this.type === 'influencer') {
      const s = r.height / 1.75, R = D.headR * s;
      const shades = new THREE.Mesh(new THREE.BoxGeometry(R * 0.22, R * 0.3, R * 1.15), color(0x0a0a0a, 0.15, 0.6));
      shades.position.set(R * 0.98, R * 0.22, 0);
      r.head.add(shades);
      // a phone held out at arm's length, on a selfie stick half the time
      const stick = Math.random() < 0.5;
      const len = stick ? 0.75 : 0.02;
      if (stick) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), M.steel());
        pole.position.y = -0.3 - len / 2;
        r.elbowR.add(pole);
      }
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), M.black());
      phone.position.y = -0.33 - len;
      phone.rotation.x = Math.PI / 2;
      r.elbowR.add(phone);
      this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.13), new THREE.MeshBasicMaterial({ color: 0x223344 }));
      this.flash.position.set(0, 0, -0.007);
      this.flash.rotation.y = Math.PI;
      phone.add(this.flash);
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
    if (this.type === 'marcher') {
      // pop!
      G.fx.dust(this.mesh.position.clone(), 0.5, 0x2fbf3a, 10);
      G.fx.dust(this.mesh.position.clone(), 0.4, 0x2f55d4, 8);
      if (this.umbrella) {
        this.rig.root.remove(this.umbrella);
        this.umbrella = null;
      }
      this.role = null;
    }
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
    G.sfx.scream(this.type === 'mime' ? 0 : this.type === 'marcher' ? 2.2 + Math.random() * 0.4 : 0.8 + Math.random() * 0.6);
    if (!this.scored) {
      this.scored = true;
      G.scoring.award(this.label, this.points, this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), other?.kind === 'trolley', this.type === 'piper' ? 'piper' : 'tourist');
      if (this.type === 'piper') {
        G.sfx.sadPipes();
        G.commentary.say('piper', true);
      } else if (this.type === 'mime') G.commentary.show('The mime screamed. Silently. Respect.');
      else if (this.type === 'wizard') G.commentary.maybe('wizard', 0.6);
      else if (this.type === 'marcher') G.commentary.maybe('marcher', 0.5);
      else if (this.type === 'influencer') G.commentary.maybe('influencer', 0.6);
      else G.commentary.maybe('tourist', 0.6);
    }
  }

  update(dt: number, trolleyPos: THREE.Vector3, trolleyVel: THREE.Vector3) {
    const t = this.body.translation();
    if (this.role && this.state === 'idle') this.marchStep(t);
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

  /** Wee marchers: walk across the street, turn round at the kerb (or a blocker), never look up. */
  private marchStep(t: { x: number; y: number; z: number }) {
    const v = this.body.linvel();
    if (this.role === 'floater') {
      if (this.umbrella && v.y > -0.25 && t.y - G.terrain.heightAt(t.x, t.z) < this.half + 0.15) {
        // landed: fold the brolly and join the march
        this.rig.root.remove(this.umbrella);
        this.umbrella = null;
        this.body.setGravityScale(1, true);
        this.body.setLinearDamping(0.4);
        this.role = 'walker';
      }
      return;
    }
    if (this.role !== 'walker') return;
    const { u } = toRoad(t.x, t.z);
    if (u > this.walkU[1]) this.walkDir = -1;
    else if (u < this.walkU[0]) this.walkDir = 1;
    const R = right(this.walkS).multiplyScalar(this.walkDir);
    this.body.setLinvel({ x: R.x * 0.75, y: v.y, z: R.z * 0.75 }, true);
    this.faceYaw = Math.atan2(-R.z, R.x);
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
    } else if (this.type === 'marcher') {
      if (this.role === 'blocker') {
        // arms out: none shall pass (they will)
        rig.shoulderL.rotation.set(-1.45, 0, 0.1);
        rig.shoulderR.rotation.set(1.45, 0, 0.1);
      } else if (this.role === 'floater' && this.umbrella) {
        rig.shoulderR.rotation.set(0.1, 0, 2.9);
        rig.elbowR.rotation.z = 0.2;
      } else poseRun(rig, this.bob * 8 + this.seed, 0.55);
    } else if (this.type === 'wizard') {
      // casting at passers-by: wand arm up and flicking
      const ph = this.bob * 3 + this.seed;
      rig.shoulderR.rotation.set(0.25, 0, 1.5 + Math.sin(ph) * 0.45);
      rig.elbowR.rotation.z = 0.5 + Math.max(0, Math.sin(ph * 2.3)) * 0.6;
      rig.head.rotation.z = 0.08;
    } else if (this.type === 'influencer') {
      // arm out holding the phone up, peace sign, head tilted for the good side
      rig.shoulderR.rotation.set(0.45, 0, 2.35 + Math.sin(this.bob * 0.7 + this.seed) * 0.08);
      rig.elbowR.rotation.z = 0.12;
      rig.shoulderL.rotation.set(-0.25, 0, 1.15);
      rig.elbowL.rotation.z = 2.1;
      rig.head.rotation.set(0.18 + Math.sin(this.bob * 0.5 + this.seed) * 0.08, 0, 0.12);
      this.flashT -= dt;
      if (this.flash) {
        const m = this.flash.material as THREE.MeshBasicMaterial;
        if (this.flashT < 0) {
          m.color.setHex(0xffffff);
          if (this.flashT < -0.08) this.flashT = 2 + Math.random() * 5;
        } else m.color.setHex(0x223344);
      }
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

  /** Make a wee marcher pace back and forth across the street at s between uA and uB. */
  march(role: MarchRole, s: number, uA: number, uB: number) {
    this.role = role;
    this.walkS = s;
    this.walkU = [Math.min(uA, uB), Math.max(uA, uB)];
    this.walkDir = Math.random() < 0.5 ? 1 : -1;
    this.lodOff = true; // they move and animate: no frozen far-away model
    if (role === 'floater') {
      // drifting down from on high under a brolly
      this.body.setGravityScale(0.13, true);
      this.body.setLinearDamping(1.5);
      const u = new THREE.Group();
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), color(0xd7263d, 0.6));
      canopy.scale.y = 0.55;
      u.add(canopy);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 5), M.black());
      shaft.position.y = -0.2;
      u.add(shaft);
      u.position.set(0.05, 0.62, 0);
      this.rig.root.add(u);
      this.umbrella = u;
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
