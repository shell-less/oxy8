import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { craft, checkCraft } from '../src/game/crafting';
import { readSave, type KeyValueStore } from '../src/game/save';
import { landOn, type GameState } from '../src/game/state';
import { destinations, travel } from '../src/game/travel';
import { step } from '../src/game/update';
import { generateWorld } from '../src/world/generate';
import { PLANETS } from '../src/world/planets';

const DT = 1 / 60;
const C = CONFIG.crafting;

function run(state: GameState, seconds: number, input: InputState = NO_INPUT): void {
  for (let t = 0; t < seconds; t += DT) step(state, input, DT);
}

function quiet(index = 0): GameState {
  const s = landOn(index, { energy: 100 });
  s.world.creepers.length = 0;
  s.hazards.stormNext = 1e9;
  s.hazards.meteorTimer = 1e9;
  return s;
}

describe('scrap', () => {
  it('lies on every planet, clear of rocks, bunkers and the ship', () => {
    for (const planet of PLANETS) {
      const w = generateWorld(planet);
      expect(w.scrap).toHaveLength(C.scrapPerPlanet);
      for (const s of w.scrap) {
        for (const o of w.solids) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThan(o.r);
        expect(Math.hypot(w.ship.x - s.x, w.ship.y - s.y)).toBeGreaterThan(50);
      }
    }
  });

  it('is picked up by walking over it', () => {
    const s = quiet();
    const piece = s.world.scrap[0];
    s.players[0].x = piece.x;
    s.players[0].y = piece.y;
    step(s, NO_INPUT, DT);
    expect(piece.taken).toBe(true);
    expect(s.players[0].inventory.scrap).toBe(1);
    step(s, NO_INPUT, DT);
    expect(s.players[0].inventory.scrap).toBe(1);
  });

  it('stays taken after flying away and back, and shows as leftover', () => {
    const s = quiet();
    s.world.scrap[0].taken = true;
    s.world.scrap[1].taken = true;
    s.players[0].inventory.scrap = 2;
    s.players[0].partsInstalled = s.world.planet.partsNeeded;
    s.campaign.unlocked = 1;
    const r = travel(s, 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.players[0].inventory.scrap).toBe(2);
    expect(destinations(r.state)[0].scrap).toBe(C.scrapPerPlanet - 2);
    const back = travel(r.state, 0);
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.world.scrap.filter((x) => x.taken)).toHaveLength(2);
  });
});

describe('workbench', () => {
  it('costs scrap and respects carry limits', () => {
    const s = quiet();
    s.players[0].inventory.scrap = 20;
    expect(craft(s, 'bottle').ok).toBe(true);
    expect(s.players[0].inventory.scrap).toBe(20 - C.bottle.scrap);
    expect(checkCraft(s.players[0], 'bottle').ok).toBe(false);
    craft(s, 'beacon');
    craft(s, 'beacon');
    expect(s.players[0].inventory.beacons).toBe(C.beacon.carryMax);
    expect(checkCraft(s.players[0], 'beacon').ok).toBe(false);
  });

  it('refuses without enough scrap', () => {
    const s = quiet();
    s.players[0].inventory.scrap = 1;
    const r = craft(s, 'armour');
    expect(r.ok).toBe(false);
    expect(s.players[0].inventory.armour).toBe(false);
    expect(s.players[0].inventory.scrap).toBe(1);
  });

  it('reinforces the suit only once', () => {
    const s = quiet();
    s.players[0].inventory.scrap = 20;
    craft(s, 'armour');
    expect(s.players[0].inventory.armour).toBe(true);
    expect(checkCraft(s.players[0], 'armour').ok).toBe(false);
  });
});

describe('items', () => {
  it('Q uses an oxygen bottle', () => {
    const s = quiet();
    s.players[0].inventory.bottles = 1;
    s.players[0].oxygen = 30;
    step(s, { ...NO_INPUT, useBottle: true }, DT);
    expect(s.players[0].oxygen).toBeCloseTo(30 + C.bottle.oxygen, 0);
    expect(s.players[0].inventory.bottles).toBe(0);
  });

  it('keeps the bottle when the tank is full', () => {
    const s = quiet();
    s.players[0].inventory.bottles = 1;
    step(s, { ...NO_INPUT, useBottle: true }, DT);
    expect(s.players[0].inventory.bottles).toBe(1);
  });

  it('a reinforced suit loses less oxygen to a creeper', () => {
    const s = landOn(0);
    s.players[0].inventory.armour = true;
    const c = s.world.creepers[0];
    s.players[0].x = c.x;
    s.players[0].y = c.y;
    step(s, NO_INPUT, DT);
    const lost = 100 - s.players[0].oxygen;
    expect(lost).toBeLessThan(CONFIG.oxygen.enemyHitDamage);
    expect(lost).toBeGreaterThanOrEqual(Math.round(CONFIG.oxygen.enemyHitDamage * C.armour.damageFactor));
  });

  it('R places a beacon that lures crawlers away from the player', () => {
    const s = landOn(0);
    s.hazards.stormNext = 1e9;
    s.world.creepers.length = 1;
    const c = s.world.creepers[0];
    s.players[0].inventory.beacons = 1;
    // Stand near the crawler, drop the beacon, walk away to the other side.
    s.players[0].x = c.x + 40;
    s.players[0].y = c.y;
    step(s, { ...NO_INPUT, placeBeacon: true }, DT);
    expect(s.beacons).toHaveLength(1);
    const beacon = s.beacons[0];
    s.players[0].x = c.x - 45;
    run(s, 4);
    expect(Math.hypot(c.x - beacon.x, c.y - beacon.y)).toBeLessThan(10);
    expect(s.players[0].oxygen).toBeGreaterThan(90);
  });

  it('beacons stop working after their lifetime', () => {
    const s = quiet();
    s.players[0].inventory.beacons = 1;
    step(s, { ...NO_INPUT, placeBeacon: true }, DT);
    run(s, C.beacon.lifetime + 0.1);
    expect(s.beacons).toHaveLength(0);
  });
});

describe('save migration', () => {
  it('upgrades a version 1 save from before crafting', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
    const v1 = {
      version: 1, planetIndex: 1, energy: 44,
      campaign: { unlocked: 1, planets: [{ lootedBunkers: [0], takenCells: [], partsCarried: 3, partsInstalled: 3, explored: '' }, null, null] },
    };
    store.setItem('oxy8.save', JSON.stringify({ live: v1, checkpoint: v1 }));
    const file = readSave(store)!;
    expect(file.live.version).toBe(2);
    expect(file.live.inventory).toEqual({ scrap: 0, bottles: 0, beacons: 0, armour: false });
    expect(file.live.campaign.planets[0]!.takenScrap).toEqual([]);
    expect(file.live.energy).toBe(44);
  });
});
