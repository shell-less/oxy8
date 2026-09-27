import { DurableObject } from 'cloudflare:workers';
import { CONFIG } from '../../src/config';
import { Match } from '../../src/net/match';
import { parseClientMessage, type ServerMessage } from '../../src/net/protocol';
import type { Env } from './env';

/** Stored on each WebSocket, so it survives hibernation. Seat -1 while the player is joining. */
interface Attachment {
  code: string;
  seat: number;
}

/**
 * One race room: a thin shell around `Match`, which holds all the rules. This class only moves
 * messages between WebSockets and the match, and keeps time.
 *
 * Cost: while a room waits for its second player it has no timer, so it can hibernate and costs
 * nothing. During a race, and while both players look at the result, a timer runs the ticks and
 * keeps it awake. When everybody has left, the timer stops and the room is forgotten.
 */
export class RaceRoom extends DurableObject<Env> {
  private match: Match | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** A socket that is joining right now: the match greets it before its seat is known. */
  private joining: WebSocket | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Woken from hibernation with players still connected. That only happens while waiting (a
    // race keeps the room awake), so seating them again rebuilds the room exactly.
    const sockets = ctx.getWebSockets();
    if (sockets.length > 0) {
      const code = attachment(sockets[0]).code;
      this.match = this.newMatch(code);
      for (const ws of sockets) this.seat(ws, undefined);
    }
  }

  /** Called by the Worker for a new room code. False when the code is in use. */
  async reserve(code: string): Promise<boolean> {
    if (this.match || this.ctx.getWebSockets().length > 0) return false;
    this.match = this.newMatch(code);
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.pathname.split('/').pop()!.toUpperCase();
    const create = url.searchParams.get('create') === '1';
    const seatParam = url.searchParams.get('seat');
    const rejoin = seatParam === null ? undefined : Number(seatParam);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ code, seat: -1 } satisfies Attachment);

    if (!this.match && create) this.match = this.newMatch(code);
    if (!this.match) {
      this.refuse(server, 'Deze kamer bestaat niet (meer)');
    } else if (this.seat(server, Number.isInteger(rejoin) ? rejoin : undefined) === null) {
      this.refuse(server, 'Deze kamer is vol');
    }
    this.updateTimer();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const match = this.match;
    const { seat } = attachment(ws);
    const message = parseClientMessage(typeof data === 'string' ? data : null);
    if (!match || seat < 0 || !message) return;
    if (message.t === 'input') match.input(seat, message.input, now());
    else if (message.t === 'craft') match.craft(seat, message.id);
    else match.rematch(seat);
    this.updateTimer();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  private newMatch(code: string): Match {
    return new Match(code, (seat, message) => this.send(seat, message), randomSeed);
  }

  /** Seats a socket in the match. Returns the seat, or null when the room is full. */
  private seat(ws: WebSocket, rejoin: number | undefined): number | null {
    this.joining = ws;
    const seat = this.match!.join(now(), rejoin);
    this.joining = null;
    if (seat !== null) ws.serializeAttachment({ ...attachment(ws), seat } satisfies Attachment);
    return seat;
  }

  private gone(ws: WebSocket): void {
    const { seat } = attachment(ws);
    try {
      ws.close(1000, 'bye');
    } catch {
      // Already closed.
    }
    if (this.match && seat >= 0) {
      this.match.leave(seat, now());
      // An empty room that never started is given up, so its code is free again.
      if (this.match.phase === 'waiting' && this.match.empty && this.openSockets(ws).length === 0) this.match = null;
    }
    this.updateTimer();
  }

  private send(seat: number, message: ServerMessage): void {
    let ws = this.ctx.getWebSockets().find((s) => attachment(s).seat === seat);
    if (!ws && this.joining) {
      ws = this.joining;
      ws.serializeAttachment({ ...attachment(ws), seat } satisfies Attachment);
    }
    try {
      ws?.send(JSON.stringify(message));
    } catch {
      // The socket closed under us; its close handler deals with it.
    }
  }

  private refuse(ws: WebSocket, text: string): void {
    ws.send(JSON.stringify({ t: 'error', text } satisfies ServerMessage));
    ws.close(4000, 'refused');
  }

  /** Sockets still open, other than one that is closing. */
  private openSockets(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s !== except && s.readyState === WebSocket.READY_STATE_OPEN);
  }

  /**
   * Ticks while a race runs (also with nobody connected, so the reconnect time can run out) and
   * while someone looks at the result, so a rematch still finds the room. Otherwise no timer,
   * so the room can hibernate.
   */
  private updateTimer(): void {
    const m = this.match;
    const wanted = m !== null && (m.phase === 'playing' || (m.phase === 'over' && !m.empty));
    if (wanted && !this.timer) {
      this.timer = setInterval(() => {
        this.match?.tick(now());
        this.updateTimer();
      }, 1000 / CONFIG.net.tickRate);
    } else if (!wanted && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      if (m?.empty && m.phase !== 'waiting') this.match = null;
    }
  }
}

function attachment(ws: WebSocket): Attachment {
  return (ws.deserializeAttachment() as Attachment | null) ?? { code: '', seat: -1 };
}

function now(): number {
  return Date.now() / 1000;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
