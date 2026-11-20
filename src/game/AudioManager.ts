import type { AmbienceLayer, AudioConfig, MusicMood } from '../world/environments/types';
import type { SurfaceKind } from './WorldManager';

/**
 * Fully procedural audio: every sound is synthesised with the Web Audio API,
 * so there are no files to download and nothing can 404. The context is
 * created lazily on the first user gesture (autoplay policy) and every level
 * change uses gain ramps to avoid clicks.
 */

export interface AudioVolumes {
  master: number;
  vehicle: number;
  ambience: number;
  music: number;
  horror: number;
}

export interface AudioFrame {
  speed: number;
  throttle: number;
  surface: SurfaceKind;
  wind: number;
  rain: number;
  braking: boolean;
  active: boolean;
}

export type HorrorSound = 'knock' | 'tone' | 'metal' | 'horn' | 'hum-drop';

interface Layer {
  gain: GainNode;
  stop: () => void;
  level: number;
}

const CHORDS: Record<MusicMood, number[][]> = {
  // MIDI note numbers.
  calm: [
    [48, 55, 59, 64, 67],
    [45, 52, 57, 60, 64],
    [41, 48, 52, 57, 64],
    [43, 50, 55, 59, 62],
  ],
  liminal: [
    [45, 52, 59, 60, 64],
    [41, 48, 55, 57, 59],
    [40, 47, 55, 59, 62],
    [38, 45, 53, 57, 64],
  ],
  dream: [
    [41, 48, 55, 59, 64],
    [43, 50, 57, 59, 66],
    [40, 47, 55, 59, 64],
    [45, 52, 57, 61, 64],
  ],
  night: [
    [40, 47, 55, 59, 62],
    [36, 43, 52, 55, 59],
    [38, 45, 53, 57, 60],
    [35, 42, 50, 54, 57],
  ],
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<keyof Omit<AudioVolumes, 'master'>, GainNode>;
  private ambienceDuck!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private volumes: AudioVolumes = { master: 0.8, vehicle: 0.6, ambience: 0.7, music: 0.35, horror: 0.6 };
  private layers = new Map<AmbienceLayer, Layer>();
  private config: AudioConfig | null = null;
  /** Soft electric-motor hum: two sines whose pitch rises gently with speed. */
  private motor: { low: OscillatorNode; high: OscillatorNode; highGain: GainNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  /** A quiet, rounded rush of air and road that grows with speed (same on every surface). */
  private air: { filter: BiquadFilterNode; gain: GainNode } | null = null;
  private rain: { gain: GainNode } | null = null;
  private musicTimer = 0;
  private musicMood: MusicMood = 'calm';
  private chordIndex = 0;
  private thunderTimer = 40;
  private vehicleActive = false;
  private disposed = false;

  get started(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture (click / key / touch). */
  async start(): Promise<void> {
    if (this.disposed) return;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignored: will retry on the next gesture */
      }
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    const bus = () => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { vehicle: bus(), ambience: bus(), music: bus(), horror: bus() };
    this.ambienceDuck = ctx.createGain();
    this.ambienceDuck.connect(this.buses.ambience);

    // Noise source material.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Generated reverb impulse.
    this.reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.2;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.buildVehicle();
    this.applyVolumes(0.5);
    this.master.gain.setTargetAtTime(this.volumes.master, ctx.currentTime, 0.6);
    if (this.config) this.setEnvironment(this.config);
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(0, Math.random() * 1.9);
    return src;
  }

  private buildVehicle(): void {
    const ctx = this.ctx!;
    // The car is electric: no engine, gears or exhaust. A soft, pure hum that
    // rises a little in pitch with speed is the only mechanical sound.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.3;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 90;
    const high = ctx.createOscillator();
    high.type = 'sine';
    high.frequency.value = 180;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.12;
    low.connect(filter);
    high.connect(highGain).connect(filter);
    filter.connect(gain).connect(this.buses.vehicle);
    low.start();
    high.start();
    this.motor = { low, high, highGain, filter, gain };

    // Gentle air and road rush. Low-passed so it reads as a soft "shhh",
    // never a hiss, and identical on asphalt, grass, sand or concrete.
    const airSrc = this.noiseSource();
    const af = ctx.createBiquadFilter();
    af.type = 'lowpass';
    af.frequency.value = 260;
    af.Q.value = 0.2;
    const ag = ctx.createGain();
    ag.gain.value = 0;
    airSrc.connect(af).connect(ag).connect(this.buses.vehicle);
    this.air = { filter: af, gain: ag };

    // Rain on the roof and road.
    const rainSrc = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rainSrc.connect(hp).connect(lp).connect(rg).connect(this.ambienceDuck);
    this.rain = { gain: rg };
  }

  setVolumes(v: AudioVolumes): void {
    this.volumes = { ...v };
    if (this.ctx) this.applyVolumes(0.15);
  }

  private applyVolumes(tc: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, tc);
    this.buses.vehicle.gain.setTargetAtTime(this.vehicleActive ? this.volumes.vehicle : 0, t, tc);
    this.buses.ambience.gain.setTargetAtTime(this.volumes.ambience, t, tc);
    this.buses.music.gain.setTargetAtTime(this.volumes.music * 0.5, t, tc);
    this.buses.horror.gain.setTargetAtTime(this.volumes.horror, t, tc);
  }

  /** Vehicle sounds only play while actually driving (not in menus or pause). */
  setVehicleActive(active: boolean): void {
    this.vehicleActive = active;
    if (this.ctx) this.buses.vehicle.gain.setTargetAtTime(active ? this.volumes.vehicle : 0, this.ctx.currentTime, 0.25);
  }

  setEnvironment(config: AudioConfig): void {
    this.config = config;
    this.musicMood = config.music;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.reverbSend.gain.setTargetAtTime(0.12 + config.reverb * 0.5, now, 1);
    // Fade out layers no longer wanted.
    for (const [name, layer] of this.layers) {
      const want = config.layers[name] ?? 0;
      if (want <= 0) {
        layer.gain.gain.setTargetAtTime(0, now, 0.8);
        const stop = layer.stop;
        window.setTimeout(stop, 4000);
        this.layers.delete(name);
      } else {
        layer.level = want;
        layer.gain.gain.setTargetAtTime(want, now, 1.2);
      }
    }
    for (const [name, level] of Object.entries(config.layers) as [AmbienceLayer, number][]) {
      if (!level || this.layers.has(name)) continue;
      const layer = this.createLayer(name);
      if (!layer) continue;
      layer.level = level;
      layer.gain.gain.setValueAtTime(0, now);
      layer.gain.gain.setTargetAtTime(level, now, 1.5);
      this.layers.set(name, layer);
    }
  }

  private lfo(freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine'): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    return o;
  }

  private createLayer(name: AmbienceLayer): Layer | null {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.connect(this.ambienceDuck);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    out.connect(send).connect(this.reverbSend);
    const stoppers: (() => void)[] = [];
    const src = (node: AudioScheduledSourceNode) => stoppers.push(() => node.stop());
    const timer = (fn: () => void, min: number, max: number) => {
      // One pending timeout per scheduler; the stopper always clears the latest.
      let id = 0;
      let alive = true;
      const loop = () => {
        if (!alive || !this.ctx) return;
        if (this.ctx.state === 'running') fn();
        id = window.setTimeout(loop, (min + Math.random() * (max - min)) * 1000);
      };
      id = window.setTimeout(loop, (min + Math.random() * (max - min)) * 500);
      stoppers.push(() => {
        alive = false;
        window.clearTimeout(id);
      });
    };

    switch (name) {
      case 'wind': {
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 420;
        f.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.value = 0.14;
        src(this.lfo(0.07, 0.07, g.gain));
        src(this.lfo(0.05, 160, f.frequency));
        n.connect(f).connect(g).connect(out);
        src(n);
        break;
      }
      case 'ocean': {
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 520;
        const g = ctx.createGain();
        g.gain.value = 0.22;
        src(this.lfo(0.11, 0.17, g.gain));
        src(this.lfo(0.11, 260, f.frequency));
        n.connect(f).connect(g).connect(out);
        src(n);
        const spray = this.noiseSource();
        const hf = ctx.createBiquadFilter();
        hf.type = 'highpass';
        hf.frequency.value = 2500;
        const hg = ctx.createGain();
        hg.gain.value = 0.02;
        src(this.lfo(0.11, 0.018, hg.gain));
        spray.connect(hf).connect(hg).connect(out);
        src(spray);
        break;
      }
      case 'forest': {
        const n = this.noiseSource();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2600;
        f.Q.value = 0.35;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        src(this.lfo(0.17, 0.035, g.gain));
        n.connect(f).connect(g).connect(out);
        src(n);
        timer(() => this.bird(out, 0.5), 3, 11);
        break;
      }
      case 'birds':
        timer(() => this.bird(out, 1), 1.2, 5.5);
        break;
      case 'crickets': {
        for (const [freq, rate, pan] of [[4300, 0.9, -0.6], [4720, 1.3, 0.5]] as [number, number, number][]) {
          const o = ctx.createOscillator();
          o.frequency.value = freq;
          const am = ctx.createGain();
          am.gain.value = 0;
          src(this.lfo(28, 0.5, am.gain, 'square'));
          const pulse = ctx.createGain();
          pulse.gain.value = 0.012;
          src(this.lfo(rate, 0.012, pulse.gain, 'square'));
          const p = ctx.createStereoPanner();
          p.pan.value = pan;
          o.connect(am).connect(pulse).connect(p).connect(out);
          o.start();
          src(o);
        }
        break;
      }
      case 'hum': {
        for (const [f, g] of [[60, 0.05], [120, 0.035], [180, 0.012], [240, 0.008]]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const gg = ctx.createGain();
          gg.gain.value = g;
          o.connect(gg).connect(out);
          o.start();
          src(o);
        }
        const n = this.noiseSource();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 120;
        bp.Q.value = 12;
        const ng = ctx.createGain();
        ng.gain.value = 0.25;
        n.connect(bp).connect(ng).connect(out);
        src(n);
        break;
      }
      case 'mechanical': {
        const n = this.noiseSource();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 90;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        src(this.lfo(0.03, 0.12, g.gain));
        n.connect(lp).connect(g).connect(out);
        src(n);
        timer(() => this.clank(out), 9, 26);
        break;
      }
      case 'traffic': {
        const n = this.noiseSource();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 170;
        const g = ctx.createGain();
        g.gain.value = 0.28;
        src(this.lfo(0.021, 0.18, g.gain));
        n.connect(lp).connect(g).connect(out);
        src(n);
        break;
      }
      case 'drone': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        src(this.lfo(0.04, 260, lp.frequency));
        for (const f of [55, 82.6, 110.4, 164.2]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = 0.045;
          o.connect(g).connect(lp);
          o.start();
          src(o);
        }
        lp.connect(out);
        break;
      }
      case 'insects': {
        const n = this.noiseSource();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 6200;
        bp.Q.value = 6;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        src(this.lfo(0.3, 0.04, g.gain));
        n.connect(bp).connect(g).connect(out);
        src(n);
        break;
      }
    }
    return {
      gain: out,
      level: 0,
      stop: () => {
        for (const s of stoppers) {
          try {
            s();
          } catch {
            /* already stopped */
          }
        }
        out.disconnect();
      },
    };
  }

  private bird(out: AudioNode, level: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 2400;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(out);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = t0 + i * (0.11 + Math.random() * 0.08);
      const dur = 0.06 + Math.random() * 0.08;
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.3), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018 * level, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private clank(out: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.02;
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500 + Math.random() * 900;
    bp.Q.value = 25;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    n.connect(bp).connect(g).connect(pan).connect(out);
    n.stop(t + 1.7);
  }

  /** Called every frame while a world is running. */
  update(dt: number, f: AudioFrame): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.motor || !this.air || !this.rain) return;
    const t = this.ctx.currentTime;
    const kmh = Math.abs(f.speed) * 3.6;
    const sp = Math.min(1, kmh / 120);
    // Hum: barely there when cruising, a touch fuller while accelerating.
    // Slow time constants keep every change smooth.
    const pitch = 82 + Math.min(kmh, 160) * 1.15;
    this.motor.low.frequency.setTargetAtTime(pitch, t, 0.35);
    this.motor.high.frequency.setTargetAtTime(pitch * 2.002, t, 0.35);
    this.motor.highGain.gain.setTargetAtTime(0.06 + f.throttle * 0.08, t, 0.4);
    this.motor.filter.frequency.setTargetAtTime(420 + sp * 380, t, 0.5);
    const moving = Math.min(1, kmh / 6);
    const hum = f.active ? (0.018 + sp * 0.014 + f.throttle * 0.012) * moving : 0;
    this.motor.gain.gain.setTargetAtTime(hum, t, 0.45);
    this.air.filter.frequency.setTargetAtTime(220 + sp * 260, t, 0.6);
    this.air.gain.gain.setTargetAtTime(f.active ? sp * sp * 0.075 : 0, t, 0.6);
    this.rain.gain.gain.setTargetAtTime(f.rain * 0.3, t, 1.5);

    // Environment wind follows the weather.
    const wind = this.layers.get('wind');
    if (wind) wind.gain.gain.setTargetAtTime(wind.level * (0.45 + f.wind * 0.9), t, 2);

    if (f.rain > 0.6) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = 35 + Math.random() * 60;
        this.thunder();
      }
    }

    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 13 + Math.random() * 5;
      if (this.volumes.music > 0.001) this.playChord();
    }
  }

  private playChord(): void {
    const ctx = this.ctx!;
    const chords = CHORDS[this.musicMood];
    const chord = chords[this.chordIndex++ % chords.length];
    const t = ctx.currentTime + 0.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.value = 1;
    lp.connect(g);
    g.connect(this.buses.music);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    g.connect(send).connect(this.reverbSend);
    for (const n of chord) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n) * (1 + (Math.random() - 0.5) * 0.003);
      const v = ctx.createGain();
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(0.022, t + 4.5);
      v.gain.setValueAtTime(0.022, t + 10);
      v.gain.linearRampToValueAtTime(0, t + 17);
      o.connect(v).connect(lp);
      o.start(t);
      o.stop(t + 17.5);
    }
    // An occasional soft bell note on top.
    if (Math.random() < 0.6) {
      const n = chord[2 + Math.floor(Math.random() * 3)] + 12;
      const o = ctx.createOscillator();
      o.frequency.value = midi(n);
      const v = ctx.createGain();
      const bt = t + 2 + Math.random() * 6;
      v.gain.setValueAtTime(0, bt);
      v.gain.linearRampToValueAtTime(0.03, bt + 0.02);
      v.gain.exponentialRampToValueAtTime(0.0001, bt + 3.5);
      o.connect(v).connect(g);
      o.start(bt);
      o.stop(bt + 3.6);
    }
  }

  private thunder(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.1;
    const n = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    n.connect(lp).connect(g).connect(this.ambienceDuck);
    g.connect(this.reverbSend);
    n.stop(t + 6.2);
  }

  /** Quiet, distant one-shots for the optional liminal events. */
  playHorror(kind: HorrorSound, pan = 0): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const out = ctx.createGain();
    out.gain.value = 0.9;
    p.connect(out).connect(this.buses.horror);
    const wet = ctx.createGain();
    wet.gain.value = 1.2;
    out.connect(wet).connect(this.reverbSend);
    const end = (s: AudioScheduledSourceNode, at: number) => s.stop(at);
    switch (kind) {
      case 'knock':
        for (let i = 0; i < 3; i++) {
          const tt = t + i * 0.42 + (i === 2 ? 0.25 : 0);
          const o = ctx.createOscillator();
          o.frequency.setValueAtTime(95, tt);
          o.frequency.exponentialRampToValueAtTime(48, tt + 0.18);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.25, tt + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.3);
          o.connect(g).connect(p);
          o.start(tt);
          end(o, tt + 0.35);
        }
        break;
      case 'tone':
        for (const f of [98, 98.9, 146.8]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.03, t + 3);
          g.gain.linearRampToValueAtTime(0, t + 7);
          o.connect(g).connect(p);
          o.start(t);
          end(o, t + 7.2);
        }
        break;
      case 'metal': {
        const n = this.noiseSource();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 40;
        bp.frequency.setValueAtTime(700, t);
        bp.frequency.linearRampToValueAtTime(560, t + 3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.9, t + 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        n.connect(bp).connect(g).connect(p);
        end(n, t + 3.6);
        break;
      }
      case 'horn':
        for (const f of [349, 440]) {
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = f;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 700;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.03, t + 0.04);
          g.gain.setValueAtTime(0.03, t + 0.55);
          g.gain.linearRampToValueAtTime(0, t + 0.7);
          o.connect(lp).connect(g).connect(p);
          o.start(t);
          end(o, t + 0.8);
        }
        break;
      case 'hum-drop': {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 2.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        o.connect(g).connect(p);
        o.start(t);
        end(o, t + 2.7);
        break;
      }
    }
  }

  /** Fades the environment ambience almost to silence for a while. */
  duckAmbience(seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ambienceDuck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.04, t + 2.5);
    g.setValueAtTime(0.04, t + 2.5 + seconds);
    g.linearRampToValueAtTime(1, t + 8 + seconds);
  }

  /** A soft two-note horn. */
  playHorn(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.03);
    g.gain.setValueAtTime(0.07, t + 0.3);
    g.gain.linearRampToValueAtTime(0, t + 0.5);
    lp.connect(g).connect(this.buses.vehicle);
    g.connect(this.reverbSend);
    for (const f of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.55);
    }
  }

  /**
   * Only the soft water swash remains. Bumps, scrapes and surface changes are
   * deliberately silent so the drive keeps one calm, continuous sound.
   */
  playOneShot(kind: 'splash'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    void kind;
    f.type = 'lowpass';
    f.frequency.value = 520;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    n.connect(f).connect(g).connect(this.buses.vehicle);
    n.stop(t + 1.7);
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      try {
        await this.ctx.suspend();
      } catch {
        /* ignore */
      }
    }
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const layer of this.layers.values()) layer.stop();
    this.layers.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
