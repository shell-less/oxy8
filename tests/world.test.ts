import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { generateWorld, isInPool } from '../src/world/generate';
import { PLANETS } from '../src/world/planets';
import { THEMES } from '../src/world/themes';

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('keeps int() within bounds', () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('planets', () => {
  it('starts with 3 parts, then 5', () => {
    expect(PLANETS[0].partsNeeded).toBe(3);
    for (const p of PLANETS.slice(1)) expect(p.partsNeeded).toBeGreaterThanOrEqual(5);
  });

  it('never gets easier further along', () => {
    for (let i = 1; i < PLANETS.length; i++) {
      expect(PLANETS[i].partsNeeded).toBeGreaterThanOrEqual(PLANETS[i - 1].partsNeeded);
    }
  });
});

describe('world generation', () => {
  it('is deterministic for a planet', () => {
    const a = generateWorld(PLANETS[0]);
    const b = generateWorld(PLANETS[0]);
    expect(a.bunkers.map((x) => [x.x, x.y, x.kind])).toEqual(b.bunkers.map((x) => [x.x, x.y, x.kind]));
    expect(a.rocks).toEqual(b.rocks);
  });

  it.each(PLANETS.map((p, i) => [i + 1, p] as const))('planet %i has enough parts bunkers and energy', (_, planet) => {
    const w = generateWorld(planet);
    expect(w.bunkers.filter((b) => b.kind === 'parts')).toHaveLength(planet.partsNeeded);
    expect(w.bunkers.filter((b) => b.energyCell)).toHaveLength(planet.energyCells);
  });

  it.each(PLANETS.map((p, i) => [i + 1, p] as const))('planet %i guards every parts bunker', (_, planet) => {
    const w = generateWorld(planet);
    for (const b of w.bunkers.filter((x) => x.kind === 'parts')) {
      expect(w.creepers.some((c) => c.cx === b.x)).toBe(true);
    }
  });

  it('keeps bunkers apart and away from the ship', () => {
    for (const planet of PLANETS) {
      const w = generateWorld(planet);
      for (const b of w.bunkers) {
        expect(Math.hypot(b.x - w.ship.x, b.y - w.ship.y)).toBeGreaterThan(80);
        expect(b.x).toBeGreaterThan(0);
        expect(b.x).toBeLessThan(w.width);
        expect(b.y).toBeGreaterThan(0);
        expect(b.y).toBeLessThan(w.height);
      }
    }
  });

  it('only makes toxic pools on toxic planets', () => {
    for (const planet of PLANETS) {
      const w = generateWorld(planet);
      expect(w.pools.length > 0).toBe(planet.theme.hazard === 'toxic');
    }
    const toxic = generateWorld({ name: 'Viridia-test', seed: 5, theme: THEMES.green, partsNeeded: 5, energyCells: 4 });
    expect(toxic.pools.length).toBeGreaterThan(0);
    const pool = toxic.pools[0];
    expect(isInPool(toxic.pools, pool.x, pool.y)).toBe(true);
  });
});
