import type { RGB } from '../core/math';
import { hash01, hashInts, Rng } from '../core/random';
import type { Detail } from './assets/nature';
import type { StructureId } from './assets/structures';
import { FENCE_SECTION } from './assets/structures';
import { sampleChunkSurface, type ChunkData } from './ChunkBuilder';
import type { EnvironmentPreset, SceneryKind, SceneryLayer } from './environments/types';
import { createRoadPoint, type RoadGenerator, type RoadSegmentInfo } from './RoadGenerator';
import { hexToLinear, type TerrainSampler } from './TerrainGenerator';

/**
 * Pure placement logic for natural scenery (per terrain chunk) and for
 * road-anchored structures (per road segment). The renderer just consumes
 * these lists, so rules like "no trees on the road" are unit-testable.
 */

export interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number | [number, number, number];
  tint?: RGB;
}

export interface SceneryBatch {
  kind: SceneryKind;
  detail: Detail;
  items: Placement[];
}

export interface SceneryOptions {
  density: number;
  grass: boolean;
  grassDensity: number;
}

/** Global multiplier on preset densities (presets are authored relative to each other). */
const DENSITY_SCALE = 3;

const SMALL_KINDS = new Set<SceneryKind>(['shrub', 'rock']);
const SINK: Partial<Record<SceneryKind, number>> = {
  broadleaf: 0.2,
  conifer: 0.25,
  birch: 0.2,
  deadtree: 0.2,
  cactus: 0.15,
  rock: 0.3,
  boulder: 0.6,
  mesa: 4,
  shrub: 0.1,
};

const tintCache = new Map<string, RGB>();
function tint(hex: string): RGB {
  let c = tintCache.get(hex);
  if (!c) {
    c = hexToLinear(hex);
    tintCache.set(hex, c);
  }
  return c;
}

export function placeChunkScenery(
  env: EnvironmentPreset,
  data: ChunkData,
  terrain: TerrainSampler,
  seed: number,
  opts: SceneryOptions,
): SceneryBatch[] {
  const batches: SceneryBatch[] = [];
  const seaLevel = env.terrain.seaLevel;
  let minDist = Infinity;
  for (let i = 0; i < data.roadDist.length; i++) if (data.roadDist[i] < minDist) minDist = data.roadDist[i];
  const sample = { height: 0, slope: 0, roadDist: 0 };
  const groundColor: RGB = [0, 0, 0];

  env.scenery.forEach((layer: SceneryLayer, layerIndex) => {
    if (layer.nearOnly && (data.lod > 0 || !opts.grass)) return;
    if (SMALL_KINDS.has(layer.kind) && data.lod > 1) return;
    if (layer.maxRoadDistance !== undefined && minDist > layer.maxRoadDistance + data.size) return;
    const detail: Detail = data.lod <= 1 ? 'high' : 'low';
    const mult = layer.nearOnly ? opts.grassDensity : opts.density;
    const maxRoad = layer.maxRoadDistance ?? (layer.nearOnly ? 70 : Infinity);
    const count = Math.round(((layer.density * DENSITY_SCALE * data.size * data.size) / 10000) * mult);
    const rng = new Rng(hashInts(seed, data.ix, data.iz, layerIndex, 0x5ce));
    const items: Placement[] = [];
    for (let n = 0; n < count; n++) {
      // Draw every random number up front so rejections never shift the stream.
      const x = data.x0 + rng.next() * data.size;
      const z = data.z0 + rng.next() * data.size;
      const rot = rng.next() * Math.PI * 2;
      const scale = layer.scale[0] + (layer.scale[1] - layer.scale[0]) * rng.next();
      const tintIndex = Math.floor(rng.next() * layer.tints.length);
      const jitter = rng.next();
      if (layer.clusterFrequency > 0) {
        const c = terrain.cluster(x, z, layer.clusterFrequency) + (jitter - 0.5) * 0.25;
        if (c < layer.clusterThreshold) continue;
      }
      sampleChunkSurface(data, x, z, sample);
      const clearance = layer.minRoadDistance + (layer.nearOnly ? 0 : scale * 0.6);
      if (sample.roadDist < clearance || sample.roadDist > maxRoad) continue;
      if (sample.slope > layer.maxSlope) continue;
      if (layer.minHeight !== undefined && sample.height < layer.minHeight) continue;
      if (layer.maxHeight !== undefined && sample.height > layer.maxHeight) continue;
      if (seaLevel !== undefined && sample.height < seaLevel + 0.8) continue;
      let t: RGB;
      if (layer.nearOnly) {
        // Grass takes its colour from the ground it grows from.
        terrain.colorAt(x, z, sample.height, sample.slope, sample.roadDist, groundColor);
        const b = 1.25 + jitter * 0.3;
        t = [groundColor[0] * b, groundColor[1] * b, groundColor[2] * b];
      } else {
        t = tint(layer.tints[tintIndex]);
      }
      const sink = (SINK[layer.kind] ?? 0) * scale;
      items.push({ x, y: sample.height - sink, z, rot, scale, tint: t });
    }
    if (items.length) batches.push({ kind: layer.kind, detail, items });
  });
  return batches;
}

