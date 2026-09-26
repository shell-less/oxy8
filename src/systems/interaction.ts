import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import { emit, type GameState, type Target } from '../game/state';

export interface ActionInfo {
  /** Prompt shown at the bottom of the screen. */
  text: string;
  /** False when the prompt is only informational. */
  available: boolean;
  /** Seconds E must be held. */
  duration: number;
}

/** The nearest bunker in range, otherwise the ship if in range. */
export function findTarget(state: GameState): Target | null {
  const p = state.player;
  const { bunkerRange, shipRange } = CONFIG.interaction;
  let best: Target | null = null;
  let bestDist = Infinity;
  for (const bunker of state.world.bunkers) {
    const d = Math.hypot(p.x - bunker.x, p.y - (bunker.y + 4));
    if (d < bunkerRange && d < bestDist) {
      bestDist = d;
      best = { kind: 'bunker', bunker };
    }
  }
  const ship = state.world.ship;
  if (!best && Math.hypot(p.x - ship.x, p.y - (ship.y + 2)) < shipRange) best = { kind: 'ship' };
  return best;
}

export function describe(state: GameState, target: Target | null): ActionInfo | null {
  if (!target) return null;
  const ia = CONFIG.interaction;
  const needed = state.world.planet.partsNeeded;
  const info = (text: string, available = false, duration = 0): ActionInfo => ({ text, available, duration });

  if (target.kind === 'ship') {
    if (state.partsInstalled >= needed) return info('[E] Lanceren', true, ia.launchSeconds);
    if (state.partsCarried > state.partsInstalled) {
      const cost = CONFIG.energy.installCost;
      if (state.energy < cost) return info(`Te weinig energie (${cost} nodig)`);
      return info(`[E] Onderdeel inbouwen (-${cost} energie)`, true, ia.installSeconds);
    }
    return info(`Schip mist nog ${needed - state.partsInstalled} onderdelen`);
  }

  const b = target.bunker;
  if (b.kind === 'parts') {
    return b.looted ? info('Bunker is leeg') : info('[E] Onderdelenbunker openen', true, ia.openPartsSeconds);
  }
  if (state.oxygen > 97 && !b.energyCell) return info('Zuurstoftank is vol');
  return info('[E] Voorraadbunker openen', true, ia.openSupplySeconds);
}

/**
 * Hold E to perform the action. Returns true while the player is busy, so movement pauses.
 * Being hit resets progress, because damage knocks the player out of range.
 */
export function updateInteraction(state: GameState, input: InputState, dt: number): boolean {
  const ia = state.interaction;
  const target = findTarget(state);
  const info = describe(state, target);
  const sameTarget = sameTargetAs(ia.target, target);
  ia.target = target;
  if (!sameTarget) ia.progress = 0;

  if (!input.interact) {
    ia.latched = false;
    ia.progress = 0;
    return false;
  }
  if (!info?.available || !target || ia.latched) {
    ia.progress = 0;
    return false;
  }
  ia.progress += dt / info.duration;
  if (ia.progress >= 1) {
    ia.progress = 0;
    ia.latched = true;
    perform(state, target);
  }
  return true;
}

function sameTargetAs(a: Target | null, b: Target | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'ship' || b.kind === 'ship') return a.kind === b.kind;
  return a.bunker === b.bunker;
}

function perform(state: GameState, target: Target): void {
  const needed = state.world.planet.partsNeeded;
  if (target.kind === 'ship') {
    const ship = state.world.ship;
    if (state.partsInstalled >= needed) {
      emit(state, { type: 'burst', x: ship.x, y: ship.y - 10, color: '#ffd24a', count: 40 });
      state.status = 'launched';
      return;
    }
    state.partsInstalled++;
    state.energy -= CONFIG.energy.installCost;
    emit(state, { type: 'burst', x: ship.x - 14 + (state.partsInstalled - 1) * 6, y: ship.y - 9, color: '#7dff8a', count: 16 });
    emit(state, {
      type: 'toast',
      text: state.partsInstalled >= needed
        ? 'Schip compleet. Houd E vast om te lanceren'
        : `Onderdeel ingebouwd (${state.partsInstalled}/${needed})`,
    });
    return;
  }

  const b = target.bunker;
  if (b.kind === 'parts') {
    b.looted = true;
    state.partsCarried++;
    emit(state, { type: 'burst', x: b.x, y: b.y - 10, color: '#ffb347', count: 20 });
    emit(state, { type: 'toast', text: `Scheepsonderdeel gevonden (${state.partsCarried}/${needed})` });
    return;
  }

  state.oxygen = 100;
  let text = 'Zuurstof bijgevuld';
  if (b.energyCell) {
    b.energyCell = false;
    state.energy = Math.min(100, state.energy + CONFIG.energy.cellAmount);
    text += `, energiecel +${CONFIG.energy.cellAmount}`;
  }
  emit(state, { type: 'burst', x: b.x, y: b.y - 10, color: '#4fd8ff', count: 16 });
  emit(state, { type: 'toast', text });
}
