import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { landOn, looksLooted, startRace, type GameState, type Player } from '../src/game/state';
import { step } from '../src/game/update';
import { describe as describeAction } from '../src/systems/interaction';
import type { Bunker } from '../src/world/types';

const DT = 1 / 60;
const HOLD: InputState = { ...NO_INPUT, interact: true };

function calmRace(): GameState {
  const s = startRace(42);
  s.world.creepers.length = 0;
  s.hazards.stormNext = 1e9;
  s.hazards.meteorTimer = 1e9;
  return s;
}

function standAtBunker(p: Player, b: Bunker): void {
  p.x = b.x;
  p.y = b.y + 14;
}

/** Holds the action for one player (the other does nothing) until it completes or time runs out. */
function hold(s: GameState, who: number, seconds: number): void {
  const inputs = s.players.map((_, i) => (i === who ? HOLD : NO_INPUT));
  for (let t = 0; t < seconds; t += DT) step(s, inputs, DT);
}

describe('hidden empty bunkers in a race', () => {
  it('never show the other player that a parts bunker was emptied', () => {
    const s = calmRace();
    const [a, b] = s.players;
    const bunker = s.world.bunkers.find((x) => x.kind === 'parts' && x.id !== 0)!;
    standAtBunker(b, bunker);
    hold(s, 1, CONFIG.interaction.openPartsSeconds + 0.2);
    expect(b.partsCarried).toBe(1);
    expect(bunker.looted).toBe(true);
    expect(looksLooted(s, b, bunker)).toBe(true);
    expect(looksLooted(s, a, bunker)).toBe(false);
    standAtBunker(a, bunker);
    step(s, NO_INPUT, DT);
    expect(describeAction(s, a, a.interaction.target)?.action).toBe('open');
  });

  it('cost the full opening time to find empty, and are remembered after that', () => {
    const s = calmRace();
    const [a] = s.players;
    const bunker = s.world.bunkers.find((x) => x.kind === 'parts' && x.id !== 0)!;
    bunker.looted = true;
    standAtBunker(a, bunker);
    hold(s, 0, CONFIG.interaction.openPartsSeconds * 0.8);
    expect(a.knownEmpty).not.toContain(bunker.id);
    hold(s, 0, CONFIG.interaction.openPartsSeconds * 0.4);
    expect(a.knownEmpty).toContain(bunker.id);
    expect(a.partsCarried).toBe(0);
    expect(s.events.some((e) => e.type === 'toast' && e.text.startsWith('Leeg'))).toBe(true);
    expect(describeAction(s, a, a.interaction.target)?.action).toBe('none');
  });

  it('leave solo bunkers as they were: an empty one looks empty', () => {
    const s = landOn(0);
    const bunker = s.world.bunkers.find((x) => x.kind === 'parts')!;
    expect(looksLooted(s, s.players[0], bunker)).toBe(false);
    bunker.looted = true;
    expect(looksLooted(s, s.players[0], bunker)).toBe(true);
    expect(s.players[0].knownEmpty).toEqual([]);
  });

  it('never hide supply bunkers: energy cells stay visible', () => {
    const s = calmRace();
    for (const b of s.world.bunkers.filter((x) => x.kind === 'supply')) expect(looksLooted(s, s.players[0], b)).toBe(false);
  });
});

describe('the supply drop', () => {
  it('lands at the start of the second night, well before the time limit', () => {
    const s = calmRace();
    const drop = s.race!.drop;
    expect(drop.landsAt).toBe(CONFIG.day.lengthSeconds * (1 + CONFIG.race.dropHour / 24));
    const secondsIn = drop.landsAt - s.time;
    expect(secondsIn).toBeGreaterThan(CONFIG.race.timeLimit / 3);
    expect(secondsIn).toBeLessThan(CONFIG.race.timeLimit * 0.75);
    expect(drop).toMatchObject({ x: s.world.width / 2, y: s.world.height / 2, landed: false, part: true, energyCell: true });
  });

  it('warns first, then lands', () => {
    const s = calmRace();
    const drop = s.race!.drop;
    for (const p of s.players) p.oxygen = 1e9;
    s.time = drop.landsAt - CONFIG.race.dropWarnSeconds - 0.5;
    step(s, NO_INPUT, DT);
    expect(drop.warned).toBe(false);
    for (let t = 0; t < 1; t += DT) step(s, NO_INPUT, DT);
    expect(drop.warned).toBe(true);
    expect(drop.landed).toBe(false);
    s.time = drop.landsAt;
    s.events.length = 0;
    step(s, NO_INPUT, DT);
    expect(drop.landed).toBe(true);
    expect(s.events.some((e) => e.type === 'sound' && e.name === 'drop')).toBe(true);
  });

  it('gives the part and the cell to whoever opens it first, and is empty after that', () => {
    const s = calmRace();
    const drop = s.race!.drop;
    drop.landed = true;
    const [a, b] = s.players;
    for (const p of [a, b]) {
      p.x = drop.x;
      p.y = drop.y + 10;
    }
    a.energy = 30;
    step(s, NO_INPUT, DT);
    expect(a.interaction.target).toEqual({ kind: 'drop' });
    hold(s, 0, CONFIG.interaction.openPartsSeconds + 0.2);
    expect(a.partsCarried).toBe(1);
    expect(a.energy).toBeCloseTo(30 + CONFIG.energy.cellAmount, 0);
    expect(drop).toMatchObject({ part: false, energyCell: false });
    expect(describeAction(s, b, b.interaction.target)).toMatchObject({ action: 'none', text: 'Capsule is leeg' });
  });

  it('leaves the cell when it does not fit, for the other player to take', () => {
    const s = calmRace();
    const drop = s.race!.drop;
    drop.landed = true;
    const [a, b] = s.players;
    for (const p of [a, b]) {
      p.x = drop.x;
      p.y = drop.y + 10;
    }
    a.energy = 90;
    b.energy = 20;
    hold(s, 0, CONFIG.interaction.openPartsSeconds + 0.2);
    expect(a.partsCarried).toBe(1);
    expect(drop.energyCell).toBe(true);
    hold(s, 1, CONFIG.interaction.openPartsSeconds + 0.2);
    expect(b.partsCarried).toBe(0);
    expect(b.energy).toBeCloseTo(20 + CONFIG.energy.cellAmount, 0);
    expect(drop.energyCell).toBe(false);
  });

  it('cannot be opened before it has landed', () => {
    const s = calmRace();
    const drop = s.race!.drop;
    const [a] = s.players;
    a.x = drop.x;
    a.y = drop.y + 10;
    step(s, NO_INPUT, DT);
    expect(a.interaction.target?.kind).not.toBe('drop');
  });
});
