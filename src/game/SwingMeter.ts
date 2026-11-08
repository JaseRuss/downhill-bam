/**
 * Classic three-click golf swing:
 *  1st click starts the backswing (marker runs right),
 *  2nd click locks power (past 100% = overcooked),
 *  3rd click on the way back sets accuracy (hit the green sweet spot).
 */
export type SwingResult = { power: number; accuracy: number; shank: boolean };

const SWEET = 0.08; // marker position of the sweet spot (fraction of bar)
const MAXP = 1.1;

export class SwingMeter {
  el = document.getElementById('swing')!;
  marker = this.el.querySelector('.marker') as HTMLElement;
  powerEl = this.el.querySelector('.power') as HTMLElement;
  sweet = this.el.querySelector('.sweet') as HTMLElement;
  label = this.el.querySelector('.label') as HTMLElement;
  phase: 'idle' | 'up' | 'down' | 'done' = 'idle';
  pos = SWEET;
  power = 0;
  result: SwingResult | null = null;

  show(on: boolean) {
    this.el.style.display = on ? 'block' : 'none';
  }

  reset() {
    this.phase = 'idle';
    this.pos = SWEET;
    this.power = 0;
    this.result = null;
    this.powerEl.style.display = 'none';
    this.label.textContent = 'CLICK / SPACE to start your swing';
    this.setSweet(0.035);
    this.render();
  }

  private setSweet(w: number) {
    this.sweet.style.left = `${((SWEET - w) / MAXP) * 100}%`;
    this.sweet.style.width = `${((2 * w) / MAXP) * 100}%`;
  }

  /** Returns true when the swing is complete. */
  update(dt: number, click: boolean): boolean {
    switch (this.phase) {
      case 'idle':
        if (click) {
          this.phase = 'up';
          this.label.textContent = 'CLICK to set POWER';
        }
        break;
      case 'up':
        this.pos += dt * 0.95;
        if (click || this.pos >= MAXP) {
          this.pos = Math.min(this.pos, MAXP);
          this.power = Math.max(0.05, (this.pos - SWEET) / (1 - SWEET));
          this.phase = 'down';
          this.powerEl.style.display = 'block';
          this.powerEl.style.left = `${(this.pos / MAXP) * 100}%`;
          this.label.textContent = 'CLICK in the GREEN for accuracy';
          if (this.power > 1) this.setSweet(0.02); // overcooked: tighter window
        }
        break;
      case 'down':
        this.pos -= dt * 1.35;
        if (click || this.pos <= -0.06) {
          const shank = this.pos <= -0.06;
          const acc = shank ? -0.2 : this.pos - SWEET;
          this.result = { power: Math.min(1.12, this.power), accuracy: acc, shank };
          this.phase = 'done';
          return true;
        }
        break;
    }
    this.render();
    return false;
  }

  private render() {
    this.marker.style.left = `${(Math.max(-0.06, this.pos) / MAXP) * 100}%`;
  }
}
