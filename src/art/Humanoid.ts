import * as THREE from 'three';
import { M, color } from './Materials';

/**
 * Shared character builder. Figures face +X, Z is the lateral axis, feet sit at y = 0.
 * Proportions follow a ~1.75 m adult (7.5 heads tall). Every joint is a Group so the figure can
 * be posed: shoulders/hips rotate about Z to swing limbs forward (+) and back (-).
 */
export type LegStyle = 'kilt' | 'trousers' | 'shorts' | 'robe';
export type HatStyle = 'tam' | 'bucket' | 'cap' | 'feather' | 'top' | 'beret' | null;
export type HairStyle = 'short' | 'wild' | 'bald' | 'long' | 'bun';

export interface Outfit {
  skin: THREE.Material;
  shirt: THREE.Material;
  longSleeves?: boolean;
  legs: LegStyle;
  legMat: THREE.Material;
  socks?: THREE.Material;
  shoes: THREE.Material;
  hair?: THREE.Material;
  hairStyle?: HairStyle;
  beard?: THREE.Material;
  hat?: HatStyle;
  hatMat?: THREE.Material;
  gloves?: THREE.Material;
  build?: number; // 0.85 skinny … 1.25 hefty
  height?: number; // metres
}

export interface Rig {
  root: THREE.Group;
  pelvis: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  hat: THREE.Object3D | null;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  kilt: THREE.Mesh | null;
  height: number;
}

// Segment lengths for a 1.75 m figure.
export const D = {
  shin: 0.43, thigh: 0.44, foot: 0.07, pelvisY: 0.95, abdomen: 0.2, chest: 0.3,
  neck: 0.08, headR: 0.112, upperArm: 0.29, forearm: 0.26, hand: 0.09, shoulderW: 0.2, hipW: 0.095,
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A tapered limb segment hanging down from its joint, with a rounded joint ball on top. */
export function segment(len: number, rTop: number, rBot: number, mat: THREE.Material) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10), mat, 0, -len / 2, 0));
  g.add(mesh(new THREE.SphereGeometry(rTop * 1.02, 10, 8), mat));
  return g;
}

export function hand(skin: THREE.Material, s = 1) {
  const g = new THREE.Group();
  const palm = mesh(new THREE.BoxGeometry(0.035 * s, 0.085 * s, 0.075 * s), skin, 0, -0.045 * s, 0);
  g.add(palm);
  const thumb = mesh(new THREE.CapsuleGeometry(0.012 * s, 0.03 * s, 3, 6), skin, 0.02 * s, -0.035 * s, 0.035 * s);
  thumb.rotation.x = 0.6;
  g.add(thumb);
  return g;
}

export function foot(shoe: THREE.Material, s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.25 * s, 0.07 * s, 0.1 * s), shoe, 0.06 * s, -0.035 * s, 0));
  const toe = mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), shoe, 0.17 * s, -0.035 * s, 0);
  toe.scale.set(1, 0.7, 1);
  g.add(toe);
  return g;
}

