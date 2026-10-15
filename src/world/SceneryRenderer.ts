import * as THREE from 'three';
import type { GraphicsProfile } from '../config/graphics';
import { buildSceneryGeometry, SWAY, type Detail } from './assets/nature';
import { buildStructureGeometry, STRUCTURE_SHADING, type StructureId } from './assets/structures';
import type { EnvironmentPreset, SceneryKind } from './environments/types';
import { InstancePool } from './InstancePool';
import { createFoliageMaterial, type WindUniforms } from './materials/NatureMaterials';
import type { Placement, SceneryBatch, StructurePlacement } from './SceneryGenerator';

/** Instances owned by one chunk or segment, grouped by pool. */
export type InstanceRefs = Map<InstancePool, number[]>;

const TREE_KINDS = new Set<SceneryKind>(['broadleaf', 'conifer', 'birch', 'deadtree', 'cactus', 'mesa']);

function sceneryCapacity(kind: SceneryKind, detail: Detail, profile: GraphicsProfile): number {
  if (kind === 'grass' || kind === 'reed') return profile.grassCapacity;
  if (kind === 'mesa') return 300;
  if (kind === 'boulder') return 2500;
  if (TREE_KINDS.has(kind)) return detail === 'high' ? 14000 : 26000;
  return 20000;
}

const STRUCTURE_CAPACITY: Partial<Record<StructureId, number>> = {
  'wheel-stop': 9000,
  pillar: 5000,
  fixture: 4000,
  'light-pool': 4000,
  fence: 3500,
  delineator: 2500,
  reflector: 2500,
  'guardrail-post': 5000,
  'ceiling-panel': 2500,
  door: 2500,
  beam: 2000,
};

let poolTexture: THREE.DataTexture | null = null;
function lightPoolTexture(): THREE.DataTexture {
  if (poolTexture) return poolTexture;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const v = Math.pow(1 - r, 2.2);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255);
      data[i + 3] = 255;
    }
  }
  poolTexture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  poolTexture.magFilter = THREE.LinearFilter;
  poolTexture.minFilter = THREE.LinearFilter;
  poolTexture.needsUpdate = true;
  return poolTexture;
}

export class SceneryRenderer {
  private readonly sceneryPools = new Map<string, InstancePool>();
  private readonly structurePools = new Map<StructureId, InstancePool>();
  private readonly materials: THREE.Material[] = [];
  private readonly foliage = new Map<SceneryKind, THREE.Material>();
  readonly group = new THREE.Group();

  readonly solidMaterial: THREE.MeshLambertMaterial;
  readonly lightMaterial: THREE.MeshBasicMaterial;
  readonly reflectorMaterial: THREE.MeshBasicMaterial;
  readonly poolMaterial: THREE.MeshBasicMaterial;
  readonly landmarkMaterial: THREE.MeshLambertMaterial;
  private readonly lightColor: THREE.Color;

