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
}

export const NO_INPUT: InputState = { moveX: 0, moveY: 0, interact: false, toggleLamp: false, useBottle: false, placeBeacon: false };

/** Combines two input sources (keyboard and touch): movement adds up, buttons count when either is pressed. */
export function mergeInput(a: InputState, b: InputState): InputState {
  return {
    moveX: Math.max(-1, Math.min(1, a.moveX + b.moveX)),
    moveY: Math.max(-1, Math.min(1, a.moveY + b.moveY)),
    interact: a.interact || b.interact,
    toggleLamp: a.toggleLamp || b.toggleLamp,
    useBottle: a.useBottle || b.useBottle,
    placeBeacon: a.placeBeacon || b.placeBeacon,
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

/** Keys that fire once per press, mapped to the InputState flag they set. */
const ONE_SHOT = { KeyF: 'toggleLamp', KeyQ: 'useBottle', KeyR: 'placeBeacon' } as const;
type OneShot = (typeof ONE_SHOT)[keyof typeof ONE_SHOT];

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyQ', 'KeyR',
]);

export class Keyboard {
  private held = new Set<string>();
  private pressed = new Set<OneShot>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!GAME_KEYS.has(e.code)) return;
      e.preventDefault();
      const shot = ONE_SHOT[e.code as keyof typeof ONE_SHOT];
      if (shot && !e.repeat) this.pressed.add(shot);
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  /** Read and reset one-shot presses. Call once per frame. */
  poll(): InputState {
    const h = (code: string) => this.held.has(code);
    const state: InputState = {
      moveX: (h('ArrowRight') || h('KeyD') ? 1 : 0) - (h('ArrowLeft') || h('KeyA') ? 1 : 0),
      moveY: (h('ArrowDown') || h('KeyS') ? 1 : 0) - (h('ArrowUp') || h('KeyW') ? 1 : 0),
      interact: h('KeyE'),
      toggleLamp: this.pressed.has('toggleLamp'),
      useBottle: this.pressed.has('useBottle'),
      placeBeacon: this.pressed.has('placeBeacon'),
    };
    this.pressed.clear();
    return state;
  }
}
