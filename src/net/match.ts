import { CONFIG } from '../config';
import { NO_INPUT, type InputState } from '../core/input';
import { craft, type RecipeId } from '../game/crafting';
import { startRace, type GameEvent, type GameState } from '../game/state';
import { step } from '../game/update';
import { findTarget } from '../systems/interaction';
import type { ServerMessage } from './protocol';
import { eventVisibleTo, snapshotFor } from './view';

/**
 * One race room, independent of how it is hosted: the Cloudflare Durable Object is a thin shell
 * around it, and tests drive it directly. The host passes in the time, calls `tick` while
 * `ticking` is true, and delivers what `send` hands it.
 *
 * Phases: 'waiting' until two players have a seat, 'playing' while the race runs, 'over' after it.
 * Seats are player ids. A player who drops out keeps their seat for CONFIG.net.reconnectSeconds.
 */

export type Phase = 'waiting' | 'playing' | 'over';

const ONE_SHOTS = ['toggleLamp', 'useBottle', 'placeBeacon', 'placeBomb'] as const;

interface Seat {
  connected: boolean;
  /** Time (host seconds) the player dropped out, or null while connected. */
  awaySince: number | null;
  /** The last input received: movement and held buttons. */
  input: InputState;
  /** One-shot presses received since the last tick, so none is lost between ticks. */
  pressed: Set<(typeof ONE_SHOTS)[number]>;
  rematch: boolean;
  /** Events for this player since their last snapshot. */
  events: GameEvent[];
  /** Input messages in the current one-second window, to ignore a flooding client. */
  inputWindowStart: number;
  inputsInWindow: number;
}

export class Match {
  phase: Phase = 'waiting';
  state: GameState | null = null;
  private seats: Seat[] = [];
  private tickCount = 0;

  constructor(
    readonly code: string,
    private readonly send: (seat: number, message: ServerMessage) => void,
    private readonly newSeed: () => number,
  ) {}

  /** True while the host should call `tick` at CONFIG.net.tickRate. */
  get ticking(): boolean {
    return this.phase === 'playing';
  }

  /** True when nobody is connected: the host may let the room go to sleep. */
  get empty(): boolean {
    return this.seats.every((s) => !s.connected);
  }

  /**
   * A player connects. Pass the seat they had to come back after dropping out. Returns their seat,
   * or null when the room is full.
   */
  join(now: number, rejoinSeat?: number): number | null {
    const back = rejoinSeat !== undefined ? this.seats[rejoinSeat] : undefined;
    let seat: number;
    if (back && !back.connected) {
      seat = rejoinSeat!;
      back.connected = true;
      back.awaySince = null;
    } else if (this.seats.length < 2 && this.phase === 'waiting') {
      seat = this.seats.length;
      this.seats.push(newSeat(now));
    } else {
      return null;
    }
    this.send(seat, { t: 'welcome', code: this.code, seat });
    if (this.phase === 'waiting') {
      if (this.seats.length === 2 && this.seats.every((s) => s.connected)) this.start();
      else this.send(seat, { t: 'waiting' });
    } else if (this.state) {
      // Back in a running or finished race: rebuild the mirror, then catch up with a snapshot.
      this.send(seat, { t: 'start', seed: this.state.world.planet.seed, seat });
      this.sendSnapshot(seat);
      this.sendOther(seat, { t: 'opponent-back' });
    }
    return seat;
  }

  /** A player's connection closed. */
  leave(seat: number, now: number): void {
    const s = this.seats[seat];
    if (!s) return;
    if (this.phase === 'waiting') {
      // Nothing started yet: give the seat up, so the room can fill again.
      this.seats.splice(seat, 1);
      return;
    }
    s.connected = false;
    s.awaySince = now;
    s.rematch = false;
    if (this.phase === 'playing') this.sendOther(seat, { t: 'opponent-away', seconds: CONFIG.net.reconnectSeconds });
  }

  /** The player's current input. Held values replace the old ones; one-shot presses wait for the next tick. */
  input(seat: number, input: InputState, now: number): void {
    const s = this.seats[seat];
    if (!s || this.phase !== 'playing') return;
    if (now - s.inputWindowStart >= 1) {
      s.inputWindowStart = now;
      s.inputsInWindow = 0;
    }
    // Twice the allowed rate before input is ignored: bursts happen, floods should not.
    if (++s.inputsInWindow > CONFIG.net.maxInputsPerSecond * 2) return;
    const clean = sanitize(input);
    s.input = clean;
    for (const key of ONE_SHOTS) if (clean[key]) s.pressed.add(key);
  }

