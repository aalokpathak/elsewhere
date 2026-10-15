import * as THREE from 'three';
import type { GraphicsProfile } from '../config/graphics';
import { clamp } from '../core/math';
import { createTerrainMaterial, createWindUniforms, type WindUniforms } from '../world/materials/NatureMaterials';
import {
  createRoadMaterial,
  createSurfaceMaterial,
  createSurfaceUniforms,
  type SurfaceUniforms,
} from '../world/materials/SurfaceMaterial';
import { ChunkManager } from '../world/ChunkManager';
import { DistantScenery } from '../world/DistantScenery';
import type { EnvironmentPreset } from '../world/environments/types';
import { createRoadPoint, createRoadQuery, RoadGenerator, type RoadQuery } from '../world/RoadGenerator';
import { buildSegmentMeshes, roadCrown, type BuiltSegment, type SegmentMaterials } from '../world/RoadMeshBuilder';
import { placeIndoor, placeRoadside, type StructurePlacement } from '../world/SceneryGenerator';
import { SceneryRenderer, type InstanceRefs } from '../world/SceneryRenderer';
import { TerrainSampler } from '../world/TerrainGenerator';
import type { AtmosphereState } from '../world/WeatherSystem';
import type { InstancePool } from '../world/InstancePool';

interface LiveSegment extends BuiltSegment {
  index: number;
  startS: number;
  endS: number;
  refs: InstanceRefs;
  lights: { pool: InstancePool; handle: number }[];
}

export type SurfaceKind = 'asphalt' | 'shoulder' | 'offroad' | 'water' | 'floor';

export interface GroundSample {
  height: number;
  surface: SurfaceKind;
  query: RoadQuery;
}

/**
 * Everything procedural about one drive: road, terrain chunks, scenery,
 * road-anchored structures and distant layers. One instance per drive; a
 * restart or environment change disposes it completely and builds a new one,
 * so nothing from the old world can leak.
 */
export class WorldManager {
  readonly root = new THREE.Group();
  readonly road: RoadGenerator;
  readonly terrain: TerrainSampler;
  readonly scenery: SceneryRenderer;
  readonly distant: DistantScenery;
  readonly surfaceUniforms: SurfaceUniforms = createSurfaceUniforms();
  readonly wind: WindUniforms = createWindUniforms();
  private readonly chunks: ChunkManager | null;
  private readonly segments = new Map<number, LiveSegment>();
  private readonly materials: THREE.Material[] = [];
  private readonly segMaterials: SegmentMaterials;
  private readonly terrainMaterial: THREE.Material | null;
  private readonly edge: number;
  private originX = 0;
  private originZ = 0;
  disposed = false;

  constructor(
    parent: THREE.Object3D,
    readonly env: EnvironmentPreset,
    readonly profile: GraphicsProfile,
    readonly seed: number,
    private readonly uncanny: boolean,
  ) {
    this.root.name = `world:${env.id}`;
    parent.add(this.root);
    this.terrain = new TerrainSampler(env, seed);
    this.road = new RoadGenerator(env.road, seed, (x, z) => this.terrain.baseHeight(x, z));
    this.edge = env.road.halfWidth + env.road.shoulderWidth;

    this.scenery = new SceneryRenderer(this.root, env, profile, this.wind);
    const roadMat = this.track(createRoadMaterial(env, this.surfaceUniforms));
    const guardrail = this.track(
      new THREE.MeshStandardMaterial({ color: '#a4a9ad', metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }),
    );
    const wire = this.track(new THREE.LineBasicMaterial({ color: '#1d1f22', transparent: true, opacity: 0.75 }));
    let ceiling: THREE.Material | undefined;
    let wall: THREE.Material | undefined;
    if (env.indoor) {
      const ind = env.indoor;
      ceiling = this.track(
        createSurfaceMaterial({
          mode: 'ceiling', markings: 'none', edgeLines: false, halfWidth: env.road.halfWidth,
          baseColor: ind.ceilingColor, shoulderColor: ind.ceilingColor, markColor: '#ffffff', centerColor: '#ffffff',
          shared: this.surfaceUniforms, roughness: 0.95,
        }),
      );
      wall = this.track(
        createSurfaceMaterial({
          mode: 'wall', markings: 'none', edgeLines: false, halfWidth: env.road.halfWidth,
          baseColor: ind.wallColor, shoulderColor: ind.wallColor, markColor: '#ffffff', centerColor: '#ffffff',
          accentColor: ind.accentColor, shared: this.surfaceUniforms, roughness: 0.9,
        }),
      );
    }
    this.segMaterials = { road: roadMat, ceiling, wall, guardrail, wire };

    if (env.kind === 'outdoor') {
      this.terrainMaterial = this.track(createTerrainMaterial());
      this.chunks = new ChunkManager(this.root, env, this.terrain, this.road, profile, this.terrainMaterial, this.scenery, seed);
    } else {
      this.terrainMaterial = null;
      this.chunks = null;
    }
    this.distant = new DistantScenery(this.root, env, seed, this.scenery);
  }

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  get viewDistance(): number {
    return this.env.kind === 'indoor' ? 220 : this.profile.viewDistance;
  }

