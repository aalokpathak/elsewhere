import { clamp, damp } from '../core/math';
import type { SurfaceKind } from './WorldManager';

/**
 * Lightweight arcade driving model (kinematic bicycle + longitudinal forces).
 * No rigid-body engine: the car follows the ground height under its wheels,
 * pitches and rolls with the terrain, and the body leans with acceleration
 * through a damped spring. Pure TypeScript — unit tested without three.js.
 */

export interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export interface VehicleParams {
  maxSpeed: number;
  maxReverse: number;
  accel: number;
  brakeDecel: number;
  reverseAccel: number;
  wheelbase: number;
  track: number;
  maxSteer: number;
  /** Lateral grip limit (m/s²) that caps steering angle at speed. */
  grip: number;
  steerSensitivity: number;
}

export const DEFAULT_VEHICLE: VehicleParams = {
  maxSpeed: 120 / 3.6,
  maxReverse: 22 / 3.6,
  accel: 4.4,
  brakeDecel: 9,
  reverseAccel: 3,
  wheelbase: 2.64,
  track: 1.56,
  maxSteer: 0.58,
  grip: 8.5,
  steerSensitivity: 1,
};

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  steerInput: number;
  steer: number;
  yawRate: number;
  /** Ground-aligned orientation (three.js rotation.x / rotation.z). */
  groundPitch: number;
  groundRoll: number;
  /** Body lean on the suspension. */
  bodyPitch: number;
  bodyRoll: number;
  bounce: number;
  bounceVel: number;
  wheelSpin: number;
  accel: number;
  cruise: number | null;
  surface: SurfaceKind;
  throttle: number;
  braking: boolean;
  stuckTime: number;
  odometer: number;
}

export interface GroundProbe {
  (x: number, z: number): { height: number; surface: SurfaceKind };
}

const SURFACE_DRAG: Record<SurfaceKind, number> = {
  asphalt: 0.22,
  floor: 0.22,
  shoulder: 0.6,
  offroad: 1.5,
  water: 7,
};

const SURFACE_TOP: Record<SurfaceKind, number> = {
  asphalt: 1,
  floor: 1,
  shoulder: 0.85,
  offroad: 0.55,
  water: 0.15,
};

export function createVehicleState(): VehicleState {
  return {
    x: 0, y: 0, z: 0, heading: 0, speed: 0, steerInput: 0, steer: 0, yawRate: 0,
    groundPitch: 0, groundRoll: 0, bodyPitch: 0, bodyRoll: 0, bounce: 0, bounceVel: 0,
    wheelSpin: 0, accel: 0, cruise: null, surface: 'asphalt', throttle: 0, braking: false,
    stuckTime: 0, odometer: 0,
  };
}

export class VehicleController {
  readonly state: VehicleState = createVehicleState();

  constructor(public params: VehicleParams = { ...DEFAULT_VEHICLE }) {}

  reset(x: number, y: number, z: number, heading: number): void {
    const s = this.state;
    Object.assign(s, createVehicleState(), { x, y, z, heading, odometer: s.odometer });
  }

  toggleCruise(): boolean {
    const s = this.state;
    if (s.cruise !== null || s.speed < 5) {
      s.cruise = null;
      return false;
    }
    s.cruise = s.speed;
    return true;
  }

