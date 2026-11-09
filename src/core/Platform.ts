/**
 * Which version of the game to show: desktop (keyboard + mouse) or mobile (tilt + touch).
 *
 * Decided from the browser's user agent, cross-checked against the hardware: iPads claim to be a
 * Mac in their user agent, so a "Mac" with a multi-touch screen counts as a tablet. `?mobile=1` or
 * `?mobile=0` in the URL forces a version, and the choice is remembered.
 */
const KEY = 'downhillbam.mobile';

function detect() {
  const ua = navigator.userAgent || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const ios = /iPhone|iPod|iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 0);
  const android = /Android/i.test(ua);
  const uaMobile = ios || android || /Mobile|Silk|Opera Mini|IEMobile|webOS/i.test(ua);
  let mobile = uaMobile && (touchPoints > 0 || coarse);
  // an explicit choice wins (and sticks)
  const q = new URLSearchParams(location.search).get('mobile');
  try {
    if (q === '1' || q === '0') localStorage.setItem(KEY, q);
    const saved = localStorage.getItem(KEY);
    if (saved === '1' || saved === '0') mobile = saved === '1';
  } catch {
    if (q === '1' || q === '0') mobile = q === '1';
  }
  return { mobile, ios, android };
}

export const PLATFORM = detect();

/**
 * Chase camera framing. Phones get it tighter and narrower so the vehicle isn't a speck on a
 * small screen: distance and height are multipliers on the desktop camera.
 */
export const CAM = PLATFORM.mobile
  ? { dist: 0.74, height: 0.84, fov: 55, fovSpeed: 10, follow: 7.5 }
  : { dist: 1, height: 1, fov: 62, fovSpeed: 16, follow: 5 };

/** How hard the game works the device. */
export interface Quality {
  /** Cap on the render resolution multiplier (the mobile build adjusts below this on the fly). */
  pixelRatio: number;
  antialias: boolean;
  shadowMap: number;
  /** Props, people and birds beyond this are hidden. */
  cullDistance: number;
  /** People beyond this switch to a merged, one-pose model (far fewer draw calls). */
  lodDistance: number;
  /** Fraction of the background crowds and flocks to spawn. */
  crowd: number;
  /** Fraction of the backdrop city to build. */
  city: number;
  maxDebris: number;
  /** Lower the resolution automatically when the frame rate drops. */
  dynamicResolution: boolean;
}

export const QUALITY: Quality = PLATFORM.mobile
  ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), antialias: false, shadowMap: 1024, cullDistance: 100, lodDistance: 14, crowd: 0.5, city: 0.55, maxDebris: 180, dynamicResolution: true }
  : { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75), antialias: true, shadowMap: 2048, cullDistance: 165, lodDistance: 22, crowd: 1, city: 1, maxDebris: 420, dynamicResolution: false };
