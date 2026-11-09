import { PLATFORM } from '../core/Platform';

const CLICK = PLATFORM.mobile ? 'TAP' : 'CLICK';
const START = PLATFORM.mobile ? 'TAP' : 'CLICK / SPACE';

/**
 * Three-click swing, drawn as an arc that follows the giant boot:
 *  1st click starts the backswing (the boot swings up and back),
 *  2nd click locks power (past 100% = overcooked),
 *  3rd click on the way down sets accuracy (hit the green, right where the boot meets the trolley).
 */
export type SwingResult = { power: number; accuracy: number; shank: boolean };

export const SWEET = 0.08; // meter position of the sweet spot
export const MAXP = 1.1;
const MINP = -0.06;
/** Backswing angle of the boot at full meter (radians). */
const A_MAX = 2.05;

/** Boot angle for a meter position (0 = hanging down at the trolley, + = swung back). */
export function angleOf(pos: number) {
  return ((pos - SWEET) / (MAXP - SWEET)) * A_MAX;
}

type Pt = { x: number; y: number } | null;
const NS = 'http://www.w3.org/2000/svg';
const SEGS = 40;

function lerpHex(a: number, b: number, t: number) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Bar colour at a meter position (same bands as the old straight bar). */
function bandColor(p: number) {
  if (p < SWEET) return '#33aa88';
  if (p > 1) return p > 1.05 ? '#aa0000' : '#dd2222';
  const k = (p - SWEET) / (1 - SWEET);
  if (k < 0.7) return lerpHex(0xdddddd, 0xf0d060, k / 0.7);
  return lerpHex(0xf0d060, 0xf08030, (k - 0.7) / 0.3);
}

export class SwingMeter {
  el = document.getElementById('swing')!;
  svg = document.getElementById('swingArc') as unknown as SVGSVGElement;
  label = this.el.querySelector('.label') as HTMLElement;
  phase: 'idle' | 'up' | 'down' | 'done' = 'idle';
  pos = SWEET;
  power = 0;
  powerPos = -1;
  result: SwingResult | null = null;
  private sweetW = 0.035;
  private outline: SVGPathElement;
  private segs: SVGPathElement[] = [];
  private sweet: SVGPathElement;
  private powerTick: SVGLineElement;
  private marker: SVGGElement;

  constructor() {
    const mk = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      this.svg.appendChild(e);
      return e;
    };
    this.outline = mk('path', { fill: 'none', stroke: '#fff', 'stroke-width': '30', 'stroke-linecap': 'round', opacity: '0.95' });
    for (let i = 0; i < SEGS; i++) {
      const p = MINP + ((MAXP - MINP) * (i + 0.5)) / SEGS;
      this.segs.push(mk('path', { fill: 'none', stroke: bandColor(p), 'stroke-width': '22', 'stroke-linecap': 'butt' }));
    }
    this.sweet = mk('path', { fill: 'none', stroke: 'rgba(0,255,120,0.85)', 'stroke-width': '34', 'stroke-linecap': 'butt' });
    this.powerTick = mk('line', { stroke: '#d7263d', 'stroke-width': '6', 'stroke-linecap': 'round' });
    this.marker = mk('g', {});
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('r', '15');
    ring.setAttribute('fill', '#111');
    ring.setAttribute('stroke', '#fff');
    ring.setAttribute('stroke-width', '4');
    this.marker.appendChild(ring);
    const t = document.createElementNS(NS, 'text');
    t.textContent = '👢';
    t.setAttribute('font-size', '18');
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    this.marker.appendChild(t);
  }

  show(on: boolean) {
    this.el.style.display = on ? 'block' : 'none';
    this.svg.style.display = on ? 'block' : 'none';
  }

  /** Only the text, with the arc hidden (while aiming from behind). */
  showLabelOnly() {
    this.el.style.display = 'block';
    this.svg.style.display = 'none';
  }

  reset() {
    this.phase = 'idle';
    this.pos = SWEET;
    this.power = 0;
    this.powerPos = -1;
    this.result = null;
    this.sweetW = 0.035;
    this.label.textContent = `${START} to start your swing`;
  }

  /** Returns true when the swing is complete. */
  update(dt: number, click: boolean): boolean {
    switch (this.phase) {
      case 'idle':
        if (click) {
          this.phase = 'up';
          this.label.textContent = `${CLICK} to set POWER`;
        }
        break;
      case 'up':
        this.pos += dt * 0.95;
        if (click || this.pos >= MAXP) {
          this.pos = Math.min(this.pos, MAXP);
          this.power = Math.max(0.05, (this.pos - SWEET) / (1 - SWEET));
          this.powerPos = this.pos;
          this.phase = 'down';
          this.label.textContent = `${CLICK} in the GREEN as the boot comes down`;
          if (this.power > 1) this.sweetW = 0.02; // overcooked: tighter window
        }
        break;
      case 'down':
        // the boot gathers speed as it falls
        this.pos -= dt * (1.0 + Math.max(0, this.powerPos - this.pos) * 0.6);
        if (click || this.pos <= MINP) {
          const shank = this.pos <= MINP;
          const acc = shank ? -0.2 : this.pos - SWEET;
          this.result = { power: Math.min(1.12, this.power), accuracy: acc, shank };
          this.phase = 'done';
          return true;
        }
        break;
    }
    return false;
  }

  /** Redraw the arc. `proj` maps a meter position to a screen point (null if off-screen). */
  draw(proj: (pos: number) => Pt, hip: Pt) {
    const path = (p0: number, p1: number, n: number) => {
      let d = '';
      for (let i = 0; i <= n; i++) {
        const q = proj(p0 + ((p1 - p0) * i) / n);
        if (!q) continue;
        d += `${d ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      }
      return d;
    };
    this.outline.setAttribute('d', path(MINP, MAXP, SEGS));
    for (let i = 0; i < SEGS; i++) {
      const a = MINP + ((MAXP - MINP) * i) / SEGS, b = MINP + ((MAXP - MINP) * (i + 1)) / SEGS;
      this.segs[i].setAttribute('d', path(a, b + 0.004, 2));
    }
    this.sweet.setAttribute('d', path(SWEET - this.sweetW, SWEET + this.sweetW, 4));
    if (this.powerPos >= 0) {
      const c = proj(this.powerPos);
      if (c && hip) {
        const dx = c.x - hip.x, dy = c.y - hip.y, l = Math.hypot(dx, dy) || 1;
        this.powerTick.setAttribute('x1', String(c.x - (dx / l) * 24));
        this.powerTick.setAttribute('y1', String(c.y - (dy / l) * 24));
        this.powerTick.setAttribute('x2', String(c.x + (dx / l) * 24));
        this.powerTick.setAttribute('y2', String(c.y + (dy / l) * 24));
        this.powerTick.style.display = '';
      }
    } else this.powerTick.style.display = 'none';
    const m = proj(Math.max(MINP, this.pos));
    if (m) this.marker.setAttribute('transform', `translate(${m.x.toFixed(1)},${m.y.toFixed(1)})`);
  }
}
