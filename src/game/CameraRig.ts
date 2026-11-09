import * as THREE from 'three';
import { H, toRoad, toWorld, forward, edgeL, edgeR } from '../world/Road';

export interface TourStop {
  cam: THREE.Vector3;
  look: THREE.Vector3;
}

/** A camera placement relative to an anchor: swung `angle` round from behind (+ = to the right). */
export interface Frame {
  anchor: THREE.Vector3;
  fwd: THREE.Vector3;
  angle: number;
  dist: number;
  height: number;
  /** Look this far ahead of the anchor, and this high. */
  ahead: number;
  lookY: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  mode: 'tour' | 'aim' | 'chase' | 'orbit' | 'frame' | 'manual' = 'aim';
  pos = new THREE.Vector3();
  look = new THREE.Vector3();
  private dir = new THREE.Vector3(0, 0, 1);
  private shakeAmt = 0;
  private from = { cam: new THREE.Vector3(), look: new THREE.Vector3() };
  private to: TourStop | null = null;
  private moveT = 1;
  private moveDur = 1;
  private dwell = 0;
  private orbitA = 0;
  private fA: Frame | null = null;
  private fB: Frame | null = null;
  private fT = 1;
  private fDur = 1;
  /** Follow the live target with the end frame's anchor. */
  private fFollow = false;
  private fThen: 'chase' | null = null;
  frame: Frame | null = null;
  fovBase = 62;

  constructor(public camera: THREE.PerspectiveCamera) {}

