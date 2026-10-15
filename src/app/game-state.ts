import type { EnvironmentId } from '../config/environments';
import type { CameraMode } from '../game/CameraController';

/**
 * The game's top-level state machine.
 *
 *   boot ──► menu ──► loading ──► driving ◄──► paused
 *              ▲         ▲           │            │
 *              │         └───────────┴── restart / change environment
 *              └──────────────────────────────── return to menu
 *
 * `error` is terminal (no WebGL or a lost graphics context).
 */
export type GamePhase = 'boot' | 'menu' | 'loading' | 'driving' | 'paused' | 'error';

export interface DriveSelection {
  environmentId: EnvironmentId;
  variantId: string | null;
  seed?: number;
}

export interface HudSnapshot {
  speedKmh: number;
  camera: CameraMode;
  cruise: boolean;
  elapsed: number;
  odometerKm: number;
  environment: string;
  variant: string;
  seed: number;
  hint: string | null;
}

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  chunks: number;
  pendingChunks: number;
  segments: number;
  instances: number;
  pixelRatio: number;
  geometries: number;
  textures: number;
}

export interface EngineEvents {
  phase: GamePhase;
  loading: { progress: number; label: string };
  hud: HudSnapshot;
  perf: PerfSnapshot;
  camera: CameraMode;
  toggleHud: void;
  fade: boolean;
  error: string;
  variant: string;
}

/** Legal phase transitions; anything else is a programming error. */
const TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  boot: ['menu', 'loading', 'error'],
  menu: ['loading', 'driving', 'menu', 'error'],
  loading: ['menu', 'driving', 'loading', 'error'],
  driving: ['paused', 'loading', 'menu', 'driving', 'error'],
  paused: ['driving', 'loading', 'menu', 'paused', 'error'],
  error: ['error'],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return TRANSITIONS[from].includes(to);
}
