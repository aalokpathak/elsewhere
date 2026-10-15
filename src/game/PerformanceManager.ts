/**
 * Frame-time statistics and (optional) adaptive render resolution.
 *
 * Resolution only changes after a sustained trend — several seconds of
 * averaged frame rate — never because of one slow frame, and changes are
 * rate-limited so the image does not "breathe".
 */
export class PerformanceManager {
  fps = 60;
  frameMs = 16.7;
  private windowTime = 0;
  private windowFrames = 0;
  private history: number[] = [];
  private cooldown = 4;
  /** Current dynamic multiplier on the user's resolution scale. */
  dynamicScale = 1;
  adaptive = true;
  minScale = 0.6;

  /** Returns true when the dynamic scale changed. */
  frame(dt: number): boolean {
    this.windowTime += dt;
    this.windowFrames++;
    this.frameMs = this.frameMs * 0.9 + dt * 1000 * 0.1;
    if (this.windowTime < 0.5) return false;
    this.fps = this.windowFrames / this.windowTime;
    this.windowTime = 0;
    this.windowFrames = 0;
    this.history.push(this.fps);
    if (this.history.length > 20) this.history.shift();
    this.cooldown -= 0.5;
    if (!this.adaptive || this.cooldown > 0 || this.history.length < 10) return false;
    const recent = this.history.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (avg < 42 && this.dynamicScale > this.minScale) {
      this.dynamicScale = Math.max(this.minScale, this.dynamicScale - 0.1);
      this.cooldown = 6;
      return true;
    }
    const long = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    if (this.history.length >= 20 && long > 57 && this.dynamicScale < 1) {
      this.dynamicScale = Math.min(1, this.dynamicScale + 0.05);
      this.cooldown = 10;
      return true;
    }
    return false;
  }

  /** Clears history (after loading or a tab switch the numbers are meaningless). */
  reset(): void {
    this.history = [];
    this.windowTime = 0;
    this.windowFrames = 0;
    this.cooldown = 4;
  }
}
