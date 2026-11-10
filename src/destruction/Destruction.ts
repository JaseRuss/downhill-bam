import * as THREE from 'three';
import { RAPIER, Physics, Entity } from '../core/Physics';
import { G } from '../ctx';
import { M, color } from '../art/Materials';

export type Shape = 'box' | 'cyl' | 'ball';
export type SoundKind = 'wood' | 'stone' | 'glass' | 'metal' | 'soft';

export interface PartOpts {
  mat?: THREE.Material | THREE.Material[];
  /** Custom visual (centred on the part's origin). Replaces the default primitive mesh. */
  visual?: THREE.Object3D;
  shape?: Shape;
  /** Starts as a sleeping dynamic body (barrels, bins) instead of fixed-until-hit. */
  dynamic?: boolean;
  density?: number;
  /** g-load (force / own mass) that knocks a fixed part loose. */
  release?: number;
  /** Split into nx*ny*nz chunks when the g-load passes fractureLoad. */
  fracture?: [number, number, number];
  fractureLoad?: number;
  /** g-load that counts as "hit" for scoring. */
  hitLoad?: number;
  points?: number;
  label?: string;
  /** This part collapses shortly after any of these is knocked loose. */
  supports?: Part[];
  glass?: boolean;
  friction?: number;
  restitution?: number;
  /** Fraction of trolley speed kept when it smashes this. */
  retain?: number;
  sound?: SoundKind;
  pieceMat?: THREE.Material;
  onHit?: (p: Part, load: number, other?: Entity) => void;
  onRelease?: (p: Part) => void;
  shadow?: boolean;
  /** Linear damping, e.g. for floaty comedic things. */
  damping?: number;
}

export class Part implements Entity {
  kind = 'part';
  mass: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Object3D;
  state: 'fixed' | 'loose' | 'gone';
  scored = false;
  dependents: Part[] = [];
  lastSound = 0;
  bornAt = 0;

  constructor(
    public d: Destruction,
    public half: THREE.Vector3,
    public shape: Shape,
    public opts: PartOpts,
  ) {}

  onForce(force: number, other: Entity | undefined) {
    if (this.state === 'gone' || !G.armed) return;
    // only things happening near the player count (far-off props just settling don't)
    const tp = this.body.translation(), cp = G.trolley.body.translation();
    const rp = G.trolley.ragdoll?.torso.body.translation();
    const near = (Math.abs(tp.z - cp.z) < 40 && Math.abs(tp.x - cp.x) < 40) || (rp && Math.abs(tp.z - rp.z) < 30);
    if (!near) return;
    const o = this.opts;
    const load = force / this.mass;
    const hitLoad = o.hitLoad ?? 45;
    const byTrolley = other?.kind === 'trolley';
    let smashed = false;
    if (this.state === 'fixed' && o.release !== undefined && load >= o.release) {
      this.d.queueRelease(this, 0);
      smashed = true;
    }
    if (o.fracture && load >= (o.fractureLoad ?? 250)) {
      this.d.queueFracture(this);
      smashed = true;
    }
    if (load >= hitLoad) {
      if (!this.scored && (o.points ?? 0) > 0) this.d.scorePart(this, byTrolley);
      if (G.time - this.lastSound > 0.25) {
        this.lastSound = G.time;
        G.sfx.impact(Math.min(1, load / 400), o.sound ?? (o.glass ? 'glass' : 'wood'));
      }
      o.onHit?.(this, load, other);
    }
    if (byTrolley && (smashed || (o.dynamic && o.retain && load >= hitLoad))) G.trolley.smashThrough(o.retain ?? 0.82);
  }
}

interface Debris {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  born: number;
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();

export class Destruction {
  parts: Part[] = [];
  loose = new Set<Part>();
  debris: Debris[] = [];
  private releases: { p: Part; at: number }[] = [];
  private fractures = new Set<Part>();
  maxDebris = 420;

  constructor(private scene: THREE.Scene, private physics: Physics) {}

  /** Add a breakable part. pos/quat are world space; half = half extents (cyl: x=radius, y=half height). */
  add(pos: THREE.Vector3, quat: THREE.Quaternion | number, half: THREE.Vector3 | [number, number, number], opts: PartOpts = {}) {
    const h = Array.isArray(half) ? new THREE.Vector3(...half) : half.clone();
    const shape = opts.shape ?? 'box';
    const q = typeof quat === 'number' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), quat) : quat;
    const p = new Part(this, h, shape, opts);
    const density = opts.density ?? 500;
    const vol = shape === 'box' ? 8 * h.x * h.y * h.z : shape === 'cyl' ? Math.PI * h.x * h.x * 2 * h.y : (4 / 3) * Math.PI * h.x ** 3;
    p.mass = Math.max(0.2, vol * density);

