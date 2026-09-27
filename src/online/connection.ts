import { CONFIG } from '../config';
import { darknessAt, hourOf } from '../core/clock';
import type { InputState } from '../core/input';
import type { RecipeId } from '../game/crafting';
import type { GameState } from '../game/state';
import { applySnapshot, createMirror } from '../net/apply';
import type { ClientMessage, ServerMessage } from '../net/protocol';
import { InputSender } from '../net/sender';
import { Smoother } from '../net/smooth';
import { revealAround } from '../systems/movement';

/** The race server. Override with VITE_RACE_SERVER (for example http://127.0.0.1:8787 for wrangler dev). */
export const RACE_SERVER: string = import.meta.env.VITE_RACE_SERVER ?? 'https://oxy8-race.yuriburger.workers.dev';

/** What the connection tells the screen. All texts are Dutch and meant for the player. */
export interface OnlineEvents {
  /** In the room, waiting for the other player. */
  waiting(code: string): void;
  /** A race starts (or restarts after a rematch, or after reconnecting): here is the mirror to draw. */
  start(state: GameState, seat: number): void;
  /** Something worth a toast. */
  notice(text: string): void;
  /** The other player asked for a rematch. */
  rematchAsked(): void;
  /** The room refused us or the connection is gone for good. */
  failed(text: string): void;
}

/**
 * One player's connection to a race room. It never simulates: it sends input and keeps the mirror
 * state up to date from the server's snapshots, so the rest of the game draws it like a local race.
 */
export class OnlineRace {
  state: GameState | null = null;
  seat = -1;
  private ws: WebSocket | null = null;
  private sender = new InputSender();
  private smoother = new Smoother();
  private closedByUs = false;
  /** Seconds left to get back in after the connection dropped; null while connected. */
  private reconnectUntil: number | null = null;

  private constructor(readonly code: string, private readonly events: OnlineEvents) {}

  /** Makes a new room and enters it. */
  static async create(events: OnlineEvents): Promise<OnlineRace> {
    const res = await fetch(`${RACE_SERVER}/rooms`, { method: 'POST' });
    if (!res.ok) throw new Error(`Server gaf ${res.status}`);
    const { code } = (await res.json()) as { code: string };
    const race = new OnlineRace(code, events);
    race.connect('?create=1');
    return race;
  }

  /** Enters an existing room. */
  static join(code: string, events: OnlineEvents): OnlineRace {
    const race = new OnlineRace(code, events);
    race.connect('');
    return race;
  }

  /** Every frame: send input when it changed, glide positions, reveal the own minimap. */
  update(input: InputState, now: number): void {
    const state = this.state;
    if (!state) return;
    const next = this.sender.next(input, now);
    if (next) this.send({ t: 'input', input: next });
    this.smoother.frame(state, now);
    const me = state.players[this.seat];
    if (me) {
      const seesFar = me.lamp || darknessAt(hourOf(state.time)) < 0.3;
      revealAround(state, me, seesFar ? CONFIG.player.revealRadius : CONFIG.player.revealRadiusDark);
    }
  }

  craft(id: RecipeId): void {
    this.send({ t: 'craft', id });
  }

  rematch(): void {
    this.send({ t: 'rematch' });
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close(1000, 'bye');
    this.ws = null;
  }

  private connect(query: string): void {
    const url = `${RACE_SERVER.replace(/^http/, 'ws')}/rooms/${this.code}${query}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener('message', (e) => this.receive(JSON.parse(String(e.data)) as ServerMessage));
    ws.addEventListener('close', () => this.lost(ws));
  }

  private receive(m: ServerMessage): void {
    switch (m.t) {
      case 'welcome':
        this.seat = m.seat;
        this.reconnectUntil = null;
        break;
      case 'waiting':
        this.events.waiting(this.code);
        break;
      case 'start':
        this.seat = m.seat;
        this.state = createMirror(m.seed, m.seat);
        this.state.race!.online = true;
        this.sender = new InputSender();
        this.smoother = new Smoother();
        this.events.start(this.state, m.seat);
        break;
      case 'snap':
        if (!this.state) return;
        this.smoother.before(this.state);
        applySnapshot(this.state, m.snap, this.seat);
        this.smoother.after(this.state, performance.now() / 1000);
        break;
      case 'opponent-away':
        this.events.notice(`De ander is weggevallen. Nog ${m.seconds} seconden om terug te komen`);
        break;
      case 'opponent-back':
        this.events.notice('De ander is terug');
        break;
      case 'rematch-asked':
        this.events.rematchAsked();
        break;
      case 'error':
        this.closedByUs = true;
        this.events.failed(m.text);
        break;
    }
  }

  /** The socket closed. Unless we meant it, try to get back into our seat for a while. */
  private lost(ws: WebSocket): void {
    if (ws !== this.ws || this.closedByUs) return;
    const now = performance.now() / 1000;
    if (this.seat < 0) {
      this.events.failed('Geen verbinding met de raceserver');
      return;
    }
    this.reconnectUntil ??= now + CONFIG.net.reconnectSeconds;
    if (now > this.reconnectUntil) {
      this.events.failed('De verbinding is verbroken');
      return;
    }
    this.events.notice('Verbinding kwijt, opnieuw verbinden…');
    setTimeout(() => this.connect(`?seat=${this.seat}`), 1500);
  }

  private send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}
