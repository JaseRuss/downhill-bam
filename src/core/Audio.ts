/** All sound is synthesised with Web Audio, so there are no asset files. */
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private noise!: AudioBuffer;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private impactTimes: number[] = [];

  unlock() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // continuous cobble rumble, driven by speed
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 200;
    this.rollFilter.Q.value = 0.8;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    src.start();
  }

  private get t() {
    return this.ctx!.currentTime;
  }

  private burst(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002, freqEnd?: number, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0, attack = 0.005) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private allowImpact() {
    const now = performance.now();
    this.impactTimes = this.impactTimes.filter((x) => now - x < 1000);
    if (this.impactTimes.length > 14) return false;
    this.impactTimes.push(now);
    return true;
  }

  impact(strength: number, kind: 'wood' | 'stone' | 'glass' | 'metal' | 'soft') {
    if (!this.ctx || !this.allowImpact()) return;
    const s = Math.max(0.15, Math.min(1, strength));
    switch (kind) {
      case 'wood':
        this.burst(0.18, 'bandpass', 380 + Math.random() * 200, 2.5, 0.6 * s);
        this.tone('triangle', 180 + Math.random() * 60, 90, 0.12, 0.25 * s);
        break;
      case 'stone':
        this.burst(0.35, 'lowpass', 900, 0.7, 0.8 * s, 0.002, 180);
        this.tone('sine', 90, 40, 0.3, 0.4 * s);
        break;
      case 'metal':
        this.burst(0.08, 'highpass', 2000, 1, 0.3 * s);
        for (const f of [523, 1187, 1790]) this.tone('sine', f * (0.95 + Math.random() * 0.1), f * 0.98, 0.7, 0.1 * s);
        break;
      case 'glass':
        this.glass(s);
        break;
      case 'soft':
        this.burst(0.15, 'lowpass', 500, 1, 0.5 * s);
        break;
    }
  }

  glass(s = 1) {
    if (!this.ctx) return;
    this.burst(0.5, 'highpass', 3000, 0.7, 0.45 * s);
    for (let i = 0; i < 7; i++) this.tone('sine', 2500 + Math.random() * 3500, 2000 + Math.random() * 2000, 0.25, 0.06, Math.random() * 0.35);
  }

  crunch(s = 1) {
    this.burst(0.6, 'lowpass', 1400, 0.6, 0.9 * s, 0.003, 120);
    this.tone('sine', 70, 30, 0.6, 0.6 * s);
  }

  boing() {
    if (!this.ctx) return;
    const o = this.tone('sine', 180, 520, 0.45, 0.35);
    if (o) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 18;
      const lg = this.ctx.createGain();
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      lfo.start();
      lfo.stop(this.t + 0.5);
    }
  }

  oof() {
    this.tone('triangle', 260, 120, 0.28, 0.35);
    this.burst(0.2, 'bandpass', 700, 3, 0.25);
  }

  whoosh() {
    this.burst(0.5, 'bandpass', 400, 1.5, 0.5, 0.15, 2000);
  }

  swingTick() {
    this.tone('square', 900, 900, 0.05, 0.08);
  }

  clubHit(power: number) {
    this.burst(0.12, 'highpass', 1800, 1, 0.8);
    this.tone('sine', 1300, 600, 0.15, 0.4);
    this.tone('triangle', 160, 60, 0.3, 0.5 * power);
  }

  cannon() {
    this.burst(1.6, 'lowpass', 1200, 0.5, 1.0, 0.002, 60);
    this.tone('sine', 80, 25, 1.2, 0.9);
  }

  bam() {
    this.burst(0.5, 'lowpass', 3000, 0.5, 0.9, 0.001, 200);
    this.tone('square', 110, 55, 0.35, 0.3);
  }

  coin(pitch = 1) {
    this.tone('square', 988 * pitch, 988 * pitch, 0.07, 0.07);
    this.tone('square', 1319 * pitch, 1319 * pitch, 0.18, 0.07, 0.07);
  }

  cheer(len = 2.5) {
    this.burst(len, 'bandpass', 1100, 0.6, 0.35, len * 0.25);
    this.burst(len * 0.8, 'bandpass', 2200, 1.2, 0.18, len * 0.2, undefined, 0.1);
  }

  /** The bagpipes deflating. Very sad. */
  sadPipes() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0, t);
    out.gain.linearRampToValueAtTime(0.18, t + 0.05);
    out.gain.setValueAtTime(0.18, t + 1.6);
    out.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    out.connect(f).connect(this.master);
    const mk = (f0: number, f1: number, vib: number) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.setValueAtTime(f0, t + 0.6);
      o.frequency.exponentialRampToValueAtTime(f1, t + 3.1);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lg = ctx.createGain();
      lg.gain.value = vib;
      lfo.connect(lg).connect(o.frequency);
      o.connect(out);
      o.start(t); lfo.start(t);
      o.stop(t + 3.3); lfo.stop(t + 3.3);
    };
    mk(110, 70, 0.5);
    mk(220, 140, 0.8);
    mk(659, 300, 9);
  }

  /** A cartoon "WAAAAH" as somebody sails through the air. pitch 0 = a mime (silence). */
  scream(pitch = 1) {
    if (!this.ctx || pitch <= 0) return;
    const ctx = this.ctx, t = this.t;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 330 * pitch;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.9, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 1.1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = f0 * 0.06;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.05);
    g.gain.setValueAtTime(0.16, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.2);
    lfo.stop(t + 1.2);
  }

  seagull() {
    for (let i = 0; i < 3; i++) {
      this.tone('triangle', 1500, 950, 0.22, 0.12, i * 0.27);
      this.tone('sawtooth', 1520, 970, 0.2, 0.03, i * 0.27);
    }
  }

  /** Pull-cord, two coughs, then it catches. */
  engineStart(kind: string) {
    if (!this.ctx) return;
    const base = kind === 'blower' ? 1.6 : kind === 'gritter' ? 0.5 : kind === 'buggy' ? 0.75 : 1;
    this.burst(0.35, 'bandpass', 900, 2, 0.25, 0.01, 300);
    this.tone('sawtooth', 70 * base, 40 * base, 0.18, 0.22, 0.45);
    this.tone('sawtooth', 75 * base, 38 * base, 0.18, 0.22, 0.8);
    this.burst(0.15, 'lowpass', 400, 1, 0.3, 0.005, 120, 0.8);
    this.tone('sawtooth', 60 * base, 95 * base, 0.5, 0.25, 1.15);
  }

  private hum: { o: OscillatorNode; o2: OscillatorNode; g: GainNode; f: BiquadFilterNode } | null = null;

  /** Continuous motor drone; pitch climbs with speed. */
  engineHum(on: boolean, speed: number, pitch = 1) {
    if (!this.ctx) return;
    if (!this.hum) {
      if (!on) return;
      const ctx = this.ctx;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator();
      o.type = 'sawtooth';
      o2.type = 'square';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.master);
      o.start();
      o2.start();
      this.hum = { o, o2, g, f };
    }
    const hz = (48 + speed * 7) * pitch;
    this.hum.o.frequency.setTargetAtTime(hz, this.t, 0.08);
    this.hum.o2.frequency.setTargetAtTime(hz * 0.503, this.t, 0.08);
    this.hum.f.frequency.setTargetAtTime(400 + speed * 60, this.t, 0.1);
    this.hum.g.gain.setTargetAtTime(on ? 0.07 : 0, this.t, 0.15);
  }

  splash() {
    this.burst(1.4, 'lowpass', 2400, 0.7, 0.8, 0.01, 200);
    this.burst(0.6, 'bandpass', 600, 1, 0.5, 0.005, 150, 0.05);
    this.tone('sine', 180, 40, 0.5, 0.3);
  }

  /** Nee-naw, nee-naw. */
  siren() {
    for (let i = 0; i < 3; i++) {
      this.tone('square', 960, 960, 0.34, 0.05, i * 0.72);
      this.tone('square', 720, 720, 0.34, 0.05, i * 0.72 + 0.36);
    }
  }

  /** Can cracked open, a big fizz, and a rising whoosh of sugar. */
  fizz() {
    this.burst(0.06, 'bandpass', 3200, 3, 0.5, 0.001);
    this.burst(1.3, 'highpass', 4000, 0.7, 0.35, 0.01, 7000, 0.05);
    this.tone('sawtooth', 180, 720, 0.9, 0.12, 0.1);
    this.tone('square', 360, 1440, 0.7, 0.05, 0.15);
  }

  /** Deep thud and rumble for the boot connecting. */
  rumble(power = 1) {
    this.tone('sine', 90, 28, 0.9, 0.55 * power);
    this.burst(0.8, 'lowpass', 300, 0.8, 0.6 * power, 0.005, 60);
  }

  rolling(speed: number, onGround: boolean) {
    if (!this.ctx) return;
    const target = onGround ? Math.min(0.45, speed * 0.025) : 0;
    this.rollGain.gain.setTargetAtTime(target, this.t, 0.05);
    this.rollFilter.frequency.setTargetAtTime(120 + speed * 22, this.t, 0.1);
  }
}
