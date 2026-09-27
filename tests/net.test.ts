import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { shipOf, startRace, type GameState } from '../src/game/state';
import { step } from '../src/game/update';
import { applySnapshot, createMirror } from '../src/net/apply';
import { CODE_LETTERS, newRoomCode, normaliseRoomCode } from '../src/net/codes';
import { Match, sanitize } from '../src/net/match';
import { parseClientMessage, type ServerMessage, type Snapshot } from '../src/net/protocol';
import { eventVisibleTo, snapshotFor } from '../src/net/view';

const DT = 1 / 60;
const TICK = 1 / CONFIG.net.tickRate;

function calmRace(seed = 42): GameState {
  const s = startRace(seed);
  s.hazards.stormNext = 1e9;
  s.hazards.meteorTimer = 1e9;
  return s;
}

describe('what the server sends each player', () => {
  it('shows the other astronaut only near the screen, and their installed parts always', () => {
    const s = calmRace();
    const [a, b] = s.players;
    b.partsInstalled = 2;
    expect(snapshotFor(s, 0, 0, []).other).toEqual({ body: null, partsInstalled: 2 });
    b.x = a.x + 100;
    b.y = a.y;
    expect(snapshotFor(s, 0, 0, []).other.body).toMatchObject({ x: b.x, y: b.y });
  });

  it('never sends which bunkers the other player emptied', () => {
    const s = calmRace();
    const [, b] = s.players;
    const bunker = s.world.bunkers.find((x) => x.kind === 'parts' && x.id !== 0)!;
    bunker.looted = true;
    b.knownEmpty.push(bunker.id);
    const snap = snapshotFor(s, 0, 0, []);
    expect(snap.me.knownEmpty).toEqual([]);
    const wire = JSON.stringify(snap);
    expect(wire).not.toContain('looted');
    expect(wire).not.toContain('knownEmpty":[' + bunker.id);
  });

  it('sends own bombs always and the other player\'s bombs only within the blink radius', () => {
    const s = calmRace();
    const [a] = s.players;
    const race = s.race!;
    race.bombs.push({ id: 1, owner: 0, x: a.x + 900, y: a.y, armIn: 0 });
    race.bombs.push({ id: 2, owner: 1, x: a.x + 900, y: a.y, armIn: 0 });
    race.bombs.push({ id: 3, owner: 1, x: a.x + CONFIG.race.bomb.blinkRange - 5, y: a.y, armIn: 0 });
    expect(snapshotFor(s, 0, 0, []).bombs.map((b) => b.id)).toEqual([1, 3]);
    expect(snapshotFor(s, 1, 0, []).bombs.map((b) => b.id)).toContain(2);
  });

  it('keeps the other player\'s toasts and far-away bursts out', () => {
    const s = calmRace();
    const [a, b] = s.players;
    b.x = a.x + 1000;
    expect(eventVisibleTo({ type: 'toast', text: 'x', player: 1 }, a)).toBe(false);
    expect(eventVisibleTo({ type: 'toast', text: 'x', player: 0 }, a)).toBe(true);
    expect(eventVisibleTo({ type: 'toast', text: 'x' }, a)).toBe(true);
    expect(eventVisibleTo({ type: 'burst', x: b.x, y: b.y, color: '#fff', count: 1 }, a)).toBe(false);
    expect(eventVisibleTo({ type: 'burst', x: a.x + 50, y: a.y, color: '#fff', count: 1 }, a)).toBe(true);
    expect(eventVisibleTo({ type: 'progress' }, a)).toBe(false);
  });

  it('delivers each player only their own events through the room', () => {
    const { match, snaps } = room();
    match.join(0);
    match.join(0);
    const b = match.state!.players[1];
    b.inventory.bottles = 1;
    b.oxygen = 50;
    match.input(1, { ...NO_INPUT, useBottle: true }, 0);
    match.tick(TICK);
    match.tick(2 * TICK);
    const toasts = (seat: number) => snaps(seat).flatMap((x) => x.events).filter((e) => e.type === 'toast');
    expect(toasts(1).length).toBeGreaterThan(0);
    expect(toasts(0)).toEqual([]);
  });
});

