import { clamp, DEG, lerp, smoothstep } from '../core/math';
import { hashInts, Rng } from '../core/random';
import type { RoadConfig } from './environments/types';

/**
 * Endless procedural road.
 *
 * The road is generated as a sequence of segments, each defined by a target
 * curvature that is eased in from the previous segment's curvature. The
 * centreline is integrated at a fixed arc-length step, so position, heading,
 * curvature and elevation are all continuous across segment boundaries — no
 * gaps, no kinks.
 *
 * Heading is limited to ±maxHeadingDeg around +Z. That keeps the road's Z
 * coordinate strictly increasing with distance, which (a) guarantees the road
 * never crosses itself and (b) lets any world point be matched to the road by
 * a binary search on Z. The car, camera, terrain and scenery all use the same
 * `query()` / `pointAt()` data.
 *
 * Coordinate conventions: heading 0 faces +Z; direction = (sin h, 0, cos h);
 * the right-hand side is (-cos h, 0, sin h). Positive lateral = right.
 */

export const ROAD_STEP = 2;

export interface RoadPoint {
  s: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  curvature: number;
  grade: number;
}

export interface RoadQuery extends RoadPoint {
  /** Horizontal distance from the query point to the centreline. */
  dist: number;
  /** Signed lateral offset: positive = right of the road. */
  lateral: number;
  /** Local sample index of the closest centreline segment. */
  index: number;
}

export interface RoadSegmentInfo {
  index: number;
  startS: number;
  endS: number;
  curvature: number;
}

export type ElevationSampler = (x: number, z: number) => number;

export function createRoadQuery(): RoadQuery {
  return { s: 0, x: 0, y: 0, z: 0, heading: 0, curvature: 0, grade: 0, dist: Infinity, lateral: 0, index: 0 };
}

export function createRoadPoint(): RoadPoint {
  return { s: 0, x: 0, y: 0, z: 0, heading: 0, curvature: 0, grade: 0 };
}

interface GenState {
  x: number;
  y: number;
  z: number;
  heading: number;
  curvature: number;
  grade: number;
  level: number;
  lastWasCurve: boolean;
}

/** Samples kept beyond the trim point before arrays are actually compacted. */
const TRIM_SLACK = 600;

export class RoadGenerator {
  readonly segments: RoadSegmentInfo[] = [];

  private xs: number[] = [];
  private ys: number[] = [];
  private zs: number[] = [];
  private hs: number[] = [];
  private ks: number[] = [];
  private gs: number[] = [];
  /** Global sample index of xs[0]. */
  private base = 0;
  private nextSegment = 0;
  private state!: GenState;

  constructor(
    readonly config: RoadConfig,
    readonly seed: number,
    private readonly elevation: ElevationSampler,
  ) {
    this.reset();
  }

  /** Clears all generated road and restarts from the origin. */
  reset(): void {
    this.xs = [];
    this.ys = [];
    this.zs = [];
    this.hs = [];
    this.ks = [];
    this.gs = [];
    this.segments.length = 0;
    this.base = 0;
    this.nextSegment = 0;
    const c = this.config;
    const y0 =
      c.elevation === 'terrain'
        ? Math.max(c.minElevation, this.elevation(0, 0))
        : c.baseElevation;
    this.state = { x: 0, y: y0, z: 0, heading: 0, curvature: 0, grade: 0, level: 0, lastWasCurve: false };
    this.pushSample();
  }

  get sampleCount(): number {
    return this.xs.length;
  }

  get startS(): number {
    return this.base * ROAD_STEP;
  }

  get endS(): number {
    return (this.base + this.xs.length - 1) * ROAD_STEP;
  }

  get endZ(): number {
    return this.zs[this.zs.length - 1];
  }

  /** Generates segments until the road extends past world Z = `z`. */
  ensureAheadZ(z: number, maxSegments = 200): number {
    let made = 0;
    while (this.endZ < z && made < maxSegments) {
      this.generateSegment();
      made++;
    }
    return made;
  }

  /** Generates segments until the road is at least `s` metres long. */
  ensureAheadS(s: number, maxSegments = 200): number {
    let made = 0;
    while (this.endS < s && made < maxSegments) {
      this.generateSegment();
      made++;
    }
    return made;
  }

