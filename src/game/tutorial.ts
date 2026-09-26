import { CONFIG } from '../config';
import { darknessAt, hourOf } from '../core/clock';
import { isRepaired, type GameState } from './state';

/** Context the game state does not track itself. */
export interface TipContext {
  /** Real seconds since walking out of the ship on this landing. */
  secondsOnPlanet: number;
}

export interface Tip {
  id: string;
  /** Dutch, one or two short sentences. */
  text: string;
  when: (state: GameState, ctx: TipContext) => boolean;
}

const near = (state: GameState, x: number, y: number, range: number) =>
  Math.hypot(state.player.x - x, state.player.y - y) < range;

const darkness = (state: GameState) => darknessAt(hourOf(state.time));

/**
 * Tutorial tips, in priority order. Each is shown once, at the moment it becomes useful.
 * Keep them short: the game should explain itself by playing.
 */
export const TIPS: readonly Tip[] = [
  {
    id: 'move',
    text: 'Loop met WASD of de pijltjes. Je zuurstof (O2) loopt langzaam leeg.',
    when: (_, ctx) => ctx.secondsOnPlanet > CONFIG.tips.firstDelay,
  },
  {
    id: 'bunkers',
    text: 'Oranje bunkers bevatten scheepsonderdelen, blauwe vullen je zuurstof bij. Houd E vast om te openen.',
    when: (s) => s.world.bunkers.some((b) => near(s, b.x, b.y, CONFIG.tips.nearBunker)),
  },
  {
    id: 'creeper',
    text: 'Kruipers kun je niet verslaan: een aanval scheurt je pak. Loop weg, ze zijn trager dan jij.',
    when: (s) => s.world.creepers.some((c) => near(s, c.x, c.y, CONFIG.tips.nearCreeper)),
  },
  {
    id: 'energy-cell',
    text: 'Een geel lampje bij een blauwe bunker is een energiecel. Die kun je maar een keer pakken.',
    when: (s) => s.interaction.target?.kind === 'bunker' && s.interaction.target.bunker.energyCell,
  },
  {
    id: 'part',
    text: 'Breng het onderdeel naar je schip en houd daar E vast. Inbouwen kost 20 energie.',
    when: (s) => s.partsCarried > s.partsInstalled,
  },
  {
    id: 'oxygen',
    text: 'Je zuurstof is onder de helft. Blauwe bunkers vullen je tank altijd bij.',
    when: (s) => s.oxygen < CONFIG.tips.lowOxygen,
  },
  {
    id: 'lamp',
    text: 'Het wordt donker. Je helmlamp (F) kost \'s nachts energie.',
    when: (s) => darkness(s) > 0.2,
  },
  {
    id: 'lamp-off',
    text: 'Zonder lamp zien kruipers je pas later, maar jij ziet ook minder.',
    when: (s) => !s.lamp && darkness(s) > 0.3,
  },
  {
    id: 'starmap',
    text: 'Je motor is klaar. Houd E vast bij je schip om de sterrenkaart te openen en verder te reizen.',
    when: (s) => isRepaired(s),
  },
  {
    id: 'return',
    text: 'Op de sterrenkaart zie je hoeveel energiecellen er nog op eerdere planeten liggen. Terugvliegen kan altijd.',
    when: (s) => s.planetIndex > 0,
  },
];

/** The first unseen tip whose moment has come, or null. */
export function nextTip(state: GameState, ctx: TipContext, seen: ReadonlySet<string>): Tip | null {
  if (state.status !== 'playing') return null;
  return TIPS.find((t) => !seen.has(t.id) && t.when(state, ctx)) ?? null;
}
