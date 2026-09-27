import { CONFIG } from '../config';
import { isFor, localPlayer, type GameEvent, type GameState, type SoundName } from '../game/state';
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
  private bombBeepTimer = 0;
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

  /** The audio context and master output, once audio is unlocked. Music plugs in here. */
  output(): { ctx: AudioContext; master: GainNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, master: this.master } : null;
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
  /** Plays the sounds in this frame's events; sounds for another player are left out. */
  handle(events: readonly GameEvent[], viewer = 0): void {
    for (const e of events) {
      if (!isFor(e, viewer)) continue;
      if (e.type === 'sound') this.play(e.name);
      else if (e.type === 'crater') this.play('impact');
    }
  }

  /** Continuous sounds: storm wind, low-oxygen warning beep. */
  update(state: GameState, dt: number, running: boolean): void {
    const me = localPlayer(state);
    if (!this.ctx || !this.wind) return;
    const storm = running ? stormIntensity(state.hazards.storm) : 0;
    this.wind.gain.setTargetAtTime(storm * 0.35, this.ctx.currentTime, 0.3);
    if (running && state.status === 'playing' && me.oxygen < 25) {
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) {
        this.beepTimer = me.oxygen < 10 ? 0.5 : 0.9;
        this.tone(880, 0.07, 'square', 0.08);
      }
    } else {
      this.beepTimer = 0;
    }
    this.updateBombBeep(state, dt, running);
  }

  /** A faint, high beep near someone else's bomb, faster the closer you get. */
  private updateBombBeep(state: GameState, dt: number, running: boolean): void {
    const B = CONFIG.race.bomb;
    const me = localPlayer(state);
    let nearest = Infinity;
    for (const bomb of state.race?.bombs ?? []) {
      if (bomb.owner !== me.id) nearest = Math.min(nearest, Math.hypot(me.x - bomb.x, me.y - bomb.y));
    }
    if (!running || state.status !== 'playing' || nearest > B.beepRange) {
      this.bombBeepTimer = 0;
      return;
    }
    this.bombBeepTimer -= dt;
    if (this.bombBeepTimer <= 0) {
      const closeness = 1 - nearest / B.beepRange;
      this.bombBeepTimer = B.beepSlow + (B.beepFast - B.beepSlow) * closeness;
      this.tone(2400, 0.03, 'sine', 0.035 + 0.04 * closeness);
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
      case 'slide': this.noise(0.9, 0.12, 6000, 900); this.tone(700, 0.4, 'triangle', 0.06, 0, 350); break;
      case 'bomb-place': this.tone(300, 0.05, 'square', 0.08); this.tone(240, 0.06, 'square', 0.08, 0.07); break;
      case 'bomb-armed': this.tone(1600, 0.04, 'square', 0.06); this.tone(1600, 0.04, 'square', 0.06, 0.09); this.tone(2100, 0.06, 'square', 0.06, 0.18); break;
      case 'bomb-defused': this.arpeggio([784, 659, 523], 0.06, 'triangle', 0.12); break;
      case 'explosion': this.noise(1.1, 0.45, 700); this.tone(60, 0.9, 'sine', 0.35, 0, 25); this.tone(140, 0.4, 'sawtooth', 0.12, 0, 40); break;
      case 'drop': this.noise(0.8, 0.25, 1800, 200); this.tone(90, 0.6, 'sine', 0.3, 0.5, 40); break;
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
