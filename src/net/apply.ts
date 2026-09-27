import { startRace, type GameState, type Target } from '../game/state';
import type { Snapshot, TargetRef } from './protocol';

/**
 * The browser side of a network race. It does not simulate: it keeps a mirror GameState whose
 * world comes from the match seed and whose moving parts come from the server's snapshots, so the
 * renderer, HUD, minimap and tips work exactly as in a local race.
 */

/** Where the other astronaut is parked while out of sight: far off the map, so nothing draws it. */
const OUT_OF_SIGHT = -1e6;

/** A fresh mirror for this seat, before the first snapshot. */
export function createMirror(seed: number, seat: number): GameState {
  const state = startRace(seed);
  state.viewer = seat;
  return state;
}

/** Overwrites the mirror's moving parts with a snapshot and queues its events for the screen. */
export function applySnapshot(state: GameState, snap: Snapshot, seat: number): void {
  const race = state.race!;
  state.viewer = seat;
  state.time = snap.time;
  state.status = snap.status;
  race.elapsed = snap.elapsed;
  race.result = snap.result;

  const me = state.players[seat];
  const { target, progress, ...own } = snap.me;
  Object.assign(me, own, { inventory: { ...own.inventory }, knownEmpty: [...own.knownEmpty] });

  const other = state.players.find((p) => p.id !== seat);
  if (other) {
    other.partsInstalled = snap.other.partsInstalled;
    if (snap.other.body) Object.assign(other, snap.other.body);
    else other.x = other.y = OUT_OF_SIGHT;
  }

  snap.creepers.forEach((c, i) => {
    const creeper = state.world.creepers[i];
    if (!creeper) return;
    creeper.x = c.x;
    creeper.y = c.y;
    creeper.facing = c.facing;
    creeper.mode = c.mode;
    creeper.jump = c.jump ? { ...c.jump } : null;
    creeper.slide = c.slide ? { ...c.slide } : null;
  });

  // Parts bunkers look empty only when this player knows; the mirror never learns more.
  const known = new Set(snap.me.knownEmpty);
  const cells = new Set(snap.cells);
  for (const b of state.world.bunkers) {
    if (b.kind === 'parts') b.looted = known.has(b.id);
    else b.energyCell = cells.has(b.id);
  }
  const taken = new Set(snap.scrapTaken);
  for (const s of state.world.scrap) s.taken = taken.has(s.id);

  Object.assign(state.hazards, snap.hazards, { meteors: snap.hazards.meteors.map((m) => ({ ...m })) });
  state.beacons = snap.beacons.map((b) => ({ ...b }));
  race.bombs = snap.bombs.map((b) => ({ ...b }));
  race.drop = { ...snap.drop };
  // After the bombs, so a bomb target points at the mirror's own bomb object.
  me.interaction.target = resolveTarget(state, target);
  me.interaction.progress = progress;
  state.events.push(...snap.events);
}

function resolveTarget(state: GameState, ref: TargetRef | null): Target | null {
  if (!ref) return null;
  if (ref.kind === 'ship' || ref.kind === 'drop') return { kind: ref.kind };
  if (ref.kind === 'bunker') {
    const bunker = state.world.bunkers[ref.id];
    return bunker ? { kind: 'bunker', bunker } : null;
  }
  const bomb = state.race!.bombs.find((b) => b.id === ref.id);
  return bomb ? { kind: 'bomb', bomb } : null;
}
