import * as THREE from 'three';
import type { EnvironmentPreset } from '../environments/types';
import { hexToLinear } from '../TerrainGenerator';
import { box, cyl, gableEnds, gableRoof, merge, part, quad } from './geometry';

/**
 * Procedural man-made models: roadside furniture, houses, parking-structure
 * and corridor modules, and distant landmarks. Built once per environment and
 * drawn through instanced pools.
 */

export type StructureId =
  | 'streetlight-pole'
  | 'streetlight-lens'
  | 'light-pool'
  | 'delineator'
  | 'reflector'
  | 'fence'
  | 'telephone-pole'
  | 'sign-post'
  | 'sign-panel'
  | 'mailbox'
  | 'guardrail-post'
  | 'house-a-walls'
  | 'house-a-roof'
  | 'house-a-detail'
  | 'house-b-walls'
  | 'house-b-roof'
  | 'house-b-detail'
  | 'window-lit'
  | 'pillar'
  | 'beam'
  | 'fixture'
  | 'wheel-stop'
  | 'parked-car'
  | 'exit-sign'
  | 'door'
  | 'ceiling-panel'
  | 'alcove'
  | 'landmark-monolith'
  | 'landmark-arch'
  | 'landmark-sphere'
  | 'landmark-tower'
  | 'landmark-pylon';

/** How a structure is shaded. */
export type StructureShading = 'solid' | 'light' | 'reflector' | 'pool' | 'landmark';

export const STRUCTURE_SHADING: Record<StructureId, StructureShading> = {
  'streetlight-pole': 'solid',
  'streetlight-lens': 'light',
  'light-pool': 'pool',
  delineator: 'solid',
  reflector: 'reflector',
  fence: 'solid',
  'telephone-pole': 'solid',
  'sign-post': 'solid',
  'sign-panel': 'solid',
  mailbox: 'solid',
  'guardrail-post': 'solid',
  'house-a-walls': 'solid',
  'house-a-roof': 'solid',
  'house-a-detail': 'solid',
  'house-b-walls': 'solid',
  'house-b-roof': 'solid',
  'house-b-detail': 'solid',
  'window-lit': 'light',
  pillar: 'solid',
  beam: 'solid',
  fixture: 'light',
  'wheel-stop': 'solid',
  'parked-car': 'solid',
  'exit-sign': 'light',
  door: 'solid',
  'ceiling-panel': 'light',
  alcove: 'solid',
  'landmark-monolith': 'landmark',
  'landmark-arch': 'landmark',
  'landmark-sphere': 'landmark',
  'landmark-tower': 'landmark',
  'landmark-pylon': 'landmark',
};

/** Fence section length; the roadside generator spaces posts to match. */
export const FENCE_SECTION = 3.2;

function houseA(): { walls: THREE.BufferGeometry; roof: THREE.BufferGeometry; detail: THREE.BufferGeometry } {
  const W = 13;
  const D = 9;
  const H = 3.1;
  const walls = merge([
    part(box(W, H, D, 0, H / 2, 0), '#ffffff'),
    part(gableEnds(W, D, 2.1).translate(0, H, 0), '#f4f4f4'),
  ]);
  const roof = merge([part(gableRoof(W, D, 2.1, 0.55).translate(0, H, 0), ['#ffffff', '#d8d8d8'])]);
  const glass = '#262d33';
  const frame = '#f2efe8';
  const z = D / 2;
  const detail = merge([
    part(box(W + 0.4, 0.9, D + 0.4, 0, -0.15, 0), '#9d9a92'),
    // windows: frame then glass
    part(box(1.9, 1.45, 0.06, -1.4, 1.7, z + 0.02), frame),
    part(box(1.65, 1.2, 0.08, -1.4, 1.7, z + 0.03), glass),
    part(box(1.9, 1.45, 0.06, 4.3, 1.7, z + 0.02), frame),
    part(box(1.65, 1.2, 0.08, 4.3, 1.7, z + 0.03), glass),
    part(box(0.06, 1.3, 1.6, W / 2 + 0.02, 1.7, 0), frame),
    part(box(0.08, 1.05, 1.35, W / 2 + 0.03, 1.7, 0), glass),
    // door + step
    part(box(1.1, 2.15, 0.08, 1.4, 1.08, z + 0.03), '#5e4b3c'),
    part(box(1.8, 0.22, 1.0, 1.4, 0.11, z + 0.5), '#a9a59c'),
    // garage door with panel lines
    part(box(3.0, 2.3, 0.07, -4.6, 1.15, z + 0.03), (_x, y) => {
      const v = Math.abs(((y * 2.2) % 1) - 0.5) < 0.05 ? 0.62 : 0.78;
      return [v, v, v * 0.97];
    }),
    // driveway and front path toward the road
    part(box(3.4, 0.24, 12.8, -4.6, 0.02, z + 6.4), '#a7a49b'),
    part(box(1.1, 0.18, 12.8, 1.4, 0.0, z + 6.4), '#b3b0a8'),
    // chimney
    part(box(0.8, 2.2, 0.8, 3.6, H + 1.5, -1.6), '#8a6f60'),
  ]);
  return { walls, roof, detail };
}

