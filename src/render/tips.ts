import { CONFIG } from '../config';
import { readTipSettings, writeTipSettings, type TipSettings } from '../game/save';
import type { GameState } from '../game/state';
import { nextTip } from '../game/tutorial';

/** Shows tutorial tips one at a time in the #tip panel and remembers which were seen. */
export class Tips {
  private el = document.getElementById('tip') as HTMLElement;
  private settings: TipSettings = readTipSettings();
  private seen = new Set(this.settings.seen);
  private secondsOnPlanet = 0;
  private showing = 0;
  private cooldown = 0;
  /** Show the touch version of a tip when there is one. */
  touch = false;

  get enabled(): boolean {
    return this.settings.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    this.persist();
    if (!enabled) this.hide();
  }

  /** Forget seen tips, so they show again. */
  reset(): void {
    this.seen.clear();
    this.persist();
  }

  /** Call when the player walks out of the ship. */
  landed(): void {
    this.secondsOnPlanet = 0;
    this.cooldown = 0;
  }

  /** Call every frame. When the game is paused the tip is hidden and nothing new appears. */
  update(state: GameState, dt: number, running: boolean): void {
    if (!running) {
      this.hide();
      return;
    }
    this.secondsOnPlanet += dt;
    if (this.showing > 0) {
      this.showing -= dt;
      if (this.showing <= 0) {
        this.hide();
        this.cooldown = CONFIG.tips.gapSeconds;
      }
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return;
    }
    if (!this.settings.enabled) return;
    const tip = nextTip(state, { secondsOnPlanet: this.secondsOnPlanet }, this.seen);
    if (!tip) return;
    this.seen.add(tip.id);
    this.persist();
    this.el.querySelector('.tip-text')!.textContent = this.touch && tip.touchText ? tip.touchText : tip.text;
    this.el.hidden = false;
    this.showing = CONFIG.tips.showSeconds;
  }

  private hide(): void {
    this.el.hidden = true;
    this.showing = 0;
  }

  private persist(): void {
    this.settings.seen = [...this.seen];
    writeTipSettings(this.settings);
  }
}