  /** Road data needed for terrain within the view radius of world Z. */
  private ensureRoad(carZ: number, carS: number): void {
    const R = this.viewDistance;
    this.road.ensureAheadZ(carZ + R + this.profile.chunkSize * 1.5 + 120, 40);
    this.road.ensureAheadS(carS + R * this.profile.roadAhead + 400, 40);
    this.road.trimBefore(carS - (2.5 * R + 600));
  }

  /** Builds the starting area synchronously-ish, reporting progress (0..1). */
  async initialize(startS: number, onProgress?: (f: number) => void): Promise<void> {
    this.road.ensureAheadS(startS + 50);
    const p = this.road.pointAt(startS);
    this.ensureRoad(p.z, startS);
    this.updateSegments(startS, Infinity);
    onProgress?.(0.15);
    if (this.chunks) {
      await this.chunks.buildAll(p.x, p.z, Math.sin(p.heading), Math.cos(p.heading), (f) => onProgress?.(0.15 + f * 0.85));
    }
    if (this.disposed) return;
    this.distant.update(p.x, p.z, this.road, startS);
    this.scenery.flush();
    onProgress?.(1);
  }

  update(carX: number, carZ: number, fx: number, fz: number, carS: number, dt: number, time: number): void {
    this.ensureRoad(carZ, carS);
    this.updateSegments(carS, 2);
    this.chunks?.update(carX, carZ, fx, fz, this.profile.buildBudgetMs);
    this.distant.update(carX, carZ, this.road, carS);
    // Keep instance coordinates small (float precision) on long drives.
    if (Math.hypot(carX - this.originX, carZ - this.originZ) > 2000) {
      this.originX = Math.round(carX);
      this.originZ = Math.round(carZ);
      this.scenery.rebase(this.originX, this.originZ);
    }
    this.scenery.flush();
    this.surfaceUniforms.uTime.value = time;
    this.wind.uTime.value = time;
    void dt;
  }

  private updateSegments(carS: number, maxBuilds: number): void {
    const ahead = carS + this.viewDistance * this.profile.roadAhead;
    const behind = carS - 300;
    for (const [index, seg] of this.segments) {
      if (seg.endS < behind || seg.startS > ahead + 200) this.disposeSegment(index);
    }
    let built = 0;
    for (const info of this.road.segments) {
      if (info.endS < behind || info.startS > ahead) continue;
      if (info.startS < this.road.startS) continue;
      if (this.segments.has(info.index)) continue;
      if (info.endS > this.road.endS) continue;
      if (built >= maxBuilds) break;
      this.buildSegment(info);
      built++;
    }
  }

