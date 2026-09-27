/** Snapshot of the player's intent for one frame. Systems read this, never the keyboard directly. */
export interface InputState {
  /** Movement direction. Keys give -1, 0 or 1; the touch stick gives any length up to 1 (slower walking). */
  moveX: number;
  moveY: number;
  /** E is held down. */
  interact: boolean;
  /** F was pressed this frame. */
  toggleLamp: boolean;
  /** Q was pressed this frame: use an oxygen bottle. */
  useBottle: boolean;
  /** R was pressed this frame: place a decoy beacon. */
  placeBeacon: boolean;
  /** Race mode: the bomb key was pressed this frame. */
  placeBomb: boolean;
}

export const NO_INPUT: InputState = {
  moveX: 0, moveY: 0, interact: false, toggleLamp: false, useBottle: false, placeBeacon: false, placeBomb: false,
};

/** Combines two input sources (keyboard and touch): movement adds up, buttons count when either is pressed. */
export function mergeInput(a: InputState, b: InputState): InputState {
  return {
    moveX: Math.max(-1, Math.min(1, a.moveX + b.moveX)),
    moveY: Math.max(-1, Math.min(1, a.moveY + b.moveY)),
    interact: a.interact || b.interact,
    toggleLamp: a.toggleLamp || b.toggleLamp,
    useBottle: a.useBottle || b.useBottle,
    placeBeacon: a.placeBeacon || b.placeBeacon,
    placeBomb: a.placeBomb || b.placeBomb,
  };
}

/**
 * Turns a thumb offset from where it touched down into a movement vector.
 * Inside the dead zone nothing happens; just past it the player walks slowly (minSpeed),
 * at the rim and beyond at full speed. Returns a vector of length 0 or minSpeed..1.
 */
export function stickVector(dx: number, dy: number, radius: number, deadZone: number, minSpeed: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  const t = d / radius;
  if (t <= deadZone || d === 0) return { x: 0, y: 0 };
  const strength = minSpeed + (1 - minSpeed) * Math.min(1, (t - deadZone) / (1 - deadZone));
  return { x: (dx / d) * strength, y: (dy / d) * strength };
}

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

/** Solo: WASD or the arrows. */
const SOLO: Binding = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  interact: 'KeyE', toggleLamp: 'KeyF', useBottle: 'KeyQ', placeBeacon: 'KeyR',
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
