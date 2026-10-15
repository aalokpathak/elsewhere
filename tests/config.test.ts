import { describe, expect, it } from 'vitest';
import { canTransition } from '../src/app/game-state';
import { ENVIRONMENTS, getEnvironment, getVariant } from '../src/config/environments';
import { GRAPHICS_PRESETS } from '../src/config/graphics';
import { createDefaultSettings, loadSettings, sanitizeSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../src/config/settings';
import { WeatherSystem } from '../src/world/WeatherSystem';

const HEX = /^#[0-9a-fA-F]{6}$/;

function collectColors(obj: unknown, path: string, out: [string, string][]): void {
  if (typeof obj === 'string' && obj.startsWith('#')) out.push([path, obj]);
  else if (Array.isArray(obj)) obj.forEach((v, i) => collectColors(v, `${path}[${i}]`, out));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) collectColors(v, `${path}.${k}`, out);
}

describe('Environment presets', () => {
  it('have unique ids and at least one atmosphere variant each', () => {
    const ids = new Set(ENVIRONMENTS.map((e) => e.id));
    expect(ids.size).toBe(ENVIRONMENTS.length);
    expect(ENVIRONMENTS.length).toBe(10);
    for (const env of ENVIRONMENTS) {
      expect(env.variants.length).toBeGreaterThan(0);
      expect(new Set(env.variants.map((v) => v.id)).size).toBe(env.variants.length);
    }
  });

  it('use valid colours and sane numeric ranges', () => {
    for (const env of ENVIRONMENTS) {
      const colors: [string, string][] = [];
      collectColors(env, env.id, colors);
      for (const [path, c] of colors.filter(([p]) => !p.includes('.terrain.colors') || env.kind === 'outdoor')) {
        expect(c, path).toMatch(HEX);
      }
      const r = env.road;
      expect(r.halfWidth).toBeGreaterThan(1.5);
      expect(r.minRadius).toBeGreaterThan(20);
      expect(r.maxRadius).toBeGreaterThanOrEqual(r.minRadius);
      expect(r.maxHeadingDeg).toBeLessThan(70);
      expect(r.segmentLength[0]).toBeLessThanOrEqual(r.segmentLength[1]);
      for (const v of env.variants) {
        expect(v.fogFar).toBeGreaterThan(v.fogNear);
        expect(v.cloudCover).toBeGreaterThanOrEqual(0);
        expect(v.cloudCover).toBeLessThanOrEqual(1);
        expect(v.exposure).toBeGreaterThan(0);
      }
      for (const layer of env.scenery) {
        expect(layer.density).toBeGreaterThan(0);
        expect(layer.tints.length).toBeGreaterThan(0);
        expect(layer.scale[0]).toBeLessThanOrEqual(layer.scale[1]);
      }
      if (env.kind === 'indoor') {
        expect(env.indoor).toBeDefined();
        expect(env.indoor!.driveHalfWidth).toBeLessThan(env.indoor!.floorHalfWidth);
      }
      expect(env.maxSpeedKmh).toBeGreaterThan(20);
    }
  });

  it('fall back to defaults for unknown ids', () => {
    expect(getEnvironment('nope').id).toBe('green-highlands');
    const env = getEnvironment('coastal-highway');
    expect(getVariant(env, 'missing').id).toBe(env.variants[0].id);
  });

  it('the four core environments are marked complete', () => {
    for (const id of ['green-highlands', 'coastal-highway', 'liminal-suburbia', 'parking-structure']) {
      expect(getEnvironment(id).status).toBe('complete');
    }
  });
});

describe('Graphics presets', () => {
  it('scale monotonically from low to high', () => {
    const { low, medium, high } = GRAPHICS_PRESETS;
    expect(low.viewDistance).toBeLessThan(medium.viewDistance);
    expect(medium.viewDistance).toBeLessThan(high.viewDistance);
    for (const p of [low, medium, high]) {
      expect(p.lodRings.length).toBe(p.lodSpacing.length);
      expect(p.lodRings[p.lodRings.length - 1]).toBe(p.viewDistance);
    }
  });
});

describe('Settings persistence', () => {
  const memoryStorage = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
  };

  it('round-trips through storage', () => {
    const store = memoryStorage();
    const s = createDefaultSettings();
    s.audio.music = 0.12;
    s.controls.units = 'mph';
    s.atmosphere.liminal = 'uncanny';
    s.last.environmentId = 'parking-structure';
    expect(saveSettings(s, store)).toBe(true);
    expect(loadSettings(store)).toEqual(s);
  });

  it('repairs corrupted or hostile data', () => {
    const fixed = sanitizeSettings({
      audio: { master: 7, music: 'loud' },
      graphics: { preset: 'ultra', resolutionScale: -3 },
      controls: { units: 'furlongs', maxSpeedKmh: 9999 },
      last: { environmentId: 'the-void' },
    });
    expect(fixed.audio.master).toBe(1);
    expect(fixed.audio.music).toBe(createDefaultSettings().audio.music);
    expect(['low', 'medium', 'high']).toContain(fixed.graphics.preset);
    expect(fixed.graphics.resolutionScale).toBe(0.5);
    expect(fixed.controls.units).toBe('kmh');
    expect(fixed.controls.maxSpeedKmh).toBe(200);
    expect(fixed.last.environmentId).toBe('green-highlands');
  });

  it('falls back to defaults on invalid JSON or missing storage', () => {
    const store = memoryStorage();
    store.map.set(SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings(store)).toEqual(createDefaultSettings());
    expect(loadSettings(null)).toEqual(createDefaultSettings());
    expect(saveSettings(createDefaultSettings(), null)).toBe(false);
  });
});

describe('Weather transitions', () => {
  it('ease smoothly to the target variant', () => {
    const env = getEnvironment('green-highlands');
    const w = new WeatherSystem(getVariant(env, 'afternoon'));
    const target = getVariant(env, 'drizzle');
    w.setTarget(target, 10);
    w.update(5);
    expect(w.current.rain).toBeGreaterThan(0);
    expect(w.current.rain).toBeLessThan(target.rain);
    for (let i = 0; i < 20; i++) w.update(1);
    expect(w.current.rain).toBeCloseTo(target.rain, 6);
    expect(w.transitioning).toBe(false);
  });
});

describe('Game state machine', () => {
  it('allows only legal phase transitions', () => {
    expect(canTransition('menu', 'loading')).toBe(true);
    expect(canTransition('driving', 'paused')).toBe(true);
    expect(canTransition('paused', 'driving')).toBe(true);
    expect(canTransition('boot', 'paused')).toBe(false);
    expect(canTransition('error', 'driving')).toBe(false);
  });
});
