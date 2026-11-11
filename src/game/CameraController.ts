import * as THREE from 'three';
import { clamp, damp, dampAngle, smoothstep } from '../core/math';
import { DRIVER_SEAT, HOOD_CAMERA } from './CarModel';

/** Cameras the player can cycle through while driving. */
export const DRIVE_CAMERAS = ['chase', 'cockpit', 'hood', 'drone'] as const;
export type DriveCamera = (typeof DRIVE_CAMERAS)[number];
export type CameraMode = DriveCamera | 'cinematic' | 'photo';

export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase',
  cockpit: 'Cockpit',
  hood: 'Hood',
  drone: 'Drone',
  cinematic: 'Cinematic',
  photo: 'Photo',
};

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  steer: number;
  /** The car body, for the first-person seat transform. */
  body: THREE.Object3D;
}

export interface CameraOptions {
  reduceMotion: boolean;
  fov: number;
  /** Ground height lookup, used to keep the camera out of hills. */
  groundAt: (x: number, z: number) => number;
  /** Ceiling height above the car indoors (absolute Y), if any. */
  ceilingY: number | null;
  /** Hold-to-look-behind (chase camera). */
  lookBack: boolean;
}

/**
 * Chase, cockpit, hood and drone cameras for driving, a slow cinematic orbit
 * for the menu, and a free orbit for photo mode. Switching modes blends from
 * the previous view in the car's own frame, so the blend stays smooth at any
 * speed. Pointer drags look around; the view eases back when released.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  private blend = 1;
  private camHeading = 0;
  private camY = 0;
  private orbitYaw = 0;
  private orbitPitch = 0;
  private lookIdle = 0;
  private cineTime = 0;
  private initialised = false;
  /** Photo-mode orbit state. */
  photoYaw = 0.6;
  photoPitch = 0.22;
  photoDistance = 8;
  photoFov = 50;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fromLocalPos = new THREE.Vector3();
  private readonly fromLocalLook = new THREE.Vector3();
  private readonly fromPos = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private readonly lastLook = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private lastTarget: CameraTarget | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.2, 7000);
    this.camera.position.set(0, 3, -8);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    const t = this.lastTarget;
    if (t && this.initialised) {
      // Remember the current view relative to the car to blend from it.
      this.toLocal(this.camera.position, t, this.fromLocalPos);
      this.toLocal(this.lastLook, t, this.fromLocalLook);
      this.blend = 0;
    }
    if (mode === 'photo') {
      // Start the orbit from roughly where the camera already is.
      const dx = this.camera.position.x - (t?.x ?? 0);
      const dz = this.camera.position.z - (t?.z ?? 0);
      this.photoYaw = Math.atan2(dx, dz);
      this.photoDistance = clamp(Math.hypot(dx, dz), 4, 14);
      this.photoPitch = 0.2;
      this.photoFov = 50;
    }
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.mode = mode;
  }

  /** Snap (no smoothing) on the next update, e.g. after a reset. */
  reset(): void {
    this.initialised = false;
    this.blend = 1;
  }

  addLook(dx: number, dy: number, sensitivity: number): void {
    if (dx === 0 && dy === 0) return;
    if (this.mode === 'photo') {
      this.photoYaw -= dx * 0.006 * sensitivity;
      this.photoPitch = clamp(this.photoPitch + dy * 0.004 * sensitivity, -0.12, 1.35);
      return;
    }
    this.orbitYaw = clamp(this.orbitYaw - dx * 0.005 * sensitivity, -Math.PI * 0.95, Math.PI * 0.95);
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.004 * sensitivity, -0.5, 0.7);
    this.lookIdle = 0;
  }

  /** Mouse wheel / pinch: zooms the photo-mode orbit. */
  addZoom(delta: number): void {
    if (this.mode !== 'photo') return;
    this.photoDistance = clamp(this.photoDistance * Math.exp(delta * 0.0012), 2.6, 80);
  }

  private toLocal(world: THREE.Vector3, t: CameraTarget, out: THREE.Vector3): void {
    const dx = world.x - t.x;
    const dz = world.z - t.z;
    const c = Math.cos(t.heading);
    const s = Math.sin(t.heading);
    out.set(dx * c - dz * s, world.y - t.y, dx * s + dz * c);
  }

  private toWorld(local: THREE.Vector3, t: CameraTarget, out: THREE.Vector3): void {
    const c = Math.cos(t.heading);
    const s = Math.sin(t.heading);
    out.set(t.x + local.x * c + local.z * s, t.y + local.y, t.z - local.x * s + local.z * c);
  }

  update(dt: number, t: CameraTarget, o: CameraOptions, looking: boolean): void {
    const cam = this.camera;
    this.lastTarget = t;
    if (!this.initialised) {
      this.camHeading = t.heading;
      this.camY = t.y + 2.4;
      this.blend = 1;
    }
    const speed = Math.abs(t.speed);
    const mode = this.mode;

    // Ease look-around back to centre after a moment of no input.
    if (!looking && mode !== 'photo') {
      this.lookIdle += dt;
      if (this.lookIdle > 1.2) {
        this.orbitYaw = damp(this.orbitYaw, 0, 2.5, dt);
        this.orbitPitch = damp(this.orbitPitch, 0, 2.5, dt);
      }
    }

    let fov = o.fov;
    let lean = 0;
    // The chase heading is tracked in every mode so returning to it is seamless.
    this.camHeading = dampAngle(this.camHeading, t.heading, this.initialised ? 3.2 : 1000, dt);

    if (mode === 'chase') {
      const back = o.lookBack ? Math.PI : 0;
      const heading = this.camHeading + this.orbitYaw + back;
      const dist = 6.4 + Math.min(speed * 0.035, 1.6);
      let height = 2.1 + Math.min(speed * 0.012, 0.5) + this.orbitPitch * 3;
      if (o.ceilingY !== null) height = Math.min(height, o.ceilingY - t.y - 0.5);
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      this.pos.set(t.x - fx * dist, 0, t.z - fz * dist);
      const desiredY = t.y + height;
      this.camY = this.initialised ? damp(this.camY, desiredY, 6, dt) : desiredY;
      this.pos.y = Math.max(this.camY, o.groundAt(this.pos.x, this.pos.z) + 0.7);
      if (o.ceilingY !== null) this.pos.y = Math.min(this.pos.y, o.ceilingY - 0.35);
      const ahead = 5 + Math.min(speed * 0.15, 6);
      const lh = this.camHeading + back;
      this.look.set(t.x + Math.sin(lh) * ahead, t.y + 1.1 - this.orbitPitch * 2, t.z + Math.cos(lh) * ahead);
      if (!o.reduceMotion) {
        lean = clamp(t.steer * speed * 0.004, -0.03, 0.03);
        fov += Math.min(speed * 0.18, 9);
      }
    } else if (mode === 'cockpit' || mode === 'hood') {
      t.body.updateWorldMatrix(true, false);
      const seat = mode === 'cockpit' ? DRIVER_SEAT : HOOD_CAMERA;
      this.pos.copy(seat).applyMatrix4(t.body.matrixWorld);
      const ly = this.orbitYaw;
      this.tmp.set(seat.x + Math.sin(ly) * 10, seat.y - 0.35 - this.orbitPitch * 6, seat.z + Math.cos(ly) * 10);
      this.look.copy(this.tmp).applyMatrix4(t.body.matrixWorld);
      this.camY = this.pos.y;
      fov += mode === 'cockpit' ? 4 : 6;
      if (!o.reduceMotion) fov += Math.min(speed * 0.08, 4);
    } else if (mode === 'photo') {
      const cp = Math.cos(this.photoPitch);
      this.pos.set(
        t.x + Math.sin(this.photoYaw) * cp * this.photoDistance,
        t.y + 0.9 + Math.sin(this.photoPitch) * this.photoDistance,
        t.z + Math.cos(this.photoYaw) * cp * this.photoDistance,
      );
      this.pos.y = Math.max(this.pos.y, o.groundAt(this.pos.x, this.pos.z) + 0.35);
      if (o.ceilingY !== null) this.pos.y = Math.min(this.pos.y, o.ceilingY - 0.3);
      this.look.set(t.x, t.y + 0.85, t.z);
      this.camY = this.pos.y;
      fov = this.photoFov;
    } else {
      // Drone / cinematic: a slow, wandering orbit around the car.
      this.cineTime += dt;
      const wander = Math.sin(this.cineTime * 0.06) * 1.6;
      const ca = t.heading + Math.PI * 0.75 + wander + this.orbitYaw;
      const far = mode === 'drone' ? 4 : 0;
      const cd = 10 + far + Math.sin(this.cineTime * 0.09) * 3;
      this.pos.set(t.x + Math.sin(ca) * cd, 0, t.z + Math.cos(ca) * cd);
      let cy = t.y + 2.2 + far * 0.6 + Math.sin(this.cineTime * 0.13) * 1.1 + this.orbitPitch * 6;
      if (o.ceilingY !== null) cy = Math.min(cy, o.ceilingY - 0.4);
      this.pos.y = Math.max(cy, o.groundAt(this.pos.x, this.pos.z) + 0.8);
      this.look.set(t.x + Math.sin(t.heading) * 4, t.y + 1.0, t.z + Math.cos(t.heading) * 4);
      this.camY = this.pos.y;
    }

    // Blend from the previous mode's view.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.75);
      const e = smoothstep(0, 1, this.blend);
      this.toWorld(this.fromLocalPos, t, this.fromPos);
      this.toWorld(this.fromLocalLook, t, this.fromLook);
      this.pos.lerpVectors(this.fromPos, this.pos, e);
      this.look.lerpVectors(this.fromLook, this.look, e);
      lean *= e;
    }

    cam.position.copy(this.pos);
    this.lastLook.copy(this.look);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (lean !== 0) cam.rotateZ(lean);

    // On tall (portrait) screens keep at least ~70° horizontally so the road stays in view.
    if (mode !== 'photo') {
      const minH = 70 * (Math.PI / 180);
      const vForMinH = (2 * Math.atan(Math.tan(minH / 2) / Math.max(0.2, cam.aspect)) * 180) / Math.PI;
      fov = Math.min(100, Math.max(fov, vForMinH));
    }
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = this.initialised ? damp(cam.fov, fov, 3.5, dt) : fov;
      cam.updateProjectionMatrix();
    }
    this.initialised = true;
  }

  /** True while the view is (mostly) inside the cabin. */
  get cockpitVisible(): boolean {
    return this.mode === 'cockpit' && this.blend > 0.5;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