export function headMesh(o: Outfit, s = 1) {
  const g = new THREE.Group();
  const R = D.headR * s;
  const skull = mesh(new THREE.SphereGeometry(R, 16, 12), o.skin);
  skull.scale.set(1.0, 1.15, 0.92);
  g.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(R * 0.82, 12, 8), o.skin, R * 0.18, -R * 0.45, 0);
  jaw.scale.set(1.05, 0.75, 0.9);
  g.add(jaw);
  const nose = mesh(new THREE.ConeGeometry(R * 0.2, R * 0.42, 6), o.skin, R * 1.02, -R * 0.05, 0);
  nose.rotation.z = -Math.PI / 2;
  g.add(nose);
  for (const z of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(R * 0.17, 8, 6), M.white(), R * 0.82, R * 0.22, z * R * 0.36);
    g.add(eye);
    g.add(mesh(new THREE.SphereGeometry(R * 0.09, 6, 4), M.black(), R * 0.97, R * 0.22, z * R * 0.36));
    const ear = mesh(new THREE.SphereGeometry(R * 0.22, 8, 6), o.skin, 0, 0, z * R * 0.95);
    ear.scale.set(0.6, 1.1, 0.4);
    g.add(ear);
    const brow = mesh(new THREE.BoxGeometry(R * 0.1, R * 0.08, R * 0.38), o.hair ?? o.beard ?? M.black(), R * 0.92, R * 0.47, z * R * 0.36);
    brow.rotation.x = z * 0.15;
    g.add(brow);
  }
  // mouth: open in permanent mild alarm
  const mouth = mesh(new THREE.SphereGeometry(R * 0.16, 8, 6), color(0x4a1a1a, 0.8), R * 0.9, -R * 0.42, 0);
  mouth.scale.set(0.5, 0.7, 1.4);
  g.add(mouth);
  if (o.beard) {
    const b = mesh(new THREE.SphereGeometry(R * 1.02, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), o.beard, R * 0.12, -R * 0.2, 0);
    b.scale.set(1.08, 1.35, 1.05);
    g.add(b);
    const tache = mesh(new THREE.CapsuleGeometry(R * 0.1, R * 0.5, 3, 6), o.beard, R * 0.98, -R * 0.24, 0);
    tache.rotation.x = Math.PI / 2;
    g.add(tache);
  }
  const hs = o.hairStyle ?? 'short';
  if (o.hair && hs !== 'bald') {
    const cap = mesh(new THREE.SphereGeometry(R * 1.07, 14, 10, 0, Math.PI * 2, 0, Math.PI * (hs === 'long' ? 0.62 : 0.5)), o.hair, -R * 0.06, R * 0.12, 0);
    cap.scale.set(1.0, 1.15, 0.98);
    g.add(cap);
    if (hs === 'wild') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(R * 0.35, 6, 5), o.hair, Math.cos(a) * R * 0.6 - R * 0.2, R * 0.75 + (i % 2) * R * 0.15, Math.sin(a) * R * 0.75));
      }
    }
    if (hs === 'bun') g.add(mesh(new THREE.SphereGeometry(R * 0.4, 8, 6), o.hair, -R * 0.9, R * 0.7, 0));
    if (hs === 'long') {
      const back = mesh(new THREE.BoxGeometry(R * 0.5, R * 2.2, R * 1.7), o.hair, -R * 0.75, -R * 0.6, 0);
      g.add(back);
    }
  }
  return g;
}

export function hatMesh(style: HatStyle, mat: THREE.Material | undefined, s = 1): THREE.Object3D | null {
  if (!style) return null;
  const g = new THREE.Group();
  const R = D.headR * s;
  const m = mat ?? M.black();
  switch (style) {
    case 'tam': {
      const top = mesh(new THREE.CylinderGeometry(R * 1.75, R * 1.4, R * 0.55, 18), m);
      top.rotation.z = -0.15;
      g.add(top);
      g.add(mesh(new THREE.CylinderGeometry(R * 1.2, R * 1.2, R * 0.3, 16), M.black(), 0, -R * 0.35, 0));
      g.add(mesh(new THREE.SphereGeometry(R * 0.5, 10, 8), color(0xd7263d, 0.9), R * 0.15, R * 0.45, 0));
      break;
    }
    case 'bucket':
      g.add(mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.25, R * 0.8, 14), m, 0, 0.1 * R, 0));
      g.add(mesh(new THREE.CylinderGeometry(R * 1.7, R * 1.7, R * 0.08, 16), m, 0, -0.3 * R, 0));
      break;
    case 'cap':
      g.add(mesh(new THREE.SphereGeometry(R * 1.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m));
      g.add(mesh(new THREE.BoxGeometry(R * 1.3, R * 0.08, R * 1.4), m, R * 1.1, 0, 0));
      break;
    case 'feather': // Highland feather bonnet
      g.add(mesh(new THREE.CylinderGeometry(R * 1.35, R * 1.15, R * 3.2, 14), color(0x111111, 0.95), 0, R * 1.2, 0));
      g.add(mesh(new THREE.CylinderGeometry(R * 1.17, R * 1.17, R * 0.35, 14), M.tartan('red'), 0, -R * 0.3, 0));
      g.add(mesh(new THREE.ConeGeometry(R * 0.25, R * 1.6, 6), M.white(), 0, R * 2.6, R * 0.8));
      break;
    case 'top':
      g.add(mesh(new THREE.CylinderGeometry(R * 1.0, R * 1.0, R * 2.2, 14), m, 0, R * 0.9, 0));
      g.add(mesh(new THREE.CylinderGeometry(R * 1.7, R * 1.7, R * 0.1, 16), m, 0, -0.15 * R, 0));
      break;
    case 'beret': {
      const b = mesh(new THREE.SphereGeometry(R * 1.3, 12, 8), m, -R * 0.15, 0, 0);
      b.scale.set(1, 0.35, 1);
      g.add(b);
      break;
    }
  }
  g.traverse((o: any) => o.isMesh && (o.castShadow = true));
  return g;
}

