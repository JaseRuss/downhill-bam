import { PLATFORM } from '../core/Platform';
import type { Input } from '../core/Input';

/**
 * The phone version's extra UI: a HOP button, left/right buttons when tilt isn't available, a
 * "turn your phone sideways" screen, tilt settings on the title screen, fullscreen on Android and
 * a buzz on big hits. Does nothing on desktop.
 */
export class MobileUI {
  readonly on = PLATFORM.mobile;
  private touch!: HTMLElement;
  private steerBtns!: HTMLElement;
  private tiltInfo!: HTMLElement;
  private playing = false;
  private shown = '';

  constructor(private input: Input) {
    if (!this.on) return;
    document.body.classList.add('mobile');
    // no pinch-zoom, no double-tap zoom, no page bounce
    const vp = document.querySelector('meta[name=viewport]');
    vp?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    document.addEventListener('touchmove', (e) => {
      // the garage cards and the invoice still scroll
      if ((e.target as Element)?.closest?.('#garage, .invoice, #tiltInfo')) return;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    // touch controls: HOP on the right; steering buttons on the left only if tilt isn't working
    this.touch = el('div', 'touch', 'hud');
    this.steerBtns = el('div', 'steerBtns');
    const left = el('div', 'leftBtn', 'tbtn');
    left.textContent = '◀';
    const right = el('div', 'rightBtn', 'tbtn');
    right.textContent = '▶';
    this.steerBtns.append(left, right);
    const hop = el('div', 'hopBtn', 'tbtn');
    hop.textContent = 'HOP';
    this.touch.append(this.steerBtns, hop);
    document.body.appendChild(this.touch);
    holdButton(left, (on) => input.hold('KeyA', on));
    holdButton(right, (on) => input.hold('KeyD', on));
    hop.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.tap('Space');
      this.buzz(15);
    });

    // landscape only
    const rot = el('div', 'rotate');
    rot.innerHTML = '<div class="phone">📱</div><div>Turn your phone sideways to play</div>';
    document.body.appendChild(rot);

    // tilt status and settings on the title screen
    this.tiltInfo = el('div', 'tiltInfo');
    document.querySelector('#title .bottom')?.insertBefore(this.tiltInfo, document.getElementById('startBtn'));
    const keys = document.querySelector('#title .keys');
    if (keys) keys.innerHTML = 'Give your vehicle the Big Boot down the hill. Smash things. Score big.<br/><b>Tilt</b> to steer &nbsp;·&nbsp; <b>tap</b> to kick &nbsp;·&nbsp; <b>HOP</b> button to hop';
    const hint = document.getElementById('aimhint');
    if (hint) hint.innerHTML = 'Tilt to aim &nbsp;·&nbsp; TAP to wind up the Big Boot';
    // Android needs no permission: start listening straight away
    if (!input.tilt.needsPermission) input.tilt.enable().then(() => this.refresh());
    this.refresh();
    setInterval(() => this.refresh(), 1000);
  }

  /** Called from the PLAY tap: a real user gesture, so iOS will show its tilt permission prompt. */
  async onPlay() {
    if (!this.on) return;
    const t = this.input.tilt;
    if (t.state !== 'on') await t.enable();
    // fullscreen and a landscape lock where the browser allows it (Android; iOS ignores both)
    try {
      const d: any = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen) await d.requestFullscreen({ navigationUI: 'hide' });
      await (screen as any).orientation?.lock?.('landscape');
    } catch {}
    this.refresh();
  }

  /** Show the in-run controls (aiming and driving only). */
  setPlaying(on: boolean) {
    if (!this.on || this.playing === on) return;
    this.playing = on;
    this.refresh();
  }

  buzz(ms: number) {
    if (this.on && navigator.vibrate) navigator.vibrate(ms);
  }

  private refresh() {
    if (!this.on) return;
    const t = this.input.tilt;
    this.touch.style.display = this.playing ? 'block' : 'none';
    this.steerBtns.style.display = t.state === 'on' ? 'none' : 'flex';
    if (this.shown === t.state) return;
    this.shown = t.state;
    const pct = Math.round(t.sensitivity * 100);
    let status: string;
    if (t.state === 'on') status = '🎮 Tilt steering ON';
    else if (t.state === 'unavailable') status = 'No tilt sensor: steer with the ◀ ▶ buttons';
    else if (t.needsPermission) status = 'Tilt steering switches on when you press PLAY';
    else status = 'Starting tilt…';
    this.tiltInfo.innerHTML = `<span>${status}</span>` + (t.state === 'on' ? ` &nbsp;<label>sensitivity <input id="sens" type="range" min="50" max="200" step="10" value="${pct}"/></label>` : '');
    const sens = this.tiltInfo.querySelector('#sens') as HTMLInputElement | null;
    if (sens) sens.oninput = () => t.setSensitivity(Number(sens.value) / 100);
  }
}

function el(tag: string, id: string, cls = '') {
  const e = document.createElement(tag);
  e.id = id;
  if (cls) e.className = cls;
  return e;
}

function holdButton(b: HTMLElement, set: (on: boolean) => void) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    b.setPointerCapture?.(e.pointerId);
    b.classList.add('down');
    set(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    b.addEventListener(ev, () => {
      b.classList.remove('down');
      set(false);
    });
  }
}
