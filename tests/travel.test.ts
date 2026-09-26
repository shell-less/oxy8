import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { snapshotCampaign } from '../src/game/campaign';
import { fromSaveData, readSave, toSaveData, writeSave, type KeyValueStore } from '../src/game/save';
import { NO_INPUT } from '../src/core/input';
import { landOn, type GameState } from '../src/game/state';
import { step } from '../src/game/update';
import { destinations, HOME_INDEX, travel } from '../src/game/travel';
import { PLANETS } from '../src/world/planets';

/** Takes the energy cell out of the first supply bunker that has one, as if the player opened it. */
function takeOneCell(state: GameState): number {
  const b = state.world.bunkers.find((x) => x.energyCell)!;
  b.energyCell = false;
  return b.id;
}

function repair(state: GameState): void {
  state.partsCarried = state.partsInstalled = state.world.planet.partsNeeded;
  state.campaign.unlocked = Math.max(state.campaign.unlocked, state.planetIndex + 1);
}

function mustTravel(state: GameState, index: number): GameState {
  const r = travel(state, index);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('star map', () => {
  it('locks the next planet until the engine is repaired', () => {
    const s = landOn(0);
    const rows = destinations(s);
    expect(rows[0].status).toBe('here');
    expect(rows[1].status).toBe('locked');
    expect(rows[1].canFly).toBe(false);
    expect(rows[2].status).toBe('unknown');
    expect(travel(s, 1).ok).toBe(false);
  });

  it('opens the next planet after repair', () => {
    const s = landOn(0);
    repair(s);
    const row = destinations(s)[1];
    expect(row.status).toBe('new');
    expect(row.canFly).toBe(true);
  });

  it('shows energy cells left on visited planets', () => {
    const s = landOn(0);
    takeOneCell(s);
    repair(s);
    const there = mustTravel(s, 1);
    const kepler = destinations(there)[0];
    expect(kepler.status).toBe('visited');
    expect(kepler.energyCells).toBe(PLANETS[0].energyCells - 1);
    expect(destinations(there)[1].energyCells).toBe(PLANETS[1].energyCells);
  });

  it('offers the way home only after the last planet is repaired', () => {
    const s = landOn(PLANETS.length - 1, { energy: 50 });
    expect(destinations(s).some((d) => d.index === HOME_INDEX)).toBe(false);
    s.campaign.unlocked = PLANETS.length - 1;
    repair(s);
    const r = travel(s, HOME_INDEX);
    expect(r.ok && r.state.status).toBe('escaped');
  });
});

describe('travel', () => {
  it('costs energy and refills oxygen', () => {
    const s = landOn(0, { energy: 60 });
    repair(s);
    s.oxygen = 20;
    const there = mustTravel(s, 1);
    expect(there.energy).toBe(60 - CONFIG.energy.flightCost);
    expect(there.oxygen).toBe(100);
    expect(there.planetIndex).toBe(1);
  });

  it('refuses without enough energy', () => {
    const s = landOn(0, { energy: CONFIG.energy.flightCost - 1 });
    repair(s);
    const r = travel(s, 1);
    expect(r.ok).toBe(false);
  });

  it('can always go back once the engine reaches further, and bunkers stay as left', () => {
    const s = landOn(0, { energy: 100 });
    const looted = s.world.bunkers.find((b) => b.kind === 'parts')!;
    looted.looted = true;
    s.partsCarried = 1;
    const cellId = takeOneCell(s);
    repair(s);

    const there = mustTravel(s, 1);
    expect(there.partsInstalled).toBe(0);
    const back = mustTravel(there, 0);
    expect(back.world.bunkers.find((b) => b.id === looted.id)!.looted).toBe(true);
    expect(back.world.bunkers.find((b) => b.id === cellId)!.energyCell).toBe(false);
    expect(back.partsInstalled).toBe(PLANETS[0].partsNeeded);
    expect(back.energy).toBe(100 - 2 * CONFIG.energy.flightCost);
  });

  it('keeps progress on a planet that was left half done', () => {
    const s = landOn(0, { energy: 100 });
    repair(s);
    const nereid = mustTravel(s, 1);
    nereid.partsCarried = 2;
    nereid.partsInstalled = 1;
    nereid.world.bunkers.filter((b) => b.kind === 'parts').slice(0, 2).forEach((b) => (b.looted = true));
    const kepler = mustTravel(nereid, 0);
    const again = mustTravel(kepler, 1);
    expect(again.partsCarried).toBe(2);
    expect(again.partsInstalled).toBe(1);
    expect(again.world.bunkers.filter((b) => b.looted)).toHaveLength(2);
  });

  it('remembers the explored minimap', () => {
    const s = landOn(0, { energy: 100 });
    s.explored[5] = 1;
    s.explored[4000] = 1;
    repair(s);
    const back = mustTravel(mustTravel(s, 1), 0);
    expect(back.explored[5]).toBe(1);
    expect(back.explored[4000]).toBe(1);
    expect(back.explored[6]).toBe(0);
  });
});

describe('stranded', () => {
  it('ends the game without energy to fly and no cells left here', () => {
    const s = landOn(0, { energy: CONFIG.energy.flightCost - 1 });
    s.world.creepers.length = 0;
    for (const b of s.world.bunkers) b.energyCell = false;
    step(s, NO_INPUT, 1 / 60);
    expect(s.status).toBe('stranded');
  });

  it('is not stranded while energy cells are left on the planet', () => {
    const s = landOn(0, { energy: 0 });
    s.world.creepers.length = 0;
    step(s, NO_INPUT, 1 / 60);
    expect(s.status).toBe('playing');
  });
});

describe('saving', () => {
  function memoryStore(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  }

  it('round-trips a game through storage', () => {
    const s = landOn(0, { energy: 77 });
    s.world.bunkers.find((b) => b.kind === 'parts')!.looted = true;
    s.partsCarried = 1;
    const store = memoryStore();
    const data = toSaveData(s);
    writeSave({ live: data, checkpoint: data }, store);

    const file = readSave(store)!;
    const loaded = fromSaveData(file.live);
    expect(loaded.planetIndex).toBe(0);
    expect(loaded.energy).toBe(77);
    expect(loaded.partsCarried).toBe(1);
    expect(loaded.world.bunkers.filter((b) => b.looted)).toHaveLength(1);
  });

  it('ignores damaged saves', () => {
    const store = memoryStore();
    store.setItem('oxy8.save', '{not json');
    expect(readSave(store)).toBeNull();
    store.setItem('oxy8.save', JSON.stringify({ live: { version: 99 } }));
    expect(readSave(store)).toBeNull();
  });

  it('does not share campaign objects between a save and the live game', () => {
    const s = landOn(0);
    const data = toSaveData(s);
    const loaded = fromSaveData(data);
    loaded.campaign.unlocked = 3;
    expect(data.campaign.unlocked).toBe(0);
    expect(snapshotCampaign(s).unlocked).toBe(0);
  });
});
