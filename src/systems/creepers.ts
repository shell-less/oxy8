import { CONFIG } from '../config';
import type { GameState } from '../game/state';
import type { Creeper } from '../world/types';
import { damagePlayer } from './survival';

/**
 * Creepers patrol an ellipse around their bunker. When the player comes close they give chase,
 * slower than the player, and give up when the player gets away or they stray too far from home.
 * They cannot be killed; after a hit they retreat for a while.
 */
export function updateCreepers(state: GameState, dt: number, aggroRange: number): void {
  const cfg = CONFIG.enemies;
  const p = state.player;
  for (const c of state.world.creepers) {
    c.angle += c.angularSpeed * c.direction * dt;
    c.cooldown = Math.max(0, c.cooldown - dt);
    const routeX = c.cx + Math.cos(c.angle) * c.rx;
    const routeY = c.cy + Math.sin(c.angle) * c.ry;
    const toPlayer = Math.hypot(p.x - c.x, p.y - c.y);
    const fromHome = Math.hypot(c.x - c.cx, c.y - c.cy);

    if (c.mode === 'patrol' && toPlayer < aggroRange && c.cooldown <= 0) c.mode = 'chase';
    else if (c.mode === 'chase' && (toPlayer > cfg.giveUpDistance || fromHome > cfg.leashDistance)) c.mode = 'return';

    const oldX = c.x;
    if (c.mode === 'patrol') {
      c.x = routeX;
      c.y = routeY;
    } else if (c.mode === 'chase') {
      stepTowards(c, p.x, p.y, cfg.chaseSpeed * dt);
    } else if (stepTowards(c, routeX, routeY, cfg.returnSpeed * dt) < 2) {
      c.mode = 'patrol';
    }
    if (Math.abs(c.x - oldX) > 0.001) c.facing = c.x > oldX ? 1 : -1;

    if (p.invulnerable <= 0 && Math.hypot(p.x - c.x, p.y - c.y) < cfg.hitRadius) {
      c.mode = 'return';
      c.cooldown = cfg.cooldownAfterHit;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      p.kx = (dx / d) * CONFIG.player.knockback;
      p.ky = (dy / d) * CONFIG.player.knockback;
      damagePlayer(state, CONFIG.oxygen.enemyHitDamage, `Pak gescheurd: -${CONFIG.oxygen.enemyHitDamage}% zuurstof`);
    }
  }
}

/** Moves towards a point and returns the distance that was left before the step. */
function stepTowards(c: Creeper, x: number, y: number, maxStep: number): number {
  const dx = x - c.x;
  const dy = y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const s = Math.min(d, maxStep);
  c.x += (dx / d) * s;
  c.y += (dy / d) * s;
  return d;
}
