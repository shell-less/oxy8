import { CONFIG } from '../config';
import { createRng, deriveSeed, type Rng } from '../core/rng';
import { generateWorld } from '../world/generate';
import { generateRaceWorld, mirror } from '../world/race';
import { PLANETS } from '../world/planets';
import type { Bunker, Point, World } from '../world/types';
import { applyProgress, newCampaign, type Campaign } from './campaign';

/**
 * Things that happened during a step which the presentation layer should react to:
 * toasts, particles, screen shake, saving, opening the star map. Systems push events,
 * main.ts and the renderer handle them. This keeps game logic free of UI code, and easy to test.
 */
export type GameEvent =
  | { type: 'toast'; text: string; player?: number }
  | { type: 'burst'; x: number; y: number; color: string; count: number }
  | { type: 'shake'; amount: number; player?: number }
  | { type: 'hurt'; player?: number }
  | { type: 'crater'; x: number; y: number }
  /** Something worth saving happened (loot, install). */
  | { type: 'progress' }
  /** The player asked the ship for the star map (in race mode: the workbench). */
  | { type: 'starmap'; player?: number }
  /** A sound effect. The audio layer decides what it sounds like. */
  | { type: 'sound'; name: SoundName; player?: number };

/** Events that only concern one player carry their id; the screen shows them only for that player. */
export type PlayerEvent = Extract<GameEvent, { player?: number }>;

export type SoundName =
  | 'pickup' | 'part' | 'supply' | 'install' | 'repaired' | 'craft'
  | 'hurt' | 'bottle' | 'beacon' | 'deny' | 'lamp'
  | 'pounce' | 'land' | 'slide' | 'storm-warning';

/**
 * 'stranded': too little energy to fly and no energy cells left on this planet. The game is over.
 * 'over': a race has ended; `race.result` says how.
 */
export type Status = 'playing' | 'dead' | 'stranded' | 'escaped' | 'over';

/** How a race ended. `winner` is a player id, or null for a draw. */
export interface RaceResult {
  winner: number | null;
  reason: 'launch' | 'death' | 'time';
}

export interface RaceState {
  /** Seconds since the race started. */
  elapsed: number;
  result: RaceResult | null;
}

/**
 * One astronaut: position, suit and everything they carry. Solo play has one player;
 * race mode has two on the same planet. Per-player fields live here, shared world state on GameState.
 */
export interface Player {
  /** Index in `GameState.players`. */
  id: number;
  x: number;
  y: number;
  /** Knockback velocity. */
  kx: number;
  ky: number;
  facing: 1 | -1;
  moving: boolean;
  walkTime: number;
  invulnerable: number;
  /** Seconds left of visible oxygen leaking from the suit. */
  leak: number;
  oxygen: number;
  energy: number;
  /** Parts found on this planet and not yet installed count as carried. */
  partsCarried: number;
  partsInstalled: number;
  inventory: Inventory;
  lamp: boolean;
  interaction: InteractionState;
  /** Standing in a toxic pool this frame. */
  inPool: boolean;
  /** One byte per tile, 1 when revealed on this player's minimap. */
  explored: Uint8Array;
}

export interface Meteor { x: number; y: number; timeLeft: number }

/** What the player carries between planets, besides energy. */
export interface Inventory {
  scrap: number;
  /** Oxygen bottles, used with Q. */
  bottles: number;
  /** Decoy beacons, placed with R. */
  beacons: number;
  /** Suit reinforcement: a one-time upgrade. */
  armour: boolean;
}

export function emptyInventory(): Inventory {
  return { scrap: 0, bottles: 0, beacons: 0, armour: false };
}

/** A decoy beacon placed on this planet. Creepers nearby go for it instead of the player. */
export interface Beacon { x: number; y: number; timeLeft: number }

export interface HazardState {
  /** Seconds of storm left; 0 when calm. */
  storm: number;
  stormNext: number;
  stormWarned: boolean;
  meteorTimer: number;
  meteors: Meteor[];
  /** Meteors aim at the players in turn; this counts the ones aimed so far. */
  meteorCount: number;
  coldMultiplier: number;
}

export type Target = { kind: 'ship' } | { kind: 'bunker'; bunker: Bunker };

export interface InteractionState {
  target: Target | null;
  /** 0..1 while E is held on a valid target. */
  progress: number;
  /** True after an action completed, until E is released. Prevents repeating by holding E. */
  latched: boolean;
}

/** Solo: the campaign across all planets. Race: two players on one mirrored planet. */
export type GameMode = 'solo' | 'race';

