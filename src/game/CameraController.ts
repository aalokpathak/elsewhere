import * as THREE from 'three';
import { clamp, damp, dampAngle, smoothstep } from '../core/math';
import { DRIVER_SEAT } from './CarModel';

export type CameraMode = 'chase' | 'cockpit' | 'cinematic';

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
  sensitivity: number;
  /** Ground height lookup, used to keep the camera out of hills. */
  groundAt: (x: number, z: number) => number;
  /** Ceiling height above the car indoors (absolute Y), if any. */
  ceilingY: number | null;
}

/**
 * Third-person chase, first-person cockpit and a slow cinematic orbit for the
 * menu background, with smooth blends between them. Pointer drags rotate the
 * view; it eases back behind the car when released.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  private blend = 0; // 0 = chase, 1 = cockpit
  private cinematicBlend = 0;
  private camHeading = 0;
  private camY = 0;
  private orbitYaw = 0;
  private orbitPitch = 0;
  private lookIdle = 0;
  private cineAngle = 0;
  private cineTime = 0;
  private initialised = false;
  private readonly chasePos = new THREE.Vector3();
  private readonly chaseLook = new THREE.Vector3();
  private readonly seatPos = new THREE.Vector3();
  private readonly seatLook = new THREE.Vector3();
  private readonly cinePos = new THREE.Vector3();
  private readonly cineLook = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.2, 7000);
    this.camera.position.set(0, 3, -8);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** Snap (no smoothing) on the next update, e.g. after a reset. */
  reset(): void {
    this.initialised = false;
  }

  addLook(dx: number, dy: number, sensitivity: number): void {
    if (dx === 0 && dy === 0) return;
    this.orbitYaw = clamp(this.orbitYaw - dx * 0.005 * sensitivity, -Math.PI * 0.95, Math.PI * 0.95);
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.004 * sensitivity, -0.5, 0.7);
    this.lookIdle = 0;
  }

  update(dt: number, t: CameraTarget, o: CameraOptions, looking: boolean): void {
    const cam = this.camera;
    if (!this.initialised) {
      this.camHeading = t.heading;
      this.camY = t.y + 2.4;
      this.blend = this.mode === 'cockpit' ? 1 : 0;
      this.cinematicBlend = this.mode === 'cinematic' ? 1 : 0;
    }
    const speed = Math.abs(t.speed);

    // Ease look-around back to centre after a moment of no input.
    if (!looking) {
      this.lookIdle += dt;
      if (this.lookIdle > 1.2) {
        this.orbitYaw = damp(this.orbitYaw, 0, 2.5, dt);
        this.orbitPitch = damp(this.orbitPitch, 0, 2.5, dt);
      }
    }

    this.blend = damp(this.blend, this.mode === 'cockpit' ? 1 : 0, 5, dt);
    this.cinematicBlend = damp(this.cinematicBlend, this.mode === 'cinematic' ? 1 : 0, 1.5, dt);

    // --- Chase ---------------------------------------------------------------
    const reversing = t.speed < -1;
    const targetHeading = t.heading + (reversing ? 0 : 0);
    this.camHeading = dampAngle(this.camHeading, targetHeading, this.initialised ? 3.2 : 1000, dt);
    const heading = this.camHeading + this.orbitYaw;
    const dist = 6.3 + Math.min(speed * 0.035, 1.6);
    let height = 2.15 + Math.min(speed * 0.012, 0.5) + this.orbitPitch * 3;
    if (o.ceilingY !== null) height = Math.min(height, o.ceilingY - t.y - 0.5);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    this.chasePos.set(t.x - fx * dist, 0, t.z - fz * dist);
    const desiredY = t.y + height;
    this.camY = this.initialised ? damp(this.camY, desiredY, 6, dt) : desiredY;
    const groundY = o.groundAt(this.chasePos.x, this.chasePos.z) + 0.7;
    this.chasePos.y = Math.max(this.camY, groundY);
    if (o.ceilingY !== null) this.chasePos.y = Math.min(this.chasePos.y, o.ceilingY - 0.35);
    const ahead = 5 + Math.min(speed * 0.15, 6);
    this.chaseLook.set(
      t.x + Math.sin(this.camHeading) * ahead,
      t.y + 1.1 - this.orbitPitch * 2,
      t.z + Math.cos(this.camHeading) * ahead,
    );

    // --- Cockpit -------------------------------------------------------------
    t.body.updateWorldMatrix(true, false);
    this.seatPos.copy(DRIVER_SEAT).applyMatrix4(t.body.matrixWorld);
    const ly = this.orbitYaw;
    this.tmp.set(DRIVER_SEAT.x + Math.sin(ly) * 10, DRIVER_SEAT.y - 0.35 - this.orbitPitch * 6, DRIVER_SEAT.z + Math.cos(ly) * 10);
    this.seatLook.copy(this.tmp).applyMatrix4(t.body.matrixWorld);

    // --- Cinematic -----------------------------------------------------------
    this.cineTime += dt;
    this.cineAngle += dt * 0.06;
    const ca = t.heading + Math.PI * 0.75 + Math.sin(this.cineAngle) * 1.6;
    const cd = 10 + Math.sin(this.cineTime * 0.09) * 3;
    this.cinePos.set(t.x + Math.sin(ca) * cd, 0, t.z + Math.cos(ca) * cd);
    let cy = t.y + 2.2 + Math.sin(this.cineTime * 0.13) * 1.1;
    if (o.ceilingY !== null) cy = Math.min(cy, o.ceilingY - 0.4);
    this.cinePos.y = Math.max(cy, o.groundAt(this.cinePos.x, this.cinePos.z) + 0.8);
    this.cineLook.set(t.x + Math.sin(t.heading) * 4, t.y + 1.0, t.z + Math.cos(t.heading) * 4);

    // --- Blend ---------------------------------------------------------------
    const e = smoothstep(0, 1, this.blend);
    cam.position.lerpVectors(this.chasePos, this.seatPos, e);
    this.look.lerpVectors(this.chaseLook, this.seatLook, e);
    const c = smoothstep(0, 1, this.cinematicBlend);
    if (c > 0.001) {
      cam.position.lerp(this.cinePos, c);
      this.look.lerp(this.cineLook, c);
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (!o.reduceMotion) {
      // Subtle lean into turns; none in the cockpit to keep the horizon calm.
      const lean = clamp(t.steer * speed * 0.004, -0.03, 0.03) * (1 - e);
      cam.rotateZ(lean);
    }

    const kick = o.reduceMotion ? 0 : Math.min(speed * 0.18, 9) * (1 - e * 0.6);
    let fov = o.fov + kick + e * 4;
    // On tall (portrait) screens keep at least ~70° horizontally so the road stays in view.
    const minH = 70 * (Math.PI / 180);
    const vForMinH = (2 * Math.atan(Math.tan(minH / 2) / Math.max(0.2, cam.aspect)) * 180) / Math.PI;
    fov = Math.min(100, Math.max(fov, vForMinH));
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = this.initialised ? damp(cam.fov, fov, 3, dt) : fov;
      cam.updateProjectionMatrix();
    }
    this.initialised = true;
  }

  get cockpitVisible(): boolean {
    return this.blend > 0.55;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
