import { PLANETS } from '../world/planets';
import { snapshotCampaign, type Campaign, type PlanetProgress } from './campaign';
import { emptyInventory, landOn, localPlayer, type GameState, type Inventory } from './state';

/** Everything needed to rebuild a game. The worlds themselves come back from their fixed seeds. */
export interface SaveData {
  version: 2;
  planetIndex: number;
  energy: number;
  inventory: Inventory;
  campaign: Campaign;
}

/** Version 1 (before crafting): no inventory, no scrap progress. */
interface SaveDataV1 {
  version: 1;
  planetIndex: number;
  energy: number;
  campaign: { unlocked: number; planets: (Omit<PlanetProgress, 'takenScrap'> | null)[] };
}

/**
 * Two snapshots: `live` is updated after every action and is where "Verder spelen" resumes.
 * `checkpoint` is taken on landing; dying rolls back to it.
 */
export interface SaveFile {
  live: SaveData;
  checkpoint: SaveData;
}

const KEY = 'oxy8.save';

export function toSaveData(state: GameState): SaveData {
  return {
    version: 2,
    planetIndex: state.planetIndex,
    energy: localPlayer(state).energy,
    inventory: { ...localPlayer(state).inventory },
    campaign: snapshotCampaign(state),
  };
}

/** Resumes at the ship with a full tank, in the morning. */
export function fromSaveData(data: SaveData): GameState {
  const campaign = structuredClone(data.campaign);
  // Saves from before a new planet was added simply have fewer entries.
  while (campaign.planets.length < PLANETS.length) campaign.planets.push(null);
  return landOn(data.planetIndex, { energy: data.energy, inventory: data.inventory, campaign });
}

/** Minimal storage interface, so tests can pass a Map-backed fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage can be missing or throw (private mode, blocked storage). Saving is then silently skipped. */
function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSave(store: KeyValueStore | null = browserStore()): SaveFile | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { live: unknown; checkpoint: unknown };
    const live = migrate(parsed.live);
    const checkpoint = migrate(parsed.checkpoint);
    return isValid(live) && isValid(checkpoint) ? { live, checkpoint } : null;
  } catch {
    return null;
  }
}

export function writeSave(file: SaveFile, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(file));
  } catch {
    // Storage full or blocked: the game keeps working without saving.
  }
}

export function clearSave(store: KeyValueStore | null = browserStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Brings older saves up to the current version. Unknown shapes pass through and fail validation. */
function migrate(data: unknown): SaveData | undefined {
  const d = data as SaveDataV1 | SaveData | undefined;
  if (!d || typeof d !== 'object') return undefined;
  if (d.version === 1 && d.campaign && Array.isArray(d.campaign.planets)) {
    return {
      version: 2,
      planetIndex: d.planetIndex,
      energy: d.energy,
      inventory: emptyInventory(),
      campaign: {
        unlocked: d.campaign.unlocked,
        planets: d.campaign.planets.map((p) => (p ? { ...p, takenScrap: [] } : null)),
      },
    };
  }
  return d as SaveData;
}

function isValid(d: SaveData | undefined): d is SaveData {
  if (!d || d.version !== 2) return false;
  const inv = d.inventory;
  if (!inv || typeof inv.scrap !== 'number' || typeof inv.bottles !== 'number'
    || typeof inv.beacons !== 'number' || typeof inv.armour !== 'boolean') return false;
  if (!Number.isInteger(d.planetIndex) || d.planetIndex < 0 || d.planetIndex >= PLANETS.length) return false;
  if (typeof d.energy !== 'number' || !d.campaign || !Array.isArray(d.campaign.planets)) return false;
  if (d.campaign.planets.length > PLANETS.length) return false;
  return d.campaign.planets.every((p) => p === null || isProgress(p));
}

function isProgress(p: PlanetProgress): boolean {
  return Array.isArray(p.lootedBunkers) && Array.isArray(p.takenCells) && Array.isArray(p.takenScrap)
    && typeof p.partsCarried === 'number' && typeof p.partsInstalled === 'number' && typeof p.explored === 'string';
}

/** Tutorial tips are per browser, not per game: a new game does not repeat tips already seen. */
export interface TipSettings {
  enabled: boolean;
  seen: string[];
}

const TIPS_KEY = 'oxy8.tips';

export function readTipSettings(store: KeyValueStore | null = browserStore()): TipSettings {
  try {
    const raw = store?.getItem(TIPS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<TipSettings>) : {};
    return {
      enabled: parsed.enabled !== false,
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return { enabled: true, seen: [] };
  }
}

export function writeTipSettings(settings: TipSettings, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.setItem(TIPS_KEY, JSON.stringify(settings));
  } catch {
    // Not important enough to fail over.
  }
}