// -----------------------------------------------------------------------------
// Road-anchored structures

export interface StructurePlacement extends Placement {
  id: StructureId;
  /** Marks light sources that anomalies may flicker. */
  light?: boolean;
}

export interface SegmentFurniture {
  placements: StructurePlacement[];
  /** World-space line segment pairs (x, y, z, x, y, z) for overhead wires. */
  wires: number[];
}

const ROOF_TINTS = ['#4a4f57', '#5b4a42', '#3f464d', '#6b5e55', '#545a52', '#4d4640'];
const CAR_TINTS = ['#6d7880', '#8c8a86', '#3d4650', '#7d5a52', '#5d6b5e', '#b8b4aa', '#2c2f33'];
const SIGN_TINTS = ['#2f6b4c', '#2f4f7b', '#2f6b4c', '#6b5a2f'];

function sideOf(side: 'left' | 'right' | 'both' | 'alternate', k: number): number[] {
  switch (side) {
    case 'left':
      return [-1];
    case 'right':
      return [1];
    case 'both':
      return [-1, 1];
    default:
      return [k % 2 === 0 ? 1 : -1];
  }
}

/** Local (x, z) offset rotated by yaw, added to a base point. */
function localToWorld(bx: number, bz: number, rot: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [bx + c * lx + s * lz, bz - s * lx + c * lz];
}

