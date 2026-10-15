import type { RGB } from '../core/math';
import { createRoadQuery, type RoadGenerator } from './RoadGenerator';
import type { TerrainSampler } from './TerrainGenerator';

/**
 * Pure terrain-chunk construction (no three.js), so it can be unit-tested and
 * would be easy to move into a worker.
 */

export interface ChunkKey {
  ix: number;
  iz: number;
}

export interface ChunkData {
  ix: number;
  iz: number;
  lod: number;
  size: number;
  spacing: number;
  res: number;
  x0: number;
  z0: number;
  /** Inner vertex heights, row-major (res + 1)². */
  heights: Float32Array;
  /** Distance to the road centreline per inner vertex. */
  roadDist: Float32Array;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
  minY: number;
  maxY: number;
}

export const chunkKey = (ix: number, iz: number): string => `${ix},${iz}`;

export function buildChunkData(
  ix: number,
  iz: number,
  lod: number,
  size: number,
  spacing: number,
  terrain: TerrainSampler,
  road: RoadGenerator,
): ChunkData {
  const res = Math.max(1, Math.round(size / spacing));
  const sp = size / res;
  const N = res + 1;
  const G = N + 2;
  const x0 = ix * size;
  const z0 = iz * size;
  const flatExtra = sp > 2 ? sp : 0;
  const q = createRoadQuery();

  // Heights including a one-vertex border ring for seamless normals.
  const hb = new Float64Array(G * G);
  const roadDist = new Float32Array(N * N);
  for (let gj = 0; gj < G; gj++) {
    const z = z0 + (gj - 1) * sp;
    for (let gi = 0; gi < G; gi++) {
      const x = x0 + (gi - 1) * sp;
      hb[gj * G + gi] = terrain.heightAt(x, z, road, flatExtra, q);
      if (gi >= 1 && gi <= N && gj >= 1 && gj <= N) roadDist[(gj - 1) * N + (gi - 1)] = q.dist;
    }
  }

  const skirtDepth = 2 + sp * 1.5;
  const vCount = N * N + 4 * N;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const heights = new Float32Array(N * N);
  const col: RGB = [0, 0, 0];
  let minY = Infinity;
  let maxY = -Infinity;
  const uvScale = 1 / 8;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const g = (j + 1) * G + (i + 1);
      const h = hb[g];
      const dx = (hb[g + 1] - hb[g - 1]) / (2 * sp);
      const dz = (hb[g + G] - hb[g - G]) / (2 * sp);
      const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      const v = j * N + i;
      heights[v] = h;
      positions[v * 3] = i * sp;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = j * sp;
      normals[v * 3] = -dx * inv;
      normals[v * 3 + 1] = inv;
      normals[v * 3 + 2] = -dz * inv;
      terrain.colorAt(x0 + i * sp, z0 + j * sp, h, Math.sqrt(dx * dx + dz * dz), roadDist[v], col);
      colors[v * 3] = col[0];
      colors[v * 3 + 1] = col[1];
      colors[v * 3 + 2] = col[2];
      uvs[v * 2] = i * sp * uvScale;
      uvs[v * 2 + 1] = j * sp * uvScale;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  }

  // Skirt vertices: duplicates of the edge vertices pushed down to hide LOD cracks.
  const edgeVertex = (e: number, k: number): number => {
    switch (e) {
      case 0:
        return k; // j = 0, +X
      case 1:
        return k * N + (N - 1); // i = N-1, +Z
      case 2:
        return (N - 1) * N + (N - 1 - k); // j = N-1, -X
      default:
        return (N - 1 - k) * N; // i = 0, -Z
    }
  };
  const skirtBase = N * N;
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < N; k++) {
      const src = edgeVertex(e, k);
      const dst = skirtBase + e * N + k;
      positions[dst * 3] = positions[src * 3];
      positions[dst * 3 + 1] = positions[src * 3 + 1] - skirtDepth;
      positions[dst * 3 + 2] = positions[src * 3 + 2];
      for (let c = 0; c < 3; c++) {
        normals[dst * 3 + c] = normals[src * 3 + c];
        colors[dst * 3 + c] = colors[src * 3 + c] * 0.8;
      }
      uvs[dst * 2] = uvs[src * 2];
      uvs[dst * 2 + 1] = uvs[src * 2 + 1];
    }
  }

  const triCount = res * res * 2 + 4 * res * 2;
  const indices = vCount > 65535 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let p = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * N + i;
      const b = (j + 1) * N + i;
      const c = j * N + i + 1;
      const d = (j + 1) * N + i + 1;
      indices[p++] = a;
      indices[p++] = b;
      indices[p++] = c;
      indices[p++] = c;
      indices[p++] = b;
      indices[p++] = d;
    }
  }
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < res; k++) {
      const e0 = edgeVertex(e, k);
      const e1 = edgeVertex(e, k + 1);
      const s0 = skirtBase + e * N + k;
      const s1 = s0 + 1;
      indices[p++] = e0;
      indices[p++] = e1;
      indices[p++] = s0;
      indices[p++] = e1;
      indices[p++] = s1;
      indices[p++] = s0;
    }
  }

  return { ix, iz, lod, size, spacing: sp, res, x0, z0, heights, roadDist, positions, normals, colors, uvs, indices, minY, maxY };
}

