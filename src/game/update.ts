import { CONFIG } from '../config';
import { darknessAt, hourOf } from '../core/clock';
import { NO_INPUT, type InputState } from '../core/input';
import { updateCreepers } from '../systems/creepers';
import { updateHazards } from '../systems/hazards';
import { updateInteraction } from '../systems/interaction';
import { ageBeacons, pickUpScrap, updateItems } from '../systems/items';
import { movePlayer, revealAround } from '../systems/movement';
import { updateLamp, updateOxygen } from '../systems/survival';
import { isStranded } from './campaign';
import type { GameState, Player } from './state';

/**
 * Advances the game by dt seconds. The order of the systems matters: hazards set the rules for this frame.
 * `input` is one InputState for solo play, or one per player (by index) when several share the planet.
 */
export function step(state: GameState, input: InputState | readonly InputState[], dt: number): void {
  if (state.status !== 'playing') return;
  const inputs: readonly InputState[] = Array.isArray(input) ? input : [input];

  state.time += dt * state.timeScale;
  const darkness = darknessAt(hourOf(state.time));

  const mods = updateHazards(state, dt, darkness);

  for (const player of state.players) {
    const own = inputs[player.id] ?? NO_INPUT;
    updateLamp(state, player, own, darkness, dt);
    const busy = updateInteraction(state, player, own, dt);
    const moveX = busy ? 0 : own.moveX;
    const moveY = busy ? 0 : own.moveY;
    movePlayer(state, player, moveX, moveY, CONFIG.player.speed * mods.speedMultiplier, dt);
    pickUpScrap(state, player);
    updateItems(state, player, own);
    const extra = player.inPool ? CONFIG.hazards.toxic.extraDrainPerSecond : 0;
    updateOxygen(state, player, dt, mods.oxygenMultiplier, extra);
  }
  ageBeacons(state, dt);

  const aggroFor = (player: Player) => {
    const hiddenInDark = darkness > 0.3 && !player.lamp;
    return (hiddenInDark ? CONFIG.enemies.aggroRangeDarkNoLamp : CONFIG.enemies.aggroRange) * mods.aggroMultiplier;
  };
  updateCreepers(state, dt, aggroFor);

  for (const player of state.players) {
    if (player.oxygen <= 0) {
      player.oxygen = 0;
      state.status = 'dead';
    }
  }
  if (state.mode === 'solo' && state.status === 'playing' && isStranded(state)) state.status = 'stranded';

  for (const player of state.players) {
    const seesFar = player.lamp || darkness < 0.3;
    revealAround(state, player, seesFar ? CONFIG.player.revealRadius : CONFIG.player.revealRadiusDark);
  }
}
