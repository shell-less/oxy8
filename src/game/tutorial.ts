import { CONFIG } from '../config';
import { darknessAt, hourOf } from '../core/clock';
import { anyCraftable } from './crafting';
import { isRepaired, localPlayer, type GameState } from './state';

/** Context the game state does not track itself. */
export interface TipContext {
  /** Real seconds since walking out of the ship on this landing. */
  secondsOnPlanet: number;
}

export interface Tip {
  id: string;
  /** Dutch, one or two short sentences. */
  text: string;
  /** The same tip for touch screens, when `text` names keys. */
  touchText?: string;
  when: (state: GameState, ctx: TipContext) => boolean;
}

/** Tips are about the local player: the one reading them. */
const me = localPlayer;

const near = (state: GameState, x: number, y: number, range: number) =>
  Math.hypot(me(state).x - x, me(state).y - y) < range;

const darkness = (state: GameState) => darknessAt(hourOf(state.time));

/**
 * Tutorial tips, in priority order. Each is shown once, at the moment it becomes useful.
 * Keep them short: the game should explain itself by playing.
 */
export const TIPS: readonly Tip[] = [
  {
    id: 'move',
    text: 'Loop met WASD of de pijltjes. Je zuurstof (O2) loopt langzaam leeg.',
    touchText: 'Loop door je duim over de linkerhelft te slepen. Je zuurstof (O2) loopt langzaam leeg.',
    when: (_, ctx) => ctx.secondsOnPlanet > CONFIG.tips.firstDelay,
  },
  {
    id: 'bunkers',
    text: 'Oranje bunkers bevatten scheepsonderdelen, blauwe vullen je zuurstof bij. Houd E vast om te openen.',
    touchText: 'Oranje bunkers bevatten scheepsonderdelen, blauwe vullen je zuurstof bij. Houd de actieknop vast om te openen.',
    when: (s) => s.world.bunkers.some((b) => near(s, b.x, b.y, CONFIG.tips.nearBunker)),
  },
  {
    id: 'creeper',
    text: 'Kruipers kun je niet verslaan: een aanval scheurt je pak. Loop weg, ze zijn trager dan jij.',
    when: (s) => s.world.creepers.some((c) => near(s, c.x, c.y, CONFIG.tips.nearCreeper)),
  },
  {
    id: 'jumper',
    text: 'Deze kruipers springen. Duikt er een ineen, stap dan opzij: hij landt op de rode markering.',
    when: (s) => s.world.creepers.some((c) => c.kind === 'jumper' && near(s, c.x, c.y, CONFIG.tips.nearCreeper)),
  },
  {
    id: 'glider',
    text: 'Deze kruipers glijden over het ijs. Zet er een zich schrap, stap dan opzij: hij glijdt in een rechte lijn.',
    when: (s) => s.world.creepers.some((c) => c.kind === 'glider' && near(s, c.x, c.y, CONFIG.tips.nearCreeper)),
  },
  {
    id: 'energy-cell',
    text: 'Een geel lampje bij een blauwe bunker is een energiecel. Die kun je maar een keer pakken.',
    when: (s) => {
      const target = me(s).interaction.target;
      return target?.kind === 'bunker' && target.bunker.energyCell;
    },
  },
  {
    id: 'part',
    text: 'Breng het onderdeel naar je schip en houd daar E vast. Inbouwen kost 20 energie.',
    touchText: 'Breng het onderdeel naar je schip en houd daar de actieknop vast. Inbouwen kost 20 energie.',
    when: (s) => me(s).partsCarried > me(s).partsInstalled,
  },
  {
    id: 'scrap',
    text: 'Glinsterend schroot: loop eroverheen om het op te pakken. Bij je schip maak je er spullen van.',
    when: (s) => s.world.scrap.some((x) => !x.taken && near(s, x.x, x.y, CONFIG.tips.nearScrap)),
  },
  {
    id: 'craft',
    text: 'Je hebt genoeg schroot om iets te maken. Houd E vast bij je schip en kies op de werkbank.',
    touchText: 'Je hebt genoeg schroot om iets te maken. Houd de actieknop vast bij je schip en kies op de werkbank.',
    when: (s) => anyCraftable(me(s)),
  },
  {
    id: 'bottle',
    text: 'Weinig zuurstof? Druk op Q om je zuurstoffles te gebruiken.',
    touchText: 'Weinig zuurstof? Tik op de fles-knop om je zuurstoffles te gebruiken.',
    when: (s) => me(s).inventory.bottles > 0 && me(s).oxygen < CONFIG.tips.lowOxygen,
  },
  {
    id: 'beacon',
    text: 'Druk op R om een lokbaken neer te zetten. Kruipers in de buurt gaan er even op af in plaats van op jou.',
    touchText: 'Tik op de baken-knop om een lokbaken neer te zetten. Kruipers in de buurt gaan er even op af in plaats van op jou.',
    when: (s) => me(s).inventory.beacons > 0 && s.world.creepers.some((c) => near(s, c.x, c.y, CONFIG.tips.nearCreeper * 1.5)),
  },
  {
    id: 'oxygen',
    text: 'Je zuurstof is onder de helft. Blauwe bunkers vullen je tank altijd bij.',
    when: (s) => me(s).oxygen < CONFIG.tips.lowOxygen,
  },
  {
    id: 'lamp',
    text: 'Het wordt donker. Je helmlamp (F) kost \'s nachts energie.',
    touchText: 'Het wordt donker. Je helmlamp kost \'s nachts energie. De lamp-knop zet hem aan en uit.',
    when: (s) => darkness(s) > 0.2,
  },
  {
    id: 'lamp-off',
    text: 'Zonder lamp zien kruipers je pas later, maar jij ziet ook minder.',
    when: (s) => !me(s).lamp && darkness(s) > 0.3,
  },
  {
    id: 'starmap',
    text: 'Je motor is klaar. Houd E vast bij je schip en kies op de sterrenkaart je volgende planeet.',
    touchText: 'Je motor is klaar. Houd de actieknop vast bij je schip en kies op de sterrenkaart je volgende planeet.',
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
