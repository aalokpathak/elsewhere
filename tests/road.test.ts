import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS, getEnvironment } from '../src/config/environments';
import { DEG } from '../src/core/math';
import { createRoadPoint, RoadGenerator, ROAD_STEP } from '../src/world/RoadGenerator';
import { TerrainSampler } from '../src/world/TerrainGenerator';

function makeRoad(envId = 'green-highlands', seed = 1234) {
  const env = getEnvironment(envId);
  const terrain = new TerrainSampler(env, seed);
  return new RoadGenerator(env.road, seed, (x, z) => terrain.baseHeight(x, z));
}

describe('RoadGenerator', () => {
  it('produces evenly spaced, gap-free samples', () => {
    const road = makeRoad();
    road.ensureAheadS(5000);
    const a = createRoadPoint();
    const b = createRoadPoint();
    for (let i = road.firstIndex; i < road.lastIndex; i++) {
      road.sample(i, a);
      road.sample(i + 1, b);
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      expect(d).toBeGreaterThan(ROAD_STEP * 0.99);
      expect(d).toBeLessThanOrEqual(ROAD_STEP * 1.0001);
    }
  });

  it('keeps heading, curvature and elevation continuous across segment seams', () => {
    for (const env of ENVIRONMENTS) {
      const road = makeRoad(env.id, 77);
      road.ensureAheadS(6000);
      const a = createRoadPoint();
      const b = createRoadPoint();
      let maxDH = 0;
      let maxDY = 0;
      for (let i = road.firstIndex; i < road.lastIndex; i++) {
        road.sample(i, a);
        road.sample(i + 1, b);
        maxDH = Math.max(maxDH, Math.abs(b.heading - a.heading));
        maxDY = Math.max(maxDY, Math.abs(b.y - a.y));
      }
      // Tightest radius ⇒ heading change per step ≤ step / minRadius.
      expect(maxDH).toBeLessThanOrEqual(ROAD_STEP / env.road.minRadius + 1e-9);
      expect(maxDY).toBeLessThanOrEqual(ROAD_STEP * env.road.maxGrade + 1e-6);
    }
  });

  it('never folds back: heading is bounded and Z strictly increases', () => {
    for (const env of ENVIRONMENTS) {
      for (const seed of [1, 99, 31337]) {
        const road = makeRoad(env.id, seed);
        road.ensureAheadS(12000);
        const p = createRoadPoint();
        let lastZ = -Infinity;
        for (let i = road.firstIndex; i <= road.lastIndex; i++) {
          road.sample(i, p);
          expect(Math.abs(p.heading)).toBeLessThanOrEqual(env.road.maxHeadingDeg * DEG + 1e-6);
          expect(p.z).toBeGreaterThan(lastZ);
          lastZ = p.z;
        }
      }
    }
  }, 60000);

  it('is deterministic for a seed and different across seeds', () => {
    const a = makeRoad('coastal-highway', 42);
    const b = makeRoad('coastal-highway', 42);
    const c = makeRoad('coastal-highway', 43);
    for (const r of [a, b, c]) r.ensureAheadS(4000);
    const pa = a.pointAt(3500);
    const pb = b.pointAt(3500);
    const pc = c.pointAt(3500);
    expect(pa).toEqual(pb);
    expect(Math.hypot(pa.x - pc.x, pa.z - pc.z)).toBeGreaterThan(1);
  });

  it('answers nearest-point queries with correct distance and lateral sign', () => {
    const road = makeRoad('green-highlands', 5);
    road.ensureAheadS(3000);
    for (const s of [300, 900, 1777, 2500]) {
      const p = road.pointAt(s);
      for (const lateral of [-12, -3, 0, 4, 25]) {
        const x = p.x - Math.cos(p.heading) * lateral;
        const z = p.z + Math.sin(p.heading) * lateral;
        const q = road.query(x, z);
        expect(q.s).toBeCloseTo(s, 0);
        expect(q.lateral).toBeCloseTo(lateral, 1);
        expect(q.dist).toBeCloseTo(Math.abs(lateral), 1);
      }
    }
  });

  it('trims old road so memory stays bounded on long drives', () => {
    const road = makeRoad('desert-highway', 9);
    let maxSamples = 0;
    for (let s = 0; s < 60000; s += 500) {
      road.ensureAheadS(s + 2000);
      road.trimBefore(s - 3000);
      maxSamples = Math.max(maxSamples, road.sampleCount);
    }
    expect(road.endS).toBeGreaterThan(60000);
    expect(maxSamples).toBeLessThan(4000);
    expect(road.pointAt(59000).s).toBeCloseTo(59000, 5);
  });

  it('reset clears generated data and reproduces the same road', () => {
    const road = makeRoad('liminal-suburbia', 21);
    road.ensureAheadS(5000);
    const before = road.pointAt(4000);
    road.trimBefore(3000);
    road.reset();
    expect(road.startS).toBe(0);
    expect(road.endS).toBe(0);
    road.ensureAheadS(5000);
    expect(road.pointAt(4000)).toEqual(before);
  });
});
