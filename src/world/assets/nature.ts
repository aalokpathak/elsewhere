import * as THREE from 'three';
import type { SceneryKind } from '../environments/types';
import { hexToLinear } from '../TerrainGenerator';
import { cyl, merge, part } from './geometry';

/**
 * Procedural low-poly vegetation and rocks. Every model is built once per
 * detail level and shared by an instanced pool; per-instance variety comes
 * from scale, rotation and colour tint.
 */

export type Detail = 'high' | 'low';

const blob = (r: number, x: number, y: number, z: number, detail: number) =>
  new THREE.IcosahedronGeometry(r, detail).translate(x, y, z);

function broadleaf(d: Detail): THREE.BufferGeometry {
  const leaves: [string, string] = ['#36521f', '#7c9a45'];
  if (d === 'low') {
    return merge([
      part(cyl(0.18, 0.26, 3.4, 4, 0, 1.7, 0), ['#43362a', '#5a4734']),
      part(blob(2.3, 0, 4.7, 0, 0).scale(1, 0.9, 1), leaves, { jitter: 0.25, jitterSeed: 2 }),
    ]);
  }
  return merge([
    part(cyl(0.15, 0.26, 3.6, 6, 0, 1.8, 0), ['#43362a', '#5e4a36']),
    part(cyl(0.06, 0.1, 1.6, 4, 0, 0, 0).rotateZ(0.7).translate(0.5, 3.4, 0), '#4e3e2e'),
    part(blob(1.95, 0, 4.7, 0, 1), leaves, { jitter: 0.28, jitterSeed: 3 }),
    part(blob(1.45, 1.05, 4.2, 0.45, 1), leaves, { jitter: 0.22, jitterSeed: 4 }),
    part(blob(1.5, -0.95, 4.3, -0.5, 1), leaves, { jitter: 0.22, jitterSeed: 5 }),
    part(blob(1.3, 0.15, 5.7, -0.25, 1), ['#557a32', '#88a650'], { jitter: 0.2, jitterSeed: 6 }),
  ]);
}

function conifer(d: Detail): THREE.BufferGeometry {
  const needles: [string, string] = ['#1f3824', '#4a6c3c'];
  if (d === 'low') {
    return merge([
      part(cyl(0.12, 0.2, 1.4, 4, 0, 0.7, 0), '#3e3127'),
      part(new THREE.ConeGeometry(2.3, 8.2, 5).translate(0, 5.2, 0), needles),
    ]);
  }
  const parts = [part(cyl(0.12, 0.22, 1.8, 5, 0, 0.9, 0), ['#3a2e24', '#4d3d2f'])];
  for (let i = 0; i < 4; i++) {
    const r = 2.35 - i * 0.5;
    const h = 3.3 - i * 0.35;
    const y = 1.5 + i * 1.85 + h / 2;
    parts.push(
      part(new THREE.ConeGeometry(r, h, 8, 1).rotateY(i * 0.7).translate(0, y, 0), needles, {
        jitter: 0.14,
        jitterSeed: 10 + i,
      }),
    );
  }
  return merge(parts);
}

function birch(d: Detail): THREE.BufferGeometry {
  const bark = (x: number, y: number, z: number): [number, number, number] => {
    const band = Math.sin(y * 7.3 + Math.sin(x * 40 + z * 30) * 2) > 0.82 ? 0.25 : 1;
    const c = hexToLinear('#dcd8cc');
    return [c[0] * band, c[1] * band, c[2] * band];
  };
  const leaves: [string, string] = ['#5d7a34', '#a9b65a'];
  if (d === 'low') {
    return merge([part(cyl(0.1, 0.14, 6.4, 4, 0, 3.2, 0), '#d8d4c8'), part(blob(1.6, 0, 6.2, 0, 0), leaves)]);
  }
  return merge([
    part(cyl(0.09, 0.15, 6.8, 6, 0, 3.4, 0), bark),
    part(blob(1.25, 0.3, 5.6, 0.2, 1), leaves, { jitter: 0.2, jitterSeed: 21 }),
    part(blob(1.1, -0.4, 6.6, -0.1, 1), leaves, { jitter: 0.2, jitterSeed: 22 }),
    part(blob(0.9, 0.2, 7.5, -0.3, 1), leaves, { jitter: 0.16, jitterSeed: 23 }),
  ]);
}

function shrub(d: Detail): THREE.BufferGeometry {
  const c: [string, string] = ['#33491f', '#6b853f'];
  if (d === 'low') return merge([part(blob(0.8, 0, 0.45, 0, 0).scale(1, 0.75, 1), c)]);
  return merge([
    part(blob(0.75, 0, 0.5, 0, 1), c, { jitter: 0.14, jitterSeed: 31 }),
    part(blob(0.55, 0.55, 0.38, 0.2, 1), c, { jitter: 0.1, jitterSeed: 32 }),
    part(blob(0.5, -0.45, 0.35, -0.3, 1), c, { jitter: 0.1, jitterSeed: 33 }),
  ]);
}

