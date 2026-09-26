import { CONFIG } from '../config';
import { PLANETS } from '../world/planets';
import type { GameState } from './state';

/** What has changed on a planet since it was generated. The world itself is regenerated from its seed. */
export interface PlanetProgress {
  /** Ids of parts bunkers that are empty. */
  lootedBunkers: number[];
  /** Ids of supply bunkers whose energy cell was taken. */
  takenCells: number[];
  /** Ids of scrap pieces picked up. */
  takenScrap: number[];
  partsCarried: number;
  partsInstalled: number;
  /** Explored minimap tiles, bit-packed and base64 encoded. */
  explored: string;
}

export interface Campaign {
  /** Highest planet index the engine can reach. Equal to PLANETS.length when the way home is open. */
  unlocked: number;
  /** Progress per planet index; null for planets never visited. */
  planets: (PlanetProgress | null)[];
}

export function newCampaign(): Campaign {
  return { unlocked: 0, planets: PLANETS.map(() => null) };
}

/** Reads the current planet's progress out of the live world. */
export function captureProgress(state: GameState): PlanetProgress {
  const bunkers = state.world.bunkers;
  return {
    lootedBunkers: bunkers.filter((b) => b.kind === 'parts' && b.looted).map((b) => b.id),
    takenCells: bunkers.filter((b) => b.kind === 'supply' && !b.energyCell && b.id < firstBunkerWithoutCell(state)).map((b) => b.id),
    takenScrap: state.world.scrap.filter((x) => x.taken).map((x) => x.id),
    partsCarried: state.partsCarried,
    partsInstalled: state.partsInstalled,
    explored: packBits(state.explored),
  };
}

/** Supply bunker ids at or above this number never had an energy cell. */
function firstBunkerWithoutCell(state: GameState): number {
  const planet = state.world.planet;
  return planet.partsNeeded + planet.energyCells;
}

export function applyProgress(state: GameState, progress: PlanetProgress): void {
  const looted = new Set(progress.lootedBunkers);
  const taken = new Set(progress.takenCells);
  for (const b of state.world.bunkers) {
    if (b.kind === 'parts') b.looted = looted.has(b.id);
    else if (taken.has(b.id)) b.energyCell = false;
  }
  const scrapTaken = new Set(progress.takenScrap);
  for (const x of state.world.scrap) x.taken = scrapTaken.has(x.id);
  state.partsCarried = progress.partsCarried;
  state.partsInstalled = progress.partsInstalled;
  state.explored = unpackBits(progress.explored, state.explored.length);
}

/** The campaign including the live progress of the current planet. Use this before leaving or saving. */
export function snapshotCampaign(state: GameState): Campaign {
  const planets = [...state.campaign.planets];
  planets[state.planetIndex] = captureProgress(state);
  return { unlocked: state.campaign.unlocked, planets };
}

/** Energy cells still waiting on a planet, or null when the planet was never visited. */
export function energyCellsLeft(state: GameState, planetIndex: number): number | null {
  if (planetIndex === state.planetIndex) return state.world.bunkers.filter((b) => b.energyCell).length;
  const progress = state.campaign.planets[planetIndex];
  if (!progress) return null;
  return PLANETS[planetIndex].energyCells - progress.takenCells.length;
}

/** Scrap still lying on a planet, or null when the planet was never visited. */
export function scrapLeft(state: GameState, planetIndex: number): number | null {
  if (planetIndex === state.planetIndex) return state.world.scrap.filter((x) => !x.taken).length;
  const progress = state.campaign.planets[planetIndex];
  if (!progress) return null;
  return CONFIG.crafting.scrapPerPlanet - progress.takenScrap.length;
}

/** Called after an install. Completing this planet's upgrade lets the engine reach one planet further. */
export function unlockIfRepaired(state: GameState): boolean {
  if (state.partsInstalled < state.world.planet.partsNeeded) return false;
  const next = state.planetIndex + 1;
  if (state.campaign.unlocked >= next) return false;
  state.campaign.unlocked = next;
  return true;
}

/**
 * No way forward: not enough energy to fly (and so also not to install), and no energy cells
 * left on this planet to change that.
 */
export function isStranded(state: GameState): boolean {
  return state.energy < flightCost() && !state.world.bunkers.some((b) => b.energyCell);
}

export function flightCost(): number {
  return CONFIG.energy.flightCost;
}

function packBits(bytes: Uint8Array): string {
  const packed = new Uint8Array(Math.ceil(bytes.length / 8));
  for (let i = 0; i < bytes.length; i++) if (bytes[i]) packed[i >> 3] |= 1 << (i & 7);
  let binary = '';
  for (const b of packed) binary += String.fromCharCode(b);
  return btoa(binary);
}

function unpackBits(encoded: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  try {
    const binary = atob(encoded);
    for (let i = 0; i < length; i++) {
      const byte = binary.charCodeAt(i >> 3);
      if (byte & (1 << (i & 7))) out[i] = 1;
    }
  } catch {
    // A damaged minimap is not worth failing a load over.
  }
  return out;
}
