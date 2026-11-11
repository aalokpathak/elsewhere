import type { EnvironmentId } from '../config/environments';
import { getEnvironment } from '../config/environments';
import { EnvironmentSelector } from './EnvironmentSelector';

interface Props {
  environmentId: EnvironmentId;
  variantId: string | null;
  previewLoading: boolean;
  loadingProgress: number;
  leaving: boolean;
  /** Shared road number from a link, if any. */
  sharedSeed: number | null;
  totalKm: number;
  units: 'kmh' | 'mph';
  onSelect: (id: EnvironmentId) => void;
  onVariant: (id: string) => void;
  onStart: () => void;
  onSettings: () => void;
  onControls: () => void;
}

/**
 * The main menu floats over a live, autopiloted drive through the selected
 * environment — the background is the real game engine, not a picture.
 */
export function MainMenu(p: Props) {
  const env = getEnvironment(p.environmentId);
  const distance = p.units === 'mph' ? `${Math.round(p.totalKm * 0.621371)} miles` : `${Math.round(p.totalKm)} km`;
  return (
    <div className={`main-menu${p.leaving ? ' is-leaving' : ''}`}>
      <div className="menu-scrim" />
      <div className="menu-column">
        <header className="menu-brand">
          <img src={`${import.meta.env.BASE_URL}branding/logo.svg`} alt="Elsewhere" className="menu-logo" width={420} height={96} />
          <p className="menu-tagline">Somewhere between here and nowhere.</p>
        </header>

        <div className="menu-primary">
          <button type="button" className="btn btn-primary btn-large" onClick={p.onStart}>
            Start Driving
          </button>
          <span className="menu-destination">
            {env.name}
            {p.sharedSeed !== null && <span className="menu-shared">shared road #{p.sharedSeed}</span>}
          </span>
        </div>

        <section className="menu-section" aria-label="Choose where to drive">
          <h2 className="section-title">Where to</h2>
          <EnvironmentSelector
            selectedId={p.environmentId}
            variantId={p.variantId}
            onSelect={p.onSelect}
            onVariant={p.onVariant}
            onConfirm={p.onStart}
          />
        </section>

        <nav className="menu-links">
          <button type="button" className="btn btn-ghost" onClick={p.onSettings}>
            Settings
          </button>
          <button type="button" className="btn btn-ghost" onClick={p.onControls}>
            Controls
          </button>
        </nav>
        <p className="menu-footnote">
          No goals. No timer. Drive for as long as you like.
          {p.totalKm >= 1 && <span> You have driven {distance} so far.</span>}
        </p>
      </div>
      {p.previewLoading && (
        <div className="menu-loading" role="status" aria-live="polite">
          <span>Generating the road…</span>
          <span className="menu-loading-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.max(0.03, Math.min(1, p.loadingProgress))})` }} />
          </span>
        </div>
      )}
    </div>
  );
}