  constructor(
    parent: THREE.Object3D,
    private readonly env: EnvironmentPreset,
    private readonly profile: GraphicsProfile,
    private readonly wind: WindUniforms,
  ) {
    this.group.name = 'scenery';
    parent.add(this.group);
    this.lightColor = new THREE.Color(env.indoor?.lightColor ?? '#ffd9a0');
    this.solidMaterial = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.lightMaterial = this.track(new THREE.MeshBasicMaterial({ vertexColors: true, color: this.lightColor }));
    this.reflectorMaterial = this.track(new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ffb347' }));
    this.poolMaterial = this.track(
      new THREE.MeshBasicMaterial({
        map: lightPoolTexture(),
        color: this.lightColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        fog: true,
      }),
    );
    this.landmarkMaterial = this.track(
      new THREE.MeshLambertMaterial({ vertexColors: true, color: env.landmarks?.color ?? '#333333' }),
    );
    // Landmarks live far beyond the terrain radius, so they get their own
    // long-range haze instead of the scene fog (which is clamped to terrain).
    this.landmarkMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        /* glsl */ `
        #ifdef USE_FOG
          float es_far = smoothstep(300.0, 3600.0, vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, es_far * 0.82);
        #endif
        `,
      );
    };
    this.landmarkMaterial.customProgramCacheKey = () => 'es-landmark';
  }

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private foliageMaterial(kind: SceneryKind): THREE.Material {
    let m = this.foliage.get(kind);
    if (!m) {
      const sway = SWAY[kind] ?? 0;
      m =
        sway > 0
          ? createFoliageMaterial(this.wind, {
              sway,
              side: kind === 'grass' || kind === 'reed' ? THREE.DoubleSide : THREE.FrontSide,
              flat: kind !== 'grass' && kind !== 'reed',
            })
          : this.solidMaterial;
      if (m !== this.solidMaterial) this.track(m);
      this.foliage.set(kind, m);
    }
    return m;
  }

  private sceneryPool(kind: SceneryKind, detail: Detail): InstancePool {
    const key = `${kind}:${detail}`;
    let pool = this.sceneryPools.get(key);
    if (!pool) {
      const shadows = this.profile.shadows === 'all' && TREE_KINDS.has(kind) && detail === 'high';
      pool = new InstancePool(buildSceneryGeometry(kind, detail), this.foliageMaterial(kind), sceneryCapacity(kind, detail, this.profile), {
        colors: true,
        castShadow: shadows,
        receiveShadow: kind !== 'grass',
        name: key,
      });
      this.group.add(pool.mesh);
      this.sceneryPools.set(key, pool);
    }
    return pool;
  }

  structurePool(id: StructureId): InstancePool {
    let pool = this.structurePools.get(id);
    if (!pool) {
      const shading = STRUCTURE_SHADING[id];
      const mat =
        shading === 'light'
          ? this.lightMaterial
          : shading === 'reflector'
            ? this.reflectorMaterial
            : shading === 'pool'
              ? this.poolMaterial
              : shading === 'landmark'
                ? this.landmarkMaterial
                : this.solidMaterial;
      const castShadow = this.profile.shadows === 'all' && shading === 'solid';
      pool = new InstancePool(buildStructureGeometry(id, this.env), mat, STRUCTURE_CAPACITY[id] ?? 1200, {
        colors: true,
        castShadow,
        receiveShadow: shading === 'solid',
        name: id,
      });
      if (shading === 'pool') pool.mesh.renderOrder = 2;
      this.group.add(pool.mesh);
      this.structurePools.set(id, pool);
    }
    return pool;
  }

  private push(refs: InstanceRefs, pool: InstancePool, p: Placement): void {
    const h = pool.add(p.x, p.y, p.z, p.rot, p.scale, p.tint);
    if (h < 0) return;
    let list = refs.get(pool);
    if (!list) {
      list = [];
      refs.set(pool, list);
    }
    list.push(h);
  }

  addScenery(batches: SceneryBatch[], refs: InstanceRefs = new Map()): InstanceRefs {
    for (const b of batches) {
      const pool = this.sceneryPool(b.kind, b.detail);
      for (const item of b.items) this.push(refs, pool, item);
    }
    return refs;
  }

  addStructures(items: StructurePlacement[], refs: InstanceRefs = new Map()): InstanceRefs {
    for (const item of items) this.push(refs, this.structurePool(item.id), item);
    return refs;
  }

  remove(refs: InstanceRefs): void {
    for (const [pool, handles] of refs) pool.removeAll(handles);
    refs.clear();
  }

  /** Light fixtures and streetlights: 0 = off (dark glass), 1 = fully lit. */
  setLightLevel(level: number): void {
    const off = new THREE.Color('#3a3c3e');
    this.lightMaterial.color.copy(off).lerp(this.lightColor.clone().multiplyScalar(1.6), Math.min(1, level));
    this.poolMaterial.color.copy(this.lightColor).multiplyScalar(level * (this.env.kind === 'indoor' ? 0.32 : 0.55));
    this.poolMaterial.visible = level > 0.02;
  }

  /** Reflectors glow when it is dark (they catch the headlights). */
  setDarkness(darkness: number): void {
    this.reflectorMaterial.color.setRGB(0.55 + darkness * 1.6, 0.32 + darkness * 0.9, 0.1 + darkness * 0.2);
  }

  setLandmarkColor(color: THREE.Color): void {
    this.landmarkMaterial.color.copy(color);
  }

  forEachPool(fn: (pool: InstancePool) => void): void {
    this.sceneryPools.forEach(fn);
    this.structurePools.forEach(fn);
  }

  rebase(x: number, z: number): void {
    this.forEachPool((p) => p.rebase(x, z));
  }

  flush(): void {
    this.forEachPool((p) => p.flush());
  }

  get instanceCount(): number {
    let n = 0;
    this.forEachPool((p) => (n += p.count));
    return n;
  }

  dispose(): void {
    this.forEachPool((p) => p.dispose(true));
    this.sceneryPools.clear();
    this.structurePools.clear();
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.group.removeFromParent();
  }
}
