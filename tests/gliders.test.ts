import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT } from '../src/core/input';
import { landOn, type GameState } from '../src/game/state';
import { step } from '../src/game/update';
import { generateWorld } from '../src/world/generate';
import { PLANETS } from '../src/world/planets';
import type { Creeper } from '../src/world/types';

const DT = 1 / 60;
const NEREID = PLANETS.findIndex((p) => p.name === 'Nereid-117');
const VIRIDIA = PLANETS.findIndex((p) => p.name === 'Viridia');

function run(state: GameState, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) {
    each?.();
    step(state, NO_INPUT, DT);
  }
}

/** Nereid-117 with a single glider on its route, the player far away. */
function setup(): { s: GameState; c: Creeper } {
  const s = landOn(NEREID);
  s.world.creepers.length = 1;
  const c = s.world.creepers[0];
  s.players[0].x = c.cx + 400;
  s.players[0].y = c.cy;
  return { s, c };
}

/** Put the player on the glider's right, within sight. */
function inSight(s: GameState, c: Creeper): void {
  s.players[0].x = c.x + 40;
  s.players[0].y = c.y;
}

describe('gliders', () => {
  it('guard Nereid-117', () => {
    expect(NEREID).toBeGreaterThanOrEqual(0);
    expect(generateWorld(PLANETS[NEREID]).creepers.every((c) => c.kind === 'glider')).toBe(true);
  });

  it('skate their route around the bunker when nobody is near', () => {
    const { s, c } = setup();
    const start = { x: c.x, y: c.y };
    run(s, 5);
    expect(c.slide!.phase).toBe('glide');
    expect(Math.hypot(c.x - start.x, c.y - start.y)).toBeGreaterThan(5);
    expect(Math.hypot(c.x - c.cx, c.y - c.cy)).toBeLessThan(70);
  });

  it('brace first when they see the player, then slide', () => {
    const { s, c } = setup();
    inSight(s, c);
    step(s, NO_INPUT, DT);
    expect(c.slide!.phase).toBe('brace');
    run(s, CONFIG.enemies.glider.braceSeconds + DT);
    expect(c.slide!.phase).toBe('slide');
  });

  it('hurt a player who stays in the line', () => {
    const { s, c } = setup();
    inSight(s, c);
    run(s, CONFIG.enemies.glider.braceSeconds + 1);
    expect(s.players[0].oxygen).toBeLessThan(100 - CONFIG.oxygen.enemyHitDamage + 1);
    expect(c.mode).toBe('return');
  });

  it('miss a player who steps aside, and keep sliding straight', () => {
    const { s, c } = setup();
    inSight(s, c);
    run(s, CONFIG.enemies.glider.braceSeconds + 2 * DT);
    expect(c.slide!.phase).toBe('slide');
    const startY = c.y;
    s.players[0].y += 30;
    run(s, 2);
    expect(s.players[0].oxygen).toBeGreaterThan(100 - CONFIG.oxygen.enemyHitDamage);
    expect(Math.abs(c.y - startY)).toBeLessThan(1);
  });

  it('stop after about a hundred pixels, sit dazed, then skate back home', () => {
    const { s, c } = setup();
    inSight(s, c);
    run(s, CONFIG.enemies.glider.braceSeconds + 2 * DT);
    const from = { x: c.x, y: c.y };
    s.players[0].y += 60;
    s.players[0].x += 300;
    run(s, 1.8);
    expect(c.slide!.phase).toBe('recover');
    const slid = Math.hypot(c.x - from.x, c.y - from.y);
    expect(slid).toBeGreaterThan(80);
    expect(slid).toBeLessThan(120);
    run(s, CONFIG.enemies.glider.recoverSeconds + 10);
    expect(c.slide!.phase).toBe('glide');
    expect(c.mode).toBe('patrol');
  });

  it('charge at a decoy beacon instead of the player', () => {
    const { s, c } = setup();
    s.beacons.push({ x: c.x - 50, y: c.y, timeLeft: 20 });
    inSight(s, c);
    step(s, NO_INPUT, DT);
    expect(c.slide!.phase).toBe('brace');
    expect(c.slide!.dirX).toBeLessThan(-0.9);
  });
});

describe('Viridia', () => {
  it('is the fourth planet and mixes all three kinds of creeper', () => {
    expect(VIRIDIA).toBe(3);
    const kinds = generateWorld(PLANETS[VIRIDIA]).creepers.map((c) => c.kind);
    for (const k of ['crawler', 'glider', 'jumper'] as const) expect(kinds.filter((x) => x === k).length).toBeGreaterThanOrEqual(3);
  });

  it('has more creepers than any planet before it, and still one safe supply bunker', () => {
    const count = (i: number) => generateWorld(PLANETS[i]).creepers.length;
    for (let i = 0; i < VIRIDIA; i++) expect(count(VIRIDIA)).toBeGreaterThan(count(i));
    const w = generateWorld(PLANETS[VIRIDIA]);
    const guardedIds = new Set(w.creepers.map((c) => w.bunkers.find((b) => b.x === c.cx && b.y - 4 === c.cy)!.id));
    expect(w.bunkers.some((b) => b.kind === 'supply' && !guardedIds.has(b.id))).toBe(true);
  });

  it('runs all three kinds side by side without trouble', () => {
    const s = landOn(VIRIDIA);
    const p = s.world.creepers[0];
    s.players[0].x = p.cx;
    s.players[0].y = p.cy;
    run(s, 20);
    for (const c of s.world.creepers) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    }
  });
});
