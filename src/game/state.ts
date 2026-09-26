import { CONFIG } from '../config';
import { createRng, deriveSeed, type Rng } from '../core/rng';
import { generateWorld } from '../world/generate';
import { PLANETS } from '../world/planets';
import type { Bunker, World } from '../world/types';
import { applyProgress, newCampaign, type Campaign } from './campaign';

/**
 * Things that happened during a step which the presentation layer should react to:
 * toasts, particles, screen shake, saving, opening the star map. Systems push events,
 * main.ts and the renderer handle them. This keeps game logic free of UI code, and easy to test.
 */
export type GameEvent =
  | { type: 'toast'; text: string }
  | { type: 'burst'; x: number; y: number; color: string; count: number }
  | { type: 'shake'; amount: number }
  | { type: 'hurt' }
  | { type: 'crater'; x: number; y: number }
  /** Something worth saving happened (loot, install). */
  | { type: 'progress' }
  /** The player asked the ship for the star map. */
  | { type: 'starmap' }
  /** A sound effect. The audio layer decides what it sounds like. */
  | { type: 'sound'; name: SoundName };

export type SoundName =
  | 'pickup' | 'part' | 'supply' | 'install' | 'repaired' | 'craft'
  | 'hurt' | 'bottle' | 'beacon' | 'deny' | 'lamp'
  | 'pounce' | 'land' | 'storm-warning';

/** 'stranded': too little energy to fly and no energy cells left on this planet. The game is over. */
export type Status = 'playing' | 'dead' | 'stranded' | 'escaped';

export interface Player {
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
  inPool: boolean;
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

export interface GameState {
  planetIndex: number;
  world: World;
  player: Player;
  oxygen: number;
  energy: number;
  /** Parts found on this planet and not yet installed count as carried. */
  partsCarried: number;
  partsInstalled: number;
  inventory: Inventory;
  /** Beacons placed on this planet that are still working. */
  beacons: Beacon[];
  /** Progress on all planets, and how far the engine reaches. The current planet's entry is stale until captured. */
  campaign: Campaign;
  /** Seconds since 00:00 on day 1. */
  time: number;
  /** Debug only: speeds up the day clock. */
  timeScale: number;
  lamp: boolean;
  hazards: HazardState;
  interaction: InteractionState;
  /** One byte per tile, 1 when revealed on the minimap. */
  explored: Uint8Array;
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
    planetIndex,
    world,
    player: {
      x: world.ship.x + 40,
      y: world.ship.y + 30,
      kx: 0,
      ky: 0,
      facing: 1,
      moving: false,
      walkTime: 0,
      invulnerable: 0,
      leak: 0,
    },
    oxygen: CONFIG.player.startOxygen,
    energy: options.energy ?? CONFIG.player.startEnergy,
    partsCarried: 0,
    partsInstalled: 0,
    inventory: options.inventory ? { ...options.inventory } : emptyInventory(),
    beacons: [],
    campaign,
    time: (CONFIG.day.startHour / 24) * CONFIG.day.lengthSeconds,
    timeScale: 1,
    lamp: true,
    hazards: {
      storm: 0,
      stormNext: CONFIG.hazards.storm.firstAfter,
      stormWarned: false,
      meteorTimer: 4,
      meteors: [],
      inPool: false,
      coldMultiplier: 1,
    },
    interaction: { target: null, progress: 0, latched: false },
    explored: new Uint8Array(CONFIG.world.tilesX * CONFIG.world.tilesY),
    status: 'playing',
    rng: createRng(deriveSeed(planet.seed, 2)),
    events: [],
  };
  const progress = campaign.planets[planetIndex];
  if (progress) applyProgress(state, progress);
  return state;
}

export function emit(state: GameState, event: GameEvent): void {
  state.events.push(event);
}

/** True when every part for this planet's engine upgrade is installed. */
export function isRepaired(state: GameState): boolean {
  return state.partsInstalled >= state.world.planet.partsNeeded;
}
