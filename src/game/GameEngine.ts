import * as THREE from 'three';
import { canTransition, type DriveSelection, type EngineEvents, type GamePhase, type HudSnapshot } from '../app/game-state';
import { getEnvironment, getVariant, type EnvironmentPreset } from '../config/environments';
import { getGraphicsProfile, type GraphicsProfile } from '../config/graphics';
import type { Settings } from '../config/settings';
import { clamp } from '../core/math';
import { randomSeed } from '../core/random';
import { createCollisionResult } from '../world/Colliders';
import type { AtmosphereVariant } from '../world/environments/types';
import { EnvironmentManager } from '../world/EnvironmentManager';
import { createRoadQuery } from '../world/RoadGenerator';
import { hexToLinear } from '../world/TerrainGenerator';
import { WeatherSystem } from '../world/WeatherSystem';
import { AnomalySystem } from './AnomalySystem';
import { AudioManager } from './AudioManager';
import { Autopilot } from './Autopilot';
import { CameraController, DRIVE_CAMERAS, type CameraMode, type DriveCamera } from './CameraController';
import { CarModel } from './CarModel';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { PerformanceManager } from './PerformanceManager';
import { PostFX } from './PostFX';
import { disposeObjectTree } from './ResourceManager';
import { TrailParticles } from './TrailParticles';
import { DEFAULT_VEHICLE, VehicleController, type VehicleInput } from './VehicleController';
import { WorldManager, type GroundSample } from './WorldManager';

type Listener<K extends keyof EngineEvents> = (payload: EngineEvents[K]) => void;

export class WebGLUnavailableError extends Error {}