function houseB(): { walls: THREE.BufferGeometry; roof: THREE.BufferGeometry; detail: THREE.BufferGeometry } {
  const W = 9.5;
  const D = 8;
  const H = 5.8;
  const walls = merge([
    part(box(W, H, D, 0, H / 2, 0), '#ffffff'),
    part(gableEnds(W, D, 2.6).translate(0, H, 0), '#f4f4f4'),
    part(box(4.2, 3, 7, W / 2 + 2.1, 1.5, -0.5), '#f0f0f0'),
  ]);
  const roof = merge([
    part(gableRoof(W, D, 2.6, 0.5).translate(0, H, 0), ['#ffffff', '#d4d4d4']),
    part(box(4.6, 0.25, 7.4, W / 2 + 2.1, 3.1, -0.5), '#e0e0e0'),
  ]);
  const glass = '#232a30';
  const frame = '#f2efe8';
  const z = D / 2;
  const win = (x: number, y: number) => [
    part(box(1.5, 1.45, 0.06, x, y, z + 0.02), frame),
    part(box(1.28, 1.22, 0.08, x, y, z + 0.03), glass),
  ];
  const detail = merge([
    part(box(W + 0.4, 0.9, D + 0.4, 0, -0.15, 0), '#9d9a92'),
    ...win(-2.4, 4.3),
    ...win(2.4, 4.3),
    ...win(-2.4, 1.6),
    part(box(1.1, 2.15, 0.08, 1.9, 1.08, z + 0.03), '#3f4a52'),
    part(box(2.4, 0.08, 1.2, 1.9, 2.55, z + 0.6), '#d8d4ca'),
    part(box(3.2, 2.3, 0.07, W / 2 + 2.1, 1.15, 3.02), (_x, y) => {
      const v = Math.abs(((y * 2.2) % 1) - 0.5) < 0.05 ? 0.6 : 0.8;
      return [v, v, v * 0.97];
    }),
    part(box(3.6, 0.24, 13.5, W / 2 + 2.1, 0.02, 3 + 6.75), '#a7a49b'),
    part(box(1.1, 0.18, 13, 1.9, 0.0, z + 6.5), '#b3b0a8'),
  ]);
  return { walls, roof, detail };
}

function parkedCar(): THREE.BufferGeometry {
  // Deliberately simpler than the player's car: these are background props.
  const shape = new THREE.Shape();
  shape.moveTo(-2.15, 0.3);
  shape.lineTo(2.1, 0.3);
  shape.lineTo(2.2, 0.62);
  shape.lineTo(2.0, 0.82);
  shape.lineTo(0.85, 0.92);
  shape.lineTo(0.15, 1.35);
  shape.lineTo(-1.1, 1.35);
  shape.lineTo(-1.85, 0.98);
  shape.lineTo(-2.2, 0.9);
  shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: 1.7, bevelEnabled: false })
    .translate(0, 0, -0.85)
    .rotateY(-Math.PI / 2);
  const glass = (x: number, y: number, z: number): [number, number, number] =>
    y > 0.98 && y < 1.32 && Math.abs(z) < 0.9 && x > -0.86 && x < 0.86 ? [0.04, 0.05, 0.06] : [1, 1, 1];
  const wheel = (x: number, z: number) =>
    part(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 8).rotateZ(Math.PI / 2).translate(x, 0.33, z), '#151515');
  return merge([
    part(body, (x, y, z) => glass(x, y, z)),
    wheel(0.86, 1.3),
    wheel(-0.86, 1.3),
    wheel(0.86, -1.3),
    wheel(-0.86, -1.3),
  ]);
}

