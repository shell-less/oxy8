import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import { emit, type GameState } from '../game/state';

/** Walking over scrap picks it up. */
export function pickUpScrap(state: GameState): void {
  const p = state.player;
  for (const s of state.world.scrap) {
    if (s.taken || Math.hypot(p.x - s.x, p.y - s.y) > CONFIG.crafting.pickupRange) continue;
    s.taken = true;
    state.inventory.scrap++;
    emit(state, { type: 'burst', x: s.x, y: s.y - 2, color: '#d8e0e8', count: 8 });
    emit(state, { type: 'toast', text: `Schroot opgepakt (${state.inventory.scrap})` });
    emit(state, { type: 'progress' });
  }
}

/** Q uses an oxygen bottle, R places a decoy beacon. Beacons run out after a while. */
export function updateItems(state: GameState, input: InputState, dt: number): void {
  const inv = state.inventory;
  const p = state.player;
  const c = CONFIG.crafting;

  if (input.useBottle) {
    if (inv.bottles <= 0) {
      emit(state, { type: 'toast', text: 'Je hebt geen zuurstoffles. Maak er een bij je schip' });
    } else if (state.oxygen >= 99) {
      emit(state, { type: 'toast', text: 'Je zuurstoftank is vol' });
    } else {
      inv.bottles--;
      state.oxygen = Math.min(100, state.oxygen + c.bottle.oxygen);
      emit(state, { type: 'burst', x: p.x, y: p.y - 10, color: '#4fd8ff', count: 14 });
      emit(state, { type: 'toast', text: `Zuurstoffles gebruikt: +${c.bottle.oxygen}%` });
      emit(state, { type: 'progress' });
    }
  }

  if (input.placeBeacon) {
    if (inv.beacons <= 0) {
      emit(state, { type: 'toast', text: 'Je hebt geen lokbaken. Maak er een bij je schip' });
    } else {
      inv.beacons--;
      state.beacons.push({ x: p.x + p.facing * 6, y: p.y + 2, timeLeft: c.beacon.lifetime });
      emit(state, { type: 'toast', text: 'Lokbaken geplaatst' });
      emit(state, { type: 'progress' });
    }
  }

  for (const b of state.beacons) b.timeLeft -= dt;
  state.beacons = state.beacons.filter((b) => b.timeLeft > 0);
}