/** A complete posable figure. */
export function buildHuman(o: Outfit): Rig {
  const h = o.height ?? 1.75;
  const s = h / 1.75;
  const b = o.build ?? 1;
  const root = new THREE.Group();

  const pelvis = new THREE.Group();
  pelvis.position.y = D.pelvisY * s;
  root.add(pelvis);
  const lowerMat = o.legs === 'robe' ? o.legMat : o.legs === 'kilt' ? o.shirt : o.legMat;
  const hipsBall = mesh(new THREE.SphereGeometry(0.15 * s * b, 12, 8), lowerMat, 0, 0, 0);
  hipsBall.scale.set(0.85, 0.7, 1.15);
  pelvis.add(hipsBall);

  // torso: abdomen + chest (tapered, wider at the shoulders)
  const abdomen = mesh(new THREE.CylinderGeometry(0.14 * s * b, 0.145 * s * b, D.abdomen * s, 12), o.shirt, 0, (D.abdomen / 2) * s, 0);
  abdomen.scale.set(0.8, 1, 1.15);
  pelvis.add(abdomen);
  const chest = new THREE.Group();
  chest.position.y = D.abdomen * s;
  pelvis.add(chest);
  const ribs = mesh(new THREE.CylinderGeometry(0.19 * s * b, 0.145 * s * b, D.chest * s, 12), o.shirt, 0, (D.chest / 2) * s, 0);
  ribs.scale.set(0.72, 1, 1.12);
  chest.add(ribs);
  const shoulders = mesh(new THREE.CapsuleGeometry(0.075 * s * b, 0.3 * s * b, 4, 8), o.shirt, 0, D.chest * s - 0.02 * s, 0);
  shoulders.rotation.x = Math.PI / 2;
  chest.add(shoulders);
  if (b > 1.1) chest.add(mesh(new THREE.SphereGeometry(0.17 * s * b, 12, 8), o.shirt, 0.06 * s, -0.05 * s, 0)); // a fine belly
  // neck + head
  const neck = mesh(new THREE.CylinderGeometry(0.048 * s, 0.055 * s, D.neck * s + 0.04 * s, 8), o.skin, 0, (D.chest + D.neck / 2) * s, 0);
  chest.add(neck);
  const head = new THREE.Group();
  head.position.y = (D.chest + D.neck + D.headR * 0.95) * s;
  head.add(headMesh(o, s));
  chest.add(head);
  const hat = hatMesh(o.hat ?? null, o.hatMat, s);
  if (hat) {
    hat.position.set(-0.01 * s, D.headR * 1.05 * s, 0);
    head.add(hat);
  }

  // arms
  const arm = (side: number) => {
    const sh = new THREE.Group();
    sh.position.set(0, (D.chest - 0.035) * s, side * (D.shoulderW * s * b + 0.02 * s));
    chest.add(sh);
    sh.add(segment(D.upperArm * s, 0.048 * s * b, 0.04 * s * b, o.shirt));
    const el = new THREE.Group();
    el.position.y = -D.upperArm * s;
    sh.add(el);
    el.add(segment(D.forearm * s, 0.038 * s * b, 0.03 * s, o.longSleeves ? o.shirt : o.skin));
    const hd = hand(o.gloves ?? o.skin, s);
    hd.position.y = -D.forearm * s;
    el.add(hd);
    return [sh, el];
  };
  const [shoulderL, elbowL] = arm(1);
  const [shoulderR, elbowR] = arm(-1);

  // legs
  const leg = (side: number) => {
    const hp = new THREE.Group();
    hp.position.set(0, -0.04 * s, side * D.hipW * s * b);
    pelvis.add(hp);
    const thighMat = o.legs === 'kilt' ? o.skin : o.legMat;
    hp.add(segment(D.thigh * s, 0.075 * s * b, 0.055 * s * b, thighMat));
    const kn = new THREE.Group();
    kn.position.y = -D.thigh * s;
    hp.add(kn);
    const shinMat = o.legs === 'trousers' || o.legs === 'robe' ? o.legMat : o.socks ?? o.skin;
    kn.add(segment(D.shin * s, 0.052 * s * b, 0.038 * s, shinMat));
    const ft = foot(o.shoes, s);
    ft.position.y = -D.shin * s;
    kn.add(ft);
    return [hp, kn];
  };
  const [hipL, kneeL] = leg(1);
  const [hipR, kneeR] = leg(-1);

  let kilt: THREE.Mesh | null = null;
  if (o.legs === 'kilt') {
    kilt = mesh(new THREE.CylinderGeometry(0.16 * s * b, 0.24 * s * b, 0.36 * s, 16, 1, true), o.legMat, 0, -0.14 * s, 0);
    (kilt.material as THREE.Material).side = THREE.DoubleSide;
    pelvis.add(kilt);
    // sporran
    const sp = mesh(new THREE.BoxGeometry(0.05 * s, 0.13 * s, 0.12 * s), color(0x5a3a22, 0.7), 0.17 * s * b, -0.08 * s, 0);
    pelvis.add(sp);
    pelvis.add(mesh(new THREE.SphereGeometry(0.02 * s, 6, 4), M.white(), 0.2 * s * b, -0.06 * s, 0.03 * s));
  } else if (o.legs === 'shorts') {
    for (const side of [1, -1]) {
      const sh = mesh(new THREE.CylinderGeometry(0.085 * s * b, 0.075 * s * b, 0.22 * s, 10), o.legMat, 0, -0.14 * s, side * D.hipW * s * b);
      pelvis.add(sh);
    }
  } else if (o.legs === 'robe') {
    const robe = mesh(new THREE.CylinderGeometry(0.17 * s * b, 0.36 * s * b, 1.15 * s, 16, 1, true), o.legMat, 0, -0.4 * s, 0);
    (robe.material as THREE.Material).side = THREE.DoubleSide;
    pelvis.add(robe);
    // a cape over the shoulders
    const cape = mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 0.5 * s, 14, 1, true), o.legMat, -0.02 * s, D.chest * s - 0.24 * s, 0);
    chest.add(cape);
  }
  root.traverse((x: any) => x.isMesh && (x.castShadow = true));
  return { root, pelvis, chest, head, hat, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR, kilt, height: h };
}