export function placeRoadside(
  env: EnvironmentPreset,
  road: RoadGenerator,
  seg: RoadSegmentInfo,
  terrain: TerrainSampler,
  seed: number,
  uncanny: boolean,
): SegmentFurniture {
  const placements: StructurePlacement[] = [];
  const wires: number[] = [];
  const edge = env.road.halfWidth + env.road.shoulderWidth;
  const p = createRoadPoint();
  const flatLimit = edge + 1.5;

  env.roadside.forEach((f, fi) => {
    const spacing = f.kind === 'fence' ? FENCE_SECTION : f.spacing;
    const k0 = Math.ceil(seg.startS / spacing);
    const k1 = Math.ceil(seg.endS / spacing) - 1;
    for (let k = k0; k <= k1; k++) {
      const s = k * spacing;
      if (s < 40) continue; // keep the very start of the drive uncluttered
      const rng = new Rng(hashInts(seed, fi, k, 0x40ad));
      const fillRoll = f.kind === 'fence' ? hash01(seed, fi, Math.floor(s / 140)) : rng.next();
      if (fillRoll > f.fill) continue;
      road.pointAt(s, p);
      const rx = -Math.cos(p.heading);
      const rz = Math.sin(p.heading);
      for (const side of sideOf(f.side, k)) {
        const lateral = side * (edge + f.offset);
        const x = p.x + rx * lateral;
        const z = p.z + rz * lateral;
        const ground = Math.abs(lateral) <= flatLimit ? p.y - 0.3 : terrain.heightAt(x, z, road) - 0.25;
        const towardRoad = side > 0 ? p.heading : p.heading + Math.PI;
        const facing = side > 0 ? p.heading + Math.PI / 2 : p.heading - Math.PI / 2;
        switch (f.kind) {
          case 'streetlight': {
            placements.push({ id: 'streetlight-pole', x, y: ground, z, rot: towardRoad, scale: 1 });
            placements.push({ id: 'streetlight-lens', x, y: ground, z, rot: towardRoad, scale: 1, light: true });
            const [lx, lz] = localToWorld(x, z, towardRoad, 2.3, 0);
            const q = road.query(lx, lz);
            placements.push({ id: 'light-pool', x: lx, y: q.y + 0.04, z: lz, rot: 0, scale: [20, 1, 20] });
            break;
          }
          case 'delineator':
            placements.push({ id: 'delineator', x, y: ground, z, rot: p.heading, scale: 1 });
            placements.push({ id: 'reflector', x, y: ground, z, rot: p.heading, scale: 1 });
            break;
          case 'fence':
            placements.push({ id: 'fence', x, y: ground, z, rot: p.heading, scale: 1 });
            break;
          case 'telephone-pole': {
            placements.push({ id: 'telephone-pole', x, y: ground, z, rot: p.heading, scale: 1 });
            // Wire to the next pole if that slot is filled.
            const nk = k + 1;
            const nrng = new Rng(hashInts(seed, fi, nk, 0x40ad));
            if (nrng.next() <= f.fill && nk * spacing <= road.endS) {
              const np = road.pointAt(nk * spacing);
              const nrx = -Math.cos(np.heading);
              const nrz = Math.sin(np.heading);
              const nx = np.x + nrx * lateral;
              const nz = np.z + nrz * lateral;
              const nground = terrain.heightAt(nx, nz, road) - 0.25;
              for (const off of [-1.0, 0.35, 1.0]) {
                const [ax, az] = localToWorld(x, z, p.heading, off, 0);
                const [bx, bz] = localToWorld(nx, nz, np.heading, off, 0);
                const ay = ground + 9.12;
                const by = nground + 9.12;
                const steps = 6;
                for (let i = 0; i < steps; i++) {
                  const t0 = i / steps;
                  const t1 = (i + 1) / steps;
                  const sag0 = Math.sin(t0 * Math.PI) * 0.9;
                  const sag1 = Math.sin(t1 * Math.PI) * 0.9;
                  wires.push(
                    ax + (bx - ax) * t0, ay + (by - ay) * t0 - sag0, az + (bz - az) * t0,
                    ax + (bx - ax) * t1, ay + (by - ay) * t1 - sag1, az + (bz - az) * t1,
                  );
                }
              }
            }
            break;
          }
          case 'sign':
            placements.push({ id: 'sign-post', x, y: ground, z, rot: p.heading + Math.PI, scale: 1 });
            placements.push({
              id: 'sign-panel', x, y: ground, z, rot: p.heading + Math.PI, scale: 1,
              tint: tint(SIGN_TINTS[Math.floor(rng.next() * SIGN_TINTS.length)]),
            });
            break;
          case 'mailbox':
            placements.push({ id: 'mailbox', x, y: ground, z, rot: facing, scale: 1 });
            break;
          case 'house': {
            const variantB = rng.next() < 0.45;
            const tints = f.tints ?? ['#e8e2d2'];
            const wall = tint(tints[Math.floor(rng.next() * tints.length)]);
            const roof = tint(ROOF_TINTS[Math.floor(rng.next() * ROOF_TINTS.length)]);
            // A very rare house that faces the wrong way — only when anomalies are on.
            const wrongWay = uncanny && rng.next() < 0.025;
            const rot = wrongWay ? facing + Math.PI : facing;
            const y = Math.min(
              terrain.heightAt(x, z, road),
              terrain.heightAt(...localToWorld(x, z, rot, 0, 5), road),
              terrain.heightAt(...localToWorld(x, z, rot, 6, -4), road),
              terrain.heightAt(...localToWorld(x, z, rot, -6, -4), road),
            );
            const pre = variantB ? 'house-b' : 'house-a';
            placements.push({ id: `${pre}-walls` as StructureId, x, y, z, rot, scale: 1, tint: wall });
            placements.push({ id: `${pre}-roof` as StructureId, x, y, z, rot, scale: 1, tint: roof });
            placements.push({ id: `${pre}-detail` as StructureId, x, y, z, rot, scale: 1 });
            if (rng.next() < 0.14) {
              const [wx, wz] = variantB ? localToWorld(x, z, rot, -2.4, 4.03) : localToWorld(x, z, rot, -1.4, 4.53);
              placements.push({ id: 'window-lit', x: wx, y: y + (variantB ? 4.3 : 1.7), z: wz, rot, scale: variantB ? [0.78, 1, 1] : 1, light: true });
            }
            break;
          }
        }
      }
    }
  });
  return { placements, wires };
}

// -----------------------------------------------------------------------------
// Indoor modules

/** True when a corridor wall has a junction opening at bay `k` on `side`. */
export function corridorGap(seed: number, k: number, side: number): boolean {
  if (k < 4) return false;
  return hash01(seed, k, side, 0x9a9) < 0.085;
}

/** Parking-structure outer wall style for the 4-bay block containing bay `k`. */
export function parkingFullWall(seed: number, k: number): boolean {
  return hash01(seed, Math.floor(k / 4), 0xa11) < 0.3;
}

