import { CONFIG } from '../config';
import { emit, type GameState } from './state';

export type RecipeId = 'bottle' | 'armour' | 'beacon';

export interface Recipe {
  id: RecipeId;
  /** Dutch name and one-line effect, shown on the workbench. */
  name: string;
  effect: string;
  scrap: number;
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
];

export interface CraftCheck {
  ok: boolean;
  /** Dutch status for the workbench: what you have, or why not. */
  note: string;
}

export function checkCraft(state: GameState, id: RecipeId): CraftCheck {
  const recipe = RECIPES.find((r) => r.id === id)!;
  const inv = state.inventory;
  const c = CONFIG.crafting;
  if (id === 'armour' && inv.armour) return { ok: false, note: 'Je pak is al versterkt' };
  if (id === 'bottle' && inv.bottles >= c.bottle.carryMax) return { ok: false, note: `Je draagt er al ${inv.bottles}` };
  if (id === 'beacon' && inv.beacons >= c.beacon.carryMax) return { ok: false, note: `Je draagt er al ${inv.beacons}` };
  if (inv.scrap < recipe.scrap) return { ok: false, note: `Nog ${recipe.scrap - inv.scrap} schroot nodig` };
  const have = id === 'bottle' ? inv.bottles : id === 'beacon' ? inv.beacons : 0;
  return { ok: true, note: id === 'armour' ? 'Eenmalige upgrade' : `Je draagt er ${have}` };
}

export function craft(state: GameState, id: RecipeId): CraftCheck {
  const check = checkCraft(state, id);
  if (!check.ok) return check;
  const recipe = RECIPES.find((r) => r.id === id)!;
  const inv = state.inventory;
  inv.scrap -= recipe.scrap;
  if (id === 'bottle') inv.bottles++;
  else if (id === 'beacon') inv.beacons++;
  else inv.armour = true;
  emit(state, { type: 'toast', text: `${recipe.name} gemaakt` });
  emit(state, { type: 'sound', name: 'craft' });
  emit(state, { type: 'progress' });
  return check;
}

/** The cheapest recipe the player can make right now, if any. Used by the tutorial. */
export function anyCraftable(state: GameState): boolean {
  return RECIPES.some((r) => checkCraft(state, r.id).ok);
}
