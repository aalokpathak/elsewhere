/** Keyboard bindings (KeyboardEvent.code). */
export type DriveAction = 'accelerate' | 'brake' | 'left' | 'right' | 'handbrake' | 'lookBack';
export type EdgeAction = 'camera' | 'pause' | 'hud' | 'recover' | 'cruise' | 'autodrive' | 'headlights' | 'horn' | 'photo';

export const DRIVE_KEYS: Record<DriveAction, string[]> = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  lookBack: ['KeyB'],
};

export const EDGE_KEYS: Record<EdgeAction, string[]> = {
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  hud: ['KeyH'],
  recover: ['KeyR'],
  cruise: ['KeyQ'],
  autodrive: ['KeyT'],
  headlights: ['KeyL'],
  horn: ['KeyN'],
  photo: ['KeyV'],
};

/** Keys whose default browser behaviour (scrolling) is suppressed while driving. */
export const PREVENT_DEFAULT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Human-readable guide used by the pause menu and main menu. */
export const CONTROLS_GUIDE: { keys: string; action: string }[] = [
  { keys: 'W / ↑', action: 'Accelerate' },
  { keys: 'S / ↓', action: 'Brake, then reverse' },
  { keys: 'A D / ← →', action: 'Steer' },
  { keys: 'Space', action: 'Handbrake' },
  { keys: 'T', action: 'Auto-drive (the car follows the road)' },
  { keys: 'Q', action: 'Cruise control' },
  { keys: 'C', action: 'Next camera: chase, cockpit, hood, drone' },
  { keys: 'B', action: 'Look behind (hold)' },
  { keys: 'Drag', action: 'Look around' },
  { keys: 'V', action: 'Photo mode' },
  { keys: 'L', action: 'Headlights: auto / on / off' },
  { keys: 'N', action: 'Horn' },
  { keys: 'R', action: 'Recover to the road' },
  { keys: 'H', action: 'Toggle HUD' },
  { keys: 'F', action: 'Fullscreen' },
  { keys: 'M', action: 'Mute' },
  { keys: 'Esc', action: 'Pause' },
];
