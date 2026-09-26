/**
 * Background music, generated live with Web Audio: a soft pad, a bass note and a sparse
 * arpeggio with echo. Each mood (the title and every planet type) has its own key, scale,
 * tempo and colour. No audio files, so nothing to license or download.
 */

import type { ThemeId } from '../world/themes';

/** The title has its own music; every planet type (theme) has one too. */
export type Mood = 'title' | ThemeId;

interface MoodDef {
  /** Root note of the key in Hz (low octave). */
  root: number;
  /** Scale as semitones above the root. */
  scale: number[];
  /** Chord roots as scale degrees; each chord lasts two bars. */
  progression: number[];
  bpm: number;
  padWave: OscillatorType;
  arpWave: OscillatorType;
  /** Chance that an eighth note plays an arpeggio note. */
  density: number;
  /** Arpeggio octave above the root. */
  arpOctave: number;
  /** Pad brightness (low-pass cutoff in Hz) by day. */
  brightness: number;
}

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

export const MOODS: Record<Mood, MoodDef> = {
  // Wide and hopeful: D minor, i VI III VII.
  title: { root: 73.42, scale: MINOR, progression: [0, 5, 2, 6], bpm: 68, padWave: 'sawtooth', arpWave: 'triangle', density: 0.45, arpOctave: 3, brightness: 1400 },
  // Kepler-442, red dust: A dorian, a bit of drive.
  red: { root: 55, scale: DORIAN, progression: [0, 3, 0, 6], bpm: 84, padWave: 'sawtooth', arpWave: 'square', density: 0.55, arpOctave: 3, brightness: 1100 },
  // Nereid-117, ice: E minor, slow and glassy.
  blue: { root: 82.41, scale: MINOR, progression: [0, 5, 3, 4], bpm: 58, padWave: 'triangle', arpWave: 'sine', density: 0.35, arpOctave: 4, brightness: 2200 },
  // Umbra-9, purple craters: C phrygian, eerie.
  purple: { root: 65.41, scale: PHRYGIAN, progression: [0, 1, 0, 6], bpm: 70, padWave: 'sawtooth', arpWave: 'triangle', density: 0.3, arpOctave: 3, brightness: 900 },
  // Viridia, toxic green: G minor, restless.
  green: { root: 49, scale: MINOR, progression: [0, 3, 5, 4], bpm: 92, padWave: 'square', arpWave: 'square', density: 0.5, arpOctave: 3, brightness: 1000 },
};

const ARP_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];
const MUSIC_KEY = 'oxy8.music';
/** Music bus level: measured peaks around 0.06, below most sound effects. */
const LEVEL = 0.7;
const LOOKAHEAD = 0.25;

export class Music {
  enabled = readEnabled();
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private echo: GainNode | null = null;
  private mood: Mood = 'title';
  private pending: Mood | null = null;
  private switchAt = 0;
  private nextStep = 0;
  private step = 0;
  private darkness = 0;

  /** Connect to the sound board's output once audio is unlocked. */
  attach(ctx: AudioContext, destination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.bus);

