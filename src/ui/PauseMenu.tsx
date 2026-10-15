import { getEnvironment, type EnvironmentId } from '../config/environments';
import type { CameraMode } from '../game/CameraController';

interface Props {
  environmentId: EnvironmentId;
  variantId: string | null;
  seed: number | null;
  camera: CameraMode;
  onResume: () => void;
  onRestart: () => void;
  onNewRoad: () => void;
  onChangeEnvironment: () => void;
  onCamera: () => void;
  onVariant: (id: string) => void;
  onSettings: () => void;
  onControls: () => void;
  onMainMenu: () => void;
}

export function PauseMenu(p: Props) {
  const env = getEnvironment(p.environmentId);
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
          <button type="button" className="btn" onClick={p.onRestart}>
            Restart this road
          </button>
          <button type="button" className="btn" onClick={p.onNewRoad}>
            New road
          </button>
          <button type="button" className="btn" onClick={p.onChangeEnvironment}>
            Change environment
          </button>
          <button type="button" className="btn" onClick={p.onCamera}>
            Camera: {p.camera === 'cockpit' ? 'Cockpit' : 'Chase'}
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
