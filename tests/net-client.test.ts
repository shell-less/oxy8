import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { startRace } from '../src/game/state';
import { InputSender } from '../src/net/sender';
import { Smoother } from '../src/net/smooth';

const GAP = 1 / CONFIG.net.maxInputsPerSecond;
const RIGHT: InputState = { ...NO_INPUT, moveX: 1 };

describe('sending input', () => {
  it('sends only when the input changes', () => {
    const s = new InputSender();
    expect(s.next(NO_INPUT, 0)).toBeNull();
    expect(s.next(RIGHT, 0)).toEqual(RIGHT);
    expect(s.next(RIGHT, 1)).toBeNull();
    expect(s.next(NO_INPUT, 2)).toEqual(NO_INPUT);
  });

  it('never sends more often than allowed, but catches up with the latest input', () => {
    const s = new InputSender();
    expect(s.next(RIGHT, 0)).not.toBeNull();
    expect(s.next(NO_INPUT, GAP / 2)).toBeNull();
    expect(s.next({ ...NO_INPUT, moveY: 1 }, GAP * 0.9)).toBeNull();
    expect(s.next({ ...NO_INPUT, moveY: 1 }, GAP * 1.1)).toEqual({ ...NO_INPUT, moveY: 1 });
  });

  it('keeps a quick key press that falls between two sends', () => {
    const s = new InputSender();
    s.next(RIGHT, 0);
    expect(s.next({ ...RIGHT, placeBomb: true }, GAP / 3)).toBeNull();
    expect(s.next(RIGHT, GAP / 2)).toBeNull();
    expect(s.next(RIGHT, GAP * 1.1)).toEqual({ ...RIGHT, placeBomb: true });
    // Released after it went out: the next send says so, so the server sees each press once.
    expect(s.next(RIGHT, GAP * 2.2)).toEqual(RIGHT);
  });
});

describe('gliding between snapshots', () => {
  const interval = CONFIG.net.snapshotEvery / CONFIG.net.tickRate;

  it('moves smoothly from where things were drawn to where the snapshot puts them', () => {
    const state = startRace(3);
    const smoother = new Smoother();
    const me = state.players[0];
    const start = { x: me.x, y: me.y };
    smoother.before(state);
    me.x += 20;
    smoother.after(state, 10);
    expect(me.x).toBeCloseTo(start.x);
    smoother.frame(state, 10 + interval / 2);
    expect(me.x).toBeCloseTo(start.x + 10);
    smoother.frame(state, 10 + interval * 2);
    expect(me.x).toBeCloseTo(start.x + 20);
  });

  it('places things at once after a jump or when they come into sight', () => {
    const state = startRace(3);
    const smoother = new Smoother();
    const other = state.players[1];
    other.x = other.y = -1e6;
    smoother.before(state);
    other.x = 500;
    other.y = 400;
    smoother.after(state, 0);
    expect(other.x).toBe(500);
    const c = state.world.creepers[0];
    smoother.before(state);
    c.x += 200;
    const target = c.x;
    smoother.after(state, 1);
    expect(c.x).toBe(target);
  });
});
