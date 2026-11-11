import { describe, expect, it } from 'vitest';
import { buildShareUrl, parseSeed, parseShareParams } from '../src/app/share';
import { getEnvironment } from '../src/config/environments';
import { createDefaultSettings, sanitizeSettings } from '../src/config/settings';
import { Autopilot } from '../src/game/Autopilot';
import { DEFAULT_VEHICLE, VehicleController, type VehicleInput } from '../src/game/VehicleController';
import { buildChunkData } from '../src/world/ChunkBuilder';
import { ColliderGrid } from '../src/world/Colliders';
import { RoadGenerator } from '../src/world/RoadGenerator';
import { placeChunkScenery, placeRoadside, sceneryColliders, structureColliders } from '../src/world/SceneryGenerator';
import { TerrainSampler } from '../src/world/TerrainGenerator';

function world(envId: string, seed = 2024) {
  const env = getEnvironment(envId);
  const terrain = new TerrainSampler(env, seed);
  const road = new RoadGenerator(env.road, seed, (x, z) => terrain.baseHeight(x, z));
  road.ensureAheadS(4000);
  return { env, terrain, road, seed };
}

describe('ColliderGrid', () => {
  it('pushes a circle out of a circle obstacle along the contact normal', () => {
    const grid = new ColliderGrid();
    grid.addGroup('a', [{ type: 'circle', x: 10, z: 0, r: 1 }]);
    const r = grid.resolve(8.5, 0, 0.9);
    expect(r.hit).toBe(true);
    expect(r.nx).toBeCloseTo(-1, 5);
    expect(Math.hypot(r.x - 10, r.z)).toBeCloseTo(1.9, 5);
    expect(grid.resolve(5, 0, 0.9).hit).toBe(false);
  });

  it('handles rotated boxes, including a centre that is already inside', () => {
    const grid = new ColliderGrid();
    grid.addGroup('house', [{ type: 'box', x: 0, z: 0, hx: 4, hz: 2, rot: Math.PI / 2 }]);
    // After a 90° turn the long side lies along world Z.
    expect(grid.resolve(0, 4.5, 0.6).hit).toBe(true);
    expect(grid.resolve(4.5, 0, 0.6).hit).toBe(false);
    const inside = grid.resolve(0.2, 0.3, 0.5);
    expect(inside.hit).toBe(true);
    // Pushed fully clear of the box.
    expect(grid.resolve(inside.x, inside.z, 0.49).hit).toBe(false);
  });

  it('removes groups completely (no leaks when chunks are recycled)', () => {
    const grid = new ColliderGrid();
    for (let i = 0; i < 50; i++) {
      grid.addGroup(`g${i}`, [
        { type: 'circle', x: i * 40, z: 5, r: 0.5 },
        { type: 'box', x: i * 40, z: -30, hx: 6, hz: 4, rot: 0.3 },
      ]);
    }
    expect(grid.colliderCount).toBe(100);
    for (let i = 0; i < 50; i++) grid.removeGroup(`g${i}`);
    expect(grid.colliderCount).toBe(0);
    expect(grid.groupCount).toBe(0);
    expect(grid.resolve(0, 5, 1).hit).toBe(false);
  });

  it('works far from the origin (long drives)', () => {
    const grid = new ColliderGrid();
    grid.addGroup('far', [{ type: 'circle', x: -52000.5, z: 870000.25, r: 0.4 }]);
    expect(grid.resolve(-52000.5, 870001, 0.9).hit).toBe(true);
  });
});

describe('Solid scenery', () => {
  it('trees become colliders that never sit on the road', () => {
    const { env, terrain, road, seed } = world('green-highlands');
    const edge = env.road.halfWidth + env.road.shoulderWidth;
    let total = 0;
    for (const [ix, iz] of [[0, 2], [-1, 4], [1, 7]]) {
      const data = buildChunkData(ix, iz, 0, 128, 2, terrain, road);
      const batches = placeChunkScenery(env, data, terrain, seed, { density: 1, grass: true, grassDensity: 1 });
      const colliders = sceneryColliders(batches);
      total += colliders.length;
      for (const c of colliders) {
        if (c.type !== 'circle') continue;
        expect(road.query(c.x, c.z).dist - c.r).toBeGreaterThan(edge);
      }
      // Grass and flowers are never solid.
      const soft = batches.filter((b) => b.kind === 'grass' || b.kind === 'flower').reduce((n, b) => n + b.items.length, 0);
      const all = batches.reduce((n, b) => n + b.items.length, 0);
      expect(colliders.length).toBeLessThanOrEqual(all - soft);
    }
    expect(total).toBeGreaterThan(0);
  });

  it('houses become boxes clear of the driving lane', () => {
    const { env, terrain, road } = world('liminal-suburbia', 3);
    const furniture = placeRoadside(env, road, road.segments[2], terrain, 3, false);
    const colliders = structureColliders(furniture.placements);
    expect(colliders.some((c) => c.type === 'box')).toBe(true);
    const grid = new ColliderGrid();
    grid.addGroup('seg', colliders);
    // Driving down the right-hand lane never touches anything.
    for (let s = road.segments[2].startS; s < road.segments[2].endS; s += 3) {
      const p = road.pointAt(s);
      const lane = env.road.halfWidth * 0.5;
      const x = p.x - Math.cos(p.heading) * lane;
      const z = p.z + Math.sin(p.heading) * lane;
      expect(grid.resolve(x, z, 0.95).hit).toBe(false);
    }
  });
});