  shake(a: number) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + a);
  }

  /** Fly to a tour stop over `dur` seconds. */
  goto(stop: TourStop, dur = 1.3, instant = false) {
    this.mode = 'tour';
    this.from.cam.copy(this.pos);
    this.from.look.copy(this.look);
    this.to = { cam: stop.cam.clone(), look: stop.look.clone() };
    this.moveT = instant ? 1 : 0;
    this.moveDur = dur;
    this.dwell = 0;
    if (instant) {
      this.pos.copy(stop.cam);
      this.look.copy(stop.look);
    }
  }

  snapBehind(target: THREE.Vector3, fwd: THREE.Vector3) {
    this.dir.copy(fwd).setY(0).normalize();
    this.pos.copy(target).addScaledVector(this.dir, -6.5).add(new THREE.Vector3(0, 3, 0));
    this.look.copy(target).addScaledVector(this.dir, 5);
  }

  /** The camera placement for the aiming view (behind the vehicle). */
  static behind(target: THREE.Vector3, fwd: THREE.Vector3): Frame {
    return { anchor: target.clone(), fwd: fwd.clone().setY(0).normalize(), angle: 0, dist: 4.2, height: 2.1, ahead: 8, lookY: -0.2 };
  }

  /**
   * Move smoothly from the current frame (or `from`) to `to` over `dur`. With `follow`, the anchor
   * tracks the live target as it goes; `then: 'chase'` hands over to the chase camera at the end.
   */
  frameTo(to: Frame, dur: number, opts: { from?: Frame; follow?: boolean; then?: 'chase' } = {}) {
    this.fA = opts.from ?? this.frame ?? to;
    this.fB = to;
    this.fT = dur <= 0 ? 1 : 0;
    this.fDur = Math.max(0.001, dur);
    this.fFollow = !!opts.follow;
    this.fThen = opts.then ?? null;
    this.mode = 'frame';
  }

  private placeFrame(f: Frame) {
    const back = f.fwd.clone().multiplyScalar(-f.dist).applyAxisAngle(UP, f.angle);
    this.pos.copy(f.anchor).add(back).addScaledVector(UP, f.height);
    this.look.copy(f.anchor).addScaledVector(f.fwd, f.ahead).addScaledVector(UP, f.lookY);
  }

  update(dt: number, target: THREE.Vector3, vel: THREE.Vector3, fwd: THREE.Vector3) {
    const cam = this.camera;
    let fov = this.fovBase;
    if (this.mode === 'tour' && this.to) {
      this.moveT = Math.min(1, this.moveT + dt / this.moveDur);
      const k = ease(this.moveT);
      this.pos.lerpVectors(this.from.cam, this.to.cam, k);
      this.look.lerpVectors(this.from.look, this.to.look, k);
      // drift gently towards the subject while dwelling (capped, so it never wanders off)
      if (this.moveT >= 1 && this.dwell < 6) {
        this.dwell += dt;
        const d = this.to.look.clone().sub(this.to.cam).setY(0);
        if (d.lengthSq() > 1) this.to.cam.addScaledVector(d.normalize(), dt * 0.5);
        this.pos.copy(this.to.cam);
      }
    } else if (this.mode === 'aim') {
      const d = fwd.clone().setY(0).normalize();
      const want = target.clone().addScaledVector(d, -4.2).add(new THREE.Vector3(0, 2.1, 0));
      this.pos.lerp(want, 1 - Math.exp(-dt * 6));
      this.look.lerp(target.clone().addScaledVector(d, 8).add(new THREE.Vector3(0, -0.2, 0)), 1 - Math.exp(-dt * 6));
    } else if (this.mode === 'frame' && this.fA && this.fB) {
      this.fT = Math.min(1, this.fT + dt / this.fDur);
      const k = ease(this.fT);
      const a = this.fA, b = this.fB;
      const bAnchor = this.fFollow ? target : b.anchor;
      const f: Frame = {
        anchor: a.anchor.clone().lerp(bAnchor, k),
        fwd: a.fwd.clone().lerp(b.fwd, k).normalize(),
        angle: a.angle + (b.angle - a.angle) * k,
        dist: a.dist + (b.dist - a.dist) * k,
        height: a.height + (b.height - a.height) * k,
        ahead: a.ahead + (b.ahead - a.ahead) * k,
        lookY: a.lookY + (b.lookY - a.lookY) * k,
      };
      this.frame = f;
      this.placeFrame(f);
      if (this.fT >= 1 && this.fThen === 'chase') {
        this.dir.copy(f.fwd);
        this.mode = 'chase';
        this.frame = null;
      }
    } else if (this.mode === 'chase') {
      const hv = vel.clone().setY(0);
      const sp = hv.length();
      if (sp > 1.5) this.dir.lerp(hv.normalize(), 1 - Math.exp(-dt * 2.2)).normalize();
      // keep looking downhill-ish even when spinning wildly
      const { s } = toRoad(target.x, target.z);
      const roadF = forward(s);
      if (this.dir.dot(roadF) < 0.3) this.dir.lerp(roadF, 1 - Math.exp(-dt * 3)).normalize();
      const back = 4.3 + Math.min(2.6, sp * 0.1);
      const want = target.clone().addScaledVector(this.dir, -back).add(new THREE.Vector3(0, 1.9 + sp * 0.03, 0));
      // keep the camera inside the street (its real edges, which widen and narrow)
      const r = toRoad(want.x, want.z);
      const u = Math.max(-edgeL(r.s) + 1.2, Math.min(edgeR(r.s) - 1.2, r.u));
      const clamped = toWorld(r.s, u, 0);
      want.x = clamped.x;
      want.z = clamped.z;
      want.y = Math.max(want.y, H(r.s, u) + 1.3);
      this.pos.lerp(want, 1 - Math.exp(-dt * 5));
      this.look.lerp(target.clone().addScaledVector(this.dir, 5).add(new THREE.Vector3(0, 0.9, 0)), 1 - Math.exp(-dt * 8));
      fov += Math.min(16, sp * 0.6);
    } else if (this.mode === 'orbit') {
      this.orbitA += dt * 0.25;
      const want = target.clone().add(new THREE.Vector3(Math.sin(this.orbitA) * 7, 3.5, Math.cos(this.orbitA) * 7));
      this.pos.lerp(want, 1 - Math.exp(-dt * 2));
      this.look.lerp(target, 1 - Math.exp(-dt * 4));
    }
    // 'manual': whoever set pos/look is in charge
    cam.position.copy(this.pos);
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 0.25;
      cam.position.add(new THREE.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a));
      this.shakeAmt *= Math.exp(-dt * 7);
    }
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3));
      cam.updateProjectionMatrix();
    }
  }
}