// ------------------------------------------------------------------ poses
export function poseStand(r: Rig, t = 0) {
  const sway = Math.sin(t * 1.3) * 0.04;
  r.shoulderL.rotation.set(-0.12, 0, 0.05 + sway);
  r.shoulderR.rotation.set(0.12, 0, 0.05 - sway);
  r.elbowL.rotation.set(0, 0, 0.15);
  r.elbowR.rotation.set(0, 0, 0.15);
  r.hipL.rotation.set(0, 0, 0);
  r.hipR.rotation.set(0, 0, 0);
  r.kneeL.rotation.set(0, 0, 0);
  r.kneeR.rotation.set(0, 0, 0);
  r.chest.rotation.set(0, 0, sway * 0.5);
}

export function poseRun(r: Rig, phase: number, k = 1) {
  const s = Math.sin(phase);
  r.hipL.rotation.set(0, 0, s * 0.9 * k);
  r.hipR.rotation.set(0, 0, -s * 0.9 * k);
  r.kneeL.rotation.set(0, 0, -Math.max(0, -Math.cos(phase)) * 1.4 * k - 0.15);
  r.kneeR.rotation.set(0, 0, -Math.max(0, Math.cos(phase)) * 1.4 * k - 0.15);
  r.shoulderL.rotation.set(-0.15, 0, -s * 1.1 * k);
  r.shoulderR.rotation.set(0.15, 0, s * 1.1 * k);
  r.elbowL.rotation.set(0, 0, 1.3);
  r.elbowR.rotation.set(0, 0, 1.3);
  r.chest.rotation.set(0, s * 0.15 * k, -0.25 * k);
}