  update(dt: number, input: VehicleInput, ground: GroundProbe): void {
    const s = this.state;
    const p = this.params;
    dt = Math.min(dt, 0.05);

    // --- Steering: eased input, speed-limited angle -------------------------
    const target = clamp(input.steer, -1, 1);
    const returning = Math.abs(target) < Math.abs(s.steerInput) || Math.sign(target) !== Math.sign(s.steerInput);
    const rate = (returning ? 4.2 : 2.2) * (0.75 + 0.25 * p.steerSensitivity);
    const delta = target - s.steerInput;
    s.steerInput += clamp(delta, -rate * dt, rate * dt);
    const v = s.speed;
    const vAbs = Math.abs(v);
    const gripLimit = Math.atan((p.wheelbase * p.grip * p.steerSensitivity) / Math.max(vAbs * vAbs, 1));
    const maxSteer = Math.min(p.maxSteer, gripLimit);
    s.steer = s.steerInput * maxSteer;

    // --- Longitudinal --------------------------------------------------------
    let throttle = clamp(input.throttle, 0, 1);
    const brake = clamp(input.brake, 0, 1);
    if (brake > 0.05 || input.handbrake) s.cruise = null;
    if (s.cruise !== null && throttle < 0.05) {
      throttle = clamp((s.cruise - v) * 0.6, 0, 1);
    }
    const top = p.maxSpeed * SURFACE_TOP[s.surface];
    let a = 0;
    let braking = false;
    if (throttle > 0) {
      if (v > -0.4) {
        const f = 1 - (Math.max(v, 0) / top) ** 2;
        a += throttle * p.accel * (f > 0 ? f : f * 2);
      } else {
        a += throttle * p.brakeDecel;
        braking = true;
      }
    }
    if (brake > 0) {
      if (v > 0.4) {
        a -= brake * p.brakeDecel;
        braking = true;
      } else if (v > -p.maxReverse) {
        a -= brake * p.reverseAccel;
      }
    }
    if (input.handbrake) {
      a -= Math.sign(v) * p.brakeDecel * 1.15;
      braking = true;
    }
    // Off-throttle engine braking (stronger in reverse gear).
    const engineBrake = throttle === 0 && brake === 0 ? (v < 0 ? 2.2 : 0.35) : 0;
    const drag = SURFACE_DRAG[s.surface] + engineBrake + 0.00045 * v * v;
    // Gravity along the slope (groundPitch is negative when nose-up).
    const grade = Math.tan(-s.groundPitch);
    const gravity = (-9.81 * grade) / Math.sqrt(1 + grade * grade);
    let nv = v + (a + gravity) * dt;
    // Rolling resistance and drag act towards zero but never reverse direction.
    const resist = drag * dt;
    if (nv > 0) nv = Math.max(0, nv - resist);
    else if (nv < 0) nv = Math.min(0, nv + resist);
    // Do not creep into reverse from braking unless reversing was requested.
    if (v > 0 && nv < 0 && !(brake > 0 && v <= 0.4)) nv = 0;
    if (v < 0 && nv > 0 && throttle === 0 && Math.abs(gravity) < 0.5) nv = 0;
    s.speed = clamp(nv, -p.maxReverse, p.maxSpeed * 1.05);
    s.accel = (s.speed - v) / dt;
    s.braking = braking;
    s.throttle = throttle;

    // --- Yaw -------------------------------------------------------------
    let yawTarget = (s.speed / p.wheelbase) * Math.tan(s.steer);
    if (input.handbrake && vAbs > 4) yawTarget *= 1.3;
    if (s.surface === 'water') yawTarget *= 0.3;
    s.yawRate = damp(s.yawRate, yawTarget, 9, dt);
    s.heading += s.yawRate * dt;

    // --- Position ------------------------------------------------------------
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const step = s.speed * dt;
    const nx = s.x + fx * step;
    const nz = s.z + fz * step;
    // Faces steeper than ~48° are walls: the car stops against them instead of climbing.
    const ahead = ground(nx + fx * Math.sign(step) * 1.6, nz + fz * Math.sign(step) * 1.6).height;
    const rise = ahead - s.y;
    if (Math.abs(step) > 1e-5 && rise > 0.6 && rise / 1.6 > 1.1) {
      s.speed *= -0.12;
      s.yawRate *= 0.3;
    } else {
      s.x = nx;
      s.z = nz;
      s.odometer += Math.abs(step);
    }

    // --- Ground following ----------------------------------------------------
    const rx = -fz;
    const rz = fx;
    const hw = p.track / 2;
    const hl = p.wheelbase / 2;
    const fl = ground(s.x + fx * hl - rx * hw, s.z + fz * hl - rz * hw).height;
    const fr = ground(s.x + fx * hl + rx * hw, s.z + fz * hl + rz * hw).height;
    const rl = ground(s.x - fx * hl - rx * hw, s.z - fz * hl - rz * hw).height;
    const rr = ground(s.x - fx * hl + rx * hw, s.z - fz * hl + rz * hw).height;
    const center = ground(s.x, s.z);
    s.surface = center.surface;
    const avg = (fl + fr + rl + rr) / 4;
    const groundY = Math.max(avg, center.height - 0.05);
    const front = (fl + fr) / 2;
    const rear = (rl + rr) / 2;
    const left = (fl + rl) / 2;
    const right = (fr + rr) / 2;
    s.groundPitch = damp(s.groundPitch, clamp(-Math.atan2(front - rear, p.wheelbase), -0.5, 0.5), 14, dt);
    s.groundRoll = damp(s.groundRoll, clamp(Math.atan2(left - right, p.track), -0.45, 0.45), 14, dt);
    // Bumps: the body lags vertical ground changes through a spring.
    const prevY = s.y;
    s.y = groundY;
    const dy = s.y - prevY;
    if (Math.abs(dy) < 2) s.bounceVel -= dy * 6;
    s.bounceVel += (-s.bounce * 140 - s.bounceVel * 14) * dt;
    s.bounce = clamp(s.bounce + s.bounceVel * dt, -0.08, 0.08);
    if (s.surface === 'offroad' && vAbs > 3) s.bounceVel += (Math.random() - 0.5) * vAbs * 0.06;

    // Suspension lean from longitudinal and lateral acceleration.
    const lateralAccel = s.speed * s.yawRate;
    s.bodyPitch = damp(s.bodyPitch, clamp(-s.accel * 0.0055, -0.05, 0.05), 5, dt);
    s.bodyRoll = damp(s.bodyRoll, clamp(lateralAccel * 0.0065, -0.06, 0.06), 5, dt);

    s.wheelSpin += (s.speed * dt) / 0.34;

    // Stuck detection: pushing the throttle without getting anywhere.
    if ((throttle > 0.5 || brake > 0.5) && vAbs < 0.6) s.stuckTime += dt;
    else s.stuckTime = Math.max(0, s.stuckTime - dt * 2);
  }
}
