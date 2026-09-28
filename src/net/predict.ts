import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import type { GameState, Player } from '../game/state';
import { stormIntensity } from '../systems/hazards';
import { describe, findTarget } from '../systems/interaction';
import { movePlayer } from '../systems/movement';

/**
 * Client-side prediction for the own astronaut in a network race. Without it, a key press shows
 * on screen only after a round trip to the server. With it, the browser moves its own astronaut
 * at once, with the same movePlayer() the server runs, and keeps what it did. When a snapshot
 * puts the astronaut where the server has it, the browser replays the input the server had not
 * used yet, so the astronaut stays where the player expects it, and only real disagreements
 * (a creeper's knockback, a blocked path) show as a correction.
 *
 * The server tells, per snapshot, which input it stepped with last (`ack`, its seq) and for how
 * long (`ackAge`). Everything this browser did with that input beyond ackAge, and with any later
 * input, is replayed on top of the server's position.
 */

interface Entry { seq: number; input: InputState; dt: number }

/** Corrections smaller than this are eased in; larger ones (a knockback) are shown at once. */
const EASE_BELOW = 24;
/** The share of a small correction applied per snapshot. */
const EASE = 0.4;
/** History kept at most, in seconds; far more than a round trip. */
const MAX_HISTORY = 3;

export class Predictor {
  private history: Entry[] = [];
  /** How much of the input `seq` a previous snapshot already accounted for. */
  private consumed = { seq: -1, age: 0 };

  /** Every frame: move the own astronaut with the input the server has (or is about to get) for this moment. */
  step(state: GameState, seat: number, input: InputState, seq: number, dt: number): void {
    const me = state.players[seat];
    if (!me || state.status !== 'playing' || dt <= 0) return;
    this.history.push({ seq, input, dt });
    let total = this.history.reduce((sum, e) => sum + e.dt, 0);
    while (total > MAX_HISTORY && this.history.length > 1) total -= this.history.shift()!.dt;
    predictMove(state, me, input, dt);
  }

  /**
   * Right after a snapshot moved the own astronaut to the server's position. `shown` is where it
   * was drawn just before, so small corrections can be eased in.
   */
  reconcile(state: GameState, seat: number, ack: number, ackAge: number, shown: { x: number; y: number }): void {
    const me = state.players[seat];
    if (!me || state.status !== 'playing') return;
    // Older inputs are fully inside the server's position.
    this.history = this.history.filter((e) => e.seq >= ack);
    // Of the acknowledged input, skip what the server already stepped with.
    let skip = Math.max(0, ackAge - (this.consumed.seq === ack ? this.consumed.age : 0));
    this.consumed = { seq: ack, age: ackAge };
    const kept: Entry[] = [];
    for (const e of this.history) {
      let dt = e.dt;
      if (e.seq === ack && skip > 0) {
        const used = Math.min(skip, dt);
        skip -= used;
        dt -= used;
      }
      if (dt <= 1e-6) continue;
      kept.push({ ...e, dt });
    }
    this.history = kept;

    // Replay on top of the server's position. Timers that only drive drawing stay as the server sent them.
    const { invulnerable, leak, walkTime } = me;
    for (const e of kept) predictMove(state, me, e.input, e.dt);
    Object.assign(me, { invulnerable, leak, walkTime: Math.max(walkTime, me.walkTime) });

    const dx = me.x - shown.x;
    const dy = me.y - shown.y;
    if (Math.hypot(dx, dy) < EASE_BELOW) {
      me.x = shown.x + dx * EASE;
      me.y = shown.y + dy * EASE;
    }
  }
}

/** One movement step as the server would do it: busy while holding the action on a target, slower in a storm. */
function predictMove(state: GameState, p: Player, input: InputState, dt: number): void {
  const busy = input.interact && describe(state, p, findTarget(state, p))?.available === true;
  const storm = state.world.planet.theme.hazard === 'storm' ? stormIntensity(state.hazards.storm) : 0;
  const speed = CONFIG.player.speed * (1 - CONFIG.hazards.storm.speedPenalty * storm);
  movePlayer(state, p, busy ? 0 : input.moveX, busy ? 0 : input.moveY, speed, dt);
}
