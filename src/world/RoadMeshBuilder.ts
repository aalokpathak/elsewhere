import * as THREE from 'three';
import type { EnvironmentPreset } from './environments/types';
import { createRoadPoint, ROAD_STEP, type RoadGenerator, type RoadSegmentInfo } from './RoadGenerator';
import { corridorGap, parkingFullWall } from './SceneryGenerator';

/**
 * Builds the meshes for one road segment: the paved ribbon (or indoor floor),
 * guardrails, ceilings, walls and overhead wires. All geometry is local to the
 * segment's first sample so vertex positions stay small and precise.
 */

interface ProfilePoint {
  lat: number;
  dy: number;
  /** roadUv.x: lateral metres for floors, height for walls. */
  u: number;
}

/** Arc-length texture coordinates wrap every 10.8 km (a multiple of every marking period). */
const UV_WRAP = 10800;

export interface SegmentMaterials {
  road: THREE.Material;
  ceiling?: THREE.Material;
  wall?: THREE.Material;
  guardrail: THREE.Material;
  wire: THREE.LineBasicMaterial;
}

export interface BuiltSegment {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  /** Arc-length positions of guardrail posts per side (for the instance pool). */
  guardrailPosts: { s: number; lateral: number }[];
}

function buildRibbon(
  road: RoadGenerator,
  g0: number,
  g1: number,
  profile: ProfilePoint[],
  ox: number,
  oz: number,
  include?: (s: number) => boolean,
): THREE.BufferGeometry | null {
  const P = profile.length;
  const p = createRoadPoint();
  const rows = g1 - g0 + 1;
  if (rows < 2 || P < 2) return null;
  const positions = new Float32Array(rows * P * 3);
  const uvs = new Float32Array(rows * P * 2);
  const startS = g0 * ROAD_STEP;
  const offset = Math.floor(startS / UV_WRAP) * UV_WRAP;
  const keep: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    road.sample(g0 + r, p);
    keep.push(include ? include(p.s) : true);
    const rx = -Math.cos(p.heading);
    const rz = Math.sin(p.heading);
    for (let k = 0; k < P; k++) {
      const v = r * P + k;
      const pp = profile[k];
      positions[v * 3] = p.x + rx * pp.lat - ox;
      positions[v * 3 + 1] = p.y + pp.dy;
      positions[v * 3 + 2] = p.z + rz * pp.lat - oz;
      uvs[v * 2] = pp.u;
      uvs[v * 2 + 1] = p.s - offset;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    if (!keep[r] || !keep[r + 1]) continue;
    for (let k = 0; k < P - 1; k++) {
      const a = r * P + k;
      const b = a + 1;
      const c = a + P;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('roadUv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function outdoorProfile(env: EnvironmentPreset): ProfilePoint[] {
  const hw = env.road.halfWidth;
  const edge = hw + env.road.shoulderWidth;
  const pts: ProfilePoint[] = [
    { lat: -(edge + 0.9), dy: -0.55, u: -(edge + 0.9) },
    { lat: -edge, dy: -0.05, u: -edge },
    { lat: -hw, dy: 0, u: -hw },
    { lat: -hw / 2, dy: 0.02, u: -hw / 2 },
    { lat: 0, dy: 0.03, u: 0 },
    { lat: hw / 2, dy: 0.02, u: hw / 2 },
    { lat: hw, dy: 0, u: hw },
    { lat: edge, dy: -0.05, u: edge },
    { lat: edge + 0.9, dy: -0.55, u: edge + 0.9 },
  ];
  // Drop duplicate points when there is no shoulder.
  return pts.filter((pt, i) => i === 0 || Math.abs(pt.lat - pts[i - 1].lat) > 1e-3);
}

/** Height of the drivable surface above the centreline sample at a lateral offset. */
export function roadCrown(env: EnvironmentPreset, lateral: number): number {
  if (env.kind === 'indoor') return 0;
  const hw = env.road.halfWidth;
  const a = Math.abs(lateral);
  if (a <= hw) return 0.03 * (1 - a / hw);
  const edge = hw + env.road.shoulderWidth;
  if (a <= edge) return -0.05 * ((a - hw) / Math.max(1e-3, edge - hw));
  return -0.05;
}

export function buildSegmentMeshes(
  env: EnvironmentPreset,
  road: RoadGenerator,
  seg: RoadSegmentInfo,
  mats: SegmentMaterials,
  seed: number,
  wires: number[],
): BuiltSegment {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const guardrailPosts: { s: number; lateral: number }[] = [];
  const g0 = Math.round(seg.startS / ROAD_STEP);
  const g1 = Math.min(Math.round(seg.endS / ROAD_STEP), road.lastIndex);
  const origin = road.sample(g0);
  const ox = origin.x;
  const oz = origin.z;
  group.position.set(ox, 0, oz);

  const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material | undefined, opts: { shadow?: boolean } = {}) => {
    if (!geo || !mat) return;
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = opts.shadow ?? false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  };

  if (env.kind === 'indoor' && env.indoor) {
    const ind = env.indoor;
    const F = ind.floorHalfWidth;
    const H = ind.ceilingHeight;
    const hw = env.road.halfWidth;
    const floorProfile: ProfilePoint[] = [-F, -hw - 6, -hw, 0, hw, hw + 6, F].map((l) => ({ lat: l, dy: 0, u: l }));
    add(buildRibbon(road, g0, g1, floorProfile, ox, oz), mats.road);
    const ceilProfile: ProfilePoint[] = [F, 0, -F].map((l) => ({ lat: l, dy: H, u: l }));
    add(buildRibbon(road, g0, g1, ceilProfile, ox, oz), mats.ceiling);
    const B = ind.baySpacing;
    if (ind.type === 'corridor') {
      for (const side of [-1, 1]) {
        const heights = side > 0 ? [0, 1, H] : [H, 1, 0];
        const profile = heights.map((h) => ({ lat: side * F, dy: h, u: h }));
        const include = (s: number) => {
          const k = Math.floor(s / B);
          const local = s - k * B;
          return !(corridorGap(seed, k, side) && local > 0.3 && local < B - 0.3);
        };
        add(buildRibbon(road, g0, g1, profile, ox, oz, include), mats.wall);
      }
    } else {
      for (const side of [-1, 1]) {
        // Low parapet everywhere; some blocks are fully walled.
        const low = side > 0 ? [0, 1.1] : [1.1, 0];
        add(buildRibbon(road, g0, g1, low.map((h) => ({ lat: side * F, dy: h, u: h })), ox, oz), mats.wall);
        const high = side > 0 ? [1.1, H] : [H, 1.1];
        const include = (s: number) => parkingFullWall(seed, Math.floor(s / B));
        add(buildRibbon(road, g0, g1, high.map((h) => ({ lat: side * F, dy: h, u: h })), ox, oz, include), mats.wall);
      }
    }
  } else {
    add(buildRibbon(road, g0, g1, outdoorProfile(env), ox, oz), mats.road);

    // Guardrails.
    const mode = env.road.guardrails;
    if (mode !== 'none') {
      const edge = env.road.halfWidth + env.road.shoulderWidth;
      const rows = g1 - g0 + 1;
      for (const side of [-1, 1]) {
        const want: boolean[] = new Array(rows).fill(false);
        const p = createRoadPoint();
        for (let r = 0; r < rows; r++) {
          road.sample(g0 + r, p);
          if (mode === 'both' || (mode === 'right' && side > 0)) want[r] = true;
          else if (mode === 'curves') want[r] = Math.abs(p.curvature) > 1 / 320 && Math.sign(p.curvature) === side;
        }
        // Dilate so rails start before and end after the curve.
        const dil = 10;
        const run = want.map((_, r) => {
          for (let d = -dil; d <= dil; d++) if (want[r + d]) return true;
          return false;
        });
        const lat = side * (edge + 0.45);
        const profile: ProfilePoint[] = (side > 0 ? [0.42, 0.6, 0.78] : [0.78, 0.6, 0.42]).map((h) => ({
          lat: h === 0.6 ? lat - side * 0.07 : lat,
          dy: h - 0.3,
          u: h,
        }));
        const include = (s: number) => run[Math.round(s / ROAD_STEP) - g0] ?? false;
        add(buildRibbon(road, g0, g1, profile, ox, oz, include), mats.guardrail);
        // A post every 4 m, aligned to global sample parity so segments agree.
        for (let r = g0 % 2 === 0 ? 0 : 1; r < rows - 1; r += 2) {
          if (run[r]) guardrailPosts.push({ s: (g0 + r) * ROAD_STEP, lateral: lat + side * 0.12 });
        }
      }
    }
  }

  if (wires.length) {
    const local = new Float32Array(wires.length);
    for (let i = 0; i < wires.length; i += 3) {
      local[i] = wires[i] - ox;
      local[i + 1] = wires[i + 1];
      local[i + 2] = wires[i + 2] - oz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(local, 3));
    geo.computeBoundingSphere();
    geometries.push(geo);
    const lines = new THREE.LineSegments(geo, mats.wire);
    lines.matrixAutoUpdate = false;
    lines.updateMatrix();
    group.add(lines);
  }

  group.updateMatrix();
  return { group, geometries, guardrailPosts };
}
