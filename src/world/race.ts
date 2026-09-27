import { CONFIG } from '../config';
import { createRng, deriveSeed, type Rng } from '../core/rng';
import { creeperOn, isInPool, makeCrystal, MARGIN } from './generate';
import { PLANETS, type PlanetDef } from './planets';
import type { Bunker, Circle, Creeper, CreeperKind, Crystal, Point, Pool, Scrap, World } from './types';

/**
 * Race planets are point-symmetric around the centre: everything on one half has a mirror on
 * the other, so both players get the same planet. The ships stand mirrored at opposite ends.
 *
 * With an odd number of parts bunkers and energy cells, one of each sits by the centre. Two
 * bunkers cannot both stand exactly on the centre, so they sit on either side of it, across the
 * line between the ships: both are then equally far from either ship, and the area around them
 * is kept clear of rocks.
 *
 * Offsets that the game adds to a bunker's anchor (its collision circle, the creeper route
 * around it) are the same for a bunker and its mirror. That leaves a few pixels of difference,
 * too small to matter for a race.
 */

/** Point reflection through the centre of a width x height world. */
export function mirror(p: Point, width: number, height: number): Point {
  return { x: width - p.x, y: height - p.y };
}

/** Places circles in mirrored pairs without overlap. A pair never crowds the centre. */
class MirrorPlacer {
  private taken: Circle[] = [];
  constructor(private rng: Rng, private width: number, private height: number) {}

  reserve(c: Circle): void {
    this.taken.push(c);
  }

  private free(x: number, y: number, radius: number, padding: number): boolean {
    return this.taken.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + radius + padding);
  }

  /** Returns the placed circle; its mirror is reserved too. */
  place(radius: number, padding: number): Circle {
    const { rng, width, height } = this;
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 300; attempt++) {
      x = rng.range(MARGIN, width - MARGIN);
      y = rng.range(MARGIN, height - MARGIN);
      const m = mirror({ x, y }, width, height);
      const apart = Math.hypot(m.x - x, m.y - y) > 2 * radius + padding;
      if (apart && this.free(x, y, radius, padding) && this.free(m.x, m.y, radius, padding)) break;
    }
    const c = { x, y, r: radius };
    this.taken.push(c, { ...mirror(c, width, height), r: radius });
    return c;
  }
}

/** Which planet type a match is played on: its theme, hazard and creepers. */
export function racePlanetType(matchSeed: number): PlanetDef {
  const rng = createRng(deriveSeed(matchSeed, 5));
  return PLANETS[rng.int(0, PLANETS.length - 1)];
}

/** Builds a mirrored race planet. Pure and deterministic: both clients build the same world from the match seed. */
export function generateRaceWorld(matchSeed: number): World {
  const R = CONFIG.race;
  const { tileSize } = CONFIG.world;
  const tilesX = R.tilesX;
  const tilesY = R.tilesY;
  const width = tilesX * tileSize;
  const height = tilesY * tileSize;
  const base = racePlanetType(matchSeed);
  const planet: PlanetDef = {
    ...base,
    seed: matchSeed,
    partsNeeded: R.partsToWin,
    energyCells: R.energyCells,
    guardedSupplyBunkers: R.guardedSupplyBunkers,
  };
  const theme = planet.theme;
  const rng = createRng(deriveSeed(matchSeed, 1));
  const placer = new MirrorPlacer(rng, width, height);
  const flip = (p: Point) => mirror(p, width, height);
  const centre = { x: width / 2, y: height / 2 };

  const ship = { x: Math.round(centre.x - R.shipOffsetX), y: Math.round(centre.y + rng.range(-R.shipOffsetY, R.shipOffsetY)) };
  const ships = [ship, flip(ship)];
  for (const s of ships) placer.reserve({ ...s, r: CONFIG.layout.shipClearRadius });
  placer.reserve({ ...centre, r: R.centreClearRadius });

  // The centre pair: across the line between the ships, so both are as far from either ship.
  const axis = { x: ship.x - centre.x, y: ship.y - centre.y };
  const axisLength = Math.hypot(axis.x, axis.y);
  const across = { x: (-axis.y / axisLength) * R.centrePairOffset, y: (axis.x / axisLength) * R.centrePairOffset };
  const centrePart = { x: centre.x + across.x, y: centre.y + across.y };
  const centreSupply = flip(centrePart);

  // Ids: the centre bunker of a kind first, then mirrored pairs with neighbouring ids (a pair is id, id + 1).
  const bunkers: Bunker[] = [];
  const addBunker = (p: Point, kind: Bunker['kind'], energyCell: boolean, phase: number) => {
    bunkers.push({ id: bunkers.length, x: Math.round(p.x), y: Math.round(p.y), kind, looted: false, energyCell, phase });
  };
  const addPair = (kind: Bunker['kind'], energyCell: boolean) => {
    const spot = placer.place(20, CONFIG.layout.bunkerSpacing);
    const phase = rng.next() * Math.PI * 2;
    const a = { x: Math.round(spot.x), y: Math.round(spot.y) };
    addBunker(a, kind, energyCell, phase);
    addBunker(flip(a), kind, energyCell, phase + Math.PI);
  };

  addBunker(centrePart, 'parts', false, rng.next() * Math.PI * 2);
  for (let i = 0; i < (R.partsBunkers - 1) / 2; i++) addPair('parts', false);
  const cellPairs = (R.energyCells - 1) / 2;
  addBunker(centreSupply, 'supply', true, rng.next() * Math.PI * 2);
  for (let i = 0; i < (R.supplyBunkers - 1) / 2; i++) addPair('supply', i < cellPairs);

  const scaled = (n: number) => Math.round((n * R.density * tilesX * tilesY) / (CONFIG.world.tilesX * CONFIG.world.tilesY) / 2);

  const pools: Pool[] = [];
  if (theme.hazard === 'toxic') {
    for (let i = 0; i < scaled(CONFIG.hazards.toxic.poolCount); i++) {
      const rx = rng.int(18, 43);
      const spot = placer.place(rx, 16);
      const pool = { x: spot.x, y: spot.y, rx, ry: rx * 0.6 };
      pools.push(pool, { ...pool, ...flip(pool) });
    }
  }

  const rocks: Circle[] = [];
  for (let i = 0; i < scaled(theme.rockCount); i++) {
    const rock = placer.place(rng.int(4, 9), 10);
    rocks.push(rock, { ...flip(rock), r: rock.r });
  }

  const crystals: Crystal[] = [];
  for (let i = 0; i < scaled(theme.crystalCount); i++) {
    const spot = placer.place(5, 14);
    const crystal = makeCrystal(rng, spot.x, spot.y, theme);
    crystals.push(crystal, { ...crystal, ...flip(crystal), phase: crystal.phase + Math.PI });
  }

  const creepers = placeCreepers(rng, planet, bunkers);

  const solids: Circle[] = [
    ...rocks,
    ...crystals.map((c) => ({ x: c.x, y: c.y, r: 4 })),
    ...bunkers.map((b) => ({ x: b.x, y: b.y - 7, r: 13 })),
    ...ships.flatMap((s) => [{ x: s.x - 10, y: s.y - 9, r: 12 }, { x: s.x + 10, y: s.y - 9, r: 12 }]),
  ];

  const scrap = placeScrap(matchSeed, width, height, ships, solids, pools, flip);

  return { planet, tilesX, tilesY, width, height, ship, ships, bunkers, rocks, crystals, pools, creepers, scrap, solids };
}

