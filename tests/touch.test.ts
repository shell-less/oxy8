import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { mergeInput, NO_INPUT, stickVector } from '../src/core/input';
import { landOn } from '../src/game/state';
import { step } from '../src/game/update';
import { TIPS } from '../src/game/tutorial';

const T = CONFIG.touch;

describe('touch stick', () => {
  it('does nothing inside the dead zone', () => {
    expect(stickVector(0, 0, 50, T.deadZone, T.minSpeed)).toEqual({ x: 0, y: 0 });
    expect(stickVector(50 * T.deadZone * 0.9, 0, 50, T.deadZone, T.minSpeed)).toEqual({ x: 0, y: 0 });
  });

  it('walks slowly just past the dead zone and at full speed at the rim', () => {
    const slow = stickVector(50 * T.deadZone + 0.01, 0, 50, T.deadZone, T.minSpeed);
    expect(slow.x).toBeCloseTo(T.minSpeed, 2);
    const full = stickVector(0, -50, 50, T.deadZone, T.minSpeed);
    expect(full.y).toBeCloseTo(-1);
    const beyond = stickVector(300, 400, 50, T.deadZone, T.minSpeed);
    expect(Math.hypot(beyond.x, beyond.y)).toBeCloseTo(1);
    expect(beyond.x / beyond.y).toBeCloseTo(300 / 400);
  });
});

describe('analog walking', () => {
  it('a half-pushed stick walks at half speed; keys stay at full speed, also diagonally', () => {
    const distance = (moveX: number, moveY: number) => {
      const s = landOn(0);
      s.world.creepers.length = 0;
      s.world.solids.length = 0;
      const x0 = s.players[0].x;
      const y0 = s.players[0].y;
      for (let i = 0; i < 30; i++) step(s, { ...NO_INPUT, moveX, moveY }, 1 / 60);
      return Math.hypot(s.players[0].x - x0, s.players[0].y - y0);
    };
    const full = distance(1, 0);
    expect(distance(0.5, 0)).toBeCloseTo(full / 2, 1);
    expect(distance(1, 1)).toBeCloseTo(full, 1);
  });

  it('merges keyboard and touch', () => {
    const merged = mergeInput({ ...NO_INPUT, moveX: 1, interact: true }, { ...NO_INPUT, moveX: 0.5, moveY: -0.4, useBottle: true });
    expect(merged).toEqual({ moveX: 1, moveY: -0.4, interact: true, toggleLamp: false, useBottle: true, placeBeacon: false });
  });
});

describe('tips on touch screens', () => {
  it('every tip that names a key has a touch version without keys', () => {
    const namesKey = /\b(WASD|pijltjes|[EFQR])\b|\([EFQR]\)/;
    for (const tip of TIPS) {
      if (namesKey.test(tip.text)) {
        expect(tip.touchText, tip.id).toBeDefined();
        expect(namesKey.test(tip.touchText!), tip.id).toBe(false);
      }
    }
  });
});
