import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { darknessAt } from '../src/core/clock';
import { NO_INPUT, type InputState } from '../src/core/input';
import { landOn, type GameState } from '../src/game/state';
import { step } from '../src/game/update';
import { describe as describeAction } from '../src/systems/interaction';

const DT = 1 / 60;

function run(state: GameState, seconds: number, input: InputState = NO_INPUT): void {
  for (let t = 0; t < seconds; t += DT) step(state, input, DT);
}

/** Keeps creepers out of the way so a test only measures what it is about. */
function removeCreepers(state: GameState): void {
  state.world.creepers.length = 0;
}

function standAt(state: GameState, x: number, y: number): void {
  state.player.x = x;
  state.player.y = y;
}

describe('day clock', () => {
  it('is light by day and dark at night', () => {
    expect(darknessAt(12)).toBe(0);
    expect(darknessAt(23)).toBeCloseTo(CONFIG.day.maxDarkness);
    expect(darknessAt(19.5)).toBeGreaterThan(0);
  });
});

describe('oxygen', () => {
  it('drains over time and ends the run at zero', () => {
    const s = landOn(0);
    removeCreepers(s);
    s.hazards.stormNext = 1e9;
    run(s, 10);
    expect(s.oxygen).toBeCloseTo(100 - 10 * CONFIG.oxygen.drainPerSecond, 0);
    s.oxygen = 0.1;
    run(s, 1);
    expect(s.status).toBe('dead');
  });

  it('drains faster during cold nights on the ice planet', () => {
    const day = landOn(1);
    const night = landOn(1);
    removeCreepers(day);
    removeCreepers(night);
    night.time = CONFIG.day.lengthSeconds * (23 / 24);
    run(day, 5);
    run(night, 5);
    expect(100 - night.oxygen).toBeGreaterThan((100 - day.oxygen) * 1.5);
  });
});

describe('creepers', () => {
  it('tear the suit for 25% oxygen and back off', () => {
    const s = landOn(0);
    const c = s.world.creepers[0];
    standAt(s, c.x, c.y);
    const before = s.oxygen;
    step(s, NO_INPUT, DT);
    expect(before - s.oxygen).toBeGreaterThanOrEqual(CONFIG.oxygen.enemyHitDamage);
    expect(c.mode).toBe('return');
    expect(s.player.invulnerable).toBeGreaterThan(0);
  });

  it('chase a nearby player but are slower', () => {
    const s = landOn(0);
    const c = s.world.creepers[0];
    standAt(s, c.x + 40, c.y);
    step(s, NO_INPUT, DT);
    expect(c.mode).toBe('chase');
    expect(CONFIG.enemies.chaseSpeed).toBeLessThan(CONFIG.player.speed);
  });
});

describe('helmet lamp', () => {
  it('costs energy only at night', () => {
    const s = landOn(0);
    removeCreepers(s);
    run(s, 5);
    expect(s.energy).toBe(CONFIG.player.startEnergy);
    s.time = CONFIG.day.lengthSeconds * (23 / 24);
    run(s, 5);
    expect(s.energy).toBeLessThan(CONFIG.player.startEnergy);
  });

  it('switches off when energy runs out', () => {
    const s = landOn(0);
    removeCreepers(s);
    s.time = CONFIG.day.lengthSeconds * (23 / 24);
    s.energy = 0.01;
    run(s, 1);
    expect(s.lamp).toBe(false);
    expect(s.energy).toBe(0);
  });
});

describe('bunkers and ship', () => {
  const hold: InputState = { ...NO_INPUT, interact: true };

  it('a parts bunker gives one part, once', () => {
    const s = landOn(0);
    removeCreepers(s);
    const b = s.world.bunkers.find((x) => x.kind === 'parts')!;
    standAt(s, b.x, b.y + 4);
    run(s, 2, hold);
    expect(s.partsCarried).toBe(1);
    expect(b.looted).toBe(true);
    run(s, 0.2);
    run(s, 2, hold);
    expect(s.partsCarried).toBe(1);
  });

  it('a supply bunker refills oxygen and gives its energy cell only once', () => {
    const s = landOn(0);
    removeCreepers(s);
    const b = s.world.bunkers.find((x) => x.energyCell)!;
    standAt(s, b.x, b.y + 4);
    s.oxygen = 40;
    run(s, 1.5, hold);
    expect(s.oxygen).toBeGreaterThan(95);
    expect(s.energy).toBe(CONFIG.player.startEnergy + CONFIG.energy.cellAmount);
    s.oxygen = 40;
    run(s, 0.2);
    run(s, 1.5, hold);
    expect(s.oxygen).toBeGreaterThan(95);
    expect(s.energy).toBe(CONFIG.player.startEnergy + CONFIG.energy.cellAmount);
  });

  it('installing costs energy and completing the engine unlocks the next planet', () => {
    const s = landOn(0);
    removeCreepers(s);
    s.partsCarried = s.world.planet.partsNeeded;
    s.energy = 100;
    standAt(s, s.world.ship.x, s.world.ship.y + 20);
    for (let i = 0; i < s.world.planet.partsNeeded; i++) {
      run(s, 2, hold);
      run(s, 0.1);
    }
    expect(s.partsInstalled).toBe(s.world.planet.partsNeeded);
    expect(s.energy).toBe(100 - s.world.planet.partsNeeded * CONFIG.energy.installCost);
    expect(s.campaign.unlocked).toBe(1);
    run(s, 2, hold);
    expect(s.events.some((e) => e.type === 'starmap')).toBe(true);
  });

  it('refuses to install without enough energy', () => {
    const s = landOn(0);
    removeCreepers(s);
    s.partsCarried = 1;
    s.energy = 5;
    standAt(s, s.world.ship.x, s.world.ship.y + 20);
    step(s, NO_INPUT, DT);
    expect(describeAction(s, s.interaction.target)?.action).toBe('starmap');
    run(s, 3, hold);
    expect(s.partsInstalled).toBe(0);
    expect(s.energy).toBe(5);
  });
});

describe('planet progression', () => {
  it('carries energy over and refills oxygen', () => {
    const s = landOn(1, { energy: 42 });
    expect(s.energy).toBe(42);
    expect(s.oxygen).toBe(100);
    expect(s.world.planet.partsNeeded).toBe(5);
  });
});
