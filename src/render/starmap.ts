import { CONFIG } from '../config';
import type { GameState } from '../game/state';
import { destinations, HOME_INDEX, type Destination } from '../game/travel';
import { PLANETS } from '../world/planets';

/** DOM panel listing where the ship can fly. Emits the chosen index; the caller performs the travel. */
export class StarMap {
  private root = document.getElementById('starmap') as HTMLElement;
  private list = document.getElementById('starmap-list') as HTMLElement;
  private sub = document.getElementById('starmap-sub') as HTMLElement;
  private foot = document.getElementById('starmap-foot') as HTMLElement;
  private rows: Destination[] = [];

  constructor(private onPick: (index: number, row: Destination) => void, private onClose: () => void) {
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
    this.rows = destinations(state);
    this.sub.textContent = `Energie: ${Math.round(state.energy)} · een vlucht kost ${CONFIG.energy.flightCost}`;
    this.foot.textContent = 'Klik of kies met 1-9 · Esc: terug naar de planeet';
    this.list.replaceChildren(...this.rows.map((row, i) => this.renderRow(row, i + 1)));
    this.root.hidden = false;
    const first = this.list.querySelector<HTMLButtonElement>('button[aria-disabled="false"]');
    (first ?? this.list.querySelector('button'))?.focus();
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

function lootText(row: Destination): string {
  if (row.energyCells === null) return '';
  if (row.energyCells === 0) return 'leeg';
  return `${row.energyCells} ${row.energyCells === 1 ? 'energiecel' : 'energiecellen'}`;
}

function dotColour(row: Destination): string {
  if (row.index === HOME_INDEX) return '#7dff8a';
  if (row.status === 'unknown') return '#2a2638';
  const [r, g, b] = PLANETS[row.index].theme.ground[4];
  return `rgb(${r},${g},${b})`;
}