  /** Discards road data behind arc length `s` (memory stays bounded). */
  trimBefore(s: number): void {
    const drop = Math.floor(s / ROAD_STEP) - this.base;
    if (drop > TRIM_SLACK && drop < this.xs.length - 2) {
      this.xs.splice(0, drop);
      this.ys.splice(0, drop);
      this.zs.splice(0, drop);
      this.hs.splice(0, drop);
      this.ks.splice(0, drop);
      this.gs.splice(0, drop);
      this.base += drop;
      while (this.segments.length > 1 && this.segments[0].endS < this.startS) this.segments.shift();
    }
  }

  /** Interpolated centreline point at arc length `s` (clamped to generated range). */
  pointAt(s: number, out: RoadPoint = createRoadPoint()): RoadPoint {
    const n = this.xs.length;
    const f = clamp(s / ROAD_STEP - this.base, 0, n - 1);
    const i = Math.min(Math.floor(f), n - 2);
    if (i < 0) {
      out.s = this.startS;
      out.x = this.xs[0];
      out.y = this.ys[0];
      out.z = this.zs[0];
      out.heading = this.hs[0];
      out.curvature = this.ks[0];
      out.grade = this.gs[0];
      return out;
    }
    const t = f - i;
    out.s = (this.base + f) * ROAD_STEP;
    out.x = lerp(this.xs[i], this.xs[i + 1], t);
    out.y = lerp(this.ys[i], this.ys[i + 1], t);
    out.z = lerp(this.zs[i], this.zs[i + 1], t);
    out.heading = lerp(this.hs[i], this.hs[i + 1], t);
    out.curvature = lerp(this.ks[i], this.ks[i + 1], t);
    out.grade = lerp(this.gs[i], this.gs[i + 1], t);
    return out;
  }

  /** Raw sample access by global index (clamped). Used by mesh builders. */
  sample(globalIndex: number, out: RoadPoint = createRoadPoint()): RoadPoint {
    const i = clamp(globalIndex - this.base, 0, this.xs.length - 1);
    out.s = (this.base + i) * ROAD_STEP;
    out.x = this.xs[i];
    out.y = this.ys[i];
    out.z = this.zs[i];
    out.heading = this.hs[i];
    out.curvature = this.ks[i];
    out.grade = this.gs[i];
    return out;
  }

  get firstIndex(): number {
    return this.base;
  }

  get lastIndex(): number {
    return this.base + this.xs.length - 1;
  }

