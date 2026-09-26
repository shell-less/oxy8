import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT } from '../src/core/input';
import { landOn } from '../src/game/state';
import { step } from '../src/game/update';
import { generateWorld } from '../src/world/generate';
import { PLANETS } from '../src/world/planets';

/**
 * Balance guards. They encode the promises in docs/design.md, so a tweak in config.ts
 * or a new planet cannot quietly make the game unwinnable.
 */

const E = CONFIG.energy;
const NIGHT_SECONDS = 146; // darkness above the lamp threshold, see clock.ts
const LAMP_PER_NIGHT = NIGHT_SECONDS * E.lampPerSecond;

describe('energy budget', () => {
  it('the lamp costs about 12 energy per night', () => {
    expect(LAMP_PER_NIGHT).toBeGreaterThan(9);
    expect(LAMP_PER_NIGHT).toBeLessThan(14);
  });

  it.each(PLANETS.map((p, i) => [p.name, i] as const))(
    '%s pays for its own repair, the next flight and a night of lamp, even when you arrive with nothing',
    (_, i) => {
      const planet = PLANETS[i];
      const arriving = i === 0 ? CONFIG.player.startEnergy : 0;
      const available = arriving + planet.energyCells * E.cellAmount;
      const needed = planet.partsNeeded * E.installCost + E.flightCost + LAMP_PER_NIGHT;
      expect(available).toBeGreaterThanOrEqual(needed);
    },
  );

  it('an energy cell is never wasted on a full bar', () => {
    const s = landOn(0, { energy: E.max - E.cellAmount + 1 });
    s.world.creepers.length = 0;
    s.oxygen = 50;
    const b = s.world.bunkers.find((x) => x.energyCell)!;
    s.player.x = b.x;
    s.player.y = b.y + 4;
    for (let t = 0; t < 1.5; t += 1 / 60) step(s, { ...NO_INPUT, interact: true }, 1 / 60);
    expect(s.oxygen).toBeGreaterThan(95);
    expect(b.energyCell).toBe(true);
    expect(s.energy).toBe(E.max - E.cellAmount + 1);
  });
});

describe('oxygen reach', () => {
  it.each(PLANETS.map((p, i) => [p.name, i] as const))(
    '%s: every parts bunker is a safe round trip from a supply bunker, on a cold night after one hit',
    (_, i) => {
      const w = generateWorld(PLANETS[i]);
      const supplies = w.bunkers.filter((b) => b.kind === 'supply');
      const worstDrain = CONFIG.oxygen.drainPerSecond * CONFIG.hazards.cold.maxDrainMultiplier;
      for (const part of w.bunkers.filter((b) => b.kind === 'parts')) {
        const d = Math.min(...supplies.map((s) => Math.hypot(s.x - part.x, s.y - part.y)));
        // Paths are not straight; allow 50% detour.
        const seconds = (2 * d * 1.5) / CONFIG.player.speed;
        expect(seconds * worstDrain + CONFIG.oxygen.enemyHitDamage).toBeLessThan(100);
      }
    },
  );
});

describe('creepers', () => {
  it('are always escapable on foot', () => {
    expect(CONFIG.enemies.chaseSpeed).toBeLessThan(CONFIG.player.speed * 0.6);
  });

  it('a jumper pounce can be dodged by walking out of its landing ring in time', () => {
    const J = CONFIG.enemies.jumper;
    expect(CONFIG.player.speed * J.pounceSeconds).toBeGreaterThan(J.hitRadius * 2);
  });
});

describe('scrap', () => {
  it('each planet has enough scrap for the suit and a bottle', () => {
    const c = CONFIG.crafting;
    expect(c.scrapPerPlanet).toBeGreaterThanOrEqual(c.armour.scrap + c.bottle.scrap);
  });
});
