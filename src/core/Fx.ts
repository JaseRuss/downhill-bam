import * as THREE from 'three';
import { canvas } from '../art/Textures';

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  drag: number;
  grow: number;
  spin: number;
  fade: boolean;
  flutter?: number;
  follow?: THREE.Object3D;
  offset?: THREE.Vector3;
}

let puffTex: THREE.Texture | null = null;
function puff() {
  if (puffTex) return puffTex;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

let starTex: THREE.Texture | null = null;
function star() {
  if (starTex) return starTex;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#000';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 12 : 28, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

/** Lightweight particles: dust puffs, glass glints, feathers, whisky, dizzy stars. */
export class Fx {
  list: Particle[] = [];
  private shardGeo = new THREE.PlaneGeometry(0.12, 0.08);
  private featherGeo = new THREE.PlaneGeometry(0.09, 0.22);
  private dropGeo = new THREE.SphereGeometry(0.05, 6, 4);

  constructor(private scene: THREE.Scene) {}

  private add(p: Particle) {
    this.scene.add(p.obj);
    this.list.push(p);
    if (this.list.length > 600) this.kill(0);
  }

  private kill(i: number) {
    const p = this.list[i];
    this.scene.remove(p.obj);
    const m: any = (p.obj as any).material;
    if (m && m !== undefined && m.userData?.own) m.dispose();
    this.list.splice(i, 1);
  }

  dust(pos: THREE.Vector3, size = 1, color = 0x9a8f80, n = 9) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: puff(), color, transparent: true, opacity: 0.7, depthWrite: false });
      mat.userData.own = true;
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(size * (0.5 + Math.random() * 0.5));
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * size * 0.5, (Math.random() - 0.5) * size));
      this.add({
        obj: s, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 2),
        life: 0, max: 1.2 + Math.random() * 0.8, gravity: -0.4, drag: 1.5, grow: size * 1.4, spin: 0, fade: true,
      });
    }
  }

  sparkle(pos: THREE.Vector3, n = 14) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      mat.userData.own = true;
      const m = new THREE.Mesh(this.shardGeo, mat);
      m.position.copy(pos);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      this.add({
        obj: m, vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6),
        life: 0, max: 1 + Math.random(), gravity: 9.8, drag: 0.3, grow: 0, spin: 12, fade: true,
      });
    }
  }

  feathers(pos: THREE.Vector3, n = 12) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: Math.random() < 0.5 ? 0xb8bcc4 : 0xeeeeee, side: THREE.DoubleSide, transparent: true });
      mat.userData.own = true;
      const m = new THREE.Mesh(this.featherGeo, mat);
      m.position.copy(pos);
      this.add({
        obj: m, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3),
        life: 0, max: 3 + Math.random() * 2, gravity: 1.2, drag: 2.2, grow: 0, spin: 3, fade: true, flutter: Math.random() * 6,
      });
    }
  }

  splash(pos: THREE.Vector3, color = 0xc77a1a, n = 20) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.1, transparent: true, opacity: 0.85 });
      mat.userData.own = true;
      const m = new THREE.Mesh(this.dropGeo, mat);
      m.position.copy(pos);
      this.add({
        obj: m, vel: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5),
        life: 0, max: 0.9 + Math.random() * 0.5, gravity: 9.8, drag: 0.2, grow: 0, spin: 0, fade: true,
      });
    }
  }

  /** Cartoon dizzy stars circling above an object. */
  dizzy(target: THREE.Object3D, height = 1.9, duration = 3) {
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.SpriteMaterial({ map: star(), transparent: true, depthWrite: false });
      mat.userData.own = true;
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.28);
      this.add({
        obj: s, vel: new THREE.Vector3(), life: 0, max: duration, gravity: 0, drag: 0, grow: 0, spin: 0, fade: false,
        follow: target, offset: new THREE.Vector3(i * (Math.PI / 2), height, 0),
      });
    }
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.kill(i);
        continue;
      }
      const k = p.life / p.max;
      if (p.follow) {
        const a = p.offset!.x + p.life * 4;
        p.obj.position.copy(p.follow.position).add(new THREE.Vector3(Math.cos(a) * 0.35, p.offset!.y, Math.sin(a) * 0.35));
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      if (p.flutter !== undefined) {
        p.obj.position.x += Math.sin(p.life * 5 + p.flutter) * dt * 0.8;
      }
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.spin) {
        p.obj.rotation.x += p.spin * dt;
        p.obj.rotation.y += p.spin * dt * 0.7;
      }
      if (p.grow) p.obj.scale.addScalar(p.grow * dt);
      if (p.fade) {
        const m: any = (p.obj as any).material;
        if (m) m.opacity = (m.userData.baseOpacity ??= m.opacity) * (1 - k);
      }
    }
  }

  clear() {
    while (this.list.length) this.kill(this.list.length - 1);
  }
}
