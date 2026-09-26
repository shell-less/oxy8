/** Snapshot of the player's intent for one frame. Systems read this, never the keyboard directly. */
export interface InputState {
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
