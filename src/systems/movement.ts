import { CONFIG } from '../config';
import type { GameState } from '../game/state';

/** Moves the player with input and knockback, then pushes them out of solid objects. */
export function movePlayer(state: GameState, moveX: number, moveY: number, speed: number, dt: number): void {
  const p = state.player;
  // Keys give length 1 or sqrt(2) and are normalised; a touch stick below 1 walks slower.
  const len = Math.max(1, Math.hypot(moveX, moveY));
  p.moving = moveX !== 0 || moveY !== 0;
  if (moveX !== 0) p.facing = moveX > 0 ? 1 : -1;

  p.x += ((moveX / len) * speed + p.kx) * dt;
  p.y += ((moveY / len) * speed + p.ky) * dt;
  const damping = Math.exp(-7 * dt);
  p.kx *= damping;
  p.ky *= damping;

  for (const o of state.world.solids) {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = o.r + 3;
    if (d < min && d > 0.01) {
      p.x = o.x + (dx / d) * min;
      p.y = o.y + (dy / d) * min;
    }
  }

  p.x = Math.max(8, Math.min(state.world.width - 8, p.x));
  p.y = Math.max(18, Math.min(state.world.height - 4, p.y));
  if (p.moving) p.walkTime += dt;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.leak = Math.max(0, p.leak - dt);
}

/** Marks tiles around the player as explored for the minimap. */
export function revealAround(state: GameState, radius: number): void {
  const { tileSize, tilesX, tilesY } = CONFIG.world;
  const tx = Math.floor(state.player.x / tileSize);
  const ty = Math.floor(state.player.y / tileSize);
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y > radius * radius) continue;
      const a = tx + x;
      const b = ty + y;
      if (a >= 0 && b >= 0 && a < tilesX && b < tilesY) state.explored[b * tilesX + a] = 1;
    }
  }
}