  private buildSegment(info: { index: number; startS: number; endS: number; curvature: number }): void {
    const furniture =
      this.env.kind === 'indoor'
        ? placeIndoor(this.env, this.road, info, this.seed)
        : placeRoadside(this.env, this.road, info, this.terrain, this.seed, this.uncanny);
    const built = buildSegmentMeshes(this.env, this.road, info, this.segMaterials, this.seed, furniture.wires);
    const posts: StructurePlacement[] = [];
    const p = createRoadPoint();
    for (const gp of built.guardrailPosts) {
      this.road.pointAt(gp.s, p);
      posts.push({
        id: 'guardrail-post',
        x: p.x - Math.cos(p.heading) * gp.lateral,
        y: p.y - 0.3,
        z: p.z + Math.sin(p.heading) * gp.lateral,
        rot: p.heading,
        scale: 1,
      });
    }
    const refs = this.scenery.addStructures([...furniture.placements, ...posts]);
    const lights: LiveSegment['lights'] = [];
    for (const pl of furniture.placements) {
      if (!pl.light) continue;
      const pool = this.scenery.structurePool(pl.id);
      const handles = refs.get(pool);
      if (handles) lights.push({ pool, handle: handles[lights.filter((l) => l.pool === pool).length] ?? -1 });
    }
    this.root.add(built.group);
    this.segments.set(info.index, { ...built, index: info.index, startS: info.startS, endS: info.endS, refs, lights });
  }

  private disposeSegment(index: number): void {
    const seg = this.segments.get(index);
    if (!seg) return;
    this.scenery.remove(seg.refs);
    seg.group.removeFromParent();
    for (const g of seg.geometries) g.dispose();
    this.segments.delete(index);
  }

  /** A light fixture near arc length `s` (for flicker anomalies). */
  findLightNear(s: number, minAhead: number): { pool: InstancePool; handle: number } | null {
    let best: { pool: InstancePool; handle: number } | null = null;
    for (const seg of this.segments.values()) {
      if (seg.endS < s + minAhead || seg.startS > s + minAhead + 250) continue;
      for (const l of seg.lights) if (l.handle > 0) best = l;
      if (best) return best;
    }
    return best;
  }

  /** Height and surface type of the ground under (x, z). */
  ground(x: number, z: number, out: GroundSample): GroundSample {
    const q = this.road.query(x, z, out.query);
    if (this.env.kind === 'indoor') {
      out.height = q.y;
      out.surface = 'floor';
      return out;
    }
    if (q.dist <= this.edge + 0.9) {
      out.height = q.y + roadCrown(this.env, q.lateral) - (q.dist > this.edge ? ((q.dist - this.edge) / 0.9) * 0.25 : 0);
      out.surface = q.dist <= this.env.road.halfWidth ? 'asphalt' : 'shoulder';
    } else {
      out.height = this.terrain.heightAt(x, z, this.road, 0, q);
      out.surface = 'offroad';
    }
    const sea = this.env.terrain.seaLevel;
    if (sea !== undefined && out.height < sea - 0.3) {
      out.surface = 'water';
    }
    return out;
  }

  createGroundSample(): GroundSample {
    return { height: 0, surface: 'asphalt', query: createRoadQuery() };
  }

  applyAtmosphere(state: AtmosphereState, lights: number, brightness: number, horizon: THREE.Color, sun: THREE.Color): void {
    this.surfaceUniforms.uWetness.value = state.wetness;
    this.surfaceUniforms.uMirage.value =
      this.env.id === 'desert-highway' ? (1 - state.wetness) * clamp(state.sunIntensity / 3, 0, 1) * 0.85 : 0;
    this.wind.uWind.value = state.wind;
    this.scenery.setLightLevel(lights);
    this.scenery.setDarkness(1 - brightness);
    const light = clamp(state.hemiIntensity * 0.55 + state.sunIntensity * 0.12, 0.05, 1.2);
    this.distant.setAtmosphere(horizon, light, sun);
    if (this.env.landmarks) {
      this.scenery.setLandmarkColor(new THREE.Color(this.env.landmarks.color).lerp(horizon, 0.12));
    }
  }

  get stats() {
    return {
      chunks: this.chunks?.count ?? 0,
      pendingChunks: this.chunks?.pending ?? 0,
      segments: this.segments.size,
      instances: this.scenery.instanceCount,
      roadSamples: this.road.sampleCount,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const index of [...this.segments.keys()]) this.disposeSegment(index);
    this.chunks?.dispose();
    this.distant.dispose();
    this.scenery.dispose();
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.root.removeFromParent();
  }
}
