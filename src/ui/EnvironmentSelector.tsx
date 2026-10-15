import { useMemo, useRef, type KeyboardEvent } from 'react';
import { ENVIRONMENTS, getEnvironment, type EnvironmentId } from '../config/environments';
import { environmentThumbnail } from './envThumbnails';

interface Props {
  selectedId: EnvironmentId;
  variantId: string | null;
  onSelect: (id: EnvironmentId) => void;
  onVariant: (variantId: string) => void;
  /** Called on double-click / Enter on the already-selected card. */
  onConfirm?: () => void;
}

export function EnvironmentSelector({ selectedId, variantId, onSelect, onVariant, onConfirm }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const thumbs = useMemo(() => new Map(ENVIRONMENTS.map((e) => [e.id, environmentThumbnail(e)])), []);
  const selected = getEnvironment(selectedId);
  const activeVariant = selected.variants.find((v) => v.id === variantId) ?? selected.variants[0];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = ENVIRONMENTS.findIndex((env) => env.id === selectedId);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(ENVIRONMENTS.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, idx - 1);
    else return;
    e.preventDefault();
    onSelect(ENVIRONMENTS[next].id);
    const btn = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next];
    btn?.focus();
  };

  return (
    <div className="env-selector">
      <div className="env-grid" role="radiogroup" aria-label="Environment" ref={listRef} onKeyDown={onKeyDown}>
        {ENVIRONMENTS.map((env) => {
          const active = env.id === selectedId;
          return (
            <button
              key={env.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              className={`env-card${active ? ' is-active' : ''}`}
              onClick={() => (active && onConfirm ? onConfirm() : onSelect(env.id))}
              onDoubleClick={() => onConfirm?.()}
            >
              <img src={thumbs.get(env.id)} alt="" draggable={false} />
              <span className="env-card-text">
                <span className="env-card-name">{env.name}</span>
                <span className="env-card-tag">{env.tagline}</span>
              </span>
              {(env.status === 'experimental' || env.category !== 'nature') && (
                <span className="env-tags">
                  {env.category !== 'nature' && <span className={`env-tag env-cat-${env.category}`}>{env.category}</span>}
                  {env.status === 'experimental' && <span className="env-tag">Experimental</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="env-detail">
        <p className="env-description">{selected.description}</p>
        <div className="variant-row" role="radiogroup" aria-label="Time and weather">
          {selected.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === activeVariant.id}
              className={`chip${v.id === activeVariant.id ? ' is-active' : ''}`}
              onClick={() => onVariant(v.id)}
            >
              <span className="chip-swatch" style={{ background: `linear-gradient(${v.skyZenith}, ${v.skyHorizon})` }} />
              {v.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
