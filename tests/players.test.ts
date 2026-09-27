import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { landOn, newPlayer, type GameState, type Player } from '../src/game/state';
import { step } from '../src/game/update';

/**
 * Several players on one planet, the groundwork for race mode. Solo play must not notice any of this:
 * the other test files still run with one player and one InputState.
 */

const DT = 1 / 60;

function addPlayer(state: GameState, x: number, y: number): Player {
  const p = newPlayer(state.players.length, state.world, x, y, CONFIG.player.startEnergy);
  state.players.push(p);
  return p;
}

/** A calm planet without creepers, storms or meteors, so a test only measures what it is about. */
function calm(planetIndex = 0): GameState {
  const s = landOn(planetIndex);
  s.world.creepers.length = 0;
  s.hazards.stormNext = 1e9;
  s.hazards.meteorTimer = 1e9;
  return s;
}

const RIGHT: InputState = { ...NO_INPUT, moveX: 1 };
const DOWN: InputState = { ...NO_INPUT, moveY: 1 };

describe('several players', () => {
  it('gives solo play the same result for one input or a list of one', () => {
    const a = landOn(2);
    const b = landOn(2);
    for (let i = 0; i < 600; i++) {
      step(a, RIGHT, DT);
      step(b, [RIGHT], DT);
    }
    expect(b.players[0].x).toBe(a.players[0].x);
    expect(b.players[0].oxygen).toBe(a.players[0].oxygen);
    expect(b.hazards.meteors).toEqual(a.hazards.meteors);
  });

  it('moves every player with their own input', () => {
    const s = calm();
    const [one] = s.players;
    const two = addPlayer(s, one.x, one.y + 60);
    const start = { x1: one.x, y1: one.y, x2: two.x, y2: two.y };
    for (let i = 0; i < 30; i++) step(s, [RIGHT, DOWN], DT);
    expect(one.x).toBeGreaterThan(start.x1);
    expect(one.y).toBeCloseTo(start.y1);
    expect(two.y).toBeGreaterThan(start.y2);
    expect(two.x).toBeCloseTo(start.x2);
  });

  it('lets a player without input stand still', () => {
    const s = calm();
    const two = addPlayer(s, s.players[0].x, s.players[0].y + 60);
    const x = two.x;
    for (let i = 0; i < 30; i++) step(s, RIGHT, DT);
    expect(two.x).toBe(x);
  });

  it('keeps oxygen, energy and inventory per player', () => {
    const s = calm();
    const [one] = s.players;
    const two = addPlayer(s, one.x, one.y + 60);
    two.inventory.bottles = 1;
    two.oxygen = 50;
    step(s, [NO_INPUT, { ...NO_INPUT, useBottle: true }], DT);
    expect(two.inventory.bottles).toBe(0);
    expect(two.oxygen).toBeGreaterThan(80);
    expect(one.oxygen).toBeLessThan(100);
    expect(one.oxygen).toBeGreaterThan(99);
    expect(one.inventory.bottles).toBe(0);
  });

  it('drains only the player who stands in a toxic pool', () => {
    const s = calm(3);
    const pool = s.world.pools[0];
    const [one] = s.players;
    const two = addPlayer(s, pool.x, pool.y);
    for (let i = 0; i < 60; i++) step(s, NO_INPUT, DT);
    expect(two.inPool).toBe(true);
    expect(one.inPool).toBe(false);
    expect(100 - two.oxygen).toBeGreaterThan((100 - one.oxygen) * 3);
  });

  it('ends the game when any player runs out of oxygen', () => {
    const s = calm();
    const two = addPlayer(s, s.players[0].x, s.players[0].y + 60);
    two.oxygen = 0.0001;
    step(s, NO_INPUT, DT);
    expect(s.status).toBe('dead');
  });

  it('reveals the minimap per player', () => {
    const s = calm();
    const [one] = s.players;
    const two = addPlayer(s, s.world.width - 40, s.world.height - 40);
    step(s, NO_INPUT, DT);
    const { tileSize } = CONFIG.world;
    const { tilesX } = s.world;
    const tileOf = (p: Player) => Math.floor(p.y / tileSize) * tilesX + Math.floor(p.x / tileSize);
    expect(one.explored[tileOf(two)]).toBe(0);
    expect(two.explored[tileOf(two)]).toBe(1);
    expect(two.explored[tileOf(one)]).toBe(0);
  });
});

describe('creepers with several players', () => {
  it('go for the nearest player', () => {
    const s = landOn(0);
    const c = s.world.creepers[0];
    const [one] = s.players;
    one.x = c.x + 200;
    one.y = c.y;
    const two = addPlayer(s, c.x - 40, c.y);
    const gap = () => Math.hypot(c.x - two.x, c.y - two.y);
    const before = gap();
    for (let i = 0; i < 10; i++) step(s, NO_INPUT, DT);
    expect(c.mode).toBe('chase');
    expect(gap()).toBeLessThan(before);
  });

  it('hurt the player they hit, not the other one', () => {
    const s = landOn(0);
    const c = s.world.creepers[0];
    const [one] = s.players;
    one.x = c.x + 200;
    one.y = c.y;
    const two = addPlayer(s, c.x, c.y);
    step(s, NO_INPUT, DT);
    expect(100 - two.oxygen).toBeGreaterThanOrEqual(CONFIG.oxygen.enemyHitDamage);
    expect(one.oxygen).toBeGreaterThan(99);
  });
});

describe('meteors with several players', () => {
  it('aim at the players in turn', () => {
    const s = landOn(2);
    s.world.creepers.length = 0;
    const [one] = s.players;
    const two = addPlayer(s, one.x + 600, one.y);
    const near = (p: Player) => s.hazards.meteors.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) <= CONFIG.hazards.meteor.targetRadius).length;
    let aimedAtOne = 0;
    let aimedAtTwo = 0;
    for (let i = 0; i < 4; i++) {
      s.hazards.meteors.length = 0;
      s.hazards.meteorTimer = 0;
      step(s, NO_INPUT, DT);
      aimedAtOne += near(one);
      aimedAtTwo += near(two);
    }
    expect(aimedAtOne).toBe(2);
    expect(aimedAtTwo).toBe(2);
  });
});
