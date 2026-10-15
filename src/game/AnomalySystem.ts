import * as THREE from 'three';
import type { Settings } from '../config/settings';
import { clamp } from '../core/math';
import type { AnomalyKind, EnvironmentPreset } from '../world/environments/types';
import type { AtmosphereOverlay } from '../world/EnvironmentManager';
import type { AudioManager, HorrorSound } from './AudioManager';
import type { WorldManager } from './WorldManager';

/**
 * Optional liminal events: rare, quiet, never a jump-scare. Each event is a
 * small state machine; at most one runs at a time, separated by long random
 * gaps. With the liminal setting off, nothing here ever happens.
 */

interface ActiveEvent {
  kind: AnomalyKind;
  t: number;
  duration: number;
  data: Record<string, number>;
}

const VISUAL = new Set<AnomalyKind>(['silhouette', 'distant-car', 'flicker']);
const AUDIO = new Set<AnomalyKind>(['distant-sound']);
const ATMOS = new Set<AnomalyKind>(['fog-shift', 'silence', 'empty-stretch']);

export class AnomalySystem {
  readonly overlay: AtmosphereOverlay = { fogScale: 1, lights: 1 };
  private readonly group = new THREE.Group();
  private readonly figure: THREE.Group;
  private readonly figureMat: THREE.MeshBasicMaterial;
  private readonly carLights: THREE.Group;
  private readonly tailMat: THREE.MeshBasicMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private timer: number;
  private active: ActiveEvent | null = null;
  private flickerTarget: ReturnType<WorldManager['findLightNear']> = null;
  private readonly tmpPoint = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    private readonly env: EnvironmentPreset,
    private settings: Settings['atmosphere'],
    private readonly audio: AudioManager,
    private readonly world: WorldManager,
  ) {
    this.group.name = 'anomalies';
    parent.add(this.group);
    // A tall, thin, featureless figure. Fog makes it a silhouette at distance.
    this.figureMat = new THREE.MeshBasicMaterial({ color: '#0b0c0e', transparent: true, opacity: 1, fog: true });
    const body = this.geo(new THREE.CylinderGeometry(0.2, 0.26, 1.75, 8).translate(0, 0.875, 0));
    const head = this.geo(new THREE.SphereGeometry(0.16, 10, 8).translate(0, 1.95, 0));
    this.figure = new THREE.Group();
    this.figure.add(new THREE.Mesh(body, this.figureMat), new THREE.Mesh(head, this.figureMat));
    this.figure.visible = false;
    this.group.add(this.figure);

    // Distant tail lights: two dim red points that keep their distance.
    this.tailMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0, fog: false });
    const lamp = this.geo(new THREE.SphereGeometry(0.12, 8, 6));
    this.carLights = new THREE.Group();
    for (const x of [-0.65, 0.65]) {
      const m = new THREE.Mesh(lamp, this.tailMat);
      m.position.set(x, 0.85, 0);
      this.carLights.add(m);
    }
    this.carLights.visible = false;
    this.group.add(this.carLights);
    this.timer = this.nextGap() + 40;
  }

  private geo(g: THREE.BufferGeometry): THREE.BufferGeometry {
    this.geometries.push(g);
    return g;
  }

  setSettings(s: Settings['atmosphere']): void {
    this.settings = s;
    if (s.liminal === 'off') this.cancel();
  }

  private nextGap(): number {
    return this.settings.liminal === 'uncanny' ? 50 + Math.random() * 70 : 120 + Math.random() * 150;
  }

  private allowed(kind: AnomalyKind): boolean {
    if (VISUAL.has(kind)) return this.settings.visualAnomalies;
    if (AUDIO.has(kind)) return this.settings.horrorAudio;
    if (ATMOS.has(kind)) return this.settings.atmosphericEffects || (kind === 'silence' && this.settings.horrorAudio);
    return false;
  }

  /** Force-starts an event (used by tests / debugging). */
  trigger(kind: AnomalyKind, carS: number): boolean {
    this.cancel();
    return this.start(kind, carS);
  }

  private start(kind: AnomalyKind, carS: number): boolean {
    const road = this.world.road;
    const edge = this.env.road.halfWidth + this.env.road.shoulderWidth;
    switch (kind) {
      case 'silhouette': {
        const s = carS + 150 + Math.random() * 80;
        if (s > road.endS) return false;
        const p = road.pointAt(s);
        const side = Math.random() < 0.5 ? -1 : 1;
        const lateral =
          this.env.kind === 'indoor'
            ? side * Math.min(this.env.indoor!.driveHalfWidth + 1.5, this.env.indoor!.floorHalfWidth - 1.5)
            : side * (edge + 5 + Math.random() * 12);
        const x = p.x - Math.cos(p.heading) * lateral;
        const z = p.z + Math.sin(p.heading) * lateral;
        const g = this.world.ground(x, z, this.world.createGroundSample());
        if (g.surface === 'water') return false;
        this.figure.position.set(x, g.height - 0.05, z);
        this.figure.rotation.y = p.heading + Math.PI + (Math.random() - 0.5) * 0.6;
        this.figure.visible = true;
        this.figureMat.opacity = 1;
        this.active = { kind, t: 0, duration: 40, data: { s } };
        return true;
      }
      case 'distant-car': {
        this.carLights.visible = true;
        this.tailMat.opacity = 0;
        this.active = { kind, t: 0, duration: 45 + Math.random() * 30, data: { gap: 210 } };
        return true;
      }
      case 'flicker': {
        this.flickerTarget = this.world.findLightNear(carS, 30);
        if (!this.flickerTarget && this.env.kind !== 'indoor') return false;
        this.active = { kind, t: 0, duration: 1.6, data: {} };
        return true;
      }
      case 'distant-sound': {
        const kinds: HorrorSound[] =
          this.env.kind === 'indoor' ? ['knock', 'metal', 'hum-drop', 'tone'] : ['knock', 'tone', 'horn', 'metal'];
        this.audio.playHorror(kinds[Math.floor(Math.random() * kinds.length)], Math.random() * 1.6 - 0.8);
        this.active = { kind, t: 0, duration: 8, data: {} };
        return true;
      }
      case 'silence':
      case 'empty-stretch':
        this.audio.duckAmbience(kind === 'silence' ? 14 : 22);
        this.active = { kind, t: 0, duration: kind === 'silence' ? 24 : 32, data: {} };
        return true;
      case 'fog-shift':
        this.active = { kind, t: 0, duration: 30, data: {} };
        return true;
    }
    return false;
  }

  private cancel(): void {
    this.figure.visible = false;
    this.carLights.visible = false;
    if (this.flickerTarget) this.flickerTarget.pool.setTint(this.flickerTarget.handle, [1, 1, 1]);
    this.flickerTarget = null;
    this.overlay.fogScale = 1;
    this.overlay.lights = 1;
    this.active = null;
  }

  update(dt: number, carS: number, carPos: THREE.Vector3, speed: number): void {
    if (this.settings.liminal === 'off') return;
    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.nextGap();
        const options = this.env.anomalies.filter((k) => this.allowed(k));
        const visualOk = speed > 3;
        const pool = options.filter((k) => visualOk || !VISUAL.has(k));
        if (pool.length) this.start(pool[Math.floor(Math.random() * pool.length)], carS);
      }
      return;
    }
    const e = this.active;
    e.t += dt;
    switch (e.kind) {
      case 'silhouette': {
        const d = this.figure.position.distanceTo(carPos);
        // It is gone once you get close — or if you stop looking for too long.
        if (d < 75 || e.t > e.duration || e.data.s < carS) {
          this.figureMat.opacity -= dt * 6;
          if (this.figureMat.opacity <= 0) this.cancel();
        }
        break;
      }
      case 'distant-car': {
        const fadeIn = clamp(e.t / 6, 0, 1);
        const fadeOut = clamp((e.duration - e.t) / 8, 0, 1);
        if (e.t > e.duration - 8) e.data.gap += dt * 25;
        const s = carS + e.data.gap;
        if (s >= this.world.road.endS) {
          this.cancel();
          break;
        }
        const p = this.world.road.pointAt(s);
        const lane = this.env.road.halfWidth * 0.5;
        this.tmpPoint.set(p.x - Math.cos(p.heading) * lane, p.y, p.z + Math.sin(p.heading) * lane);
        this.carLights.position.copy(this.tmpPoint);
        this.carLights.rotation.y = p.heading;
        this.tailMat.opacity = 0.9 * fadeIn * fadeOut;
        if (e.t >= e.duration) this.cancel();
        break;
      }
      case 'flicker': {
        const pattern = [0.0, 0.07, 0.16, 0.24, 0.5, 0.58];
        let on = true;
        for (const p of pattern) if (e.t > p) on = !on;
        const v = on ? 1 : 0.05;
        if (this.flickerTarget) this.flickerTarget.pool.setTint(this.flickerTarget.handle, [v, v, v]);
        if (this.env.kind === 'indoor') this.overlay.lights = on ? 1 : 0.35;
        if (e.t > e.duration) this.cancel();
        break;
      }
      case 'fog-shift': {
        const k = e.t < 8 ? e.t / 8 : e.t < 20 ? 1 : 1 - (e.t - 20) / 10;
        this.overlay.fogScale = 1 - 0.5 * clamp(k, 0, 1);
        if (e.t > e.duration) this.cancel();
        break;
      }
      default:
        if (e.t > e.duration) this.cancel();
    }
  }

  get activeKind(): AnomalyKind | null {
    return this.active?.kind ?? null;
  }

  dispose(): void {
    this.cancel();
    for (const g of this.geometries) g.dispose();
    this.figureMat.dispose();
    this.tailMat.dispose();
    this.group.removeFromParent();
  }
}
