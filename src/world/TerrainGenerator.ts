import { clamp, lerp, smoothstep, type RGB } from '../core/math';
import { Noise2D } from '../core/noise';
import { hashInts } from '../core/random';
import type { EnvironmentPreset } from './environments/types';
import { createRoadQuery, type RoadGenerator, type RoadQuery } from './RoadGenerator';

/** sRGB hex → linear RGB (three.js vertex colours are linear). */
export function hexToLinear(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const conv = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [conv((n >> 16) & 255), conv((n >> 8) & 255), conv(n & 255)];
}

function mixInto(out: RGB, b: RGB, t: number): void {
  out[0] += (b[0] - out[0]) * t;
  out[1] += (b[1] - out[1]) * t;
  out[2] += (b[2] - out[2]) * t;
}

/**
 * Deterministic terrain height and colour field.
 *
 * Heights are a pure function of world (x, z), the seed and the road, so
 * neighbouring chunks always agree on their shared edges. Near the road the
 * natural height is blended down to just below the road surface, so the road
 * can never be buried or left floating.
 */
export class TerrainSampler {
  private readonly noise: Noise2D;
  private readonly noise2: Noise2D;
  private readonly scratch = createRoadQuery();
  private readonly palette: {
    low: RGB;
    high: RGB;
    dry: RGB;
    rock: RGB;
    roadside: RGB;
    sand?: RGB;
    snow?: RGB;
  };
  readonly roadEdge: number;

  constructor(
    readonly env: EnvironmentPreset,
    seed: number,
  ) {
    this.noise = new Noise2D(hashInts(seed, 0x7e44a1));
    this.noise2 = new Noise2D(hashInts(seed, 0x2b91));
    const c = env.terrain.colors;
    this.palette = {
      low: hexToLinear(c.low),
      high: hexToLinear(c.high),
      dry: hexToLinear(c.dry),
      rock: hexToLinear(c.rock),
      roadside: hexToLinear(c.roadside),
      sand: c.sand ? hexToLinear(c.sand) : undefined,
      snow: c.snow ? hexToLinear(c.snow) : undefined,
    };
    this.roadEdge = env.road.halfWidth + env.road.shoulderWidth;
  }

  /** Natural landscape height, independent of the road. */
  baseHeight(x: number, z: number): number {
    const t = this.env.terrain;
    if (t.amplitude === 0 && t.largeAmplitude === 0) return t.baseHeight;
    let h = this.noise.fbm(x * t.frequency, z * t.frequency, t.octaves);
    if (t.ridged > 0) {
      const r = this.noise.ridged(x * t.frequency * 0.8 + 100, z * t.frequency * 0.8 - 50, t.octaves) * 2 - 0.55;
      h = lerp(h, r, t.ridged);
    }
    const large = this.noise2.noise(x * t.largeFrequency, z * t.largeFrequency);
    return t.baseHeight + h * t.amplitude + large * t.largeAmplitude;
  }

  /**
   * Final terrain height at (x, z). `flatExtra` widens the flattened corridor
   * for coarse LOD meshes so their long triangles cannot poke through the road.
   * The road query used is written to `q` for callers that need it.
   */
  heightAt(x: number, z: number, road: RoadGenerator, flatExtra = 0, q: RoadQuery = this.scratch): number {
    road.query(x, z, q);
    const t = this.env.terrain;
    let h = this.baseHeight(x, z);
    if (t.coast) {
      const c = t.coast;
      const lat = q.lateral * c.side;
      // The seaward verge falls away from the road so the ocean stays in view.
      if (lat > 0) h = Math.min(h, q.y - 0.5 - lat * 0.12);
      const wobble = this.noise2.noise(q.s * 0.004, 3.7) * c.noise;
      const start = Math.max(this.roadEdge + 8, c.start + wobble);
      const k = smoothstep(start, start + c.width, lat);
      const seabed = c.seabed + this.noise.noise(x * 0.01, z * 0.01) * 4;
      h = lerp(h, seabed, Math.pow(k, 0.7));
    }
    const flat = this.roadEdge + 1.5 + flatExtra;
    const k = smoothstep(flat, flat + t.blendWidth, q.dist);
    return lerp(q.y - 0.3, h, k);
  }

  /**
   * Terrain colour (linear RGB) from height, slope (gradient magnitude, i.e.
   * tan of the incline) and distance to the road.
   */
  colorAt(x: number, z: number, h: number, slope: number, roadDist: number, out: RGB): RGB {
    const p = this.palette;
    const t = this.env.terrain;
    const n = this.noise.noise(x * 0.018, z * 0.018);
    const n2 = this.noise2.noise(x * 0.09, z * 0.09);
    const span = Math.max(1, t.amplitude + t.largeAmplitude);
    const ht = clamp((h - t.baseHeight + span * 0.6) / (span * 1.6), 0, 1);
    out[0] = p.low[0];
    out[1] = p.low[1];
    out[2] = p.low[2];
    mixInto(out, p.high, clamp(ht * 0.8 + n * 0.25 + 0.1, 0, 1));
    mixInto(out, p.dry, clamp(n2 * 0.5 + 0.25, 0, 1) * 0.45);
    if (p.sand && t.seaLevel !== undefined) {
      mixInto(out, p.sand, smoothstep(t.seaLevel + 5 + n * 2, t.seaLevel + 1, h));
    }
    mixInto(out, p.rock, smoothstep(0.55, 1.05, slope + n2 * 0.08));
    if (p.snow && t.colors.snowLine !== undefined) {
      const sl = t.colors.snowLine + n * 30;
      const s = smoothstep(sl - 15, sl + 25, h) * (1 - smoothstep(0.7, 1.2, slope));
      mixInto(out, p.snow, s);
    }
    const edge = this.roadEdge;
    mixInto(out, p.roadside, (1 - smoothstep(edge + 0.5, edge + 7, roadDist)) * 0.8);
    // Gentle brightness variation keeps large areas from looking flat.
    const v = 0.92 + n2 * 0.06 + n * 0.05;
    out[0] *= v;
    out[1] *= v;
    out[2] *= v;
    return out;
  }

  /** Cheap value noise for scenery clustering (−1..1). */
  cluster(x: number, z: number, frequency: number): number {
    return this.noise2.noise(x * frequency + 31.4, z * frequency - 12.7);
  }
}
