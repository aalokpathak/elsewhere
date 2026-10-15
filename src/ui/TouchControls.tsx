import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameEngine } from '../game/GameEngine';

/**
 * On-screen pedals and steering for touch devices. Each pad tracks its own
 * pointer ids, so steering and accelerating at the same time works with
 * multitouch. The left pad is analogue: slide your thumb further from the
 * centre to steer harder.
 */
export function TouchControls({ engine }: { engine: GameEngine }) {
  const steerPad = useRef<HTMLDivElement>(null);
  const steerPointer = useRef<number | null>(null);
  const pedals = useRef(new Map<number, 'gas' | 'brake'>());

  const updatePedals = () => {
    const vals = [...pedals.current.values()];
    engine.input.setTouch({ throttle: vals.includes('gas') ? 1 : 0, brake: vals.includes('brake') ? 1 : 0 });
  };

  const steerFrom = (clientX: number) => {
    const el = steerPad.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = ((clientX - r.left) / r.width) * 2 - 1;
    const steer = Math.max(-1, Math.min(1, -t * 1.25));
    engine.input.setTouch({ steer: Math.abs(steer) < 0.08 ? 0 : steer });
    el.style.setProperty('--steer', String(-steer));
  };

  const onSteerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    steerPointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    steerFrom(e.clientX);
  };
  const onSteerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPointer.current === e.pointerId) steerFrom(e.clientX);
  };
  const onSteerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPointer.current !== e.pointerId) return;
    steerPointer.current = null;
    engine.input.setTouch({ steer: 0 });
    steerPad.current?.style.setProperty('--steer', '0');
  };

  const pedal = (kind: 'gas' | 'brake') => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pedals.current.set(e.pointerId, kind);
      e.currentTarget.classList.add('is-pressed');
      updatePedals();
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      pedals.current.delete(e.pointerId);
      e.currentTarget.classList.remove('is-pressed');
      updatePedals();
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
      pedals.current.delete(e.pointerId);
      e.currentTarget.classList.remove('is-pressed');
      updatePedals();
    },
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  });

  useEffect(() => () => engine.input.setTouch({ steer: 0, throttle: 0, brake: 0 }), [engine]);

  return (
    <div className="touch-controls">
      <div
        className="touch-steer"
        ref={steerPad}
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerUp}
        onPointerCancel={onSteerUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Steering pad"
        role="slider"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={0}
      >
        <span className="touch-steer-arrow">‹</span>
        <span className="touch-steer-knob" />
        <span className="touch-steer-arrow">›</span>
      </div>
      <div className="touch-pedals">
        <button type="button" className="touch-pedal touch-brake" aria-label="Brake" {...pedal('brake')}>
          Brake
        </button>
        <button type="button" className="touch-pedal touch-gas" aria-label="Accelerate" {...pedal('gas')}>
          Go
        </button>
      </div>
    </div>
  );
}
