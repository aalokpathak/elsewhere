import { describe, expect, it } from 'vitest';
import { DEFAULT_VEHICLE, VehicleController, type GroundProbe, type VehicleInput } from '../src/game/VehicleController';

const flat: GroundProbe = () => ({ height: 0, surface: 'asphalt' });
const input = (p: Partial<VehicleInput> = {}): VehicleInput => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, ...p });

function run(v: VehicleController, seconds: number, inp: VehicleInput, ground = flat) {
  for (let t = 0; t < seconds; t += 1 / 60) v.update(1 / 60, inp, ground);
}

describe('VehicleController', () => {
  it('accelerates forward along its heading and respects top speed', () => {
    const v = new VehicleController({ ...DEFAULT_VEHICLE, maxSpeed: 30 });
    v.reset(0, 0, 0, 0);
    run(v, 3, input({ throttle: 1 }));
    expect(v.state.speed).toBeGreaterThan(8);
    expect(v.state.z).toBeGreaterThan(10);
    expect(Math.abs(v.state.x)).toBeLessThan(1e-6);
    run(v, 60, input({ throttle: 1 }));
    expect(v.state.speed).toBeLessThanOrEqual(30 * 1.05);
    expect(v.state.speed).toBeGreaterThan(25);
  });

  it('brakes to a stop, then reverses only while braking is held', () => {
    const v = new VehicleController();
    v.reset(0, 0, 0, 0);
    run(v, 4, input({ throttle: 1 }));
    run(v, 4, input({ brake: 1 }));
    expect(v.state.speed).toBeLessThanOrEqual(0);
    run(v, 3, input({ brake: 1 }));
    expect(v.state.speed).toBeLessThan(-1);
    expect(v.state.speed).toBeGreaterThanOrEqual(-DEFAULT_VEHICLE.maxReverse - 1e-6);
    run(v, 6, input());
    expect(Math.abs(v.state.speed)).toBeLessThan(0.5);
  });

  it('coasts to a halt without input (no creeping)', () => {
    const v = new VehicleController();
    v.reset(0, 0, 0, 0);
    run(v, 3, input({ throttle: 1 }));
    run(v, 120, input());
    expect(v.state.speed).toBe(0);
  });

  it('steers left for positive input and turns less sharply at speed', () => {
    const v = new VehicleController();
    v.reset(0, 0, 0, 0);
    run(v, 2, input({ throttle: 1, steer: 1 }));
    expect(v.state.heading).toBeGreaterThan(0);
    expect(v.state.x).toBeGreaterThan(0); // +X is the left-hand side when facing +Z
    const slow = Math.abs(v.state.steer);
    run(v, 8, input({ throttle: 1, steer: 1 }));
    expect(Math.abs(v.state.steer)).toBeLessThan(slow);
  });

  it('follows the ground height and pitches on slopes', () => {
    const v = new VehicleController();
    const slope: GroundProbe = (_x, z) => ({ height: z * 0.1, surface: 'asphalt' });
    v.reset(0, 0, 0, 0);
    run(v, 3, input({ throttle: 1 }), slope);
    expect(v.state.y).toBeCloseTo(v.state.z * 0.1, 1);
    expect(v.state.groundPitch).toBeLessThan(-0.05); // nose up
  });

  it('cannot climb a vertical wall', () => {
    const v = new VehicleController();
    const wall: GroundProbe = (_x, z) => ({ height: z > 20 ? 30 : 0, surface: 'offroad' });
    v.reset(0, 0, 0, 0);
    run(v, 10, input({ throttle: 1 }), wall);
    expect(v.state.z).toBeLessThan(20);
    expect(v.state.y).toBeLessThan(1);
  });

  it('cruise control holds speed and cancels on brake', () => {
    const v = new VehicleController();
    v.reset(0, 0, 0, 0);
    run(v, 5, input({ throttle: 1 }));
    const target = v.state.speed;
    expect(v.toggleCruise()).toBe(true);
    run(v, 10, input());
    expect(v.state.speed).toBeGreaterThan(target - 1.5);
    run(v, 0.2, input({ brake: 1 }));
    expect(v.state.cruise).toBeNull();
  });
});
