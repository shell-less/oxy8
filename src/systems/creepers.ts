import { CONFIG } from '../config';
import type { Beacon, GameState, Player } from '../game/state';
import type { Creeper } from '../world/types';
import { damagePlayer } from './survival';

/**
 * Creepers guard bunkers and cannot be killed; after a hit they retreat for a while.
 * Crawlers walk an ellipse and chase the player, slower than the player.
 * Jumpers hop along the same ellipse and pounce on the player; they only hurt when they land on you.
 * Gliders skate along the ellipse and charge in a straight line; they cannot steer, so stepping aside dodges them.
 * With several players on the planet, every creeper goes for the one nearest to it.
 * `aggroFor` gives the distance at which a creeper notices a player (it depends on their lamp).
 */
export function updateCreepers(state: GameState, dt: number, aggroFor: (player: Player) => number): void {
  for (const c of state.world.creepers) {
    c.cooldown = Math.max(0, c.cooldown - dt);
    const p = nearestPlayer(state, c);
    const aggroRange = aggroFor(p);
    if (c.kind === 'jumper') updateJumper(state, c, p, dt, aggroRange);
    else if (c.kind === 'glider') updateGlider(state, c, p, dt, aggroRange);
    else updateCrawler(state, c, p, dt, aggroRange);
  }
}

/** The player closest to this creeper. The first one wins a tie, so solo play is unchanged. */
export function nearestPlayer(state: GameState, c: Creeper): Player {
  let best = state.players[0];
  let bestDist = Infinity;
  for (const p of state.players) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
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

function hurtPlayer(state: GameState, c: Creeper, p: Player): void {
  c.mode = 'return';
  c.cooldown = CONFIG.enemies.cooldownAfterHit;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  p.kx = (dx / d) * CONFIG.player.knockback;
  p.ky = (dy / d) * CONFIG.player.knockback;
  damagePlayer(state, p, CONFIG.oxygen.enemyHitDamage, 'Pak gescheurd');
}

function updateCrawler(state: GameState, c: Creeper, p: Player, dt: number, aggroRange: number): void {
  const cfg = CONFIG.enemies;
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
    if (p.invulnerable <= 0 && toPlayer < cfg.hitRadius) hurtPlayer(state, c, p);
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

  if (p.invulnerable <= 0 && Math.hypot(p.x - c.x, p.y - c.y) < cfg.hitRadius) hurtPlayer(state, c, p);
}

function updateJumper(state: GameState, c: Creeper, p: Player, dt: number, aggroRange: number): void {
  const J = CONFIG.enemies.jumper;
  const j = c.jump!;
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
        aim(state, c, p);
      } else if (j.timer <= 0) {
        startHop(c);
      }
      break;
    }
    case 'crouch':
      // The landing spot follows the player until the jump starts; then it is fixed and can be dodged.
      aim(state, c, p);
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
      if (j.timer <= 0) land(state, c, p);
      break;
    }
    case 'recover':
      if (j.timer <= 0) rest(state, c);
      break;
  }
}

/** Aim the pounce at a beacon if one lures this jumper, otherwise at the player. */
function aim(state: GameState, c: Creeper, p: Player): void {
  const j = c.jump!;
  const target = lureFor(state, c) ?? p;
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

function land(state: GameState, c: Creeper, p: Player): void {
  const j = c.jump!;
  const pounced = j.phase === 'pounce';
  c.x = j.toX;
  c.y = j.toY;
  j.z = 0;
  if (pounced) {
    state.events.push({ type: 'burst', x: c.x, y: c.y, color: state.world.planet.theme.dust, count: 8 });
    state.events.push({ type: 'sound', name: 'land' });
  }

  if (p.invulnerable <= 0 && Math.hypot(p.x - c.x, p.y - c.y) < CONFIG.enemies.jumper.hitRadius) {
    hurtPlayer(state, c, p);
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

function updateGlider(state: GameState, c: Creeper, p: Player, dt: number, aggroRange: number): void {
  const G = CONFIG.enemies.glider;
  const s = c.slide!;
  s.timer -= dt;

  switch (s.phase) {
    case 'glide': {
      const toPlayer = Math.hypot(p.x - c.x, p.y - c.y);
      const fromHome = Math.hypot(c.x - c.cx, c.y - c.cy);
      const canCharge = c.cooldown <= 0 && fromHome < CONFIG.enemies.leashDistance;
      if (lureFor(state, c) || (canCharge && toPlayer < aggroRange)) {
        s.phase = 'brace';
        s.timer = G.braceSeconds;
        c.mode = 'chase';
        aimSlide(state, c, p);
        break;
      }
      const oldX = c.x;
      c.angle += c.angularSpeed * c.direction * dt;
      const route = routePoint(c);
      if (c.mode === 'patrol') {
        c.x = route.x;
        c.y = route.y;
      } else if (stepTowards(c, route.x, route.y, CONFIG.enemies.returnSpeed * dt) < 2) {
        c.mode = 'patrol';
      }
      if (Math.abs(c.x - oldX) > 0.001) c.facing = c.x > oldX ? 1 : -1;
      break;
    }
    case 'brace':
      // The direction follows the target until the slide starts; then it is fixed and can be dodged.
      aimSlide(state, c, p);
      if (s.timer <= 0) {
        s.phase = 'slide';
        s.speed = G.slideSpeed;
        state.events.push({ type: 'sound', name: 'slide' });
      }
      break;
    case 'slide': {
      const { width, height } = state.world;
      c.x = Math.min(width - 8, Math.max(8, c.x + s.dirX * s.speed * dt));
      c.y = Math.min(height - 8, Math.max(8, c.y + s.dirY * s.speed * dt));
      s.speed -= G.slideFriction * dt;
      if (p.invulnerable <= 0 && Math.hypot(p.x - c.x, p.y - c.y) < G.hitRadius) {
        hurtPlayer(state, c, p);
        s.speed = 0;
      }
      if (s.speed <= G.stopSpeed) {
        s.phase = 'recover';
        s.timer = G.recoverSeconds;
      }
      break;
    }
    case 'recover':
      if (s.timer <= 0) {
        // Skate back to the route; a glider that missed may charge again on the way.
        s.phase = 'glide';
        c.mode = 'return';
      }
      break;
  }
}

/** Point the charge at a beacon if one lures this glider, otherwise at the player. */
function aimSlide(state: GameState, c: Creeper, p: Player): void {
  const s = c.slide!;
  const target = lureFor(state, c) ?? p;
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  s.dirX = dx / d;
  s.dirY = dy / d;
  if (Math.abs(dx) > 0.5) c.facing = dx > 0 ? 1 : -1;
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