    const bd = opts.dynamic ? RAPIER.RigidBodyDesc.dynamic().setSleeping(true) : RAPIER.RigidBodyDesc.fixed();
    bd.setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (opts.damping) bd.setLinearDamping(opts.damping);
    p.body = this.physics.world.createRigidBody(bd);
    const cd = shape === 'box' ? RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z) : shape === 'cyl' ? RAPIER.ColliderDesc.cylinder(h.y, h.x) : RAPIER.ColliderDesc.ball(h.x);
    const thresholds = [opts.hitLoad ?? 45, opts.release ?? Infinity, opts.fracture ? opts.fractureLoad ?? 250 : Infinity];
    cd.setDensity(density)
      .setFriction(opts.friction ?? 0.7)
      .setRestitution(opts.restitution ?? 0.15)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(p.mass * Math.min(...thresholds));
    p.collider = this.physics.world.createCollider(cd, p.body);
    this.physics.register(p.collider, p);

    p.mesh = opts.visual ?? this.primitive(shape, h, opts.mat ?? M.stone());
    p.mesh.position.copy(pos);
    p.mesh.quaternion.copy(q);
    const shadow = opts.shadow ?? true;
    p.mesh.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = shadow;
        o.receiveShadow = true;
      }
    });
    this.scene.add(p.mesh);
    p.state = opts.dynamic ? 'loose' : 'fixed';
    if (opts.dynamic) this.loose.add(p);
    for (const s of opts.supports ?? []) s.dependents.push(p);
    this.parts.push(p);
    return p;
  }

  primitive(shape: Shape, h: THREE.Vector3, mat: THREE.Material | THREE.Material[]) {
    const geo =
      shape === 'box' ? new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2) :
      shape === 'cyl' ? new THREE.CylinderGeometry(h.x, h.x, h.y * 2, 18) :
      new THREE.SphereGeometry(h.x, 14, 10);
    return new THREE.Mesh(geo, mat as any);
  }

  queueRelease(p: Part, delay: number) {
    if (p.state !== 'fixed') return;
    if (this.releases.some((r) => r.p === p)) return;
    this.releases.push({ p, at: G.time + delay });
  }

  queueFracture(p: Part) {
    if (p.state !== 'gone') this.fractures.add(p);
  }

  /** Knock every fixed part in a list loose (used by set piece triggers). */
  releaseAll(parts: Part[], spread = 0.4) {
    for (const p of parts) this.queueRelease(p, Math.random() * spread);
  }

  scorePart(p: Part, byTrolley = false) {
    if (p.scored) return;
    p.scored = true;
    const pts = p.opts.points ?? 0;
    if (pts > 0) {
      const t = p.body.translation();
      G.scoring.award(p.opts.label ?? 'Smashed', pts, new THREE.Vector3(t.x, t.y, t.z), byTrolley);
    }
  }

  private doRelease(p: Part) {
    if (p.state !== 'fixed') return;
    p.state = 'loose';
    p.bornAt = G.time;
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    const k = p.mass * 0.6;
    p.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * k, y: (Math.random() - 0.5) * k, z: (Math.random() - 0.5) * k }, true);
    this.loose.add(p);
    this.scorePart(p);
    p.opts.onRelease?.(p);
    for (const dep of p.dependents) this.queueRelease(dep, 0.05 + Math.random() * 0.22);
  }

  private doFracture(p: Part) {
    if (p.state === 'gone') return;
    const o = p.opts;
    const t = p.body.translation(), r = p.body.rotation();
    const lv = p.body.linvel(), av = p.body.angvel();
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const rot = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const linvel = new THREE.Vector3(lv.x, lv.y, lv.z);
    const angvel = new THREE.Vector3(av.x, av.y, av.z);
    if (!p.scored) this.scorePart(p);
    // callbacks see the part while its body still exists
    if (p.state === 'fixed') o.onRelease?.(p);
    else if (o.dynamic) o.onRelease?.(p);
    this.removePart(p);
    for (const dep of p.dependents) this.queueRelease(dep, 0.03 + Math.random() * 0.15);

    const [nx, ny, nz] = o.fracture!;
    const h = p.half.clone();
    if (p.shape !== 'box') h.set(h.x * 0.8, h.y, h.x * 0.8);
    let mat: THREE.Material = o.pieceMat ?? (o.glass ? M.glass() : undefined);
    if (!mat) {
      if (Array.isArray(o.mat)) mat = o.mat[0];
      else if (o.mat) mat = o.mat as THREE.Material;
      else p.mesh.traverse((m: any) => { if (!mat && m.isMesh) mat = Array.isArray(m.material) ? m.material[0] : m.material; });
      // a model painted with vertex colour breaks into pieces of its main colour
      if (mat && mat.userData.vc) mat = color(p.mesh.userData.tint ?? 0x888888, (mat as THREE.MeshStandardMaterial).roughness, (mat as THREE.MeshStandardMaterial).metalness);
    }
    const cuts = (n: number, hh: number) => {
      const c = [-hh];
      for (let i = 1; i < n; i++) c.push(-hh + ((2 * hh) * (i + (Math.random() - 0.5) * 0.6)) / n);
      c.push(hh);
      return c;
    };
    const cx = cuts(nx, h.x), cy = cuts(ny, h.y), cz = cuts(nz, h.z);
    const density = o.density ?? 500;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const hx = (cx[i + 1] - cx[i]) / 2, hy = (cy[j + 1] - cy[j]) / 2, hz = (cz[k + 1] - cz[k]) / 2;
      if (hx < 0.015 || hy < 0.015 || hz < 0.015) continue;
      const local = new THREE.Vector3(cx[i] + hx, cy[j] + hy, cz[k] + hz);
      const wp = local.clone().applyQuaternion(rot).add(pos);
      const vel = linvel.clone().add(new THREE.Vector3().crossVectors(angvel, local.clone().applyQuaternion(rot)));
      const out = local.clone().applyQuaternion(rot).normalize().multiplyScalar(o.glass ? 3 : 1.6);
      vel.add(out).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      this.spawnDebris(wp, new THREE.Vector3(hx, hy, hz), mat, vel, density, rot);
    }
    if (o.glass) {
      G.fx.sparkle(pos, 18);
      G.sfx.glass();
    } else {
      const c = (mat as any)?.color ? (mat as any).color.getHex() : 0x998877;
      G.fx.dust(pos, Math.max(h.x, h.y, h.z) * 1.6, c);
      G.sfx.impact(1, o.sound ?? 'wood');
    }
  }

  spawnDebris(pos: THREE.Vector3, half: THREE.Vector3, mat: THREE.Material, vel: THREE.Vector3, density = 500, rot?: THREE.Quaternion) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(vel.x, vel.y, vel.z)
      .setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 });
    if (rot) bd.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    const body = this.physics.world.createRigidBody(bd);
    const col = this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setDensity(density).setFriction(0.8).setRestitution(0.2),
      body,
    );
    const mass = 8 * half.x * half.y * half.z * density;
    this.physics.register(col, { kind: 'debris', mass });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2), mat);
    mesh.castShadow = half.x + half.y + half.z > 0.25;
    mesh.position.copy(pos);
    if (rot) mesh.quaternion.copy(rot);
    this.scene.add(mesh);
    this.debris.push({ body, mesh, born: G.time });
    while (this.debris.length > this.maxDebris) this.killDebris(this.debris.shift()!);
  }

  private killDebris(d: Debris) {
    this.physics.removeBody(d.body);
    this.scene.remove(d.mesh);
    (d.mesh as THREE.Mesh).geometry?.dispose();
  }

  removePart(p: Part) {
    if (p.state === 'gone') return;
    p.state = 'gone';
    this.loose.delete(p);
    this.physics.removeBody(p.body);
    this.scene.remove(p.mesh);
  }

  update(tp: THREE.Vector3) {
    const far = (t: { x: number; z: number }, r: number) => (t.x - tp.x) ** 2 + (t.z - tp.z) ** 2 > r * r;
    // releases scheduled for now
    if (this.releases.length) {
      const now = G.time;
      const ready = this.releases.filter((r) => r.at <= now);
      this.releases = this.releases.filter((r) => r.at > now);
      for (const r of ready) this.doRelease(r.p);
    }
    if (this.fractures.size) {
      const list = [...this.fractures];
      this.fractures.clear();
      for (const p of list) this.doFracture(p);
    }
    // cull stuff far behind the player or fallen out of the world
    if (this.debris.length) {
      const keep: Debris[] = [];
      for (const d of this.debris) {
        const t = d.body.translation();
        if (far(t, 75) || t.y < -40) this.killDebris(d);
        else keep.push(d);
      }
      this.debris = keep;
    }
    // only tidy up things that have been knocked about and left behind (props still waiting
    // further down the course are loose too, and must stay put)
    for (const p of this.loose) {
      const t = p.body.translation();
      if (t.y < -40 || (far(t, 95) && p.body.isSleeping() && (p.scored || p.bornAt > 0))) this.removePart(p);
    }
  }

  sync() {
    for (const p of this.loose) {
      if (p.body.isSleeping()) continue;
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const d of this.debris) {
      if (d.body.isSleeping()) continue;
      const t = d.body.translation(), r = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z);
      d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}

export { _q, _p };
