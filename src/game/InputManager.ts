import { DRIVE_KEYS, EDGE_KEYS, PREVENT_DEFAULT_KEYS, type DriveAction, type EdgeAction } from '../config/controls';
import type { VehicleInput } from './VehicleController';

/**
 * Collects keyboard, touch and gamepad input into a single VehicleInput.
 * Listens on `window`, so controls work regardless of where the pointer is,
 * but ignores events aimed at form fields so menus keep normal keyboard
 * behaviour.
 */

const codeToDrive = new Map<string, DriveAction>();
for (const [action, codes] of Object.entries(DRIVE_KEYS) as [DriveAction, string[]][]) {
  for (const c of codes) codeToDrive.set(c, action);
}
const codeToEdge = new Map<string, EdgeAction>();
for (const [action, codes] of Object.entries(EDGE_KEYS) as [EdgeAction, string[]][]) {
  for (const c of codes) codeToEdge.set(c, action);
}

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export interface TouchInputState {
  steer: number;
  throttle: number;
  brake: number;
}

export class InputManager {
  /** When false, driving keys are ignored and default browser behaviour is kept. */
  driving = false;
  private readonly down = new Set<DriveAction>();
  private edges: EdgeAction[] = [];
  private readonly touch: TouchInputState = { steer: 0, throttle: 0, brake: 0 };
  private attached = false;
  /** Pointer-drag look offsets, consumed by the camera. */
  lookDX = 0;
  lookDY = 0;
  looking = false;
  private dragId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(private readonly canvas: HTMLElement) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTextTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!this.driving) return;
    const drive = codeToDrive.get(e.code);
    if (drive) {
      this.down.add(drive);
      if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    }
    const edge = codeToEdge.get(e.code);
    // Escape is handled by the UI layer so it also works in menus.
    if (edge && !e.repeat && edge !== 'pause') this.edges.push(edge);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const drive = codeToDrive.get(e.code);
    if (drive) this.down.delete(drive);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return; // touch uses the on-screen controls
    if (e.button !== 0 && e.button !== 2) return;
    this.dragId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.looking = true;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.dragId !== e.pointerId) return;
    this.lookDX += e.clientX - this.lastX;
    this.lookDY += e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.dragId !== e.pointerId) return;
    this.dragId = null;
    this.looking = false;
  };

  /** Releases everything (focus loss, pause) so no key can get stuck. */
  clear = (): void => {
    this.down.clear();
    this.edges = [];
    this.touch.steer = 0;
    this.touch.throttle = 0;
    this.touch.brake = 0;
    this.dragId = null;
    this.looking = false;
  };

  setTouch(state: Partial<TouchInputState>): void {
    Object.assign(this.touch, state);
  }

  pushEdge(action: EdgeAction): void {
    this.edges.push(action);
  }

  consumeEdges(): EdgeAction[] {
    const e = this.edges;
    this.edges = [];
    return e;
  }

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  read(out: VehicleInput): VehicleInput {
    let throttle = this.down.has('accelerate') ? 1 : 0;
    let brake = this.down.has('brake') ? 1 : 0;
    let steer = (this.down.has('left') ? 1 : 0) - (this.down.has('right') ? 1 : 0);
    let handbrake = this.down.has('handbrake');

    throttle = Math.max(throttle, this.touch.throttle);
    brake = Math.max(brake, this.touch.brake);
    if (this.touch.steer !== 0) steer = this.touch.steer;

    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const lx = pad.axes[0] ?? 0;
      if (Math.abs(lx) > 0.12) steer = -lx;
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
      handbrake = handbrake || !!pad.buttons[1]?.pressed;
      break;
    }
    out.throttle = throttle;
    out.brake = brake;
    out.steer = steer;
    out.handbrake = handbrake;
    return out;
  }
}
