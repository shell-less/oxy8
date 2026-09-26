import { THEMES, type Theme } from './themes';

export interface PlanetDef {
  name: string;
  /** Fixed seed: every player gets exactly the same planet. */
  seed: number;
  theme: Theme;
  partsNeeded: number;
  /** Supply bunkers that hold a one-time energy cell. */
  energyCells: number;
}

/**
 * The fixed planet order. The first planet needs 3 parts, later ones 5.
 * New planets go at the end and should be a bit harder than the one before.
 * The green theme (toxic pools) is ready for planet 4.
 */
export const PLANETS: readonly PlanetDef[] = [
  { name: 'Kepler-442', seed: 442, theme: THEMES.red, partsNeeded: 3, energyCells: 3 },
  { name: 'Nereid-117', seed: 117, theme: THEMES.blue, partsNeeded: 5, energyCells: 4 },
  { name: 'Umbra-9', seed: 9, theme: THEMES.purple, partsNeeded: 5, energyCells: 4 },
];
