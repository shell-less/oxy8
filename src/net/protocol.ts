import type { InputState } from '../core/input';
import type { RecipeId } from '../game/crafting';
import type { Bomb, GameEvent, Inventory, RaceResult, Status, SupplyDrop } from '../game/state';
import type { CreeperMode, JumpState, SlideState } from '../world/types';

/**
 * Messages between the race server and a browser, as JSON over a WebSocket. Shared by both
 * sides so they cannot drift apart. The server is authoritative: clients send intent (input,
 * crafting, rematch), the server sends back what that player may see.
 */

export type ClientMessage =
  /** The player's current input. Sent only when it changes; `seq` counts up with every input message. */
  | { t: 'input'; input: InputState; seq?: number }
  /** A recipe from the workbench; the server checks the player stands at their ship. */
  | { t: 'craft'; id: RecipeId }
  /** After a race: ready for a new planet. Both players must ask. */
  | { t: 'rematch' };

export type ServerMessage =
  /** You have a seat in this room. `seat` is your player id. */
  | { t: 'welcome'; code: string; seat: number }
  /** Waiting for the second player. */
  | { t: 'waiting' }
  /** A race starts on the planet built from this seed. Both clients generate the same world. */
  | { t: 'start'; seed: number; seat: number }
  | { t: 'snap'; snap: Snapshot }
  /** The other player dropped out; they have `seconds` to come back. */
  | { t: 'opponent-away'; seconds: number }
  | { t: 'opponent-back' }
  /** The other player asked for a rematch. */
  | { t: 'rematch-asked' }
  | { t: 'error'; text: string };

/** How the player's current interaction target is named on the wire. */
export type TargetRef = { kind: 'ship' } | { kind: 'drop' } | { kind: 'bunker'; id: number } | { kind: 'bomb'; id: number };

/** The player's own astronaut, in full. */
export interface OwnSnap {
  x: number;
  y: number;
  kx: number;
  ky: number;
  facing: 1 | -1;
  moving: boolean;
  walkTime: number;
  invulnerable: number;
  leak: number;
  oxygen: number;
  energy: number;
  partsCarried: number;
  partsInstalled: number;
  inventory: Inventory;
  lamp: boolean;
  target: TargetRef | null;
  progress: number;
  inPool: boolean;
  knownEmpty: number[];
  bombs: number;
}

/** The other astronaut, as far as it can be seen from their ship or on screen. */
export interface OtherSnap {
  /** Only when on or near this player's screen; null otherwise. */
  body: { x: number; y: number; facing: 1 | -1; moving: boolean; walkTime: number; lamp: boolean; invulnerable: number; leak: number } | null;
  /** Visible on their ship, which is always on the map. */
  partsInstalled: number;
}

export interface CreeperSnap {
  x: number;
  y: number;
  facing: 1 | -1;
  mode: CreeperMode;
  jump: JumpState | null;
  slide: SlideState | null;
}

/** Everything that changed and that this player may see. The world layout itself comes from the seed. */
export interface Snapshot {
  tick: number;
  time: number;
  elapsed: number;
  status: Status;
  result: RaceResult | null;
  me: OwnSnap;
  other: OtherSnap;
  creepers: CreeperSnap[];
  /** Ids of supply bunkers that still hold an energy cell. */
  cells: number[];
  /** Ids of scrap pieces picked up. */
  scrapTaken: number[];
  hazards: { storm: number; stormNext: number; stormWarned: boolean; coldMultiplier: number; meteors: { x: number; y: number; timeLeft: number }[] };
  beacons: { x: number; y: number; timeLeft: number }[];
  /** Own bombs, and other bombs within the blink radius. */
  bombs: Bomb[];
  drop: SupplyDrop;
  /** This player's events since the last snapshot. */
  events: GameEvent[];
  /**
   * For predicting the own astronaut: the `seq` of the input the server stepped with last, and
   * for how many seconds it has stepped with it. The browser replays whatever came after.
   */
  ack: number;
  ackAge: number;
}

/**
 * Reads a message from a client. Anything malformed becomes null and is ignored; the input
 * itself is sanitised later by the match.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.t === 'input' && m.input && typeof m.input === 'object') {
    const seq = typeof m.seq === 'number' && Number.isInteger(m.seq) && m.seq >= 0 ? m.seq : undefined;
    return { t: 'input', input: m.input as InputState, seq };
  }
  if (m.t === 'craft' && typeof m.id === 'string') return { t: 'craft', id: m.id as RecipeId };
  if (m.t === 'rematch') return { t: 'rematch' };
  return null;
}
