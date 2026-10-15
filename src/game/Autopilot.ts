import { clamp } from '../core/math';
import type { RoadGenerator } from '../world/RoadGenerator';
import type { VehicleInput, VehicleParams, VehicleState } from './VehicleController';

/**
 * Pure-pursuit lane follower. Drives the car behind the main menu (and is a
 * handy test driver): it keeps to the right-hand lane and slows for curves.
 */
export class Autopilot {
  constructor(
    private readonly road: RoadGenerator,
    private readonly laneOffset: number,
    private readonly cruiseSpeed: number,
  ) {}

  drive(state: VehicleState, params: VehicleParams, carS: number, out: VehicleInput): VehicleInput {
    const v = Math.max(0, state.speed);
    const ld = 9 + v * 0.85;
    const p = this.road.pointAt(carS + ld);
    const tx = p.x - Math.cos(p.heading) * this.laneOffset;
    const tz = p.z + Math.sin(p.heading) * this.laneOffset;
    const desired = Math.atan2(tx - state.x, tz - state.z);
    let alpha = desired - state.heading;
    alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    const delta = Math.atan((2 * params.wheelbase * Math.sin(alpha)) / ld);
    const grip = Math.atan((params.wheelbase * params.grip * params.steerSensitivity) / Math.max(v * v, 1));
    const maxSteer = Math.min(params.maxSteer, grip);
    out.steer = clamp(delta / Math.max(maxSteer, 1e-3), -1, 1);

    // Slow for the sharpest curvature in the next stretch of road.
    let k = 0;
    for (let d = 0; d <= 120; d += 20) k = Math.max(k, Math.abs(this.road.pointAt(carS + d).curvature));
    const curveSpeed = k > 1e-5 ? Math.sqrt(2.6 / k) : Infinity;
    const target = Math.min(this.cruiseSpeed, curveSpeed);
    const err = target - v;
    out.throttle = clamp(err * 0.35, 0, 0.8);
    out.brake = clamp(-err * 0.25, 0, 0.6);
    out.handbrake = false;
    return out;
  }
}
