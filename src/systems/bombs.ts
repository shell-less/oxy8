import { CONFIG } from '../config';
import type { InputState } from '../core/input';
import { emit, emitTo, type Bomb, type GameState, type Player } from '../game/state';

/**
 * Race mode bombs: a trap for bunkers, not a way to lock someone in. A bomb can only lie next to
 * a bunker and never near a ship. It arms after a few seconds; whoever comes close to an armed
 * bomb loses, the owner included. Creepers never set one off, or their patrols around bunkers
 * would clear every bomb. Defusing happens in the interaction system.
 */

const B = CONFIG.race.bomb;

/** Why this player cannot put a bomb down here, or null when they can. */
export function bombPlacementProblem(state: GameState, p: Player): string | null {
  if (p.bombs <= 0) return `Je hebt geen bom. Maak er een op de werkbank (${B.scrap} schroot)`;
  const nearBunker = state.world.bunkers.some((b) => Math.hypot(b.x - p.x, b.y - p.y) <= B.placeNearBunker);
  if (!nearBunker) return 'Een bom kan alleen vlak bij een bunker liggen';
  if (state.world.ships.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < B.shipKeepOut)) return 'Niet zo dicht bij een schip';
  return null;
}

/** The bomb key: put a carried bomb down at your feet. */
export function placeBomb(state: GameState, p: Player, input: InputState): void {
  const race = state.race;
  if (!input.placeBomb || !race) return;
  const problem = bombPlacementProblem(state, p);
  if (problem) {
    emitTo(state, p, { type: 'toast', text: problem });
    emitTo(state, p, { type: 'sound', name: 'deny' });
    return;
  }
  p.bombs--;
  race.bombs.push({ id: race.nextBombId++, owner: p.id, x: p.x, y: p.y, armIn: B.armSeconds });
  emitTo(state, p, { type: 'toast', text: `Bom gelegd. Over ${B.armSeconds} seconden staat hij scherp, ook voor jou` });
  emitTo(state, p, { type: 'sound', name: 'bomb-place' });
}

/** Arms bombs and sets off armed ones that a player comes too close to. */
export function updateBombs(state: GameState, dt: number): void {
  const race = state.race;
  if (!race) return;
  const gone: Bomb[] = [];
  for (const bomb of race.bombs) {
    if (bomb.armIn > 0) {
      bomb.armIn -= dt;
      if (bomb.armIn <= 0) emitTo(state, state.players[bomb.owner], { type: 'sound', name: 'bomb-armed' });
      continue;
    }
    const victim = state.players.find((p) => Math.hypot(p.x - bomb.x, p.y - bomb.y) < B.triggerRadius);
    if (victim) {
      explode(state, bomb, victim);
      gone.push(bomb);
    }
  }
  if (gone.length > 0) race.bombs = race.bombs.filter((b) => !gone.includes(b));
}

function explode(state: GameState, bomb: Bomb, victim: Player): void {
  victim.oxygen = 0;
  state.race!.blownUp.push(victim.id);
  emit(state, { type: 'burst', x: bomb.x, y: bomb.y - 4, color: '#ffb347', count: 40 });
  emit(state, { type: 'burst', x: bomb.x, y: bomb.y - 4, color: '#ff4a2a', count: 24 });
  emit(state, { type: 'crater', x: bomb.x, y: bomb.y });
  emit(state, { type: 'sound', name: 'explosion' });
  emit(state, { type: 'shake', amount: 0.6 });
}

/** A bomb whose defuse ring this player stands in: close enough to reach it, just too far to set it off. */
export function bombInReach(state: GameState, p: Player): Bomb | null {
  let best: Bomb | null = null;
  let bestDist = Infinity;
  for (const bomb of state.race?.bombs ?? []) {
    const d = Math.hypot(p.x - bomb.x, p.y - bomb.y);
    if (d >= B.defuseMin && d <= B.defuseMax && d < bestDist) {
      best = bomb;
      bestDist = d;
    }
  }
  return best;
}

/** Takes a defused bomb into the player's pack. */
export function defuse(state: GameState, p: Player, bomb: Bomb): void {
  const race = state.race!;
  race.bombs = race.bombs.filter((b) => b !== bomb);
  p.bombs++;
  emitTo(state, p, { type: 'toast', text: 'Bom ontmanteld. Je draagt hem nu zelf' });
  emitTo(state, p, { type: 'sound', name: 'bomb-defused' });
}