export type HeadlightMode = 'auto' | 'on' | 'off';

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
  /** Relaxed speed the autopilot starts from (m/s). */
  baseCruise: number;
  /** False until the world has finished generating and the car is placed. */
  ready: boolean;
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
  private postfx: PostFX | null = null;
  private particles: TrailParticles;
  private resizeObserver: ResizeObserver | null = null;
  private readonly vin: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private readonly playerIn: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private readonly ground: GroundSample;
  private readonly q = createRoadQuery();
  private readonly collision = createCollisionResult();
  private time = 0;
  private carS = START_S;
  private elapsed = 0;
  private hudTimer = 0;
  private perfTimer = 0;
  private hint: string | null = null;
  private toast: string | null = null;
  private toastTimer = 0;
  private recoverTimer = -1;
  private waterTime = 0;
  private scrapeCooldown = 0;
  private driftTimer = 0;
  private emitAcc = 0;
  private needsRender = true;
  private disposed = false;
  private live = false;
  private autoDrive = false;
  /** True while the car is still self-driving from the menu preview, waiting for the player's first input. */
  private handover = false;
  private headlightMode: HeadlightMode = 'auto';
  private photo = false;
  private photoReturn: CameraMode = 'chase';
  private readonly carPos = new THREE.Vector3();
  private readonly shadowCenter = new THREE.Vector3();
  private readonly horizon = new THREE.Color();
  private readonly sunColor = new THREE.Color();
  private dustColor: [number, number, number] = [0.5, 0.45, 0.35];

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

    this.cameraCtl = new CameraController(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.car = new CarModel(settings.vehicle.color);
    this.scene.add(this.car.root);
    this.particles = new TrailParticles(0);
    this.input = new InputManager(canvas);
    this.input.attach();
    this.ground = { height: 0, surface: 'asphalt', query: createRoadQuery() };
    this.loop = new GameLoop((dt) => this.frame(dt));

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    // The canvas can get its real size after construction (background tabs,
    // late layout); observing it directly is more reliable than window resize.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(canvas);
    }
    this.applyPixelRatio();
    this.onResize();
    this.setupPipeline();
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
  // Render pipeline (depends on the graphics profile)

  private setupPipeline(): void {
    this.postfx?.dispose();
    this.postfx = null;
    const ext = this.renderer.extensions;
    const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    if (this.profile.postFx && this.settings.graphics.postFx && hdr) {
      try {
        this.postfx = new PostFX(this.renderer, this.scene, this.cameraCtl.camera, this.profile.msaa);
        this.sizePostFx();
      } catch (err) {
        console.warn('[Elsewhere] post-processing unavailable, rendering directly.', err);
        this.postfx = null;
      }
    }
    this.particles.dispose();
    this.particles = new TrailParticles(this.profile.particles);
    this.scene.add(this.particles.points);
    this.needsRender = true;
  }

  private sizePostFx(): void {
    if (!this.postfx) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.postfx.setSize(Math.max(1, w), Math.max(1, h), this.renderer.getPixelRatio());
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
    if (this.live) {
      this.live = false;
      this.emit('live', false);
    }
    // Let the UI paint the loading state (and fade the old world out) first.
    await new Promise((r) => setTimeout(r, this.session ? 260 : 30));
    if (token !== this.loadToken || this.disposed) return false;

    try {
      this.exitPhotoInternal();
      this.setAutoDrive(false, true);
      this.disposeSession();
      this.particles.clear();
      const env = getEnvironment(sel.environmentId);
      const variant = getVariant(env, sel.variantId);
      const seed = sel.seed ?? randomSeed();
      const uncanny = this.settings.atmosphere.liminal !== 'off' && this.settings.atmosphere.visualAnomalies;
      const world = new WorldManager(this.scene, env, this.profile, seed, uncanny);
      const atmosphere = new EnvironmentManager(this.renderer, this.scene, env, this.profile);
      const weather = new WeatherSystem(variant);
      const anomalies = new AnomalySystem(this.scene, env, this.settings.atmosphere, this.audio, world);
      const lane = env.kind === 'indoor' && env.indoor?.type === 'corridor' ? 0 : env.road.halfWidth * 0.5;
      const baseCruise = Math.min(env.maxSpeedKmh * 0.5, 70) / 3.6;
      const autopilot = new Autopilot(world.road, lane, baseCruise);
      const session: Session = { env, variant, seed, world, atmosphere, weather, anomalies, autopilot, baseCruise, ready: false };
      this.session = session;

      await world.initialize(startS, (f) => {
        if (token === this.loadToken) this.emit('loading', { progress: f, label });
      });
      if (token !== this.loadToken || this.disposed || this.session !== session) return false;

      // Never carry a half-finished recovery fade into a new world.
      if (this.recoverTimer >= 0) {
        this.recoverTimer = -1;
        this.emit('fade', false);
      }
      session.ready = true;
      this.dustColor = hexToLinear(env.terrain.colors.dry);
      this.placeCarOnRoad(startS);
      this.applyVehicleParams();
      this.audio.setEnvironment(env.audio);
      this.cameraCtl.reset();
      this.perf.reset();
      this.driftTimer = 0;
      // Warm up: one frame of atmosphere so the first render is correct.
      this.updateAtmosphere();
      this.renderer.compile(this.scene, this.cameraCtl.camera);
      this.emit('variant', variant.id);
      return true;
    } catch (err) {
      console.error('[Elsewhere] failed to build the world', err);
      if (token === this.loadToken) {
        this.setPhase('error');
        this.emit('error', 'Something went wrong while generating the world. Please reload the page.');
      }
      return false;
    }
  }

  private placeCarOnRoad(s: number): void {
    const session = this.session!;
    const road = session.world.road;
    s = clamp(s, road.startS + 20, road.endS - 50);
    const p = road.pointAt(s);
    const lane = session.env.kind === 'indoor' && session.env.indoor?.type === 'corridor' ? 0 : session.env.road.halfWidth * 0.5;
    const x = p.x - Math.cos(p.heading) * lane;
    const z = p.z + Math.sin(p.heading) * lane;
    this.vehicle.reset(x, p.y, z, p.heading);
    this.carS = s;
    this.waterTime = 0;
    this.particles.clear();
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

  /**
   * `rolling`: the drive continues from the moving menu preview. The car keeps
   * driving itself until the player touches a control, so nobody is handed a
   * car at speed with no warning.
   */
  private beginDrive(rolling = false): void {
    this.elapsed = 0;
    this.vehicle.state.odometer = 0;
    this.cameraCtl.setMode(this.settings.last.camera);
    this.car.setCockpitMode(false);
    this.setPhase('driving');
    this.loop.start();
    this.handover = false;
    if (rolling && Math.abs(this.vehicle.state.speed) > 2) {
      this.setAutoDrive(true, true);
      this.handover = this.autoDrive;
      if (this.handover) this.flash('The car is driving itself  ·  press any driving key to take the wheel', 6);
    }
  }

  /** Main menu: a live, autopiloted drive through the selected environment. */
  async showMenu(environmentId: DriveSelection['environmentId'], variantId: string | null, seed?: number): Promise<void> {
    const s = this.session;
    // Only reuse a world that has finished loading; otherwise the frame loop
    // would start on a half-built world (blank screen / stuck fade).
    if (s && s.ready && s.env.id === environmentId && (seed === undefined || seed === s.seed)) {
      if (variantId && s.weather.targetId !== variantId) this.setVariant(variantId, 4);
      this.enterMenuMode();
      return;
    }
    // A preview of this place is already being generated: let it finish.
    if (this.phase === 'loading' && this.menuLoadingEnv === environmentId && seed === undefined) {
      this.menuPendingVariant = variantId;
      return;
    }
    this.menuPendingVariant = null;
    this.setPhase('loading');
    this.menuLoadingEnv = environmentId;
    const ok = await this.loadSession({ environmentId, variantId, seed }, START_S, 'Finding somewhere quiet');
    this.menuLoadingEnv = null;
    if (!ok) return;
    if (this.menuPendingVariant && this.menuPendingVariant !== variantId) this.setVariant(this.menuPendingVariant, 0.1);
    this.menuPendingVariant = null;
    this.enterMenuMode();
  }

  private enterMenuMode(): void {
    this.exitPhotoInternal();
    this.setAutoDrive(false, true);
    if (this.session) this.session.autopilot.cruiseSpeed = this.session.baseCruise;
    this.cameraCtl.setMode('cinematic');
    this.car.setCockpitMode(false);
    this.setPhase('menu');
    this.loop.start();
  }

  /** Starts (or continues from the menu preview into) a drive. */
  async startDrive(sel: DriveSelection): Promise<void> {
    void this.audio.start();
    const s = this.session;
    const reuse = s && s.ready && s.env.id === sel.environmentId && (sel.seed === undefined || sel.seed === s.seed);
    if (reuse && (this.phase === 'menu' || this.phase === 'paused')) {
      if (sel.variantId && s.weather.targetId !== sel.variantId) this.setVariant(sel.variantId, 3);
      this.exitPhotoInternal();
      this.beginDrive(this.phase === 'menu');
      return;
    }
    this.setPhase('loading');
    if (await this.loadSession(sel)) this.beginDrive();
  }

  async restart(newRoad: boolean): Promise<void> {
    if (!this.session) return;
    const sel: DriveSelection = {
      environmentId: this.session.env.id,
      variantId: this.session.weather.targetId,
      seed: newRoad ? randomSeed() : this.session.seed,
    };
    this.setPhase('loading');
    if (await this.loadSession(sel, START_S, newRoad ? 'Finding a different road' : 'Back to the beginning')) this.beginDrive();
  }

  async changeEnvironment(environmentId: DriveSelection['environmentId'], variantId: string | null, seed?: number): Promise<void> {
    this.setPhase('loading');
    if (await this.loadSession({ environmentId, variantId, seed }, START_S, 'Taking the long way round')) this.beginDrive();
  }

  /** Rebuilds the current world in place (e.g. after a graphics preset change). */
  private async rebuildInPlace(): Promise<void> {
    if (!this.session) return;
    const prevPhase = this.phase;
    const odometer = this.vehicle.state.odometer;
    const elapsed = this.elapsed;
    const sel: DriveSelection = { environmentId: this.session.env.id, variantId: this.session.weather.targetId, seed: this.session.seed };
    const s = this.carS;
    this.setPhase('loading');
    const ok = await this.loadSession(sel, s, 'Rebuilding the world');
    if (!ok) return;
    if (prevPhase === 'menu') {
      this.enterMenuMode();
      return;
    }
    this.beginDrive();
    this.vehicle.state.odometer = odometer;
    this.elapsed = elapsed;
    if (prevPhase === 'paused') this.pause();
  }

  pause(): void {
    if (this.phase !== 'driving') return;
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    void this.audio.start();
    this.exitPhotoInternal();
    this.setPhase('driving');
  }

  returnToMenu(): void {
    if (!this.session || !this.session.ready) return;
    this.enterMenuMode();
  }

  setVariant(variantId: string, seconds = 20): void {
    const s = this.session;
    if (!s) return;
    const v = getVariant(s.env, variantId);
    s.weather.setTarget(v, seconds);
    s.atmosphere.markEnvironmentDirty();
    this.emit('variant', v.id);
    if (this.phase === 'paused' && s.ready) {
      // The sim is frozen while paused; jump the weather so the change shows.
      s.weather.update(seconds + 1);
      this.updateAtmosphere();
      this.needsRender = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Player actions

  setCameraMode(mode: DriveCamera): void {
    this.cameraCtl.setMode(mode);
    this.emit('camera', mode);
    this.needsRender = true;
  }

  /** Cycles chase → cockpit → hood → drone. */
  cycleCamera(): CameraMode {
    const i = DRIVE_CAMERAS.indexOf(this.cameraCtl.mode as DriveCamera);
    const next = DRIVE_CAMERAS[(i + 1) % DRIVE_CAMERAS.length];
    if (this.phase === 'paused') this.cameraCtl.reset();
    this.setCameraMode(next);
    return next;
  }

  get cameraMode(): CameraMode {
    return this.cameraCtl.mode;
  }

  recover(): void {
    if (!this.session || !this.session.ready || this.recoverTimer >= 0) return;
    // Outside a drive (menu preview) just put the car back; no screen fade.
    if (this.phase !== 'driving') {
      this.placeCarOnRoad(Math.max(this.carS, this.session.world.road.startS + 200));
      return;
    }
    this.recoverTimer = 0;
    this.emit('fade', true);
  }

  /** Auto-drive: the car follows the road by itself; steering takes back control. */
  toggleAutoDrive(): boolean {
    this.setAutoDrive(!this.autoDrive);
    return this.autoDrive;
  }

  private setAutoDrive(on: boolean, silent = false): void {
    if (!on) this.handover = false;
    if (on === this.autoDrive) return;
    const s = this.session;
    if (on && (!s || !s.ready || this.phase !== 'driving')) return;
    this.autoDrive = on;
    if (on && s) {
      // Carry on at roughly the current pace (never slower than a gentle cruise).
      s.autopilot.cruiseSpeed = clamp(this.vehicle.state.speed, s.baseCruise * 0.7, this.vehicle.params.maxSpeed * 0.85);
      this.vehicle.state.cruise = null;
    }
    this.emit('autoDrive', on);
    if (!silent) this.flash(on ? 'Auto-drive on  ·  ↑ ↓ change speed  ·  steer to take over' : 'Auto-drive off', on ? 3.5 : 1.8);
  }

  get autoDriveOn(): boolean {
    return this.autoDrive;
  }

  cycleHeadlights(): HeadlightMode {
    this.headlightMode = this.headlightMode === 'auto' ? 'on' : this.headlightMode === 'on' ? 'off' : 'auto';
    this.flash(`Headlights: ${this.headlightMode}`);
    return this.headlightMode;
  }

  horn(): void {
    this.audio.playHorn();
  }

  private flash(text: string, seconds = 2.2): void {
    this.toast = text;
    this.toastTimer = seconds;
    this.hudTimer = 0;
  }

  // --- Photo mode -------------------------------------------------------------

  get photoMode(): boolean {
    return this.photo;
  }

  enterPhotoMode(): void {
    const s = this.session;
    if (!s || !s.ready || this.photo) return;
    if (this.phase === 'driving') this.setPhase('paused');
    if (this.phase !== 'paused') return;
    this.photo = true;
    this.photoReturn = this.cameraCtl.mode;
    this.car.setCockpitMode(false);
    this.cameraCtl.setMode('photo');
    this.emit('photo', true);
  }

  exitPhotoMode(): void {
    if (!this.photo) return;
    this.exitPhotoInternal();
    this.needsRender = true;
  }

  private exitPhotoInternal(): void {
    if (!this.photo) return;
    this.photo = false;
    this.cameraCtl.setMode(this.photoReturn);
    this.cameraCtl.reset();
    this.emit('photo', false);
  }

  setPhotoFov(fov: number): void {
    this.cameraCtl.photoFov = clamp(fov, 18, 95);
  }

  setPhotoDistance(d: number): void {
    this.cameraCtl.photoDistance = clamp(d, 2.6, 80);
  }

  get photoSettings(): { fov: number; distance: number } {
    return { fov: this.cameraCtl.photoFov, distance: this.cameraCtl.photoDistance };
  }

  /** Renders the current view at higher resolution and returns it as a PNG data URL. */
  capturePhoto(targetWidth = 2560): string | null {
    const s = this.session;
    if (!s || !s.ready) return null;
    const w = this.canvas.clientWidth || window.innerWidth;
    const prev = this.renderer.getPixelRatio();
    const ratio = clamp(targetWidth / Math.max(1, w), 1, 3);
    try {
      this.renderer.setPixelRatio(ratio);
      this.sizePostFx();
      this.render();
      return this.canvas.toDataURL('image/png');
    } catch (err) {
      console.warn('[Elsewhere] photo capture failed', err);
      return null;
    } finally {
      this.renderer.setPixelRatio(prev);
      this.sizePostFx();
      this.render();
    }
  }

  // ---------------------------------------------------------------------------

  applySettings(settings: Settings): void {
    const prev = this.settings;
    this.settings = settings;
    this.audio.setVolumes(settings.audio);
    this.car.setColor(settings.vehicle.color);
    this.perf.adaptive = settings.graphics.adaptiveResolution;
    if (!settings.graphics.adaptiveResolution) this.perf.dynamicScale = 1;
    this.applyPixelRatio();
    this.applyVehicleParams();
    this.session?.anomalies.setSettings(settings.atmosphere);
    const presetChanged = settings.graphics.preset !== prev.graphics.preset;
    if (presetChanged) this.profile = getGraphicsProfile(settings.graphics.preset);
    if (presetChanged || settings.graphics.postFx !== prev.graphics.postFx) this.setupPipeline();
    if (presetChanged && this.session && (this.phase === 'driving' || this.phase === 'paused' || this.phase === 'menu')) {
      void this.rebuildInPlace();
    }
    this.needsRender = true;
  }

  // ---------------------------------------------------------------------------
  // Frame

  private cameraOptions(session: Session) {
    const ind = session.env.indoor;
    return {
      reduceMotion: this.settings.comfort.reduceMotion,
      fov: this.settings.controls.fov,
      groundAt: (x: number, z: number) => session.world.ground(x, z, this.ground).height,
      ceilingY: ind ? this.q.y + ind.ceilingHeight : null,
      lookBack: this.phase === 'driving' && this.input.lookBack,
    };
  }

  private cameraTarget() {
    const st = this.vehicle.state;
    return { x: st.x, y: st.y, z: st.z, heading: st.heading, speed: st.speed, steer: st.steer, body: this.car.body };
  }

  /** Re-renders a paused scene (camera change, photo exit, resize). */
  private renderStill(): void {
    const session = this.session;
    if (!session || !session.ready) return;
    this.cameraCtl.update(0.016, this.cameraTarget(), this.cameraOptions(session), false);
    this.car.setCockpitMode(this.cameraCtl.cockpitVisible);
    session.atmosphere.followCamera(this.cameraCtl.camera, this.time, session.weather.current);
    this.render();
    this.needsRender = false;
  }

  private frame(dt: number): void {
    if (this.disposed) return;
    const session = this.session;
    if (!session || !session.ready) return;
    if (this.phase === 'loading' || this.phase === 'error' || this.phase === 'boot') return;
    if (this.phase === 'paused') {
      if (this.photo) {
        const [px, py] = this.input.consumeLook();
        this.cameraCtl.addLook(px, py, this.settings.controls.cameraSensitivity);
        this.cameraCtl.addZoom(this.input.consumeZoom());
        this.cameraCtl.update(dt, this.cameraTarget(), this.cameraOptions(session), this.input.looking);
        session.atmosphere.followCamera(this.cameraCtl.camera, this.time, session.weather.current);
        this.render();
      } else if (this.needsRender) {
        this.renderStill();
      }
      this.input.consumeEdges();
      return;
    }
    // The first frame after (re)starting the loop can have no elapsed time.
    if (!(dt > 1e-5)) return;
    this.time += dt;
    const time = this.time;
    const driving = this.phase === 'driving';
    if (driving) this.elapsed += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast = null;
    }

    // Discrete actions.
    for (const edge of this.input.consumeEdges()) {
      if (!driving) continue;
      if (edge === 'camera') this.cycleCamera();
      else if (edge === 'hud') this.emit('toggleHud', undefined);
      else if (edge === 'recover') this.recover();
      else if (edge === 'cruise') {
        this.setAutoDrive(false, true);
        this.flash(this.vehicle.toggleCruise() ? 'Cruise control set' : 'Cruise control off');
      } else if (edge === 'autodrive') this.toggleAutoDrive();
      else if (edge === 'headlights') this.cycleHeadlights();
      else if (edge === 'horn') this.horn();
      else if (edge === 'photo') {
        this.enterPhotoMode();
        return;
      }
    }
    const [lx, ly] = this.input.consumeLook();
    this.cameraCtl.addLook(lx, ly, this.settings.controls.cameraSensitivity);
    this.input.consumeZoom();

    // Vehicle input: player, auto-drive or the menu's autopilot.
    const world = session.world;
    if (this.recoverTimer >= 0) {
      this.vin.throttle = 0;
      this.vin.brake = 1;
      this.vin.steer = 0;
      this.vin.handbrake = false;
    } else if (driving && !this.debugAutopilot) {
      this.input.read(this.playerIn);
      if (this.handover && (this.playerIn.throttle > 0.1 || this.playerIn.brake > 0.1 || Math.abs(this.playerIn.steer) > 0.1 || this.playerIn.handbrake)) {
        // First touch of the controls after starting from the menu: hand over quietly.
        this.handover = false;
        this.setAutoDrive(false, true);
        this.flash('You have the wheel', 1.6);
      }
      if (this.autoDrive && (Math.abs(this.playerIn.steer) > 0.2 || this.playerIn.handbrake)) this.setAutoDrive(false);
      if (this.autoDrive) {
        // Accelerate / brake nudge the cruising speed instead of cancelling.
        const ap = session.autopilot;
        ap.cruiseSpeed = clamp(
          ap.cruiseSpeed + (this.playerIn.throttle * 5 - this.playerIn.brake * 9) * dt,
          4,
          this.vehicle.params.maxSpeed * 0.92,
        );
        ap.drive(this.vehicle.state, this.vehicle.params, this.carS, this.vin);
      } else {
        this.vin.throttle = this.playerIn.throttle;
        this.vin.brake = this.playerIn.brake;
        this.vin.steer = this.playerIn.steer;
        this.vin.handbrake = this.playerIn.handbrake;
      }
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
    this.updateAtmosphere();

    // Camera.
    this.cameraCtl.update(dt, this.cameraTarget(), this.cameraOptions(session), this.input.looking);
    this.car.setCockpitMode(this.cameraCtl.cockpitVisible);
    session.atmosphere.followCamera(this.cameraCtl.camera, time, session.weather.current);

    this.updateParticles(session, dt, fx, fz);

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
    if (!this.live) {
      this.live = true;
      this.emit('live', true);
    }
    if (this.perf.frame(dt)) this.applyPixelRatio();
    this.emitHud(dt, driving);
  }

  /** Indoor walls and solid scenery (trees, houses, poles, rails, parked cars). */
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
    if (this.recoverTimer >= 0) return;
    // The car is approximated by a circle over each axle.
    const colliders = session.world.colliders;
    for (const off of [1.3, -1.3]) {
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      const cx = st.x + fx * off;
      const cz = st.z + fz * off;
      const r = colliders.resolve(cx, cz, 0.92, this.collision);
      if (!r.hit) continue;
      const dx = r.x - cx;
      const dz = r.z - cz;
      st.x += dx * 0.6;
      st.z += dz * 0.6;
      // A sideways shove at one end of the car also turns it, so it slides off.
      const lateral = dx * fz - dz * fx;
      st.heading += clamp(lateral / 1.3, -0.06, 0.06) * Math.sign(off);
      const along = fx * r.nx + fz * r.nz;
      const into = along * st.speed;
      if (into < 0) {
        const impact = -into;
        st.speed *= Math.max(0, 1 - Math.abs(along) * 0.9);
        st.cruise = null;
        if (impact > 1.5 && this.scrapeCooldown <= 0) {
          this.audio.playOneShot(impact > 6 ? 'thud' : 'scrape');
          this.scrapeCooldown = 0.35;
        }
      }
      st.yawRate *= 0.6;
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
    if (this.autoDrive && (this.q.dist > 12 || st.stuckTime > 3)) {
      this.recover();
      return;
    }
    if (session.env.kind === 'outdoor') {
      if (this.q.dist > 220) this.recover();
      else if (this.q.dist > 45) this.hint = 'Press R to return to the road';
    }
    if (st.stuckTime > 3) this.hint = 'Stuck? Press R to recover';
  }

  private lightsState(): { on: boolean; level: number } {
    const atm = this.session?.weather.current;
    const indoor = this.session?.env.kind === 'indoor';
    if (this.headlightMode === 'off') return { on: false, level: 0 };
    if (this.headlightMode === 'on') return { on: true, level: 1 };
    const level = indoor ? Math.max(0.5, atm?.headlights ?? 1) : (atm?.headlights ?? 0);
    return { on: indoor || level > 0.5, level };
  }

  private syncCarModel(dt: number): void {
    const st = this.vehicle.state;
    const root = this.car.root;
    root.position.set(st.x, st.y, st.z);
    root.rotation.set(st.groundPitch, st.heading, st.groundRoll, 'YXZ');
    const atm = this.session?.weather.current;
    const indoor = this.session?.env.kind === 'indoor';
    const lights = this.lightsState();
    const murk = atm ? atm.rain * 0.6 + Math.max(0, 1 - atm.fogFar / 420) * 0.9 : 0;
    const dark = 1 - (this.session?.atmosphere.brightness ?? 1);
    this.car.update(dt, {
      steerAngle: st.steer,
      wheelSpin: st.wheelSpin,
      braking: st.braking || this.vin.brake > 0.1,
      reversing: st.speed < -0.3,
      lightsOn: lights.on,
      headlights: lights.level * (indoor ? 90 : 260),
      beams: lights.on && !indoor ? clamp(0.12 * dark + murk, 0, 1) : 0,
      speedKmh: st.speed * 3.6,
      units: this.settings.controls.units,
      darkness: dark,
      contactShadow: (this.session?.atmosphere.sunShadows ? 0.3 : 0.55) * (0.45 + 0.55 * (1 - dark)),
      pitch: st.bodyPitch,
      roll: st.bodyRoll,
      bounce: st.bounce,
    });
  }

  /** Dust off-road, spray on wet roads, smoke under the handbrake. */
  private updateParticles(session: Session, dt: number, fx: number, fz: number): void {
    const p = this.particles;
    if (!p.enabled) return;
    const st = this.vehicle.state;
    const sp = Math.abs(st.speed);
    const atm = session.weather.current;
    const light = 0.25 + session.atmosphere.brightness * 0.85;
    let rate = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let alpha = 0;
    let size = 1;
    let life = 1;
    if ((st.surface === 'offroad' || st.surface === 'shoulder') && sp > 3 && atm.wetness < 0.6) {
      rate = Math.min(55, sp * 2.4);
      [r, g, b] = this.dustColor;
      r = (r * 0.8 + 0.2) * light;
      g = (g * 0.8 + 0.18) * light;
      b = (b * 0.8 + 0.14) * light;
      alpha = 0.22;
      size = 0.75;
      life = 1.4;
    } else if (atm.wetness > 0.6 && sp > 9 && st.surface !== 'water') {
      rate = Math.min(70, sp * 1.8 * atm.wetness);
      r = g = b = 0.78 * light;
      alpha = 0.085;
      size = 0.5;
      life = 0.7;
    } else if (this.vin.handbrake && sp > 8) {
      rate = 45;
      r = g = b = 0.78 * light;
      alpha = 0.14;
      size = 0.6;
      life = 1.2;
    }
    this.emitAcc += rate * dt;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const lxv = fz * side * 0.78;
      const lzv = -fx * side * 0.78;
      p.emit(
        st.x - fx * 1.45 + lxv + (Math.random() - 0.5) * 0.3,
        st.y + 0.12,
        st.z - fz * 1.45 + lzv + (Math.random() - 0.5) * 0.3,
        fx * st.speed * 0.25 + (Math.random() - 0.5) * 1.2,
        0.5 + Math.random() * 0.9,
        fz * st.speed * 0.25 + (Math.random() - 0.5) * 1.2,
        life * (0.7 + Math.random() * 0.6),
        size * (0.7 + Math.random() * 0.7),
        r,
        g,
        b,
        alpha,
      );
    }
    if (rate === 0) this.emitAcc = 0;
    p.update(dt, this.canvas.clientHeight || 720);
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

  private updateAtmosphere(): void {
    const s = this.session!;
    const state = s.weather.current;
    const overlay = s.anomalies.overlay;
    s.atmosphere.apply(state, overlay, s.world.viewDistance, this.time, s.weather.transitioning);
    this.horizon.setRGB(...state.skyHorizon);
    this.sunColor.setRGB(...state.sunColor);
    const lights = state.lights * overlay.lights;
    s.world.applyAtmosphere(state, lights, s.atmosphere.brightness, this.horizon, this.sunColor, s.atmosphere.sunGlow, s.atmosphere.sunDir);
    s.atmosphere.updateIndoorLights(s.world.road, this.carS, lights);
    // Centre the shadow area a little ahead of the car, where the camera looks.
    const st = this.vehicle.state;
    const ahead = this.profile.shadowRange * 0.45;
    this.shadowCenter.set(st.x + Math.sin(st.heading) * ahead, st.y, st.z + Math.cos(st.heading) * ahead);
    s.atmosphere.followCar(this.shadowCenter);
  }

  private render(): void {
    if (this.postfx) {
      const s = this.session;
      const glow = s ? (s.env.kind === 'indoor' ? 0.55 : clamp(1.15 - s.atmosphere.brightness * 1.25, 0, 1)) : 0;
      this.postfx.setLook(glow, this.time);
      this.postfx.render();
    } else {
      this.renderer.render(this.scene, this.cameraCtl.camera);
    }
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
        autoDrive: this.autoDrive,
        elapsed: this.elapsed,
        odometerKm: this.vehicle.state.odometer / 1000,
        environment: s.env.name,
        variant: v.name,
        seed: s.seed,
        hint: driving ? (this.toast ?? this.hint) : null,
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
    this.sizePostFx();
    this.needsRender = true;
  }

  private onResize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w < 1 || h < 1) return;
    this.renderer.setSize(w, h, false);
    this.cameraCtl.resize(w / Math.max(1, h));
    this.sizePostFx();
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

  // ---------------------------------------------------------------------------
  // Debug helpers (used by automated browser checks)

  debugState() {
    const st = this.vehicle.state;
    return {
      phase: this.phase,
      env: this.session?.env.id,
      seed: this.session?.seed,
      ready: this.session?.ready ?? false,
      live: this.live,
      carS: this.carS,
      speedKmh: st.speed * 3.6,
      lateral: this.q.lateral,
      surface: st.surface,
      y: st.y,
      autoDrive: this.autoDrive,
      camera: this.cameraCtl.mode,
      photo: this.photo,
      postFx: this.postfx !== null,
      world: this.session?.world.stats,
      memory: { ...this.renderer.info.memory },
      loopRunning: this.loop.running,
      anomaly: this.session?.anomalies.activeKind ?? null,
    };
  }

  /** Debug: let the autopilot drive during a real drive (automated soak tests). */
  debugAutopilot = false;

  /** Debug helper: advances the simulation synchronously. */
  debugAdvance(frames: number, dt = 1 / 60, input?: Partial<VehicleInput>): void {
    for (let i = 0; i < frames; i++) {
      if (input) this.input.setTouch({ throttle: input.throttle ?? 0, brake: input.brake ?? 0, steer: input.steer ?? 0 });
      this.frame(dt);
    }
    if (input) this.input.setTouch({ throttle: 0, brake: 0, steer: 0 });
  }

  /** Debug helper: place the car at a lateral offset from the road (collision tests). */
  debugPlace(s: number, lateral: number, headingOffset = 0): void {
    const session = this.session;
    if (!session) return;
    const p = session.world.road.pointAt(s);
    const x = p.x - Math.cos(p.heading) * lateral;
    const z = p.z + Math.sin(p.heading) * lateral;
    const g = session.world.ground(x, z, this.ground);
    this.vehicle.reset(x, g.height, z, p.heading + headingOffset);
    this.cameraCtl.reset();
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
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.disposeSession();
    this.postfx?.dispose();
    this.particles.dispose();
    this.car.dispose();
    disposeObjectTree(this.scene);
    this.audio.dispose();
    this.renderer.dispose();
    this.listeners.clear();
  }
}
