import * as THREE from 'three';
import { G } from '../ctx';
import { color } from '../art/Materials';
import { canvas } from '../art/Textures';
import { toWorld } from '../world/Road';

/** Seconds of boost from one can. */
export const SKOOSH_BOOST = 4;

let canMat: THREE.MeshStandardMaterial | null = null;
function label() {
  if (canMat) return canMat;
  const c = canvas(256, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#5b2a86';
  g.fillRect(0, 0, 256, 128);
  // bubbles, a yellow lightning bolt and the name, twice round the can
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 5, 0, Math.PI * 2);
    g.fill();
  }
  for (const x of [0, 128]) {
    g.fillStyle = '#ffd400';
    g.beginPath();
    g.moveTo(x + 22, 14); g.lineTo(x + 40, 14); g.lineTo(x + 32, 52); g.lineTo(x + 46, 52); g.lineTo(x + 18, 114); g.lineTo(x + 26, 66); g.lineTo(x + 12, 66);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px Arial Black, Arial';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.save();
    g.translate(x + 52, 64);
    g.rotate(-0.12);
    g.fillText('SKOOSH', 0, 0);
    g.font = 'bold 12px Arial';
    g.fillStyle = '#ffd400';
    g.fillText('FIZZY GINGER · EXTRA FIZZ', 2, 24);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  canMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.5, emissive: 0x200830, emissiveIntensity: 0.6 });
  return canMat;
}

/**
 * A giant can of SKOOSH (Scots for a fizzy drink) floating over the road. Drive through it for a few seconds of
 * sugar-powered boost (it works with or without an engine).
 */
export function skooshCan(s: number, u: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 24, 1, true), label());
  g.add(body);
  const lid = color(0xc8ccd0, 0.25, 0.9);
  for (const y of [-0.45, 0.45]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.32, 0.06, 24), lid);
    cap.position.y = y + Math.sign(y) * 0.03;
    g.add(cap);
  }
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), lid);
  tab.rotation.x = Math.PI / 2;
  tab.position.set(0.1, 0.5, 0);
  g.add(tab);
  g.traverse((o: any) => o.isMesh && (o.castShadow = true));
  // a glowing ring on the cobbles so you can see it coming
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.6, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  const base = toWorld(s, u, 0);
  ring.position.copy(base).add(new THREE.Vector3(0, 0.06, 0));
  g.position.copy(base).add(new THREE.Vector3(0, 1.3, 0));
  G.scene.add(g, ring);
  let taken = false;
  let t = Math.random() * 6;
  G.updaters.push((dt) => {
    t += dt;
    if (taken) return;
    g.rotation.y = t * 2.2;
    g.rotation.z = Math.sin(t * 1.3) * 0.2;
    g.position.y = base.y + 1.3 + Math.sin(t * 2.4) * 0.15;
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 5) * 0.2;
    const tr = G.trolley;
    if (!G.armed || tr.ejected) return;
    const p = tr.position;
    if (Math.hypot(p.x - g.position.x, p.z - g.position.z) < 1.9 && Math.abs(p.y - base.y) < 3) {
      taken = true;
      G.scene.remove(g, ring);
      tr.boost(SKOOSH_BOOST);
      G.sfx.fizz();
      G.fx.sparkle(g.position.clone(), 22);
      G.fx.splash(g.position.clone(), 0x9b59d0, 24);
      G.scoring.award('SKOOSH!', 250, g.position.clone().add(new THREE.Vector3(0, 1, 0)), true, 'skoosh');
      G.commentary.say('skoosh', true);
      G.shake(0.4);
    }
  });
}
