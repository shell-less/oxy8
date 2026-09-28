import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { NO_INPUT, type InputState } from '../src/core/input';
import { applySnapshot, createMirror } from '../src/net/apply';
import { Match } from '../src/net/match';
import { Predictor } from '../src/net/predict';
import type { ServerMessage, Snapshot } from '../src/net/protocol';
import { InputSender } from '../src/net/sender';

const FRAME = 1 / 60;
const TICK = 1 / CONFIG.net.tickRate;

/**
 * A server (Match) and one browser (mirror, sender, predictor) with a network delay in between,
 * both driven from one clock. `script(t)` is the player's input at time t.
 */
function simulate(latency: number, seconds: number, script: (t: number) => InputState, predict = true) {
  const toClient: { at: number; snap: Snapshot }[] = [];
  const toServer: { at: number; input: InputState; seq: number }[] = [];
  let seed = 0;
  const match = new Match('TEST', (seat, m: ServerMessage) => {
    if (seat === 0 && m.t === 'start') seed = m.seed;
    if (seat === 0 && m.t === 'snap') toClient.push({ at: now + latency, snap: m.snap });
  }, () => 42);
  let now = 0;
  match.join(0);
  match.join(0);
  const server = match.state!;
  server.world.creepers.length = 0;
  server.hazards.stormNext = 1e9;
  server.hazards.meteorTimer = 1e9;
  const mirror = createMirror(seed, 0);
  const sender = new InputSender();
  const predictor = new Predictor();
  const me = mirror.players[0];
  const trace: { t: number; shown: number; server: number }[] = [];
  let nextTick = TICK;
  for (; now < seconds; now += FRAME) {
    // The browser: send input when it changed, then move at once.
    const next = sender.next(script(now), now);
    if (next) toServer.push({ at: now + latency, input: next, seq: sender.seq });
    if (predict) predictor.step(mirror, 0, sender.current, sender.seq, FRAME);
    // The network, then the server.
    while (toServer.length && toServer[0].at <= now) {
      const m = toServer.shift()!;
      match.input(0, m.input, now, m.seq);
    }
    while (nextTick <= now) {
      match.tick(nextTick);
      nextTick += TICK;
    }
    while (toClient.length && toClient[0].at <= now) {
      const { snap } = toClient.shift()!;
      const shown = { x: me.x, y: me.y };
      applySnapshot(mirror, snap, 0);
      if (predict) predictor.reconcile(mirror, 0, snap.ack, snap.ackAge, shown);
    }
    trace.push({ t: now, shown: me.x, server: server.players[0].x });
  }
  return { me, server: server.players[0], trace };
}

const walkRight = (from: number, to: number) => (t: number): InputState => (t >= from && t < to ? { ...NO_INPUT, moveX: 1 } : NO_INPUT);

describe('predicting the own astronaut', () => {
  it('moves on the first frame after a key press, before the server has heard of it', () => {
    const { trace } = simulate(0.08, 0.6, walkRight(0.3, 2));
    const before = trace.find((f) => f.t >= 0.25)!.shown;
    const justAfter = trace.find((f) => f.t >= 0.3 + 2 * FRAME)!;
    expect(justAfter.shown).toBeGreaterThan(before + 1);
    expect(justAfter.server).toBeCloseTo(before, 5);
  });

  it('without prediction, the same press shows only after a round trip', () => {
    const { trace } = simulate(0.08, 0.6, walkRight(0.3, 2), false);
    const before = trace.find((f) => f.t >= 0.25)!.shown;
    expect(trace.find((f) => f.t >= 0.3 + 2 * FRAME)!.shown).toBeCloseTo(before, 5);
    expect(trace.find((f) => f.t >= 0.3 + 0.12)!.shown).toBeCloseTo(before, 5);
  });

  it('never jumps back while walking in a straight line', () => {
    const { trace } = simulate(0.08, 2.5, walkRight(0.3, 1.8));
    const walking = trace.filter((f) => f.t > 0.3 && f.t < 1.8);
    for (let i = 1; i < walking.length; i++) expect(walking[i].shown).toBeGreaterThanOrEqual(walking[i - 1].shown - 0.01);
  });

  it('corrects only a little after stopping: the server ticks, so it may walk up to one tick longer or shorter', () => {
    const { trace } = simulate(0.08, 2.5, walkRight(0.3, 1.8));
    const stopped = trace.find((f) => f.t >= 1.8)!.shown;
    const end = trace.at(-1)!.shown;
    expect(Math.abs(end - stopped)).toBeLessThanOrEqual(CONFIG.player.speed * TICK + 0.5);
  });

  it('ends up exactly where the server has the astronaut once the input stops', () => {
    for (const latency of [0.03, 0.08, 0.15]) {
      const { me, server } = simulate(latency, 3, walkRight(0.3, 1.6));
      expect(Math.abs(me.x - server.x)).toBeLessThan(0.5);
      expect(Math.abs(me.y - server.y)).toBeLessThan(0.5);
    }
  });

  it('stays close to the server while walking, a round trip ahead at most', () => {
    const latency = 0.08;
    const { trace } = simulate(latency, 1.5, walkRight(0.3, 2));
    const lead = trace.filter((f) => f.t > 0.8).map((f) => f.shown - f.server);
    const maxLead = CONFIG.player.speed * (2 * latency + 1 / CONFIG.net.maxInputsPerSecond + TICK);
    for (const d of lead) {
      expect(d).toBeGreaterThanOrEqual(-1);
      expect(d).toBeLessThan(maxLead);
    }
  });

  it('follows a zigzag and still lands on the server position', () => {
    const zigzag = (t: number): InputState => {
      if (t < 0.3 || t > 2.2) return NO_INPUT;
      const phase = Math.floor((t - 0.3) / 0.25) % 4;
      return { ...NO_INPUT, moveX: phase === 0 ? 1 : phase === 2 ? -1 : 0, moveY: phase === 1 ? 1 : phase === 3 ? -1 : 0 };
    };
    const { me, server } = simulate(0.1, 3.5, zigzag);
    expect(Math.abs(me.x - server.x)).toBeLessThan(0.5);
    expect(Math.abs(me.y - server.y)).toBeLessThan(0.5);
  });
});