describe('Shareable road links', () => {
  it('round-trips environment, variant and road number', () => {
    const url = buildShareUrl('https://example.test/play/?old=1#x', { environmentId: 'coastal-highway', variantId: 'sunset', seed: 4242 });
    expect(url).toBe('https://example.test/play/?env=coastal-highway&v=sunset&road=4242');
    expect(parseShareParams(url.split('?')[1])).toEqual({ environmentId: 'coastal-highway', variantId: 'sunset', seed: 4242 });
  });

  it('rejects unknown places and repairs bad variants or road numbers', () => {
    expect(parseShareParams('env=the-void&road=1')).toBeNull();
    expect(parseShareParams('')).toBeNull();
    expect(parseShareParams('env=misty-forest&v=nope&road=-5')).toEqual({ environmentId: 'misty-forest', variantId: null, seed: null });
    expect(parseSeed('#777')).toBe(777);
    expect(parseSeed('12.5')).toBeNull();
    expect(parseSeed('abc')).toBeNull();
    expect(parseSeed('99999999999')).toBeNull();
  });
});

describe('Regression: zero-length frames', () => {
  it('a zero or negative time step never corrupts the vehicle state', () => {
    const v = new VehicleController();
    v.reset(1, 2, 3, 0.5);
    const input: VehicleInput = { throttle: 1, brake: 0, steer: 0.3, handbrake: false };
    const ground = () => ({ height: 2, surface: 'asphalt' as const });
    v.update(0, input, ground);
    v.update(-0.01, input, ground);
    v.update(Number.NaN, input, ground);
    for (let i = 0; i < 30; i++) v.update(1 / 60, input, ground);
    for (const value of Object.values(v.state)) {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    }
    expect(v.state.speed).toBeGreaterThan(0);
  });
});

describe('Autopilot (auto-drive)', () => {
  it('follows the right-hand lane through curves without leaving the road', () => {
    for (const id of ['green-highlands', 'alpine-roads', 'service-corridors']) {
      const { env, road } = world(id, 11);
      const lane = env.indoor?.type === 'corridor' ? 0 : env.road.halfWidth * 0.5;
      const v = new VehicleController({ ...DEFAULT_VEHICLE, maxSpeed: env.maxSpeedKmh / 3.6 });
      const pilot = new Autopilot(road, lane, Math.min(env.maxSpeedKmh * 0.5, 70) / 3.6);
      const start = road.pointAt(320);
      v.reset(start.x - Math.cos(start.heading) * lane, start.y, start.z + Math.sin(start.heading) * lane, start.heading);
      const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      let worst = 0;
      for (let i = 0; i < 60 * 90; i++) {
        const q = road.query(v.state.x, v.state.z);
        pilot.drive(v.state, v.params, q.s, input);
        v.update(1 / 60, input, () => ({ height: q.y, surface: 'asphalt' }));
        worst = Math.max(worst, Math.abs(q.lateral - lane));
      }
      expect(worst, id).toBeLessThan(env.road.halfWidth * 0.5);
      expect(road.query(v.state.x, v.state.z).s).toBeGreaterThan(900);
    }
  });
});

describe('Settings migration', () => {
  it('adds new fields to settings saved by an older version', () => {
    const old = { audio: { master: 0.4 }, graphics: { preset: 'high' }, last: { camera: 'cockpit' } };
    const s = sanitizeSettings(old);
    expect(s.graphics.postFx).toBe(createDefaultSettings().graphics.postFx);
    expect(s.stats).toEqual({ totalKm: 0, totalMinutes: 0 });
    expect(s.last.camera).toBe('cockpit');
    expect(sanitizeSettings({ last: { camera: 'drone' } }).last.camera).toBe('drone');
    expect(sanitizeSettings({ last: { camera: 'orbit' } }).last.camera).toBe('chase');
  });
});
