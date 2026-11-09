import * as THREE from 'three';
import { G } from '../ctx';
import { color } from '../art/Materials';
import { canvas } from '../art/Textures';
import { toWorld } from '../world/Road';

/** Seconds of boost from one can. */
export const BREW_BOOST = 4;

let canMat: THREE.MeshStandardMaterial | null = null;
function label() {
  if (canMat) return canMat;
  const c = canvas(256, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f26a1b';
  g.fillRect(0, 0, 256, 128);
  // the blue chevron band and the name
  g.fillStyle = '#1d4fa3';
  g.beginPath();
  g.moveTo(0, 38); g.lineTo(128, 58); g.lineTo(256, 38); g.lineTo(256, 92); g.lineTo(128, 112); g.lineTo(0, 92);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 34px Arial Black, Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const x of [64, 192]) g.fillText('IRN BREW', x, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  canMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.5, emissive: 0x401800, emissiveIntensity: 0.6 });
  return canMat;
}

/**
 * A giant can of IRN BREW floating over the road. Drive through it for a few seconds of
 * sugar-powered boost (it works with or without an engine).
 */
export function brewCan(s: number, u: number) {
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
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.6, depthWrite: false }));
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
      tr.boost(BREW_BOOST);
      G.sfx.fizz();
      G.fx.sparkle(g.position.clone(), 22);
      G.fx.splash(g.position.clone(), 0xf26a1b, 24);
      G.scoring.award('IRN BREW!', 250, g.position.clone().add(new THREE.Vector3(0, 1, 0)), true, 'brew');
      G.commentary.say('brew', true);
      G.shake(0.4);
    }
  });
}
