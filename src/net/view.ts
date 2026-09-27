import { CONFIG } from '../config';
import { isFor, type GameEvent, type GameState, type Player, type Target } from '../game/state';
import type { OtherSnap, OwnSnap, Snapshot, TargetRef } from './protocol';

/**
 * What one player may see of a race, as a snapshot for the wire. The server sends nothing else,
 * so hidden information (empty bunkers, the other player's bombs, the other player off screen)
 * never reaches that player's browser. Pure: same state, same snapshot.
 */

/** How far beyond the edge of the screen the other astronaut and world effects are still sent. */
const SCREEN_MARGIN = 60;

/** True when a point is on or near the screen of a player standing at `p`. */
export function nearScreen(p: { x: number; y: number }, x: number, y: number): boolean {
  const { width, height } = CONFIG.view;
  return Math.abs(x - p.x) <= width / 2 + SCREEN_MARGIN && Math.abs(y - p.y) <= height / 2 + SCREEN_MARGIN;
}

/** Whether an event belongs in this player's snapshot: their own events and world effects near them. */
export function eventVisibleTo(event: GameEvent, viewer: Player): boolean {
  if (!isFor(event, viewer.id)) return false;
  if (event.type === 'burst') return nearScreen(viewer, event.x, event.y);
  // Saving and the star map are solo-only; nothing to send.
  return event.type !== 'progress';
}

export function snapshotFor(state: GameState, seat: number, tick: number, events: GameEvent[]): Snapshot {
  const me = state.players[seat];
  const other = state.players.find((p) => p.id !== seat);
  const race = state.race;
  if (!race) throw new Error('Snapshots are for race mode');
  const B = CONFIG.race.bomb;
  return {
    tick,
    time: state.time,
    elapsed: race.elapsed,
    status: state.status,
    result: race.result,
    me: ownSnap(me),
    other: other ? otherSnap(me, other) : { body: null, partsInstalled: 0 },
    creepers: state.world.creepers.map((c) => ({
      x: c.x, y: c.y, facing: c.facing, mode: c.mode,
      jump: c.jump ? { ...c.jump } : null,
      slide: c.slide ? { ...c.slide } : null,
    })),
    cells: state.world.bunkers.filter((b) => b.energyCell).map((b) => b.id),
    scrapTaken: state.world.scrap.filter((s) => s.taken).map((s) => s.id),
    hazards: {
      storm: state.hazards.storm,
      stormNext: state.hazards.stormNext,
      stormWarned: state.hazards.stormWarned,
      coldMultiplier: state.hazards.coldMultiplier,
      meteors: state.hazards.meteors.map((m) => ({ ...m })),
    },
    beacons: state.beacons.map((b) => ({ ...b })),
    bombs: race.bombs
      .filter((b) => b.owner === seat || Math.hypot(b.x - me.x, b.y - me.y) <= B.blinkRange)
      .map((b) => ({ ...b })),
    drop: { ...race.drop },
    events,
  };
}

function ownSnap(p: Player): OwnSnap {
  return {
    x: p.x, y: p.y, kx: p.kx, ky: p.ky, facing: p.facing, moving: p.moving, walkTime: p.walkTime,
    invulnerable: p.invulnerable, leak: p.leak, oxygen: p.oxygen, energy: p.energy,
    partsCarried: p.partsCarried, partsInstalled: p.partsInstalled, inventory: { ...p.inventory },
    lamp: p.lamp, target: targetRef(p.interaction.target), progress: p.interaction.progress,
    inPool: p.inPool, knownEmpty: [...p.knownEmpty], bombs: p.bombs,
  };
}

function otherSnap(viewer: Player, o: Player): OtherSnap {
  const body = nearScreen(viewer, o.x, o.y)
    ? { x: o.x, y: o.y, facing: o.facing, moving: o.moving, walkTime: o.walkTime, lamp: o.lamp, invulnerable: o.invulnerable, leak: o.leak }
    : null;
  return { body, partsInstalled: o.partsInstalled };
}

export function targetRef(t: Target | null): TargetRef | null {
  if (!t) return null;
  if (t.kind === 'bunker') return { kind: 'bunker', id: t.bunker.id };
  if (t.kind === 'bomb') return { kind: 'bomb', id: t.bomb.id };
  return { kind: t.kind };
}
