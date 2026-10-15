import { lerp, wrapAngle, type RGB } from '../core/math';
import type { AtmosphereVariant } from './environments/types';
import { hexToLinear } from './TerrainGenerator';

/**
 * Interpolatable atmosphere state (time of day + weather + grading). Colours
 * are linear RGB. The weather system eases from the current state to a target
 * variant, so switching "Morning" → "Golden Hour" or "Clear" → "Rain" is a
 * slow, continuous transition rather than a cut.
 */
export interface AtmosphereState {
  sunElevation: number;
  sunAzimuth: number;
  sunColor: RGB;
  sunIntensity: number;
  skyZenith: RGB;
  skyHorizon: RGB;
  skyGround: RGB;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  cloudCover: number;
  cloudColor: RGB;
  exposure: number;
  rain: number;
  snow: number;
  wetness: number;
  wind: number;
  headlights: number;
  lights: number;
  stars: number;
  sunDisc: number;
  waterColor: RGB;
}

const COLOR_KEYS = ['sunColor', 'skyZenith', 'skyHorizon', 'skyGround', 'hemiSky', 'hemiGround', 'cloudColor', 'waterColor'] as const;
const NUMBER_KEYS = [
  'sunElevation',
  'sunIntensity',
  'hemiIntensity',
  'fogNear',
  'fogFar',
  'cloudCover',
  'exposure',
  'rain',
  'snow',
  'wetness',
  'wind',
  'headlights',
  'lights',
  'stars',
  'sunDisc',
] as const;

export function variantToState(v: AtmosphereVariant): AtmosphereState {
  return {
    sunElevation: v.sunElevation,
    sunAzimuth: v.sunAzimuth,
    sunColor: hexToLinear(v.sunColor),
    sunIntensity: v.sunIntensity,
    skyZenith: hexToLinear(v.skyZenith),
    skyHorizon: hexToLinear(v.skyHorizon),
    skyGround: hexToLinear(v.skyGround),
    hemiSky: hexToLinear(v.hemiSky),
    hemiGround: hexToLinear(v.hemiGround),
    hemiIntensity: v.hemiIntensity,
    fogNear: v.fogNear,
    fogFar: v.fogFar,
    cloudCover: v.cloudCover,
    cloudColor: hexToLinear(v.cloudColor),
    exposure: v.exposure,
    rain: v.rain,
    snow: v.snow,
    wetness: v.wetness,
    wind: v.wind,
    headlights: v.headlights ? 1 : 0,
    lights: v.lights,
    stars: v.stars,
    sunDisc: v.sunDisc,
    waterColor: hexToLinear(v.waterColor ?? '#1f5068'),
  };
}

export function cloneState(s: AtmosphereState): AtmosphereState {
  const out = { ...s } as AtmosphereState;
  for (const k of COLOR_KEYS) out[k] = [...s[k]] as RGB;
  return out;
}

export function lerpState(a: AtmosphereState, b: AtmosphereState, t: number, out: AtmosphereState): AtmosphereState {
  for (const k of NUMBER_KEYS) out[k] = lerp(a[k], b[k], t);
  out.sunAzimuth = a.sunAzimuth + wrapAngle(((b.sunAzimuth - a.sunAzimuth) * Math.PI) / 180) * (180 / Math.PI) * t;
  for (const k of COLOR_KEYS) {
    const ca = a[k];
    const cb = b[k];
    const co = out[k];
    co[0] = lerp(ca[0], cb[0], t);
    co[1] = lerp(ca[1], cb[1], t);
    co[2] = lerp(ca[2], cb[2], t);
  }
  return out;
}

const ease = (t: number) => t * t * (3 - 2 * t);

export class WeatherSystem {
  current: AtmosphereState;
  private from: AtmosphereState;
  private to: AtmosphereState;
  private t = 1;
  private duration = 1;
  targetId: string;

  constructor(initial: AtmosphereVariant) {
    this.current = variantToState(initial);
    this.from = cloneState(this.current);
    this.to = cloneState(this.current);
    this.targetId = initial.id;
  }

  get transitioning(): boolean {
    return this.t < 1;
  }

  /** Begins a smooth transition (seconds). A duration of 0 snaps immediately. */
  setTarget(v: AtmosphereVariant, duration: number): void {
    this.targetId = v.id;
    this.from = cloneState(this.current);
    this.to = variantToState(v);
    this.duration = Math.max(0.0001, duration);
    this.t = duration <= 0 ? 1 : 0;
    if (duration <= 0) this.current = cloneState(this.to);
  }

  update(dt: number): boolean {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / this.duration);
    lerpState(this.from, this.to, ease(this.t), this.current);
    return true;
  }
}
