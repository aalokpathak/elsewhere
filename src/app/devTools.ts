import type { GameEngine } from '../game/GameEngine';

/**
 * Development-only helpers for automated browser checks. Not included in
 * production builds (imported behind `import.meta.env.DEV`).
 *
 *   await __elsewhere.drive('Coastal', 'Sunset', 900)  // via the real menu UI
 *   __elsewhere.engine.debugState()
 */
export function installDevTools(getEngine: () => GameEngine | null): void {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const tools = {
    get engine() {
      return getEngine();
    },
    async drive(name: string, variant?: string | null, frames = 700, autopilot = true) {
      const e = getEngine();
      if (!e) throw new Error('engine not ready');
      if (!document.querySelector('.main-menu')) {
        e.pause();
        await wait(200);
        [...document.querySelectorAll('button')].find((b) => b.textContent === 'Main menu')?.click();
        await wait(400);
      }
      [...document.querySelectorAll<HTMLElement>('.env-card')].find((c) => c.textContent?.includes(name))?.click();
      await wait(300);
      if (variant) [...document.querySelectorAll<HTMLElement>('.chip')].find((c) => c.textContent?.includes(variant))?.click();
      await wait(200);
      document.querySelector<HTMLElement>('.menu-primary .btn-primary')?.click();
      for (let i = 0; i < 120 && e.currentPhase !== 'driving'; i++) await wait(150);
      await wait(500);
      e.debugAutopilot = autopilot;
      e.debugAdvance(frames, 1 / 60, autopilot ? undefined : { throttle: 1 });
      return { ...e.debugState(), app: document.querySelector('.app')?.className };
    },
    /** Long autopilot drive in slices; reports memory/instance counts over time. */
    async soak(km: number, dt = 1 / 30) {
      const e = getEngine();
      if (!e) throw new Error('engine not ready');
      e.debugAutopilot = true;
      const start = e.debugState().carS;
      const log = [];
      while (e.debugState().carS - start < km * 1000) {
        e.debugAdvance(600, dt);
        const s = e.debugState();
        log.push({ km: +((s.carS - start) / 1000).toFixed(2), geo: s.memory.geometries, tex: s.memory.textures, ...s.world });
        await wait(0);
      }
      return log;
    },
  };
  (window as unknown as { __elsewhere: typeof tools }).__elsewhere = tools;
}
