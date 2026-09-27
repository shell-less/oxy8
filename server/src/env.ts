import type { RaceRoom } from './room';

export interface Env {
  RACE_ROOM: DurableObjectNamespace<RaceRoom>;
  /** Comma-separated origins whose pages may open rooms. */
  ALLOWED_ORIGINS: string;
}
