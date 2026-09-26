import { CONFIG } from '../config';
import type { Beacon, GameState } from '../game/state';
import type { Creeper } from '../world/types';
import { damagePlayer } from './survival';

/**
 * Creepers guard bunkers and cannot be killed; after a hit they retreat for a while.
 * Crawlers walk an ellipse and chase the player, slower than the player.
 * Jumpers hop along the same ellipse and pounce on the player; they only hurt when they land on you.
 */
export function updateCreepers(state: GameState, dt: number, aggroRange: number): void {
  for (const c of state.world.creepers) {
    c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.kind === 'jumper') updateJumper(state, c, dt, aggroRange);
    else updateCrawler(state, c, dt, aggroRange);
  }
}

/** The nearest working decoy beacon this creeper can sense, if any. Beacons beat the player. */
function lureFor(state: GameState, c: Creeper): Beacon | null {
  let best: Beacon | null = null;
  let bestDist: number = CONFIG.crafting.beacon.range;
  for (const b of state.beacons) {
    const d = Math.hypot(b.x - c.x, b.y - c.y);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

function routePoint(c: Creeper): { x: number; y: number } {
  return { x: c.cx + Math.cos(c.angle) * c.rx, y: c.cy + Math.sin(c.angle) * c.ry };
}

function hurtPlayer(state: GameState, c: Creeper): void {
  const p = state.player;
  c.mode = 'return';
  c.cooldown = CONFIG.enemies.cooldownAfterHit;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  p.kx = (dx / d) * CONFIG.player.knockback;
  p.ky = (dy / d) * CONFIG.player.knockback;
  damagePlayer(state, CONFIG.oxygen.enemyHitDamage, 'Pak gescheurd');
}

function updateCrawler(state: GameState, c: Creeper, dt: number, aggroRange: number): void {
  const cfg = CONFIG.enemies;
  const p = state.player;
  c.angle += c.angularSpeed * c.direction * dt;
  const route = routePoint(c);
  const toPlayer = Math.hypot(p.x - c.x, p.y - c.y);
  const fromHome = Math.hypot(c.x - c.cx, c.y - c.cy);
  const lure = lureFor(state, c);

  const oldX = c.x;
  if (lure) {
    // Lured: walk to the beacon and stay there, whatever the leash says.
    c.mode = 'chase';
    if (Math.hypot(lure.x - c.x, lure.y - c.y) > 6) stepTowards(c, lure.x, lure.y, cfg.chaseSpeed * dt);
    if (Math.abs(c.x - oldX) > 0.001) c.facing = c.x > oldX ? 1 : -1;
    if (p.invulnerable <= 0 && toPlayer < cfg.hitRadius) hurtPlayer(state, c);
    return;
  }

  if (c.mode === 'patrol' && toPlayer < aggroRange && c.cooldown <= 0) c.mode = 'chase';
  else if (c.mode === 'chase' && (toPlayer > cfg.giveUpDistance || fromHome > cfg.leashDistance)) c.mode = 'return';

  if (c.mode === 'patrol') {
    c.x = route.x;
    c.y = route.y;
  } else if (c.mode === 'chase') {
    stepTowards(c, p.x, p.y, cfg.chaseSpeed * dt);
  } else if (stepTowards(c, route.x, route.y, cfg.returnSpeed * dt) < 2) {
    c.mode = 'patrol';
  }
  if (Math.abs(c.x - oldX) > 0.001) c.facing = c.x > oldX ? 1 : -1;

  if (p.invulnerable <= 0 && Math.hypot(p.x - c.x, p.y - c.y) < cfg.hitRadius) hurtPlayer(state, c);
}

function updateJumper(state: GameState, c: Creeper, dt: number, aggroRange: number): void {
  const J = CONFIG.enemies.jumper;
  const j = c.jump!;
  const p = state.player;
  j.timer -= dt;
  const toPlayer = Math.hypot(p.x - c.x, p.y - c.y);
  const fromHome = Math.hypot(c.x - c.cx, c.y - c.cy);

  switch (j.phase) {
    case 'rest': {
      const canPounce = c.mode !== 'return' && c.cooldown <= 0 && fromHome < CONFIG.enemies.leashDistance;
      if (lureFor(state, c) || (canPounce && toPlayer < aggroRange)) {
        j.phase = 'crouch';
        j.timer = J.crouchSeconds;
        c.mode = 'chase';
        aim(state, c);
      } else if (j.timer <= 0) {
        startHop(c);
      }
      break;
    }
    case 'crouch':
      // The landing spot follows the player until the jump starts; then it is fixed and can be dodged.
      aim(state, c);
      if (j.timer <= 0) {
        startJump(c, 'pounce', j.toX, j.toY, J.pounceSeconds);
        state.events.push({ type: 'sound', name: 'pounce' });
      }
      break;
    case 'hop':
    case 'pounce': {
      const t = 1 - Math.max(0, j.timer) / j.duration;
      c.x = j.fromX + (j.toX - j.fromX) * t;
      c.y = j.fromY + (j.toY - j.fromY) * t;
      j.z = Math.sin(Math.PI * t) * (j.phase === 'pounce' ? J.pounceHeight : J.hopHeight);
      if (j.timer <= 0) land(state, c);
      break;
    }
    case 'recover':
      if (j.timer <= 0) rest(state, c);
      break;
  }
}

/** Aim the pounce at a beacon if one lures this jumper, otherwise at the player. */
function aim(state: GameState, c: Creeper): void {
  const j = c.jump!;
  const target = lureFor(state, c) ?? state.player;
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const reach = Math.min(d, CONFIG.enemies.jumper.pounceRange);
  j.toX = c.x + (dx / d) * reach;
  j.toY = c.y + (dy / d) * reach;
  c.facing = dx >= 0 ? 1 : -1;
}

/** A small hop along the patrol ellipse, or back towards it after a pounce. */
function startHop(c: Creeper): void {
  const J = CONFIG.enemies.jumper;
  let route = routePoint(c);
  if (Math.hypot(route.x - c.x, route.y - c.y) < J.hopDistance * 0.6) {
    c.angle += (c.direction * J.hopDistance) / ((c.rx + c.ry) / 2);
    route = routePoint(c);
  }
  const dx = route.x - c.x;
  const dy = route.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const s = Math.min(d, J.hopDistance);
  startJump(c, 'hop', c.x + (dx / d) * s, c.y + (dy / d) * s, J.hopSeconds);
}

function startJump(c: Creeper, phase: 'hop' | 'pounce', toX: number, toY: number, duration: number): void {
  const j = c.jump!;
  j.phase = phase;
  j.fromX = c.x;
  j.fromY = c.y;
  j.toX = toX;
  j.toY = toY;
  j.duration = duration;
  j.timer = duration;
  if (Math.abs(toX - c.x) > 0.5) c.facing = toX > c.x ? 1 : -1;
}

function land(state: GameState, c: Creeper): void {
  const j = c.jump!;
  const p = state.player;
  const pounced = j.phase === 'pounce';
  c.x = j.toX;
  c.y = j.toY;
  j.z = 0;
  if (pounced) {
    state.events.push({ type: 'burst', x: c.x, y: c.y, color: state.world.planet.theme.dust, count: 8 });
    state.events.push({ type: 'sound', name: 'land' });
  }

  if (p.invulnerable <= 0 && Math.hypot(p.x - c.x, p.y - c.y) < CONFIG.enemies.jumper.hitRadius) {
    hurtPlayer(state, c);
  } else if (pounced) {
    c.mode = Math.hypot(c.x - c.cx, c.y - c.cy) < CONFIG.enemies.leashDistance ? 'patrol' : 'return';
  }

  if (pounced) {
    j.phase = 'recover';
    j.timer = CONFIG.enemies.jumper.recoverSeconds;
  } else {
    if (c.mode === 'return' && isOnRoute(c)) c.mode = 'patrol';
    rest(state, c);
  }
}

function isOnRoute(c: Creeper): boolean {
  const r = routePoint(c);
  return Math.hypot(r.x - c.x, r.y - c.y) < CONFIG.enemies.jumper.hopDistance;
}

function rest(state: GameState, c: Creeper): void {
  const J = CONFIG.enemies.jumper;
  const j = c.jump!;
  j.phase = 'rest';
  j.timer = J.restMin + state.rng.next() * J.restJitter;
  if (c.mode === 'chase') c.mode = 'patrol';
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
