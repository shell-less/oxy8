import { THEMES, type Theme } from './themes';
import type { CreeperKind } from './types';

export interface PlanetDef {
  name: string;
  /** Fixed seed: every player gets exactly the same planet. */
  seed: number;
  theme: Theme;
  partsNeeded: number;
  /** Supply bunkers that hold a one-time energy cell. */
  energyCells: number;
  /**
   * Which kind of creeper guards the bunkers. Defaults to crawlers.
   * A list mixes kinds: guarded bunkers take them in turn.
   */
  creepers?: CreeperKind | readonly CreeperKind[];
  /** Supply bunkers that also get a creeper patrol. Defaults to CONFIG.layout.guardedSupplyBunkers. */
  guardedSupplyBunkers?: number;
}

/**
 * The fixed planet order. The first planet needs 3 parts, later ones 5.
 * New planets go at the end and should be a bit harder than the one before.
 */
export const PLANETS: readonly PlanetDef[] = [
  { name: 'Kepler-442', seed: 442, theme: THEMES.red, partsNeeded: 3, energyCells: 3 },
  { name: 'Nereid-117', seed: 117, theme: THEMES.blue, partsNeeded: 5, energyCells: 4, creepers: 'glider' },
  { name: 'Umbra-9', seed: 9, theme: THEMES.purple, partsNeeded: 5, energyCells: 4, creepers: 'jumper' },
  // The finale: every kind of creeper from the earlier planets, and more of them.
  {
    name: 'Viridia', seed: 71, theme: THEMES.green, partsNeeded: 5, energyCells: 4,
    creepers: ['crawler', 'glider', 'jumper'], guardedSupplyBunkers: 4,
  },
];
