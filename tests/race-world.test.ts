import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { shipOf, startRace } from '../src/game/state';
import { step } from '../src/game/update';
import { findTarget } from '../src/systems/interaction';
import { PLANETS } from '../src/world/planets';
import { generateRaceWorld, mirror, racePlanetType } from '../src/world/race';
import type { Point, World } from '../src/world/types';

const SEEDS = [1, 42, 1234, 99991, 2026, 777777];
const R = CONFIG.race;
const DT = 1 / 60;

/** True when every point has a mirror image in the list (within a pixel, bunkers are rounded). */
function isMirrored(world: World, points: readonly Point[]): boolean {
  return points.every((p) => {
    const m = mirror(p, world.width, world.height);
    return points.some((q) => Math.abs(q.x - m.x) <= 1 && Math.abs(q.y - m.y) <= 1);
  });
}

describe('race planet generation', () => {
  it('is deterministic: the same match seed gives the same planet', () => {
    for (const seed of SEEDS) expect(generateRaceWorld(seed)).toEqual(generateRaceWorld(seed));
  });

  it('gives different seeds different layouts, and uses every planet type', () => {
    const a = generateRaceWorld(1);
    const b = generateRaceWorld(2);
    expect(a.bunkers.map((x) => [x.x, x.y])).not.toEqual(b.bunkers.map((x) => [x.x, x.y]));
    const themes = new Set(Array.from({ length: 60 }, (_, i) => racePlanetType(i).theme.id));
    expect(themes.size).toBe(PLANETS.length);
  });

  it('is larger than a solo planet', () => {
    const w = generateRaceWorld(1);
    expect(w.tilesX).toBe(R.tilesX);
    expect(w.tilesY).toBe(R.tilesY);
    expect(w.width).toBe(R.tilesX * CONFIG.world.tileSize);
  });

  it('holds enough for one ship to leave, not for two', () => {
    for (const seed of SEEDS) {
      const w = generateRaceWorld(seed);
      const parts = w.bunkers.filter((b) => b.kind === 'parts');
      const cells = w.bunkers.filter((b) => b.energyCell);
      expect(parts).toHaveLength(R.partsBunkers);
      expect(w.bunkers.filter((b) => b.kind === 'supply')).toHaveLength(R.supplyBunkers);
      expect(cells).toHaveLength(R.energyCells);
      expect(w.planet.partsNeeded).toBe(R.partsToWin);
      // Any split of the parts gives one player a majority, but never both.
      expect(R.partsBunkers).toBeLessThan(2 * R.partsToWin);
      expect(Math.ceil(R.partsBunkers / 2)).toBe(R.partsToWin);
      // Two cells get one player out; both players together would need four.
      const needed = R.partsToWin * CONFIG.energy.installCost + CONFIG.energy.flightCost;
      expect(R.startEnergy + 2 * CONFIG.energy.cellAmount).toBeGreaterThanOrEqual(needed);
      expect(2 * R.startEnergy + R.energyCells * CONFIG.energy.cellAmount).toBeLessThan(2 * needed);
      expect(w.scrap).toHaveLength(CONFIG.crafting.scrapPerPlanet);
    }
  });

  it('mirrors the ships, rocks, crystals, pools and scrap through the centre', () => {
    for (const seed of SEEDS) {
      const w = generateRaceWorld(seed);
      expect(w.ships).toHaveLength(2);
      expect(w.ships[1]).toEqual(mirror(w.ships[0], w.width, w.height));
      expect(isMirrored(w, w.rocks)).toBe(true);
      expect(isMirrored(w, w.crystals)).toBe(true);
      expect(isMirrored(w, w.pools)).toBe(true);
      expect(isMirrored(w, w.scrap)).toBe(true);
    }
  });

  it('mirrors every bunker except the centre pair, with the same contents', () => {
    for (const seed of SEEDS) {
      const w = generateRaceWorld(seed);
      const outer = w.bunkers.filter((b) => b.id !== 0 && b.id !== R.partsBunkers);
      expect(outer).toHaveLength(R.partsBunkers + R.supplyBunkers - 2);
      for (const b of outer) {
        const m = mirror(b, w.width, w.height);
        const twin = outer.find((o) => o.x === m.x && o.y === m.y);
        expect(twin, `bunker ${b.id} of seed ${seed}`).toBeDefined();
        expect(twin!.kind).toBe(b.kind);
        expect(twin!.energyCell).toBe(b.energyCell);
      }
    }
  });

  it('puts one part and one energy cell by the centre, equally far from both ships', () => {
    for (const seed of SEEDS) {
      const w = generateRaceWorld(seed);
      const centre = { x: w.width / 2, y: w.height / 2 };
      const part = w.bunkers[0];
      const supply = w.bunkers[R.partsBunkers];
      expect(part.kind).toBe('parts');
      expect(supply.kind).toBe('supply');
      expect(supply.energyCell).toBe(true);
      for (const b of [part, supply]) {
        expect(Math.hypot(b.x - centre.x, b.y - centre.y)).toBeLessThan(R.centrePairOffset + 2);
        const [a, c] = w.ships.map((s) => Math.hypot(s.x - b.x, s.y - b.y));
        expect(Math.abs(a - c)).toBeLessThan(2);
      }
    }
  });

  it('keeps the centre clear of rocks and crystals', () => {
    for (const seed of SEEDS) {
      const w = generateRaceWorld(seed);
      const centre = { x: w.width / 2, y: w.height / 2 };
      for (const o of [...w.rocks, ...w.crystals]) {
        expect(Math.hypot(o.x - centre.x, o.y - centre.y)).toBeGreaterThan(R.centreClearRadius);
      }
    }
  });

  it('guards every parts bunker and the supply pair with cells, with mirrored creepers', () => {
    for (const seed of SEEDS) {
      const w = generateRaceWorld(seed);
      expect(w.creepers).toHaveLength(R.partsBunkers + R.guardedSupplyBunkers);
      const kinds = w.planet.creepers ?? 'crawler';
      for (const c of w.creepers) expect(typeof kinds === 'string' ? [kinds] : kinds).toContain(c.kind);
      // Outer creepers come in pairs right after the centre one.
      for (let i = 1; i < w.creepers.length; i += 2) {
        const [a, b] = [w.creepers[i], w.creepers[i + 1]];
        expect(b.kind).toBe(a.kind);
        expect(b.rx).toBe(a.rx);
        expect(b.direction).toBe(a.direction);
        expect(b.angle - a.angle).toBeCloseTo(Math.PI);
        // Same offset from their bunker anchors, and the anchors are mirrored.
        expect(w.width - b.cx).toBeCloseTo(a.cx);
        expect(w.height - (b.cy + 4)).toBeCloseTo(a.cy + 4);
      }
    }
  });

  it('keeps every bunker and scrap piece on the map and away from the ships', () => {
    for (const seed of SEEDS) {
      const w = generateRaceWorld(seed);
      for (const o of [...w.bunkers, ...w.scrap]) {
        expect(o.x).toBeGreaterThan(0);
        expect(o.y).toBeGreaterThan(0);
        expect(o.x).toBeLessThan(w.width);
        expect(o.y).toBeLessThan(w.height);
        for (const s of w.ships) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThan(50);
      }
    }
  });
});

