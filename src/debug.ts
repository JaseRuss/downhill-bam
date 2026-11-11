import * as THREE from 'three';
import { G } from './ctx';
import * as Road from './world/Road';
import { GOALS } from './game/Career';
import { VEHICLE_ORDER } from './vehicle/Vehicles';

/**
 * Test helpers for driving the game from the console (enabled with ?debug in the URL).
 * Frames are stepped by hand so tests work even when the tab is in the background.
 */
export function installDebug(game: any) {
  const w = window as any;
  /** Step n frames by hand (pauses the live loop); only the last one is drawn. */
  const F = (n = 1) => {
    w.__paused = true;
    for (let i = 0; i < n; i++) {
      game.skipRender = i < n - 1;
      game.update(1 / 60);
    }
    game.skipRender = false;
  };
  const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const press = (code = 'Space') => {
    key(code, true);
    key(code, false);
  };
  const ru = () => {
    const p = G.trolley.position;
    return Road.toRoad(p.x, p.z);
  };
  const hd = () => {
    const v = G.trolley.velocity;
    const s = ru().s;
    return Math.atan2(v.dot(Road.right(s)), v.dot(Road.forward(s)));
  };
  const launchOnly = (power = 0.97) => {
    game.restart(true);
    F(10);
    press();
    F(1);
    let guard = 0;
    while (game.swing.pos < power && guard++ < 500) F(1);
    press();
    F(1);
    guard = 0;
    while (game.swing.pos > 0.095 && guard++ < 500) F(1);
    press();
    F(1);
  };
  /** Pretend the career has got this far (tier 1-4) and pick a vehicle, then rebuild. */
  const setCareer = (tier = 4, vehicle = 'buggy') => {
    const d = game.career.data;
    d.goals = GOALS.filter((g) => !g.tier || g.tier <= tier).filter((g) => (g.tier ?? 9) <= tier).map((g) => g.id);
    d.vehicles = VEHICLE_ORDER.slice();
    d.vehicle = vehicle;
    game.career.save();
    game.toTitle();
    return `tier ${game.career.tier}, built tier ${game.tier}, ${game.vehicle}, S_MAX ${Road.S_MAX.toFixed(0)}`;
  };
  // a route that visits every set piece
  const plan: [number, number][] = [[-20, 0], [30, 1.0], [60, 0], [80, -2], [100, -1], [136, 5], [148, 9.3], [162, 6.5], [200, 7.4], [215, 0], [222, -2], [232, 0], [270, -3.5], [300, -4.2], [320, 0], [336, 5], [350, 9.0], [370, 0], [440, 0], [470, 8.0], [484, 8.0], [500, 0], [600, 0], [700, 0]];
  // the long course: middle of the road, left of the tram, slaloming the Leith Walk closures
  const longU = (s: number) => {
    const M = Road.MARKS;
    if (s < Road.JOIN_S) return s > 30 && s < 60 ? 1.0 : 0;
    const a = M.leithwalk + 22;
    if (s > a - 14 && s < M.foot - 10) {
      const i = Math.floor((s - (a - 14)) / 44);
      const side = i % 2 ? 1 : -1;
      return -side * 2.6;
    }
    if (s > M.ksr && s < M.lothian) return 1.6; // the parked cars are on the left
    if (s > M.princes && s < M.eastend) return -1.2; // the tram's on the right
    return 0;
  };
  const targetU = (s: number) => {
    if (Road.COURSE !== 'royalmile') return longU(s);
    for (let i = 0; i < plan.length - 1; i++) {
      const [s0, u0] = plan[i], [s1, u1] = plan[i + 1];
      if (s >= s0 && s < s1) return u0 + ((u1 - u0) * (s - s0)) / (s1 - s0);
    }
    return 0;
  };
  let held: string | null = null;
  /** Steer along the planned line for n frames (no relaunch). Returns a log. */
  const drive = (frames: number, hopAt: [number, string][] = []) => {
    const out: string[] = [];
    let last = 0;
    const hops = hopAt.slice();
    for (let f = 0; f < frames; f++) {
      const { s, u } = ru();
      const want = targetU(s + 6);
      const steer = Math.max(-1, Math.min(1, (want - u) * 0.35 - hd() * 2.2));
      const code = steer > 0.25 ? 'KeyD' : steer < -0.25 ? 'KeyA' : null;
      if (code !== held) {
        if (held) key(held, false);
        if (code) key(code, true);
        held = code;
      }
      if (hops.length && s > hops[0][0]) {
        press('Space');
        out.push(`hop at s=${s.toFixed(1)} for ${hops[0][1]} (hops left ${G.trolley.hops})`);
        hops.shift();
      }
      F(1);
      if (f - last >= 120) {
        last = f;
        const t = G.trolley;
        out.push(`${(game.runT).toFixed(0)}s s=${s.toFixed(0)} u=${u.toFixed(1)} want=${want.toFixed(1)} sp=${t.speed.toFixed(1)} ej=${t.ejected} eng=${t.engineOn} score=${G.scoring.score}`);
      }
      if (game.state !== 'run') {
        out.push(`state ${game.state} at s=${s.toFixed(0)}`);
        break;
      }
    }
    if (held) key(held, false);
    held = null;
    return out.join('\n');
  };
  const autopilot = (secs = 90, hopAt: [number, string][] = [], power = 0.97) => {
    launchOnly(power);
    const log = drive(secs * 60, hopAt);
    return log + '\n' + JSON.stringify([...G.scoring.log.values()].map((i) => `${i.label} x${i.count}`));
  };
  /**
   * Render cost: whole-scene totals (meshes, triangles, geometry memory) and what a camera looking
   * down the street draws at each of a few points along the course.
   */
  const stats = (points = 8) => {
    const scene = G.scene, r = game.renderer;
    const seen = new Set<any>();
    let meshes = 0, tris = 0, bytes = 0, sMeshes = 0, sTris = 0, sBytes = 0;
    scene.traverse((o: any) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      tris += n * (o.isInstancedMesh ? o.count : 1);
      if (seen.has(g)) return;
      seen.add(g);
      let b = g.index ? g.index.array.byteLength : 0;
      for (const k in g.attributes) b += g.attributes[k].array.byteLength;
      bytes += b;
      // the merged static scenery (buildings, landmarks) on its own
      if (o.userData.batch) { sMeshes++; sTris += n; sBytes += b; }
    });
    // painted textures in use: every distinct image behind a material in the scene
    const images = new Map<string, number>();
    scene.traverse((o: any) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k of ['map', 'emissiveMap']) {
          const t = m?.[k];
          const img = t?.source?.data;
          if (img?.width) images.set(t.source.uuid, img.width * img.height * 4 * (t.generateMipmaps ? 4 / 3 : 1));
        }
      }
    });
    let texBytes = 0;
    for (const b of images.values()) texBytes += b;
    const cam = G.camera.clone();
    const views: string[] = [];
    let calls = 0, drawn = 0, worst = 0;
    for (let i = 0; i < points; i++) {
      const s = Road.START_S + ((Road.FINISH_S - Road.START_S) * (i + 0.5)) / points;
      cam.position.copy(Road.toWorld(s, 0, 3.2));
      cam.lookAt(Road.toWorld(s + 14, 0, 1.5));
      cam.updateMatrixWorld(true);
      r.render(scene, cam);
      const c = r.info.render.calls, t = r.info.render.triangles;
      calls += c; drawn += t; worst = Math.max(worst, c);
      views.push(`s=${s.toFixed(0)}: ${c} calls, ${(t / 1000).toFixed(0)}k tris`);
    }
    return {
      course: Road.COURSE, tier: game.tier, meshes, sceneTris: Math.round(tris), geometries: r.info.memory.geometries, textures: r.info.memory.textures,
      geometryMB: +(bytes / 1048576).toFixed(1),
      images: images.size, imageMB: +(texBytes / 1048576).toFixed(1),
      staticMeshes: sMeshes, staticTris: Math.round(sTris), staticMB: +(sBytes / 1048576).toFixed(1), avgCalls: Math.round(calls / points), worstCalls: worst, avgDrawnTris: Math.round(drawn / points), views,
    };
  };
  Object.assign(w, { F, key, press, ru, hd, launchOnly, drive, autopilot, setCareer, stats, Road, game, __THREE: THREE });
}
