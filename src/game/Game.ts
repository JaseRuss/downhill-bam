import * as THREE from 'three';
import { G } from '../ctx';
import { Physics, STEP } from '../core/Physics';
import { Sfx } from '../core/Audio';
import { Input } from '../core/Input';
import { Fx } from '../core/Fx';
import { Destruction } from '../destruction/Destruction';
import { Terrain } from '../world/Terrain';
import { Trolley } from '../vehicle/Trolley';
import { Crowd } from '../props/Crowd';
import { HUD } from '../ui/HUD';
import { Scoring } from './Scoring';
import { Commentary } from './Commentary';
import { SwingMeter } from './SwingMeter';
import { CameraRig } from './CameraRig';
import { buildRoyalMile, Level } from '../level/RoyalMile';
import { bake } from '../world/Batcher';
import { Backdrop, HAAR } from '../world/Backdrop';
import { FINISH_S, START_S, toWorld, theta } from '../world/Road';
import * as Road from '../world/Road';

type State = 'title' | 'tour' | 'aim' | 'launching' | 'run' | 'ending' | 'results';

const BEST_KEY = 'downhillbam.best.royalmile';
const BAM_WORDS = ['BAM!', 'WALLOP!', 'SKELP!', 'BOOF!', 'CRASH!', 'KER-RANG!', 'SMASH!', 'OCH!'];

const $ = (id: string) => document.getElementById(id)!;

export class Game {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene!: THREE.Scene;
  input: Input;
  sfx = new Sfx();
  hud: HUD;
  commentary = new Commentary();
  swing = new SwingMeter();
  rig: CameraRig;
  level!: Level;
  sun!: THREE.DirectionalLight;
  arrow!: THREE.Mesh;
  backdrop!: Backdrop;

