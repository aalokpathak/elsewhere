import { useState, type FormEvent } from 'react';
import { parseSeed } from '../app/share';
import { getEnvironment, type EnvironmentId } from '../config/environments';
import { CAMERA_LABELS, type CameraMode } from '../game/CameraController';

interface Props {
  environmentId: EnvironmentId;
  variantId: string | null;
  seed: number | null;
  camera: CameraMode;
  onResume: () => void;
  onRestart: () => void;
  onNewRoad: () => void;
  onGoToRoad: (seed: number) => void;
  onChangeEnvironment: () => void;
  onCamera: () => void;
  onPhoto: () => void;
  onCopyLink: () => Promise<boolean>;
  onVariant: (id: string) => void;
  onSettings: () => void;
  onControls: () => void;
  onMainMenu: () => void;
}

export function PauseMenu(p: Props) {
  const env = getEnvironment(p.environmentId);
  const [roadText, setRoadText] = useState('');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const typed = parseSeed(roadText);

  const submitRoad = (e: FormEvent) => {
    e.preventDefault();
    if (typed !== null) p.onGoToRoad(typed);
  };

  const copy = async () => {
    const ok = await p.onCopyLink();
    setCopied(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopied('idle'), 2200);
  };

  return (
    <div className="overlay pause-overlay">
      <section className="panel pause-panel" aria-label="Paused">
        <header className="pause-header">
          <img src={`${import.meta.env.BASE_URL}branding/logo-mark.svg`} alt="" className="pause-mark" width={40} height={40} />
          <div>
            <h2>Paused</h2>
            <p className="pause-sub">
              {env.name}
              {p.seed !== null && <span className="pause-seed"> · road #{p.seed}</span>}
            </p>
          </div>
        </header>
        <div className="pause-actions">
          <button type="button" className="btn btn-primary" onClick={p.onResume} autoFocus>
            Resume
          </button>
          <div className="pause-pair">
            <button type="button" className="btn" onClick={p.onRestart}>
              Restart this road
            </button>
            <button type="button" className="btn" onClick={p.onNewRoad}>
              New road
            </button>
          </div>
          <div className="pause-pair">
            <button type="button" className="btn" onClick={p.onCamera}>
              Camera: {CAMERA_LABELS[p.camera]}
            </button>
            <button type="button" className="btn" onClick={p.onPhoto}>
              Photo mode
            </button>
          </div>
          <button type="button" className="btn" onClick={p.onChangeEnvironment}>
            Change environment
          </button>
        </div>
        <div className="pause-variants">
          <h3 className="section-title">Time &amp; weather</h3>
          <div className="variant-row">
            {env.variants.map((v) => (
              <button key={v.id} type="button" className={`chip${v.id === p.variantId ? ' is-active' : ''}`} onClick={() => p.onVariant(v.id)}>
                <span className="chip-swatch" style={{ background: `linear-gradient(${v.skyZenith}, ${v.skyHorizon})` }} />
                {v.name}
              </button>
            ))}
          </div>
        </div>
        <div className="pause-share">
          <h3 className="section-title">This road</h3>
          <div className="share-row">
            <button type="button" className="btn" onClick={() => void copy()}>
              {copied === 'ok' ? 'Link copied ✓' : copied === 'fail' ? 'Copy failed' : 'Copy link to this road'}
            </button>
            <form className="road-form" onSubmit={submitRoad}>
              <input
                type="text"
                inputMode="numeric"
                className="text-input"
                placeholder="Road number"
                aria-label="Go to road number"
                value={roadText}
                onChange={(e) => setRoadText(e.target.value)}
              />
              <button type="submit" className="btn" disabled={typed === null}>
                Go
              </button>
            </form>
          </div>
        </div>
        <footer className="pause-footer">
          <button type="button" className="btn btn-ghost" onClick={p.onSettings}>
            Settings
          </button>
          <button type="button" className="btn btn-ghost" onClick={p.onControls}>
            Controls
          </button>
          <button type="button" className="btn btn-ghost" onClick={p.onMainMenu}>
            Main menu
          </button>
        </footer>
      </section>
    </div>
  );
}