function alcove(env: EnvironmentPreset): THREE.BufferGeometry {
  const ind = env.indoor!;
  const H = ind.ceilingHeight;
  const W = 2.3;
  const D = 16;
  const wall = hexToLinear(ind.wallColor);
  const floor = hexToLinear(ind.floorColor);
  const ceil = hexToLinear(ind.ceilingColor);
  // Fake light falloff: darker the deeper you look.
  const shade = (c: [number, number, number]) => (_x: number, y: number, z: number): [number, number, number] => {
    const k = 0.25 + 0.75 * Math.pow(1 - Math.min(1, -z / D), 1.6);
    const trim = y < 1.0 && c === wall ? 0.82 : 1;
    return [c[0] * k * trim, c[1] * k * trim, c[2] * k * trim];
  };
  return merge([
    part(quad([-W, 0, 0], [W, 0, 0], [W, 0, -D], [-W, 0, -D]), shade(floor)),
    part(quad([-W, H, -D], [W, H, -D], [W, H, 0], [-W, H, 0]), shade(ceil)),
    part(quad([-W, 0, -D], [-W, H, -D], [-W, H, 0], [-W, 0, 0]).scale(1, 1, 1), shade(wall)),
    part(quad([W, 0, 0], [W, H, 0], [W, H, -D], [W, 0, -D]), shade(wall)),
    part(quad([-W, 0, -D], [W, 0, -D], [W, H, -D], [-W, H, -D]), () => [wall[0] * 0.18, wall[1] * 0.18, wall[2] * 0.18]),
  ]);
}

function landmark(kind: string): THREE.BufferGeometry {
  const c = '#ffffff';
  switch (kind) {
    case 'arch':
      return merge([
        part(box(18, 140, 18, -55, 70, 0), c),
        part(box(18, 140, 18, 55, 70, 0), c),
        part(box(128, 22, 18, 0, 151, 0), c),
      ]);
    case 'sphere':
      return merge([part(new THREE.IcosahedronGeometry(70, 2).translate(0, 90, 0), c)]);
    case 'tower':
      return merge([part(cyl(10, 16, 260, 8, 0, 130, 0), c), part(box(40, 6, 40, 0, 262, 0), c)]);
    case 'pylon':
      return merge([part(new THREE.ConeGeometry(30, 200, 4).translate(0, 100, 0), c)]);
    default:
      return merge([part(box(26, 190, 8, 0, 95, 0), c)]);
  }
}

