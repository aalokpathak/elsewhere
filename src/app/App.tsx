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
import { PhotoMode } from '../ui/PhotoMode';
import { SettingsMenu } from '../ui/SettingsMenu';
import { TouchControls } from '../ui/TouchControls';
import type { GamePhase } from './game-state';
import { buildShareUrl, parseShareParams } from './share';

type Overlay = 'none' | 'settings' | 'controls' | 'environments';

const coarsePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function toggleFullscreen(): void {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    }
  } catch {
    /* fullscreen is optional */
  }
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A shared link (?env=…&v=…&road=…) takes priority over the last-used place.
  const [shared] = useState(() => (typeof location !== 'undefined' ? parseShareParams(location.search) : null));
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [phase, setPhase] = useState<GamePhase>('boot');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [envId, setEnvId] = useState<EnvironmentId>(shared?.environmentId ?? settings.last.environmentId);
  const [variantId, setVariantId] = useState<string | null>(shared ? shared.variantId : settings.last.variantId);
  const [sharedSeed, setSharedSeed] = useState<number | null>(shared?.seed ?? null);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [loading, setLoading] = useState({ progress: 0, label: '' });
  const [context, setContext] = useState<'menu' | 'drive'>('menu');
  const [error, setError] = useState<string | null>(null);
  const [fade, setFade] = useState(false);
  const [live, setLive] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [camera, setCamera] = useState<CameraMode>(settings.last.camera);
  const [seed, setSeed] = useState<number | null>(null);
  const [touch, setTouch] = useState(coarsePointer);
  const [leavingMenu, setLeavingMenu] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const trip = useRef({ km: 0, minutes: 0, savedKm: 0, savedMinutes: 0 });
  const sharedRef = useRef(shared);

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
    // Adds the distance driven since the last save to the lifetime totals.
    const commitTrip = () => {
      const t = trip.current;
      const dKm = t.km - t.savedKm;
      const dMin = t.minutes - t.savedMinutes;
      if (dKm < 0.02 && dMin < 0.2) return;
      t.savedKm = t.km;
      t.savedMinutes = t.minutes;
      setSettings((s) => ({ ...s, stats: { totalKm: s.stats.totalKm + Math.max(0, dKm), totalMinutes: s.stats.totalMinutes + Math.max(0, dMin) } }));
    };
    const offs = [
      eng.on('phase', (p) => {
        const prev = lastPhase;
        lastPhase = p;
        setPhase(p);
        if (prev === 'driving') commitTrip();
        // Any route from a drive back to the menu (not only the menu button)
        // restores the menu UI. Preview loads finishing (loading → menu) don't.
        if (p === 'menu' && (prev === 'driving' || prev === 'paused')) {
          setContext('menu');
          setLeavingMenu(false);
        }
        const sel = eng.currentSelection;
        if (sel) setSeed(sel.seed ?? null);
      }),
      eng.on('hud', (h) => {
        const t = trip.current;
        // The odometer restarts with each drive.
        if (h.odometerKm < t.km) {
          t.savedKm = 0;
          t.savedMinutes = 0;
        }
        t.km = h.odometerKm;
        t.minutes = h.elapsed / 60;
      }),
      eng.on('loading', (l) => setLoading(l)),
      eng.on('error', (msg) => setError(msg)),
      eng.on('fade', (f) => setFade(f)),
      eng.on('live', (l) => setLive(l)),
      eng.on('photo', (on) => setPhoto(on)),
      eng.on('camera', (c) => {
        setCamera(c);
        if (c !== 'cinematic' && c !== 'photo') setSettings((s) => ({ ...s, last: { ...s.last, camera: c } }));
      }),
      eng.on('toggleHud', () => setSettings((s) => ({ ...s, comfort: { ...s.comfort, showHud: !s.comfort.showHud } }))),
      eng.on('variant', (v) => setVariantId(v)),
    ];
    setEngine(eng);
    const first = sharedRef.current;
    void eng.showMenu(
      first?.environmentId ?? settingsRef.current.last.environmentId,
      first ? first.variantId : settingsRef.current.last.variantId,
      first?.seed ?? undefined,
    );
    const onUnload = () => commitTrip();
    window.addEventListener('pagehide', onUnload);
    if (import.meta.env.DEV) {
      (window as unknown as { elsewhere?: GameEngine }).elsewhere = eng;
      void import('./devTools').then((m) => m.installDevTools(() => eng));
    }
    return () => {
      window.removeEventListener('pagehide', onUnload);
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
    const t = window.setTimeout(() => void engine.showMenu(envId, variantId, sharedSeed ?? undefined), 380);
    return () => window.clearTimeout(t);
  }, [engine, envId, context, variantId, sharedSeed]);

  // Touch pads appear on phones/tablets, or as soon as a touch is actually used.
  useEffect(() => {
    if (touch) return;
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouch(true);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [touch]);

  // --- Actions ----------------------------------------------------------------
  const startDriving = useCallback(() => {
    if (!engine) return;
    engine.unlockAudio();
    setOverlay('none');
    setLeavingMenu(true);
    setContext('drive');
    window.setTimeout(() => {
      void engine.startDrive({ environmentId: envId, variantId, seed: sharedSeed ?? undefined }).then(() => setLeavingMenu(false));
    }, 260);
  }, [engine, envId, variantId, sharedSeed]);

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
      const v = getEnvironment(id).variants[0].id;
      setVariantId(v);
      setSharedSeed(null);
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

  const copyLink = useCallback(async (): Promise<boolean> => {
    const sel = engine?.currentSelection;
    if (!sel) return false;
    const url = buildShareUrl(location.href, { environmentId: sel.environmentId, variantId: sel.variantId, seed: sel.seed });
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Clipboard can be blocked (permissions, insecure origin): fall back to a prompt.
      try {
        window.prompt('Copy this link:', url);
        return true;
      } catch {
        return false;
      }
    }
  }, [engine]);

  const toggleMute = useCallback(() => {
    setSettings((s) => {
      const muted = s.audio.master <= 0.001;
      return { ...s, audio: { ...s.audio, master: muted ? 0.8 : 0 } };
    });
  }, []);

  // --- Keyboard: Escape, fullscreen, mute and first-gesture audio unlock --------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      engine?.unlockAudio();
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyF' && !e.repeat) {
        toggleFullscreen();
        return;
      }
      if (e.code === 'KeyM' && !e.repeat) {
        toggleMute();
        return;
      }
      if (e.code === 'KeyV' && !e.repeat && phase === 'paused' && overlay === 'none') {
        if (photo) engine?.exitPhotoMode();
        else engine?.enterPhotoMode();
        return;
      }
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (e.code === 'KeyP' && (phase !== 'driving' || overlay !== 'none')) return;
      e.preventDefault();
      if (overlay !== 'none') {
        setOverlay('none');
        return;
      }
      if (photo) {
        engine?.exitPhotoMode();
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
  }, [engine, phase, overlay, photo, toggleMute]);

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
      <canvas ref={canvasRef} className={`game-canvas${live ? ' is-live' : ''}`} />
      <div className="vignette" aria-hidden="true" />

      {engine && (driving || paused) && (
        <GameHUD
          engine={engine}
          visible={settings.comfort.showHud && driving}
          units={settings.controls.units}
          showTime={settings.comfort.showDriveTime}
          onPause={() => engine.pause()}
          onPhoto={() => engine.enterPhotoMode()}
          onFullscreen={toggleFullscreen}
        />
      )}
      {engine && driving && touch && <TouchControls engine={engine} />}
      {engine && settings.graphics.showPerformance && <PerformanceOverlay engine={engine} />}

      {showMenu && (
        <MainMenu
          environmentId={envId}
          variantId={variantId}
          previewLoading={phase === 'loading' || phase === 'boot'}
          loadingProgress={loading.progress}
          leaving={leavingMenu}
          sharedSeed={sharedSeed}
          totalKm={settings.stats.totalKm}
          units={settings.controls.units}
          onSelect={(id) => {
            setEnvId(id);
            setVariantId(getEnvironment(id).variants[0].id);
            setSharedSeed(null);
          }}
          onVariant={setVariant}
          onStart={startDriving}
          onSettings={() => setOverlay('settings')}
          onControls={() => setOverlay('controls')}
        />
      )}

      {paused && photo && engine && (
        <PhotoMode engine={engine} fileName={`elsewhere-${envId}-${seed ?? 'road'}.png`} onClose={() => engine.exitPhotoMode()} />
      )}

      {paused && !photo && overlay === 'none' && engine && (
        <PauseMenu
          environmentId={envId}
          variantId={variantId}
          seed={seed}
          camera={camera}
          onResume={() => engine.resume()}
          onRestart={() => void engine.restart(false)}
          onNewRoad={() => {
            setSharedSeed(null);
            void engine.restart(true);
          }}
          onGoToRoad={(road) => {
            setSharedSeed(road);
            void engine.changeEnvironment(envId, variantId, road);
          }}
          onChangeEnvironment={() => setOverlay('environments')}
          onCamera={() => engine.cycleCamera()}
          onPhoto={() => engine.enterPhotoMode()}
          onCopyLink={copyLink}
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
