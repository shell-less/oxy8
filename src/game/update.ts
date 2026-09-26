import { CONFIG } from '../config';
import { darknessAt, hourOf } from '../core/clock';
import type { InputState } from '../core/input';
import { updateCreepers } from '../systems/creepers';
import { updateHazards } from '../systems/hazards';
import { updateInteraction } from '../systems/interaction';
import { pickUpScrap, updateItems } from '../systems/items';
import { movePlayer, revealAround } from '../systems/movement';
import { updateLamp, updateOxygen } from '../systems/survival';
import { isStranded } from './campaign';
import type { GameState } from './state';

/** Advances the game by dt seconds. The order of the systems matters: hazards set the rules for this frame. */
export function step(state: GameState, input: InputState, dt: number): void {
  if (state.status !== 'playing') return;

  state.time += dt * state.timeScale;
  const darkness = darknessAt(hourOf(state.time));

  const mods = updateHazards(state, dt, darkness);
  updateLamp(state, input, darkness, dt);

  const busy = updateInteraction(state, input, dt);
  const moveX = busy ? 0 : input.moveX;
  const moveY = busy ? 0 : input.moveY;
  movePlayer(state, moveX, moveY, CONFIG.player.speed * mods.speedMultiplier, dt);
  pickUpScrap(state);
  updateItems(state, input, dt);

  updateOxygen(state, dt, mods.oxygenMultiplier, mods.extraOxygenPerSecond);

  const hiddenInDark = darkness > 0.3 && !state.lamp;
  const aggro = (hiddenInDark ? CONFIG.enemies.aggroRangeDarkNoLamp : CONFIG.enemies.aggroRange) * mods.aggroMultiplier;
  updateCreepers(state, dt, aggro);
  if (state.oxygen <= 0) {
    state.oxygen = 0;
    state.status = 'dead';
  } else if (isStranded(state)) {
    state.status = 'stranded';
  }

  const seesFar = state.lamp || darkness < 0.3;
  revealAround(state, seesFar ? CONFIG.player.revealRadius : CONFIG.player.revealRadiusDark);
}
