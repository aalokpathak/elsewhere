import * as THREE from 'three';

/**
 * A growable-by-design-limit instanced mesh with O(1) add/remove.
 *
 * Instances are packed densely (`mesh.count` = live instances) by moving the
 * last instance into any freed slot. Owners keep opaque handles. Matrices are
 * stored relative to a local `origin` that is periodically re-centred near
 * the camera, so float32 instance transforms stay precise however far the
 * player drives.
 */
export class InstancePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly slotToHandle: Int32Array;
  private readonly handleToSlot = new Map<number, number>();
  private nextHandle = 1;
  private overflowWarned = false;
  readonly origin = new THREE.Vector2(0, 0);
  private dirty = false;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly capacity: number,
    opts: { castShadow?: boolean; receiveShadow?: boolean; colors?: boolean; name?: string } = {},
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = opts.name ?? 'pool';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = opts.castShadow ?? false;
    this.mesh.receiveShadow = opts.receiveShadow ?? true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (opts.colors) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.slotToHandle = new Int32Array(capacity);
  }

  get count(): number {
    return this.mesh.count;
  }

  /**
   * Adds an instance at world position (x, y, z) with yaw `rotY`, uniform or
   * per-axis `scale`, and optional linear RGB tint. Returns a handle, or -1 if
   * the pool is full.
   */
  add(
    x: number,
    y: number,
    z: number,
    rotY: number,
    scale: number | [number, number, number],
    tint?: [number, number, number],
    tilt?: [number, number],
  ): number {
    const slot = this.mesh.count;
    if (slot >= this.capacity) {
      if (!this.overflowWarned) {
        this.overflowWarned = true;
        console.warn(`[Elsewhere] instance pool "${this.mesh.name}" full (${this.capacity}); extra instances skipped.`);
      }
      return -1;
    }
    const sx = typeof scale === 'number' ? scale : scale[0];
    const sy = typeof scale === 'number' ? scale : scale[1];
    const sz = typeof scale === 'number' ? scale : scale[2];
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const o = slot * 16;
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    if (tilt) {
      // Small pitch/roll for objects that should follow terrain slope.
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x - this.origin.x, y, z - this.origin.y),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt[0], rotY, tilt[1], 'YXZ')),
        new THREE.Vector3(sx, sy, sz),
      );
      m.toArray(arr, o);
    } else {
      arr[o] = c * sx;
      arr[o + 1] = 0;
      arr[o + 2] = -s * sx;
      arr[o + 3] = 0;
      arr[o + 4] = 0;
      arr[o + 5] = sy;
      arr[o + 6] = 0;
      arr[o + 7] = 0;
      arr[o + 8] = s * sz;
      arr[o + 9] = 0;
      arr[o + 10] = c * sz;
      arr[o + 11] = 0;
      arr[o + 12] = x - this.origin.x;
      arr[o + 13] = y;
      arr[o + 14] = z - this.origin.y;
      arr[o + 15] = 1;
    }
    if (this.mesh.instanceColor) {
      const ca = this.mesh.instanceColor.array as Float32Array;
      ca[slot * 3] = tint ? tint[0] : 1;
      ca[slot * 3 + 1] = tint ? tint[1] : 1;
      ca[slot * 3 + 2] = tint ? tint[2] : 1;
    }
    const handle = this.nextHandle++;
    this.slotToHandle[slot] = handle;
    this.handleToSlot.set(handle, slot);
    this.mesh.count = slot + 1;
    this.dirty = true;
    return handle;
  }

  remove(handle: number): void {
    const slot = this.handleToSlot.get(handle);
    if (slot === undefined) return;
    this.handleToSlot.delete(handle);
    const last = this.mesh.count - 1;
    if (slot !== last) {
      const arr = this.mesh.instanceMatrix.array as Float32Array;
      arr.copyWithin(slot * 16, last * 16, last * 16 + 16);
      if (this.mesh.instanceColor) {
        const ca = this.mesh.instanceColor.array as Float32Array;
        ca.copyWithin(slot * 3, last * 3, last * 3 + 3);
      }
      const moved = this.slotToHandle[last];
      this.slotToHandle[slot] = moved;
      this.handleToSlot.set(moved, slot);
    }
    this.mesh.count = last;
    this.dirty = true;
  }

  removeAll(handles: number[]): void {
    for (const h of handles) if (h > 0) this.remove(h);
  }

  /** Sets the tint of one instance (used for flickering fixtures). */
  setTint(handle: number, tint: [number, number, number]): void {
    const slot = this.handleToSlot.get(handle);
    if (slot === undefined || !this.mesh.instanceColor) return;
    const ca = this.mesh.instanceColor.array as Float32Array;
    ca[slot * 3] = tint[0];
    ca[slot * 3 + 1] = tint[1];
    ca[slot * 3 + 2] = tint[2];
    this.mesh.instanceColor.needsUpdate = true;
  }

  getPosition(handle: number, out: THREE.Vector3): THREE.Vector3 | null {
    const slot = this.handleToSlot.get(handle);
    if (slot === undefined) return null;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    return out.set(arr[slot * 16 + 12] + this.origin.x, arr[slot * 16 + 13], arr[slot * 16 + 14] + this.origin.y);
  }

  /** Re-centres local coordinates on (x, z). */
  rebase(x: number, z: number): void {
    const dx = x - this.origin.x;
    const dz = z - this.origin.y;
    if (dx === 0 && dz === 0) return;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.mesh.count; i++) {
      arr[i * 16 + 12] -= dx;
      arr[i * 16 + 14] -= dz;
    }
    this.origin.set(x, z);
    this.mesh.position.set(x, 0, z);
    this.dirty = true;
  }

  /** Uploads changes to the GPU at most once per frame. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.handleToSlot.clear();
    this.mesh.count = 0;
    this.dirty = true;
  }

  dispose(disposeGeometry = true): void {
    this.mesh.removeFromParent();
    if (disposeGeometry) this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
