import { CONFIG } from '../config';
import type { GameState } from '../game/state';

/**
 * Snapshots arrive a few times per second; this glides the astronauts and creepers between them,
 * so movement on screen stays smooth. Each frame draws a point between where things were drawn
 * when the last snapshot arrived and where that snapshot put them. Visual only.
 */

interface Pos { x: number; y: number }

/** Beyond this jump (a teleport, or coming into sight) things are placed at once, not glided. */
const SNAP_DISTANCE = 80;
/** Positions this far off the map mean "out of sight" (see net/apply.ts). */
const OFF_MAP = -1e5;

function positions(state: GameState): Pos[] {
  return [...state.players, ...state.world.creepers].map((o) => ({ x: o.x, y: o.y }));
}

function place(state: GameState, list: Pos[]): void {
  const all = [...state.players, ...state.world.creepers];
  list.forEach((p, i) => {
    if (all[i]) {
      all[i].x = p.x;
      all[i].y = p.y;
    }
  });
}

export class Smoother {
  private from: Pos[] = [];
  private to: Pos[] = [];
  private arrivedAt = 0;
  /** Seconds between snapshots. */
  private readonly interval = CONFIG.net.snapshotEvery / CONFIG.net.tickRate;

  /** `own` is the player id whose astronaut is predicted instead (see predict.ts), so left alone here. */
  constructor(private readonly own = -1) {}

  /** Call right before a snapshot is applied: remembers where everything is drawn now. */
  before(state: GameState): void {
    this.from = positions(state);
  }

  /** Call right after a snapshot is applied, with the current time in seconds. */
  after(state: GameState, now: number): void {
    this.to = positions(state);
    this.arrivedAt = now;
    this.frame(state, now);
  }

  /** Call every frame before drawing. */
  frame(state: GameState, now: number): void {
    if (this.to.length === 0) return;
    const t = Math.min(1, Math.max(0, (now - this.arrivedAt) / this.interval));
    place(state, this.to.map((to, i) => {
      if (i === this.own) return { x: state.players[i].x, y: state.players[i].y };
      const from = this.from[i];
      if (!from || from.x < OFF_MAP || to.x < OFF_MAP || Math.hypot(to.x - from.x, to.y - from.y) > SNAP_DISTANCE) return to;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }));
  }
}
