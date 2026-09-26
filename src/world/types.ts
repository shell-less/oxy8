import type { PlanetDef } from './planets';

export interface Point { x: number; y: number }
export interface Circle extends Point { r: number }

export type BunkerKind = 'parts' | 'supply';

export interface Bunker extends Point {
  id: number;
  kind: BunkerKind;
  /** Parts bunkers are empty after one visit. Supply bunkers never run out of oxygen. */
  looted: boolean;
  /** Supply bunkers only: a one-time energy cell is still inside. */
  energyCell: boolean;
  /** Animation phase so lights do not blink in sync. */
  phase: number;
}

export interface Crystal extends Point {
  phase: number;
  spikes: { dx: number; h: number }[];
}

export interface Pool extends Point { rx: number; ry: number }

export type CreeperMode = 'patrol' | 'chase' | 'return';

/** Crawlers walk and chase; jumpers hop around and pounce on the player. */
export type CreeperKind = 'crawler' | 'jumper';

export type JumpPhase = 'rest' | 'hop' | 'crouch' | 'pounce' | 'recover';

/** Jumper-only state. A jump moves from (fromX, fromY) to (toX, toY) over `duration` seconds. */
export interface JumpState {
  phase: JumpPhase;
  /** Seconds left in the current phase. */
  timer: number;
  duration: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Height above the ground, for drawing only. */
  z: number;
}

export interface Creeper extends Point {
  kind: CreeperKind;
  /** Only for jumpers. */
  jump: JumpState | null;
  /** Centre and radii of the elliptical patrol route around a bunker. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  direction: 1 | -1;
  /** Angular speed along the ellipse (radians per second). */
  angularSpeed: number;
  facing: 1 | -1;
  mode: CreeperMode;
  cooldown: number;
}

export interface World {
  planet: PlanetDef;
  width: number;
  height: number;
  ship: Point;
  bunkers: Bunker[];
  rocks: Circle[];
  crystals: Crystal[];
  pools: Pool[];
  creepers: Creeper[];
  /** Everything the player collides with. */
  solids: Circle[];
}
