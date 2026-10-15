export type GraphicsPresetId = 'low' | 'medium' | 'high';

export interface GraphicsProfile {
  id: GraphicsPresetId;
  label: string;
  description: string;
  /** Upper bound for devicePixelRatio × resolution scale. */
  pixelRatioCap: number;
  /** Terrain/scenery streaming radius in metres (fog is clamped inside it). */
  viewDistance: number;
  chunkSize: number;
  /** Outer radius of each terrain LOD ring. */
  lodRings: number[];
  /** Vertex spacing (metres) of each LOD ring. */
  lodSpacing: number[];
  sceneryDensity: number;
  grass: boolean;
  grassDensity: number;
  grassCapacity: number;
  shadows: 'off' | 'car' | 'all';
  shadowMapSize: number;
  clouds: boolean;
  /** Real point lights used indoors. */
  indoorLights: number;
  precipitation: number;
  /** Per-frame time budget for building terrain chunks (ms). */
  buildBudgetMs: number;
  /** How far ahead road segment meshes are kept (multiplier of view distance). */
  roadAhead: number;
}

export const GRAPHICS_PRESETS: Record<GraphicsPresetId, GraphicsProfile> = {
  low: {
    id: 'low',
    label: 'Low',
    description: 'Integrated graphics and older laptops. Shorter view, no grass or shadows.',
    pixelRatioCap: 1,
    viewDistance: 460,
    chunkSize: 128,
    lodRings: [150, 300, 460],
    lodSpacing: [4, 8, 16],
    sceneryDensity: 0.5,
    grass: false,
    grassDensity: 0,
    grassCapacity: 1,
    shadows: 'off',
    shadowMapSize: 512,
    clouds: false,
    indoorLights: 2,
    precipitation: 1200,
    buildBudgetMs: 3,
    roadAhead: 1.1,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: 'Balanced detail. Grass near the road and a shadowed car.',
    pixelRatioCap: 1.5,
    viewDistance: 720,
    chunkSize: 128,
    lodRings: [170, 330, 520, 720],
    lodSpacing: [2, 4, 8, 16],
    sceneryDensity: 0.85,
    grass: true,
    grassDensity: 0.75,
    grassCapacity: 45000,
    shadows: 'car',
    shadowMapSize: 1024,
    clouds: true,
    indoorLights: 3,
    precipitation: 2600,
    buildBudgetMs: 4,
    roadAhead: 1.15,
  },
  high: {
    id: 'high',
    label: 'High',
    description: 'Dedicated graphics. Long view, dense scenery, tree shadows.',
    pixelRatioCap: 2,
    viewDistance: 1000,
    chunkSize: 128,
    lodRings: [210, 400, 680, 1000],
    lodSpacing: [2, 4, 8, 16],
    sceneryDensity: 1.15,
    grass: true,
    grassDensity: 1.25,
    grassCapacity: 80000,
    shadows: 'all',
    shadowMapSize: 2048,
    clouds: true,
    indoorLights: 4,
    precipitation: 4500,
    buildBudgetMs: 5,
    roadAhead: 1.2,
  },
};

export function getGraphicsProfile(id: string | undefined): GraphicsProfile {
  return GRAPHICS_PRESETS[(id as GraphicsPresetId) in GRAPHICS_PRESETS ? (id as GraphicsPresetId) : 'medium'];
}

/** Best-guess default preset for this device (no benchmarking, just hints). */
export function suggestPreset(): GraphicsPresetId {
  if (typeof navigator === 'undefined') return 'medium';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse || cores <= 2) return 'low';
  return 'medium';
}