    // A simple feedback delay gives the arpeggio its spacey echo.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.36;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    this.echo = ctx.createGain();
    this.echo.connect(this.bus);
    this.echo.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.bus);

    this.nextStep = ctx.currentTime + 0.1;
    this.fadeIn();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
    } catch {
      // Not important.
    }
    if (on) this.fadeIn();
    else this.fadeTo(0, 0.4);
  }

  /** Change the music. The old mood fades out, the new one fades in. */
  setMood(mood: Mood): void {
    if (!this.ctx) {
      this.mood = mood;
      return;
    }
    if (mood === (this.pending ?? this.mood)) return;
    this.pending = mood;
    this.switchAt = this.ctx.currentTime + 1.2;
    this.fadeTo(0, 0.35);
  }

  /** Call every frame. `darkness` (0..1) makes the pad darker at night; `quiet` ducks it in menus. */
  update(darkness: number, quiet: boolean): void {
    const { ctx } = this;
    if (!ctx || !this.bus || !this.padFilter) return;
    this.darkness = darkness;
    const now = ctx.currentTime;

    if (this.pending && now >= this.switchAt) {
      this.mood = this.pending;
      this.pending = null;
      this.step = 0;
      this.nextStep = now + 0.05;
      this.fadeIn();
    }
    if (!this.pending && this.enabled) this.bus.gain.setTargetAtTime(quiet ? LEVEL * 0.5 : LEVEL, now, 0.5);

    const def = MOODS[this.mood];
    this.padFilter.frequency.setTargetAtTime(def.brightness * (1 - 0.6 * this.darkness), now, 1);

    // If the tab was in the background, skip ahead instead of playing a burst of notes.
    if (this.nextStep < now - 0.5) this.nextStep = now + 0.05;
    const stepSeconds = 60 / def.bpm / 2;
    while (this.nextStep < now + LOOKAHEAD) {
      this.playStep(def, this.step, this.nextStep, stepSeconds);
      this.step++;
      this.nextStep += stepSeconds;
    }
  }

  private playStep(def: MoodDef, step: number, t: number, stepSeconds: number): void {
    const chordIndex = Math.floor(step / 16) % def.progression.length;
    const degree = def.progression[chordIndex];
    const chord = [0, 2, 4].map((i) => noteOf(def, degree + i, 1));

    if (step % 16 === 0) {
      const length = stepSeconds * 16;
      chord.forEach((f, i) => {
        this.pad(f, t, length, def.padWave, i === 0 ? 0.05 : 0.035, -6 + i * 6);
        this.pad(f * 1.004, t, length, def.padWave, 0.02, 7);
      });
      this.bass(noteOf(def, degree, 0), t, length);
    }

    const bar = step % 8;
    if (this.chance(step, def.density) || bar === 0) {
      const tone = ARP_PATTERN[bar];
      const lift = this.chance(step * 7 + 3, 0.2) ? 7 : 0;
      this.pluck(noteOf(def, degree + tone * 2 + lift, def.arpOctave), t, stepSeconds * 1.6, def.arpWave);
    }
  }

  /** Deterministic "random" per step, so a loop has a recognisable shape. */
  private chance(n: number, p: number): boolean {
    const x = Math.sin(n * 12.9898 + MOODS[this.mood].root) * 43758.5453;
    return x - Math.floor(x) < p;
  }

  private pad(freq: number, t: number, length: number, wave: OscillatorType, vol: number, detune: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const attack = Math.min(1.8, length * 0.3);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol, t + length - attack * 0.5);
    gain.gain.linearRampToValueAtTime(0.0001, t + length + attack);
    osc.connect(gain).connect(this.padFilter!);
    osc.start(t);
    osc.stop(t + length + attack + 0.05);
  }

  private bass(freq: number, t: number, length: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(this.bus!);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private pluck(freq: number, t: number, length: number, wave: OscillatorType): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    const vol = wave === 'square' ? 0.025 : 0.05;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(this.echo!);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private fadeIn(): void {
    if (this.enabled) this.fadeTo(LEVEL, 1.2);
  }

  private fadeTo(level: number, timeConstant: number): void {
    if (!this.ctx || !this.bus) return;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setTargetAtTime(level, this.ctx.currentTime, timeConstant);
  }
}

/** Frequency of a scale degree (may exceed the scale; wraps into higher octaves). */
export function noteOf(def: MoodDef, degree: number, octave: number): number {
  const n = def.scale.length;
  const wrapped = ((degree % n) + n) % n;
  const extraOctaves = Math.floor(degree / n);
  const semitones = def.scale[wrapped] + 12 * (octave + extraOctaves);
  return def.root * 2 ** (semitones / 12);
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(MUSIC_KEY) !== '0';
  } catch {
    return true;
  }
}
