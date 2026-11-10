import * as THREE from 'three';
import { G } from '../ctx';
import { Physics, STEP } from '../core/Physics';
import { Sfx } from '../core/Audio';
import { Input } from '../core/Input';
import { Fx } from '../core/Fx';
import { Destruction } from '../destruction/Destruction';
import { Terrain } from '../world/Terrain';
import { Trolley } from '../vehicle/Trolley';
import { VEHICLES, VEHICLE_ORDER, VehicleId } from '../vehicle/Vehicles';
import { Crowd } from '../props/Crowd';
import { HUD } from '../ui/HUD';
import { Scoring } from './Scoring';
import { Commentary } from './Commentary';
import { SwingMeter, angleOf } from './SwingMeter';
import { CameraRig, Frame } from './CameraRig';
import { Career, GOALS, STAGES, Goal } from './Career';
import { buildRoyalMile, Level } from '../level/RoyalMile';
import { buildDiversion } from '../level/Diversion';
import { Boot, ARC_R } from '../level/Boot';
import { bake } from '../world/Batcher';
import { Backdrop, HAAR } from '../world/Backdrop';
import { initInteriors } from '../art/Interiors';
import { makeEnv } from '../art/Materials';
import { policeTally, resetWanted } from '../props/Homages';
import { addRun, Cosmetic, COSMETICS, RunTally, SLOTS } from './Cosmetics';
import { MobileUI } from '../ui/MobileUI';
import { QUALITY, CAM } from '../core/Platform';
import { FINISH_S, START_S, toWorld, theta, edgeL, edgeR, baseH } from '../world/Road';
import * as Road from '../world/Road';

/** Points that aren't for breaking something or hitting someone. */
const HARMLESS = new Set(['FINISHED!', 'SPLASHDOWN!', 'SKOOSH!', 'EJECTED!', 'BACK IN!', 'ENGINE ON!', 'KILT LIFT!', 'Pigeon Panic', 'Seagull Scramble']);

type State = 'title' | 'tour' | 'aim' | 'run' | 'ending' | 'results';

