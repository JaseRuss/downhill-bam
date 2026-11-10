import * as THREE from 'three';

const $ = (id: string) => document.getElementById(id)!;

interface Pop {
  el: HTMLElement;
  pos: THREE.Vector3;
  t: number;
  max: number;
}

export class HUD {
  score = $('score');
  combo = $('combo');
  speed = $('speed');
  hops = $('hops');
  progress = $('progress');
  popups = $('popups');
  bamEl = $('bam');
  fps = $('fps');
  tracker = $('tracker');
  private trackTimer = 0;
  private pops: Pop[] = [];
  private bamTimer = 0;
  private marks: { el: HTMLElement; s: number }[] = [];

  constructor(public camera: THREE.PerspectiveCamera) {}

  showRunHud(on: boolean) {
    for (const el of [this.score, this.speed, this.hops, this.progress]) el.style.display = on ? '' : 'none';
    if (!on) this.combo.textContent = '';
  }

  setMarks(list: { s: number }[], sMin: number, sMax: number) {
    for (const m of this.marks) m.el.remove();
    this.marks = list.map((x) => {
      const el = document.createElement('div');
      el.className = 'mark';
      el.style.left = `${((x.s - sMin) / (sMax - sMin)) * 100}%`;
      this.progress.appendChild(el);
      return { el, s: x.s };
    });
  }

  setScore(v: number) {
    (this.score.querySelector('span') as HTMLElement).textContent = v.toLocaleString();
  }

  setCombo(mult: number, count: number) {
    if (count < 3) {
      this.combo.textContent = '';
      return;
    }
    this.combo.textContent = `${count} HIT COMBO  ×${mult.toFixed(1)}`;
    this.combo.style.transform = 'scale(1.25)';
    setTimeout(() => (this.combo.style.transform = 'scale(1)'), 90);
  }

  setRun(speedMs: number, hops: number, hopCharge: number, ejected: boolean, s: number, sMin: number, sMax: number, chasing = false, engine = '') {
    (this.speed.querySelector('span') as HTMLElement).textContent = Math.round(speedMs * 2.237).toString();
    let txt: string;
    if (ejected) txt = chasing ? 'HAMISH IS GIVING CHASE!' : 'NO DRIVER!';
    else if (hops > 0) txt = `HOP: ${'●'.repeat(hops)}`;
    else if (hopCharge > 0) txt = `HOP: ○ back in ${Math.ceil(hopCharge)}s`;
    else txt = 'HOP: ○';
    this.hops.textContent = engine ? `${txt}  ·  ${engine}` : txt;
    const k = Math.min(1, Math.max(0, (s - sMin) / (sMax - sMin)));
    (this.progress.querySelector('.fill') as HTMLElement).style.width = `${k * 100}%`;
    for (const m of this.marks) m.el.classList.toggle('done', m.s < s);
  }

  popup(text: string, pos: THREE.Vector3, size: '' | 'big' | 'huge' = '') {
    const el = document.createElement('div');
    el.className = `pop ${size}`;
    el.textContent = text;
    this.popups.appendChild(el);
    this.pops.push({ el, pos: pos.clone(), t: 0, max: size ? 1.8 : 1.2 });
    if (this.pops.length > 24) this.killPop(0);
  }

  private killPop(i: number) {
    this.pops[i].el.remove();
    this.pops.splice(i, 1);
  }

  /** The side-objective tracker: slides in at the side, shows the bar, fades after a few seconds. */
  track(name: string, how: string, cur: number, max: number) {
    const done = cur >= max;
    this.tracker.innerHTML = `<small>${done ? 'KIT BAG · UNLOCKED!' : 'KIT BAG'}</small><b>${name}</b><span>${how}</span><div class="meter"><div style="width:${(cur / max) * 100}%"></div></div><i>${cur} / ${max}</i>`;
    this.tracker.classList.toggle('done', done);
    this.tracker.classList.add('show');
    this.trackTimer = done ? 5 : 3.5;
  }

  bam(text = 'BAM!') {
    this.bamEl.textContent = text;
    this.bamEl.classList.add('show');
    this.bamTimer = 0.7;
  }

  update(dt: number) {
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t > p.max) {
        this.killPop(i);
        continue;
      }
      v.copy(p.pos);
      v.y += p.t * 1.2;
      v.project(this.camera);
      if (v.z > 1) {
        p.el.style.display = 'none';
        continue;
      }
      p.el.style.display = '';
      p.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      p.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
      p.el.style.opacity = `${Math.min(1, (p.max - p.t) * 3)}`;
      const sc = p.t < 0.12 ? 0.6 + p.t * 4 : 1;
      p.el.style.transform = `translate(-50%,-50%) scale(${sc})`;
    }
    if (this.trackTimer > 0) {
      this.trackTimer -= dt;
      if (this.trackTimer <= 0) this.tracker.classList.remove('show');
    }
    if (this.bamTimer > 0) {
      this.bamTimer -= dt;
      if (this.bamTimer <= 0) this.bamEl.classList.remove('show');
    }
  }

  clear() {
    while (this.pops.length) this.killPop(0);
    this.bamEl.classList.remove('show');
    this.tracker.classList.remove('show');
    this.trackTimer = 0;
  }
}