/** Flying through the air: arms and legs windmill, utterly undignified. */
export function poseFlail(r: Rig, t: number, seed = 0) {
  const a = t * 14 + seed;
  r.shoulderL.rotation.set(-1.2 - Math.sin(a) * 0.8, 0, Math.cos(a) * 2.2);
  r.shoulderR.rotation.set(1.2 + Math.sin(a + 1) * 0.8, 0, Math.cos(a + 2) * 2.2);
  r.elbowL.rotation.set(0, 0, 0.6 + Math.sin(a * 1.3) * 0.6);
  r.elbowR.rotation.set(0, 0, 0.6 + Math.cos(a * 1.1) * 0.6);
  r.hipL.rotation.set(-0.5 - Math.sin(a * 0.9) * 0.4, 0, Math.sin(a) * 1.1);
  r.hipR.rotation.set(0.5 + Math.cos(a * 0.8) * 0.4, 0, -Math.sin(a) * 1.1);
  r.kneeL.rotation.set(0, 0, -0.4 - Math.abs(Math.sin(a * 1.2)) * 1.0);
  r.kneeR.rotation.set(0, 0, -0.4 - Math.abs(Math.cos(a * 1.2)) * 1.0);
}

/** Lying in a heap: limbs splayed. */
export function poseSplat(r: Rig) {
  r.shoulderL.rotation.set(-1.4, 0, 0.3);
  r.shoulderR.rotation.set(1.4, 0, -0.2);
  r.elbowL.rotation.set(0, 0, 0.4);
  r.elbowR.rotation.set(0, 0, 0.8);
  r.hipL.rotation.set(-0.4, 0, 0.2);
  r.hipR.rotation.set(0.3, 0, -0.1);
  r.kneeL.rotation.set(0, 0, -0.3);
  r.kneeR.rotation.set(0, 0, -0.6);
}

// ------------------------------------------------------------------ outfits
export const SKINS = [0xf1c7a5, 0xe0ac8a, 0x8d5a3b, 0xf6d6c0, 0xb57a52, 0x6b4430];
const SHIRTS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xffd166, 0x8e44ad, 0x06d6a0, 0xef476f, 0xf1f1f1, 0x3a86ff, 0xff8fab];
const PANTS = [0x2b2d42, 0x6c584c, 0x3d5a80, 0x22223b, 0xa3a380, 0xc2b280, 0x4a5a6a];
const HAIR = [0x2a1d14, 0x5a3a22, 0xc9a35b, 0x111111, 0xb5541c, 0x9a9a9a, 0xe0d6c0];

export function hamishOutfit(): Outfit {
  return {
    skin: color(0xf3c3a3, 0.7), shirt: color(0xf4f1ea, 0.8), longSleeves: true,
    legs: 'kilt', legMat: M.tartan('red'), socks: color(0xe9e4d6, 0.9), shoes: color(0x1a1a1a, 0.5),
    hair: color(0xc2541c, 0.95), hairStyle: 'wild', beard: color(0xc2541c, 0.95),
    hat: 'tam', hatMat: M.tartan('blue'), build: 1.15, height: 1.78,
  };
}

export function touristOutfit(r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const hats: HatStyle[] = ['bucket', 'cap', null, null, 'tam', 'bucket'];
  const hat = pick(hats);
  const legs: LegStyle = r() < 0.55 ? 'shorts' : 'trousers';
  return {
    skin: color(pick(SKINS), 0.7), shirt: color(pick(SHIRTS), 0.85), longSleeves: r() < 0.3,
    legs, legMat: color(pick(PANTS), 0.85), shoes: color(r() < 0.5 ? 0xf2f2f2 : 0x333333, 0.6),
    hair: color(pick(HAIR), 0.9), hairStyle: pick(['short', 'short', 'long', 'bun', 'bald'] as HairStyle[]),
    beard: r() < 0.15 ? color(pick(HAIR), 0.9) : undefined,
    hat, hatMat: hat === 'tam' ? M.tartan('red') : color(pick([0xf4e3b2, 0x1b4f9c, 0xd7263d, 0x2a2a2a]), 0.85),
    build: 0.9 + r() * 0.35, height: 1.55 + r() * 0.35,
  };
}

