import type * as THREE from 'three';
import type { Physics } from './core/Physics';
import type { Destruction } from './destruction/Destruction';
import type { Scoring } from './game/Scoring';
import type { Sfx } from './core/Audio';
import type { Trolley } from './vehicle/Trolley';
import type { Terrain } from './world/Terrain';
import type { Fx } from './core/Fx';
import type { Commentary } from './game/Commentary';
import type { Crowd } from './props/Crowd';
import type { CameraRig } from './game/CameraRig';

/** Shared game context. Rebuilt on each restart (audio + renderer persist). */
export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  physics: Physics;
  destruction: Destruction;
  scoring: Scoring;
  sfx: Sfx;
  trolley: Trolley;
  terrain: Terrain;
  fx: Fx;
  commentary: Commentary;
  crowd: Crowd;
  rig: CameraRig;
  /** Per-frame hooks from set pieces (triggers, animation). */
  updaters: ((dt: number) => void)[];
  time: number;
  running: boolean;
  /** Impacts only count once the trolley has been launched (spawning props settle first). */
  armed: boolean;
  /** Called when a big moment happens (slow-mo / BAM). */
  bigMoment: (strength: number) => void;
  shake: (amount: number) => void;
}

export const G: Ctx = {} as Ctx;
