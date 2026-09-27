import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { Keyboard } from '../src/render/keyboard';
import { craft, recipesFor } from '../src/game/crafting';
import { landOn, startRace, type GameState, type Player } from '../src/game/state';
import { step } from '../src/game/update';
import { bombPlacementProblem } from '../src/systems/bombs';
import { describe as describeAction } from '../src/systems/interaction';

const DT = 1 / 60;
const B = CONFIG.race.bomb;
const HOLD: InputState = { ...NO_INPUT, interact: true };
const BOMB: InputState = { ...NO_INPUT, placeBomb: true };

function calmRace(): GameState {
  const s = startRace(42);
  s.world.creepers.length = 0;
  s.hazards.stormNext = 1e9;
  s.hazards.meteorTimer = 1e9;
  return s;
}

/** A bunker away from both ships, where a bomb may lie. */
function bombSpot(s: GameState) {
  const bunker = s.world.bunkers.find((b) => b.kind === 'parts' && b.id !== 0)!;
  return { bunker, x: bunker.x + 30, y: bunker.y };
}

function moveTo(p: Player, x: number, y: number): void {
  p.x = x;
  p.y = y;
}

/** Steps with one player's input for a while; the other player stands still. */
function run(s: GameState, who: number, input: InputState, seconds: number): void {
  const inputs = s.players.map((_, i) => (i === who ? input : NO_INPUT));
  for (let t = 0; t < seconds && s.status === 'playing'; t += DT) step(s, inputs, DT);
}

/** Puts an armed bomb of `owner` at (x, y). */
function armedBomb(s: GameState, owner: number, x: number, y: number) {
  const race = s.race!;
  const bomb = { id: race.nextBombId++, owner, x, y, armIn: 0 };
  race.bombs.push(bomb);
  return bomb;
}

describe('making a bomb', () => {
  it('is a race recipe only', () => {
    expect(recipesFor('race').map((r) => r.id)).toContain('bomb');
    expect(recipesFor('solo').map((r) => r.id)).not.toContain('bomb');
    const solo = landOn(0);
    solo.players[0].inventory.scrap = 20;
    expect(craft(solo, 'bomb').ok).toBe(false);
    expect(solo.players[0].inventory.scrap).toBe(20);
  });

  it('costs scrap, and you carry one at most', () => {
    const s = calmRace();
    const a = s.players[0];
    a.inventory.scrap = 10;
    expect(craft(s, 'bomb', a).ok).toBe(true);
    expect(a.bombs).toBe(1);
    expect(a.inventory.scrap).toBe(10 - B.scrap);
    expect(craft(s, 'bomb', a).ok).toBe(false);
    expect(a.bombs).toBe(B.carryMax);
  });

  it('leaves room for about two bombs per match', () => {
    const scrapOnPlanet = CONFIG.crafting.scrapPerPlanet;
    expect(Math.floor(scrapOnPlanet / B.scrap)).toBe(2);
  });
});

describe('placing a bomb', () => {
  it('needs a bomb, a bunker close by and no ship close by', () => {
    const s = calmRace();
    const a = s.players[0];
    const spot = bombSpot(s);
    moveTo(a, spot.x, spot.y);
    expect(bombPlacementProblem(s, a)).toContain('geen bom');
    a.bombs = 1;
    expect(bombPlacementProblem(s, a)).toBeNull();
    moveTo(a, spot.bunker.x + B.placeNearBunker + 10, spot.bunker.y);
    expect(bombPlacementProblem(s, a)).toContain('bij een bunker');
    const ship = s.world.ships[0];
    moveTo(a, ship.x + 20, ship.y);
    expect(bombPlacementProblem(s, a)).not.toBeNull();
  });

  it('puts it at your feet, arming after a few seconds', () => {
    const s = calmRace();
    const a = s.players[0];
    const spot = bombSpot(s);
    moveTo(a, spot.x, spot.y);
    a.bombs = 1;
    step(s, [BOMB, NO_INPUT], DT);
    expect(a.bombs).toBe(0);
    expect(s.race!.bombs).toHaveLength(1);
    const bomb = s.race!.bombs[0];
    expect(bomb).toMatchObject({ owner: 0, x: spot.x, y: spot.y });
    // Standing on it while it arms is safe; walking away in time too.
    run(s, 0, NO_INPUT, B.armSeconds * 0.8);
    expect(s.status).toBe('playing');
    run(s, 0, { ...NO_INPUT, moveX: 1 }, 1);
    run(s, 0, NO_INPUT, B.armSeconds);
    expect(bomb.armIn).toBeLessThanOrEqual(0);
    expect(s.status).toBe('playing');
  });

  it('does nothing outside a race', () => {
    const s = landOn(0);
    s.players[0].bombs = 1;
    step(s, BOMB, DT);
    expect(s.players[0].bombs).toBe(1);
    expect(s.race).toBeNull();
  });
});