describe('the browser mirror', () => {
  function played(): GameState {
    const s = calmRace(7);
    const inputs: InputState[] = [{ ...NO_INPUT, moveX: 1 }, { ...NO_INPUT, moveY: -1 }];
    for (let i = 0; i < 120; i++) step(s, inputs, DT);
    return s;
  }

  it('matches the server for everything this player may see', () => {
    const server = played();
    const mirror = createMirror(7, 0);
    applySnapshot(mirror, snapshotFor(server, 0, 1, []), 0);
    const [me, other] = mirror.players;
    expect({ x: me.x, y: me.y, oxygen: me.oxygen, energy: me.energy }).toEqual({
      x: server.players[0].x, y: server.players[0].y, oxygen: server.players[0].oxygen, energy: server.players[0].energy,
    });
    expect(mirror.world.creepers.map((c) => [c.x, c.y, c.mode])).toEqual(server.world.creepers.map((c) => [c.x, c.y, c.mode]));
    expect(mirror.time).toBe(server.time);
    expect(mirror.viewer).toBe(0);
    // The other player is far away at their own ship: parked out of sight.
    expect(other.x).toBeLessThan(0);
  });

  it('shows a bunker as empty only when this player knows it is', () => {
    const server = calmRace();
    const bunker = server.world.bunkers.find((x) => x.kind === 'parts' && x.id !== 0)!;
    bunker.looted = true;
    const mirror = createMirror(42, 1);
    applySnapshot(mirror, snapshotFor(server, 1, 0, []), 1);
    expect(mirror.world.bunkers[bunker.id].looted).toBe(false);
    server.players[1].knownEmpty.push(bunker.id);
    applySnapshot(mirror, snapshotFor(server, 1, 0, []), 1);
    expect(mirror.world.bunkers[bunker.id].looted).toBe(true);
  });

  it('points a bomb target at the mirror\'s own bomb', () => {
    const server = calmRace();
    const [a] = server.players;
    const bomb = { id: 5, owner: 1, x: a.x, y: a.y - 23, armIn: 0 };
    server.race!.bombs.push(bomb);
    a.interaction.target = { kind: 'bomb', bomb };
    const mirror = createMirror(42, 0);
    applySnapshot(mirror, snapshotFor(server, 0, 0, []), 0);
    const target = mirror.players[0].interaction.target;
    expect(target?.kind).toBe('bomb');
    expect(target?.kind === 'bomb' && target.bomb).toBe(mirror.race!.bombs[0]);
  });
});

/** A match with an inbox per seat, driven like the host would. */
function room(seeds = [42, 43, 44]) {
  const inbox: ServerMessage[][] = [[], []];
  let next = 0;
  const match = new Match('ABCD', (seat, m) => inbox[seat].push(m), () => seeds[next++]);
  const types = (seat: number) => inbox[seat].map((m) => m.t);
  const snaps = (seat: number) => inbox[seat].filter((m): m is { t: 'snap'; snap: Snapshot } => m.t === 'snap').map((m) => m.snap);
  return { match, inbox, types, snaps };
}