describe('starting a race', () => {
  it('lands two players next to their own mirrored ships', () => {
    const s = startRace(42);
    expect(s.mode).toBe('race');
    expect(s.players).toHaveLength(2);
    const [a, b] = s.players;
    expect({ x: b.x, y: b.y }).toEqual(mirror(a, s.world.width, s.world.height));
    expect(shipOf(s, a)).toBe(s.world.ships[0]);
    expect(shipOf(s, b)).toBe(s.world.ships[1]);
    expect(a.energy).toBe(R.startEnergy);
    expect(a.explored.length).toBe(R.tilesX * R.tilesY);
    expect(PLANETS[s.planetIndex].theme).toBe(s.world.planet.theme);
  });

  it('is never stranded: that rule belongs to the solo campaign', () => {
    const s = startRace(42);
    s.world.creepers.length = 0;
    for (const p of s.players) p.energy = 0;
    for (const b of s.world.bunkers) b.energyCell = false;
    step(s, NO_INPUT, DT);
    expect(s.status).toBe('playing');
  });

  it('lets each player install parts only at their own ship', () => {
    const s = startRace(42);
    s.world.creepers.length = 0;
    const [a, b] = s.players;
    const theirs = s.world.ships[1];
    for (const p of [a, b]) {
      p.x = theirs.x;
      p.y = theirs.y + 20;
      p.partsCarried = 1;
    }
    expect(findTarget(s, a)).toBeNull();
    expect(findTarget(s, b)).toEqual({ kind: 'ship' });
    const hold: InputState = { ...NO_INPUT, interact: true };
    for (let t = 0; t < 3; t += DT) step(s, [hold, hold], DT);
    expect(b.partsInstalled).toBe(1);
    expect(a.partsInstalled).toBe(0);
  });

  it('reveals the larger minimap up to its far corner', () => {
    const s = startRace(7);
    s.world.creepers.length = 0;
    const b = s.players[1];
    b.x = s.world.width - 10;
    b.y = s.world.height - 10;
    step(s, NO_INPUT, DT);
    expect(b.explored[R.tilesX * R.tilesY - 1]).toBe(1);
  });
});
