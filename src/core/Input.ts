/**
 * Keyboard + mouse on desktop; taps, on-screen buttons and tilt steering on phones.
 * "pressed" is true for one frame after the key (or button) goes down.
 */

const DEG = Math.PI / 180;
const SENS_KEY = 'downhillbam.tiltSens';

export type TiltState = 'off' | 'needs-permission' | 'on' | 'unavailable';

/**
 * Steering by tilting the phone like a steering wheel (in landscape). Works out where "up" is from
 * the deviceorientation angles (the same on every browser, unlike the raw accelerometer, whose
 * signs differ between iOS and Android) and measures the roll relative to a calibrated centre.
 *
 * Cheaper phones and tablets with only an accelerometer (no gyroscope) never send deviceorientation
 * readings. For those, "up" comes from the gravity in devicemotion's accelerationIncludingGravity
 * instead, smoothed to take out bumps. Orientation readings always win when there are any.
 */
export class Tilt {
  state: TiltState = 'off';
  /** Current roll in radians (+ = turned right), smoothed. */
  roll = 0;
  /** Where the readings come from: the orientation sensor, or the accelerometer fallback. */
  source: 'orientation' | 'motion' | null = null;
  private raw = 0;
  private neutral = 0;
  private seen = false;
  private listening = false;
  private gx = 0;
  private gy = 0;
  private gz = 0;
  sensitivity = 1;

  constructor() {
    try {
      const v = Number(localStorage.getItem(SENS_KEY));
      if (v >= 0.4 && v <= 2.5) this.sensitivity = v;
    } catch {}
    // always listening: where no permission is needed, readings just start arriving (and switch
    // tilt on); where it is (iOS), nothing arrives until the player has said yes
    this.listen();
  }

  get needsPermission() {
    const D = (window as any).DeviceOrientationEvent;
    return !!D && typeof D.requestPermission === 'function';
  }

  /** Start listening. On iOS this must be called from a tap (it asks the player's permission). */
  async enable(): Promise<TiltState> {
    const D = (window as any).DeviceOrientationEvent;
    if (!D) return (this.state = 'unavailable');
    if (this.needsPermission) {
      try {
        const r = await D.requestPermission();
        if (r !== 'granted') return (this.state = 'unavailable');
      } catch {
        return (this.state = 'needs-permission');
      }
    }
    if (this.seen) return (this.state = 'on');
    // no readings at all after a second or so? there's no sensor (or it's blocked)
    await new Promise((r) => setTimeout(r, 1500));
    if (!this.seen) this.state = 'unavailable';
    return this.state;
  }

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
    window.addEventListener('devicemotion', (e) => this.onMotion(e));
  }

  /** Feed a reading (also used by tests). */
  onOrientation(e: { beta: number | null; gamma: number | null }) {
    if (e.beta === null || e.gamma === null) return;
    this.seen = true;
    this.source = 'orientation';
    if (this.state !== 'on') this.state = 'on';
    const b = e.beta * DEG, g = e.gamma * DEG;
    // world "up" in the device's own axes (x = right edge, y = top edge, z = out of the screen)
    this.setUp(-Math.cos(b) * Math.sin(g), Math.sin(b));
  }

  /** Accelerometer fallback, used only while no orientation readings have arrived. */
  onMotion(e: { accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null } | null }) {
    if (this.source === 'orientation') return;
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    // At rest this points straight up (per the spec, which Android follows); iOS reports it the
    // other way round. iOS devices all have gyroscopes, so this is only a safety net there.
    const k = IOS ? -1 : 1;
    let x = a.x * k, y = a.y * k, z = a.z * k;
    const n = Math.hypot(x, y, z);
    if (n < 4 || n > 16) return; // mid-bump or freefall: not a usable gravity reading
    x /= n; y /= n; z /= n;
    // low-pass filter so a jolt doesn't yank the steering (events arrive ~60 times a second)
    const f = this.source === 'motion' ? 0.2 : 1;
    this.gx += (x - this.gx) * f;
    this.gy += (y - this.gy) * f;
    this.gz += (z - this.gz) * f;
    this.seen = true;
    this.source = 'motion';
    if (this.state !== 'on') this.state = 'on';
    this.setUp(this.gx, this.gy);
  }

  /** Turn world "up" (in the device's x/y axes) into the roll angle on screen. */
  private setUp(ux: number, uy: number) {
    // in landscape the screen's up is along the device's x axis: which way depends on how it's held
    const ang = screenAngle();
    let s = ang === 90 ? 1 : ang === 270 || ang === -90 ? -1 : Math.sign(ux) || 1;
    if (ang === 0 || ang === 180) s = Math.sign(ux) || 1;
    const sx = -s * uy; // up, measured along the screen's right
    const sy = s * ux; // up, measured along the screen's up
    this.raw = Math.atan2(sx, sy);
  }

  /** Make the way the phone is held right now "straight ahead". */
  calibrate() {
    this.neutral = this.raw;
    this.roll = 0;
  }

  update(dt: number) {
    let d = this.raw - this.neutral;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    // world up leaning to the screen's left = the phone turned right
    this.roll += (-d - this.roll) * Math.min(1, dt * 14);
  }

  /** Steering, -1 (left) .. 1 (right), with a small dead zone round the centre. */
  get steer() {
    if (this.state !== 'on') return 0;
    const range = (24 * DEG) / this.sensitivity;
    const dead = 2.5 * DEG;
    const r = this.roll;
    if (Math.abs(r) < dead) return 0;
    return Math.max(-1, Math.min(1, (r - Math.sign(r) * dead) / (range - dead)));
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    try {
      localStorage.setItem(SENS_KEY, String(v));
    } catch {}
  }
}

const IOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

function screenAngle() {
  const o = (screen as any).orientation;
  if (o && typeof o.angle === 'number') return ((o.angle % 360) + 360) % 360;
  const w = (window as any).orientation;
  return typeof w === 'number' ? ((w % 360) + 360) % 360 : 0;
}

export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private clickedFlag = false;
  tilt = new Tilt();

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedSet.add(e.code);
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    // mouse clicks and screen taps on the game itself
    target.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.clickedFlag = true;
    });
  }

  /** Hold or release a virtual key (on-screen buttons). */
  hold(code: string, on: boolean) {
    if (on) {
      if (!this.down.has(code)) this.pressedSet.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  /** Tap a virtual key for one frame. */
  tap(code: string) {
    this.pressedSet.add(code);
  }

  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  pressed(...codes: string[]) {
    return codes.some((c) => this.pressedSet.has(c));
  }

  /** Space, left click or a tap this frame. */
  action() {
    return this.clickedFlag || this.pressedSet.has('Space') || this.pressedSet.has('Enter');
  }

  get steer() {
    const keys = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    if (keys) return keys;
    return this.tilt.steer;
  }

  update(dt: number) {
    this.tilt.update(dt);
  }

  endFrame() {
    this.pressedSet.clear();
    this.clickedFlag = false;
  }
}
