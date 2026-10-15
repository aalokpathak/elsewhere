import * as THREE from 'three';
import type { GraphicsProfile } from '../config/graphics';
import { clamp, DEG, smoothstep } from '../core/math';
import type { EnvironmentPreset } from './environments/types';
import { Precipitation } from './Precipitation';
import { createRoadPoint, type RoadGenerator } from './RoadGenerator';
import { Sky } from './Sky';
import { Water } from './Water';
import type { AtmosphereState } from './WeatherSystem';

/** Short-lived adjustments requested by the anomaly system. */
export interface AtmosphereOverlay {
  /** Multiplier on fog distances (1 = unchanged). */
  fogScale: number;
  /** Multiplier on artificial lights (flicker). */
  lights: number;
}

/**
 * Owns the scene-wide atmosphere: sky, sun and ambient light, fog, water,
 * precipitation, the sky-derived environment map, and the handful of real
 * point lights used indoors. Everything is driven from one AtmosphereState.
 */
export class EnvironmentManager {
  readonly sky: Sky;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  readonly water: Water | null;
  readonly precipitation: Precipitation;
  private readonly indoorLights: THREE.PointLight[] = [];
  private readonly envScene = new THREE.Scene();
  private readonly envSky: Sky;
  private readonly pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envTimer = 0;
  private envDirty = true;
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  private readonly tmpPoint = createRoadPoint();
  /** 0 = night, 1 = full daylight; consumed by audio and scenery. */
  brightness = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly env: EnvironmentPreset,
    profile: GraphicsProfile,
  ) {
    this.sky = new Sky(profile.clouds);
    scene.add(this.sky.mesh);
    this.envSky = new Sky(false);
    this.envScene.add(this.envSky.mesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.name = 'sun';
    if (profile.shadows !== 'off' && env.kind === 'outdoor') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      const half = profile.shadows === 'all' ? 70 : 12;
      const cam = this.sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = 400;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = profile.shadows === 'all' ? 0.06 : 0.02;
    }
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    scene.add(this.hemi);

    this.fog = new THREE.Fog('#cccccc', 100, 1000);
    scene.fog = this.fog;

    this.water = env.terrain.seaLevel !== undefined ? new Water(env.terrain.seaLevel) : null;
    if (this.water) scene.add(this.water.mesh);

    this.precipitation = new Precipitation(profile.precipitation);
    scene.add(this.precipitation.group);

    if (env.kind === 'indoor' && env.indoor) {
      for (let i = 0; i < profile.indoorLights; i++) {
        const l = new THREE.PointLight(env.indoor.lightColor, 0, 22, 1.6);
        l.name = `indoor-light-${i}`;
        this.indoorLights.push(l);
        scene.add(l);
      }
    }
  }

  markEnvironmentDirty(): void {
    this.envDirty = true;
  }

  apply(state: AtmosphereState, overlay: AtmosphereOverlay, viewDistance: number, time: number, transitioning: boolean): void {
    const el = state.sunElevation * DEG;
    const az = state.sunAzimuth * DEG;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();

    const u = this.sky.uniforms;
    u.uZenith.value.setRGB(...state.skyZenith);
    u.uHorizon.value.setRGB(...state.skyHorizon);
    u.uGround.value.setRGB(...state.skyGround);
    u.uSunColor.value.setRGB(...state.sunColor);
    u.uCloudColor.value.setRGB(...state.cloudColor);
    u.uSunDir.value.copy(this.sunDir);
    u.uCloudCover.value = state.cloudCover;
    u.uStars.value = state.stars;
    u.uSunDisc.value = state.sunDisc * smoothstep(-4, 1, state.sunElevation);
    u.uTime.value = time;

    // Sun fades out as it sets.
    const sunUp = smoothstep(-6, 4, state.sunElevation);
    this.sun.color.setRGB(...state.sunColor);
    this.sun.intensity = state.sunIntensity * Math.max(0.15, sunUp);
    this.hemi.color.setRGB(...state.hemiSky);
    this.hemi.groundColor.setRGB(...state.hemiGround);
    this.hemi.intensity = state.hemiIntensity;

    const far = Math.min(state.fogFar * overlay.fogScale, viewDistance * 0.96);
    this.fog.color.setRGB(...state.skyHorizon);
    this.fog.far = far;
    this.fog.near = Math.min(state.fogNear * overlay.fogScale, far * 0.6);

    this.renderer.toneMappingExposure = state.exposure;
    this.brightness = clamp(state.sunIntensity * sunUp * 0.35 + state.hemiIntensity * 0.45, 0, 1);

    if (this.water) {
      const w = this.water.uniforms;
      w.uSky.value.setRGB(...state.skyZenith);
      w.uHorizon.value.setRGB(...state.skyHorizon);
      w.uSunColor.value.setRGB(...state.sunColor);
      w.uSunDir.value.copy(this.sunDir);
      w.uSunStrength.value = state.sunIntensity * sunUp * state.sunDisc * 0.5 + 0.05;
      w.uTime.value = time;
      w.uFogNear.value = this.fog.near;
      w.uFogFar.value = this.fog.far;
      w.uDeep.value.setRGB(...state.waterColor);
      w.uShallow.value.setRGB(...state.waterColor).offsetHSL(0, 0, 0.06);
    }

    // Environment map: refresh when the sky meaningfully changes.
    this.envTimer -= 1 / 60;
    if (this.envDirty || (transitioning && this.envTimer <= 0)) {
      this.refreshEnvironmentMap();
      this.envTimer = 3;
      this.envDirty = false;
    }
  }

  private refreshEnvironmentMap(): void {
    const src = this.sky.uniforms;
    const dst = this.envSky.uniforms;
    dst.uZenith.value.copy(src.uZenith.value);
    dst.uHorizon.value.copy(src.uHorizon.value);
    dst.uGround.value.copy(src.uGround.value);
    dst.uSunColor.value.copy(src.uSunColor.value).multiplyScalar(0.6);
    dst.uSunDir.value.copy(src.uSunDir.value);
    dst.uSunDisc.value = src.uSunDisc.value * 0.3;
    dst.uStars.value = 0;
    const target = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    this.envTarget?.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = this.env.kind === 'indoor' ? 0.35 : 0.75;
  }

  /** Keeps the shadow frustum centred on the car, snapped to texels to avoid shimmer. */
  followCar(car: THREE.Vector3): void {
    const d = this.sunDir;
    const half = this.sun.shadow.camera.right;
    const texel = (2 * half) / this.sun.shadow.mapSize.x;
    const right = new THREE.Vector3(0, 1, 0).cross(d);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    const cx = Math.round(car.dot(right) / texel) * texel;
    const cy = Math.round(car.dot(up) / texel) * texel;
    const cz = car.dot(d);
    const center = right.multiplyScalar(cx).add(up.multiplyScalar(cy)).add(d.clone().multiplyScalar(cz));
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(d, 180);
    this.sun.target.updateMatrixWorld();
  }

  followCamera(camera: THREE.Camera, time: number, state: AtmosphereState): void {
    this.sky.follow(camera);
    this.water?.follow(camera);
    this.precipitation.update(time, camera, state.rain, state.snow, state.wind, this.brightness);
  }

  /** Moves the pooled indoor point lights along the fixture grid near the car. */
  updateIndoorLights(road: RoadGenerator, carS: number, level: number): void {
    const ind = this.env.indoor;
    if (!ind || this.indoorLights.length === 0) return;
    const B = ind.baySpacing;
    const n = this.indoorLights.length;
    const k0 = Math.floor((carS - B * (n / 2 - 1)) / B);
    for (let j = 0; j < n; j++) {
      const s = (k0 + j + 0.5) * B;
      const light = this.indoorLights[j];
      const p = road.pointAt(s, this.tmpPoint);
      light.position.set(p.x, p.y + ind.ceilingHeight - 0.7, p.z);
      const d = Math.abs(s - (carS + B * 0.5));
      const w = 1 - smoothstep(B * (n / 2 - 0.5), B * (n / 2 + 0.5), d);
      light.intensity = 26 * level * w;
    }
  }

  dispose(): void {
    this.sky.dispose();
    this.envSky.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.water?.dispose();
    this.precipitation.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
    this.sun.dispose();
    this.sun.removeFromParent();
    this.sun.target.removeFromParent();
    this.hemi.dispose();
    this.hemi.removeFromParent();
    for (const l of this.indoorLights) {
      l.dispose();
      l.removeFromParent();
    }
  }
}
