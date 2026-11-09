import * as THREE from 'three';
import { baseH, toWorld, S_MIN, S_MAX, COURSE } from './Road';
import { rng, facadeTex } from '../art/Textures';
import { QUALITY } from '../core/Platform';

/**
 * Everything beyond the street: an overcast sky with drifting cloud, the Old Town's rooftops and
 * spires falling away on both sides, and hazy far-off Edinburgh landmarks (Calton Hill, Arthur's
 * Seat, the Firth of Forth and Fife, the Pentlands).
 */
export const HAAR = new THREE.Color(0xb7bfc7);

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // always at the far plane
  }
`;

const skyFrag = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
    // clouds projected onto a dome
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.12) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
      float c = fbm(uv);
      float cover = smoothstep(0.42, 0.78, c);
      float shade = fbm(uv * 1.7 + 3.0);
      vec3 cloud = mix(vec3(0.62, 0.65, 0.69), vec3(0.93, 0.94, 0.95), shade);
      col = mix(col, cloud, cover * smoothstep(0.0, 0.25, d.y) * 0.9);
    }
    // weak sun glow through the overcast
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += vec3(1.0, 0.85, 0.6) * pow(s, 24.0) * 0.35 + vec3(1.0, 0.9, 0.75) * pow(s, 4.0) * 0.08;
    // fade into the haar at the horizon so the land meets the sky
    col = mix(uHorizon, col, smoothstep(-0.02, 0.12, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function haze(hex: number, k: number) {
  return new THREE.Color(hex).lerp(HAAR, k);
}

export class Backdrop {
  sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private t = 0;

  /** World spots the city must leave alone (gardens, the sea). */
  private keepOut: (x: number, z: number) => boolean;

  constructor(private scene: THREE.Scene, sunDir: THREE.Vector3, keepOut?: (x: number, z: number) => boolean) {
    this.keepOut = keepOut ?? (() => false);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTop: { value: new THREE.Color(0x7d90a6) },
        uHorizon: { value: HAAR.clone() },
        uSunDir: { value: sunDir.clone().normalize() },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.ground();
    this.city();
    this.landmarks();
  }

  /** Hazy land falling away from the Old Town ridge. */
  private ground() {
    const geo = new THREE.CircleGeometry(1500, 48);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x59604f }));
    m.position.set(0, -14, 300);
    m.receiveShadow = false;
    this.scene.add(m);
  }

  /** Rooftops, chimneys and church spires all round the course, kept well clear of the route. */
  private city() {
    const r = rng(2024);
    // the route as a polyline, for distance checks
    const path: { x: number; z: number; s: number }[] = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let s = S_MIN; s <= S_MAX; s += 4) {
      const p = toWorld(s, 0, 0);
      path.push({ x: p.x, z: p.z, s });
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const M = 330;
    x0 -= M; x1 += M; z0 -= M * 0.6; z1 += M * 0.6;
    const nearest = (x: number, z: number) => {
      let bd = Infinity, bs = 0;
      for (const q of path) {
        const d = (q.x - x) ** 2 + (q.z - z) ** 2;
        if (d < bd) {
          bd = d;
          bs = q.s;
        }
      }
      return { d: Math.sqrt(bd), s: bs };
    };
    /** A spot for a building: clear of the street, with the land falling away from it. */
    const spot = (minD: number) => {
      for (let tries = 0; tries < 30; tries++) {
        const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
        const n = nearest(x, z);
        if (n.d < minD || n.d > M || this.keepOut(x, z)) continue;
        // denser near the street, thinning out further away
        if (r() > Math.pow(1 - (n.d - minD) / M, 1.3) + 0.15) continue;
        const ground = baseH(n.s) - 6 - Math.min(40, (n.d - 24) * 0.16);
        return { x, z, d: n.d, ground };
      }
      return null;
    };
    const target = Math.round((COURSE === 'royalmile' ? 1500 : 2600) * QUALITY.city);
    const items: { p: THREE.Vector3; w: number; d: number; h: number; yaw: number; c: THREE.Color }[] = [];
    const stoneCols = [0x6f665b, 0x7d7366, 0x5f5a54, 0x8a7f70, 0x544f4a];
    for (let i = 0; i < target; i++) {
      const sp = spot(30);
      if (!sp) continue;
      const h = 10 + r() * 16 + (sp.d < 60 ? 6 : 0);
      items.push({ p: new THREE.Vector3(sp.x, sp.ground + h / 2, sp.z), w: 8 + r() * 14, d: 8 + r() * 12, h, yaw: r() * Math.PI, c: new THREE.Color(stoneCols[Math.floor(r() * stoneCols.length)]) });
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const [fmap, femit] = facadeTex(30, 48, 2);
    const blocks = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff, map: fmap, emissiveMap: femit, emissive: 0xffffff, emissiveIntensity: 0.6 }), items.length);
    const roofGeo = new THREE.ConeGeometry(0.75, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f46 }), items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw);
      m.compose(it.p, q, sc.set(it.w, it.h, it.d));
      blocks.setMatrixAt(i, m);
      blocks.setColorAt(i, it.c);
      pos.copy(it.p).setY(it.p.y + it.h / 2 + 2);
      m.compose(pos, q, sc.set(it.w * 1.05, 4, it.d * 1.05));
      roofs.setMatrixAt(i, m);
    });
    blocks.instanceColor!.needsUpdate = true;
    this.scene.add(blocks, roofs);

    // chimney stacks dotted over the rooftops
    const nCh = Math.round(900 * QUALITY.city);
    const ch = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x4e4740 }), nCh);
    for (let i = 0; i < nCh; i++) {
      const it = items[Math.floor(r() * items.length)];
      pos.copy(it.p).add(new THREE.Vector3((r() - 0.5) * it.w * 0.7, it.h / 2 + 2.5, (r() - 0.5) * it.d * 0.7));
      m.compose(pos, q.identity(), sc.set(1.2, 3, 2.4));
      ch.setMatrixAt(i, m);
    }
    this.scene.add(ch);

    // church spires poking out of the haze
    const spireGeo = new THREE.ConeGeometry(1, 1, 8);
    const spires = new THREE.InstancedMesh(spireGeo, new THREE.MeshLambertMaterial({ color: 0x3b3a3a }), 26);
    const towers = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x6a6258 }), 26);
    for (let i = 0; i < 26; i++) {
      const sp = spot(40);
      if (!sp) continue;
      const th = 22 + r() * 14, sh = 14 + r() * 16;
      m.compose(pos.set(sp.x, sp.ground + th / 2, sp.z), q.identity(), sc.set(6, th, 6));
      towers.setMatrixAt(i, m);
      m.compose(pos.set(sp.x, sp.ground + th + sh / 2, sp.z), q.identity(), sc.set(3.4, sh, 3.4));
      spires.setMatrixAt(i, m);
    }
    this.scene.add(towers, spires);
  }

  /** Far-off silhouettes, painted in the haar's colours (unfogged so they still read as shapes). */
  private landmarks() {
    const basic = (hex: number, k: number) => new THREE.MeshBasicMaterial({ color: haze(hex, k), fog: false });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      this.scene.add(mesh);
      return mesh;
    };
    // fixed world spots (the Royal Mile runs along +z, north is +x), whatever the course
    const at = (s: number, u: number) => new THREE.Vector3(-u, 0, s);
    // Arthur's Seat: a crouching lion of a hill beyond Holyrood
    const seat = at(980, 260);
    const hillMat = basic(0x4f5a3c, 0.45);
    add(new THREE.DodecahedronGeometry(1, 2), hillMat, seat.x, -20, seat.z, 260, 150, 200);
    add(new THREE.DodecahedronGeometry(1, 1), hillMat, seat.x - 60, 70, seat.z - 40, 90, 95, 80); // the summit
    add(new THREE.DodecahedronGeometry(1, 1), basic(0x6b5a4c, 0.45), seat.x - 150, 10, seat.z - 120, 140, 70, 60); // Salisbury Crags
    // Calton Hill with the Nelson Monument and the unfinished National Monument
    // (on the long course it sits beside Leith Street, smaller, so it stays off the road)
    const long = COURSE !== 'royalmile';
    const calton = long ? new THREE.Vector3(72, 0, 242) : at(470, -330);
    const k = long ? 0.38 : 1;
    const cMat = basic(0x56603f, 0.5);
    add(new THREE.DodecahedronGeometry(1, 2), cMat, calton.x, -10 + (long ? 20 : 0), calton.z, 150 * k, 75 * (long ? 0.75 : 1), 120 * k);
    const monMat = basic(0x8b8478, 0.45);
    const top = long ? 66 : 75;
    add(new THREE.CylinderGeometry(4, 7, 34, 10), monMat, calton.x + 25 * k, top, calton.z, 1, 1, 1);
    add(new THREE.CylinderGeometry(6, 6, 6, 10), monMat, calton.x + 25 * k, top + 20, calton.z, 1, 1, 1);
    for (let i = 0; i < 12; i++) add(new THREE.CylinderGeometry(1.4, 1.4, 16, 8), monMat, calton.x - 40 * k + i * 5, top - 5, calton.z + 20 * k);
    add(new THREE.BoxGeometry(62, 3, 5), monMat, calton.x - 40 * k + 27.5, top + 4.5, calton.z + 20 * k);
    // the Firth of Forth and the hills of Fife beyond (north = left of the street)
    const forth = at(300, -1000);
    const water = add(new THREE.PlaneGeometry(420, 2600), basic(0x8fa2ad, 0.55), forth.x, -12, forth.z);
    water.rotation.x = -Math.PI / 2;
    const fife = at(300, -1260);
    for (let i = 0; i < 6; i++) add(new THREE.DodecahedronGeometry(1, 1), basic(0x5b6650, 0.72), fife.x + (i - 2.5) * 30, -20, fife.z + (i - 2.5) * 380, 120, 70 + (i % 3) * 25, 260);
    // the Pentland Hills to the south (right of the street)
    const pent = at(150, 1150);
    for (let i = 0; i < 7; i++) add(new THREE.DodecahedronGeometry(1, 1), basic(0x55603f, 0.75), pent.x + (i - 3) * 40, -20, pent.z + (i - 3) * 260, 180, 110 + (i % 2) * 45, 200);
  }

  update(dt: number, camera: THREE.Camera) {
    this.t += dt;
    this.skyMat.uniforms.uTime.value = this.t;
    this.sky.position.copy(camera.position);
  }
}
