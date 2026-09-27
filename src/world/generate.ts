import { CONFIG } from '../config';
import { createRng, deriveSeed, type Rng } from '../core/rng';
import type { PlanetDef } from './planets';
import type { Theme } from './themes';
import type { Bunker, Circle, Creeper, CreeperKind, Crystal, Pool, Scrap, World } from './types';

export const MARGIN = 40;

/** Places circles without overlap. Falls back to a random spot when the map is too crowded. */
class Placer {
  private taken: Circle[] = [];
  constructor(private rng: Rng, private width: number, private height: number) {}

  reserve(c: Circle): void {
    this.taken.push(c);
  }

  place(radius: number, padding: number): Circle {
    const { rng, width, height } = this;
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = rng.range(MARGIN, width - MARGIN);
      const y = rng.range(MARGIN, height - MARGIN);
      if (this.taken.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + radius + padding)) {
        const c = { x, y, r: radius };
        this.taken.push(c);
        return c;
      }
    }
    const c = { x: rng.range(MARGIN, width - MARGIN), y: rng.range(MARGIN, height - MARGIN), r: radius };
    this.taken.push(c);
    return c;
  }
}

/** Builds the gameplay layout of a planet. Pure and deterministic: same planet, same world. */
export function generateWorld(planet: PlanetDef): World {
  const { tilesX, tilesY, tileSize } = CONFIG.world;
  const width = tilesX * tileSize;
  const height = tilesY * tileSize;
  const rng = createRng(deriveSeed(planet.seed, 1));
  const placer = new Placer(rng, width, height);
  const theme = planet.theme;

  // The ship lands away from the edges, so the camera can centre on it at the start.
  const ship = { x: Math.round(rng.range(280, width - 280)), y: Math.round(rng.range(200, height - 200)) };
  placer.reserve({ ...ship, r: CONFIG.layout.shipClearRadius });

  const bunkers: Bunker[] = [];
  const bunkerTotal = planet.partsNeeded + CONFIG.layout.supplyBunkers;
  for (let i = 0; i < bunkerTotal; i++) {
    const spot = placer.place(20, CONFIG.layout.bunkerSpacing);
    const kind = i < planet.partsNeeded ? 'parts' : 'supply';
    const supplyIndex = i - planet.partsNeeded;
    bunkers.push({
      id: i,
      x: spot.x,
      y: spot.y,
      kind,
      looted: false,
      energyCell: kind === 'supply' && supplyIndex < planet.energyCells,
      phase: rng.next() * Math.PI * 2,
    });
  }

  const pools: Pool[] = [];
  if (theme.hazard === 'toxic') {
    for (let i = 0; i < CONFIG.hazards.toxic.poolCount; i++) {
      const rx = rng.int(18, 43);
      const spot = placer.place(rx, 16);
      pools.push({ x: spot.x, y: spot.y, rx, ry: rx * 0.6 });
    }
  }

  const rocks: Circle[] = [];
  for (let i = 0; i < theme.rockCount; i++) rocks.push(placer.place(rng.int(4, 9), 10));

  const crystals: Crystal[] = [];
  for (let i = 0; i < theme.crystalCount; i++) {
    const spot = placer.place(5, 14);
    crystals.push(makeCrystal(rng, spot.x, spot.y, theme));
  }

  const guardedSupply = planet.guardedSupplyBunkers ?? CONFIG.layout.guardedSupplyBunkers;
  const guarded = bunkers.filter((b) => b.kind === 'parts' || b.id - planet.partsNeeded < guardedSupply);
  const kinds = planet.creepers ?? 'crawler';
  const creepers: Creeper[] = guarded.map((b, i) => makeCreeper(rng, b, typeof kinds === 'string' ? kinds : kinds[i % kinds.length]));

  const solids: Circle[] = [
    ...rocks,
    ...crystals.map((c) => ({ x: c.x, y: c.y, r: 4 })),
    ...bunkers.map((b) => ({ x: b.x, y: b.y - 7, r: 13 })),
    { x: ship.x - 10, y: ship.y - 9, r: 12 },
    { x: ship.x + 10, y: ship.y - 9, r: 12 },
  ];

  const scrap = placeScrap(planet, width, height, ship, solids, pools);

  return { planet, tilesX, tilesY, width, height, ship, ships: [ship], bunkers, rocks, crystals, pools, creepers, scrap, solids };
}

