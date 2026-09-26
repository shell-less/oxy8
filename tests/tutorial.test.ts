import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { readTipSettings, writeTipSettings, type KeyValueStore } from '../src/game/save';
import { landOn } from '../src/game/state';
import { nextTip, TIPS } from '../src/game/tutorial';

const later = { secondsOnPlanet: 5 };

describe('tutorial tips', () => {
  it('starts with the movement tip shortly after landing', () => {
    const s = landOn(0);
    expect(nextTip(s, { secondsOnPlanet: 0 }, new Set())).toBeNull();
    expect(nextTip(s, later, new Set())?.id).toBe('move');
  });

  it('never repeats a seen tip', () => {
    const s = landOn(0);
    expect(nextTip(s, later, new Set(['move']))?.id).not.toBe('move');
  });

  it('explains bunkers when one is near', () => {
    const s = landOn(0);
    const seen = new Set(['move']);
    s.player.x = -1000;
    expect(nextTip(s, later, seen)).toBeNull();
    const b = s.world.bunkers[0];
    s.player.x = b.x + 60;
    s.player.y = b.y;
    expect(nextTip(s, later, seen)?.id).toBe('bunkers');
  });

  it('points to the ship once a part is carried', () => {
    const s = landOn(0);
    s.player.x = -1000;
    s.partsCarried = 1;
    expect(nextTip(s, later, new Set(['move']))?.id).toBe('part');
  });

  it('explains the lamp when it gets dark', () => {
    const s = landOn(0);
    s.player.x = -1000;
    s.time = CONFIG.day.lengthSeconds * (22 / 24);
    expect(nextTip(s, later, new Set(['move']))?.id).toBe('lamp');
    s.lamp = false;
    expect(nextTip(s, later, new Set(['move', 'lamp']))?.id).toBe('lamp-off');
  });

  it('shows nothing when the game is not being played', () => {
    const s = landOn(0);
    s.status = 'dead';
    expect(nextTip(s, later, new Set())).toBeNull();
  });

  it('has unique ids', () => {
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
  });
});

describe('tip settings', () => {
  const store = (): KeyValueStore => {
    const data = new Map<string, string>();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };

  it('defaults to enabled with nothing seen', () => {
    expect(readTipSettings(store())).toEqual({ enabled: true, seen: [] });
  });

  it('round-trips', () => {
    const st = store();
    writeTipSettings({ enabled: false, seen: ['move', 'lamp'] }, st);
    expect(readTipSettings(st)).toEqual({ enabled: false, seen: ['move', 'lamp'] });
  });
});