  /** A recipe from the workbench. Only at the player's own ship, as in the game itself. */
  craft(seat: number, id: RecipeId): void {
    const state = this.state;
    if (!state || this.phase !== 'playing') return;
    const player = state.players[seat];
    if (findTarget(state, player)?.kind !== 'ship') return;
    craft(state, id, player);
    this.distributeEvents();
  }

  /** After a race: this player wants another one. When both do, a new planet starts. */
  rematch(seat: number): void {
    const s = this.seats[seat];
    if (!s || this.phase !== 'over' || !s.connected) return;
    s.rematch = true;
    if (this.seats.every((x) => x.rematch && x.connected)) this.start();
    else this.sendOther(seat, { t: 'rematch-asked' });
  }

  /** One server tick. `now` is host time in seconds. */
  tick(now: number): void {
    const state = this.state;
    if (!state || this.phase !== 'playing') return;
    this.checkAway(now);
    if (state.status === 'playing') {
      const inputs = this.seats.map((s) => (s.connected ? withPresses(s) : NO_INPUT));
      for (const s of this.seats) s.pressed.clear();
      step(state, inputs, 1 / CONFIG.net.tickRate);
      this.distributeEvents();
    }
    this.tickCount++;
    const over = state.status !== 'playing';
    if (over) this.phase = 'over';
    if (over || this.tickCount % CONFIG.net.snapshotEvery === 0) {
      for (let seat = 0; seat < this.seats.length; seat++) if (this.seats[seat].connected) this.sendSnapshot(seat);
    }
  }

  private start(): void {
    this.state = startRace(this.newSeed());
    this.phase = 'playing';
    this.tickCount = 0;
    for (const [seat, s] of this.seats.entries()) {
      s.input = NO_INPUT;
      s.pressed.clear();
      s.rematch = false;
      s.events = [];
      this.send(seat, { t: 'start', seed: this.state.world.planet.seed, seat });
    }
  }

  /** A player away for too long loses the race; the one still here wins. */
  private checkAway(now: number): void {
    const state = this.state!;
    if (state.status !== 'playing') return;
    const gone = this.seats.findIndex((s) => !s.connected && s.awaySince !== null && now - s.awaySince >= CONFIG.net.reconnectSeconds);
    if (gone < 0) return;
    const stayed = this.seats.findIndex((s, i) => i !== gone && s.connected);
    state.race!.result = { winner: stayed >= 0 ? stayed : null, reason: 'left' };
    state.status = 'over';
  }

  private distributeEvents(): void {
    const state = this.state!;
    for (const event of state.events) {
      for (const [seat, s] of this.seats.entries()) {
        if (eventVisibleTo(event, state.players[seat])) s.events.push(event);
      }
    }
    state.events.length = 0;
  }

  private sendSnapshot(seat: number): void {
    const s = this.seats[seat];
    const snap = snapshotFor(this.state!, seat, this.tickCount, s.events);
    s.events = [];
    this.send(seat, { t: 'snap', snap });
  }

  private sendOther(seat: number, message: ServerMessage): void {
    for (const [other, s] of this.seats.entries()) if (other !== seat && s.connected) this.send(other, message);
  }
}

function newSeat(now: number): Seat {
  return { connected: true, awaySince: null, input: NO_INPUT, pressed: new Set(), rematch: false, events: [], inputWindowStart: now, inputsInWindow: 0 };
}

function withPresses(s: Seat): InputState {
  const input = { ...s.input };
  for (const key of ONE_SHOTS) input[key] = s.pressed.has(key);
  return input;
}

/** Input from the network is untrusted: numbers are clamped, anything else becomes false. */
export function sanitize(input: Partial<InputState> | null | undefined): InputState {
  const axis = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return {
    moveX: axis(input?.moveX),
    moveY: axis(input?.moveY),
    interact: input?.interact === true,
    toggleLamp: input?.toggleLamp === true,
    useBottle: input?.useBottle === true,
    placeBeacon: input?.placeBeacon === true,
    placeBomb: input?.placeBomb === true,
  };
}