  state: State = 'title';
  stateT = 0;
  tourIdx = 0;
  aimOffset = 0;
  runT = 0;
  stopT = 0;
  finished = false;
  finishT = 0;
  acc = 0;
  freezeT = 0;
  slowT = 0;
  lastBig = -10;
  timeScale = 1;
  clubAngle = 0;
  clubTarget = 0;
  launchPower = 0;
  private frames = 0;
  private fpsT = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2600);
    this.input = new Input(canvas);
    this.hud = new HUD(this.camera);
    this.rig = new CameraRig(this.camera);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    $('startBtn').addEventListener('click', () => this.beginTour());
    $('retryBtn').addEventListener('click', () => this.restart(true));
    $('tourBtn').addEventListener('click', () => this.restart(false));

    this.build();
    this.setState('title');
    $('title').classList.add('show');
    (window as any).G = G;
    (window as any).game = this;
    (window as any).Road = Road;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ world
  build() {
    const scene = new THREE.Scene();
    const haar = HAAR.clone();
    scene.background = haar;
    scene.fog = new THREE.FogExp2(haar, 0.005);
    this.scene = scene;
    scene.add(new THREE.HemisphereLight(0xdfe7f0, 0x4f463c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.backdrop = new Backdrop(scene, new THREE.Vector3(-22, 48, -26));

    Object.assign(G, {
      scene,
      camera: this.camera,
      physics: new Physics(),
      sfx: this.sfx,
      commentary: this.commentary,
      rig: this.rig,
      updaters: [],
      time: 0,
      running: false,
      armed: false,
      shake: (a: number) => this.rig.shake(a),
      bigMoment: (s: number) => this.bigMoment(s),
    });
    G.fx = new Fx(scene);
    G.destruction = new Destruction(scene, G.physics);
    G.scoring = new Scoring(this.hud);
    G.crowd = new Crowd();
    G.terrain = new Terrain(scene, G.physics);
    G.trolley = new Trolley(scene, START_S, 0);
    this.level = buildRoyalMile();
    bake(scene);
    this.hud.setMarks(this.level.tour.slice(1), START_S, FINISH_S);

    // aim arrow
    const shape = new THREE.Shape();
    shape.moveTo(-0.18, 0); shape.lineTo(0.18, 0); shape.lineTo(0.18, 2.2); shape.lineTo(0.5, 2.2);
    shape.lineTo(0, 3.2); shape.lineTo(-0.5, 2.2); shape.lineTo(-0.18, 2.2); shape.closePath();
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false }));
    this.arrow.rotation.order = 'YXZ';
    scene.add(this.arrow);

    this.aimOffset = 0;
    this.finished = false;
    this.stopT = this.runT = this.finishT = 0;
    this.clubAngle = this.clubTarget = 0;
    this.freezeT = this.slowT = 0;
    this.lastBig = -10;
    this.hud.setScore(0);
    G.trolley.aim(START_S, 0, 0);
    // let everything settle for a moment
    for (let i = 0; i < 30; i++) {
      G.trolley.preStep(STEP, 0, false);
      G.physics.step(STEP);
      G.trolley.postStep(STEP);
    }
    this.rig.goto(this.level.stops[0], 0.01, true);
  }

  teardown() {
    this.hud.clear();
    G.fx.clear();
    G.crowd.dispose();
    this.scene.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose();
    });
    G.physics.dispose();
  }

  restart(skipTour: boolean) {
    $('results').classList.remove('show');
    $('title').classList.remove('show');
    this.teardown();
    this.build();
    this.swing.reset();
    if (skipTour) this.enterAim();
    else this.beginTour();
  }

  // ------------------------------------------------------------------ states
  setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  beginTour() {
    this.sfx.unlock();
    $('title').classList.remove('show');
    this.hud.showRunHud(false);
    this.setState('tour');
    this.tourIdx = -1;
    this.nextTourStop();
    $('skip').style.display = 'block';
    this.commentary.say('intro', true);
  }

  nextTourStop() {
    this.tourIdx++;
    const tour = this.level.tour;
    if (this.tourIdx >= tour.length) {
      this.enterAim();
      return;
    }
    const t = tour[this.tourIdx];
    const stop = this.level.stops[this.tourIdx];
    this.rig.goto({ cam: stop.cam.clone(), look: stop.look.clone() }, this.tourIdx === 0 ? 1.2 : 1.7);
    const card = $('intro');
    card.style.display = 'block';
    (card.querySelector('.num') as HTMLElement).textContent = this.tourIdx === 0 ? 'THE ROYAL MILE · START' : `SET PIECE ${this.tourIdx} OF ${tour.length - 1}`;
    (card.querySelector('h2') as HTMLElement).textContent = t.name;
    (card.querySelector('.pts') as HTMLElement).textContent = t.pts;
    (card.querySelector('p') as HTMLElement).textContent = t.blurb;
    this.stateT = 0;
    this.sfx.whoosh();
  }

  enterAim() {
    $('intro').style.display = 'none';
    $('skip').style.display = 'none';
    $('aimhint').style.display = 'block';
    this.hud.showRunHud(true);
    this.setState('aim');
    this.swing.reset();
    this.swing.show(true);
    this.rig.mode = 'aim';
    this.rig.snapBehind(G.trolley.position, G.trolley.forwardDir);
    this.arrow.visible = true;
    this.commentary.say('aim', true);
  }

  launch() {
    const r = this.swing.result!;
    this.swing.show(false);
    $('aimhint').style.display = 'none';
    this.arrow.visible = false;
    const over = r.power > 1;
    // off-timing sends it left or right; a shank is a big (but survivable) slice
    const hook = r.shank ? (Math.random() < 0.5 ? -1 : 1) * 0.28 : Math.max(-0.22, Math.min(0.22, r.accuracy * 1.6));
    const heading = this.aimOffset + hook;
    G.trolley.aim(START_S, 0, heading);
    const speed = (5 + r.power * 13 + (over ? 3 : 0)) * (r.shank ? 0.7 : 1);
    const wobble = (over ? (Math.random() - 0.5) * 2.5 : 0) + hook * 1.5;
    G.trolley.launch(speed, wobble);
    G.armed = true;
    this.launchPower = r.power;
    this.sfx.clubHit(r.power);
    this.sfx.cannon();
    G.fx.dust(toWorld(-30, -6.6, 1.2).add(new THREE.Vector3(0, 0, 2)), 3, 0xdddddd, 14);
    this.rig.shake(0.5 + r.power * 0.5);
    if (r.shank || Math.abs(r.accuracy) > 0.07) this.commentary.say('launch_hook', true);
    else if (over) this.commentary.say('launch_over', true);
    else if (r.power < 0.4) this.commentary.say('launch_weak', true);
    else this.commentary.say('launch_good', true);
    this.rig.mode = 'chase';
    this.setState('run');
    this.runT = 0;
  }

  endRun() {
    this.setState('ending');
    this.rig.mode = 'orbit';
    if (!this.finished) this.commentary.say(G.trolley.ejected ? 'wreck' : 'stopped', true);
  }

  showResults() {
    this.setState('results');
    this.hud.showRunHud(false);
    const sc = G.scoring;
    let best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY) || 0); } catch {}
    const record = sc.score > best;
    if (record) {
      best = sc.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
    }
    const rows = sc.invoice();
    const total = rows.reduce((a, r) => a + r.cost, 0);
    const fmt = (n: number) => '£' + n.toLocaleString();
    const no = 'DB-' + Math.floor(1000 + Math.random() * 9000);
    const html = `
      <h2>THE CITY OF EDINBURGH COUNCIL</h2>
      <div class="sub">DAMAGE INVOICE ${no} · The Royal Mile · Payment due: immediately, ideally yesterday</div>
      <table>
        ${rows.length ? rows.map((r) => `<tr><td>${r.desc}</td><td class="r">×${r.qty}</td><td class="r">${fmt(r.cost)}</td></tr>`).join('') : '<tr><td>Nothing broken. Suspicious.</td><td></td><td class="r">£0</td></tr>'}
        <tr class="tot"><td>TOTAL DUE</td><td></td><td class="r">${fmt(total)}</td></tr>
      </table>
      <div class="score"><span>SCORE</span><span class="big">${sc.score.toLocaleString()}</span></div>
      <div>Best: ${best.toLocaleString()} · Top speed: ${Math.round(G.trolley.topSpeed * 2.237)} mph · Biggest hit: ${sc.biggest.label || '—'} (${sc.biggest.pts.toLocaleString()})</div>
      <div class="stamp">${record ? 'NEW RECORD!' : this.finished ? 'REACHED HOLYROOD' : 'DID NOT FINISH'}</div>
      <div class="gull">P.S. A seagull has stolen your chips. No refund will be issued.</div>`;
    $('results').querySelector('.invoice')!.innerHTML = html;
    $('results').classList.add('show');
    this.sfx.seagull();
    this.commentary.say('results', true);
  }

  bigMoment(strength: number) {
    if (G.time - this.lastBig < 2.5) return;
    this.lastBig = G.time;
    this.freezeT = 0.06 + 0.08 * strength;
    this.slowT = 0.6 + 0.6 * strength;
    this.hud.bam(BAM_WORDS[Math.floor(Math.random() * BAM_WORDS.length)]);
    this.sfx.bam();
    this.rig.shake(0.5 * strength);
  }

  /** Hide props, tourists and pigeons lost in the haar. */
  private cull() {
    const c = this.camera.position;
    const R2 = 165 * 165;
    const vis = (o: THREE.Object3D) => {
      const dx = o.position.x - c.x, dz = o.position.z - c.z;
      o.visible = dx * dx + dz * dz < R2;
    };
    for (const p of G.destruction.parts) if (p.state !== 'gone') vis(p.mesh);
    for (const t of G.crowd.tourists) vis(t.mesh);
    for (const f of G.crowd.flocks) for (const b of f.birds) vis(b.mesh);
  }

  // ------------------------------------------------------------------ loop
  update(dtReal: number) {
    const dt = Math.min(0.05, dtReal);
    this.stateT += dt;
    const input = this.input;
    const t = G.trolley;

    // time scale for freeze-frames and slow-mo
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.timeScale = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      this.timeScale = this.slowT < 0.3 ? 0.3 + (0.3 - this.slowT) / 0.3 * 0.7 : 0.3;
    } else this.timeScale = 1;

    switch (this.state) {
      case 'title':
        break;
      case 'tour':
        if (input.action()) this.enterAim();
        else if (this.stateT > (this.tourIdx === 0 ? 3.2 : 3.9)) this.nextTourStop();
        break;
      case 'aim': {
        if (this.swing.phase === 'idle') {
          this.aimOffset = Math.max(-0.32, Math.min(0.32, this.aimOffset + input.steer * dt * 0.6));
        }
        t.aim(START_S, 0, this.aimOffset);
        const p = t.position;
        this.arrow.position.copy(p).add(new THREE.Vector3(0, -0.28, 0));
        this.arrow.rotation.set(-Math.PI / 2, theta(START_S) - this.aimOffset, 0);
        this.arrow.rotateZ(Math.PI); // shape points +Y; flip to face downhill
        const done = this.swing.update(dt, input.action());
        // the club follows the meter: back on the way up, forward on the way down
        if (this.swing.phase === 'up' || this.swing.phase === 'down') this.clubTarget = Math.max(0, this.swing.pos) * 1.7;
        if (done) {
          this.setState('launching');
          this.clubTarget = -1.2;
        }
        break;
      }
      case 'launching':
        if (this.clubAngle < 0.15) this.launch();
        break;
      case 'run': {
        this.runT += dt;
        if (input.pressed('Space', 'KeyW', 'ArrowUp')) t.hop();
        const sp = t.speed;
        if (this.runT > 2.5 && sp < 0.7) this.stopT += dt;
        else this.stopT = 0;
        if (!this.finished && t.roadS > FINISH_S) {
          this.finished = true;
          G.scoring.award('FINISHED!', 1000, t.position.add(new THREE.Vector3(0, 2, 0)), true, 'finish');
          this.commentary.say('finish', true);
          this.sfx.cheer(3);
        }
        if (this.finished) this.finishT += dt;
        if (this.stopT > (t.ejected ? (t.runner || t.ragdoll ? 12 : 2.5) : 4) || t.position.y < -15 || this.runT > 150 || (this.finished && (this.finishT > 5 || sp < 1))) this.endRun();
        break;
      }
      case 'ending':
        if (this.stateT > 2.2) this.showResults();
        break;
      case 'results':
        break;
    }
    if (input.pressed('KeyR') && (this.state === 'run' || this.state === 'ending' || this.state === 'results' || this.state === 'aim')) this.restart(true);

    // club animation (springy)
    const k = this.state === 'launching' ? 18 : this.state === 'run' ? 1.2 : 10;
    this.clubAngle += (this.clubTarget - this.clubAngle) * Math.min(1, dt * k);
    if (this.state === 'run' && this.runT > 0.6) this.clubTarget = 0;
    this.level.launcher.club.rotation.x = this.clubAngle;

    // physics
    const steer = this.state === 'run' ? input.steer : 0;
    const control = this.state === 'run';
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 4) {
      this.acc -= STEP;
      n++;
      const h = STEP * this.timeScale;
      if (h <= 0) continue;
      t.preStep(h, steer, control);
      G.physics.step(h);
      t.postStep(h);
      G.time += h;
    }
    if (this.acc > STEP * 4) this.acc = 0;

    const sdt = dt * this.timeScale;
    const tp = t.position, tv = t.velocity;
    G.destruction.update(tp);
    G.crowd.update(sdt, tp, tv);
    for (const u of G.updaters) u(sdt);
    G.fx.update(sdt);
    G.scoring.update();
    G.destruction.sync();
    G.crowd.sync(sdt);
    t.sync(sdt);

    if (this.state === 'run' || this.state === 'aim' || this.state === 'launching') {
      this.hud.setRun(t.speed, t.hops, t.ejected, t.roadS, START_S, FINISH_S, !!t.runner);
      this.sfx.rolling(t.speed, t.grounded);
    } else this.sfx.rolling(0, false);

    this.rig.update(dt, tp, tv, t.forwardDir);
    // keep the sun's shadow box around what we're looking at
    const focus = this.state === 'tour' || this.state === 'title' ? this.rig.look : tp;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(new THREE.Vector3(-22, 48, -26));

    this.hud.update(dt);
    this.commentary.update(dt);
    this.input.endFrame();

    this.cull();
    this.backdrop.update(dt, this.camera);
    this.renderer.render(this.scene, this.camera);

    this.frames++;
    this.fpsT += dtReal;
    if (this.fpsT > 0.5) {
      this.hud.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps · ${this.renderer.info.render.calls} draws · ${G.destruction.debris.length} debris`;
      this.frames = 0;
      this.fpsT = 0;
    }
  }
}