function rock(size: number, d: Detail): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(size, d === 'high' ? 1 : 0).scale(1, 0.62, 0.85).translate(0, size * 0.22, 0);
  return merge([part(g, ['#625f58', '#9b978c'], { jitter: size * 0.22, jitterSeed: 41 + size })]);
}

function grass(): THREE.BufferGeometry {
  // A clump of thin blades. Colours are greyscale; the instance tint carries hue
  // so each clump matches the ground beneath it.
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 12;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + Math.sin(i * 12.7) * 0.6;
    const r = 0.06 + ((Math.sin(i * 7.1) + 1) / 2) * 0.22;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = 0.28 + ((Math.sin(i * 3.3) + 1) / 2) * 0.32;
    const w = 0.045;
    const lean = 0.18 + ((Math.sin(i * 5.9) + 1) / 2) * 0.2;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    col.push(0.6, 0.62, 0.52, 0.6, 0.62, 0.52, 1.12, 1.14, 0.92);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Point normals mostly up so blades light like the ground, not like cards.
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  n.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

function cactus(d: Detail): THREE.BufferGeometry {
  const c: [string, string] = ['#3a5530', '#5f7c46'];
  const seg = d === 'high' ? 8 : 5;
  const parts = [
    part(cyl(0.3, 0.36, 4.2, seg, 0, 2.1, 0), c),
    part(new THREE.SphereGeometry(0.3, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 4.2, 0), '#5f7c46'),
  ];
  if (d === 'high') {
    parts.push(
      part(cyl(0.2, 0.2, 0.9, 6).rotateZ(Math.PI / 2).translate(0.55, 1.9, 0), c),
      part(cyl(0.2, 0.2, 1.5, 6, 1.0, 2.6, 0), c),
      part(cyl(0.18, 0.18, 0.7, 6).rotateZ(Math.PI / 2).translate(-0.45, 2.5, 0), c),
      part(cyl(0.18, 0.18, 1.1, 6, -0.8, 3.0, 0), c),
    );
  }
  return merge(parts);
}

function deadTree(d: Detail): THREE.BufferGeometry {
  const c: [string, string] = ['#4f463d', '#8a8072'];
  const parts = [part(cyl(0.1, 0.22, 5.2, d === 'high' ? 6 : 4, 0, 2.6, 0), c)];
  const branches = d === 'high' ? 5 : 2;
  for (let i = 0; i < branches; i++) {
    const a = i * 2.4;
    const y = 2.6 + i * 0.55;
    parts.push(
      part(
        cyl(0.03, 0.08, 1.9 - i * 0.15, 4)
          .translate(0, (1.9 - i * 0.15) / 2, 0)
          .rotateZ(0.8 + (i % 2) * 0.2)
          .rotateY(a)
          .translate(0, y, 0),
        c,
      ),
    );
  }
  return merge(parts);
}

function mesa(d: Detail): THREE.BufferGeometry {
  const band = (_x: number, y: number): [number, number, number] => {
    const a = hexToLinear('#94543a');
    const b = hexToLinear('#c98c5e');
    const t = 0.5 + 0.5 * Math.sin(y * 0.45) * Math.sin(y * 0.13 + 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  const g = new THREE.CylinderGeometry(28, 40, 42, d === 'high' ? 11 : 7, 3).translate(0, 17, 0);
  return merge([part(g, band, { jitter: 3.2, jitterSeed: 51, jitterXZ: true })]);
}

export function buildSceneryGeometry(kind: SceneryKind, detail: Detail): THREE.BufferGeometry {
  switch (kind) {
    case 'broadleaf':
      return broadleaf(detail);
    case 'conifer':
      return conifer(detail);
    case 'birch':
      return birch(detail);
    case 'shrub':
      return shrub(detail);
    case 'rock':
      return rock(1, detail);
    case 'boulder':
      return rock(2.2, detail);
    case 'grass':
    case 'reed':
      return grass();
    case 'cactus':
      return cactus(detail);
    case 'deadtree':
      return deadTree(detail);
    case 'mesa':
      return mesa(detail);
  }
}

/** Kinds that sway in the wind, and how much. */
export const SWAY: Partial<Record<SceneryKind, number>> = {
  broadleaf: 0.012,
  conifer: 0.006,
  birch: 0.016,
  shrub: 0.03,
  grass: 0.16,
  reed: 0.16,
  deadtree: 0.004,
};

