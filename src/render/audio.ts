import type { GameEvent, GameState, SoundName } from '../game/state';
import { stormIntensity } from '../systems/hazards';

const MUTE_KEY = 'oxy8.muted';

/**
 * Sound effects, synthesised with Web Audio: no audio files to load.
 * The browser only allows audio after a user gesture, so call unlock() from a click or key press.
 */
export class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private beepTimer = 0;
  muted = readMuted();

  /** Create or resume the audio context. Safe to call often. */
  unlock(): void {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = makeNoise(this.ctx);
      this.startWind();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Not important.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  /** Plays sounds for this frame's events. Call before the renderer drains them. */
  handle(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'sound') this.play(e.name);
      else if (e.type === 'crater') this.play('impact');
    }
  }

  /** Continuous sounds: storm wind, low-oxygen warning beep. */
  update(state: GameState, dt: number, running: boolean): void {
    if (!this.ctx || !this.wind) return;
    const storm = running ? stormIntensity(state.hazards.storm) : 0;
    this.wind.gain.setTargetAtTime(storm * 0.35, this.ctx.currentTime, 0.3);
    if (running && state.status === 'playing' && state.oxygen < 25) {
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) {
        this.beepTimer = state.oxygen < 10 ? 0.5 : 0.9;
        this.tone(880, 0.07, 'square', 0.08);
      }
    } else {
      this.beepTimer = 0;
    }
  }

  play(name: SoundName | 'impact' | 'launch' | 'land-ship' | 'click'): void {
    if (!this.ctx) return;
    switch (name) {
      case 'pickup': this.tone(660, 0.06, 'square', 0.12); this.tone(990, 0.08, 'square', 0.1, 0.05); break;
      case 'part': this.arpeggio([392, 523, 659, 784], 0.07, 'square', 0.12); break;
      case 'supply': this.tone(300, 0.25, 'sine', 0.18, 0, 600); this.noise(0.25, 0.05, 2500); break;
      case 'install': this.arpeggio([262, 330, 392], 0.08, 'triangle', 0.18); this.noise(0.08, 0.08, 1200); break;
      case 'repaired': this.arpeggio([262, 330, 392, 523, 659, 784], 0.09, 'square', 0.13); break;
      case 'craft': this.noise(0.05, 0.12, 3000); this.tone(520, 0.08, 'square', 0.1, 0.06); this.tone(780, 0.1, 'square', 0.1, 0.13); break;
      case 'hurt': this.noise(0.3, 0.3, 900); this.tone(220, 0.3, 'sawtooth', 0.12, 0, 90); break;
      case 'bottle': this.noise(0.4, 0.12, 5000, 800); break;
      case 'beacon': this.tone(1200, 0.05, 'square', 0.08); this.tone(1200, 0.05, 'square', 0.08, 0.12); break;
      case 'deny': this.tone(160, 0.12, 'square', 0.1); break;
      case 'lamp': this.tone(1800, 0.02, 'square', 0.06); break;
      case 'pounce': this.tone(180, 0.25, 'triangle', 0.14, 0, 520); break;
      case 'land': this.tone(110, 0.12, 'sine', 0.25, 0, 50); this.noise(0.1, 0.1, 600); break;
      case 'storm-warning': this.noise(1.2, 0.08, 400, 1500); break;
      case 'impact': this.noise(0.6, 0.35, 500); this.tone(70, 0.5, 'sine', 0.3, 0, 30); break;
      case 'launch': this.noise(1.4, 0.2, 300, 3000); this.tone(80, 1.4, 'sawtooth', 0.1, 0, 400); break;
      case 'land-ship': this.noise(0.8, 0.2, 2000, 200); break;
      case 'click': this.tone(900, 0.03, 'square', 0.06); break;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private arpeggio(freqs: number[], step: number, type: OscillatorType, vol: number): void {
    freqs.forEach((f, i) => this.tone(f, step * 1.4, type, vol, i * step));
  }

  /** Filtered white noise; with `sweepTo` the filter glides, for whooshes. */
  private noise(dur: number, vol: number, filterFreq: number, sweepTo?: number): void {
    const { ctx, master, noiseBuffer } = this;
    if (!ctx || !master || !noiseBuffer) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  private startWind(): void {
    const { ctx, master, noiseBuffer } = this;
    if (!ctx || !master || !noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.8;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    src.connect(filter).connect(this.wind).connect(master);
    src.start();
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
