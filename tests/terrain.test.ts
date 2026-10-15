import { describe, expect, it } from 'vitest';
import { getEnvironment } from '../src/config/environments';
import { buildChunkData, lodForDistance, planChunks, sampleChunkSurface } from '../src/world/ChunkBuilder';
import { RoadGenerator } from '../src/world/RoadGenerator';
import { placeChunkScenery, placeRoadside } from '../src/world/SceneryGenerator';
import { TerrainSampler } from '../src/world/TerrainGenerator';

function world(envId: string, seed = 2024) {
  const env = getEnvironment(envId);
  const terrain = new TerrainSampler(env, seed);
  const road = new RoadGenerator(env.road, seed, (x, z) => terrain.baseHeight(x, z));
  road.ensureAheadS(4000);
  return { env, terrain, road, seed };
}

describe('TerrainSampler', () => {
  it('is deterministic', () => {
    const a = world('green-highlands', 8);
    const b = world('green-highlands', 8);
    for (const [x, z] of [[10, 10], [-300, 700], [900, 2100]]) {
      expect(a.terrain.heightAt(x, z, a.road)).toBe(b.terrain.heightAt(x, z, b.road));
    }
  });

  it('keeps the road surface above the terrain (never buried, never floating far)', () => {
    for (const id of ['green-highlands', 'alpine-roads', 'coastal-highway', 'desert-highway']) {
      const { terrain, road, env } = world(id);
      const edge = env.road.halfWidth + env.road.shoulderWidth;
      for (let s = 100; s < 3500; s += 37) {
        const p = road.pointAt(s);
        for (const lateral of [-edge, -env.road.halfWidth, 0, env.road.halfWidth, edge]) {
          const x = p.x - Math.cos(p.heading) * lateral;
          const z = p.z + Math.sin(p.heading) * lateral;
          const h = terrain.heightAt(x, z, road);
          expect(h).toBeLessThan(p.y);
          expect(p.y - h).toBeLessThan(0.45);
        }
      }
    }
  });
});

describe('Terrain chunks', () => {
  it('neighbouring chunks share identical edge heights', () => {
    const { terrain, road } = world('green-highlands');
    const size = 128;
    const a = buildChunkData(0, 2, 0, size, 4, terrain, road);
    const b = buildChunkData(1, 2, 0, size, 4, terrain, road);
    const c = buildChunkData(0, 3, 0, size, 4, terrain, road);
    const N = a.res + 1;
    for (let j = 0; j < N; j++) {
      expect(a.heights[j * N + (N - 1)]).toBeCloseTo(b.heights[j * N], 6);
    }
    for (let i = 0; i < N; i++) {
      expect(a.heights[(N - 1) * N + i]).toBeCloseTo(c.heights[i], 6);
    }
  });

  it('samples the rendered surface exactly at vertices', () => {
    const { terrain, road } = world('alpine-roads');
    const d = buildChunkData(-1, 1, 1, 128, 4, terrain, road);
    const N = d.res + 1;
    for (const [i, j] of [[0, 0], [5, 7], [N - 1, N - 1]]) {
      const s = sampleChunkSurface(d, d.x0 + i * d.spacing, d.z0 + j * d.spacing);
      expect(s.height).toBeCloseTo(d.heights[j * N + i], 5);
    }
  });

  it('plans chunks inside the view radius with LOD rings', () => {
    const rings = [170, 330, 520, 720];
    const plan = planChunks(50, 60, 128, rings);
    expect(plan.length).toBeGreaterThan(50);
    for (const e of plan) expect(e.dist).toBeLessThanOrEqual(720);
    const here = plan.find((e) => e.ix === 0 && e.iz === 0)!;
    expect(here.lod).toBe(0);
    expect(lodForDistance(400, rings)).toBe(2);
    expect(lodForDistance(9999, rings)).toBe(-1);
  });

  it('recycles chunks as the car moves (old keys drop out of the plan)', () => {
    const rings = [170, 330, 520, 720];
    const before = new Set(planChunks(0, 0, 128, rings).map((e) => e.key));
    const after = new Set(planChunks(0, 3000, 128, rings).map((e) => e.key));
    const overlap = [...before].filter((k) => after.has(k));
    expect(overlap.length).toBe(0);
    expect(Math.abs(before.size - after.size)).toBeLessThan(10);
  });
});

describe('Scenery placement', () => {
  it('never places trees, rocks or grass on the road', () => {
    for (const id of ['green-highlands', 'misty-forest', 'coastal-highway']) {
      const { env, terrain, road, seed } = world(id);
      const edge = env.road.halfWidth + env.road.shoulderWidth;
      for (const [ix, iz] of [[0, 1], [-1, 3], [0, 6], [1, 9]]) {
        const data = buildChunkData(ix, iz, 0, 128, 2, terrain, road);
        const batches = placeChunkScenery(env, data, terrain, seed, { density: 1, grass: true, grassDensity: 1 });
        for (const b of batches) {
          for (const item of b.items) {
            const q = road.query(item.x, item.z);
            expect(q.dist).toBeGreaterThan(edge);
            const surface = sampleChunkSurface(data, item.x, item.z).height;
            // Planted on (or slightly sunk into) the rendered ground, never floating.
            expect(item.y).toBeLessThanOrEqual(surface + 1e-6);
            expect(surface - item.y).toBeLessThan(5);
          }
        }
      }
    }
  });

  it('places roadside furniture deterministically', () => {
    const a = world('liminal-suburbia', 3);
    const b = world('liminal-suburbia', 3);
    const seg = a.road.segments[2];
    const pa = placeRoadside(a.env, a.road, seg, a.terrain, 3, false);
    const pb = placeRoadside(b.env, b.road, b.road.segments[2], b.terrain, 3, false);
    expect(pa.placements.length).toBeGreaterThan(0);
    expect(pa).toEqual(pb);
    expect(pa.placements.some((p) => p.id.startsWith('house'))).toBe(true);
  });
});
