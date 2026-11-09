import * as THREE from 'three';
import { G } from '../ctx';
import { M, color, mapMat } from '../art/Materials';
import { canvas, signTex } from '../art/Textures';
import { theta, toWorld, edgeL, edgeR } from '../world/Road';
import { yawQ } from './Props';

/**
 * Nods to Edinburgh's (and Dundee's) games industry, without borrowing anyone's names or logos:
 * troupes of wee marchers crossing the street, a wanted level for smashing police cars and boxes,
 * and an arcade cabinet with a top-down city on its screen.
 */

// ------------------------------------------------------------------ the wanted level
let wanted = 0;
const MAX_STARS = 5;

/** Clear the wanted level (every new run). */
export function resetWanted() {
  wanted = 0;
  showWanted();
}

function showWanted() {
  const el = document.getElementById('wanted');
  if (!el) return;
  el.style.display = wanted > 0 ? '' : 'none';
  el.innerHTML = `<small>WANTED</small>${'★'.repeat(wanted)}<span class="off">${'★'.repeat(MAX_STARS - wanted)}</span>`;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/** You've smashed something belonging to the polis. */
function crime(pos: THREE.Vector3) {
  if (wanted >= MAX_STARS) return;
  wanted++;
  showWanted();
  G.sfx.siren();
  if (wanted === MAX_STARS) {
    G.scoring.award('FIVE STARS!', 5000, pos.clone().add(new THREE.Vector3(0, 3, 0)), true, 'wanted');
    G.commentary.say('fivestars', true);
  } else G.commentary.say('police', true);
}

function battenburg() {
  const c = canvas(256, 64);
  const g = c.getContext('2d')!;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#1b3f9c' : '#f2d21b';
      g.fillRect(x * 16, y * 32, 16, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
}
let bbMat: THREE.Material | null = null;

/** A parked polis car: white, yellow-and-blue checks, a light bar that flashes. */
export function policeCar(s: number, u: number, yawExtra = 0) {
  bbMat ??= battenburg();
  const v = new THREE.Group();
  const white = color(0xf4f4f2, 0.3, 0.3);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    v.add(b);
    return b;
  };
  box(4.2, 0.7, 1.8, 0, -0.15, 0, white);
  box(2.3, 0.62, 1.66, -0.2, 0.5, 0, white);
  box(2.2, 0.5, 1.68, -0.2, 0.5, 0, color(0x1d2630, 0.15, 0.5));
  box(4.22, 0.22, 1.82, 0, -0.1, 0, bbMat);
  for (const x of [-1.35, 1.35]) for (const z of [-0.88, 0.88]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), M.black());
    w.rotation.x = Math.PI / 2;
    w.position.set(x, -0.5, z);
    v.add(w);
  }
  // the light bar: two blue lamps that take turns
  const blueA = new THREE.MeshStandardMaterial({ color: 0x2a5bff, emissive: 0x2a5bff, emissiveIntensity: 2 });
  const blueB = blueA.clone();
  box(0.3, 0.12, 0.7, -0.2, 0.88, -0.36, blueA);
  box(0.3, 0.12, 0.7, -0.2, 0.88, 0.36, blueB);
  const doors = mapMat(signTex(['POLIS'], '#f4f4f2', '#1b3f9c', 256, 64, 'Arial Black'));
  for (const z of [-0.915, 0.915]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), doors);
    p.position.set(-0.3, 0.12, z);
    if (z < 0) p.rotation.y = Math.PI;
    v.add(p);
  }
  let t = Math.random() * 2;
  G.updaters.push((dt) => {
    t += dt;
    const on = Math.floor(t * 4) % 2 === 0;
    blueA.emissiveIntensity = on ? 3 : 0.2;
    blueB.emissiveIntensity = on ? 0.2 : 3;
  });
  let done = false;
  G.destruction.add(toWorld(s, u, 0.85), theta(s) - Math.PI / 2 + yawExtra, [2.1, 0.85, 0.9], {
    visual: v, dynamic: true, density: 115, points: 600, label: 'POLIS Car', sound: 'metal', restitution: 0.25, friction: 0.9,
    onHit: (p) => {
      if (done) return;
      done = true;
      crime(p.mesh.position);
    },
  });
}

/** An old blue police box, Edinburgh style: a pillar of a thing with a lamp on top. */
export function policeBox(s: number, u: number) {
  const v = new THREE.Group();
  const navy = color(0x14285e, 0.6);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 1.2), navy);
  body.castShadow = true;
  v.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.92, 0.45, 4), navy);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.37;
  v.add(roof);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), M.emissive(0xdde8ff, 1.5));
  lamp.position.y = 1.7;
  v.add(lamp);
  const sign = mapMat(signTex(['POLIS'], '#0d1a40', '#ffffff', 256, 64, 'Arial Black'));
  for (let k = 0; k < 4; k++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.22), sign);
    const a = (k * Math.PI) / 2;
    p.position.set(Math.sin(a) * 0.605, 0.95, Math.cos(a) * 0.605);
    p.rotation.y = a;
    v.add(p);
  }
  let done = false;
  G.destruction.add(toWorld(s, u, 1.15), theta(s), [0.6, 1.15, 0.6], {
    visual: v, density: 700, release: 12, fracture: [2, 3, 2], fractureLoad: 80, points: 800, label: 'Police Box', sound: 'wood', retain: 0.85,
    onHit: (p) => {
      if (done) return;
      done = true;
      crime(p.mesh.position);
    },
  });
}

