import { CONFIG } from '../config';
import { NO_INPUT, type InputState } from '../core/input';

/**
 * Decides when the browser sends its input: only when it changed, and not more often than
 * CONFIG.net.maxInputsPerSecond. A one-shot press (lamp, bottle, beacon, bomb) that comes and
 * goes between two sends is kept, so no key press is lost.
 */

const ONE_SHOTS = ['toggleLamp', 'useBottle', 'placeBeacon', 'placeBomb'] as const;

export class InputSender {
  private sent: InputState = NO_INPUT;
  private sentAt = -Infinity;
  private pressed = new Set<(typeof ONE_SHOTS)[number]>();

  /** The input to send now, or null when nothing needs sending. `now` in seconds. */
  next(input: InputState, now: number): InputState | null {
    for (const key of ONE_SHOTS) if (input[key]) this.pressed.add(key);
    const wanted: InputState = { ...input };
    for (const key of ONE_SHOTS) wanted[key] = this.pressed.has(key);
    if (same(wanted, this.sent)) return null;
    if (now - this.sentAt < 1 / CONFIG.net.maxInputsPerSecond) return null;
    this.sent = wanted;
    this.sentAt = now;
    this.pressed.clear();
    return wanted;
  }
}

function same(a: InputState, b: InputState): boolean {
  return (Object.keys(a) as (keyof InputState)[]).every((k) => a[k] === b[k]);
}
