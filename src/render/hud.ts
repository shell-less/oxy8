import { CONFIG } from '../config';
import { darknessAt, formatClock, hourOf } from '../core/clock';
import { localPlayer, type GameState } from '../game/state';
import { describe } from '../systems/interaction';
import { lampIsDraining } from '../systems/survival';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

/** The HTML overlay: bars, clock, part slots, hazard status, prompts and toasts. Only touches the DOM when text changes. */
export class Hud {
  private el = {
    o2Bar: $('o2-bar'), o2Val: $('o2-val'), enBar: $('en-bar'), enVal: $('en-val'),
    lamp: $('lamp'), inventory: $('inventory'), planet: $('planet-name'), clock: $('clock'), slots: $('slots'),
    hazard: $('hazard'), toast: $('toast'), hint: $('hint'), keys: $('keys'),
  };
  private last = new Map<string, string>();
  private toastTimer = 0;
  /** On touch screens the HUD leaves out key names: the buttons are on screen. */
  touch = false;

  /** The key legend in the corner; H hides it, remembered per browser. */
  get keysVisible(): boolean {
    return !this.el.keys.hidden;
  }

  setKeysVisible(visible: boolean): void {
    this.el.keys.hidden = !visible;
    try {
      localStorage.setItem('oxy8.keys', visible ? '1' : '0');
    } catch {
      // Not important.
    }
  }

  restoreKeysVisible(): void {
    try {
      this.el.keys.hidden = localStorage.getItem('oxy8.keys') === '0';
    } catch {
      // Keep the default: visible.
    }
  }

  showToast(text: string): void {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = 2.4;
  }

  update(state: GameState, dt: number, t: number): void {
    const me = localPlayer(state);
    const { el } = this;
    const darkness = darknessAt(hourOf(state.time));
    const lowO2Blink = me.oxygen < 25 && Math.sin(t * 8) > 0;

    el.o2Bar.style.width = `${me.oxygen}%`;
    el.o2Bar.style.background = lowO2Blink ? 'var(--danger)' : 'var(--o2)';
    this.text(el.o2Val, String(Math.round(me.oxygen)));
    el.enBar.style.width = `${me.energy}%`;
    this.text(el.enVal, String(Math.round(me.energy)));

    const lampText = `${me.lamp ? 'Lamp aan' : 'Lamp uit'}${me.lamp && lampIsDraining(darkness) ? ' · verbruikt' : ''}${this.touch ? '' : ' · F'}`;
    if (this.text(el.lamp, lampText)) el.lamp.style.color = me.lamp ? '#ffe9a0' : '';

    const inv = me.inventory;
    const items: string[] = [];
    // Key hints on a keyboard, except with two players on one keyboard: they use different keys.
    const localRace = state.race !== null && !state.race.online;
    const key = (k: string) => (this.touch || localRace ? '' : ` (${k})`);
    if (inv.scrap > 0) items.push(`Schroot ${inv.scrap}`);
    if (inv.bottles > 0) items.push(`Fles ${inv.bottles}${key('Q')}`);
    if (inv.beacons > 0) items.push(`Baken ${inv.beacons}${key('R')}`);
    if (me.bombs > 0) items.push(`Bom ${me.bombs}${key('B')}`);
    if (inv.armour) items.push('Pak versterkt');
    this.text(el.inventory, items.join(' · '));

    for (const key of el.keys.querySelectorAll<HTMLElement>('[data-item]')) {
      const item = key.dataset.item;
      const have = item === 'bottle' ? inv.bottles > 0 : item === 'bomb' ? me.bombs > 0 : inv.beacons > 0;
      key.classList.toggle('unavailable', !have);
    }

    const planet = state.world.planet;
    if (state.race) {
      // In a race the header names whose screen this is, and the clock counts down to the time limit.
      const left = Math.max(0, CONFIG.race.timeLimit - state.race.elapsed);
      const mm = Math.floor(left / 60);
      const ss = String(Math.floor(left % 60)).padStart(2, '0');
      this.text(el.planet, `Speler ${state.viewer + 1} · ${planet.name}`);
      this.text(el.clock, `${formatClock(state.time)} · nog ${mm}:${ss}`);
    } else {
      this.text(el.planet, `${planet.name} · ${planet.theme.colourName}`);
      this.text(el.clock, formatClock(state.time));
    }

    const slotKey = `${planet.partsNeeded}/${me.partsCarried}/${me.partsInstalled}`;
    if (this.last.get('slots') !== slotKey) {
      this.last.set('slots', slotKey);
      el.slots.innerHTML = '';
      for (let i = 0; i < planet.partsNeeded; i++) {
        const s = document.createElement('span');
        s.className = 'slot';
        s.style.background = i < me.partsInstalled ? '#7dff8a' : i < me.partsCarried ? '#ff9a3c' : '#2a1a20';
        el.slots.appendChild(s);
      }
    }

    const [hazardText, active] = hazardStatus(state);
    const hazardKey = `${hazardText}|${active}`;
    if (this.last.get('hazard') !== hazardKey) {
      this.last.set('hazard', hazardKey);
      el.hazard.textContent = hazardText;
      el.hazard.style.color = active ? 'var(--warn)' : '';
    }

    const info = state.status === 'playing' ? describe(state, me, me.interaction.target) : null;
    const hint = info ? (this.touch ? info.text.replace('[E] ', '') : info.text) : '';
    if (this.text(el.hint, hint)) el.hint.style.opacity = info ? '1' : '0';

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) el.toast.style.opacity = '0';
    }
  }

  /** Sets text only when it changed. Returns true on change. */
  private text(node: HTMLElement, value: string): boolean {
    if (node.textContent === value) return false;
    node.textContent = value;
    return true;
  }
}

function hazardStatus(state: GameState): [string, boolean] {
  const h = state.hazards;
  switch (state.world.planet.theme.hazard) {
    case 'storm':
      if (h.storm > 0) return ['Zandstorm', true];
      return [`Storm over ~${Math.max(0, Math.ceil(h.stormNext))}s`, h.stormWarned];
    case 'cold':
      return h.coldMultiplier > 1.1 ? [`Kou: O2 x${h.coldMultiplier.toFixed(1)}`, true] : ['Kou: overdag veilig', false];
    case 'meteor':
      return ['Meteorenregen', h.meteors.length > 0];
    case 'toxic':
      return localPlayer(state).inPool ? ['Gifgas: filters overbelast', true] : ['Vermijd de gifpoelen', false];
  }
}
