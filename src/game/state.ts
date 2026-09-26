import { CONFIG } from '../config';
import { createRng, deriveSeed, type Rng } from '../core/rng';
import { generateWorld } from '../world/generate';
import { PLANETS } from '../world/planets';
import type { Bunker, World } from '../world/types';

/**
 * Things that happened during a step which the presentation layer should show:
 * toasts, particles, screen shake. Systems push events, the renderer drains them.
 * This keeps game logic free of any drawing code, and easy to test.
 */
export type GameEvent =
  | { type: 'toast'; text: string }
  | { type: 'burst'; x: number; y: number; color: string; count: number }
  | { type: 'shake'; amount: number }
  | { type: 'hurt' }
  | { type: 'crater'; x: number; y: number };

export type Status = 'playing' | 'dead' | 'launched';

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
  partsCarried: number;
  partsInstalled: number;
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

export interface CarryOver {
  energy: number;
}

/** Land on a planet. Oxygen is refilled by the ship; energy carries over between planets. */
export function landOn(planetIndex: number, carry?: CarryOver): GameState {
  const planet = PLANETS[planetIndex];
  if (!planet) throw new Error(`Unknown planet index ${planetIndex}`);
  const world = generateWorld(planet);
  const { hazards } = CONFIG;
  return {
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
    energy: carry?.energy ?? CONFIG.player.startEnergy,
    partsCarried: 0,
    partsInstalled: 0,
    time: (CONFIG.day.startHour / 24) * CONFIG.day.lengthSeconds,
    timeScale: 1,
    lamp: true,
    hazards: {
      storm: 0,
      stormNext: hazards.storm.firstAfter,
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
}

export function emit(state: GameState, event: GameEvent): void {
  state.events.push(event);
}

export function hasNextPlanet(state: GameState): boolean {
  return state.planetIndex + 1 < PLANETS.length;
}
