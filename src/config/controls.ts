/** Keyboard bindings (KeyboardEvent.code). */
export type DriveAction = 'accelerate' | 'brake' | 'left' | 'right' | 'handbrake';
export type EdgeAction = 'camera' | 'pause' | 'hud' | 'recover' | 'cruise';

export const DRIVE_KEYS: Record<DriveAction, string[]> = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
};

export const EDGE_KEYS: Record<EdgeAction, string[]> = {
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  hud: ['KeyH'],
  recover: ['KeyR'],
  cruise: ['KeyQ'],
};

/** Keys whose default browser behaviour (scrolling) is suppressed while driving. */
export const PREVENT_DEFAULT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Human-readable guide used by the pause menu and main menu. */
export const CONTROLS_GUIDE: { keys: string; action: string }[] = [
  { keys: 'W / ↑', action: 'Accelerate' },
  { keys: 'S / ↓', action: 'Brake, then reverse' },
  { keys: 'A D / ← →', action: 'Steer' },
  { keys: 'Space', action: 'Handbrake' },
  { keys: 'Q', action: 'Cruise control' },
  { keys: 'C', action: 'Switch camera' },
  { keys: 'Drag', action: 'Look around' },
  { keys: 'R', action: 'Recover to the road' },
  { keys: 'H', action: 'Toggle HUD' },
  { keys: 'Esc', action: 'Pause' },
];
