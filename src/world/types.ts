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

/** A small piece of wreckage lying on the ground. Walk over it to pick it up. */
export interface Scrap extends Point {
  id: number;
  taken: boolean;
  /** Animation phase for the glint. */
  phase: number;
}

export type CreeperMode = 'patrol' | 'chase' | 'return';

/**
 * Crawlers walk and chase; jumpers hop around and pounce on the player;
 * gliders skate along their route and charge in a straight line over the ice.
 */
export type CreeperKind = 'crawler' | 'jumper' | 'glider';

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

export type SlidePhase = 'glide' | 'brace' | 'slide' | 'recover';

/** Glider-only state. A slide runs along (dirX, dirY) and slows down by friction. */
export interface SlideState {
  phase: SlidePhase;
  /** Seconds left in the current phase (brace and recover). */
  timer: number;
  /** Unit direction of the charge; follows the target while bracing, fixed while sliding. */
  dirX: number;
  dirY: number;
  /** Current slide speed in pixels per second. */
  speed: number;
}

export interface Creeper extends Point {
  kind: CreeperKind;
  /** Only for jumpers. */
  jump: JumpState | null;
  /** Only for gliders. */
  slide: SlideState | null;
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
  /** Size in tiles; the minimap has one pixel per tile. Solo planets use CONFIG.world, race planets CONFIG.race. */
  tilesX: number;
  tilesY: number;
  width: number;
  height: number;
  /** The first player's ship. Same as ships[0]. */
  ship: Point;
  /** One ship per player: solo planets have one, race planets two, mirrored. */
  ships: Point[];
  bunkers: Bunker[];
  rocks: Circle[];
  crystals: Crystal[];
  pools: Pool[];
  creepers: Creeper[];
  scrap: Scrap[];
  /** Everything the player collides with. */
  solids: Circle[];
}
