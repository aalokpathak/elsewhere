import { useEffect, useRef } from 'react';
import type { HudSnapshot } from '../app/game-state';
import type { SpeedUnits } from '../config/settings';
import { CAMERA_LABELS } from '../game/CameraController';
import type { GameEngine } from '../game/GameEngine';

interface Props {
  engine: GameEngine;
  visible: boolean;
  units: SpeedUnits;
  showTime: boolean;
  onPause: () => void;
  onPhoto: () => void;
  onFullscreen: () => void;
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
export function GameHUD({ engine, visible, units, showTime, onPause, onPhoto, onFullscreen }: Props) {
  const speedRef = useRef<HTMLSpanElement>(null);
  const placeRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const camRef = useRef<HTMLSpanElement>(null);
  const cruiseRef = useRef<HTMLSpanElement>(null);
  const autoRef = useRef<HTMLSpanElement>(null);
  const autoBtnRef = useRef<HTMLButtonElement>(null);
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
      if (camRef.current) camRef.current.textContent = CAMERA_LABELS[h.camera];
      if (cruiseRef.current) cruiseRef.current.hidden = !h.cruise;
      if (autoRef.current) autoRef.current.hidden = !h.autoDrive;
      autoBtnRef.current?.classList.toggle('is-active', h.autoDrive);
      if (hintRef.current && h.hint !== lastHint) {
        lastHint = h.hint;
        if (h.hint) hintRef.current.textContent = h.hint;
        hintRef.current.classList.toggle('is-visible', !!h.hint);
      }
    });
  }, [engine]);

  return (
    <div className={`hud${visible ? '' : ' is-hidden'}`} aria-hidden={!visible}>
      <div className="hud-top">
        <span className="hud-place" ref={placeRef} />
        <div className="hud-actions">
          <button type="button" className="hud-btn" ref={autoBtnRef} onClick={() => engine.toggleAutoDrive()} aria-label="Toggle auto-drive" title="Auto-drive (T)">
            Auto
          </button>
          <button type="button" className="hud-btn" onClick={() => engine.cycleCamera()} aria-label="Switch camera" title="Camera (C)">
            <span className="hud-btn-label">View</span>
            <span ref={camRef}>Chase</span>
          </button>
          <button type="button" className="hud-btn hud-btn-icon" onClick={onPhoto} aria-label="Photo mode" title="Photo mode (V)">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 3 6.4 1.8h3.2L10.5 3H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 3 3z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button type="button" className="hud-btn hud-btn-icon" onClick={onFullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="hud-btn hud-btn-icon" onClick={onPause} aria-label="Pause" title="Pause (Esc)">
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
          <span className="hud-cruise" ref={autoRef} hidden>
            Auto-drive
          </span>
        </div>
        {showTime && <span className="hud-time" ref={timeRef} />}
      </div>
    </div>
  );
}