const BAM_WORDS = ['BAM!', 'WALLOP!', 'SKELP!', 'BOOF!', 'CRASH!', 'KER-RANG!', 'SMASH!', 'OCH!'];
const BOOT_WORDS = ['BOOT!', 'HOOF!', 'THWUMP!', 'WELLY!'];
/** Boot angle while waiting to swing: cocked up and back, out of the aiming camera's way. */
const BOOT_REST = 1.15;

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.round(n).toLocaleString();

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
  career = new Career();
  level!: Level;
  sun!: THREE.DirectionalLight;
  arrow!: THREE.Mesh;
  backdrop!: Backdrop;
  boot!: Boot;
  mobile: MobileUI;
  /** Current render resolution multiplier (lowered on the fly on phones if the frame rate drops). */
  pixelRatio = QUALITY.pixelRatio;
  private slowFor = 0;
  private fastFor = 0;

  /** What the current world was built for. */
  vehicle: VehicleId = 'trolley';
  /** A vehicle unlocked by the run just finished, offered on the results screen. */
  private swapTo: VehicleId | null = null;
  tier = 1;
  state: State = 'title';
  /** The live objective tracker: how far each one had got when last looked at. */
  private trackSeen = new Map<string, number>();
  private trackT = 0;
  stateT = 0;
  tourIdx = 0;
  aimOffset = 0;
  runT = 0;
  stopT = 0;
  finished = false;
  finishT = 0;
  splashT = 0;
  acc = 0;
  freezeT = 0;
  slowT = 0;
  lastBig = -10;
  timeScale = 1;
  launchPower = 0;
  private bootT = 0;
  /** Where the vehicle went into the Forth (the camera circles here, above the water). */
  private splashAt: THREE.Vector3 | null = null;
  private bootA = BOOT_REST;
  /** Real-time countdown until the camera swings round behind after the boot hits. */
  private swingBackT = 0;
  private sideView = false;
  private attractT = 0;
  private recorded = false;
  private frames = 0;
  private fpsT = 0;
  /** Debug: step the simulation without drawing. */
  skipRender = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.1, 2600);
    this.input = new Input(canvas);
    this.mobile = new MobileUI(this.input);
    this.hud = new HUD(this.camera);
    this.rig = new CameraRig(this.camera);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    $('startBtn').addEventListener('click', () => {
      // the tap that starts the game is also the one iOS needs before it will share the tilt sensor
      void this.mobile.onPlay();
      this.play();
    });
    $('retryBtn').addEventListener('click', () => this.restart(true));
    $('tourBtn').addEventListener('click', () => this.restart(false));
    $('garageBtn').addEventListener('click', () => this.toTitle());
    for (const id of ['kitBtn', 'kitBtn2']) $(id).addEventListener('click', () => this.openKit());
    $('kitDone').addEventListener('click', () => {
      $('kit').classList.remove('show');
      // back to whichever screen it was opened from
      if (this.state === 'title' || this.state === 'results') $(this.state).classList.add('show');
    });
    $('swapBtn').addEventListener('click', () => {
      if (!this.swapTo) return;
      this.career.setVehicle(this.swapTo);
      this.restart(true);
    });
    $('resetBtn').addEventListener('click', () => {
      if (confirm('Wipe your career? Points, unlocked stages and vehicles all go.')) {
        this.career.reset();
        this.toTitle();
      }
    });

    // render the shop interiors once, before any shop windows are built
    initInteriors(this.renderer);
    makeEnv(this.renderer);
    this.build();
    this.enterTitle();
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

  get spec() {
    return VEHICLES[this.vehicle];
  }

  /** Stage the chosen vehicle can reach: no engine, no getting past the Grassmarket. */
  tierFor(v: VehicleId) {
    return VEHICLES[v].engine ? this.career.tier : Math.min(this.career.tier, 2);
  }

  // ------------------------------------------------------------------ world
  build() {
    this.vehicle = this.career.data.vehicle;
    this.tier = this.tierFor(this.vehicle);
    // the road must be laid out before anything is placed on it
    Road.setCourse(this.tier >= 2 ? 'diversion' : 'royalmile', this.tier);

    const scene = new THREE.Scene();
    const haar = HAAR.clone();
    scene.background = haar;
    scene.fog = new THREE.FogExp2(haar, 0.005);
    this.scene = scene;
    scene.add(new THREE.HemisphereLight(0xdfe7f0, 0x4f463c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
    const sc = sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;

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
    G.destruction.maxDebris = QUALITY.maxDebris;
    G.scoring = new Scoring(this.hud);
    G.crowd = new Crowd();
    resetWanted();
    G.terrain = new Terrain(scene, G.physics);
    G.trolley = new Trolley(scene, START_S, 0, this.vehicle);
    this.level = this.tier >= 2 ? buildDiversion(this.tier) : buildRoyalMile();
    this.backdrop = new Backdrop(scene, new THREE.Vector3(-22, 48, -26), this.level.keepOut);
    bake(scene);
    this.boot = new Boot(scene, START_S, this.spec);
    this.boot.setAngle(BOOT_REST);
    this.hud.setMarks(this.level.tour.slice(1).filter((t) => t.s < FINISH_S + 5), START_S, FINISH_S);

    // aim arrow
    const shape = new THREE.Shape();
    shape.moveTo(-0.18, 0); shape.lineTo(0.18, 0); shape.lineTo(0.18, 2.2); shape.lineTo(0.5, 2.2);
    shape.lineTo(0, 3.2); shape.lineTo(-0.5, 2.2); shape.lineTo(-0.18, 2.2); shape.closePath();
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false }));
    this.arrow.rotation.order = 'YXZ';
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.aimOffset = 0;
    this.finished = false;
    this.recorded = false;
    this.trackSeen.clear();
    for (const [k, [cur]] of this.kitProgress()) this.trackSeen.set(k.id, cur);
    this.sideView = false;
    this.stopT = this.runT = this.finishT = this.splashT = 0;
    this.splashAt = null;
    this.rig.orbitR = 7;
    this.rig.orbitH = 3.5;
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
    // bailing out of a run part-way: what the tracker showed him earning is kept
    if (!this.recorded && (this.state === 'run' || this.state === 'ending')) this.career.bankTally(this.runTally());
    this.hud.clear();
    $('derby').style.display = 'none';
    this.sfx.engineHum(false, 0);
    G.fx.clear();
    G.crowd.dispose();
    this.scene.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isSkinnedMesh) o.skeleton.dispose();
    });
    G.physics.dispose();
  }

  restart(skipTour: boolean) {
    $('results').classList.remove('show');
    $('title').classList.remove('show');
    $('kit').classList.remove('show');
    this.teardown();
    this.build();
    this.swing.reset();
    if (skipTour) this.enterAim();
    else this.beginTour();
  }

  /** PLAY on the title screen: rebuild first if the garage choice changed the course. */
  play() {
    this.sfx.unlock();
    if (this.career.data.vehicle !== this.vehicle || this.tierFor(this.career.data.vehicle) !== this.tier) this.restart(false);
    else this.beginTour();
  }

  /** Back to the title screen and garage (rebuilding so new unlocks show up). */
  toTitle() {
    $('results').classList.remove('show');
    $('kit').classList.remove('show');
    this.teardown();
    // render the shop interiors once, before any shop windows are built
    initInteriors(this.renderer);
    makeEnv(this.renderer);
    this.build();
    this.enterTitle();
  }

  // ------------------------------------------------------------------ states
  setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  enterTitle() {
    this.setState('title');
    this.hud.showRunHud(false);
    this.swing.show(false);
    $('aimhint').style.display = 'none';
    $('intro').style.display = 'none';
    $('skip').style.display = 'none';
    this.attractT = 0;
    this.rig.mode = 'manual';
    this.renderGarage();
    this.kitButtons();
    $('title').classList.add('show');
  }

  renderGarage() {
    const c = this.career;
    const d = c.data;
    const st = STAGES[c.tier - 1];
    $('stageName').textContent = `STAGE ${c.tier} — ${st.name.toUpperCase()}, EDINBURGH`;
    const next = c.next;
    let bar = `<div>CAREER BANK: <b>${fmt(d.bank)}</b> pts &nbsp;·&nbsp; RUNS: ${d.runs} &nbsp;·&nbsp; BEST: ${fmt(Math.max(0, ...Object.values(d.best)))}</div>`;
    if (next) {
      const [cur, max] = next.progress(d);
      bar += `<div class="goal">NEXT: ${next.title} → <b>${next.reward}</b></div><div class="meter"><div style="width:${Math.min(100, (cur / max) * 100)}%"></div></div>`;
    } else bar += `<div class="goal">Everything unlocked. Edinburgh City Council has issued a warrant.</div>`;
    const sel = d.vehicle;
    if (!VEHICLES[sel].engine && c.tier > 2) bar += `<div class="goal" style="color:#ffb0a0">No engine: ${VEHICLES[sel].name.replace(/^The /, 'the ')} can only make it as far as the Grassmarket.</div>`;
    $('careerBar').innerHTML = bar;
    const garage = $('garage');
    garage.innerHTML = '';
    for (const id of VEHICLE_ORDER) {
      const v = VEHICLES[id];
      const owned = d.vehicles.includes(id);
      const card = document.createElement('div');
      card.className = `car${owned ? '' : ' locked'}${id === sel ? ' sel' : ''}`;
      const dots = (n: number) => '●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n));
      if (owned) {
        card.innerHTML = `<h4>${v.name}</h4><div class="stats">SPEED ${dots(v.stats.speed)}<br/>WEIGHT ${dots(v.stats.weight)}<br/>ENGINE ${v.engine ? dots(v.stats.engine) : 'none'}</div><div class="blurb">${v.blurb}</div>`;
        card.addEventListener('click', () => {
          c.setVehicle(id);
          this.sfx.unlock();
          this.sfx.boing();
          this.renderGarage();
        });
      } else {
        const g = GOALS.find((x) => x.vehicle === id);
        card.innerHTML = `<h4>${v.name}</h4><div class="blurb">Unlock: ${g ? g.title : '???'}</div>`;
      }
      garage.appendChild(card);
    }
  }

  /** The equip screen: a costume, a hat and something for the vehicle, each earned by a side objective. */
  openKit() {
    this.sfx.unlock();
    this.renderKit();
    $('title').classList.remove('show');
    $('results').classList.remove('show');
    $('kit').classList.add('show');
  }

  /** A padlock on the kit bag buttons until it's open. */
  private kitButtons() {
    for (const id of ['kitBtn', 'kitBtn2']) $(id).textContent = this.career.kitOpen ? 'KIT BAG' : '🔒 KIT BAG';
  }

  renderKit() {
    const c = this.career;
    const d = c.data;
    const root = $('kitSlots');
    root.innerHTML = '';
    if (!c.kitOpen) {
      root.innerHTML = `<div class="slot"><h3>🔒 LOCKED</h3><div class="sub">The kit bag opens the first time you drive off Starbank Road into the Firth of Forth. Nothing counts towards it until then.</div></div>`;
      return;
    }
    const card = (cls: string, html: string, pick?: () => void) => {
      const el = document.createElement('div');
      el.className = `car ${cls}`;
      el.innerHTML = html;
      if (pick) {
        el.addEventListener('click', () => {
          pick();
          this.sfx.boing();
          // he changes on the spot while he's still sat at the top of the hill
          if (this.state === 'title') G.trolley.dress();
          this.renderKit();
          this.kitNote();
        });
      }
      return el;
    };
    for (const s of SLOTS) {
      const sec = document.createElement('div');
      sec.className = 'slot';
      sec.innerHTML = `<h3>${s.title}</h3>`;
      const opts = document.createElement('div');
      opts.className = 'opts';
      const worn = d.equip[s.slot];
      opts.appendChild(card(worn ? '' : 'sel', `<h4>None</h4><div class="blurb">${s.none}</div>`, () => c.equip(s.slot, null)));
      for (const k of COSMETICS.filter((x) => x.slot === s.slot)) {
        if (d.cosmetics.includes(k.id)) {
          opts.appendChild(card(worn === k.id ? 'sel' : '', `<h4>${k.name}</h4><div class="blurb">${k.blurb}</div>`, () => c.equip(s.slot, k.id)));
        } else {
          const [cur, max] = k.progress(d.tally);
          opts.appendChild(card('locked', `<h4>${k.name}</h4><div class="blurb">Unlock: ${k.how}</div><div class="meter"><div style="width:${Math.min(100, (cur / max) * 100)}%"></div></div><div class="count">${Math.min(cur, max)} / ${max}</div>`));
        }
      }
      sec.appendChild(opts);
      root.appendChild(sec);
    }
    this.kitNote();
  }

  /** After a run the change only shows once he's back at the top of the hill. */
  private kitNote() {
    const sub = $('kit').querySelector('.sub') as HTMLElement;
    sub.textContent = this.state === 'title'
      ? 'Optional extras from side objectives. Purely for show: nothing here makes you faster.'
      : 'Optional extras from side objectives. Changes go on for your next run.';
  }

  beginTour() {
    this.sfx.unlock();
    $('title').classList.remove('show');
    this.hud.showRunHud(false);
    this.setState('tour');
    this.tourIdx = -1;
    this.nextTourStop();
    $('skip').style.display = 'block';
    this.commentary.say(this.tier >= 2 ? 'intro_long' : 'intro', true);
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
    (card.querySelector('.num') as HTMLElement).textContent = this.tourIdx === 0 ? `${this.level.name.toUpperCase()} · START` : `SET PIECE ${this.tourIdx} OF ${tour.length - 1}`;
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
    this.swing.showLabelOnly();
    this.sideView = false;
    this.rig.mode = 'aim';
    this.rig.snapBehind(G.trolley.position, G.trolley.forwardDir);
    this.arrow.visible = true;
    this.boot.setAngle(BOOT_REST);
    this.bootA = BOOT_REST;
    // however the phone's being held now is "straight ahead"
    this.input.tilt.calibrate();
    this.commentary.say('aim', true);
  }

  private launchDir() {
    const yaw = theta(START_S) - this.aimOffset;
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  }

  /** The 90° side view of the boot and the vehicle while swinging. */
  private sideFrame(): Frame {
    const f = this.launchDir();
    const anchor = G.trolley.position.addScaledVector(f, -(this.boot.back + 2.4));
    anchor.y = baseH(START_S) + 3.0;
    return { anchor, fwd: f, angle: Math.PI / 2, dist: 12.5, height: 0.4, ahead: 0, lookY: 0 };
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
    // contact! thump, rumble, a hit-stop to let it register, then swing the camera round behind
    this.sfx.clubHit(r.power);
    this.sfx.rumble(0.6 + r.power * 0.5);
    this.sfx.cannon();
    G.fx.dust(this.boot.toe, 2.4, 0xdddddd, 18);
    this.rig.shake(0.8 + r.power * 0.6);
    this.hud.bam(BOOT_WORDS[Math.floor(Math.random() * BOOT_WORDS.length)]);
    this.mobile.buzz(60 + r.power * 80);
    this.freezeT = 0.3 + r.power * 0.12;
    this.slowT = 0.5;
    this.lastBig = G.time;
    // watch it go from the side until it's clear of the gantry, then swing round behind
    const f = this.launchDir();
    const track: Frame = { anchor: G.trolley.position, fwd: f, angle: Math.PI / 2, dist: 10, height: 1.6, ahead: 1.5, lookY: 0.6 };
    this.rig.frameTo(track, 0.6, { follow: true });
    this.swingBackT = 0.75;
    this.sideView = false;
    this.bootT = 0;
    if (r.shank || Math.abs(r.accuracy) > 0.07) this.commentary.say('launch_hook', true);
    else if (over) this.commentary.say('launch_over', true);
    else if (r.power < 0.4) this.commentary.say('launch_weak', true);
    else this.commentary.say(Math.random() < 0.5 ? 'boot' : 'launch_good', true);
    this.setState('run');
    this.runT = 0;
  }

  endRun() {
    this.setState('ending');
    // crane up and back, still looking down the street the way we were going (circling round
    // would show the backs of the buildings and the gaps behind the scenery)
    if (!G.trolley.splashed) {
      const p = G.trolley.position;
      const f = Road.forward(Road.toRoad(p.x, p.z).s);
      const from: Frame = this.rig.frame ?? { anchor: p.clone(), fwd: f, angle: 0, dist: 4.6 * CAM.dist, height: 1.9 * CAM.height, ahead: 5, lookY: 0.9 };
      this.rig.frameTo({ anchor: p, fwd: f, angle: 0, dist: 7.5, height: 4.2, ahead: 9, lookY: 0.2 }, 2.4, { from: { ...from, anchor: this.rig.pos.clone().addScaledVector(f, from.dist).setY(p.y) }, follow: true });
    }
    this.sfx.engineHum(false, 0);
    if (!this.finished && !G.trolley.splashed) {
      if (!this.spec.engine && this.tier >= 2 && G.trolley.roadS > Road.ENGINE_S - 20 && !G.trolley.ejected) this.commentary.say('stalled', true);
      else this.commentary.say(G.trolley.ejected ? 'wreck' : 'stopped', true);
    }
  }

  /** What this run has done so far for the side objectives. */
  runTally(): RunTally {
    const downs: Record<string, number> = {};
    for (const p of G.crowd.tourists) if (p.scored) downs[p.type] = (downs[p.type] ?? 0) + 1;
    return {
      downs, police: policeTally(), splash: G.trolley.splashed, ejects: G.trolley.ejectCount,
      flocks: G.crowd.flocks.filter((f) => f.scored).length,
      // scaring birds, hopping and picking up cans don't count as damage
      clean: this.finished && [...G.scoring.log.keys()].every((l) => HARMLESS.has(l)),
    };
  }

  /** How far along each locked side objective is, counting the run in progress. */
  private kitProgress() {
    const c = this.career;
    const out = new Map<Cosmetic, [number, number]>();
    if (!c.kitOpen) return out;
    const t = addRun(c.data.tally, this.runTally());
    for (const k of COSMETICS) {
      if (c.data.cosmetics.includes(k.id)) continue;
      const [cur, max] = k.progress(t);
      out.set(k, [Math.min(cur, max), max]);
    }
    return out;
  }

  /** Mid-run: pop the tracker up for whichever objective has just moved on. */
  private trackKit(dt: number) {
    this.trackT -= dt;
    if (this.trackT > 0) return;
    this.trackT = 0.2;
    let latest: [Cosmetic, number, number] | null = null;
    for (const [k, [cur, max]] of this.kitProgress()) {
      if (cur > (this.trackSeen.get(k.id) ?? 0)) latest = [k, cur, max];
      this.trackSeen.set(k.id, cur);
    }
    if (latest) this.hud.track(latest[0].name, latest[0].how, latest[1], latest[2]);
  }

  showResults() {
    this.setState('results');
    this.hud.showRunHud(false);
    const sc = G.scoring;
    const t = G.trolley;
    const c = this.career;
    const stage = STAGES[this.tier - 1];
    let res = { newly: [] as Goal[], record: false, prevBest: 0, extras: [] as Cosmetic[], kitOpened: false };
    if (!this.recorded) {
      this.recorded = true;
      res = c.record({ score: sc.score, tier: this.tier, finished: this.finished, splash: t.splashed, tally: this.runTally() });
    }
    const best = c.bestFor(this.tier);
    const rows = sc.invoice();
    const total = rows.reduce((a, r) => a + r.cost, 0);
    const money = (n: number) => '£' + n.toLocaleString();
    const no = 'DB-' + Math.floor(1000 + Math.random() * 9000);
    const stamp = t.splashed ? 'SPLASHDOWN!' : res.record ? 'NEW RECORD!' : this.finished ? `REACHED ${stage.finish.toUpperCase()}` : 'DID NOT FINISH';
    const html = `
      <h2>THE CITY OF EDINBURGH COUNCIL</h2>
      <div class="sub">DAMAGE INVOICE ${no} · ${stage.name} · Payment due: immediately, ideally yesterday</div>
      <table>
        ${rows.length ? rows.map((r) => `<tr><td>${r.desc}</td><td class="r">×${r.qty}</td><td class="r">${money(r.cost)}</td></tr>`).join('') : '<tr><td>Nothing broken. Suspicious.</td><td></td><td class="r">£0</td></tr>'}
        <tr class="tot"><td>TOTAL DUE</td><td></td><td class="r">${money(total)}</td></tr>
      </table>
      <div class="score"><span>SCORE</span><span class="big">${sc.score.toLocaleString()}</span></div>
      <div>Stage best: ${best.toLocaleString()} · Top speed: ${Math.round(t.topSpeed * 2.237)} mph · Biggest hit: ${sc.biggest.label || '—'} (${sc.biggest.pts.toLocaleString()})</div>
      <div class="stamp">${stamp}</div>
      <div class="gull">P.S. ${t.splashed ? 'The coastguard would like a word.' : 'A seagull has stolen your chips. No refund will be issued.'}</div>`;
    $('results').querySelector('.invoice')!.innerHTML = html;

    const d = c.data;
    let box = `<h3>CAREER</h3><div>Points banked: <b>+${fmt(sc.score)}</b></div><div>Bank total: <b>${fmt(d.bank)}</b></div><div>Runs: ${d.runs}</div>`;
    for (const g of res.newly) box += `<div class="unlock">UNLOCKED!<br/>${g.reward}</div>`;
    if (res.kitOpened) box += `<div class="unlock">KIT BAG OPEN!<br/>Side objectives now count</div>`;
    for (const k of res.extras) box += `<div class="unlock">KIT BAG!<br/>${k.name}</div>`;
    const next = c.next;
    if (next) {
      const [cur, max] = next.progress(d);
      box += `<div style="margin-top:12px">NEXT GOAL:<br/><span style="font-family:'Special Elite'">${next.title}</span><div class="meter"><div style="width:${Math.min(100, (cur / max) * 100)}%"></div></div><div style="font-size:13px;opacity:.85">${fmt(Math.min(cur, max))} / ${fmt(max)} → ${next.reward}</div></div>`;
    } else box += `<div style="margin-top:12px">All goals done. Absolute menace.</div>`;
    $('results').querySelector('.careerBox')!.innerHTML = box;
    // a new vehicle in the garage: offer to take it straight out
    this.swapTo = res.newly.map((g) => g.vehicle).filter((v): v is VehicleId => !!v && v !== this.vehicle).pop() ?? null;
    const swap = $('swapBtn');
    swap.style.display = this.swapTo ? '' : 'none';
    if (this.swapTo) swap.textContent = `DRIVE ${VEHICLES[this.swapTo].name.replace(/^The /, 'THE ').toUpperCase()}`;
    $('retryBtn').classList.toggle('alt', !!this.swapTo);
    $('tourBtn').style.display = this.swapTo ? 'none' : '';
    $('results').classList.add('show');
    this.sfx.seagull();
    this.kitButtons();
    if (res.newly.length || res.extras.length) {
      this.sfx.cheer(2);
      this.commentary.show(`Unlocked: ${[...res.newly.map((g) => g.reward), ...res.extras.map((k) => `${k.name} (in the kit bag)`)].join(' · ')}!`, 5);
    } else this.commentary.say('results', true);
  }

  bigMoment(strength: number) {
    if (G.time - this.lastBig < 2.5) return;
    this.lastBig = G.time;
    this.freezeT = 0.06 + 0.08 * strength;
    this.slowT = 0.6 + 0.6 * strength;
    this.hud.bam(BAM_WORDS[Math.floor(Math.random() * BAM_WORDS.length)]);
    this.sfx.bam();
    this.mobile.buzz(40 + strength * 60);
    this.rig.shake(0.5 * strength);
  }

  /** In the Forth: a big splash, then it's all over. */
  private splashdown() {
    const t = G.trolley;
    t.splashed = true;
    this.splashT = 0;
    const p = t.position;
    p.y = Road.SEA_Y + 0.2;
    this.splashAt = p.clone();
    // watch it go down from the shore side, looking out over the Forth
    const f = Road.forward(Road.MARKS.end);
    this.rig.frameTo({ anchor: p.clone(), fwd: f, angle: 0, dist: 12, height: 5, ahead: 2.5, lookY: -0.5 }, 1.6, { from: { anchor: this.rig.pos.clone().addScaledVector(f, 6), fwd: f, angle: 0, dist: 6, height: 0, ahead: 6, lookY: 0 } });
    G.fx.splash(p, 0xd8eef5, 70);
    G.fx.splash(p.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffffff, 40);
    this.sfx.splash();
    G.scoring.award('SPLASHDOWN!', 5000, p.clone().add(new THREE.Vector3(0, 2.5, 0)), true, 'splash');
    this.commentary.say('splash', true);
    this.bigMoment(1);
  }

  /** Title-screen attract mode: glide down the course and back up, looking at the shopfronts. */
  /** Kit bag open on the title screen: look at Hamish from the front, sat to the right of the cards. */
  private kitCam(dt: number) {
    const t = G.trolley;
    const p = t.position;
    const f = Road.forward(START_S), r = Road.right(START_S);
    const pos = p.clone().addScaledVector(f, 3.1).addScaledVector(r, 1.5).add(new THREE.Vector3(0, 1.5, 0));
    const look = p.clone().add(new THREE.Vector3(0, 0.75, 0));
    // slide the whole view sideways so he ends up in the right-hand third
    const side = look.clone().sub(pos).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1.25);
    pos.add(side);
    look.add(side);
    const k = 1 - Math.exp(-dt * 5);
    this.rig.pos.lerp(pos, k);
    this.rig.look.lerp(look, k);
  }

  private attract(dt: number) {
    this.attractT += dt;
    const s0 = START_S + 4, s1 = FINISH_S - 6;
    const len = Math.max(50, s1 - s0);
    const T = (2 * len) / 7.5; // ~7.5 m/s each way
    const ph = (this.attractT % T) / T;
    const s = s0 + (len * (1 - Math.cos(ph * Math.PI * 2))) / 2;
    const dir = ph < 0.5 ? 1 : -1;
    // look across at the facades on the side we're passing (alternates each leg)
    const sl = s + dir * 9;
    const side = dir;
    const edge = side > 0 ? edgeR(sl) : edgeL(sl);
    const camU = -side * 1.6;
    const pos = toWorld(s, camU, 2.7 + Math.sin(this.attractT * 0.3) * 0.4);
    const look = toWorld(sl, side * edge, 2.6);
    if (this.stateT < 0.05) {
      this.rig.pos.copy(pos);
      this.rig.look.copy(look);
    }
    this.rig.pos.lerp(pos, 1 - Math.exp(-dt * 4));
    this.rig.look.lerp(look, 1 - Math.exp(-dt * 1.6));
  }

  /** Hide props, tourists and pigeons lost in the haar. */
  private cull() {
    const c = this.camera.position;
    const R2 = QUALITY.cullDistance * QUALITY.cullDistance;
    const vis = (o: THREE.Object3D) => {
      const dx = o.position.x - c.x, dz = o.position.z - c.z;
      o.visible = dx * dx + dz * dz < R2;
    };
    for (const p of G.destruction.parts) if (p.state !== 'gone') vis(p.mesh);
    for (const t of G.crowd.tourists) vis(t.mesh);
    for (const f of G.crowd.flocks) for (const b of f.birds) vis(b.mesh);
  }

  /** Phones: drop the render resolution when the frame rate sags, raise it again when there's headroom. */
  private adaptResolution(fps: number, dt: number) {
    if (!QUALITY.dynamicResolution || (window as any).__paused) return;
    if (fps < 40) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (fps > 56) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else this.slowFor = this.fastFor = 0;
    let pr = this.pixelRatio;
    if (this.slowFor > 1.5) pr = Math.max(0.55, pr - 0.15);
    else if (this.fastFor > 5) pr = Math.min(QUALITY.pixelRatio, pr + 0.1);
    if (pr !== this.pixelRatio) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.resize();
      this.slowFor = this.fastFor = 0;
    }
  }

  private toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  // ------------------------------------------------------------------ loop
  update(dtReal: number) {
    const dt = Math.min(0.05, dtReal);
    this.stateT += dt;
    const input = this.input;
    input.update(dt);
    this.mobile.setPlaying(this.state === 'aim' || this.state === 'run');
    const t = G.trolley;

    // time scale for freeze-frames and slow-mo
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.timeScale = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      this.timeScale = this.slowT < 0.3 ? 0.3 + (0.3 - this.slowT) / 0.3 * 0.7 : 0.3;
    } else this.timeScale = 1;
    const sdt = dt * this.timeScale;

    switch (this.state) {
      case 'title':
        if ($('kit').classList.contains('show')) this.kitCam(dt);
        else this.attract(dt);
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
        this.boot.aim(this.aimOffset);
        const p = t.position;
        this.arrow.position.copy(p).add(new THREE.Vector3(0, -0.28, 0));
        this.arrow.rotation.set(-Math.PI / 2, theta(START_S) - this.aimOffset, 0);
        this.arrow.rotateZ(Math.PI); // shape points +Y; flip to face downhill
        const wasIdle = this.swing.phase === 'idle';
        const done = this.swing.update(dt, input.action());
        if (wasIdle && this.swing.phase === 'up') {
          // swing the camera 90° round to watch the boot from the side
          this.sideView = true;
          this.input.tilt.calibrate();
          this.arrow.visible = false;
          $('aimhint').style.display = 'none';
          this.rig.frameTo(this.sideFrame(), 0.55, { from: CameraRig.behind(p, this.launchDir()) });
          this.swing.show(true);
          this.sfx.whoosh();
        }
        // the boot follows the meter (eased, so it doesn't snap from the cocked rest)
        const want = this.swing.phase === 'idle' ? BOOT_REST + Math.sin(this.stateT * 2.2) * 0.04 : angleOf(this.swing.pos);
        this.bootA += (want - this.bootA) * (1 - Math.exp(-dt * (this.swing.phase === 'idle' ? 6 : 22)));
        this.boot.setAngle(this.bootA);
        if (done) this.launch();
        break;
      }
      case 'run': {
        this.runT += sdt;
        if (this.swingBackT > 0) {
          this.swingBackT -= dt;
          if (this.swingBackT <= 0) {
            const f = this.launchDir();
            const chase: Frame = { anchor: t.position, fwd: f, angle: 0, dist: 4.6 * CAM.dist, height: 1.9 * CAM.height, ahead: 5, lookY: 0.9 };
            this.rig.frameTo(chase, 0.9, { follow: true, then: 'chase' });
          }
        }
        // the boot follows through, then sags back
        this.bootT += sdt;
        const bt = this.bootT;
        this.boot.setAngle(bt < 0.25 ? -0.75 * (bt / 0.25) : -0.75 + Math.min(1, (bt - 0.25) / 1.6) * (0.75 + BOOT_REST));
        if (input.pressed('Space', 'KeyW', 'ArrowUp')) t.hop();
        const sp = t.speed;
        if (this.runT > 2.5 && sp < 0.7) this.stopT += dt;
        else this.stopT = 0;
        if (!this.finished && t.roadS > FINISH_S && !t.splashed) {
          this.finished = true;
          G.scoring.award('FINISHED!', 1000, t.position.add(new THREE.Vector3(0, 2, 0)), true, 'finish');
          if (this.tier < 4) {
            this.commentary.say(this.tier === 1 ? 'finish' : this.tier === 2 ? 'finish_gm' : 'finish_ps', true);
            this.sfx.cheer(3);
          }
        }
        if (Road.SEA_Y > -500 && !t.splashed && t.position.y < Road.SEA_Y + 0.4) this.splashdown();
        if (t.splashed) {
          this.splashT += dt;
          if (this.splashT > 1.6 && this.splashT - dt <= 1.6) this.commentary.say('sinking', true);
        }
        if (this.finished) this.finishT += dt;
        const limit = this.tier >= 2 ? 330 : 150;
        const stopLimit = t.ejected ? (t.runner || t.ragdoll ? 12 : 2.5) : 4;
        if (
          this.stopT > stopLimit ||
          t.position.y < -15 ||
          this.runT > limit ||
          this.splashT > 3.6 ||
          (this.finished && this.tier < 4 && (this.finishT > 5 || sp < 1))
        )
          this.endRun();
        break;
      }
      case 'ending':
        if (this.stateT > 2.2) this.showResults();
        break;
      case 'results':
        break;
    }
    if (input.pressed('KeyR') && (this.state === 'run' || this.state === 'ending' || this.state === 'results' || this.state === 'aim')) this.restart(true);

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

    const tp = t.position, tv = t.velocity;
    G.destruction.update(tp);
    G.crowd.update(sdt, tp, tv);
    for (const u of G.updaters) u(sdt);
    G.fx.update(sdt);
    G.scoring.update();
    G.destruction.sync();
    G.crowd.sync(sdt);
    t.sync(sdt);

    if (this.state === 'run' || this.state === 'aim') {
      const e = this.spec.engine;
      let eng = e ? (t.splashed ? 'ENGINE: FLOODED' : t.engineOn ? (t.ejected ? 'ENGINE: CUT OUT' : 'ENGINE: ON') : 'ENGINE: STARTS AT THE GRASSMARKET') : '';
      if (t.boostT > 0 && !t.ejected) eng = `SKOOSH BOOST ${t.boostT.toFixed(1)}s` + (eng ? ' · ' + eng : '');
      this.hud.setRun(t.speed, t.hops, t.hopCharge, t.ejected, t.roadS, START_S, FINISH_S, !!t.runner, eng);
      this.sfx.rolling(t.splashed ? 0 : t.speed, t.grounded);
      this.sfx.engineHum(this.state === 'run' && t.engineOn && !t.ejected && !t.splashed, t.speed, e?.sound ?? 1);
    } else this.sfx.rolling(0, false);

    if (this.splashAt && (this.state === 'run' || this.state === 'ending')) this.rig.update(dt, this.splashAt, new THREE.Vector3(), t.forwardDir);
    else this.rig.update(dt, tp, tv, t.forwardDir);
    if (this.state === 'aim' && this.sideView) {
      const hip = this.toScreen(this.boot.hip);
      this.swing.draw((pos) => this.toScreen(this.boot.pointAt(angleOf(pos), ARC_R)), hip);
    }
    // keep the sun's shadow box around what we're looking at
    const focus = this.state === 'tour' || this.state === 'title' ? this.rig.look : tp;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(new THREE.Vector3(-22, 48, -26));

    if (this.state === 'run' || this.state === 'ending') this.trackKit(dt);
    this.hud.update(dt);
    this.commentary.update(dt);
    this.input.endFrame();

    this.cull();
    this.backdrop.update(dt, this.camera);
    if (!this.skipRender) this.renderer.render(this.scene, this.camera);

    this.frames++;
    this.fpsT += dtReal;
    if (this.fpsT > 0.5) {
      this.adaptResolution(this.frames / this.fpsT, this.fpsT);
      this.hud.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps · ${this.renderer.info.render.calls} draws · ${G.destruction.debris.length} debris`;
      this.frames = 0;
      this.fpsT = 0;
    }
  }
}
