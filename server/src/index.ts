import { newRoomCode, normaliseRoomCode } from '../../src/net/codes';
import type { Env } from './env';

export { RaceRoom } from './room';

/**
 * The Worker in front of the rooms.
 *
 *   GET  /              health check
 *   POST /rooms         a new room: { code }
 *   GET  /rooms/CODE    WebSocket into that room; ?create=1 for the player who made it,
 *                       ?seat=N to come back after dropping out
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = originAllowed(origin, env);
    const cors: Record<string, string> = allowed && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'content-type' } });
    }
    if (url.pathname === '/') return new Response('Oxy8 race server\n', { headers: cors });
    if (!allowed) return new Response('Origin not allowed\n', { status: 403 });

    if (url.pathname === '/rooms' && request.method === 'POST') {
      // A handful of tries is plenty: with 280,000 codes a collision is rare.
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = newRoomCode(cryptoRandom);
        if (await env.RACE_ROOM.getByName(code).reserve(code)) return Response.json({ code }, { headers: cors });
      }
      return new Response('No free room code\n', { status: 503, headers: cors });
    }

    const match = url.pathname.match(/^\/rooms\/([A-Za-z]+)$/);
    if (match) {
      const code = normaliseRoomCode(match[1]);
      if (!code) return new Response('Unknown room\n', { status: 404, headers: cors });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket\n', { status: 426, headers: cors });
      return env.RACE_ROOM.getByName(code).fetch(request);
    }
    return new Response('Not found\n', { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;

/** Pages from other sites may not use the server; tools that send no Origin (tests, curl) may. */
function originAllowed(origin: string | null, env: Env): boolean {
  if (!origin) return true;
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).includes(origin);
}

function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
