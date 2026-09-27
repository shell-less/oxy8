import { CONFIG } from '../config';
import { darknessAt, hourOf } from '../core/clock';
import { NO_INPUT, type InputState } from '../core/input';
import { placeBomb, updateBombs } from '../systems/bombs';
import { updateCreepers } from '../systems/creepers';
import { updateHazards } from '../systems/hazards';
import { updateInteraction } from '../systems/interaction';
import { ageBeacons, pickUpScrap, updateItems } from '../systems/items';
import { movePlayer, revealAround } from '../systems/movement';
import { updateLamp, updateOxygen } from '../systems/survival';
import { isStranded } from './campaign';
import { emit, type GameState, type Player, type RaceResult, type RaceState, type SupplyDrop } from './state';

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
    placeBomb(state, player, own);
    const extra = player.inPool ? CONFIG.hazards.toxic.extraDrainPerSecond : 0;
    updateOxygen(player, dt, mods.oxygenMultiplier, extra);
  }
  ageBeacons(state, dt);
  updateBombs(state, dt);

  const aggroFor = (player: Player) => {
    const hiddenInDark = darkness > 0.3 && !player.lamp;
    return (hiddenInDark ? CONFIG.enemies.aggroRangeDarkNoLamp : CONFIG.enemies.aggroRange) * mods.aggroMultiplier;
  };
  updateCreepers(state, dt, aggroFor);

  if (state.race) {
    updateRace(state, state.race, dt);
  } else if (state.players.some((p) => p.oxygen <= 0)) {
    state.status = 'dead';
  } else if (isStranded(state)) {
    state.status = 'stranded';
  }

  for (const player of state.players) {
    const seesFar = player.lamp || darkness < 0.3;
    revealAround(state, player, seesFar ? CONFIG.player.revealRadius : CONFIG.player.revealRadiusDark);
  }
}

/**
 * Race mode: every death loses, both at once is a draw. A launch (in the interaction system) wins.
 * At the time limit the most installed parts wins, then the most energy, otherwise it is a draw.
 */
function updateRace(state: GameState, race: RaceState, dt: number): void {
  race.elapsed += dt;
  if (state.status !== 'playing') return;
  updateDrop(state, race.drop);
  let result: RaceResult | null = null;
  const alive = state.players.filter((p) => p.oxygen > 0);
  if (alive.length < state.players.length) {
    result = { winner: alive.length === 1 ? alive[0].id : null, reason: 'death' };
  } else if (race.elapsed >= CONFIG.race.timeLimit) {
    result = { winner: leaderAtTime(state.players), reason: 'time' };
  }
  if (result) {
    race.result = result;
    state.status = 'over';
  }
}

/** The single best player by installed parts, then whole energy points; null when they are level. */
function leaderAtTime(players: readonly Player[]): number | null {
  const score = (p: Player) => [p.partsInstalled, Math.floor(p.energy)];
  const ranked = [...players].sort((a, b) => score(b)[0] - score(a)[0] || score(b)[1] - score(a)[1]);
  const [first, second] = ranked;
  if (!second) return first.id;
  const [a, b] = [score(first), score(second)];
  return a[0] === b[0] && a[1] === b[1] ? null : first.id;
}

/** The supply pod announces itself, then lands in the centre where both minimaps show it. */
function updateDrop(state: GameState, drop: SupplyDrop): void {
  if (drop.landed) return;
  if (!drop.warned && state.time >= drop.landsAt - CONFIG.race.dropWarnSeconds) {
    drop.warned = true;
    emit(state, { type: 'toast', text: 'Een bevoorradingscapsule landt zo in het midden' });
    emit(state, { type: 'sound', name: 'storm-warning' });
  }
  if (state.time >= drop.landsAt) {
    drop.landed = true;
    emit(state, { type: 'toast', text: 'De capsule is geland: een onderdeel en een energiecel' });
    emit(state, { type: 'sound', name: 'drop' });
    emit(state, { type: 'burst', x: drop.x, y: drop.y, color: '#ffb347', count: 30 });
    emit(state, { type: 'shake', amount: 0.3 });
  }
}
