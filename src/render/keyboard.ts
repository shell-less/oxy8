import type { InputState } from '../core/input';

/**
 * The keyboard as an input source: DOM-bound, so it lives with the rest of the browser code.
 * The game logic and the race server only know InputState.
 */

/** Keys for one player. Movement keys are held; the others fire once per press, except `interact`. */
interface Binding {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  interact: string;
  toggleLamp: string;
  useBottle: string;
  placeBeacon: string;
  /** Race only; solo has no bomb key. */
  placeBomb?: string;
}

/** One player per keyboard (solo, or an online race): WASD or the arrows. B places a bomb in a race. */
const SOLO: Binding = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  interact: 'KeyE', toggleLamp: 'KeyF', useBottle: 'KeyQ', placeBeacon: 'KeyR', placeBomb: 'KeyB',
};

/** Two players on one keyboard: player 1 on the left hand, player 2 on the arrows and the keys around them. */
export const SPLIT: readonly [Binding, Binding] = [
  {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    interact: 'KeyE', toggleLamp: 'KeyF', useBottle: 'KeyQ', placeBeacon: 'KeyR', placeBomb: 'KeyB',
  },
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    interact: 'Enter', toggleLamp: 'ShiftRight', useBottle: 'Slash', placeBeacon: 'Period', placeBomb: 'Comma',
  },
];

const ONE_SHOT = ['toggleLamp', 'useBottle', 'placeBeacon', 'placeBomb'] as const;

const GAME_KEYS = new Set([SOLO, ...SPLIT].flatMap((b) => [
  ...b.up, ...b.down, ...b.left, ...b.right, b.interact, b.toggleLamp, b.useBottle, b.placeBeacon, ...(b.placeBomb ? [b.placeBomb] : []),
]));

export class Keyboard {
  private held = new Set<string>();
  /** Codes pressed since the last poll, so a quick tap between two frames still counts. */
  private pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Typing in a text field (a room code) is not playing.
      if (isTextField(e.target)) return;
      if (!GAME_KEYS.has(e.code)) return;
      e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  /** Solo input. Reads and resets one-shot presses; call once per frame. */
  poll(): InputState {
    const input = this.read(SOLO);
    this.pressed.clear();
    return input;
  }

  /** Two players on one keyboard, one InputState each. Reads and resets one-shot presses. */
  pollSplit(): [InputState, InputState] {
    const inputs: [InputState, InputState] = [this.read(SPLIT[0]), this.read(SPLIT[1])];
    this.pressed.clear();
    return inputs;
  }

  private read(b: Binding): InputState {
    const held = (codes: string[]) => codes.some((c) => this.held.has(c));
    const input: InputState = {
      moveX: (held(b.right) ? 1 : 0) - (held(b.left) ? 1 : 0),
      moveY: (held(b.down) ? 1 : 0) - (held(b.up) ? 1 : 0),
      interact: this.held.has(b.interact),
      toggleLamp: false,
      useBottle: false,
      placeBeacon: false,
      placeBomb: false,
    };
    for (const key of ONE_SHOT) {
      const code = b[key];
      input[key] = code !== undefined && this.pressed.has(code);
    }
    return input;
  }
}

function isTextField(target: EventTarget | null): boolean {
  return typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement;
}
