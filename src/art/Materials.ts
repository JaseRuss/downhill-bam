import * as THREE from 'three';
import { ashlarTex, barrelTex, cobbleTex, flagTex, slateTex, tartanTex, TARTANS, woodTex, stripeTex } from './Textures';

const cache = new Map<string, THREE.Material>();

function m(key: string, make: () => THREE.Material) {
  let v = cache.get(key);
  if (!v) {
    v = make();
    cache.set(key, v);
  }
  return v as THREE.MeshStandardMaterial;
}

// ------------------------------------------------------------------ reflections
const envMats = new Map<THREE.MeshStandardMaterial, number>();
let envTex: THREE.Texture | null = null;

/** Shiny and metallic materials pick up the sky once there is one to reflect. */
export function envReady<T extends THREE.MeshStandardMaterial>(mat: T, strength = 1) {
  envMats.set(mat, strength);
  if (envTex) {
    mat.envMap = envTex;
    mat.envMapIntensity = strength;
  }
  return mat;
}

/**
 * A wee sky to reflect: haar overhead, warm stone below, a soft sun. There is no scene-wide
 * environment (it would relight the whole street), only reflections on chrome, paint and glass.
 */
export function makeEnv(renderer: THREE.WebGLRenderer) {
  if (envTex) return envTex;
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 p;
        void main(){
          float h = p.y;
          vec3 top = vec3(0.50, 0.62, 0.80), hor = vec3(0.86, 0.88, 0.90), gnd = vec3(0.20, 0.18, 0.16);
          vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor * 0.55, gnd, pow(-h, 0.4));
          float sun = max(0.0, dot(normalize(p), normalize(vec3(0.45, 0.72, 0.35))));
          c += vec3(1.0, 0.93, 0.80) * (pow(sun, 60.0) * 6.0 + pow(sun, 6.0) * 0.35);
          // a row of tenement windows along the horizon gives chrome something to catch
          float band = smoothstep(0.02, 0.06, h) * (1.0 - smoothstep(0.16, 0.22, h));
          c = mix(c, vec3(0.34, 0.30, 0.26), band * step(0.5, fract(atan(p.z, p.x) * 3.0)) * 0.8);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  s.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(s, 0.03).texture;
  pm.dispose();
  sky.geometry.dispose();
  for (const [mat, k] of envMats) {
    mat.envMap = envTex;
    mat.envMapIntensity = k;
    mat.needsUpdate = true;
  }
  return envTex;
}

export function color(hex: number | string, rough = 0.8, metal = 0) {
  return m(`c_${hex}_${rough}_${metal}`, () => {
    const mat = new THREE.MeshStandardMaterial({ color: hex as any, roughness: rough, metalness: metal });
    if (metal >= 0.5) envReady(mat, 1);
    else if (metal >= 0.2 || rough <= 0.3) envReady(mat, 0.5);
    return mat;
  });
}

export const M = {
  stone: (hue = 35, light = 52, seed = 1, rx = 1, ry = 1) =>
    m(`stone${hue}_${light}_${seed}_${rx}_${ry}`, () => {
      const t = ashlarTex(hue, light, seed).clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
    }),
  road: () =>
    m('road', () => {
      const t = cobbleTex();
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, metalness: 0.05, vertexColors: true });
    }),
  pavement: () =>
    m('pave', () => new THREE.MeshStandardMaterial({ map: flagTex(), roughness: 0.85, vertexColors: true })),
  cobbleChunk: () => m('cobchunk', () => new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.8 })),
  slate: () => m('slate', () => new THREE.MeshStandardMaterial({ map: slateTex(), roughness: 0.7 })),
  wood: (hue = 28, light = 30, seed = 5) =>
    m(`wood${hue}_${light}_${seed}`, () => new THREE.MeshStandardMaterial({ map: woodTex(hue, light, seed), roughness: 0.85 })),
  planks: () => m('planks', () => new THREE.MeshStandardMaterial({ map: woodTex(34, 45, 8, false), roughness: 0.9 })),
  barrel: () => m('barrel', () => new THREE.MeshStandardMaterial({ map: barrelTex(), roughness: 0.7 })),
  barrelEnd: () => m('barrelEnd', () => new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8 })),
  metal: () => color(0x2a2c30, 0.45, 0.7),
  steel: () => color(0x9aa3ad, 0.35, 0.8),
  gold: () => color(0xd8a93a, 0.3, 0.9),
  red: () => color(0xc4161c, 0.45, 0.1),
  white: () => color(0xf2efe8, 0.7),
  black: () => color(0x161616, 0.6),
  glass: () =>
    m('glass', () => new THREE.MeshStandardMaterial({ color: 0xbad6e6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false })),
  skin: (i = 0) => color([0xf1c7a5, 0xd9a07a, 0x8d5a3b, 0xf6d6c0, 0xb57a52][i % 5], 0.7),
  tartan: (name: keyof typeof TARTANS) =>
    m(`tartan_${name}`, () => {
      const mat = new THREE.MeshStandardMaterial({ map: tartanTex(name, TARTANS[name]), roughness: 0.9, side: THREE.DoubleSide });
      mat.userData.tint = new THREE.Color(TARTANS[name][0][0]).getHex(); // the ground colour, for anything that has to match it
      return mat;
    }),
  stripes: (a: string, b: string) => m(`str${a}${b}`, () => new THREE.MeshStandardMaterial({ map: stripeTex(a, b), roughness: 0.8, side: THREE.DoubleSide })),
  emissive: (hex: number, intensity = 1) =>
    m(`em${hex}_${intensity}`, () => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: intensity })),
  basic: (hex: number) => m(`basic${hex}`, () => new THREE.MeshBasicMaterial({ color: hex }) as any),
};

export function mapMat(map: THREE.Texture, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.8, ...opts });
}
