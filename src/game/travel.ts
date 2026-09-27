import { PLANETS } from '../world/planets';
import { energyCellsLeft, flightCost, scrapLeft, snapshotCampaign } from './campaign';
import { landOn, localPlayer, type GameState } from './state';

export type DestinationStatus = 'here' | 'visited' | 'new' | 'locked' | 'unknown' | 'home';

/** One row on the star map. Built from state, so the UI only renders it. */
export interface Destination {
  /** Planet index, or PLANETS.length for the way home. */
  index: number;
  name: string;
  status: DestinationStatus;
  /** Energy cells left there, when known. */
  energyCells: number | null;
  /** Scrap left there, when known. */
  scrap: number | null;
  /** Current planet only: installed/needed. */
  parts: { installed: number; needed: number } | null;
  canFly: boolean;
  /** Dutch explanation when canFly is false, or extra info. */
  note: string;
}

export const HOME_INDEX = PLANETS.length;

export function destinations(state: GameState): Destination[] {
  const { unlocked } = state.campaign;
  const cost = flightCost();
  const me = localPlayer(state);
  const affordable = me.energy >= cost;
  const tooPoor = `Te weinig energie (${cost} nodig)`;
  const rows: Destination[] = PLANETS.map((planet, index) => {
    const base = {
      index, name: planet.name, energyCells: energyCellsLeft(state, index), scrap: scrapLeft(state, index),
      parts: null, canFly: false, note: '',
    };
    if (index === state.planetIndex) {
      return {
        ...base,
        status: 'here',
        parts: { installed: me.partsInstalled, needed: planet.partsNeeded },
        note: 'Je bent hier',
      };
    }
    const visited = state.campaign.planets[index] !== null;
    if (index <= unlocked) {
      return {
        ...base,
        status: visited ? 'visited' : 'new',
        canFly: affordable,
        note: affordable ? (visited ? 'Bezocht' : 'Nog niet bezocht') : tooPoor,
      };
    }
    if (index === unlocked + 1) {
      const needed = PLANETS[index - 1].partsNeeded;
      return { ...base, status: 'locked', note: `Motor te zwak: repareer eerst ${PLANETS[index - 1].name} (${needed} onderdelen)` };
    }
    return { ...base, name: '???', status: 'unknown', energyCells: null, scrap: null, note: 'Buiten bereik' };
  });
  if (unlocked >= HOME_INDEX) {
    rows.push({
      index: HOME_INDEX, name: 'Naar huis', status: 'home', energyCells: null, scrap: null, parts: null,
      canFly: affordable, note: affordable ? 'Einde van de reis' : tooPoor,
    });
  }
  return rows;
}

export type TravelResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Fly to another planet. Pays the flight, stores progress here, lands there. Flying home ends the game. */
export function travel(state: GameState, index: number): TravelResult {
  const target = destinations(state).find((d) => d.index === index);
  if (!target) return { ok: false, reason: 'Onbekende bestemming' };
  if (!target.canFly) return { ok: false, reason: target.note };
  const me = localPlayer(state);
  const energy = me.energy - flightCost();
  const campaign = snapshotCampaign(state);
  if (index === HOME_INDEX) {
    const next = { ...state, players: [{ ...me, energy }], campaign, status: 'escaped' as const, events: [] };
    return { ok: true, state: next };
  }
  return { ok: true, state: landOn(index, { energy, campaign, inventory: me.inventory }) };
}
