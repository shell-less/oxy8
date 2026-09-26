/** Snapshot of the player's intent for one frame. Systems read this, never the keyboard directly. */
export interface InputState {
  moveX: number;
  moveY: number;
  /** E is held down. */
  interact: boolean;
  /** F was pressed this frame. */
  toggleLamp: boolean;
}

export const NO_INPUT: InputState = { moveX: 0, moveY: 0, interact: false, toggleLamp: false };

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF',
]);

export class Keyboard {
  private held = new Set<string>();
  private lampPressed = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!GAME_KEYS.has(e.code)) return;
      e.preventDefault();
      if (e.code === 'KeyF' && !e.repeat) this.lampPressed = true;
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
      toggleLamp: this.lampPressed,
    };
    this.lampPressed = false;
    return state;
  }
}
