import * as THREE from 'three';
import { M, color } from './Materials';
import { canvas } from './Textures';

/**
 * Fake shop interiors ("interior mapping"). A few little rooms are built and rendered once into
 * cubemaps at start-up; every ground-floor shop window then uses one shader that traces the view ray
 * into an imaginary box room behind the glass and looks the hit point up in a cubemap. Rooms show
 * proper depth and parallax as you drive past, for the cost of one flat quad per window.
 *
 * Room space (metres): x across the window, y up from the floor, z out of the window (the glass
 * is at z = 0, the back wall at z = -ROOM_D). Each window is split into tiles ROOM_W wide.
 */
export const ROOM_W = 3.5;
const ROOM_H = 3.0;
const ROOM_D = 3.5;
/** The window's bottom edge sits this far above the room's floor. */
const SILL = 0.5;
const KINDS = 4;

let cubes: THREE.Texture[] = [];
let material: THREE.ShaderMaterial | null = null;

function box(g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function cyl(g: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, mat: THREE.Material, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function boardTex(lines: string[], bg: string, fg: string) {
  const c = canvas(256, 160);
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = fg;
  g.font = 'bold 26px Georgia';
  g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, 128, 40 + i * 34));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t });
}

/** An empty room: floor, walls and ceiling, seen from inside, plus lights. */
function shell(wall: number, floor: THREE.Material, ceil: number, light: number, intensity: number) {
  const g = new THREE.Scene();
  g.background = new THREE.Color(0x111111);
  const W = ROOM_W, H = ROOM_H, D = ROOM_D;
  const wallM = new THREE.MeshStandardMaterial({ color: wall, roughness: 0.9, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [wallM, wallM, new THREE.MeshStandardMaterial({ color: ceil, roughness: 0.9, side: THREE.BackSide }), floor, wallM, wallM]);
  room.position.set(0, H / 2, -D / 2);
  g.add(room);
  g.add(new THREE.HemisphereLight(0xfff4e0, 0x403020, 0.9));
  for (const x of [-0.9, 0.9]) {
    const p = new THREE.PointLight(light, intensity, 7, 1.6);
    p.position.set(x, H - 0.3, -D / 2);
    g.add(p);
    box(g, 0.5, 0.06, 0.5, x, H - 0.03, -D / 2, M.emissive(light, 2));
  }
  return g;
}

function floorMat(hex: number, boards: boolean) {
  const c = canvas(128, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = `#${hex.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  if (boards) for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  else for (let i = 0; i < 128; i += 32) { g.strokeRect(i, 0, 32, 128); g.strokeRect(0, i, 128, 32); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.BackSide });
}

/** A punter: a coloured capsule body and a head, good enough through a window. */
function person(g: THREE.Object3D, x: number, z: number, shirt: number, seated = false) {
  const y = seated ? 0.45 : 0;
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 8), color(shirt, 0.8));
  b.position.set(x, y + 0.75, z);
  g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), color(0xe0b090, 0.7));
  h.position.set(x, y + 1.32, z);
  g.add(h);
}

function pub() {
  const g = shell(0x4a2e1c, floorMat(0x5a3a22, true), 0x2a1a10, 0xffb060, 6);
  const wood = color(0x3a2212, 0.6), brass = color(0xd8a93a, 0.3, 0.9);
  // the bar along the back, with taps and a gantry of bottles
  box(g, 2.8, 1.05, 0.6, 0, 0.52, -2.5, wood);
  box(g, 2.9, 0.06, 0.7, 0, 1.06, -2.5, color(0x6b3b1e, 0.4));
  for (let i = 0; i < 4; i++) cyl(g, 0.03, 0.4, -0.6 + i * 0.4, 1.28, -2.45, brass, 8);
  box(g, 3.0, 1.5, 0.3, 0, 1.9, -3.32, wood);
  const bottleCols = [0x3f7a2e, 0x8a5a2b, 0xd8a93a, 0x2a4b8d, 0x7a1f3d];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
    cyl(g, 0.045, 0.28, -1.35 + i * 0.245, 1.32 + row * 0.42, -3.15, M.emissive(bottleCols[(i + row) % bottleCols.length], 0.6), 6);
  }
  box(g, 1.2, 0.5, 0.04, 0, 2.6, -3.15, boardTex(['REAL ALE', 'HEAVY £4.50'], '#1c1c1c', '#f2c14e'));
  // stools and drinkers
  for (const x of [-1, 0, 1]) {
    cyl(g, 0.18, 0.06, x, 0.75, -1.95, color(0x7a1f3d, 0.7), 10);
    cyl(g, 0.03, 0.75, x, 0.37, -1.95, brass, 6);
  }
  person(g, -1, -1.9, 0x1b4f9c, true);
  person(g, 0.98, -1.85, 0x2e7d32, true);
  // a fireplace on the side wall
  box(g, 0.3, 1.0, 1.2, -1.6, 0.5, -1.2, M.stone(30, 40, 5));
  box(g, 0.1, 0.4, 0.6, -1.5, 0.35, -1.2, M.emissive(0xff7a20, 2.5));
  return g;
}

function giftShop() {
  const g = shell(0xe2d6b8, floorMat(0x9a7b55, true), 0xece4d4, 0xfff0d0, 5.5);
  const shelf = color(0x6b4a2a, 0.7);
  const goods = [0xd7263d, 0x1b4f9c, 0xf2c14e, 0x2e7d32, 0xffffff, 0x8e44ad];
  for (const x of [-1.62, 1.62]) {
    for (let k = 0; k < 4; k++) {
      box(g, 0.4, 0.04, 2.6, x, 0.5 + k * 0.55, -1.8, shelf);
      for (let i = 0; i < 9; i++) box(g, 0.22, 0.2 + ((i * 7 + k) % 3) * 0.06, 0.2, x, 0.64 + k * 0.55, -3.0 + i * 0.29, color(goods[(i + k * 2) % goods.length], 0.6));
    }
  }
  // tartan scarves on a rail, tins of shortbread, and a counter
  box(g, 2.2, 0.03, 0.03, 0, 2.2, -3.2, M.steel());
  const tartans = ['red', 'green', 'blue', 'dress'] as const;
  for (let i = 0; i < 8; i++) box(g, 0.2, 0.9, 0.03, -0.9 + i * 0.26, 1.72, -3.2, M.tartan(tartans[i % 4]));
  for (let i = 0; i < 5; i++) cyl(g, 0.16, 0.12, -0.5 + i * 0.25, 1.0, -1.35, color(0xc4161c, 0.5), 14);
  box(g, 1.6, 0.9, 0.6, 0, 0.45, -1.35, color(0x5a3a22, 0.7));
  person(g, 0.6, -2.3, 0xd7263d);
  return g;
}

function cafe() {
  const g = shell(0xd9cdb6, floorMat(0x2a2a2a, false), 0xe8e2d6, 0xffe8c8, 4);
  // cake counter at the back, with a glass front, and a menu board
  box(g, 2.6, 0.95, 0.6, 0, 0.47, -2.9, color(0x2f5a4a, 0.6));
  const glass = new THREE.MeshStandardMaterial({ color: 0xbad6e6, transparent: true, opacity: 0.35, roughness: 0.05 });
  box(g, 2.6, 0.45, 0.55, 0, 1.18, -2.9, glass);
  for (let i = 0; i < 6; i++) cyl(g, 0.14, 0.12, -1.0 + i * 0.4, 1.02, -2.9, color([0xf3d9a4, 0x7b4a2a, 0xe8a0b4][i % 3], 0.7), 14);
  box(g, 1.4, 0.8, 0.04, 0, 2.2, -3.47, boardTex(['FLAT WHITE £3.80', 'TABLET  ·  SCONES', 'SOUP OF THE DAY'], '#1d1d1d', '#f4f1ea'));
  // round tables with chairs
  for (const [x, z] of [[-0.95, -1.2], [0.95, -1.6]]) {
    cyl(g, 0.38, 0.04, x, 0.74, z, M.white(), 16);
    cyl(g, 0.04, 0.74, x, 0.37, z, M.black(), 6);
    for (const dx of [-0.55, 0.55]) box(g, 0.36, 0.05, 0.36, x + dx, 0.45, z, color(0x8a5a2b, 0.7));
  }
  person(g, -1.45, -1.2, 0xf2c14e, true);
  person(g, 1.5, -1.6, 0x3a86ff, true);
  // pendant lamps
  for (const x of [-0.95, 0.95]) {
    box(g, 0.01, 0.8, 0.01, x, 2.6, -1.4, M.black());
    cyl(g, 0.18, 0.18, x, 2.15, -1.4, M.emissive(0xffd9a0, 1.5), 10);
  }
  return g;
}

function kiltShop() {
  const g = shell(0x6a1a24, floorMat(0x4a3a2a, true), 0xf2efe8, 0xfff0d8, 7);
  const tartans = ['red', 'green', 'blue', 'dress'] as const;
  // rails of kilts down both sides
  for (const x of [-1.5, 1.5]) {
    box(g, 0.03, 0.03, 2.6, x, 1.7, -1.9, M.steel());
    for (let i = 0; i < 9; i++) {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.65, 10, 1, true), M.tartan(tartans[(i + (x > 0 ? 2 : 0)) % 4]));
      k.position.set(x, 1.3, -3.1 + i * 0.29);
      g.add(k);
    }
  }
  // a mannequin in full Highland dress, and a big mirror
  const mq = new THREE.Group();
  mq.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.6, 12), M.tartan('red')));
  mq.children[0].position.y = 0.95;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.6, 12), color(0x111111, 0.6));
  torso.position.y = 1.55;
  mq.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), color(0xe8e0d0, 0.5));
  head.position.y = 2.0;
  mq.add(head);
  const spor = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.white());
  spor.position.set(0, 0.95, 0.2);
  mq.add(spor);
  for (const x of [-0.08, 0.08]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.65, 8), color(0xe9e2d0, 0.9));
    leg.position.set(x, 0.33, 0);
    mq.add(leg);
  }
  mq.position.set(0.3, 0, -2.2);
  g.add(mq);
  box(g, 0.9, 1.8, 0.04, -0.6, 1.2, -3.46, new THREE.MeshStandardMaterial({ color: 0xcfd8de, metalness: 0.9, roughness: 0.05 }));
  box(g, 1.1, 0.4, 0.04, 0.6, 2.5, -3.46, boardTex(['KILT HIRE'], '#f2c14e', '#5a1420'));
  person(g, -0.7, -1.4, 0x14284a);
  return g;
}

/** Build the rooms and render them into cubemaps (once; they survive restarts). */
export function initInteriors(renderer: THREE.WebGLRenderer) {
  if (cubes.length) return;
  const builders = [pub, giftShop, cafe, kiltShop];
  for (const build of builders) {
    const scene = build();
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.05, 20, rt);
    cam.position.set(0, ROOM_H / 2, -ROOM_D / 2);
    scene.add(cam);
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    cam.update(renderer, scene);
    renderer.shadowMap.enabled = shadows;
    cubes.push(rt.texture);
    scene.traverse((o: any) => o.geometry?.dispose());
  }
}

const vert = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  uniform samplerCube uRoom0;
  uniform samplerCube uRoom1;
  uniform samplerCube uRoom2;
  uniform samplerCube uRoom3;
  uniform vec3 uGlass;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  float hash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
  void main() {
    const float W = ${ROOM_W.toFixed(2)}, H = ${ROOM_H.toFixed(2)}, D = ${ROOM_D.toFixed(2)};
    vec3 N = normalize(vN);
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 V = normalize(vWorld - cameraPosition);
    // view ray in room space (z < 0 heads into the room)
    vec3 d = vec3(dot(V, T), V.y, dot(V, N));
    float tile = floor(vUv.x / W);
    vec3 p = vec3(vUv.x - tile * W - W * 0.5, vUv.y + ${SILL.toFixed(2)}, 0.0);
    // some rooms are mirrored, so neighbours don't match
    if (hash(tile + 3.0) > 0.5) { p.x = -p.x; d.x = -d.x; }
    vec3 inv = 1.0 / d;
    float tx = ((d.x > 0.0 ? W * 0.5 : -W * 0.5) - p.x) * inv.x;
    float ty = ((d.y > 0.0 ? H : 0.0) - p.y) * inv.y;
    float tz = (-D - p.z) * inv.z;
    float t = min(min(tx, ty), tz);
    vec3 hit = p + d * t;
    vec3 dir = vec3(hit.x, hit.y - H * 0.5, hit.z + D * 0.5);
    // every window of one shop shows the same kind of room
    float kind = floor(hash(floor(vUv.x / (W * 8.0))) * ${KINDS.toFixed(1)});
    vec3 c = kind < 0.5 ? textureCube(uRoom0, dir).rgb : kind < 1.5 ? textureCube(uRoom1, dir).rgb : kind < 2.5 ? textureCube(uRoom2, dir).rgb : textureCube(uRoom3, dir).rgb;
    c *= 0.95;
    // the glass: a little of the sky at glancing angles
    float fr = pow(1.0 - abs(d.z), 4.0);
    c = mix(c, uGlass, 0.1 + fr * 0.55);
    // glazing bars between the rooms and a transom across the top
    float lx = abs(vUv.x - tile * W - W * 0.5);
    if (lx > W * 0.5 - 0.045 || abs(vUv.y - 1.45) < 0.03) c = vec3(0.04);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** The one shared window material (so all shop windows batch together). */
export function windowMaterial() {
  if (material) return material;
  const fallback = cubes[0] ?? null;
  material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uRoom0: { value: null }, uRoom1: { value: null }, uRoom2: { value: null }, uRoom3: { value: null }, uGlass: { value: new THREE.Color(0xb7c4cc) } },
    ]),
    vertexShader: vert,
    fragmentShader: frag,
    fog: true,
  });
  for (let i = 0; i < KINDS; i++) material.uniforms[`uRoom${i}`].value = cubes[i] ?? fallback;
  return material;
}

let windowSeed = 1;
/**
 * A shop window `w` x `h` metres, as a plane facing +Z (its bottom edge at y = 0). UVs are in
 * room-space metres, offset so every window shows its own rooms.
 */
export function shopWindow(w: number, h: number) {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const n = Math.max(1, Math.round(w / 3));
  const stretch = ROOM_W / (w / n);
  const offset = ((windowSeed++ * 7919) % 997) * ROOM_W * 8;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, offset + (pos.getX(i) + w / 2) * stretch, pos.getY(i));
  return new THREE.Mesh(geo, windowMaterial());
}

export function interiorsReady() {
  return cubes.length > 0;
}
