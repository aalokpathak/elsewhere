/**
 * Lightweight 2D collision for solid scenery (tree trunks, boulders, houses,
 * poles, fences, guardrails, parked cars). Pure TypeScript and unit-tested.
 *
 * Colliders are registered in groups (one per terrain chunk or road segment)
 * so they can be removed in one call when that piece of world is recycled.
 */

export interface CircleCollider {
  type: 'circle';
  x: number;
  z: number;
  r: number;
}

/** Oriented box: local +Z points along (sin rot, cos rot). */
export interface BoxCollider {
  type: 'box';
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
}

export type Collider = CircleCollider | BoxCollider;

export interface CollisionResult {
  hit: boolean;
  /** Corrected position. */
  x: number;
  z: number;
  /** Contact normal of the deepest hit (pointing away from the obstacle). */
  nx: number;
  nz: number;
  depth: number;
}

const CELL = 16;
const OFFSET = 1 << 20;
const key = (ix: number, iz: number): number => (ix + OFFSET) * 2097152 + (iz + OFFSET);

export function createCollisionResult(): CollisionResult {
  return { hit: false, x: 0, z: 0, nx: 0, nz: 0, depth: 0 };
}

export class ColliderGrid {
  private readonly cells = new Map<number, Collider[]>();
  private readonly groups = new Map<string, Collider[]>();

  get groupCount(): number {
    return this.groups.size;
  }

  get colliderCount(): number {
    let n = 0;
    for (const g of this.groups.values()) n += g.length;
    return n;
  }

  private forEachCell(c: Collider, fn: (k: number) => void): void {
    const r = c.type === 'circle' ? c.r : Math.hypot(c.hx, c.hz);
    const x0 = Math.floor((c.x - r) / CELL);
    const x1 = Math.floor((c.x + r) / CELL);
    const z0 = Math.floor((c.z - r) / CELL);
    const z1 = Math.floor((c.z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(key(ix, iz));
  }

  addGroup(id: string, colliders: Collider[]): void {
    this.removeGroup(id);
    if (colliders.length === 0) return;
    this.groups.set(id, colliders);
    for (const c of colliders) {
      this.forEachCell(c, (k) => {
        const cell = this.cells.get(k);
        if (cell) cell.push(c);
        else this.cells.set(k, [c]);
      });
    }
  }

  removeGroup(id: string): void {
    const list = this.groups.get(id);
    if (!list) return;
    this.groups.delete(id);
    for (const c of list) {
      this.forEachCell(c, (k) => {
        const cell = this.cells.get(k);
        if (!cell) return;
        const i = cell.indexOf(c);
        if (i >= 0) {
          cell[i] = cell[cell.length - 1];
          cell.pop();
        }
        if (cell.length === 0) this.cells.delete(k);
      });
    }
  }

  clear(): void {
    this.cells.clear();
    this.groups.clear();
  }

  /**
   * Pushes a circle (x, z, r) out of every collider it overlaps. The result
   * holds the corrected position and the normal of the deepest contact.
   */
  resolve(x: number, z: number, r: number, out: CollisionResult = createCollisionResult()): CollisionResult {
    out.hit = false;
    out.depth = 0;
    out.nx = 0;
    out.nz = 0;
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cell = this.cells.get(key(ix, iz));
        if (!cell) continue;
        for (const c of cell) {
          let nx = 0;
          let nz = 0;
          let depth = 0;
          if (c.type === 'circle') {
            const dx = x - c.x;
            const dz = z - c.z;
            const d = Math.hypot(dx, dz);
            const min = r + c.r;
            if (d >= min) continue;
            if (d > 1e-6) {
              nx = dx / d;
              nz = dz / d;
            } else {
              nx = 1;
            }
            depth = min - d;
          } else {
            const dx = x - c.x;
            const dz = z - c.z;
            const cs = Math.cos(c.rot);
            const sn = Math.sin(c.rot);
            const lx = dx * cs - dz * sn;
            const lz = dx * sn + dz * cs;
            const qx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
            const qz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
            let ex = lx - qx;
            let ez = lz - qz;
            const d = Math.hypot(ex, ez);
            if (d >= r) continue;
            if (d > 1e-6) {
              ex /= d;
              ez /= d;
              depth = r - d;
            } else {
              // Centre is inside the box: leave through the nearest face.
              const px = c.hx - Math.abs(lx);
              const pz = c.hz - Math.abs(lz);
              if (px < pz) {
                ex = lx < 0 ? -1 : 1;
                ez = 0;
                depth = px + r;
              } else {
                ex = 0;
                ez = lz < 0 ? -1 : 1;
                depth = pz + r;
              }
            }
            nx = ex * cs + ez * sn;
            nz = -ex * sn + ez * cs;
          }
          x += nx * depth;
          z += nz * depth;
          if (depth > out.depth) {
            out.depth = depth;
            out.nx = nx;
            out.nz = nz;
          }
          out.hit = true;
        }
      }
    }
    out.x = x;
    out.z = z;
    return out;
  }
}