export function buildStructureGeometry(id: StructureId, env: EnvironmentPreset): THREE.BufferGeometry {
  const ind = env.indoor;
  switch (id) {
    case 'streetlight-pole':
      return merge([
        part(cyl(0.07, 0.12, 7.6, 6, 0, 3.8, 0), '#55595d'),
        part(box(2.4, 0.09, 0.09, 1.2, 7.45, 0), '#55595d'),
        part(box(0.75, 0.16, 0.34, 2.3, 7.42, 0), '#3e4246'),
      ]);
    case 'streetlight-lens':
      return merge([part(box(0.6, 0.04, 0.26, 2.3, 7.32, 0), '#ffffff')]);
    case 'light-pool': {
      const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      return g;
    }
    case 'delineator':
      return merge([
        part(box(0.1, 1.0, 0.1, 0, 0.5, 0), '#e6e3dc'),
        part(box(0.104, 0.16, 0.104, 0, 0.92, 0), '#1e1e1e'),
      ]);
    case 'reflector':
      return merge([part(box(0.07, 0.11, 0.108, 0, 0.78, 0), '#ffffff')]);
    case 'fence':
      return merge([
        part(box(0.12, 1.15, 0.12, 0, 0.575, 0), '#6b5a46'),
        part(box(0.05, 0.1, FENCE_SECTION, 0, 0.98, FENCE_SECTION / 2), '#7f6c55'),
        part(box(0.05, 0.1, FENCE_SECTION, 0, 0.58, FENCE_SECTION / 2), '#7f6c55'),
      ]);
    case 'telephone-pole':
      return merge([
        part(cyl(0.12, 0.17, 9.6, 6, 0, 4.8, 0), ['#3b3029', '#5a4a3c']),
        part(box(2.3, 0.14, 0.14, 0, 8.9, 0), '#4a3d32'),
        part(box(0.08, 0.2, 0.08, -1.0, 9.06, 0), '#8f9ea0'),
        part(box(0.08, 0.2, 0.08, 1.0, 9.06, 0), '#8f9ea0'),
        part(box(0.08, 0.2, 0.08, 0.35, 9.06, 0), '#8f9ea0'),
      ]);
    case 'sign-post':
      return merge([
        part(cyl(0.045, 0.05, 2.6, 5, 0, 1.3, 0), '#8c9094'),
        // abstract white border and "text" bars on the panel face (+Z)
        part(box(1.45, 0.05, 0.02, 0, 2.78, 0.045), '#f0f0ea'),
        part(box(1.45, 0.05, 0.02, 0, 1.92, 0.045), '#f0f0ea'),
        part(box(0.05, 0.9, 0.02, -0.7, 2.35, 0.045), '#f0f0ea'),
        part(box(0.05, 0.9, 0.02, 0.7, 2.35, 0.045), '#f0f0ea'),
        part(box(0.9, 0.08, 0.02, -0.12, 2.5, 0.045), '#f0f0ea'),
        part(box(0.6, 0.08, 0.02, -0.27, 2.28, 0.045), '#f0f0ea'),
        part(new THREE.ConeGeometry(0.14, 0.26, 3).rotateZ(-Math.PI / 2).translate(0.48, 2.4, 0.045), '#f0f0ea'),
      ]);
    case 'sign-panel':
      return merge([part(box(1.55, 0.98, 0.06, 0, 2.35, 0), '#ffffff')]);
    case 'mailbox':
      return merge([
        part(box(0.08, 1.05, 0.08, 0, 0.52, 0), '#6b5a46'),
        part(box(0.26, 0.24, 0.46, 0, 1.15, 0), '#3a3f44'),
        part(box(0.03, 0.14, 0.05, 0.15, 1.24, -0.12), '#b03a2e'),
      ]);
    case 'guardrail-post':
      return merge([part(box(0.12, 0.8, 0.16, 0, 0.32, 0), '#8a8f93')]);
    case 'house-a-walls':
      return houseA().walls;
    case 'house-a-roof':
      return houseA().roof;
    case 'house-a-detail':
      return houseA().detail;
    case 'house-b-walls':
      return houseB().walls;
    case 'house-b-roof':
      return houseB().roof;
    case 'house-b-detail':
      return houseB().detail;
    case 'window-lit':
      return merge([part(box(1.62, 1.18, 0.1, 0, 0, 0), '#ffffff')]);
    case 'pillar': {
      const H = ind?.ceilingHeight ?? 3.2;
      return merge([
        part(box(0.62, H, 0.62, 0, H / 2, 0), ind?.pillarColor ?? '#aaa'),
        part(box(0.64, 0.9, 0.64, 0, 0.45, 0), (_x, y) => {
          const c = hexToLinear(ind?.accentColor ?? '#d8b13c');
          const stripe = Math.floor((y + _x * 0.8) * 4) % 2 === 0;
          return stripe ? c : [0.03, 0.03, 0.03];
        }),
      ]);
    }
    case 'beam': {
      const H = ind?.ceilingHeight ?? 3.2;
      const W = (ind?.floorHalfWidth ?? 20) * 2;
      return merge([part(box(W, 0.42, 0.42, 0, H - 0.21, 0), ['#55534e', ind?.ceilingColor ?? '#777'])]);
    }
    case 'fixture': {
      const H = ind?.ceilingHeight ?? 3.2;
      return merge([part(box(0.2, 0.06, 1.5, 0, H - 0.47, 0), '#ffffff')]);
    }
    case 'wheel-stop':
      return merge([part(box(1.7, 0.13, 0.22, 0, 0.065, 0), '#9a978e')]);
    case 'parked-car':
      return parkedCar();
    case 'exit-sign':
      return merge([part(box(0.7, 0.24, 0.06, 0, 0, 0), '#ffffff')]);
    case 'door':
      return merge([
        part(box(1.3, 2.3, 0.08, 0, 1.15, 0), '#8b836c'),
        part(box(1.05, 2.12, 0.1, 0, 1.06, 0.02), (_x, y) => (y > 1.9 ? [0.38, 0.34, 0.27] : [0.47, 0.42, 0.33])),
        part(box(0.06, 0.06, 0.16, 0.38, 1.05, 0.1), '#c8c2b0'),
      ]);
    case 'ceiling-panel': {
      const H = ind?.ceilingHeight ?? 3.3;
      return merge([part(box(1.18, 0.04, 0.58, 0, H - 0.03, 0), '#ffffff')]);
    }
    case 'alcove':
      return alcove(env);
    case 'landmark-monolith':
      return landmark('monolith');
    case 'landmark-arch':
      return landmark('arch');
    case 'landmark-sphere':
      return landmark('sphere');
    case 'landmark-tower':
      return landmark('tower');
    case 'landmark-pylon':
      return landmark('pylon');
  }
}