// ------------------------------------------------------------------ the arcade cabinet
let screenMat: THREE.Material | null = null;
function screen() {
  if (screenMat) return screenMat;
  // a top-down city: road grid, rooftops, wee cars and wee people
  const c = canvas(128, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1b1b';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#5b5b5b';
  for (const x of [18, 70, 110]) g.fillRect(x, 0, 12, 128);
  for (const y of [24, 80]) g.fillRect(0, y, 128, 12);
  const roofs = ['#7a3b2e', '#3b5f7a', '#6b6b2e', '#4a2e6b', '#2e6b4a'];
  for (let i = 0; i < 14; i++) {
    g.fillStyle = roofs[i % roofs.length];
    const x = [0, 32, 84, 122][i % 4], y = [0, 38, 94][i % 3];
    g.fillRect(x + 2, y + 2, 14 + (i % 3) * 4, 18);
  }
  const cars = ['#ff3b3b', '#ffd23f', '#3bd1ff', '#ffffff'];
  for (let i = 0; i < 9; i++) {
    g.fillStyle = cars[i % cars.length];
    if (i % 2) g.fillRect(21 + (i % 3) * 52, 8 + i * 13, 6, 10);
    else g.fillRect(6 + i * 13, 27 + (i % 4 > 1 ? 56 : 0), 10, 6);
  }
  g.fillStyle = '#f2c14e';
  for (let i = 0; i < 12; i++) g.fillRect((i * 37) % 120 + 4, (i * 53) % 120 + 4, 2, 2);
  g.fillStyle = '#ffd23f';
  g.font = 'bold 9px monospace';
  g.fillText('1UP 004200', 4, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  screenMat = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.2 });
  return screenMat;
}

/** A retro arcade cabinet out on the pavement. */
export function arcadeCabinet(s: number, u: number) {
  const v = new THREE.Group();
  const body = color(0x2a1745, 0.5);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    mesh.castShadow = true;
    v.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(0.75, 1.9, 0.8), body, 0, 0, 0);
  for (const z of [-0.41, 0.41]) add(new THREE.BoxGeometry(0.76, 1.9, 0.02), M.stripes('#ff3bb0', '#2a1745'), 0, 0, z);
  // screen, angled back, facing the street (+x)
  const scr = add(new THREE.PlaneGeometry(0.55, 0.5), screen(), 0.39, 0.38, 0);
  scr.rotation.order = 'YXZ';
  scr.rotation.set(-0.25, Math.PI / 2, 0); // tipped back towards whoever's playing
  add(new THREE.BoxGeometry(0.3, 0.1, 0.72), color(0x111111, 0.4), 0.45, -0.05, 0);
  const marquee = mapMat(signTex(['PIXEL RAMPAGE'], '#ff3bb0', '#ffffff', 256, 64, 'Arial Black'), { emissive: 0xff3bb0, emissiveIntensity: 0.6 });
  const mq = add(new THREE.PlaneGeometry(0.7, 0.2), marquee, 0.385, 0.84, 0);
  mq.rotation.set(0, Math.PI / 2, 0);
  // face the street from whichever side it stands on
  const yaw = theta(s) + (u > 0 ? 0 : Math.PI);
  G.destruction.add(toWorld(s, u, 0.95), yawQ(yaw), [0.38, 0.95, 0.4], {
    visual: v, dynamic: true, density: 260, points: 700, label: 'Arcade Cabinet', sound: 'glass', restitution: 0.2,
    onHit: (p) => {
      if ((p as any).gameOver) return;
      (p as any).gameOver = true;
      G.fx.sparkle(p.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 16);
      G.commentary.say('arcade', true);
    },
  });
}

// ------------------------------------------------------------------ the wee marchers
/**
 * A troupe of wee marchers crossing the street at s: walkers going back and forth between the
 * kerbs, one blocker in the middle, one floating down on an umbrella. Flatten the lot for a bonus.
 */
export function marchers(s: number, n = 8) {
  const uA = -edgeL(s) + 1.2, uB = edgeR(s) - 1.2;
  const troupe: { scored: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const u = uA + ((uB - uA) * (i + 0.5)) / n;
    const role = i === Math.floor(n / 2) ? 'blocker' : i === n - 1 ? 'floater' : 'walker';
    const t = G.crowd.tourist(s + (Math.random() - 0.5) * 1.2, role === 'blocker' ? 0.3 : u, 'marcher', role === 'floater' ? 7 : 0, 'Wee Marcher', 100);
    t.march(role, s, uA, uB);
    troupe.push(t);
  }
  let saidAll = false;
  G.updaters.push(() => {
    if (saidAll || !troupe.every((t) => t.scored)) return;
    saidAll = true;
    G.scoring.award('NONE SAVED!', 1500, G.trolley.position.add(new THREE.Vector3(0, 2.5, 0)), true, 'marchers');
    G.commentary.show('None saved! The whole troupe! Somebody give that trolley a medal. Or a fine.', 3.5);
  });
}