describe('an armed bomb', () => {
  it('ends the race for whoever comes too close', () => {
    const s = calmRace();
    const spot = bombSpot(s);
    armedBomb(s, 0, spot.x, spot.y);
    moveTo(s.players[1], spot.x + B.triggerRadius - 2, spot.y);
    step(s, NO_INPUT, DT);
    expect(s.status).toBe('over');
    expect(s.race!.result).toEqual({ winner: 0, reason: 'death' });
    expect(s.race!.blownUp).toEqual([1]);
    expect(s.race!.bombs).toHaveLength(0);
    expect(s.events.some((e) => e.type === 'sound' && e.name === 'explosion')).toBe(true);
  });

  it('does not spare its owner', () => {
    const s = calmRace();
    const spot = bombSpot(s);
    armedBomb(s, 0, spot.x, spot.y);
    moveTo(s.players[0], spot.x, spot.y + 5);
    step(s, NO_INPUT, DT);
    expect(s.race!.result).toEqual({ winner: 1, reason: 'death' });
  });

  it('is never set off by creepers', () => {
    const s = startRace(42);
    const c = s.world.creepers[1];
    armedBomb(s, 0, c.x, c.y);
    for (const p of s.players) p.oxygen = 1e9;
    step(s, NO_INPUT, DT);
    expect(s.race!.bombs).toHaveLength(1);
  });
});

describe('defusing a bomb', () => {
  it('works from the ring just outside the trigger radius and puts the bomb in your pack', () => {
    const s = calmRace();
    const spot = bombSpot(s);
    const bomb = armedBomb(s, 0, spot.x, spot.y);
    const b = s.players[1];
    moveTo(b, spot.x, spot.y - (B.defuseMin + B.defuseMax) / 2);
    step(s, NO_INPUT, DT);
    expect(b.interaction.target).toEqual({ kind: 'bomb', bomb });
    run(s, 1, HOLD, B.defuseSeconds * 0.7);
    expect(s.race!.bombs).toHaveLength(1);
    run(s, 1, HOLD, B.defuseSeconds * 0.5);
    expect(s.race!.bombs).toHaveLength(0);
    expect(b.bombs).toBe(1);
    expect(s.status).toBe('playing');
  });

  it('comes before opening the bunker it guards', () => {
    const s = calmRace();
    const { bunker } = bombSpot(s);
    const bomb = armedBomb(s, 0, bunker.x, bunker.y + 14 + B.triggerRadius + 11);
    const b = s.players[1];
    moveTo(b, bunker.x, bunker.y + 14);
    step(s, NO_INPUT, DT);
    expect(b.interaction.target).toEqual({ kind: 'bomb', bomb });
  });

  it('is not possible while carrying a bomb already', () => {
    const s = calmRace();
    const spot = bombSpot(s);
    armedBomb(s, 0, spot.x, spot.y);
    const b = s.players[1];
    b.bombs = B.carryMax;
    moveTo(b, spot.x, spot.y - 23);
    step(s, NO_INPUT, DT);
    expect(describeAction(s, b, b.interaction.target)?.action).toBe('none');
    run(s, 1, HOLD, B.defuseSeconds + 0.5);
    expect(s.race!.bombs).toHaveLength(1);
  });
});

describe('bomb keys', () => {
  it('are B for player 1 and comma for player 2, and solo has none', () => {
    const listeners: ((e: unknown) => void)[] = [];
    const target = { addEventListener: (type: string, fn: (e: unknown) => void) => { if (type === 'keydown') listeners.push(fn); } };
    const kb = new Keyboard(target as unknown as Window);
    const press = (code: string) => listeners.forEach((fn) => fn({ code, repeat: false, preventDefault: () => {} }));
    press('KeyB');
    press('Comma');
    const [one, two] = kb.pollSplit();
    expect(one.placeBomb).toBe(true);
    expect(two.placeBomb).toBe(true);
    press('KeyB');
    expect(kb.poll().placeBomb).toBe(false);
  });
});
