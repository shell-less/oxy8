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
