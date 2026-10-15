import * as THREE from 'three';
import type { GraphicsProfile } from '../config/graphics';
import { buildChunkData, lodForDistance, planChunks, type ChunkPlanEntry } from './ChunkBuilder';
import type { EnvironmentPreset } from './environments/types';
import type { RoadGenerator } from './RoadGenerator';
import { placeChunkScenery } from './SceneryGenerator';
import type { InstanceRefs, SceneryRenderer } from './SceneryRenderer';
import type { TerrainSampler } from './TerrainGenerator';

interface TerrainChunk {
  key: string;
  ix: number;
  iz: number;
  lod: number;
  mesh: THREE.Mesh;
  refs: InstanceRefs;
}

/** Hysteresis (metres) before a chunk changes LOD or is unloaded. */
const LOD_MARGIN = 14;
const UNLOAD_MARGIN = 72;

/**
 * Streams terrain chunks (and the natural scenery on them) around the car.
 * Work is time-sliced so a frame never spends more than the profile's budget
 * building geometry. Memory stays bounded: chunks outside the radius are
 * disposed and their instances returned to the pools.
 */
export class ChunkManager {
  private readonly chunks = new Map<string, TerrainChunk>();
  private plan: ChunkPlanEntry[] = [];
  private planX = Infinity;
  private planZ = Infinity;
  private queue: ChunkPlanEntry[] = [];
  readonly group = new THREE.Group();
  builtTotal = 0;

  constructor(
    parent: THREE.Object3D,
    private readonly env: EnvironmentPreset,
    private readonly terrain: TerrainSampler,
    private readonly road: RoadGenerator,
    private readonly profile: GraphicsProfile,
    private readonly material: THREE.Material,
    private readonly scenery: SceneryRenderer,
    private readonly seed: number,
  ) {
    this.group.name = 'terrain';
    parent.add(this.group);
  }

  get count(): number {
    return this.chunks.size;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Re-plans when the car has moved, unloads far chunks and builds within budget. */
  update(cx: number, cz: number, fx: number, fz: number, budgetMs: number): void {
    const moved = Math.hypot(cx - this.planX, cz - this.planZ);
    if (moved > 6) this.replan(cx, cz, fx, fz);
    const start = performance.now();
    while (this.queue.length && performance.now() - start < budgetMs) {
      const next = this.queue.shift()!;
      this.buildChunk(next);
    }
  }

  /** Builds everything needed right now (used behind the loading screen). */
  async buildAll(cx: number, cz: number, fx: number, fz: number, onProgress?: (f: number) => void): Promise<void> {
    this.replan(cx, cz, fx, fz);
    const total = Math.max(1, this.queue.length);
    let last = performance.now();
    while (this.queue.length) {
      this.buildChunk(this.queue.shift()!);
      if (performance.now() - last > 24) {
        onProgress?.(1 - this.queue.length / total);
        await new Promise((r) => setTimeout(r, 0));
        last = performance.now();
      }
    }
    onProgress?.(1);
  }

  private replan(cx: number, cz: number, fx: number, fz: number): void {
    this.planX = cx;
    this.planZ = cz;
    const rings = this.profile.lodRings;
    const R = rings[rings.length - 1];
    this.plan = planChunks(cx, cz, this.profile.chunkSize, rings);
    const wanted = new Set<string>();
    const queue: (ChunkPlanEntry & { priority: number })[] = [];
    // Bias towards what the camera is looking at.
    const ax = cx + fx * 120;
    const az = cz + fz * 120;
    const size = this.profile.chunkSize;
    for (const e of this.plan) {
      wanted.add(e.key);
      const existing = this.chunks.get(e.key);
      let lod = e.lod;
      if (existing) {
        if (existing.lod === lod) continue;
        // Only switch LOD when comfortably inside the new ring.
        const lo = lodForDistance(Math.max(0, e.dist - LOD_MARGIN), rings);
        const hi = lodForDistance(e.dist + LOD_MARGIN, rings);
        if (lo !== hi) continue;
        lod = lo;
        if (existing.lod === lod) continue;
      }
      const ccx = (e.ix + 0.5) * size;
      const ccz = (e.iz + 0.5) * size;
      const priority = Math.hypot(ccx - ax, ccz - az) + (existing ? 60 : 0) + lod * 40;
      queue.push({ ...e, lod, priority });
    }
    queue.sort((a, b) => a.priority - b.priority);
    this.queue = queue;
    // Unload chunks well outside the radius.
    for (const [key, chunk] of this.chunks) {
      if (wanted.has(key)) continue;
      const minX = chunk.ix * size;
      const minZ = chunk.iz * size;
      const dx = Math.max(minX - cx, 0, cx - (minX + size));
      const dz = Math.max(minZ - cz, 0, cz - (minZ + size));
      if (Math.hypot(dx, dz) > R + UNLOAD_MARGIN) this.disposeChunk(chunk);
    }
  }

  private buildChunk(e: ChunkPlanEntry): void {
    const spacing = this.profile.lodSpacing[Math.min(e.lod, this.profile.lodSpacing.length - 1)];
    const data = buildChunkData(e.ix, e.iz, e.lod, this.profile.chunkSize, spacing, this.terrain, this.road);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const size = data.size;
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(0, data.minY - 40, 0),
      new THREE.Vector3(size, data.maxY, size),
    );
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(data.x0, 0, data.z0);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = `chunk ${e.key}`;

    const batches = placeChunkScenery(this.env, data, this.terrain, this.seed, {
      density: this.profile.sceneryDensity,
      grass: this.profile.grass,
      grassDensity: this.profile.grassDensity,
    });

    // Swap in place so a re-LOD never leaves a hole.
    const old = this.chunks.get(e.key);
    if (old) this.disposeChunk(old);
    const refs = this.scenery.addScenery(batches);
    this.group.add(mesh);
    this.chunks.set(e.key, { key: e.key, ix: e.ix, iz: e.iz, lod: e.lod, mesh, refs });
    this.builtTotal++;
  }

  private disposeChunk(chunk: TerrainChunk): void {
    this.scenery.remove(chunk.refs);
    chunk.mesh.removeFromParent();
    chunk.mesh.geometry.dispose();
    this.chunks.delete(chunk.key);
  }

  dispose(): void {
    for (const chunk of [...this.chunks.values()]) this.disposeChunk(chunk);
    this.queue = [];
    this.group.removeFromParent();
  }
}