export function placeIndoor(env: EnvironmentPreset, road: RoadGenerator, seg: RoadSegmentInfo, seed: number): SegmentFurniture {
  const ind = env.indoor!;
  const placements: StructurePlacement[] = [];
  const hw = env.road.halfWidth;
  const B = ind.baySpacing;
  const p = createRoadPoint();
  const k0 = Math.ceil(seg.startS / B);
  const k1 = Math.ceil(seg.endS / B) - 1;

  const at = (s: number, lateral: number) => {
    road.pointAt(s, p);
    const rx = -Math.cos(p.heading);
    const rz = Math.sin(p.heading);
    return { x: p.x + rx * lateral, z: p.z + rz * lateral, y: p.y, h: p.heading };
  };

  for (let k = k0; k <= k1; k++) {
    const s = k * B;
    const rng = new Rng(hashInts(seed, k, 0x1d00));
    if (ind.type === 'parking') {
      const pillarLines = [hw + 6.15, hw + 17.7];
      for (const lat of pillarLines) {
        for (const side of [-1, 1]) {
          if (rng.next() < 0.04) continue; // the occasional missing pillar
          const a = at(s, side * lat);
          placements.push({ id: 'pillar', x: a.x, y: a.y, z: a.z, rot: a.h, scale: 1 });
          if (lat === pillarLines[0] && k % 6 === 3 && side > 0) {
            const e = at(s, side * (lat - 0.36));
            placements.push({ id: 'exit-sign', x: e.x, y: e.y + 2.45, z: e.z, rot: e.h + Math.PI / 2, scale: 1, light: true });
          }
        }
      }
      const b = at(s, 0);
      placements.push({ id: 'beam', x: b.x, y: b.y, z: b.z, rot: b.h, scale: 1 });
      for (const lat of [0, -(hw + 2.8), hw + 2.8, -(hw + 12.8), hw + 12.8]) {
        const f = at(s + B / 2, lat);
        placements.push({ id: 'fixture', x: f.x, y: f.y, z: f.z, rot: f.h, scale: 1, light: true });
        placements.push({ id: 'light-pool', x: f.x, y: f.y + 0.03, z: f.z, rot: 0, scale: [8, 1, 8] });
      }
      // Bays: wheel stops everywhere, very few parked cars.
      for (let bay = 0; bay < 3; bay++) {
        const bs = s + 1.35 + bay * 2.7;
        for (const side of [-1, 1]) {
          for (const row of [0, 1]) {
            const back = row === 0 ? hw + 0.15 + 4.95 : hw + 0.15 + 5.3 + 1.4 + 0.35;
            const w = at(bs, side * back);
            placements.push({ id: 'wheel-stop', x: w.x, y: w.y, z: w.z, rot: w.h + Math.PI / 2, scale: 1 });
            if (rng.next() < 0.055) {
              const mid = row === 0 ? hw + 0.15 + 2.6 : hw + 0.15 + 5.3 + 1.4 + 2.6;
              const c = at(bs, side * mid);
              const face = row === 0 ? (side > 0 ? c.h + Math.PI / 2 : c.h - Math.PI / 2) : side > 0 ? c.h - Math.PI / 2 : c.h + Math.PI / 2;
              placements.push({
                id: 'parked-car', x: c.x, y: c.y, z: c.z, rot: face, scale: 1,
                tint: tint(CAR_TINTS[Math.floor(rng.next() * CAR_TINTS.length)]),
              });
            }
          }
        }
      }
    } else {
      const c = at(s + B / 2, 0);
      placements.push({ id: 'ceiling-panel', x: c.x, y: c.y, z: c.z, rot: c.h, scale: 1, light: true });
      for (const side of [-1, 1]) {
        const lat = side * (ind.floorHalfWidth - 0.02);
        const facing = side > 0 ? 0 : Math.PI;
        if (corridorGap(seed, k, side)) {
          const a = at(s + B / 2, lat);
          placements.push({ id: 'alcove', x: a.x, y: a.y, z: a.z, rot: a.h + Math.PI / 2 + facing, scale: 1 });
        } else if (rng.next() < 0.32) {
          const ds = s + 1.2 + rng.next() * (B - 2.4);
          const d = at(ds, lat);
          placements.push({ id: 'door', x: d.x, y: d.y, z: d.z, rot: d.h + Math.PI / 2 + facing, scale: 1 });
        }
      }
    }
  }
  return { placements, wires: [] };
}
