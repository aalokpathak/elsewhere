import * as THREE from 'three';
import { canTransition, type DriveSelection, type EngineEvents, type GamePhase, type HudSnapshot } from '../app/game-state';
import { getEnvironment, getVariant, type EnvironmentPreset } from '../config/environments';
import { getGraphicsProfile, type GraphicsProfile } from '../config/graphics';
import type { Settings } from '../config/settings';
import { clamp } from '../core/math';
import { randomSeed } from '../core/random';
import type { AtmosphereVariant } from '../world/environments/types';
import { EnvironmentManager } from '../world/EnvironmentManager';
import { createRoadQuery } from '../world/RoadGenerator';
import { WeatherSystem } from '../world/WeatherSystem';
import { AnomalySystem } from './AnomalySystem';
import { AudioManager } from './AudioManager';
import { Autopilot } from './Autopilot';
import { CameraController, type CameraMode } from './CameraController';
import { CarModel } from './CarModel';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { PerformanceManager } from './PerformanceManager';
import { DEFAULT_VEHICLE, VehicleController, type VehicleInput } from './VehicleController';
import { WorldManager, type GroundSample } from './WorldManager';
import { disposeObjectTree } from './ResourceManager';

type Listener<K extends keyof EngineEvents> = (payload: EngineEvents[K]) => void;

export class WebGLUnavailableError extends Error {}

/** Everything that belongs to one generated world; replaced wholesale on reload. */
interface Session {
  env: EnvironmentPreset;
  variant: AtmosphereVariant;
  seed: number;
  world: WorldManager;
  atmosphere: EnvironmentManager;
  weather: WeatherSystem;
  anomalies: AnomalySystem;
  autopilot: Autopilot;
}

const START_S = 320;

/**
 * Owns the renderer, scene, car and the current world session, and runs the
 * single game loop. React talks to it only through these public methods and
 * the event emitter; nothing here re-renders React per frame.
 */