export interface GameState {
  mode: GameMode;
  /** Solo only: index in PLANETS. Race planets are not in PLANETS; this is then the index of their planet type. */
  planetIndex: number;
  world: World;
  /** Everyone on this planet. Solo play has exactly one. */
  players: Player[];
  /** Index of the player whose view the screen shows. Always 0 in solo; Tab switches it in a local race. */
  viewer: number;
  /** Race mode only. */
  race: RaceState | null;
  /** Beacons placed on this planet that are still working. */
  beacons: Beacon[];
  /** Progress on all planets, and how far the engine reaches. The current planet's entry is stale until captured. */
  campaign: Campaign;
  /** Seconds since 00:00 on day 1. */
  time: number;
  /** Debug only: speeds up the day clock. */
  timeScale: number;
  hazards: HazardState;
  status: Status;
  /** Randomness for systems (meteor timing, storm length), seeded per planet. */
  rng: Rng;
  events: GameEvent[];
}

export interface LandingOptions {
  energy?: number;
  inventory?: Inventory;
  campaign?: Campaign;
}

/**
 * Land on a planet next to the ship, in the morning, with a full oxygen tank.
 * If the campaign has progress for this planet, the world is restored: empty bunkers stay empty.
 */
export function landOn(planetIndex: number, options: LandingOptions = {}): GameState {
  const planet = PLANETS[planetIndex];
  if (!planet) throw new Error(`Unknown planet index ${planetIndex}`);
  const world = generateWorld(planet);
  const campaign = options.campaign ?? newCampaign();
  const state: GameState = {
    ...sharedState(world, planet.seed),
    mode: 'solo',
    planetIndex,
    players: [newPlayer(0, world, world.ship.x + 40, world.ship.y + 30, options.energy ?? CONFIG.player.startEnergy, options.inventory)],
    campaign,
  };
  const progress = campaign.planets[planetIndex];
  if (progress) applyProgress(state, progress);
  return state;
}

/**
 * Starts a race: two players on a mirrored planet built from the match seed, each next to
 * their own ship, in the morning, with full tanks. The race rules come in a later step.
 */
export function startRace(matchSeed: number): GameState {
  const world = generateRaceWorld(matchSeed);
  const energy = CONFIG.race.startEnergy;
  const spawn: Point = { x: world.ships[0].x + 40, y: world.ships[0].y + 30 };
  const other = mirror(spawn, world.width, world.height);
  return {
    ...sharedState(world, matchSeed),
    mode: 'race',
    planetIndex: PLANETS.findIndex((p) => p.theme === world.planet.theme),
    players: [newPlayer(0, world, spawn.x, spawn.y, energy), newPlayer(1, world, other.x, other.y, energy)],
    campaign: newCampaign(),
    race: { elapsed: 0, result: null },
  };
}

/** The parts of a fresh GameState that do not depend on the mode. */
function sharedState(world: World, seed: number): Omit<GameState, 'mode' | 'planetIndex' | 'players' | 'campaign' | 'race'> & { race: null } {
  return {
    world,
    viewer: 0,
    race: null,
    beacons: [],
    time: (CONFIG.day.startHour / 24) * CONFIG.day.lengthSeconds,
    timeScale: 1,
    hazards: {
      storm: 0,
      stormNext: CONFIG.hazards.storm.firstAfter,
      stormWarned: false,
      meteorTimer: 4,
      meteors: [],
      meteorCount: 0,
      coldMultiplier: 1,
    },
    status: 'playing',
    rng: createRng(deriveSeed(seed, 2)),
    events: [],
  };
}

/** A fresh astronaut standing at (x, y) with a full oxygen tank. */
export function newPlayer(id: number, world: World, x: number, y: number, energy: number, inventory?: Inventory): Player {
  return {
    id,
    x,
    y,
    kx: 0,
    ky: 0,
    facing: 1,
    moving: false,
    walkTime: 0,
    invulnerable: 0,
    leak: 0,
    oxygen: CONFIG.player.startOxygen,
    energy,
    partsCarried: 0,
    partsInstalled: 0,
    inventory: inventory ? { ...inventory } : emptyInventory(),
    lamp: true,
    interaction: { target: null, progress: 0, latched: false },
    inPool: false,
    explored: new Uint8Array(world.tilesX * world.tilesY),
  };
}

/** The ship this player repairs and launches: their own on a race planet, the only one in solo play. */
export function shipOf(state: GameState, player: Player): Point {
  return state.world.ships[player.id] ?? state.world.ship;
}

/** The player whose view the renderer, HUD, tips and minimap show. Index 0 in solo play. */
export function localPlayer(state: GameState): Player {
  return state.players[state.viewer] ?? state.players[0];
}

export function emit(state: GameState, event: GameEvent): void {
  state.events.push(event);
}

/** An event for one player only: their toasts, their hits, their sounds. */
export function emitTo(state: GameState, player: Player, event: PlayerEvent): void {
  state.events.push({ ...event, player: player.id });
}

/** True when this event should reach the screen of the given viewer. */
export function isFor(event: GameEvent, viewer: number): boolean {
  return !('player' in event) || event.player === undefined || event.player === viewer;
}

/** True when every part for this planet's engine upgrade is installed on this player's ship. */
export function isRepaired(state: GameState, player: Player = localPlayer(state)): boolean {
  return player.partsInstalled >= state.world.planet.partsNeeded;
}