  /**
   * Finds the closest point on the centreline to world (px, pz).
   * Exact within ~120 m of the road; beyond that, distance is approximate but
   * the lateral sign is still correct.
   */
  query(px: number, pz: number, out: RoadQuery = createRoadQuery()): RoadQuery {
    const xs = this.xs;
    const zs = this.zs;
    const n = xs.length;
    if (n < 2) {
      out.dist = Infinity;
      return out;
    }
    // Binary search on monotonic Z.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (zs[mid] <= pz) lo = mid;
      else hi = mid;
    }
    const W = 70;
    const a = Math.max(0, lo - W);
    const b = Math.min(n - 1, lo + W);
    let best = Infinity;
    let bestI = lo;
    for (let i = a; i <= b; i += 3) {
      const dx = xs[i] - px;
      const dz = zs[i] - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        bestI = i;
      }
    }
    // Refine by projecting onto nearby centreline segments.
    const r0 = Math.max(0, bestI - 4);
    const r1 = Math.min(n - 2, bestI + 4);
    best = Infinity;
    let segI = r0;
    let segT = 0;
    for (let i = r0; i <= r1; i++) {
      const ax = xs[i];
      const az = zs[i];
      const ex = xs[i + 1] - ax;
      const ez = zs[i + 1] - az;
      const len2 = ex * ex + ez * ez;
      let t = len2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + ex * t - px;
      const cz = az + ez * t - pz;
      const d2 = cx * cx + cz * cz;
      if (d2 < best) {
        best = d2;
        segI = i;
        segT = t;
      }
    }
    const i = segI;
    const t = segT;
    out.index = i;
    out.s = (this.base + i + t) * ROAD_STEP;
    out.x = lerp(xs[i], xs[i + 1], t);
    out.y = lerp(this.ys[i], this.ys[i + 1], t);
    out.z = lerp(zs[i], zs[i + 1], t);
    out.heading = lerp(this.hs[i], this.hs[i + 1], t);
    out.curvature = lerp(this.ks[i], this.ks[i + 1], t);
    out.grade = lerp(this.gs[i], this.gs[i + 1], t);
    out.dist = Math.sqrt(best);
    const rx = -Math.cos(out.heading);
    const rz = Math.sin(out.heading);
    out.lateral = (px - out.x) * rx + (pz - out.z) * rz;
    return out;
  }

  // ---------------------------------------------------------------------------

  private pushSample(): void {
    const st = this.state;
    this.xs.push(st.x);
    this.ys.push(st.y);
    this.zs.push(st.z);
    this.hs.push(st.heading);
    this.ks.push(st.curvature);
    this.gs.push(st.grade);
  }

  private generateSegment(): void {
    const c = this.config;
    const index = this.nextSegment++;
    const rng = new Rng(hashInts(this.seed, index, 0x51a7));
    const st = this.state;
    const maxH = c.maxHeadingDeg * DEG;

    let length: number;
    let target: number;
    let transition: number;

    if (index === 0) {
      // Always begin with a calm straight so the drive starts gently.
      length = 260;
      target = 0;
      transition = 20;
    } else if (c.style === 'angular') {
      if (st.lastWasCurve || rng.chance(c.straightChance)) {
        length = rng.range(c.segmentLength[0], c.segmentLength[1]);
        target = 0;
        st.lastWasCurve = false;
      } else {
        const radius = rng.range(c.minRadius, c.maxRadius);
        const angle = rng.range(25, 55) * DEG;
        let sign: number = rng.sign();
        if (Math.abs(st.heading + sign * angle) > maxH * 0.95) sign = st.heading > 0 ? -1 : 1;
        target = sign / radius;
        length = angle * radius + 6;
        st.lastWasCurve = true;
      }
      transition = 6;
    } else {
      length = rng.range(c.segmentLength[0], c.segmentLength[1]);
      if (rng.chance(c.straightChance)) {
        target = 0;
      } else {
        const radius = rng.range(c.minRadius, c.maxRadius);
        let sign: number = rng.sign();
        const predicted = st.heading + (sign * length * 0.75) / radius;
        if (Math.abs(predicted) > maxH * 0.75) sign = st.heading > 0 ? -1 : 1;
        target = sign / radius;
      }
      transition = length * 0.45;
    }

    if (c.elevation === 'levels' && index > 0 && rng.chance(c.levelChangeChance ?? 0)) {
      st.level += rng.sign();
    }

    length = Math.max(ROAD_STEP * 4, Math.round(length / ROAD_STEP) * ROAD_STEP);
    const startS = this.endS;
    const startK = st.curvature;
    const steps = length / ROAD_STEP;

    for (let n = 0; n < steps; n++) {
      const local = (n + 0.5) * ROAD_STEP;
      let k = lerp(startK, target, smoothstep(0, transition, local));
      // Soft heading guard: fade out curvature that would exceed the limit.
      if (st.heading * k > 0) {
        const over = (Math.abs(st.heading) - maxH * 0.85) / (maxH * 0.15);
        if (over > 0) k *= Math.max(0, 1 - over);
      }
      const hMid = st.heading + k * ROAD_STEP * 0.5;
      st.x += Math.sin(hMid) * ROAD_STEP;
      st.z += Math.cos(hMid) * ROAD_STEP;
      st.heading += k * ROAD_STEP;
      st.curvature = k;
      this.advanceElevation();
      this.pushSample();
    }

    this.segments.push({ index, startS, endS: this.endS, curvature: target });
  }

  private advanceElevation(): void {
    const c = this.config;
    const st = this.state;
    if (c.elevation === 'flat') {
      st.y = c.baseElevation;
      st.grade = 0;
      return;
    }
    if (c.elevation === 'levels') {
      const targetY = c.baseElevation + st.level * (c.levelHeight ?? 3.4);
      const desired = clamp((targetY - st.y) / 8, -c.maxGrade, c.maxGrade);
      st.grade += (desired - st.grade) * Math.min(1, ROAD_STEP / 6);
      st.y += st.grade * ROAD_STEP;
      return;
    }
    const look = 60;
    const tx = st.x + Math.sin(st.heading) * look;
    const tz = st.z + Math.cos(st.heading) * look;
    const target = Math.max(c.minElevation, this.elevation(tx, tz));
    const desired = clamp((target - st.y) / look, -c.maxGrade, c.maxGrade);
    st.grade += (desired - st.grade) * Math.min(1, ROAD_STEP / 40);
    st.y += st.grade * ROAD_STEP;
  }
}
