import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import { emit, emitTo, type GameState, type Player } from '../game/state';

/**
 * A hit from a creeper or meteor: oxygen loss (less with a reinforced suit), a short
 * invulnerability window and visible leaking. `label` starts the toast, e.g. "Pak gescheurd".
 */
export function damagePlayer(state: GameState, p: Player, amount: number, label: string): void {
  const dealt = p.inventory.armour ? Math.round(amount * CONFIG.crafting.armour.damageFactor) : amount;
  p.oxygen = Math.max(0, p.oxygen - dealt);
  p.invulnerable = CONFIG.player.invulnerableAfterHit;
  p.leak = Math.max(p.leak, dealt >= 20 ? 3 : 2);
  emitTo(state, p, { type: 'toast', text: `${label}: -${dealt}% zuurstof` });
  emitTo(state, p, { type: 'hurt' });
  emitTo(state, p, { type: 'sound', name: 'hurt' });
  emitTo(state, p, { type: 'shake', amount: 0.35 });
  emit(state, { type: 'burst', x: p.x, y: p.y - 8, color: '#dff6ff', count: 18 });
}

/** Helmet lamp: toggled with F, costs energy while it is dark, switches off when energy runs out. */
export function updateLamp(state: GameState, player: Player, input: InputState, darkness: number, dt: number): void {
  if (input.toggleLamp) {
    if (!player.lamp && player.energy <= 0) {
      emitTo(state, player, { type: 'toast', text: 'Geen energie voor de lamp' });
    } else {
      player.lamp = !player.lamp;
      emitTo(state, player, { type: 'sound', name: 'lamp' });
      emitTo(state, player, { type: 'toast', text: player.lamp ? 'Helmlamp aan' : 'Helmlamp uit' });
    }
  }
  if (player.lamp && lampIsDraining(darkness)) {
    player.energy -= dt * CONFIG.energy.lampPerSecond;
    if (player.energy <= 0) {
      player.energy = 0;
      player.lamp = false;
      emitTo(state, player, { type: 'toast', text: 'Energie op: helmlamp uit' });
    }
  }
}

export function lampIsDraining(darkness: number): boolean {
  return darkness > 0.2;
}

/** Passive drain. Running out ends the game; step() decides what that means for the mode. */
export function updateOxygen(player: Player, dt: number, multiplier: number, extraPerSecond: number): void {
  player.oxygen = Math.max(0, player.oxygen - dt * (CONFIG.oxygen.drainPerSecond * multiplier + extraPerSecond));
}
