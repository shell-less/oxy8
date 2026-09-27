import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import { emit, type GameState, type Player } from '../game/state';

/** Walking over scrap picks it up. */
export function pickUpScrap(state: GameState, p: Player): void {
  for (const s of state.world.scrap) {
    if (s.taken || Math.hypot(p.x - s.x, p.y - s.y) > CONFIG.crafting.pickupRange) continue;
    s.taken = true;
    p.inventory.scrap++;
    emit(state, { type: 'burst', x: s.x, y: s.y - 2, color: '#d8e0e8', count: 8 });
    emit(state, { type: 'sound', name: 'pickup' });
    emit(state, { type: 'toast', text: `Schroot opgepakt (${p.inventory.scrap})` });
    emit(state, { type: 'progress' });
  }
}

/** Q uses an oxygen bottle, R places a decoy beacon. */
export function updateItems(state: GameState, p: Player, input: InputState): void {
  const inv = p.inventory;
  const c = CONFIG.crafting;

  if (input.useBottle) {
    if (inv.bottles <= 0) {
      emit(state, { type: 'toast', text: 'Je hebt geen zuurstoffles. Maak er een bij je schip' });
      emit(state, { type: 'sound', name: 'deny' });
    } else if (p.oxygen >= 99) {
      emit(state, { type: 'toast', text: 'Je zuurstoftank is vol' });
    } else {
      inv.bottles--;
      p.oxygen = Math.min(100, p.oxygen + c.bottle.oxygen);
      emit(state, { type: 'burst', x: p.x, y: p.y - 10, color: '#4fd8ff', count: 14 });
      emit(state, { type: 'sound', name: 'bottle' });
      emit(state, { type: 'toast', text: `Zuurstoffles gebruikt: +${c.bottle.oxygen}%` });
      emit(state, { type: 'progress' });
    }
  }

  if (input.placeBeacon) {
    if (inv.beacons <= 0) {
      emit(state, { type: 'toast', text: 'Je hebt geen lokbaken. Maak er een bij je schip' });
      emit(state, { type: 'sound', name: 'deny' });
    } else {
      inv.beacons--;
      state.beacons.push({ x: p.x + p.facing * 6, y: p.y + 2, timeLeft: c.beacon.lifetime });
      emit(state, { type: 'toast', text: 'Lokbaken geplaatst' });
      emit(state, { type: 'sound', name: 'beacon' });
      emit(state, { type: 'progress' });
    }
  }

}

/** Placed beacons run out after a while. */
export function ageBeacons(state: GameState, dt: number): void {
  for (const b of state.beacons) b.timeLeft -= dt;
  state.beacons = state.beacons.filter((b) => b.timeLeft > 0);
}
