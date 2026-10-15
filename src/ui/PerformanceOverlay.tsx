import { useEffect, useRef } from 'react';
import type { GameEngine } from '../game/GameEngine';

/** Small debug readout; updated directly from the engine at 2 Hz. */
export function PerformanceOverlay({ engine }: { engine: GameEngine }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(
    () =>
      engine.on('perf', (p) => {
        if (!ref.current) return;
        ref.current.textContent =
          `${p.fps.toFixed(0)} fps  ${p.frameMs.toFixed(1)} ms  ×${p.pixelRatio.toFixed(2)}\n` +
          `draws ${p.drawCalls}  tris ${(p.triangles / 1000).toFixed(0)}k\n` +
          `chunks ${p.chunks} (+${p.pendingChunks})  segs ${p.segments}\n` +
          `instances ${p.instances}  geo ${p.geometries}  tex ${p.textures}`;
      }),
    [engine],
  );
  return <pre className="perf-overlay" ref={ref} aria-hidden="true" />;
}