/**
 * Every parts bunker and the guarded supply bunkers get a creeper. A mirrored pair of bunkers gets
 * a mirrored pair of creepers: same kind, same route, starting at the opposite point, turning the
 * same way (a point reflection keeps the direction of rotation).
 */
function placeCreepers(rng: Rng, planet: PlanetDef, bunkers: Bunker[]): Creeper[] {
  const kinds = planet.creepers ?? 'crawler';
  const kindOf = (i: number): CreeperKind => (typeof kinds === 'string' ? kinds : kinds[i % kinds.length]);
  const guardedSupply = planet.guardedSupplyBunkers ?? 0;
  const firstSupply = bunkers.findIndex((b) => b.kind === 'supply');
  // Supply pairs start right after the centre supply bunker.
  const guarded = bunkers.filter((b) => b.kind === 'parts' || (b.id > firstSupply && b.id <= firstSupply + guardedSupply));

  const creepers: Creeper[] = [];
  let group = 0;
  for (const b of guarded) {
    const isCentre = b.id === 0;
    const isSecondOfPair = !isCentre && (b.id - (b.kind === 'parts' ? 1 : firstSupply + 1)) % 2 === 1;
    if (isSecondOfPair) continue;
    const kind = kindOf(group++);
    const rx = rng.range(40, 54);
    const ry = rng.range(28, 36);
    const angle = rng.next() * Math.PI * 2;
    const direction = rng.chance(0.5) ? 1 : -1;
    creepers.push(creeperOn(b.x, b.y - 4, rx, ry, angle, direction, kind, b.id));
    if (isCentre) continue;
    const twin = bunkers[b.id + 1];
    creepers.push(creeperOn(twin.x, twin.y - 4, rx, ry, angle + Math.PI, direction, kind, twin.id));
  }
  return creepers;
}

/** Scrap in mirrored pairs, with its own seed like on solo planets. */
function placeScrap(matchSeed: number, width: number, height: number, ships: Point[], solids: Circle[], pools: Pool[], flip: (p: Point) => Point): Scrap[] {
  const rng = createRng(deriveSeed(matchSeed, 4));
  const scrap: Scrap[] = [];
  const clearOne = (x: number, y: number) =>
    ships.every((s) => Math.hypot(x - s.x, y - s.y) > 60) &&
    solids.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + 8) &&
    !isInPool(pools, x, y) &&
    scrap.every((o) => Math.hypot(o.x - x, o.y - y) > 90);
  const clear = (x: number, y: number) => {
    const m = flip({ x, y });
    return clearOne(x, y) && clearOne(m.x, m.y) && Math.hypot(m.x - x, m.y - y) > 90;
  };
  for (let i = 0; i < CONFIG.crafting.scrapPerPlanet / 2; i++) {
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 200; attempt++) {
      x = Math.round(rng.range(MARGIN, width - MARGIN));
      y = Math.round(rng.range(MARGIN, height - MARGIN));
      if (clear(x, y)) break;
    }
    const phase = rng.next() * Math.PI * 2;
    scrap.push({ id: scrap.length, x, y, taken: false, phase });
    scrap.push({ id: scrap.length, ...flip({ x, y }), taken: false, phase: phase + Math.PI });
  }
  return scrap;
}