/**
 * Exact height of the rendered chunk surface at world (x, z), using the same
 * triangle split as the index buffer — scenery placed with this never floats.
 */
export function sampleChunkSurface(data: ChunkData, x: number, z: number, out?: { height: number; slope: number; roadDist: number }) {
  const N = data.res + 1;
  const sp = data.spacing;
  const lx = Math.min(Math.max((x - data.x0) / sp, 0), data.res - 1e-6);
  const lz = Math.min(Math.max((z - data.z0) / sp, 0), data.res - 1e-6);
  const i = Math.floor(lx);
  const j = Math.floor(lz);
  const u = lx - i;
  const v = lz - j;
  const H = data.heights;
  const D = data.roadDist;
  const i00 = j * N + i;
  const i10 = i00 + 1;
  const i01 = i00 + N;
  const i11 = i01 + 1;
  let height: number;
  let gx: number;
  let gz: number;
  let dist: number;
  if (u + v <= 1) {
    height = H[i00] + u * (H[i10] - H[i00]) + v * (H[i01] - H[i00]);
    dist = D[i00] + u * (D[i10] - D[i00]) + v * (D[i01] - D[i00]);
    gx = (H[i10] - H[i00]) / sp;
    gz = (H[i01] - H[i00]) / sp;
  } else {
    height = H[i11] + (1 - u) * (H[i01] - H[i11]) + (1 - v) * (H[i10] - H[i11]);
    dist = D[i11] + (1 - u) * (D[i01] - D[i11]) + (1 - v) * (D[i10] - D[i11]);
    gx = (H[i11] - H[i01]) / sp;
    gz = (H[i11] - H[i10]) / sp;
  }
  const res = out ?? { height: 0, slope: 0, roadDist: 0 };
  res.height = height;
  res.slope = Math.sqrt(gx * gx + gz * gz);
  res.roadDist = dist;
  return res;
}

/** Chooses the LOD ring for a distance; returns -1 beyond the last ring. */
export function lodForDistance(dist: number, rings: readonly number[]): number {
  for (let i = 0; i < rings.length; i++) if (dist <= rings[i]) return i;
  return -1;
}

export interface ChunkPlanEntry {
  key: string;
  ix: number;
  iz: number;
  lod: number;
  dist: number;
}

/** All chunks whose nearest point lies within the outermost LOD ring. */
export function planChunks(cx: number, cz: number, size: number, rings: readonly number[]): ChunkPlanEntry[] {
  const R = rings[rings.length - 1];
  const r = Math.ceil(R / size) + 1;
  const cix = Math.floor(cx / size);
  const ciz = Math.floor(cz / size);
  const out: ChunkPlanEntry[] = [];
  for (let iz = ciz - r; iz <= ciz + r; iz++) {
    for (let ix = cix - r; ix <= cix + r; ix++) {
      const minX = ix * size;
      const minZ = iz * size;
      const dx = Math.max(minX - cx, 0, cx - (minX + size));
      const dz = Math.max(minZ - cz, 0, cz - (minZ + size));
      const dist = Math.sqrt(dx * dx + dz * dz);
      const lod = lodForDistance(dist, rings);
      if (lod >= 0) out.push({ key: chunkKey(ix, iz), ix, iz, lod, dist });
    }
  }
  return out;
}
