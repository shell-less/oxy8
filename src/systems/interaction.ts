import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import { unlockIfRepaired } from '../game/campaign';
import { emit, emitTo, isRepaired, shipOf, type GameState, type Player, type Target } from '../game/state';
import { PLANETS } from '../world/planets';

/** 'launch' is race mode only: a repaired ship takes off and wins the race. */
export type Action = 'install' | 'starmap' | 'launch' | 'open' | 'none';

export interface ActionInfo {
  action: Action;
  /** Prompt shown at the bottom of the screen. */
  text: string;
  /** False when the prompt is only informational. */
  available: boolean;
  /** Seconds E must be held. */
  duration: number;
}

/** The nearest bunker in range, otherwise the ship if in range. */
export function findTarget(state: GameState, p: Player): Target | null {
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
  const ship = shipOf(state, p);
  if (!best && Math.hypot(p.x - ship.x, p.y - (ship.y + 2)) < shipRange) best = { kind: 'ship' };
  return best;
}

export function describe(state: GameState, p: Player, target: Target | null): ActionInfo | null {
  if (!target) return null;
  const ia = CONFIG.interaction;
  const needed = state.world.planet.partsNeeded;
  const info = (text: string, action: Action = 'none', duration = 0): ActionInfo => ({
    text, action, available: action !== 'none', duration,
  });

  if (target.kind === 'ship') {
    const cost = CONFIG.energy.installCost;
    const waiting = p.partsCarried > p.partsInstalled;
    if (waiting && p.energy >= cost) return info(`[E] Onderdeel inbouwen (-${cost} energie)`, 'install', ia.installSeconds);
    const race = state.mode === 'race';
    if (race && !waiting && isRepaired(state, p)) {
      const flight = CONFIG.energy.flightCost;
      if (p.energy >= flight) return info(`[E] Opstijgen (-${flight} energie)`, 'launch', ia.installSeconds);
      return info(`Motor klaar, maar te weinig energie om op te stijgen (${flight} nodig) · [E] Werkbank`, 'starmap', ia.starMapSeconds);
    }
    let status: string;
    if (waiting) status = `Te weinig energie om in te bouwen (${cost} nodig)`;
    else if (isRepaired(state, p)) status = PLANETS[state.planetIndex + 1] ? 'Motor klaar voor de volgende planeet' : 'Motor klaar voor de reis naar huis';
    else status = `Motor mist nog ${needed - p.partsInstalled} onderdelen`;
    return info(`${status} · [E] ${race ? 'Werkbank' : 'Schip: werkbank en sterrenkaart'}`, 'starmap', ia.starMapSeconds);
  }

  const b = target.bunker;
  if (b.kind === 'parts') {
    return b.looted ? info('Bunker is leeg') : info('[E] Onderdelenbunker openen', 'open', ia.openPartsSeconds);
  }
  const cellFits = b.energyCell && canTakeCell(p);
  if (p.oxygen > 97 && !cellFits) {
    return info(b.energyCell ? 'Zuurstof vol, energie te vol voor de energiecel' : 'Zuurstoftank is vol');
  }
  return info('[E] Voorraadbunker openen', 'open', ia.openSupplySeconds);
}

/**
 * Hold E to perform the action. Returns true while the player is busy, so movement pauses.
 * Being hit resets progress, because damage knocks the player out of range.
 */
export function updateInteraction(state: GameState, p: Player, input: InputState, dt: number): boolean {
  const ia = p.interaction;
  const target = findTarget(state, p);
  const info = describe(state, p, target);
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
    perform(state, p, target, info.action);
  }
  return true;
}

function sameTargetAs(a: Target | null, b: Target | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'ship' || b.kind === 'ship') return a.kind === b.kind;
  return a.bunker === b.bunker;
}

/** Cells are only taken when all their energy fits, so none is wasted and the planet's budget holds. */
function canTakeCell(p: Player): boolean {
  return p.energy + CONFIG.energy.cellAmount <= CONFIG.energy.max;
}

/** Race mode: the ship takes off and this player wins. */
function launch(state: GameState, p: Player): void {
  const ship = shipOf(state, p);
  p.energy -= CONFIG.energy.flightCost;
  state.race!.result = { winner: p.id, reason: 'launch' };
  state.status = 'over';
  emit(state, { type: 'burst', x: ship.x - 24, y: ship.y - 8, color: '#ffb347', count: 30 });
}

function perform(state: GameState, p: Player, target: Target, action: Action): void {
  const needed = state.world.planet.partsNeeded;
  if (target.kind === 'ship') {
    if (action === 'starmap') {
      emitTo(state, p, { type: 'starmap' });
      return;
    }
    if (action === 'launch') {
      launch(state, p);
      return;
    }
    const ship = shipOf(state, p);
    p.partsInstalled++;
    p.energy -= CONFIG.energy.installCost;
    emit(state, { type: 'burst', x: ship.x - 13 + (p.partsInstalled - 1) * 6, y: ship.y - 9, color: '#7dff8a', count: 16 });
    const repaired = state.mode === 'race' ? isRepaired(state, p) : unlockIfRepaired(state, p);
    emitTo(state, p, { type: 'sound', name: repaired ? 'repaired' : 'install' });
    let text = `Onderdeel ingebouwd (${p.partsInstalled}/${needed})`;
    if (repaired) text = state.mode === 'race' ? 'Motor klaar. Houd E vast om op te stijgen' : 'Motor gerepareerd. Open de sterrenkaart om verder te reizen';
    emitTo(state, p, { type: 'toast', text });
    emit(state, { type: 'progress' });
    return;
  }

  const b = target.bunker;
  if (b.kind === 'parts') {
    b.looted = true;
    p.partsCarried++;
    emit(state, { type: 'burst', x: b.x, y: b.y - 10, color: '#ffb347', count: 20 });
    emitTo(state, p, { type: 'sound', name: 'part' });
    emitTo(state, p, { type: 'toast', text: `Scheepsonderdeel gevonden (${p.partsCarried}/${needed})` });
    emit(state, { type: 'progress' });
    return;
  }

  p.oxygen = 100;
  let text = 'Zuurstof bijgevuld';
  if (b.energyCell && !canTakeCell(p)) {
    text += '. Energiecel blijft liggen: je energie is te vol';
  } else if (b.energyCell) {
    b.energyCell = false;
    p.energy += CONFIG.energy.cellAmount;
    text += `, energiecel +${CONFIG.energy.cellAmount}`;
  }
  emit(state, { type: 'burst', x: b.x, y: b.y - 10, color: '#4fd8ff', count: 16 });
  emitTo(state, p, { type: 'sound', name: 'supply' });
  emitTo(state, p, { type: 'toast', text });
  emit(state, { type: 'progress' });
}