describe('a race room', () => {
  it('waits for the second player, then starts the same planet for both', () => {
    const { match, inbox, types } = room();
    expect(match.join(0)).toBe(0);
    expect(types(0)).toEqual(['welcome', 'waiting']);
    expect(match.ticking).toBe(false);
    expect(match.join(1)).toBe(1);
    expect(match.ticking).toBe(true);
    expect(inbox[0].at(-1)).toEqual({ t: 'start', seed: 42, seat: 0 });
    expect(inbox[1].at(-1)).toEqual({ t: 'start', seed: 42, seat: 1 });
    expect(match.join(2)).toBeNull();
  });

  it('frees the seat of a player who leaves before the race starts', () => {
    const { match } = room();
    match.join(0);
    match.leave(0, 1);
    expect(match.join(2)).toBe(0);
    expect(match.join(3)).toBe(1);
    expect(match.ticking).toBe(true);
  });

  it('steps with each player\'s input and sends a snapshot every few ticks', () => {
    const { match, snaps } = room();
    match.join(0);
    match.join(0);
    const startX = match.state!.players[0].x;
    match.input(0, { ...NO_INPUT, moveX: 1 }, 0);
    for (let i = 0; i < 20; i++) match.tick(i * TICK);
    expect(match.state!.players[0].x).toBeGreaterThan(startX);
    expect(snaps(0)).toHaveLength(20 / CONFIG.net.snapshotEvery);
    expect(snaps(0).at(-1)!.me.x).toBe(match.state!.players[0].x);
  });

  it('applies a quick key press once, even when it came and went between two ticks', () => {
    const { match } = room();
    match.join(0);
    match.join(0);
    match.tick(0);
    const lamp = match.state!.players[1].lamp;
    match.input(1, { ...NO_INPUT, toggleLamp: true }, 0.01);
    match.input(1, NO_INPUT, 0.02);
    match.tick(TICK);
    expect(match.state!.players[1].lamp).toBe(!lamp);
    match.tick(2 * TICK);
    expect(match.state!.players[1].lamp).toBe(!lamp);
  });

  it('ignores a client that floods it with input', () => {
    const { match } = room();
    match.join(0);
    match.join(0);
    for (let i = 0; i < CONFIG.net.maxInputsPerSecond * 2; i++) match.input(0, NO_INPUT, 0.01);
    match.input(0, { ...NO_INPUT, moveX: 1 }, 0.02);
    match.tick(TICK);
    expect(match.state!.players[0].moving).toBe(false);
  });

  it('only crafts at the player\'s own ship', () => {
    const { match } = room();
    match.join(0);
    match.join(0);
    const s = match.state!;
    const a = s.players[0];
    a.inventory.scrap = 10;
    a.x = s.world.width / 2;
    match.craft(0, 'bomb');
    expect(a.bombs).toBe(0);
    const ship = shipOf(s, a);
    a.x = ship.x;
    a.y = ship.y + 20;
    match.craft(0, 'bomb');
    expect(a.bombs).toBe(1);
  });

  it('keeps a seat for a player who drops out and comes back in time', () => {
    const { match, types } = room();
    match.join(0);
    match.join(0);
    match.leave(1, 5);
    expect(types(0)).toContain('opponent-away');
    match.tick(5 + CONFIG.net.reconnectSeconds - 1);
    expect(match.state!.status).toBe('playing');
    expect(match.join(6, 1)).toBe(1);
    expect(types(1).slice(-2)).toEqual(['start', 'snap']);
    expect(types(0)).toContain('opponent-back');
  });

  it('gives the race to the player who stayed when the other does not come back', () => {
    const { match, snaps } = room();
    match.join(0);
    match.join(0);
    match.leave(1, 5);
    match.tick(5 + CONFIG.net.reconnectSeconds);
    expect(match.phase).toBe('over');
    expect(snaps(0).at(-1)!.result).toEqual({ winner: 0, reason: 'left' });
    expect(match.ticking).toBe(false);
  });

  it('starts a new planet when both players ask for a rematch', () => {
    const { match, inbox, types } = room();
    match.join(0);
    match.join(0);
    match.state!.players[1].oxygen = 0.0001;
    match.tick(TICK);
    expect(match.phase).toBe('over');
    match.rematch(0);
    expect(types(1)).toContain('rematch-asked');
    expect(match.phase).toBe('over');
    match.rematch(1);
    expect(match.phase).toBe('playing');
    expect(inbox[0].at(-1)).toEqual({ t: 'start', seed: 43, seat: 0 });
    expect(match.state!.players[1].oxygen).toBe(100);
  });
});

describe('untrusted input', () => {
  it('clamps movement and turns anything odd into false', () => {
    expect(sanitize({ moveX: 5, moveY: Number.NaN, interact: 'yes' as unknown as boolean, placeBomb: true })).toEqual({
      ...NO_INPUT, moveX: 1, moveY: 0, placeBomb: true,
    });
    expect(sanitize(null)).toEqual(NO_INPUT);
  });

  it('drops malformed messages', () => {
    expect(parseClientMessage('{"t":"input","input":{"moveX":1}}')).toEqual({ t: 'input', input: { moveX: 1 } });
    expect(parseClientMessage('{"t":"rematch"}')).toEqual({ t: 'rematch' });
    for (const bad of ['', 'nope', '{"t":"hack"}', '{"t":"craft"}', 42, 'x'.repeat(3000)]) expect(parseClientMessage(bad)).toBeNull();
  });
});

describe('room codes', () => {
  it('are four letters without look-alikes', () => {
    let i = 0;
    const values = [0, 0.3, 0.6, 0.99];
    const code = newRoomCode(() => values[i++]);
    expect(code).toHaveLength(4);
    expect([...code].every((c) => CODE_LETTERS.includes(c))).toBe(true);
    for (const c of 'ILO01') expect(CODE_LETTERS).not.toContain(c);
  });

  it('accept what a player types, in any case and with spaces', () => {
    expect(normaliseRoomCode(' ab cd ')).toBe('ABCD');
    expect(normaliseRoomCode('ABC')).toBeNull();
    expect(normaliseRoomCode('AB1D')).toBeNull();
  });
});
