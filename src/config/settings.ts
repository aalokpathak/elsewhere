import { DEFAULT_ENVIRONMENT, isEnvironmentId, type EnvironmentId } from './environments';
import { suggestPreset, type GraphicsPresetId } from './graphics';

export type LiminalIntensity = 'off' | 'subtle' | 'uncanny';
export type SpeedUnits = 'kmh' | 'mph';
export type CameraPreference = 'chase' | 'cockpit';

export interface Settings {
  version: 1;
  audio: { master: number; vehicle: number; ambience: number; music: number; horror: number };
  graphics: { preset: GraphicsPresetId; resolutionScale: number; adaptiveResolution: boolean; showPerformance: boolean };
  controls: { cameraSensitivity: number; steeringSensitivity: number; units: SpeedUnits; maxSpeedKmh: number; fov: number };
  comfort: { reduceMotion: boolean; showHud: boolean; showDriveTime: boolean };
  atmosphere: {
    liminal: LiminalIntensity;
    visualAnomalies: boolean;
    horrorAudio: boolean;
    atmosphericEffects: boolean;
    timeDrift: boolean;
  };
  vehicle: { color: string };
  last: { environmentId: EnvironmentId; variantId: string | null; camera: CameraPreference };
}

export const CAR_COLORS = [
  { id: '#d9cfb8', name: 'Cream' },
  { id: '#3f6f73', name: 'Teal' },
  { id: '#c98a3f', name: 'Ember' },
  { id: '#1f2a3d', name: 'Midnight' },
  { id: '#8e2f2b', name: 'Oxblood' },
  { id: '#9aa3a8', name: 'Fog' },
];

export function createDefaultSettings(): Settings {
  return {
    version: 1,
    audio: { master: 0.8, vehicle: 0.55, ambience: 0.75, music: 0.35, horror: 0.6 },
    graphics: { preset: suggestPreset(), resolutionScale: 1, adaptiveResolution: true, showPerformance: false },
    controls: { cameraSensitivity: 1, steeringSensitivity: 1, units: 'kmh', maxSpeedKmh: 130, fov: 62 },
    comfort: { reduceMotion: false, showHud: true, showDriveTime: true },
    atmosphere: { liminal: 'subtle', visualAnomalies: true, horrorAudio: true, atmosphericEffects: true, timeDrift: false },
    vehicle: { color: CAR_COLORS[0].id },
    last: { environmentId: DEFAULT_ENVIRONMENT, variantId: null, camera: 'chase' },
  };
}

const STORAGE_KEY = 'elsewhere.settings.v1';

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Validates arbitrary (possibly corrupted) data into a complete Settings object. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = createDefaultSettings();
  const r = obj(raw);
  const a = obj(r.audio);
  const g = obj(r.graphics);
  const c = obj(r.controls);
  const cf = obj(r.comfort);
  const at = obj(r.atmosphere);
  const v = obj(r.vehicle);
  const l = obj(r.last);
  return {
    version: 1,
    audio: {
      master: num(a.master, 0, 1, d.audio.master),
      vehicle: num(a.vehicle, 0, 1, d.audio.vehicle),
      ambience: num(a.ambience, 0, 1, d.audio.ambience),
      music: num(a.music, 0, 1, d.audio.music),
      horror: num(a.horror, 0, 1, d.audio.horror),
    },
    graphics: {
      preset: oneOf(g.preset, ['low', 'medium', 'high'] as const, d.graphics.preset),
      resolutionScale: num(g.resolutionScale, 0.5, 1.5, d.graphics.resolutionScale),
      adaptiveResolution: bool(g.adaptiveResolution, d.graphics.adaptiveResolution),
      showPerformance: bool(g.showPerformance, d.graphics.showPerformance),
    },
    controls: {
      cameraSensitivity: num(c.cameraSensitivity, 0.2, 2.5, d.controls.cameraSensitivity),
      steeringSensitivity: num(c.steeringSensitivity, 0.6, 1.5, d.controls.steeringSensitivity),
      units: oneOf(c.units, ['kmh', 'mph'] as const, d.controls.units),
      maxSpeedKmh: num(c.maxSpeedKmh, 40, 200, d.controls.maxSpeedKmh),
      fov: num(c.fov, 50, 85, d.controls.fov),
    },
    comfort: {
      reduceMotion: bool(cf.reduceMotion, d.comfort.reduceMotion),
      showHud: bool(cf.showHud, d.comfort.showHud),
      showDriveTime: bool(cf.showDriveTime, d.comfort.showDriveTime),
    },
    atmosphere: {
      liminal: oneOf(at.liminal, ['off', 'subtle', 'uncanny'] as const, d.atmosphere.liminal),
      visualAnomalies: bool(at.visualAnomalies, d.atmosphere.visualAnomalies),
      horrorAudio: bool(at.horrorAudio, d.atmosphere.horrorAudio),
      atmosphericEffects: bool(at.atmosphericEffects, d.atmosphere.atmosphericEffects),
      timeDrift: bool(at.timeDrift, d.atmosphere.timeDrift),
    },
    vehicle: {
      color: oneOf(v.color, CAR_COLORS.map((x) => x.id), d.vehicle.color),
    },
    last: {
      environmentId: isEnvironmentId(l.environmentId) ? l.environmentId : d.last.environmentId,
      variantId: typeof l.variantId === 'string' ? l.variantId : null,
      camera: oneOf(l.camera, ['chase', 'cockpit'] as const, d.last.camera),
    },
  };
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = getStorage()): Settings {
  if (!storage) return createDefaultSettings();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : createDefaultSettings();
  } catch {
    return createDefaultSettings();
  }
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export { STORAGE_KEY as SETTINGS_STORAGE_KEY };