export class GameEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly audio = new AudioManager();
  readonly input: InputManager;
  readonly perf = new PerformanceManager();
  private readonly cameraCtl: CameraController;
  private readonly car: CarModel;
  private readonly vehicle = new VehicleController({ ...DEFAULT_VEHICLE });
  private readonly loop: GameLoop;
  private readonly listeners = new Map<keyof EngineEvents, Set<Listener<keyof EngineEvents>>>();
  private session: Session | null = null;
  private profile: GraphicsProfile;
  private settings: Settings;
  private phase: GamePhase = 'boot';
  private loadToken = 0;
  private menuLoadingEnv: string | null = null;
  private menuPendingVariant: string | null = null;
  private readonly vin: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private readonly ground: GroundSample;
  private readonly q = createRoadQuery();
  private carS = START_S;
  private elapsed = 0;
  private hudTimer = 0;
  private perfTimer = 0;
  private hint: string | null = null;
  private recoverTimer = -1;
  private waterTime = 0;
  private scrapeCooldown = 0;
  private driftTimer = 0;
  private needsRender = true;
  private disposed = false;
  private readonly carPos = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: Settings,
  ) {
    this.settings = settings;
    this.profile = getGraphicsProfile(settings.graphics.preset);
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (err) {
      throw new WebGLUnavailableError(err instanceof Error ? err.message : 'WebGL unavailable');
    }
    if (!this.renderer.getContext()) throw new WebGLUnavailableError('WebGL context could not be created');
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyPixelRatio();

    this.cameraCtl = new CameraController(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.car = new CarModel(settings.vehicle.color);
    this.scene.add(this.car.root);
    this.input = new InputManager(canvas);
    this.input.attach();
    this.ground = {
      height: 0,
      surface: 'asphalt',
      query: createRoadQuery(),
    };
    this.loop = new GameLoop((dt, t) => this.frame(dt, t));

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onResize();
    this.applySettings(settings);
  }

  // ---------------------------------------------------------------------------
  // Events

  on<K extends keyof EngineEvents>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<keyof EngineEvents>);
    return () => set!.delete(fn as Listener<keyof EngineEvents>);
  }

  private emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  private setPhase(next: GamePhase): void {
    if (next === this.phase) return;
    if (!canTransition(this.phase, next)) {
      console.warn(`[Elsewhere] ignored phase change ${this.phase} → ${next}`);
      return;
    }
    this.phase = next;
    this.input.driving = next === 'driving';
    if (next !== 'driving') this.input.clear();
    this.audio.setVehicleActive(next === 'driving');
    this.needsRender = true;
    this.emit('phase', next);
  }

  get currentPhase(): GamePhase {
    return this.phase;
  }

  get currentSelection(): DriveSelection | null {
    if (!this.session) return null;
    return { environmentId: this.session.env.id, variantId: this.session.weather.targetId, seed: this.session.seed };
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle

  private disposeSession(): void {
    if (!this.session) return;
    this.session.anomalies.dispose();
    this.session.atmosphere.dispose();
    this.session.world.dispose();
    this.session = null;
  }

  private async loadSession(sel: DriveSelection, startS = START_S, label = 'Generating the road ahead'): Promise<boolean> {
    const token = ++this.loadToken;
    this.emit('loading', { progress: 0, label });
    // Let the UI paint the loading state before heavy work begins.
    await new Promise((r) => setTimeout(r, 30));
    if (token !== this.loadToken || this.disposed) return false;

    this.disposeSession();
    const env = getEnvironment(sel.environmentId);
    const variant = getVariant(env, sel.variantId);
    const seed = sel.seed ?? randomSeed();
    const uncanny = this.settings.atmosphere.liminal !== 'off' && this.settings.atmosphere.visualAnomalies;
    const world = new WorldManager(this.scene, env, this.profile, seed, uncanny);
    const atmosphere = new EnvironmentManager(this.renderer, this.scene, env, this.profile);
    const weather = new WeatherSystem(variant);
    const anomalies = new AnomalySystem(this.scene, env, this.settings.atmosphere, this.audio, world);
    const autopilot = new Autopilot(world.road, env.kind === 'indoor' && env.indoor?.type === 'corridor' ? 0 : env.road.halfWidth * 0.5, Math.min(env.maxSpeedKmh * 0.5, 70) / 3.6);
    const session: Session = { env, variant, seed, world, atmosphere, weather, anomalies, autopilot };
    this.session = session;

    await world.initialize(startS, (f) => {
      if (token === this.loadToken) this.emit('loading', { progress: f, label });
    });
    if (token !== this.loadToken || this.disposed || this.session !== session) return false;

    this.placeCarOnRoad(startS);
    this.applyVehicleParams();
    this.audio.setEnvironment(env.audio);
    this.cameraCtl.reset();
    this.perf.reset();
    this.driftTimer = 0;
    // Warm up: one frame of atmosphere so the first render is correct.
    this.updateAtmosphere(0, 0);
    this.renderer.compile(this.scene, this.cameraCtl.camera);
    this.emit('variant', variant.id);
    return true;
  }

  private placeCarOnRoad(s: number, keepSpeed = false): void {
    const session = this.session!;
    const road = session.world.road;
    s = clamp(s, road.startS + 20, road.endS - 50);
    const p = road.pointAt(s);
    const lane = session.env.kind === 'indoor' && session.env.indoor?.type === 'corridor' ? 0 : session.env.road.halfWidth * 0.5;
    const x = p.x - Math.cos(p.heading) * lane;
    const z = p.z + Math.sin(p.heading) * lane;
    const speed = this.vehicle.state.speed;
    this.vehicle.reset(x, p.y, z, p.heading);
    if (keepSpeed) this.vehicle.state.speed = Math.max(0, speed);
    this.carS = s;
    this.waterTime = 0;
    this.syncCarModel(0);
    this.cameraCtl.reset();
  }

  private applyVehicleParams(): void {
    const env = this.session?.env;
    const cap = env ? env.maxSpeedKmh : 140;
    this.vehicle.params = {
      ...DEFAULT_VEHICLE,
      maxSpeed: Math.min(this.settings.controls.maxSpeedKmh, cap) / 3.6,
      steerSensitivity: this.settings.controls.steeringSensitivity,
    };
  }

  /** Main menu: a live, autopiloted drive through the selected environment. */
  async showMenu(environmentId: DriveSelection['environmentId'], variantId: string | null): Promise<void> {
    const s = this.session;
    if (s && s.env.id === environmentId) {
      if (variantId && s.weather.targetId !== variantId) this.setVariant(variantId, 4);
      this.cameraCtl.setMode('cinematic');
      this.setPhase('menu');
      this.loop.start();
      return;
    }
    // A preview of this place is already being generated: let it finish.
    if (this.phase === 'loading' && this.menuLoadingEnv === environmentId) {
      this.menuPendingVariant = variantId;
      return;
    }
    this.menuPendingVariant = null;
    this.setPhase('loading');
    this.menuLoadingEnv = environmentId;
    const ok = await this.loadSession({ environmentId, variantId }, START_S, 'Finding somewhere quiet');
    this.menuLoadingEnv = null;
    if (!ok) return;
    if (this.menuPendingVariant && this.menuPendingVariant !== variantId) this.setVariant(this.menuPendingVariant, 0.1);
    this.menuPendingVariant = null;
    this.cameraCtl.setMode('cinematic');
    this.setPhase('menu');
    this.loop.start();
  }

  /** Starts (or continues from the menu preview into) a drive. */
  async startDrive(sel: DriveSelection): Promise<void> {
    void this.audio.start();
    const s = this.session;
    const reuse = s && s.env.id === sel.environmentId && (sel.seed === undefined || sel.seed === s.seed);
    if (reuse && (this.phase === 'menu' || this.phase === 'paused')) {
      if (sel.variantId && s.weather.targetId !== sel.variantId) this.setVariant(sel.variantId, 3);
      this.elapsed = 0;
      this.vehicle.state.odometer = 0;
      this.cameraCtl.setMode(this.settings.last.camera);
      this.car.setCockpitMode(false);
      this.setPhase('driving');
      this.loop.start();
      return;
    }
    this.setPhase('loading');
    const ok = await this.loadSession(sel);
    if (!ok) return;
    this.elapsed = 0;
    this.vehicle.state.odometer = 0;
    this.cameraCtl.setMode(this.settings.last.camera);
    this.setPhase('driving');
    this.loop.start();
  }

  async restart(newRoad: boolean): Promise<void> {
    if (!this.session) return;
    const sel: DriveSelection = {
      environmentId: this.session.env.id,
      variantId: this.session.weather.targetId,
      seed: newRoad ? randomSeed() : this.session.seed,
    };
    this.setPhase('loading');
    const ok = await this.loadSession(sel, START_S, newRoad ? 'Finding a different road' : 'Back to the beginning');
    if (!ok) return;
    this.elapsed = 0;
    this.vehicle.state.odometer = 0;
    this.setPhase('driving');
    this.loop.start();
  }

  async changeEnvironment(environmentId: DriveSelection['environmentId'], variantId: string | null): Promise<void> {
    this.setPhase('loading');
    const ok = await this.loadSession({ environmentId, variantId }, START_S, 'Taking the long way round');
    if (!ok) return;
    this.elapsed = 0;
    this.vehicle.state.odometer = 0;
    this.setPhase('driving');
    this.loop.start();
  }

  /** Rebuilds the current world in place (e.g. after a graphics preset change). */
  private async rebuildInPlace(): Promise<void> {
    if (!this.session) return;
    const prevPhase = this.phase;
    const sel: DriveSelection = { environmentId: this.session.env.id, variantId: this.session.weather.targetId, seed: this.session.seed };
    const s = this.carS;
    this.setPhase('loading');
    const ok = await this.loadSession(sel, s, 'Rebuilding the world');
    if (!ok) return;
    this.setPhase(prevPhase === 'menu' ? 'menu' : prevPhase === 'paused' ? 'driving' : 'driving');
    if (prevPhase === 'paused') this.pause();
  }

  pause(): void {
    if (this.phase !== 'driving') return;
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    void this.audio.start();
    this.setPhase('driving');
  }

  returnToMenu(): void {
    if (!this.session) return;
    this.cameraCtl.setMode('cinematic');
    this.car.setCockpitMode(false);
    this.setPhase('menu');
  }

  setVariant(variantId: string, seconds = 20): void {
    const s = this.session;
    if (!s) return;
    const v = getVariant(s.env, variantId);
    s.weather.setTarget(v, seconds);
    s.atmosphere.markEnvironmentDirty();
    this.emit('variant', v.id);
  }

  setCameraMode(mode: Exclude<CameraMode, 'cinematic'>): void {
    this.cameraCtl.setMode(mode);
    this.emit('camera', mode);
  }

  toggleCamera(): CameraMode {
    const next = this.cameraCtl.mode === 'cockpit' ? 'chase' : 'cockpit';
    this.setCameraMode(next);
    return next;
  }

  get cameraMode(): CameraMode {
    return this.cameraCtl.mode;
  }

  recover(): void {
    if (!this.session || this.recoverTimer >= 0) return;
    this.recoverTimer = 0;
    this.emit('fade', true);
  }

  applySettings(settings: Settings): void {
    const prevPreset = this.settings.graphics.preset;
    this.settings = settings;
    this.audio.setVolumes(settings.audio);
    this.car.setColor(settings.vehicle.color);
    this.perf.adaptive = settings.graphics.adaptiveResolution;
    if (!settings.graphics.adaptiveResolution) this.perf.dynamicScale = 1;
    this.applyPixelRatio();
    this.applyVehicleParams();
    this.session?.anomalies.setSettings(settings.atmosphere);
    if (settings.graphics.preset !== prevPreset) {
      this.profile = getGraphicsProfile(settings.graphics.preset);
      if (this.session && (this.phase === 'driving' || this.phase === 'paused' || this.phase === 'menu')) void this.rebuildInPlace();
    }
    this.needsRender = true;
  }

  // ---------------------------------------------------------------------------
  // Frame

  private frame(dt: number, time: number): void {
    if (this.disposed) return;
    const session = this.session;
    if (!session) return;
    if (this.phase === 'paused' || this.phase === 'loading') {
      if (this.needsRender) {
        this.render();
        this.needsRender = false;
      }
      return;
    }
    const driving = this.phase === 'driving';
    if (driving) this.elapsed += dt;

    // Discrete actions.
    for (const edge of this.input.consumeEdges()) {
      if (!driving) continue;
      if (edge === 'camera') this.toggleCamera();
      else if (edge === 'hud') this.emit('toggleHud', undefined);
      else if (edge === 'recover') this.recover();
      else if (edge === 'cruise') this.vehicle.toggleCruise();
    }
    const [lx, ly] = this.input.consumeLook();
    this.cameraCtl.addLook(lx, ly, this.settings.controls.cameraSensitivity);

    // Vehicle.
    const world = session.world;
    if (this.recoverTimer >= 0) {
      this.vin.throttle = 0;
      this.vin.brake = 1;
      this.vin.steer = 0;
      this.vin.handbrake = false;
    } else if (driving && !this.debugAutopilot) {
      this.input.read(this.vin);
    } else {
      session.autopilot.drive(this.vehicle.state, this.vehicle.params, this.carS, this.vin);
    }
    this.vehicle.update(dt, this.vin, (x, z) => world.ground(x, z, this.ground));
    const st = this.vehicle.state;
    world.road.query(st.x, st.z, this.q);
    this.carS = this.q.s;
    this.constrain(session, dt);
    this.updateRecovery(session, dt, driving);
    this.syncCarModel(dt);

    // World streaming.
    this.carPos.set(st.x, st.y, st.z);
    const fx = Math.sin(st.heading);
    const fz = Math.cos(st.heading);
    world.update(st.x, st.z, fx, fz, this.carS, dt, time);

    // Atmosphere & events.
    this.updateTimeDrift(session, dt);
    session.weather.update(dt);
    session.anomalies.update(dt, this.carS, this.carPos, st.speed);
    this.updateAtmosphere(dt, time);

    // Camera.
    const ind = session.env.indoor;
    this.cameraCtl.update(
      dt,
      { x: st.x, y: st.y, z: st.z, heading: st.heading, speed: st.speed, steer: st.steer, body: this.car.body },
      {
        reduceMotion: this.settings.comfort.reduceMotion,
        fov: this.settings.controls.fov,
        sensitivity: this.settings.controls.cameraSensitivity,
        groundAt: (x, z) => world.ground(x, z, this.ground).height,
        ceilingY: ind ? this.q.y + ind.ceilingHeight : null,
      },
      this.input.looking,
    );
    this.car.setCockpitMode(this.cameraCtl.cockpitVisible);
    session.atmosphere.followCamera(this.cameraCtl.camera, time, session.weather.current);

    this.audio.update(dt, {
      speed: st.speed,
      throttle: st.throttle,
      surface: st.surface,
      wind: session.weather.current.wind,
      rain: session.weather.current.rain,
      braking: st.braking,
      active: driving,
    });

    this.render();
    if (this.perf.frame(dt)) this.applyPixelRatio();
    this.emitHud(dt, driving);
  }

  /** Indoor walls; far-off-road / water handling outdoors. */
  private constrain(session: Session, dt: number): void {
    const st = this.vehicle.state;
    const ind = session.env.indoor;
    this.scrapeCooldown -= dt;
    if (ind) {
      const limit = ind.driveHalfWidth;
      if (Math.abs(this.q.lateral) > limit) {
        const over = Math.abs(this.q.lateral) - limit;
        const sign = Math.sign(this.q.lateral);
        st.x -= -Math.cos(this.q.heading) * sign * over;
        st.z -= Math.sin(this.q.heading) * sign * over;
        // Glance off the wall: align with the road and bleed speed.
        const rel = Math.atan2(Math.sin(st.heading - this.q.heading), Math.cos(st.heading - this.q.heading));
        st.heading -= rel * 0.35;
        st.speed *= 0.9;
        st.yawRate *= 0.5;
        if (this.scrapeCooldown <= 0 && Math.abs(st.speed) > 2) {
          this.audio.playOneShot('scrape');
          this.scrapeCooldown = 0.4;
        }
      }
    }
  }

  private updateRecovery(session: Session, dt: number, driving: boolean): void {
    const st = this.vehicle.state;
    this.hint = null;
    const road = session.world.road;
    if (this.recoverTimer >= 0) {
      const before = this.recoverTimer;
      this.recoverTimer += dt;
      if (before < 0.35 && this.recoverTimer >= 0.35) {
        this.placeCarOnRoad(Math.max(this.carS, road.startS + 200));
      }
      if (this.recoverTimer > 0.7) {
        this.recoverTimer = -1;
        this.emit('fade', false);
      }
      return;
    }
    // The world behind is trimmed; reversing too far gently resets you.
    if (this.carS < road.startS + 100) {
      this.hint = 'The road behind has faded.';
      if (this.carS < road.startS + 40) this.recover();
      return;
    }
    if (st.surface === 'water') {
      this.waterTime += dt;
      if (this.waterTime > 0.05 && this.waterTime - dt <= 0.05) this.audio.playOneShot('splash');
      if (this.waterTime > 1.3) this.recover();
      return;
    }
    this.waterTime = 0;
    if (!driving) {
      if (this.q.dist > 25 || st.stuckTime > 4) this.recover();
      return;
    }
    if (session.env.kind === 'outdoor') {
      if (this.q.dist > 220) this.recover();
      else if (this.q.dist > 45) this.hint = 'Press R to return to the road';
    }
    if (st.stuckTime > 3) this.hint = 'Stuck? Press R to recover';
  }

  private syncCarModel(dt: number): void {
    const st = this.vehicle.state;
    const root = this.car.root;
    root.position.set(st.x, st.y, st.z);
    root.rotation.set(st.groundPitch, st.heading, st.groundRoll, 'YXZ');
    const atm = this.session?.weather.current;
    const indoor = this.session?.env.kind === 'indoor';
    const lightsOn = indoor || (atm ? atm.headlights > 0.5 : false);
    this.car.update(dt, {
      steerAngle: st.steer,
      wheelSpin: st.wheelSpin,
      braking: st.braking || this.vin.brake > 0.1,
      lightsOn,
      headlights: (atm?.headlights ?? 0) * (indoor ? 90 : 170),
      speedKmh: st.speed * 3.6,
      units: this.settings.controls.units,
      darkness: 1 - (this.session?.atmosphere.brightness ?? 1),
      pitch: st.bodyPitch,
      roll: st.bodyRoll,
      bounce: st.bounce,
    });
  }

  private updateTimeDrift(session: Session, dt: number): void {
    if (!this.settings.atmosphere.timeDrift || session.env.variants.length < 2 || this.phase !== 'driving') return;
    this.driftTimer += dt;
    if (this.driftTimer > 240) {
      this.driftTimer = 0;
      const vs = session.env.variants;
      const i = vs.findIndex((v) => v.id === session.weather.targetId);
      this.setVariant(vs[(i + 1) % vs.length].id, 45);
    }
  }

  private readonly horizon = new THREE.Color();
  private readonly sunColor = new THREE.Color();

  private updateAtmosphere(_dt: number, time: number): void {
    const s = this.session!;
    const state = s.weather.current;
    const overlay = s.anomalies.overlay;
    s.atmosphere.apply(state, overlay, s.world.viewDistance, time, s.weather.transitioning);
    this.horizon.setRGB(...state.skyHorizon);
    this.sunColor.setRGB(...state.sunColor);
    const lights = state.lights * overlay.lights;
    s.world.applyAtmosphere(state, lights, s.atmosphere.brightness, this.horizon, this.sunColor);
    s.atmosphere.updateIndoorLights(s.world.road, this.carS, lights);
    s.atmosphere.followCar(this.carPos.set(this.vehicle.state.x, this.vehicle.state.y, this.vehicle.state.z));
  }

  private render(): void {
    this.renderer.render(this.scene, this.cameraCtl.camera);
  }

  private emitHud(dt: number, driving: boolean): void {
    const s = this.session!;
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      const v = getVariant(s.env, s.weather.targetId);
      const snap: HudSnapshot = {
        speedKmh: Math.abs(this.vehicle.state.speed * 3.6),
        camera: this.cameraCtl.mode,
        cruise: this.vehicle.state.cruise !== null,
        elapsed: this.elapsed,
        odometerKm: this.vehicle.state.odometer / 1000,
        environment: s.env.name,
        variant: v.name,
        seed: s.seed,
        hint: driving ? this.hint : null,
      };
      this.emit('hud', snap);
    }
    if (this.settings.graphics.showPerformance) {
      this.perfTimer -= dt;
      if (this.perfTimer <= 0) {
        this.perfTimer = 0.5;
        const info = this.renderer.info;
        const ws = s.world.stats;
        this.emit('perf', {
          fps: this.perf.fps,
          frameMs: this.perf.frameMs,
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          chunks: ws.chunks,
          pendingChunks: ws.pendingChunks,
          segments: ws.segments,
          instances: ws.instances,
          pixelRatio: this.renderer.getPixelRatio(),
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Browser integration

  private applyPixelRatio(): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const ratio = Math.min(dpr, this.profile.pixelRatioCap) * this.settings.graphics.resolutionScale * this.perf.dynamicScale;
    this.renderer.setPixelRatio(clamp(ratio, 0.35, 2.5));
    this.needsRender = true;
  }

  private onResize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cameraCtl.resize(w / Math.max(1, h));
    this.needsRender = true;
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.loop.stop();
      void this.audio.suspend();
      if (this.phase === 'driving') this.pause();
    } else {
      this.perf.reset();
      if (this.session && this.phase !== 'error') this.loop.start();
      void this.audio.resume();
    }
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.loop.stop();
    this.setPhase('error');
    this.emit('error', 'The graphics context was lost. Please reload the page to keep driving.');
  };

  /** Starts audio from a user gesture (menus call this on first interaction). */
  unlockAudio(): void {
    void this.audio.start();
  }

  /** Debug helper exposed for automated checks. */
  debugState() {
    const st = this.vehicle.state;
    return {
      phase: this.phase,
      env: this.session?.env.id,
      seed: this.session?.seed,
      carS: this.carS,
      speedKmh: st.speed * 3.6,
      lateral: this.q.lateral,
      surface: st.surface,
      y: st.y,
      world: this.session?.world.stats,
      memory: { ...this.renderer.info.memory },
      loopRunning: this.loop.running,
      anomaly: this.session?.anomalies.activeKind ?? null,
    };
  }

  private debugClock = 0;
  /** Debug: let the autopilot drive during a real drive (automated soak tests). */
  debugAutopilot = false;

  /**
   * Debug helper: advances the simulation synchronously (used by automated
   * browser checks where requestAnimationFrame may be throttled).
   */
  debugAdvance(frames: number, dt = 1 / 60, input?: Partial<VehicleInput>): void {
    for (let i = 0; i < frames; i++) {
      if (input) this.input.setTouch({ throttle: input.throttle ?? 0, brake: input.brake ?? 0, steer: input.steer ?? 0 });
      this.debugClock += dt;
      this.frame(dt, this.debugClock);
    }
    if (input) this.input.setTouch({ throttle: 0, brake: 0, steer: 0 });
  }

  /** Debug helper: fire an anomaly immediately. */
  debugTriggerAnomaly(kind: Parameters<AnomalySystem['trigger']>[0]): boolean {
    return this.session?.anomalies.trigger(kind, this.carS) ?? false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadToken++;
    this.loop.stop();
    this.input.detach();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.disposeSession();
    this.car.dispose();
    disposeObjectTree(this.scene);
    this.audio.dispose();
    this.renderer.dispose();
    this.listeners.clear();
  }
}