/** A crystal cluster at (x, y). Takes three random numbers per spike after the phase, always in this order. */
export function makeCrystal(rng: Rng, x: number, y: number, theme: Theme): Crystal {
  return {
    x,
    y,
    phase: rng.next() * Math.PI * 2,
    spikes: [[-3, 5], [0, 8], [3, 4]].map(([dx, h]) => ({
      dx,
      h: h + theme.crystalHeight + rng.int(0, 2 + theme.crystalHeight),
    })),
  };
}

/**
 * A creeper patrolling an ellipse around a bunker. The random numbers are taken in a fixed order
 * (radii, start angle, direction), so existing planets generate exactly as before.
 */
export function makeCreeper(rng: Rng, b: Bunker, kind: CreeperKind): Creeper {
  const rx = rng.range(40, 54);
  const ry = rng.range(28, 36);
  const angle = rng.next() * Math.PI * 2;
  const direction = rng.chance(0.5) ? 1 : -1;
  return creeperOn(b.x, b.y - 4, rx, ry, angle, direction, kind, b.id);
}

/** A creeper at a given point of its route. Takes no random numbers, so race planets can mirror one exactly. */
export function creeperOn(cx: number, cy: number, rx: number, ry: number, angle: number, direction: 1 | -1, kind: CreeperKind, bunkerId: number): Creeper {
  const x = cx + Math.cos(angle) * rx;
  const y = cy + Math.sin(angle) * ry;
  return {
    kind,
    // Jumpers and gliders take no extra random numbers, so older planets generate exactly as before.
    jump: kind === 'jumper'
      ? { phase: 'rest', timer: 0.5 + (bunkerId % 4) * 0.3, duration: 0, fromX: x, fromY: y, toX: x, toY: y, z: 0 }
      : null,
    slide: kind === 'glider' ? { phase: 'glide', timer: 0, dirX: 1, dirY: 0, speed: 0 } : null,
    cx, cy, rx, ry, angle,
    direction,
    angularSpeed: CONFIG.enemies.patrolSpeed / ((rx + ry) / 2),
    x,
    y,
    facing: 1,
    mode: 'patrol',
    cooldown: 0,
  };
}

/**
 * Scrap uses its own seed and runs after everything else, so adding it did not move
 * any bunker, rock or crystal on planets that players already have saves for.
 */
function placeScrap(planet: PlanetDef, width: number, height: number, ship: { x: number; y: number }, solids: Circle[], pools: Pool[]): Scrap[] {
  const rng = createRng(deriveSeed(planet.seed, 4));
  const scrap: Scrap[] = [];
  const clear = (x: number, y: number) =>
    Math.hypot(x - ship.x, y - ship.y) > 60 &&
    solids.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + 8) &&
    !isInPool(pools, x, y) &&
    scrap.every((o) => Math.hypot(o.x - x, o.y - y) > 90);
  for (let i = 0; i < CONFIG.crafting.scrapPerPlanet; i++) {
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 200; attempt++) {
      x = rng.range(MARGIN, width - MARGIN);
      y = rng.range(MARGIN, height - MARGIN);
      if (clear(x, y)) break;
    }
    scrap.push({ id: i, x: Math.round(x), y: Math.round(y), taken: false, phase: rng.next() * Math.PI * 2 });
  }
  return scrap;
}

export function isInPool(pools: Pool[], x: number, y: number): boolean {
  return pools.some((p) => ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 < 1);
}
