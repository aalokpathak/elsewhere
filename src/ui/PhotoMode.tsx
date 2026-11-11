import { useState } from 'react';
import type { GameEngine } from '../game/GameEngine';

interface Props {
  engine: GameEngine;
  fileName: string;
  onClose: () => void;
}

/**
 * Photo mode: the drive is frozen, the camera orbits freely (drag, scroll or
 * the sliders) and the view can be saved as a high-resolution PNG.
 */
export function PhotoMode({ engine, fileName, onClose }: Props) {
  const initial = engine.photoSettings;
  const [fov, setFov] = useState(initial.fov);
  const [distance, setDistance] = useState(Math.round(initial.distance * 10) / 10);
  const [hidden, setHidden] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const url = engine.capturePhoto(2560);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  if (hidden) {
    return (
      <button type="button" className="photo-reveal" onClick={() => setHidden(false)} aria-label="Show photo controls">
        Show controls
      </button>
    );
  }

  return (
    <div className="photo-bar" role="toolbar" aria-label="Photo mode">
      <span className="photo-title">Photo mode</span>
      <span className="photo-hint">Drag to orbit · scroll to zoom</span>
      <label className="photo-field">
        <span>Zoom</span>
        <input
          type="range"
          min={2.6}
          max={40}
          step={0.2}
          value={Math.min(40, distance)}
          onChange={(e) => {
            const v = Number(e.target.value);
            setDistance(v);
            engine.setPhotoDistance(v);
          }}
          aria-label="Camera distance"
        />
      </label>
      <label className="photo-field">
        <span>Lens</span>
        <input
          type="range"
          min={18}
          max={95}
          step={1}
          value={fov}
          onChange={(e) => {
            const v = Number(e.target.value);
            setFov(v);
            engine.setPhotoFov(v);
          }}
          aria-label="Field of view"
        />
      </label>
      <button type="button" className="btn btn-ghost" onClick={() => setHidden(true)}>
        Hide
      </button>
      <button type="button" className="btn btn-primary" onClick={save}>
        {saved ? 'Saved ✓' : 'Save photo'}
      </button>
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
