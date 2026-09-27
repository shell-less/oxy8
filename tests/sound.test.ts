import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/core/input';
import { landOn, type GameState, type SoundName } from '../src/game/state';
import { step } from '../src/game/update';

const sounds = (s: GameState): SoundName[] => s.events.flatMap((e) => (e.type === 'sound' ? [e.name] : []));

describe('sound events', () => {
  it('picking up scrap makes a sound', () => {
    const s = landOn(0);
    s.world.creepers.length = 0;
    const piece = s.world.scrap[0];
    s.players[0].x = piece.x;
    s.players[0].y = piece.y;
    step(s, NO_INPUT, 1 / 60);
    expect(sounds(s)).toContain('pickup');
  });

  it('a creeper hit makes a sound', () => {
    const s = landOn(0);
    const c = s.world.creepers[0];
    s.players[0].x = c.x;
    s.players[0].y = c.y;
    step(s, NO_INPUT, 1 / 60);
    expect(sounds(s)).toContain('hurt');
  });

  it('trying to use an item you do not have makes a sound', () => {
    const s = landOn(0);
    s.world.creepers.length = 0;
    step(s, { ...NO_INPUT, useBottle: true }, 1 / 60);
    expect(sounds(s)).toContain('deny');
  });
});
