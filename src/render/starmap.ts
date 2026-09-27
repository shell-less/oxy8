import { CONFIG } from '../config';
import { checkCraft, RECIPES, type Recipe, type RecipeId } from '../game/crafting';
import { localPlayer, type GameState } from '../game/state';
import { destinations, HOME_INDEX, type Destination } from '../game/travel';
import { PLANETS } from '../world/planets';

/**
 * The ship menu: the workbench on the left, the star map on the right. Emits choices; the caller
 * performs the crafting or the travel and reopens or hides the menu.
 */
export class StarMap {
  private root = document.getElementById('starmap') as HTMLElement;
  private list = document.getElementById('starmap-list') as HTMLElement;
  private sub = document.getElementById('starmap-sub') as HTMLElement;
  private foot = document.getElementById('starmap-foot') as HTMLElement;
  private bench = document.getElementById('workbench-list') as HTMLElement;
  private benchSub = document.getElementById('workbench-sub') as HTMLElement;
  private rows: Destination[] = [];
  private closeBtn = document.getElementById('starmap-close') as HTMLButtonElement;
  private title = document.getElementById('starmap-title') as HTMLElement;

  constructor(
    private onPick: (index: number, row: Destination) => void,
    private onClose: () => void,
    private onCraft: (id: RecipeId) => void,
  ) {
    this.closeBtn.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const row = this.rows[Number(e.code.slice(5)) - 1];
        if (row) {
          e.preventDefault();
          this.onPick(row.index, row);
        }
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(state: GameState): void {
    const me = localPlayer(state);
    const focusedRecipe = (document.activeElement as HTMLElement | null)?.dataset.recipe;
    this.benchSub.textContent = `Schroot: ${me.inventory.scrap}`;
    this.bench.replaceChildren(...RECIPES.map((r) => this.renderRecipe(state, r)));
    const race = state.mode === 'race';
    this.root.classList.toggle('race', race);
    this.title.textContent = race ? `Schip van speler ${state.viewer + 1}` : 'Schip';
    this.rows = race ? [] : destinations(state);
    this.sub.textContent = `Energie: ${Math.round(me.energy)} · een vlucht kost ${CONFIG.energy.flightCost}`;
    const touch = document.documentElement.classList.contains('touch');
    this.foot.textContent = touch ? 'Tik op een planeet om te vliegen' : 'Klik of kies met 1-9 · Esc: terug naar de planeet';
    this.list.replaceChildren(...this.rows.map((row, i) => this.renderRow(row, i + 1)));
    this.root.hidden = false;
    // After crafting, keep focus on the same recipe; otherwise start on the first flyable planet.
    const again = focusedRecipe ? this.bench.querySelector<HTMLButtonElement>(`[data-recipe="${focusedRecipe}"]`) : null;
    const first = this.list.querySelector<HTMLButtonElement>('button[aria-disabled="false"]');
    (again ?? first ?? this.list.querySelector('button'))?.focus();
  }

  private renderRecipe(state: GameState, recipe: Recipe): HTMLButtonElement {
    const check = checkCraft(localPlayer(state), recipe.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn dest';
    btn.dataset.recipe = recipe.id;
    btn.setAttribute('aria-disabled', String(!check.ok));

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = RECIPE_COLOURS[recipe.id];
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = recipe.name;
    const cost = document.createElement('span');
    cost.className = 'cost';
    cost.textContent = `${recipe.scrap} schroot`;
    const note = document.createElement('span');
    note.className = 'note';
    // Touch screens have buttons instead of the Q and R keys.
    const touch = document.documentElement.classList.contains('touch');
    const effect = touch ? recipe.effect.replace(/^[A-Z]: /, '') : recipe.effect;
    note.textContent = `${effect} · ${check.note}`;
    btn.append(dot, name, cost, note);
    btn.addEventListener('click', () => this.onCraft(recipe.id));
    return btn;
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.onClose();
  }

  /** Hide without the close callback, used when a flight starts. */
  hide(): void {
    this.root.hidden = true;
  }

  private renderRow(row: Destination, number: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn dest${row.status === 'here' ? ' here' : ''}`;
    btn.setAttribute('aria-disabled', String(!row.canFly));

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = dotColour(row);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${number}. ${row.name}`;

    const loot = document.createElement('span');
    loot.className = 'loot';
    loot.textContent = lootText(row);

    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = row.parts ? `${row.note} · motor ${row.parts.installed}/${row.parts.needed}` : row.note;

    btn.append(dot, name, loot, note);
    btn.addEventListener('click', () => this.onPick(row.index, row));
    return btn;
  }
}

const RECIPE_COLOURS: Record<RecipeId, string> = { bottle: '#4fd8ff', beacon: '#ff5060', armour: '#e8edf2' };

function lootText(row: Destination): string {
  if (row.energyCells === null) return '';
  const parts: string[] = [];
  if (row.energyCells > 0) parts.push(`${row.energyCells} ${row.energyCells === 1 ? 'energiecel' : 'energiecellen'}`);
  if (row.scrap) parts.push(`${row.scrap} schroot`);
  return parts.length ? parts.join(' · ') : 'leeg';
}

function dotColour(row: Destination): string {
  if (row.index === HOME_INDEX) return '#7dff8a';
  if (row.status === 'unknown') return '#2a2638';
  const [r, g, b] = PLANETS[row.index].theme.ground[4];
  return `rgb(${r},${g},${b})`;
}
