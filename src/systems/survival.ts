import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import { emit, type GameState, type Player } from '../game/state';

/**
 * A hit from a creeper or meteor: oxygen loss (less with a reinforced suit), a short
 * invulnerability window and visible leaking. `label` starts the toast, e.g. "Pak gescheurd".
 */
export function damagePlayer(state: GameState, p: Player, amount: number, label: string): void {
  const dealt = p.inventory.armour ? Math.round(amount * CONFIG.crafting.armour.damageFactor) : amount;
  p.oxygen = Math.max(0, p.oxygen - dealt);
  p.invulnerable = CONFIG.player.invulnerableAfterHit;
  p.leak = Math.max(p.leak, dealt >= 20 ? 3 : 2);
  emit(state, { type: 'toast', text: `${label}: -${dealt}% zuurstof` });
  emit(state, { type: 'hurt' });
  emit(state, { type: 'sound', name: 'hurt' });
  emit(state, { type: 'shake', amount: 0.35 });
  emit(state, { type: 'burst', x: p.x, y: p.y - 8, color: '#dff6ff', count: 18 });
}

/** Helmet lamp: toggled with F, costs energy while it is dark, switches off when energy runs out. */
export function updateLamp(state: GameState, player: Player, input: InputState, darkness: number, dt: number): void {
  if (input.toggleLamp) {
    if (!player.lamp && player.energy <= 0) {
      emit(state, { type: 'toast', text: 'Geen energie voor de lamp' });
    } else {
      player.lamp = !player.lamp;
      emit(state, { type: 'sound', name: 'lamp' });
      emit(state, { type: 'toast', text: player.lamp ? 'Helmlamp aan' : 'Helmlamp uit' });
    }
  }
  if (player.lamp && lampIsDraining(darkness)) {
    player.energy -= dt * CONFIG.energy.lampPerSecond;
    if (player.energy <= 0) {
      player.energy = 0;
      player.lamp = false;
      emit(state, { type: 'toast', text: 'Energie op: helmlamp uit' });
    }
  }
}

export function lampIsDraining(darkness: number): boolean {
  return darkness > 0.2;
}

export function updateOxygen(state: GameState, player: Player, dt: number, multiplier: number, extraPerSecond: number): void {
  player.oxygen -= dt * (CONFIG.oxygen.drainPerSecond * multiplier + extraPerSecond);
  if (player.oxygen <= 0) {
    player.oxygen = 0;
    state.status = 'dead';
  }
}
