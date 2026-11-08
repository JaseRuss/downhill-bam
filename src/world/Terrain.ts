import * as THREE from 'three';
import { RAPIER, Physics, Entity } from '../core/Physics';
import { G } from '../ctx';
import { M } from '../art/Materials';
import { flagTex } from '../art/Textures';
import { U_MIN, U_MAX, HALF_ROAD, S_MAX, S_MIN, H, toWorld, toRoad } from './Road';

const DS = 0.5, DU = 0.5;
const CHUNK_ROWS = 40;

interface Chunk {
  r0: number;
  r1: number;
  mesh: THREE.Mesh;
  collider: RAPIER.Collider | null;
  dirty: boolean;
}

/**
 * The street surface: a grid in road space split into chunks. Each chunk has its own mesh and
 * trimesh collider so craters only rebuild the bit that changed.
 */
export class Terrain implements Entity {
  kind = 'terrain';
  rows: number;
  cols: number;
  heights: Float32Array;
  xs: Float32Array;
  zs: Float32Array;
  colors: Float32Array;
  chunks: Chunk[] = [];
  body: RAPIER.RigidBody;
  private lastCrater = 0;

  constructor(private scene: THREE.Scene, private physics: Physics) {
    this.rows = Math.floor((S_MAX - S_MIN) / DS) + 1;
    this.cols = Math.round((U_MAX - U_MIN) / DU) + 1;
    const n = this.rows * this.cols;
    this.heights = new Float32Array(n);
    this.xs = new Float32Array(n);
    this.zs = new Float32Array(n);
    this.colors = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < this.rows; i++) {
      const s = S_MIN + i * DS;
      for (let j = 0; j < this.cols; j++) {
        const u = U_MIN + j * DU;
        toWorld(s, u, 0, v);
        const k = i * this.cols + j;
        this.xs[k] = v.x;
        this.zs[k] = v.z;
        this.heights[k] = H(s, u);
        // gutters and the crown of the road get a bit of grime
        const a = Math.abs(u);
        let c = 0.92 + rnd() * 0.12;
        if (a > HALF_ROAD - 0.6 && a < HALF_ROAD + 0.2) c *= 0.75;
        this.colors[k * 3] = c;
        this.colors[k * 3 + 1] = c;
        this.colors[k * 3 + 2] = c * 1.02;
      }
    }

    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    const pave = M.pavement();
    const tex = flagTex();
    tex.repeat.set(0.85, 0.85);
    pave.map = tex;
    const mats = [M.road(), pave];
    for (let r0 = 0; r0 < this.rows - 1; r0 += CHUNK_ROWS) {
      const r1 = Math.min(r0 + CHUNK_ROWS, this.rows - 1);
      const mesh = this.makeMesh(r0, r1, mats);
      scene.add(mesh);
      const ch: Chunk = { r0, r1, mesh, collider: null, dirty: false };
      this.chunks.push(ch);
      this.rebuildCollider(ch);
    }
  }

  private makeMesh(r0: number, r1: number, mats: THREE.Material[]) {
    const cols = this.cols;
    const nr = r1 - r0 + 1;
    const pos = new Float32Array(nr * cols * 3);
    const uv = new Float32Array(nr * cols * 2);
    const col = new Float32Array(nr * cols * 3);
    for (let i = 0; i < nr; i++) {
      for (let j = 0; j < cols; j++) {
        const k = (r0 + i) * cols + j;
        const p = i * cols + j;
        pos[p * 3] = this.xs[k];
        pos[p * 3 + 1] = this.heights[k];
        pos[p * 3 + 2] = this.zs[k];
        uv[p * 2] = (U_MIN + j * DU) / 2;
        uv[p * 2 + 1] = (S_MIN + (r0 + i) * DS) / 2;
        col[p * 3] = this.colors[k * 3];
        col[p * 3 + 1] = this.colors[k * 3 + 1];
        col[p * 3 + 2] = this.colors[k * 3 + 2];
      }
    }
    const road: number[] = [], pave: number[] = [];
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        const u = U_MIN + (j + 0.5) * DU;
        const arr = Math.abs(u) < HALF_ROAD + 0.06 ? road : pave;
        arr.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex([...road, ...pave]);
    geo.addGroup(0, road.length, 0);
    geo.addGroup(road.length, pave.length, 1);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mats);
    mesh.receiveShadow = true;
    return mesh;
  }

  private rebuildCollider(ch: Chunk) {
    if (ch.collider) {
      this.physics.unregister(ch.collider);
      this.physics.world.removeCollider(ch.collider, false);
    }
    const geo = ch.mesh.geometry;
    const pos = geo.getAttribute('position').array as Float32Array;
    const idx = new Uint32Array(geo.getIndex()!.array as ArrayLike<number>);
    const desc = RAPIER.ColliderDesc.trimesh(new Float32Array(pos), idx, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(0.9)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(90000);
    ch.collider = this.physics.world.createCollider(desc, this.body);
    this.physics.register(ch.collider, this);
  }

  private refreshChunk(ch: Chunk) {
    const geo = ch.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const cols = this.cols;
    for (let i = 0; i <= ch.r1 - ch.r0; i++) {
      for (let j = 0; j < cols; j++) {
        const k = (ch.r0 + i) * cols + j;
        const p = i * cols + j;
        pos.setY(p, this.heights[k]);
        col.setXYZ(p, this.colors[k * 3], this.colors[k * 3 + 1], this.colors[k * 3 + 2]);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.rebuildCollider(ch);
  }

  /** Heavy things landing on the street dig a crater. */
  onForce(force: number, other: Entity | undefined, otherCol: RAPIER.Collider) {
    if (!G.armed || !other || other.kind === 'trolley' || other.kind === 'tourist') return;
    if (force < 140000) return;
    if (G.time - this.lastCrater < 0.12) return;
    this.lastCrater = G.time;
    const p = otherCol.translation();
    const r = Math.min(3.6, 0.7 + Math.sqrt(force / 140000) * 0.7);
    this.crater(p.x, p.z, r, r * 0.32);
  }

  crater(x: number, z: number, radius: number, depth: number, spawnCobbles = true) {
    const { s, u } = toRoad(x, z);
    const i0 = Math.max(0, Math.floor((s - radius * 1.3 - S_MIN) / DS));
    const i1 = Math.min(this.rows - 1, Math.ceil((s + radius * 1.3 - S_MIN) / DS));
    const j0 = Math.max(0, Math.floor((u - radius * 1.3 - U_MIN) / DU));
    const j1 = Math.min(this.cols - 1, Math.ceil((u + radius * 1.3 - U_MIN) / DU));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const ds = S_MIN + i * DS - s, du = U_MIN + j * DU - u;
        const d = Math.hypot(ds, du) / radius;
        const k = i * this.cols + j;
        if (d < 1) {
          const sink = depth * (1 - d * d);
          const floor = H(S_MIN + i * DS, U_MIN + j * DU) - 2.5;
          this.heights[k] = Math.max(floor, this.heights[k] - sink);
          const c = 0.45 + 0.4 * d;
          this.colors[k * 3] = Math.min(this.colors[k * 3], c * 0.9);
          this.colors[k * 3 + 1] = Math.min(this.colors[k * 3 + 1], c * 0.82);
          this.colors[k * 3 + 2] = Math.min(this.colors[k * 3 + 2], c * 0.75);
        } else if (d < 1.3) {
          this.heights[k] += depth * 0.18 * (1 - (d - 1) / 0.3); // rim
        }
      }
    }
    for (const ch of this.chunks) {
      if (ch.r1 >= i0 && ch.r0 <= i1) this.refreshChunk(ch);
    }
    if (spawnCobbles && G.destruction) {
      const n = Math.min(14, Math.round(radius * 4));
      const y = this.heightAt(x, z);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * radius * 0.7;
        const pos = new THREE.Vector3(x + Math.cos(a) * rr, y + 0.4, z + Math.sin(a) * rr);
        const vel = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 4 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 3));
        G.destruction.spawnDebris(pos, new THREE.Vector3(0.11, 0.07, 0.09), M.cobbleChunk(), vel, 2600);
      }
      G.fx.dust(new THREE.Vector3(x, y + 0.3, z), radius * 1.2, 0x8a7f72);
      G.sfx.crunch(Math.min(1, radius / 3));
      G.shake(Math.min(1, radius / 3));
    }
  }

  heightAt(x: number, z: number) {
    const { s, u } = toRoad(x, z);
    const fi = (s - S_MIN) / DS, fj = (u - U_MIN) / DU;
    const i = Math.max(0, Math.min(this.rows - 2, Math.floor(fi)));
    const j = Math.max(0, Math.min(this.cols - 2, Math.floor(fj)));
    const ti = Math.min(1, Math.max(0, fi - i)), tj = Math.min(1, Math.max(0, fj - j));
    const k = i * this.cols + j;
    const h00 = this.heights[k], h01 = this.heights[k + 1], h10 = this.heights[k + this.cols], h11 = this.heights[k + this.cols + 1];
    return (h00 * (1 - tj) + h01 * tj) * (1 - ti) + (h10 * (1 - tj) + h11 * tj) * ti;
  }
}
