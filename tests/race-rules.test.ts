import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Keyboard, NO_INPUT, type InputState } from '../src/core/input';
import { isFor, landOn, localPlayer, shipOf, startRace, type GameState, type Player } from '../src/game/state';
import { nextTip } from '../src/game/tutorial';
import { step } from '../src/game/update';
import { describe as describeAction } from '../src/systems/interaction';

const DT = 1 / 60;
const HOLD: InputState = { ...NO_INPUT, interact: true };

/** A race without creepers or hazards, so a test only measures the rule it is about. */
function calmRace(): GameState {
  const s = startRace(42);
  s.world.creepers.length = 0;
  s.hazards.stormNext = 1e9;
  s.hazards.meteorTimer = 1e9;
  return s;
}

function atOwnShip(s: GameState, p: Player): void {
  const ship = shipOf(s, p);
  p.x = ship.x;
  p.y = ship.y + 20;
}

function run(s: GameState, seconds: number, inputs: InputState[]): void {
  for (let t = 0; t < seconds && s.status === 'playing'; t += DT) step(s, inputs, DT);
}

describe('winning a race', () => {
  it('goes to the first player who launches a repaired ship', () => {
    const s = calmRace();
    const b = s.players[1];
    atOwnShip(s, b);
    b.partsCarried = b.partsInstalled = CONFIG.race.partsToWin;
    b.energy = 40;
    step(s, NO_INPUT, DT);
    expect(describeAction(s, b, b.interaction.target)?.action).toBe('launch');
    run(s, 3, [NO_INPUT, HOLD]);
    expect(s.status).toBe('over');
    expect(s.race?.result).toEqual({ winner: 1, reason: 'launch' });
    expect(b.energy).toBeCloseTo(40 - CONFIG.energy.flightCost, 0);
  });

  it('needs energy for the flight', () => {
    const s = calmRace();
    const a = s.players[0];
    atOwnShip(s, a);
    a.partsCarried = a.partsInstalled = CONFIG.race.partsToWin;
    a.energy = CONFIG.energy.flightCost - 1;
    step(s, NO_INPUT, DT);
    const info = describeAction(s, a, a.interaction.target);
    expect(info?.action).toBe('starmap');
    expect(info?.text).toContain('te weinig energie');
    run(s, 3, [HOLD, NO_INPUT]);
    expect(s.status).toBe('playing');
  });

  it('installs the last part without touching the solo campaign', () => {
    const s = calmRace();
    const a = s.players[0];
    atOwnShip(s, a);
    a.partsInstalled = CONFIG.race.partsToWin - 1;
    a.partsCarried = CONFIG.race.partsToWin;
    a.energy = 60;
    run(s, 2, [HOLD, NO_INPUT]);
    expect(a.partsInstalled).toBe(CONFIG.race.partsToWin);
    expect(s.campaign.unlocked).toBe(0);
    expect(s.status).toBe('playing');
    expect(s.events.some((e) => e.type === 'toast' && e.text.includes('op te stijgen'))).toBe(true);
  });
});

describe('losing a race', () => {
  it('is what happens to a player whose oxygen runs out', () => {
    const s = calmRace();
    s.players[1].oxygen = 0.0001;
    step(s, NO_INPUT, DT);
    expect(s.status).toBe('over');
    expect(s.race?.result).toEqual({ winner: 0, reason: 'death' });
  });

  it('is a draw when both die in the same moment', () => {
    const s = calmRace();
    for (const p of s.players) p.oxygen = 0.0001;
    step(s, NO_INPUT, DT);
    expect(s.race?.result).toEqual({ winner: null, reason: 'death' });
  });

  it('never rolls back like a solo death', () => {
    const s = calmRace();
    s.players[0].oxygen = 0.0001;
    step(s, NO_INPUT, DT);
    expect(s.status).not.toBe('dead');
  });
});

