import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hexToLinear } from '../TerrainGenerator';

export type ColorSpec = string | [string, string] | ((x: number, y: number, z: number) => [number, number, number]);

export interface PartOptions {
  /** Max vertex displacement (metres). Uses a position hash so shared vertices stay welded. */
  jitter?: number;
  jitterSeed?: number;
  /** Keep jitter horizontal only (e.g. flat-topped mesas). */
  jitterXZ?: boolean;
}

function posHash(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.123) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Normalises a primitive into a mergeable, flat-shaded part: non-indexed,
 * position + colour only (normals are recomputed after merging).
 */
export function part(geo: THREE.BufferGeometry, color: ColorSpec, opts: PartOptions = {}): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  if (opts.jitter) {
    const seed = opts.jitterSeed ?? 1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const kx = Math.round(x * 1000) / 1000;
      const ky = Math.round(y * 1000) / 1000;
      const kz = Math.round(z * 1000) / 1000;
      const j = opts.jitter;
      pos.setXYZ(
        i,
        x + (posHash(kx, ky, kz, seed) - 0.5) * 2 * j,
        opts.jitterXZ ? y : y + (posHash(ky, kz, kx, seed + 7) - 0.5) * 2 * j,
        z + (posHash(kz, kx, ky, seed + 13) - 0.5) * 2 * j,
      );
    }
  }
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const colors = new Float32Array(pos.count * 3);
  let fn: (x: number, y: number, z: number) => [number, number, number];
  if (typeof color === 'function') {
    fn = color;
  } else if (Array.isArray(color)) {
    const a = hexToLinear(color[0]);
    const b = hexToLinear(color[1]);
    const span = Math.max(1e-6, bb.max.y - bb.min.y);
    fn = (_x, y) => {
      const t = (y - bb.min.y) / span;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    };
  } else {
    const c = hexToLinear(color);
    fn = () => c;
  }
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Merges parts into one geometry with flat normals and bounds. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Failed to merge geometry parts');
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export const cyl = (rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(x, y, z);

/** A gable roof prism: ridge along X, eaves overhanging by `over`. */
export function gableRoof(width: number, depth: number, rise: number, over: number): THREE.BufferGeometry {
  const w = width / 2 + over;
  const d = depth / 2 + over;
  const v = [
    // front slope (+Z)
    -w, 0, d, w, 0, d, w, rise, 0,
    -w, 0, d, w, rise, 0, -w, rise, 0,
    // back slope (-Z)
    w, 0, -d, -w, 0, -d, -w, rise, 0,
    w, 0, -d, -w, rise, 0, w, rise, 0,
    // underside
    -w, 0, -d, w, 0, -d, w, 0, d,
    -w, 0, -d, w, 0, d, -w, 0, d,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

/** Triangular gable end walls under a roof (ridge along X). */
export function gableEnds(width: number, depth: number, rise: number): THREE.BufferGeometry {
  const w = width / 2;
  const d = depth / 2;
  const v = [
    // +X end, faces +X
    w, 0, d, w, 0, -d, w, rise, 0,
    // -X end, faces -X
    -w, 0, -d, -w, 0, d, -w, rise, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

/** A single-sided quad from four corners (counter-clockwise when viewed from the front). */
export function quad(a: number[], b: number[], c: number[], d: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  return g;
}
