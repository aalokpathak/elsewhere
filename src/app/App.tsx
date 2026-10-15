import { useCallback, useEffect, useRef, useState } from 'react';
import { getEnvironment, type EnvironmentId } from '../config/environments';
import { loadSettings, saveSettings, type Settings } from '../config/settings';
import type { CameraMode } from '../game/CameraController';
import { GameEngine, WebGLUnavailableError } from '../game/GameEngine';
import { ControlsGuide } from '../ui/ControlsGuide';
import { EnvironmentSelector } from '../ui/EnvironmentSelector';
import { GameHUD } from '../ui/GameHUD';
import { LoadingScreen } from '../ui/LoadingScreen';
import { MainMenu } from '../ui/MainMenu';
import { PauseMenu } from '../ui/PauseMenu';
import { PerformanceOverlay } from '../ui/PerformanceOverlay';
import { SettingsMenu } from '../ui/SettingsMenu';
import { TouchControls } from '../ui/TouchControls';
import type { GamePhase } from './game-state';

type Overlay = 'none' | 'settings' | 'controls' | 'environments';

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  ((typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0);

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [phase, setPhase] = useState<GamePhase>('boot');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [envId, setEnvId] = useState<EnvironmentId>(settings.last.environmentId);
  const [variantId, setVariantId] = useState<string | null>(settings.last.variantId);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [loading, setLoading] = useState({ progress: 0, label: '' });
  const [context, setContext] = useState<'menu' | 'drive'>('menu');
  const [error, setError] = useState<string | null>(null);
  const [fade, setFade] = useState(false);
  const [camera, setCamera] = useState<CameraMode>(settings.last.camera);
  const [seed, setSeed] = useState<number | null>(null);
  const [touch] = useState(isTouchDevice);
  const [leavingMenu, setLeavingMenu] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // --- Engine lifecycle ------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let eng: GameEngine;
    try {
      eng = new GameEngine(canvas, settingsRef.current);
    } catch (e) {
      setError(
        e instanceof WebGLUnavailableError
          ? 'Elsewhere needs WebGL, which is unavailable or disabled in this browser. Try enabling hardware acceleration or another modern browser.'
          : `Something went wrong while starting the engine: ${e instanceof Error ? e.message : String(e)}`,
      );
      setPhase('error');
      return;
    }
    let lastPhase: GamePhase = 'boot';
    const offs = [
      eng.on('phase', (p) => {
        const prev = lastPhase;
        lastPhase = p;
        setPhase(p);
        // Any route from a drive back to the menu (not only the menu button)
        // restores the menu UI. Preview loads finishing (loading → menu) don't.
        if (p === 'menu' && (prev === 'driving' || prev === 'paused')) {
          setContext('menu');
          setLeavingMenu(false);
        }
        const sel = eng.currentSelection;
        if (sel) setSeed(sel.seed ?? null);
      }),
      eng.on('loading', (l) => setLoading(l)),
      eng.on('error', (msg) => setError(msg)),
      eng.on('fade', (f) => setFade(f)),
      eng.on('camera', (c) => {
        setCamera(c);
        if (c !== 'cinematic') setSettings((s) => ({ ...s, last: { ...s.last, camera: c } }));
      }),
      eng.on('toggleHud', () => setSettings((s) => ({ ...s, comfort: { ...s.comfort, showHud: !s.comfort.showHud } }))),
      eng.on('variant', (v) => setVariantId(v)),
    ];
    setEngine(eng);
    void eng.showMenu(settingsRef.current.last.environmentId, settingsRef.current.last.variantId);
    if (import.meta.env.DEV) {
      (window as unknown as { elsewhere?: GameEngine }).elsewhere = eng;
      void import('./devTools').then((m) => m.installDevTools(() => eng));
    }
    return () => {
      offs.forEach((off) => off());
      eng.dispose();
      setEngine(null);
    };
  }, []);

  // --- Settings persistence ---------------------------------------------------
  useEffect(() => {
    engine?.applySettings(settings);
    saveSettings(settings);
  }, [engine, settings]);

  useEffect(() => {
    setSettings((s) =>
      s.last.environmentId === envId && s.last.variantId === variantId ? s : { ...s, last: { ...s.last, environmentId: envId, variantId } },
    );
  }, [envId, variantId]);

  // Menu preview follows the selection (debounced so arrowing through cards is cheap).
  useEffect(() => {
    if (!engine || context !== 'menu') return;
    const t = window.setTimeout(() => void engine.showMenu(envId, variantId), 380);
    return () => window.clearTimeout(t);
  }, [engine, envId, context, variantId]);

  // --- Actions ----------------------------------------------------------------
  const startDriving = useCallback(() => {
    if (!engine) return;
    engine.unlockAudio();
    setOverlay('none');
    setLeavingMenu(true);
    setContext('drive');
    window.setTimeout(() => {
      void engine.startDrive({ environmentId: envId, variantId }).then(() => setLeavingMenu(false));
    }, 260);
  }, [engine, envId, variantId]);

  const goToMenu = useCallback(() => {
    if (!engine) return;
    setOverlay('none');
    setContext('menu');
    engine.returnToMenu();
  }, [engine]);

  const pickEnvironmentInGame = useCallback(
    (id: EnvironmentId) => {
      if (!engine) return;
      setEnvId(id);
      const env = getEnvironment(id);
      const v = env.variants[0].id;
      setVariantId(v);
      setOverlay('none');
      void engine.changeEnvironment(id, v);
    },
    [engine],
  );

  const setVariant = useCallback(
    (id: string) => {
      setVariantId(id);
      if (context === 'drive') engine?.setVariant(id, 12);
    },
    [engine, context],
  );

  // --- Keyboard: Escape and first-gesture audio unlock --------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      engine?.unlockAudio();
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (e.code === 'KeyP' && (phase !== 'driving' || overlay !== 'none')) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (overlay !== 'none') {
        setOverlay('none');
        return;
      }
      if (phase === 'driving') engine?.pause();
      else if (phase === 'paused') engine?.resume();
    };
    const onPointer = () => engine?.unlockAudio();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [engine, phase, overlay]);

  // Losing focus while driving pauses (keys can't get stuck, and nothing runs unattended).
  useEffect(() => {
    const onBlur = () => {
      if (phase === 'driving') engine?.pause();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [engine, phase]);

  // --- Render -----------------------------------------------------------------
  const showMenu = context === 'menu' && (phase === 'menu' || phase === 'loading' || phase === 'boot');
  const showLoading = phase === 'loading' && context === 'drive';
  const driving = phase === 'driving';
  const paused = phase === 'paused';

  return (
    <div className={`app phase-${phase}`}>
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="vignette" aria-hidden="true" />

      {engine && (driving || paused) && (
        <GameHUD
          engine={engine}
          visible={settings.comfort.showHud && driving}
          units={settings.controls.units}
          showTime={settings.comfort.showDriveTime}
          onPause={() => engine.pause()}
          onCamera={() => engine.toggleCamera()}
        />
      )}
      {engine && driving && touch && <TouchControls engine={engine} />}
      {engine && settings.graphics.showPerformance && <PerformanceOverlay engine={engine} />}

      {showMenu && (
        <MainMenu
          environmentId={envId}
          variantId={variantId}
          previewLoading={phase === 'loading' || phase === 'boot'}
          leaving={leavingMenu}
          onSelect={(id) => {
            setEnvId(id);
            setVariantId(getEnvironment(id).variants[0].id);
          }}
          onVariant={setVariant}
          onStart={startDriving}
          onSettings={() => setOverlay('settings')}
          onControls={() => setOverlay('controls')}
        />
      )}

      {paused && overlay === 'none' && engine && (
        <PauseMenu
          environmentId={envId}
          variantId={variantId}
          seed={seed}
          camera={camera}
          onResume={() => engine.resume()}
          onRestart={() => void engine.restart(false)}
          onNewRoad={() => void engine.restart(true)}
          onChangeEnvironment={() => setOverlay('environments')}
          onCamera={() => engine.toggleCamera()}
          onVariant={setVariant}
          onSettings={() => setOverlay('settings')}
          onControls={() => setOverlay('controls')}
          onMainMenu={goToMenu}
        />
      )}

      {overlay === 'settings' && (
        <div className="overlay">
          <SettingsMenu settings={settings} onChange={setSettings} onClose={() => setOverlay('none')} />
        </div>
      )}
      {overlay === 'controls' && (
        <div className="overlay" onClick={() => setOverlay('none')}>
          <section className="panel controls-panel" aria-label="Controls" onClick={(e) => e.stopPropagation()}>
            <header className="panel-header">
              <h2>Controls</h2>
              <button type="button" className="icon-btn" onClick={() => setOverlay('none')} aria-label="Close controls">
                ✕
              </button>
            </header>
            <ControlsGuide touch={touch} />
          </section>
        </div>
      )}
      {overlay === 'environments' && (
        <div className="overlay">
          <section className="panel env-panel" aria-label="Change environment">
            <header className="panel-header">
              <h2>Change environment</h2>
              <button type="button" className="icon-btn" onClick={() => setOverlay('none')} aria-label="Close">
                ✕
              </button>
            </header>
            <EnvironmentSelector
              selectedId={envId}
              variantId={variantId}
              onSelect={pickEnvironmentInGame}
              onVariant={(id) => {
                setVariant(id);
                setOverlay('none');
              }}
            />
          </section>
        </div>
      )}

      {showLoading && <LoadingScreen progress={loading.progress} label={loading.label} />}
      <div className={`fade${fade ? ' is-on' : ''}`} aria-hidden="true" />

      {error && (
        <div className="error-screen" role="alert">
          <img src={`${import.meta.env.BASE_URL}branding/logo.svg`} alt="Elsewhere" width={320} height={73} />
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
