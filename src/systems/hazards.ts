import { CONFIG } from '../config';
import { emit, type GameState } from '../game/state';
import { isInPool } from '../world/generate';
import { damagePlayer } from './survival';

/** How the active hazard changes the rules this frame. */
export interface HazardModifiers {
  speedMultiplier: number;
  aggroMultiplier: number;
  oxygenMultiplier: number;
}

const NONE: HazardModifiers = { speedMultiplier: 1, aggroMultiplier: 1, oxygenMultiplier: 1 };

/** 0..1 storm strength, with a 1.5 second fade in and out. */
export function stormIntensity(stormLeft: number): number {
  if (stormLeft <= 0) return 0;
  const { duration } = CONFIG.hazards.storm;
  return Math.max(0, Math.min(1, stormLeft / 1.5, (duration - stormLeft) / 1.5));
}

export function updateHazards(state: GameState, dt: number, darkness: number): HazardModifiers {
  switch (state.world.planet.theme.hazard) {
    case 'storm': return updateStorm(state, dt);
    case 'cold': return updateCold(state, darkness);
    case 'meteor': return updateMeteors(state, dt);
    case 'toxic': return updateToxic(state);
  }
}

function updateStorm(state: GameState, dt: number): HazardModifiers {
  const h = state.hazards;
  const cfg = CONFIG.hazards.storm;
  if (h.storm > 0) {
    h.storm -= dt;
    if (h.storm <= 0) {
      h.storm = 0;
      h.stormNext = state.rng.range(cfg.pauseMin, cfg.pauseMax);
      emit(state, { type: 'toast', text: 'De storm is gaan liggen' });
    }
  } else {
    h.stormNext -= dt;
    if (h.stormNext <= cfg.warnBefore && !h.stormWarned) {
      h.stormWarned = true;
      emit(state, { type: 'toast', text: 'Zandstorm op komst' });
      emit(state, { type: 'sound', name: 'storm-warning' });
    }
    if (h.stormNext <= 0) {
      h.storm = cfg.duration;
      h.stormWarned = false;
    }
  }
  const i = stormIntensity(h.storm);
  return {
    ...NONE,
    speedMultiplier: 1 - cfg.speedPenalty * i,
    aggroMultiplier: 1 - cfg.aggroPenalty * i,
  };
}

function updateCold(state: GameState, darkness: number): HazardModifiers {
  const night = darkness / CONFIG.day.maxDarkness;
  state.hazards.coldMultiplier = 1 + (CONFIG.hazards.cold.maxDrainMultiplier - 1) * night;
  return { ...NONE, oxygenMultiplier: state.hazards.coldMultiplier };
}

function updateMeteors(state: GameState, dt: number): HazardModifiers {
  const h = state.hazards;
  const cfg = CONFIG.hazards.meteor;
  h.meteorTimer -= dt;
  if (h.meteorTimer <= 0) {
    h.meteorTimer = state.rng.range(cfg.intervalMin, cfg.intervalMax);
    // Aim at the players in turn, so a second player does not double the pressure on either.
    const p = state.players[h.meteorCount++ % state.players.length];
    const a = state.rng.next() * Math.PI * 2;
    const r = state.rng.next() * cfg.targetRadius;
    h.meteors.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, timeLeft: cfg.warningSeconds });
  }
  for (const m of h.meteors) {
    m.timeLeft -= dt;
    if (m.timeLeft > 0) continue;
    emit(state, { type: 'crater', x: m.x, y: m.y });
    emit(state, { type: 'burst', x: m.x, y: m.y, color: '#ffb347', count: 22 });
    emit(state, { type: 'burst', x: m.x, y: m.y, color: '#ff5a2a', count: 10 });
    for (const p of state.players) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < 80) emit(state, { type: 'shake', amount: 0.12 + 0.2 * (1 - d / 80) });
      if (d < cfg.hitRadius && p.invulnerable <= 0) {
        damagePlayer(state, p, cfg.damage, 'Meteorietinslag');
      }
    }
  }
  h.meteors = h.meteors.filter((m) => m.timeLeft > 0);
  return NONE;
}

/** Marks who stands in a pool; the extra drain is per player, so it is applied in the oxygen step. */
function updateToxic(state: GameState): HazardModifiers {
  for (const p of state.players) p.inPool = isInPool(state.world.pools, p.x, p.y);
  return NONE;
}
