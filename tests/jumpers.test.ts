import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT } from '../src/core/input';
import { landOn, type GameState } from '../src/game/state';
import { step } from '../src/game/update';
import { generateWorld } from '../src/world/generate';
import { PLANETS } from '../src/world/planets';
import type { Creeper } from '../src/world/types';

const DT = 1 / 60;
const UMBRA = PLANETS.findIndex((p) => p.creepers === 'jumper');

function run(state: GameState, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) {
    each?.();
    step(state, NO_INPUT, DT);
  }
}

/** A planet with a single jumper, the player far away, meteors switched off. */
function setup(): { s: GameState; c: Creeper } {
  const s = landOn(UMBRA);
  s.world.creepers.length = 1;
  s.hazards.meteorTimer = 1e9;
  const c = s.world.creepers[0];
  s.player.x = c.cx + 400;
  s.player.y = c.cy;
  return { s, c };
}

describe('jumping creepers', () => {
  it('guard Umbra-9, while the other planets keep crawlers', () => {
    expect(UMBRA).toBeGreaterThan(0);
    for (const planet of PLANETS) {
      const kinds = new Set(generateWorld(planet).creepers.map((c) => c.kind));
      expect([...kinds]).toEqual([planet.creepers ?? 'crawler']);
    }
  });

  it('hop around their bunker when nobody is near', () => {
    const { s, c } = setup();
    let hops = 0;
    run(s, 10, () => { if (c.jump!.phase === 'hop' && c.jump!.timer === c.jump!.duration) hops++; });
    expect(hops).toBeGreaterThan(3);
    expect(Math.hypot(c.x - c.cx, c.y - c.cy)).toBeLessThan(80);
  });

  it('crouch first when they see the player, then pounce', () => {
    const { s, c } = setup();
    c.jump!.phase = 'rest';
    c.jump!.timer = 5;
    s.player.x = c.x + 40;
    s.player.y = c.y;
    step(s, NO_INPUT, DT);
    expect(c.jump!.phase).toBe('crouch');
    run(s, CONFIG.enemies.jumper.crouchSeconds + DT);
    expect(c.jump!.phase).toBe('pounce');
  });

  it('hurt a player who stays on the landing spot', () => {
    const { s, c } = setup();
    c.jump!.phase = 'rest';
    c.jump!.timer = 5;
    s.player.x = c.x + 40;
    s.player.y = c.y;
    run(s, CONFIG.enemies.jumper.crouchSeconds + CONFIG.enemies.jumper.pounceSeconds + 0.1);
    expect(s.oxygen).toBeLessThan(100 - CONFIG.oxygen.enemyHitDamage + 1);
    expect(c.mode).toBe('return');
  });

  it('miss a player who steps aside during the jump', () => {
    const { s, c } = setup();
    c.jump!.phase = 'rest';
    c.jump!.timer = 5;
    s.player.x = c.x + 40;
    s.player.y = c.y;
    run(s, CONFIG.enemies.jumper.crouchSeconds + 2 * DT);
    expect(c.jump!.phase).toBe('pounce');
    s.player.y += 30;
    run(s, CONFIG.enemies.jumper.pounceSeconds + 0.1);
    expect(s.oxygen).toBeGreaterThan(95);
    expect(c.jump!.phase).toBe('recover');
  });

  it('never leap further than their range', () => {
    const { s, c } = setup();
    c.jump!.phase = 'rest';
    c.jump!.timer = 5;
    s.player.x = c.x + CONFIG.enemies.aggroRange - 1;
    s.player.y = c.y;
    run(s, CONFIG.enemies.jumper.crouchSeconds + 2 * DT);
    const j = c.jump!;
    expect(Math.hypot(j.toX - j.fromX, j.toY - j.fromY)).toBeLessThanOrEqual(CONFIG.enemies.jumper.pounceRange + 0.01);
  });
});
