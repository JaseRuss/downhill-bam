import { G } from './ctx';
import * as Road from './world/Road';

/**
 * Test helpers for driving the game from the console (enabled with ?debug in the URL).
 * Frames are stepped by hand so tests work even when the tab is in the background.
 */
export function installDebug(game: any) {
  const w = window as any;
  const F = (n = 1) => {
    for (let i = 0; i < n; i++) game.update(1 / 60);
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
    while (game.swing.pos > 0.1 && guard++ < 500) F(1);
    press();
    F(1);
    guard = 0;
    while (game.state === 'launching' && guard++ < 200) F(1);
  };
  // a route that visits every set piece
  const plan: [number, number][] = [[-20, 0], [30, 1.0], [60, 0], [80, -2], [100, -1], [136, 5], [148, 9.3], [162, 6.5], [200, 7.4], [215, 0], [222, -2], [232, 0], [270, -3.5], [300, -4.2], [320, 0], [336, 5], [350, 9.0], [370, 0], [440, 0], [470, 8.0], [484, 8.0], [500, 0], [600, 0], [700, 0]];
  const targetU = (s: number) => {
    for (let i = 0; i < plan.length - 1; i++) {
      const [s0, u0] = plan[i], [s1, u1] = plan[i + 1];
      if (s >= s0 && s < s1) return u0 + ((u1 - u0) * (s - s0)) / (s1 - s0);
    }
    return 0;
  };
  const autopilot = (secs = 90, hopAt: [number, string][] = [], power = 0.97, stopAt = Infinity) => {
    launchOnly(power);
    const out: string[] = [];
    let last = 0;
    const hops = hopAt.slice();
    let held: string | null = null;
    for (let f = 0; f < secs * 60; f++) {
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
        out.push(`${(f / 60).toFixed(0)}s s=${s.toFixed(0)} u=${u.toFixed(1)} want=${want.toFixed(1)} sp=${t.speed.toFixed(1)} ej=${t.ejected} score=${G.scoring.score}`);
      }
      if (s > stopAt) {
        out.push(`stopped at s=${s.toFixed(0)}`);
        break;
      }
      if (game.state !== 'run') {
        out.push(`state ${game.state} at s=${s.toFixed(0)}`);
        break;
      }
    }
    if (held) key(held, false);
    out.push(JSON.stringify([...G.scoring.log.values()].map((i) => `${i.label} x${i.count}`)));
    return out.join('\n');
  };
  Object.assign(w, { F, key, press, ru, hd, launchOnly, autopilot, Road });
}
