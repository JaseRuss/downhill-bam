/**
 * Dev-only model viewer: `npm run dev`, then /viewer.html?m=<name>. Same lights and tone mapping
 * as the game, so a model can be judged without driving to it. Not part of the build.
 */
import * as THREE from 'three';
import { makeEnv } from './art/Materials';
import * as H from './art/Humanoid';
import * as A from './art/Accessories';
import { VEHICLES, VehicleId } from './vehicle/Vehicles';
import { G } from './ctx';
import * as Road from './world/Road';
import * as P from './props/Props';
import * as Hm from './props/Homages';
import * as Mo from './art/Motors';
import * as LM from './art/Landmarks';
import * as LM2 from './art/Landmarks2';
import { M } from './art/Materials';
import * as B from './level/Buildings';
import { initInteriors } from './art/Interiors';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
makeEnv(renderer);
initInteriors(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfd6da);
scene.add(new THREE.HemisphereLight(0xdfe7f0, 0x4f463c, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 900);

const stage = new THREE.Group();
scene.add(stage);

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function person(o: H.Outfit, x: number, pose: (r: H.Rig) => void = (r) => H.poseStand(r, 0)) {
  const r = H.buildHuman(o);
  pose(r);
  r.root.position.z = x;
  stage.add(r.root);
  return r;
}

// Props place themselves through the destruction system; here that just lines them up in a row.
let slot = 0, gapZ = 1.4;
Road.setCourse('royalmile', 1);
Object.assign(G, {
  updaters: [],
  destruction: {
    add: (_pos: any, _q: any, half: number[], opts: any) => {
      const v = opts.visual as THREE.Object3D;
      v.position.set(0, half[1], slot);
      v.rotation.set(0, 0, 0);
      slot += gapZ;
      stage.add(v);
      return { mesh: v, opts, body: {} };
    },
  },
});
const row = (gap: number, n: number) => {
  gapZ = gap;
  slot = (-(n - 1) * gap) / 2;
};

function vehicle(id: VehicleId, z = 0) {
  const spec = VEHICLES[id];
  const g = new THREE.Group();
  const parts = spec.build(g);
  const len = spec.suspRest * 0.8;
  spec.wheels.forEach(([x, wz], i) => {
    parts.wheels[i].position.set(x, spec.wheelY - len, wz);
    parts.springs[i].scale.y = Math.max(0.02, parts.springs[i].position.y - (spec.wheelY - len) - 0.03);
  });
  // Hamish, seated as he is in the game
  const rig = H.buildHuman(H.hamishOutfit());
  const s = rig.height / 1.75;
  const rider = new THREE.Group();
  rider.add(rig.root);
  rig.root.position.set(-0.12, 0.36 - H.D.pelvisY * s, 0);
  rig.pelvis.rotation.z = spec.seat[2];
  rig.hipL.rotation.set(-0.12, 0, 1.75);
  rig.hipR.rotation.set(0.12, 0, 1.75);
  rig.kneeL.rotation.set(0, 0, -1.25);
  rig.kneeR.rotation.set(0, 0, -1.25);
  rig.shoulderL.rotation.set(-0.45, 0, 2.6);
  rig.shoulderR.rotation.set(0.45, 0, 2.6);
  if (rig.kilt) {
    const a = 1.75, len = 0.95;
    rig.kilt.rotation.z = a;
    rig.kilt.scale.set(0.62, len, 1);
    rig.kilt.position.set(Math.sin(a) * 0.21 * s * len, -0.04 * s - Math.cos(a) * 0.21 * s * len, 0);
  }
  rider.position.set(spec.seat[0], spec.seat[1], 0);
  if (!new URLSearchParams(location.search).has('empty')) g.add(rider);
  g.position.set(0, -(spec.wheelY - len) + spec.wheelR, z);
  stage.add(g);
}

/** Buildings need a bigger stage than props: widen the ground and the sun's shadow to `r` metres. */
function big(r: number) {
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.far = r * 5;
  sc.updateProjectionMatrix();
  sun.position.set(r * 0.9, r * 1.8, r * 0.8);
  ground.scale.setScalar(Math.max(1, r / 12));
}
const put = (o: THREE.Object3D, x = 0, y = 0, z = 0, yaw = 0) => {
  o.position.set(x, y, z);
  o.rotation.y = yaw;
  stage.add(o);
  return o;
};

const MODELS: Record<string, () => void> = {
  // ---- buildings and landmarks (yaw 0 looks at the street face)
  gatehouse: () => {
    big(30);
    put(LM.gatehouseModel(), 0, 0, 0, Math.PI / 2);
  },
  castle: () => {
    big(70);
    const g = new THREE.Group();
    g.add(LM.gatehouseModel(), LM.castleKeepModel());
    [[0, 0, -6, -32, 46, 23, 29, 0], [1, -26, -9, -30, 26, 20, 24, 1.1], [2, 27, -10, -34, 24, 19, 22, 2.3]].forEach(([i, x, y, z, sx, sy, sz, yaw]) => {
      const c = LM.cragModel(i, sx, sy, sz, yaw);
      c.position.set(x, y, z);
      g.add(c);
    });
    put(g, 0, 6, 0, Math.PI / 2);
  },
  esplanade: () => {
    big(16);
    put(LM.esplanadeWallModel(24), -3, 0.35, 0);
    put(LM.gunModel(), 2, 0, 0, Math.PI / 2);
    put(LM.postModel(5.5), 2, 0, 4);
  },
  stgiles: () => {
    big(45);
    const top = 17, tH = 26;
    put(LM.stGilesNaveModel(56, top, 0, -24, 0.4), -2.8, 0, 0);
    put(LM.stGilesTowerModel(tH), 0, 0, 0);
    // the crown, laid out as the level does it
    const c = new THREE.Group();
    c.position.y = tH;
    stage.add(c);
    for (const [x, z, hx, hz] of [[0, 3.0, 3.2, 0.2], [0, -3.0, 3.2, 0.2], [3.0, 0, 0.2, 2.8], [-3.0, 0, 0.2, 2.8]]) {
      const m = LM.crownParapetModel(Math.max(hx, hz) * 2, 0.4);
      m.position.set(x, 0.45, z);
      if (hz > hx) m.rotation.y = Math.PI / 2;
      c.add(m);
    }
    for (const [x, z] of [[2.9, 2.9], [-2.9, 2.9], [2.9, -2.9], [-2.9, -2.9]]) {
      const m = LM.crownPinnacleModel();
      m.position.set(x, 2.0, z);
      c.add(m);
    }
    for (const [x, z] of [[2.7, 2.7], [-2.7, 2.7], [2.7, -2.7], [-2.7, -2.7], [2.9, 0], [-2.9, 0], [0, 2.9], [0, -2.9]]) {
      const a = new THREE.Vector3(x, 1.0, z), b = new THREE.Vector3(0, 4.4, 0);
      const hl = Math.hypot(x, z);
      const m = LM.crownRibModel(a.distanceTo(b), -x / hl, -z / hl);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      c.add(m);
    }
    const l = LM.crownLanternModel();
    l.position.y = 5.4;
    const sp = LM.crownSpireModel();
    sp.position.y = 8.0;
    c.add(l, sp);
  },
  scott: () => {
    big(50);
    put(LM.scottMonumentModel());
  },
  mercat: () => {
    big(10);
    put(LM2.mercatDrumModel(), 0, 1.3, 0);
    for (let i = 0; i < 4; i++) put(LM2.mercatShaftModel(), 0, 2.6 + 0.85 + i * 1.7, 0);
    put(LM2.mercatCapitalModel(), 0, 9.6, 0);
    put(LM2.unicornModel(), 0, 10.4, 0, Math.PI / 2);
  },
  tron: () => {
    big(50);
    put(LM2.tronKirkModel(32, 15), 0, 0, 0, Math.PI);
  },
  tolbooth: () => {
    big(30);
    put(LM2.tolboothModel(13));
    put(LM2.tolboothClockModel(), 8, 4, -8, Math.PI / 2);
  },
  holyrood: () => {
    big(40);
    put(LM2.palaceModel(), 0, 0, 0, -Math.PI / 2);
  },
  gates: () => {
    big(14);
    put(LM2.gatePostModel(), 0, 1.9, -3.75);
    put(LM2.gatePostModel(), 0, 1.9, 3.75);
    put(LM2.gateLeafModel(), 0, 1.55, -1.66, Math.PI / 2);
    put(LM2.gateLeafModel(), 0, 1.55, 1.66, Math.PI / 2);
    put(LM2.sideRailingModel(), 0, 0, 6.1, Math.PI / 2);
    put(LM2.forecourtWallModel(20), -8, 1, 0);
    put(LM2.fountainBasinModel(), 8, 0, 0);
    put(LM2.fountainStemModel(), 8, 1.6, 0);
    put(LM2.fountainBowlModel(), 8, 2.75, 0);
    put(LM2.fountainCrownModel(), 8, 3.2, 0);
  },
  stall: () => {
    big(8);
    put(LM2.stallCanopyModel(M.stripes('#c4161c', '#f4ecd8')), 0, 2.38, 0);
    put(LM2.stallCounterModel(), 0, 0.48, 0);
  },
  caley: () => {
    big(40);
    put(LM2.caledonianModel(), 0, 0, 0, Math.PI);
  },
  balmoral: () => {
    big(60);
    put(LM2.balmoralModel());
  },
  whip: () => {
    big(50);
    put(LM2.walnutWhipModel());
  },
  wheel: () => {
    big(20);
    const w = LM2.bigWheelModel(8.5);
    w.rotation.z = Math.PI / 2;
    w.position.y = 9.4;
    stage.add(w);
  },
  lighthouse: () => {
    big(25);
    put(LM2.lighthouseModel(), 0, -2, 0, -Math.PI / 2);
  },
  train: () => {
    big(30);
    put(LM2.trainCarModel(false), 0, 0, -10.5);
    put(LM2.trainCarModel(true), 0, 0, 10.5);
  },
  ross: () => {
    big(12);
    put(LM2.rossFountainModel());
  },
  gallery: () => {
    big(30);
    put(LM2.galleryModel(15));
  },
  keep: () => {
    big(60);
    put(LM.castleKeepModel(), 0, -5, 20, Math.PI / 2);
  },
  tenements: () => {
    big(40);
    // a run of lands down the right-hand side of the Royal Mile, turned to face the camera
    const g = new THREE.Group();
    let s = 200;
    [[11, 19], [8, 15], [13, 22], [9, 14], [12, 24], [10, 17]].forEach(([w, h], i) => {
      g.add(B.tenement(s, w, 1, h, 100 + i * 7));
      s += w;
    });
    const c = Road.toWorld(230, 12, 0);
    g.position.set(-c.x, -Road.baseH(230), -c.z);
    const turn = new THREE.Group();
    turn.add(g);
    turn.rotation.y = -Road.theta(230);
    stage.add(turn);
  },

  props: () => {
    row(1.5, 9);
    const v = new THREE.Vector3();
    P.communalBin(0, 0); P.bollard(0, 0); P.lampPost(0, 0); P.aBoard(0, 0, 0); P.cone(0, 0); P.bench(0, 1); P.barrier(0, 0); P.barrel(v); P.haggis(v);
  },
  homage: () => {
    row(2.2, 2);
    Hm.policeBox(0, 0); Hm.arcadeCabinet(0, 1);
  },
  cars: () => {
    [0xb3122e, 0x1b4f9c, 0xdcdcdc].forEach((t, i) => {
      const c = Mo.carModel(t);
      c.position.set(0, 0.85, (i - 1.5) * 2.4);
      stage.add(c);
    });
    const pc = Mo.policeCarModel(new THREE.MeshStandardMaterial({ color: 0xf2d21b })).group;
    pc.position.set(0, 0.85, 1.5 * 2.4);
    stage.add(pc);
  },
  tram: () => {
    stage.add(Mo.tramModel(3, 9.6, 0.5));
  },
  digger: () => {
    const d = Mo.diggerModel();
    d.position.y = 1.1;
    stage.add(d);
  },
  trolley: () => vehicle('trolley'),
  blower: () => vehicle('blower'),
  scooter: () => vehicle('scooter'),
  buggy: () => vehicle('buggy'),
  gritter: () => vehicle('gritter'),
  hamish: () => {
    person(H.hamishOutfit(), 0);
  },
  hamishes: () => {
    person(H.hamishOutfit(), -1.2);
    person(H.hamishOutfit(), 0, (r) => H.poseRun(r, 1.2, 1));
    person(H.hamishOutfit(), 1.2, (r) => H.poseFlail(r, 0.3, 1));
    const seat = person(H.hamishOutfit(), 2.6);
    seat.root.position.y = -0.55;
    seat.pelvis.rotation.z = 0.25;
    seat.hipL.rotation.set(-0.12, 0, 1.75);
    seat.hipR.rotation.set(0.12, 0, 1.75);
    seat.kneeL.rotation.set(0, 0, -1.25);
    seat.kneeR.rotation.set(0, 0, -1.25);
    seat.shoulderL.rotation.set(-0.45, 0, 2.6);
    seat.shoulderR.rotation.set(0.45, 0, 2.6);
  },
  people: () => {
    const r = rng(7);
    const outfits = [
      H.touristOutfit(r), H.touristOutfit(r), H.touristOutfit(r), H.touristOutfit(r), H.fanOutfit('hearts', r), H.fanOutfit('hibs', r),
      H.wizardOutfit(r), H.influencerOutfit(r), H.marcherOutfit(), H.mimeOutfit(), H.piperOutfit(), H.ghostOutfit(),
    ];
    outfits.forEach((o, i) => person(o, (i - (outfits.length - 1) / 2) * 0.85));
  },
  crowd: () => {
    const r = rng(3);
    for (let i = 0; i < 24; i++) {
      const o = [H.touristOutfit, H.influencerOutfit, H.wizardOutfit][i % 3](r);
      const p = person(o, ((i % 8) - 3.5) * 0.8, (rg) => (i % 4 === 0 ? H.poseRun(rg, i, 0.8) : H.poseStand(rg, i)));
      p.root.position.x = -Math.floor(i / 8) * 1.2;
    }
  },
  acc: () => {
    const r = rng(11);
    const piper = person(H.piperOutfit(), -3);
    A.bagpipes(piper);
    piper.shoulderL.rotation.set(-0.5, 0, 0.9);
    piper.elbowL.rotation.z = 1.5;
    piper.shoulderR.rotation.set(0.5, 0, 0.9);
    piper.elbowR.rotation.z = 1.5;
    const ghost = person(H.ghostOutfit(), -2);
    A.lantern(ghost);
    ghost.shoulderR.rotation.set(0.3, 0, 1.2);
    const wiz = person(H.wizardOutfit(r), -1);
    A.specs(wiz); A.scarf(wiz, '#7a1f1f', '#d4a017', -1); A.wand(wiz); A.pointyHat(wiz, false);
    wiz.shoulderR.rotation.set(0.2, 0, 1.4);
    const inf = person(H.influencerOutfit(r), 0);
    A.shades(inf); A.phone(inf, true);
    inf.shoulderR.rotation.set(0.5, 0, 2.2);
    const fan = person(H.fanOutfit('hearts', r), 1);
    A.scarf(fan, '#7a1f3d', '#f2f2f2', 1);
    const fan2 = person(H.fanOutfit('hibs', r), 2);
    A.scarf(fan2, '#0b6b3a', '#f2f2f2', 1);
    const t1 = person(H.touristOutfit(r), 3);
    A.camera(t1, false); A.bumbag(t1);
    const t2 = person(H.touristOutfit(r), 4);
    A.camera(t2, true);
    t2.shoulderR.rotation.set(0.3, 0, 1.5); t2.elbowR.rotation.z = 1.2;
    const w = person(H.touristOutfit(r), 5);
    A.hiVis(w, 0xd8ff2a, 0x1b2a4a);
    const m = person(H.marcherOutfit(), 5.8);
    const u = A.umbrella(); u.position.set(0.05, 0.62, 0); m.root.add(u);
  },
  hats: () => {
    const styles: H.HatStyle[] = ['tam', 'bucket', 'cap', 'feather', 'top', 'beret'];
    styles.forEach((st, i) => {
      const o = H.touristOutfit(rng(i + 1));
      o.hat = st;
      o.hatMat = st === 'tam' ? H.hamishOutfit().hatMat : o.hatMat;
      person(o, (i - 2.5) * 0.8);
    });
  },
};

(window as any).show = (name: string) => {
  stage.clear();
  big(8);
  (MODELS[name] ?? MODELS.hamish)();
  stage.traverse((o: any) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
};
/** Orbit: yaw 0 looks at the model's front (+X), pitch up from level, both in degrees. */
(window as any).cam = (yaw = 30, pitch = 10, dist = 4, tx = 0, ty = 0.9, tz = 0) => {
  const y = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
  camera.position.set(tx + Math.cos(y) * Math.cos(p) * dist, ty + Math.sin(p) * dist, tz + Math.sin(y) * Math.cos(p) * dist);
  camera.lookAt(tx, ty, tz);
};
(window as any).MODELS = MODELS;
(window as any).meshes = () => {
  const out: string[] = [];
  stage.traverse((o: any) => {
    if (o.isMesh) out.push(`${o.type}${o.userData.fig ? '*' : ''} ${(o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3} tris ${o.geometry.attributes.position.count} verts`);
  });
  return out;
};
(window as any).stats = () => {
  renderer.info.reset();
  renderer.render(scene, camera);
  return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
};
const params = new URLSearchParams(location.search);
(window as any).show(params.get('m') ?? 'hamish');
(window as any).cam();
renderer.info.autoReset = false;
renderer.setAnimationLoop(() => {
  renderer.info.reset();
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
(window as any).ready = true;
