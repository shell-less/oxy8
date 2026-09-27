import { CONFIG } from '../config';
import { emit, emitTo, localPlayer, type GameMode, type GameState, type Player } from './state';

export type RecipeId = 'bottle' | 'armour' | 'beacon' | 'bomb';

export interface Recipe {
  id: RecipeId;
  /** Dutch name and one-line effect, shown on the workbench. */
  name: string;
  effect: string;
  scrap: number;
  /** Game modes whose workbench offers it. Defaults to both. */
  modes?: readonly GameMode[];
}

/** Recipes on the ship's workbench. Costs live in CONFIG.crafting. */
export const RECIPES: readonly Recipe[] = [
  {
    id: 'bottle',
    name: 'Zuurstoffles',
    effect: `Q: +${CONFIG.crafting.bottle.oxygen}% zuurstof, waar je ook bent`,
    scrap: CONFIG.crafting.bottle.scrap,
  },
  {
    id: 'beacon',
    name: 'Lokbaken',
    effect: `R: kruipers gaan ${CONFIG.crafting.beacon.lifetime} seconden op het baken af`,
    scrap: CONFIG.crafting.beacon.scrap,
  },
  {
    id: 'armour',
    name: 'Pakversterking',
    effect: `Treffers kosten ${Math.round((1 - CONFIG.crafting.armour.damageFactor) * 100)}% minder zuurstof`,
    scrap: CONFIG.crafting.armour.scrap,
  },
  {
    id: 'bomb',
    name: 'Bom',
    effect: `Leg hem bij een bunker. Wie te dichtbij komt, verliest de race`,
    scrap: CONFIG.race.bomb.scrap,
    modes: ['race'],
  },
];

/** The recipes on the workbench in this game mode. */
export function recipesFor(mode: GameMode): Recipe[] {
  return RECIPES.filter((r) => (r.modes ?? ['solo', 'race']).includes(mode));
}

export interface CraftCheck {
  ok: boolean;
  /** Dutch status for the workbench: what you have, or why not. */
  note: string;
}

export function checkCraft(player: Player, id: RecipeId): CraftCheck {
  const recipe = RECIPES.find((r) => r.id === id)!;
  const inv = player.inventory;
  const c = CONFIG.crafting;
  if (id === 'armour' && inv.armour) return { ok: false, note: 'Je pak is al versterkt' };
  if (id === 'bottle' && inv.bottles >= c.bottle.carryMax) return { ok: false, note: `Je draagt er al ${inv.bottles}` };
  if (id === 'beacon' && inv.beacons >= c.beacon.carryMax) return { ok: false, note: `Je draagt er al ${inv.beacons}` };
  if (id === 'bomb' && player.bombs >= CONFIG.race.bomb.carryMax) return { ok: false, note: 'Je draagt er al een' };
  if (inv.scrap < recipe.scrap) return { ok: false, note: `Nog ${recipe.scrap - inv.scrap} schroot nodig` };
  const have = id === 'bottle' ? inv.bottles : id === 'beacon' ? inv.beacons : id === 'bomb' ? player.bombs : 0;
  return { ok: true, note: id === 'armour' ? 'Eenmalige upgrade' : `Je draagt er ${have}` };
}

export function craft(state: GameState, id: RecipeId, player: Player = localPlayer(state)): CraftCheck {
  if (!recipesFor(state.mode).some((r) => r.id === id)) return { ok: false, note: 'Niet in deze spelvorm' };
  const check = checkCraft(player, id);
  if (!check.ok) return check;
  const recipe = RECIPES.find((r) => r.id === id)!;
  const inv = player.inventory;
  inv.scrap -= recipe.scrap;
  if (id === 'bottle') inv.bottles++;
  else if (id === 'beacon') inv.beacons++;
  else if (id === 'bomb') player.bombs++;
  else inv.armour = true;
  emitTo(state, player, { type: 'toast', text: `${recipe.name} gemaakt` });
  emitTo(state, player, { type: 'sound', name: 'craft' });
  emit(state, { type: 'progress' });
  return check;
}

/** True when the player can make any recipe of this mode right now. Used by the tutorial. */
export function anyCraftable(player: Player, mode: GameMode = 'solo'): boolean {
  return recipesFor(mode).some((r) => checkCraft(player, r.id).ok);
}
