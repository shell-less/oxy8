import { CONFIG } from '../config';

/** In-game hour (0-24) for a time in seconds since landing on day 1 at 00:00. */
export function hourOf(time: number): number {
  const day = CONFIG.day.lengthSeconds;
  return (((time % day) + day) % day) / day * 24;
}

export function dayOf(time: number): number {
  return Math.floor(time / CONFIG.day.lengthSeconds) + 1;
}

/** Darkness 0..maxDarkness. Full light 07-18, dusk 18-21, night 21-04, dawn 04-07. */
export function darknessAt(hour: number): number {
  const max = CONFIG.day.maxDarkness;
  if (hour >= 7 && hour < 18) return 0;
  if (hour >= 18 && hour < 21) return ((hour - 18) / 3) * max;
  if (hour >= 21 || hour < 4) return max;
  return ((7 - hour) / 3) * max;
}

/** 0..1 where 1 is full night, useful for scaling night-only effects. */
export function nightFactor(hour: number): number {
  return darknessAt(hour) / CONFIG.day.maxDarkness;
}

export function formatClock(time: number): string {
  const h = hourOf(time);
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  return `Dag ${dayOf(time)} · ${hh}:${mm}`;
}
