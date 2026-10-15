import { useEffect, useRef } from 'react';
import type { HudSnapshot } from '../app/game-state';
import type { SpeedUnits } from '../config/settings';
import type { GameEngine } from '../game/GameEngine';

interface Props {
  engine: GameEngine;
  visible: boolean;
  units: SpeedUnits;
  showTime: boolean;
  onPause: () => void;
  onCamera: () => void;
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Minimal driving HUD. Values are written straight into DOM nodes from the
 * engine's 10 Hz snapshot, so driving never triggers React re-renders.
 */
export function GameHUD({ engine, visible, units, showTime, onPause, onCamera }: Props) {
  const speedRef = useRef<HTMLSpanElement>(null);
  const placeRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const camRef = useRef<HTMLSpanElement>(null);
  const cruiseRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const unitsRef = useRef(units);
  unitsRef.current = units;

  useEffect(() => {
    let lastHint: string | null = null;
    return engine.on('hud', (h: HudSnapshot) => {
      const v = unitsRef.current === 'mph' ? h.speedKmh * 0.621371 : h.speedKmh;
      if (speedRef.current) speedRef.current.textContent = String(Math.round(v));
      if (placeRef.current) placeRef.current.textContent = `${h.environment} · ${h.variant}`;
      if (timeRef.current) {
        const dist = unitsRef.current === 'mph' ? `${(h.odometerKm * 0.621371).toFixed(1)} mi` : `${h.odometerKm.toFixed(1)} km`;
        timeRef.current.textContent = `${formatTime(h.elapsed)}  ·  ${dist}`;
      }
      if (camRef.current) camRef.current.textContent = h.camera === 'cockpit' ? 'Cockpit' : 'Chase';
      if (cruiseRef.current) cruiseRef.current.hidden = !h.cruise;
      if (hintRef.current && h.hint !== lastHint) {
        lastHint = h.hint;
        hintRef.current.textContent = h.hint ?? '';
        hintRef.current.classList.toggle('is-visible', !!h.hint);
      }
    });
  }, [engine]);

  return (
    <div className={`hud${visible ? '' : ' is-hidden'}`} aria-hidden={!visible}>
      <div className="hud-top">
        <span className="hud-place" ref={placeRef} />
        <div className="hud-actions">
          <button type="button" className="hud-btn" onClick={onCamera} aria-label="Switch camera">
            <span className="hud-btn-label">View</span>
            <span ref={camRef}>Chase</span>
          </button>
          <button type="button" className="hud-btn" onClick={onPause} aria-label="Pause">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <div className="hud-hint" ref={hintRef} role="status" />
      <div className="hud-bottom">
        <div className="hud-speed">
          <span className="hud-speed-value" ref={speedRef}>
            0
          </span>
          <span className="hud-speed-unit">{units === 'mph' ? 'mph' : 'km/h'}</span>
          <span className="hud-cruise" ref={cruiseRef} hidden>
            Cruise
          </span>
        </div>
        {showTime && <span className="hud-time" ref={timeRef} />}
      </div>
    </div>
  );
}