/** Match-day fan: Hearts in maroon, Hibs in green, both in jeans. */
export function fanOutfit(team: 'hearts' | 'hibs', r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const shirt = team === 'hearts' ? 0x7a1f3d : 0x0b6b3a;
  const hat: HatStyle = pick(['bucket', null, null, 'cap', 'bucket'] as HatStyle[]);
  return {
    skin: color(pick(SKINS), 0.7), shirt: color(shirt, 0.75), longSleeves: r() < 0.4,
    legs: 'trousers', legMat: color(pick([0x2b3a55, 0x3d5a80, 0x22223b]), 0.85), shoes: color(r() < 0.5 ? 0xf2f2f2 : 0x222222, 0.6),
    hair: color(pick(HAIR), 0.9), hairStyle: pick(['short', 'short', 'bald', 'wild'] as HairStyle[]),
    beard: r() < 0.3 ? color(pick(HAIR), 0.9) : undefined,
    hat, hatMat: color(team === 'hearts' ? (r() < 0.5 ? 0x7a1f3d : 0xf2f2f2) : r() < 0.5 ? 0x0b6b3a : 0xf2f2f2, 0.8),
    build: 1.0 + r() * 0.3, height: 1.65 + r() * 0.25,
  };
}

/** A wizard-film fan: a maroon robe over maroon, the hair is anybody's. */
export function wizardOutfit(r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  return {
    skin: color(pick(SKINS), 0.7), shirt: color(0x5a1424, 0.85), longSleeves: true,
    legs: 'robe', legMat: color(0x6b1a2c, 0.9), shoes: M.black(),
    hair: color(pick(HAIR), 0.9), hairStyle: pick(['wild', 'short', 'long', 'bun'] as HairStyle[]),
    build: 0.85 + r() * 0.3, height: 1.45 + r() * 0.4,
  };
}

/** An Instagrammer: something bright, something pastel, a cap now and then. */
export function influencerOutfit(r: () => number): Outfit {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const hat: HatStyle = r() < 0.3 ? 'cap' : r() < 0.15 ? 'bucket' : null;
  return {
    skin: color(pick(SKINS), 0.65), shirt: color(pick([0xff5fa2, 0xf6f1e9, 0xc8a2ff, 0xffd84d, 0x7fe0c8, 0xff8a5c]), 0.7), longSleeves: r() < 0.3,
    legs: r() < 0.5 ? 'shorts' : 'trousers', legMat: color(pick([0xe8e0d0, 0x87a8d0, 0x2b2d42, 0xf2f2f2]), 0.8), shoes: color(0xf6f6f6, 0.5),
    hair: color(pick(HAIR), 0.85), hairStyle: pick(['long', 'bun', 'long', 'short'] as HairStyle[]),
    hat, hatMat: color(pick([0xf6f1e9, 0x111111, 0xff5fa2]), 0.8),
    build: 0.9 + r() * 0.15, height: 1.6 + r() * 0.2,
  };
}

export function mimeOutfit(): Outfit {
  return {
    skin: color(0xf7f7f7, 0.6), shirt: M.stripes('#111111', '#f2f2f2'), longSleeves: true,
    legs: 'trousers', legMat: M.black(), shoes: M.black(), gloves: M.white(),
    hair: M.black(), hairStyle: 'short', hat: 'beret', hatMat: M.black(), build: 0.85, height: 1.72,
  };
}

export function piperOutfit(): Outfit {
  return {
    skin: color(0xe9b796, 0.7), shirt: color(0x111827, 0.7), longSleeves: true,
    legs: 'kilt', legMat: M.tartan('green'), socks: color(0xe9e4d6, 0.9), shoes: M.black(),
    hair: color(0x5a3a22), hairStyle: 'short', beard: color(0x5a3a22, 0.9), hat: 'feather', build: 1.05, height: 1.8,
  };
}

export function ghostOutfit(): Outfit {
  return {
    skin: color(0xe8e4dc, 0.7), shirt: M.black(), longSleeves: true,
    legs: 'robe', legMat: color(0x141414, 0.9), shoes: M.black(),
    hair: color(0x9a9a9a), hairStyle: 'long', hat: 'top', hatMat: M.black(), build: 0.9, height: 1.85,
  };
}
