import { CONFIG } from '../config';
import { NO_INPUT, stickVector, type InputState } from '../core/input';
import { localPlayer, type GameState } from '../game/state';
import { describe, type Action } from '../systems/interaction';

const ACTION_LABELS: Record<Action, string> = {
  open: 'Openen',
  install: 'Inbouwen',
  starmap: 'Schip',
  none: 'Actie',
};

type OneShot = 'toggleLamp' | 'useBottle' | 'placeBeacon';

/**
 * On-screen controls for touch screens: a floating stick on the left half (it appears where the
 * thumb lands), a big action button to hold on the right, and small buttons for the lamp, the
 * bottle and the beacon. Produces an InputState just like the keyboard does.
 *
 * The page switches between touch and keyboard layout by what the player last used; the
 * `touch` class on <html> drives the CSS.
 */
export class TouchControls {
  private root: HTMLElement;
  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private action: HTMLButtonElement;
  private actionLabel: HTMLElement;
  private lamp: HTMLButtonElement;
  private bottle: HTMLButtonElement;
  private beacon: HTMLButtonElement;
  readonly pause: HTMLButtonElement;

  private stickId: number | null = null;
  private originX = 0;
  private originY = 0;
  private move = { x: 0, y: 0 };
  private actionId: number | null = null;
  private pressed = new Set<OneShot>();
  private active = false;
  private last = new Map<string, string>();

  constructor(game: HTMLElement, onPause: () => void) {
    this.root = el('div', 'touch-layer');
    this.zone = el('div', 'touch-zone');
    this.base = el('div', 'stick-base');
    this.knob = el('div', 'stick-knob');
    this.base.append(this.knob);
    this.zone.append(this.base);

    this.action = button('touch-action', '');
    this.actionLabel = el('span', 'label');
    this.action.append(this.actionLabel);
    this.lamp = button('touch-small touch-lamp', 'Lamp');
    this.bottle = button('touch-small touch-bottle', 'Fles');
    this.beacon = button('touch-small touch-beacon', 'Baken');
    this.pause = button('touch-pause', '');
    this.pause.setAttribute('aria-label', 'Pauze');
    this.root.append(this.zone, this.lamp, this.bottle, this.beacon, this.action, this.pause);
    game.append(this.root);
    this.root.hidden = true;

    this.zone.addEventListener('pointerdown', (e) => this.stickDown(e));
    this.zone.addEventListener('pointermove', (e) => this.stickMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.zone.addEventListener(type, (e) => { if (e.pointerId === this.stickId) this.stickUp(); });
      this.action.addEventListener(type, (e) => {
        if (e.pointerId !== this.actionId) return;
        this.actionId = null;
        this.action.classList.remove('held');
      });
    }
    this.action.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.action.setPointerCapture(e.pointerId);
      this.actionId = e.pointerId;
      this.action.classList.add('held');
    });
    this.tap(this.lamp, () => this.pressed.add('toggleLamp'));
    this.tap(this.bottle, () => this.pressed.add('useBottle'));
    this.tap(this.beacon, () => this.pressed.add('placeBeacon'));
    this.tap(this.pause, onPause);
    // Long presses must not open a context menu on the controls.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Show the controls only while the player is walking around. Hiding releases everything. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.root.hidden = !active;
    if (!active) {
      this.stickUp();
      this.actionId = null;
      this.action.classList.remove('held');
      this.pressed.clear();
    }
  }

  /** Read and reset one-shot taps. Call once per frame. */
  poll(): InputState {
    if (!this.active) return NO_INPUT;
    const input: InputState = {
      moveX: this.move.x,
      moveY: this.move.y,
      interact: this.actionId !== null,
      toggleLamp: this.pressed.has('toggleLamp'),
      useBottle: this.pressed.has('useBottle'),
      placeBeacon: this.pressed.has('placeBeacon'),
    };
    this.pressed.clear();
    return input;
  }

  /** Update labels, counts and the progress ring from the game state. */
  update(state: GameState): void {
    const me = localPlayer(state);
    if (!this.active) return;
    const info = state.status === 'playing' ? describe(state, me, me.interaction.target) : null;
    const act = info?.available ? info.action : 'none';
    this.set('action', act, () => {
      this.actionLabel.textContent = ACTION_LABELS[act];
      this.action.classList.toggle('available', act !== 'none');
    });
    this.action.style.setProperty('--progress', String(me.interaction.progress));

    this.set('lamp', String(me.lamp), () => this.lamp.classList.toggle('on', me.lamp));
    const inv = me.inventory;
    this.set('bottle', String(inv.bottles), () => {
      this.bottle.hidden = inv.bottles === 0;
      this.bottle.dataset.count = String(inv.bottles);
    });
    this.set('beacon', String(inv.beacons), () => {
      this.beacon.hidden = inv.beacons === 0;
      this.beacon.dataset.count = String(inv.beacons);
    });
  }

  private stickDown(e: PointerEvent): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.zone.setPointerCapture(e.pointerId);
    this.stickId = e.pointerId;
    const r = this.zone.getBoundingClientRect();
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.base.style.left = `${e.clientX - r.left}px`;
    this.base.style.top = `${e.clientY - r.top}px`;
    this.base.style.setProperty('--radius', `${this.radius()}px`);
    this.base.classList.add('visible');
    this.placeKnob(0, 0);
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    const dx = e.clientX - this.originX;
    const dy = e.clientY - this.originY;
    const radius = this.radius();
    const T = CONFIG.touch;
    this.move = stickVector(dx, dy, radius, T.deadZone, T.minSpeed);
    const d = Math.hypot(dx, dy) || 1;
    const shown = Math.min(d, radius);
    this.placeKnob((dx / d) * shown, (dy / d) * shown);
  }

  private stickUp(): void {
    this.stickId = null;
    this.move = { x: 0, y: 0 };
    this.base.classList.remove('visible');
  }

  private placeKnob(x: number, y: number): void {
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  private radius(): number {
    return Math.max(28, this.root.getBoundingClientRect().height * CONFIG.touch.stickRadius);
  }

  /** Fire on touch-down, not on click: a click waits for the finger to lift and feels slow in a game. */
  private tap(btn: HTMLButtonElement, action: () => void): void {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      action();
      btn.classList.add('flash');
      setTimeout(() => btn.classList.remove('flash'), 120);
    });
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    apply();
  }
}

/**
 * Keeps track of whether the player uses touch or keyboard and mouse, and sets the `touch` class
 * on <html>. Starts from what the device says it has; the last input used wins after that.
 */
export class InputMode {
  touch: boolean;
  private listeners: ((touch: boolean) => void)[] = [];

  constructor() {
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.apply();
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.set(true);
      else if (e.pointerType === 'mouse') this.set(false);
    }, { capture: true });
    window.addEventListener('keydown', () => this.set(false), { capture: true });
  }

  onChange(fn: (touch: boolean) => void): void {
    this.listeners.push(fn);
  }

  private set(touch: boolean): void {
    if (touch === this.touch) return;
    this.touch = touch;
    this.apply();
    for (const fn of this.listeners) fn(touch);
  }

  private apply(): void {
    document.documentElement.classList.toggle('touch', this.touch);
  }
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(className: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  return b;
}
