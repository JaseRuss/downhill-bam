import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game';
import { installDebug } from './debug';

async function boot() {
  await RAPIER.init();
  // wait for the fonts so canvas signs render with the right typefaces
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
  } catch {}
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  document.getElementById('loading')!.remove();
  if (location.search.includes('debug')) installDebug(game);
  let last = performance.now();
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    // the debug helpers can pause the live loop and step frames by hand
    if (!(window as any).__paused) game.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Something went wrong loading the game: ' + e.message;
});
