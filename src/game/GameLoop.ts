/**
 * A single requestAnimationFrame loop. `start()` is idempotent, so there can
 * never be two loops running at once; delta time is clamped so a tab that was
 * hidden for minutes does not produce one enormous simulation step.
 */
export class GameLoop {
  private rafId: number | null = null;
  private last = 0;
  private elapsed = 0;

  constructor(private readonly onFrame: (dt: number, time: number) => void) {}

  get running(): boolean {
    return this.rafId !== null;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.elapsed += dt;
    this.onFrame(dt, this.elapsed);
  };
}