describe('the time limit', () => {
  function atLimit(parts: [number, number], energy: [number, number]): GameState {
    const s = calmRace();
    s.players.forEach((p, i) => {
      p.partsInstalled = parts[i];
      p.energy = energy[i];
    });
    s.race!.elapsed = CONFIG.race.timeLimit - DT / 2;
    step(s, NO_INPUT, DT);
    return s;
  }

  it('gives the win to the player with the most installed parts', () => {
    expect(atLimit([1, 2], [90, 10]).race?.result).toEqual({ winner: 1, reason: 'time' });
  });

  it('lets energy break a tie in parts', () => {
    expect(atLimit([2, 2], [40.9, 35]).race?.result).toEqual({ winner: 0, reason: 'time' });
  });

  it('is a draw when parts and whole energy points are level', () => {
    expect(atLimit([2, 2], [40.2, 40.8]).race?.result).toEqual({ winner: null, reason: 'time' });
  });

  it('does not end the race early', () => {
    const s = calmRace();
    s.race!.elapsed = CONFIG.race.timeLimit - 5;
    step(s, NO_INPUT, DT);
    expect(s.status).toBe('playing');
  });
});

describe('what each player sees', () => {
  it('addresses a player\'s own toasts and sounds to them', () => {
    const s = calmRace();
    const b = s.players[1];
    b.inventory.bottles = 1;
    b.oxygen = 50;
    step(s, [NO_INPUT, { ...NO_INPUT, useBottle: true }], DT);
    const toast = s.events.find((e) => e.type === 'toast');
    expect(toast && 'player' in toast ? toast.player : undefined).toBe(1);
    expect(isFor(toast!, 1)).toBe(true);
    expect(isFor(toast!, 0)).toBe(false);
    expect(s.events.filter((e) => e.type === 'burst').every((e) => isFor(e, 0) && isFor(e, 1))).toBe(true);
  });

  it('follows the viewer', () => {
    const s = calmRace();
    expect(localPlayer(s)).toBe(s.players[0]);
    s.viewer = 1;
    expect(localPlayer(s)).toBe(s.players[1]);
  });

  it('shows race tips in a race and campaign tips only in solo play', () => {
    const race = calmRace();
    expect(nextTip(race, { secondsOnPlanet: 5 }, new Set())?.id).toBe('race-goal');
    const repaired = calmRace();
    repaired.players[0].partsInstalled = CONFIG.race.partsToWin;
    const seen = new Set(['race-goal', 'race-switch', 'move']);
    repaired.players[0].x = repaired.world.width / 2;
    repaired.players[0].y = 20;
    const tip = nextTip(repaired, { secondsOnPlanet: 5 }, seen);
    expect(tip?.id).not.toBe('starmap');
    const solo = landOn(0);
    expect(nextTip(solo, { secondsOnPlanet: 5 }, new Set())?.id).toBe('move');
  });
});

describe('two players on one keyboard', () => {
  /** A stand-in for window: collects listeners so the test can press keys. */
  function fakeWindow() {
    const listeners = new Map<string, ((e: unknown) => void)[]>();
    const target = {
      addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    };
    const fire = (type: string, code: string, repeat = false) => {
      for (const fn of listeners.get(type) ?? []) fn({ code, repeat, preventDefault: () => {} });
    };
    return { target: target as unknown as Window, down: (c: string) => fire('keydown', c), up: (c: string) => fire('keyup', c) };
  }

  it('gives player 1 WASD and player 2 the arrows', () => {
    const w = fakeWindow();
    const kb = new Keyboard(w.target);
    w.down('KeyD');
    w.down('ArrowLeft');
    w.down('Enter');
    const [one, two] = kb.pollSplit();
    expect(one.moveX).toBe(1);
    expect(two.moveX).toBe(-1);
    expect(two.interact).toBe(true);
    expect(one.interact).toBe(false);
  });

  it('fires player 2\'s item keys once per press', () => {
    const w = fakeWindow();
    const kb = new Keyboard(w.target);
    w.down('Slash');
    w.down('ShiftRight');
    const [one, two] = kb.pollSplit();
    expect(two.useBottle).toBe(true);
    expect(two.toggleLamp).toBe(true);
    expect(one.useBottle).toBe(false);
    expect(kb.pollSplit()[1].useBottle).toBe(false);
  });

  it('still lets solo play walk with the arrows or WASD', () => {
    const w = fakeWindow();
    const kb = new Keyboard(w.target);
    w.down('ArrowRight');
    expect(kb.poll().moveX).toBe(1);
    w.up('ArrowRight');
    w.down('KeyW');
    w.down('KeyF');
    const input = kb.poll();
    expect(input.moveY).toBe(-1);
    expect(input.toggleLamp).toBe(true);
  });
});
