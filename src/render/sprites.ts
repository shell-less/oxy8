import { CONFIG } from '../config';
import type { Player } from '../game/state';
import type { Theme } from '../world/themes';
import type { Beacon, SupplyDrop } from '../game/state';
import type { Bunker, Creeper, Crystal, Scrap } from '../world/types';
import { rect, type Ctx } from './pixels';

const SHADOW = 'rgba(5,4,12,.45)';

/** Sprites are drawn in code with small rectangles. x, y is the foot point in screen pixels; t is render time. */

export function drawBunker(ctx: Ctx, b: Bunker, x: number, y: number, t: number): void {
  const isParts = b.kind === 'parts';
  const lit = !isParts || !b.looted;
  const accent = isParts ? '#ff9a3c' : '#43d6ff';
  rect(ctx, x - 15, y - 2, 30, 3, SHADOW);
  rect(ctx, x - 14, y - 15, 28, 14, '#5f6870');
  rect(ctx, x - 14, y - 16, 28, 1, '#9aa4ac');
  rect(ctx, x - 12, y - 20, 24, 4, '#7d868e');
  rect(ctx, x - 12, y - 21, 24, 1, '#aab4bc');
  rect(ctx, x - 14, y - 8, 28, 1, '#4c545b');
  for (let i = -12; i <= 12; i += 6) rect(ctx, x + i, y - 13, 1, 1, '#8b949c');
  if (isParts) for (let i = 0; i < 6; i++) rect(ctx, x - 12 + i * 4, y - 20, 2, 4, i % 2 ? '#1f1f22' : '#e0b030');
  rect(ctx, x - 5, y - 12, 10, 11, b.looted ? '#0e0f12' : '#2c3238');
  if (!b.looted) rect(ctx, x, y - 12, 1, 11, '#1e2328');
  rect(ctx, x - 5, y - 13, 10, 1, lit && Math.sin(t * 3 + b.phase) > -0.3 ? accent : '#3a3f44');
  rect(ctx, x + 10, y - 26, 1, 6, '#8b949c');
  rect(ctx, x + 10, y - 27, 1, 1, lit && Math.sin(t * 5 + b.phase) > 0 ? accent : '#444');
  if (!isParts && b.energyCell) rect(ctx, x - 11, y - 6, 3, 3, Math.sin(t * 4 + b.phase) > 0 ? '#ffd24a' : '#806a20');
}

/**
 * A race bomb: a small dark disc, flat on the ground and hard to see. The owner sees it with a
 * faint stripe; while it arms, a ring around it closes (`arming` 1 to 0). Lights are drawn
 * separately by the renderer, above the night layer.
 */
export function drawBomb(ctx: Ctx, x: number, y: number, own: boolean, arming: number): void {
  rect(ctx, x - 2, y - 1, 4, 2, '#1c1a1e');
  rect(ctx, x - 1, y - 2, 2, 1, '#2a272c');
  if (own) rect(ctx, x - 1, y - 1, 2, 1, '#6a5a2a');
  if (arming > 0) {
    const r = Math.max(3, Math.round(3 + 8 * arming));
    rect(ctx, x - r, y, 1, 1, '#ff5060');
    rect(ctx, x + r, y, 1, 1, '#ff5060');
    rect(ctx, x, y - r, 1, 1, '#ff5060');
    rect(ctx, x, y + r, 1, 1, '#ff5060');
  }
}

/**
 * The race supply pod. `fall` runs from 1 (high in the sky) to 0 (landed): the pod drops onto
 * its growing shadow. A yellow light means the energy cell is inside, orange the part.
 */
export function drawDrop(ctx: Ctx, drop: SupplyDrop, x: number, y: number, t: number, fall: number): void {
  const shadow = Math.round(4 + 6 * (1 - fall));
  rect(ctx, x - shadow, y - 1, shadow * 2, 2, SHADOW);
  const top = y - Math.round(fall * 140);
  rect(ctx, x - 6, top - 14, 12, 13, '#9aa4ac');
  rect(ctx, x - 5, top - 16, 10, 2, '#c7ccd2');
  rect(ctx, x - 6, top - 9, 12, 2, '#ff8a3d');
  rect(ctx, x - 7, top - 3, 3, 3, '#5f6870');
  rect(ctx, x + 4, top - 3, 3, 3, '#5f6870');
  if (fall > 0) {
    rect(ctx, x - 2, top - 20, 4, 4, Math.sin(t * 30) > 0 ? '#ffb347' : '#ff5a2a');
    return;
  }
  rect(ctx, x - 4, top - 13, 3, 3, drop.part && Math.sin(t * 4) > -0.2 ? '#ff9a3c' : '#3a3f44');
  rect(ctx, x + 1, top - 13, 3, 3, drop.energyCell && Math.sin(t * 4 + 1) > 0 ? '#ffd24a' : '#3a3f44');
}

export function drawShip(ctx: Ctx, x: number, y: number, t: number, slots: number, installed: number): void {
  rect(ctx, x - 26, y - 3, 52, 4, SHADOW);
  rect(ctx, x - 29, y - 14, 6, 8, '#1a1216');
  rect(ctx, x - 20, y - 18, 38, 14, '#c7ccd2');
  rect(ctx, x - 20, y - 18, 38, 2, '#e6eaee');
  rect(ctx, x - 20, y - 6, 38, 2, '#9aa1a8');
  rect(ctx, x + 18, y - 16, 4, 10, '#aab0b8');
  rect(ctx, x + 22, y - 14, 2, 6, '#8d949b');
  rect(ctx, x + 8, y - 16, 7, 5, '#3fd0ff');
  rect(ctx, x + 9, y - 16, 2, 1, '#c8f6ff');
  rect(ctx, x - 24, y - 22, 8, 4, '#ff8a3d');
  rect(ctx, x - 24, y - 4, 8, 3, '#ff8a3d');
  rect(ctx, x - 23, y - 14, 3, 6, '#555c63');
  rect(ctx, x - 2, y - 8, 3, 1, '#6f767d');
  const spacing = slots <= 3 ? 7 : 5;
  const start = x - 15;
  for (let i = 0; i < slots; i++) {
    const sx = start + i * spacing;
    rect(ctx, sx, y - 12, spacing - 2, 4, '#2a2e33');
    const blink = Math.sin(t * 4 + i) > 0 ? '#ff5060' : '#5a1e26';
    rect(ctx, sx + 1, y - 11, spacing - 4, 2, i < installed ? '#7dff8a' : blink);
  }
}

export function drawCrystal(ctx: Ctx, c: Crystal, x: number, y: number, t: number, theme: Theme): void {
  rect(ctx, x - 5, y - 1, 10, 2, 'rgba(5,4,12,.4)');
  c.spikes.forEach((s, i) => {
    const shine = Math.sin(t * 2 + c.phase + i) > 0.6;
    rect(ctx, x + s.dx - 1, y - s.h, 2, s.h, theme.crystal[0]);
    rect(ctx, x + s.dx - 1, y - s.h, 1, s.h, shine ? theme.crystal[2] : theme.crystal[1]);
    rect(ctx, x + s.dx - 1, y - s.h - 1, 1, 1, theme.crystal[2]);
  });
}

export function drawCreeper(ctx: Ctx, c: Creeper, x: number, y: number, t: number, theme: Theme): void {
  if (c.kind === 'jumper') drawJumper(ctx, c, x, y, t, theme);
  else if (c.kind === 'glider') drawGlider(ctx, c, x, y, t, theme);
  else drawCrawler(ctx, c, x, y, t, theme);
}

/** Where a pouncing jumper will land: a blinking ring on the ground, so the player can step aside. */
export function drawPounceMarker(ctx: Ctx, c: Creeper, x: number, y: number, t: number): void {
  const j = c.jump;
  if (!j || (j.phase !== 'crouch' && j.phase !== 'pounce')) return;
  const color = Math.sin(t * 18) > 0 ? '#ff3050' : '#ff9aa8';
  rect(ctx, x - 4, y - 1, 9, 1, color);
  rect(ctx, x - 6, y, 2, 1, color);
  rect(ctx, x + 5, y, 2, 1, color);
  rect(ctx, x - 4, y + 2, 9, 1, color);
  rect(ctx, x - 6, y + 1, 2, 1, color);
  rect(ctx, x + 5, y + 1, 2, 1, color);
}

/** Where a bracing glider will slide: a blinking dotted line on the ground, so the player can step aside. */
export function drawSlideMarker(ctx: Ctx, c: Creeper, x: number, y: number, t: number): void {
  const s = c.slide;
  if (!s || s.phase !== 'brace') return;
  const color = Math.sin(t * 18) > 0 ? '#ff3050' : '#ff9aa8';
  const length = CONFIG.enemies.glider.warningLength;
  for (let d = 8; d < length; d += 4) {
    rect(ctx, Math.round(x + s.dirX * d), Math.round(y + s.dirY * d), 2, 1, color);
  }
  const tipX = Math.round(x + s.dirX * length);
  const tipY = Math.round(y + s.dirY * length);
  rect(ctx, tipX - 1, tipY - 1, 3, 3, color);
}

/**
 * A flat, wide skater on two runners. Leans back while bracing, sprays ice while sliding,
 * and sits dazed for a moment afterwards. x, y is the ground point.
 */
function drawGlider(ctx: Ctx, c: Creeper, x: number, y: number, t: number, theme: Theme): void {
  const s = c.slide!;
  const col = theme.creeper;
  const f = c.facing;
  const bracing = s.phase === 'brace';
  const sliding = s.phase === 'slide';
  const dazed = s.phase === 'recover';
  // Bracing: shake in place, a pixel back from where it will go.
  const shake = bracing ? (Math.sin(t * 40) > 0 ? 1 : 0) - f : 0;
  const bx = x + shake;
  rect(ctx, bx - 8, y - 1, 16, 2, SHADOW);

  // Runners, with curled tips in front.
  rect(ctx, bx - 7, y - 2, 14, 1, col[5]);
  rect(ctx, f > 0 ? bx + 7 : bx - 8, y - 3, 1, 1, col[5]);
  rect(ctx, bx - 4, y - 3, 1, 1, col[5]);
  rect(ctx, bx + 3, y - 3, 1, 1, col[5]);

  // Low body, lower at the back while bracing.
  const h = bracing ? 4 : 5;
  const alert = bracing || sliding || c.mode === 'chase';
  rect(ctx, bx - 7, y - 3 - h, 14, h, alert ? col[1] : col[0]);
  rect(ctx, bx - 6, y - 4 - h, 12, 1, col[2]);
  rect(ctx, bx - 5, y - 3 - h, 5, 1, col[3]);
  rect(ctx, bx - 7, y - 4, 14, 1, col[4]);
  // Frosty fin on the back.
  rect(ctx, f > 0 ? bx - 4 : bx + 2, y - 6 - h, 3, 2, col[3]);

  // One wide visor-like eye strip at the front.
  const ex = f > 0 ? bx + 2 : bx - 6;
  const ey = y - 1 - h;
  if (dazed) {
    rect(ctx, ex, ey, 4, 1, '#f4f0ff');
    if (Math.sin(t * 6) > 0) rect(ctx, bx, y - 12 - h, 1, 1, '#fff2b0');
    else rect(ctx, bx - 2, y - 11 - h, 1, 1, '#fff2b0');
  } else {
    rect(ctx, ex, ey - 1, 4, 2, '#f4f0ff');
    rect(ctx, ex + (f > 0 ? 2 : 0), ey - 1, 2, 2, bracing ? '#ff6070' : '#ff3050');
  }

  // Ice spray behind while sliding.
  if (sliding) {
    const back = -f;
    for (let i = 0; i < 3; i++) {
      const o = Math.floor(t * 30 + i * 2) % 3;
      rect(ctx, bx + back * (9 + i * 3 + o), y - 2 - ((i + o) % 3), 1, 1, i === 1 ? '#ffffff' : theme.dust);
    }
  }
  if (bracing && Math.sin(t * 16) > -0.2) {
    rect(ctx, bx, y - 14 - h, 1, 3, '#ff3050');
    rect(ctx, bx, y - 10 - h, 1, 1, '#ff3050');
  }
}

/** A round hopper with big eyes. Squashes while crouching, stretches in the air. x, y is the ground point. */
function drawJumper(ctx: Ctx, c: Creeper, x: number, y: number, t: number, theme: Theme): void {
  const j = c.jump!;
  const col = theme.creeper;
  const z = Math.round(j.z);
  const shadow = Math.max(4, 7 - Math.floor(z / 4));
  rect(ctx, x - shadow, y - 1, shadow * 2, 2, SHADOW);

  const crouching = j.phase === 'crouch';
  const airborne = z > 0;
  const recovering = j.phase === 'recover';
  const w = crouching ? 12 : airborne ? 8 : 10;
  const h = crouching ? 5 : airborne ? 9 : 7;
  const by = y - 2 - z;
  const bx = x - w / 2;

  // Feet: tucked in the air, spread on the ground.
  if (!airborne) {
    rect(ctx, x - 5, y - 2, 3, 2, col[5]);
    rect(ctx, x + 2, y - 2, 3, 2, col[5]);
  } else {
    rect(ctx, x - 3, by, 2, 2, col[5]);
    rect(ctx, x + 1, by, 2, 2, col[5]);
  }
  rect(ctx, bx, by - h, w, h, j.phase === 'crouch' || c.mode === 'chase' ? col[1] : col[0]);
  rect(ctx, bx + 1, by - h - 1, w - 2, 1, col[2]);
  rect(ctx, bx + 1, by - h, 3, 1, col[3]);
  rect(ctx, bx, by - 1, w, 1, col[4]);

  // Two big eyes looking where it faces; half closed while recovering.
  const f = c.facing;
  const ey = by - h + 2;
  const e1 = f > 0 ? x : x - 3;
  const eye = crouching ? '#ff6070' : '#ff3050';
  rect(ctx, e1, ey, 2, recovering ? 1 : 2, '#f4f0ff');
  rect(ctx, e1 + 3, ey, 2, recovering ? 1 : 2, '#f4f0ff');
  if (!recovering) {
    rect(ctx, e1 + (f > 0 ? 1 : 0), ey + 1, 1, 1, eye);
    rect(ctx, e1 + 3 + (f > 0 ? 1 : 0), ey + 1, 1, 1, eye);
  }
  if (crouching && Math.sin(t * 16) > -0.2) {
    rect(ctx, x, by - h - 8, 1, 3, '#ff3050');
    rect(ctx, x, by - h - 4, 1, 1, '#ff3050');
  }
}

function drawCrawler(ctx: Ctx, c: Creeper, x: number, y: number, t: number, theme: Theme): void {
  const chasing = c.mode === 'chase';
  const frame = Math.floor(t * (chasing ? 11 : 6)) % 2;
  const col = theme.creeper;
  rect(ctx, x - 6, y - 1, 12, 2, SHADOW);
  for (let i = 0; i < 3; i++) {
    const o = (frame + i) % 2;
    rect(ctx, x - 5 + i * 4, y - 4 + o, 1, 3, col[5]);
    rect(ctx, x - 4 + i * 4, y - 4 + (1 - o), 1, 3, col[5]);
  }
  rect(ctx, x - 6, y - 8, 12, 5, chasing ? col[1] : col[0]);
  rect(ctx, x - 5, y - 9, 10, 1, col[2]);
  rect(ctx, x - 4, y - 8, 4, 1, col[3]);
  rect(ctx, x - 6, y - 5, 12, 1, col[4]);
  const eye = chasing ? '#ff6070' : '#ff3050';
  const ex = c.facing > 0 ? x + 4 : x - 5;
  rect(ctx, ex, y - 7, 1, 1, eye);
  rect(ctx, ex + (c.facing > 0 ? -2 : 2), y - 7, 1, 1, eye);
  rect(ctx, c.facing > 0 ? x + 6 : x - 7, y - 5, 1, 2, col[2]);
  if (chasing && Math.sin(t * 10) > -0.2) {
    rect(ctx, x, y - 16, 1, 3, '#ff3050');
    rect(ctx, x, y - 12, 1, 1, '#ff3050');
  }
}

const SUIT_STRIPES = ['#ff8a3d', '#8cff4a'];

export function drawPlayer(ctx: Ctx, p: Player, x: number, y: number, t: number, lamp: boolean): void {
  rect(ctx, x - 5, y - 1, 10, 2, SHADOW);
  if (p.invulnerable > 0 && Math.floor(p.invulnerable * 14) % 2) return;
  const step = Math.floor(p.walkTime * 8) % 2;
  const f = p.facing;
  const liftA = p.moving ? step : 0;
  const liftB = p.moving ? 1 - step : 0;
  rect(ctx, x - 3, y - 4 - liftA, 2, 3, '#b8c0c8');
  rect(ctx, x - 3, y - 1 - liftA, 2, 1, '#4a525a');
  rect(ctx, x + 1, y - 4 - liftB, 2, 3, '#b8c0c8');
  rect(ctx, x + 1, y - 1 - liftB, 2, 1, '#4a525a');
  const packX = f > 0 ? x - 6 : x + 4;
  rect(ctx, packX, y - 11, 2, 6, '#8f99a3');
  rect(ctx, packX, y - 11, 2, 1, '#c0c8d0');
  rect(ctx, x - 4, y - 11, 8, 7, '#e8edf2');
  // The suit stripe tells players apart in a race: orange for player 1, lime for player 2.
  rect(ctx, x - 4, y - 8, 8, 1, SUIT_STRIPES[p.id % SUIT_STRIPES.length]);
  rect(ctx, x - 4, y - 5, 8, 1, '#b0b8c0');
  rect(ctx, f > 0 ? x + 4 : x - 5, y - 10 + liftA, 1, 4, '#d0d6dc');
  rect(ctx, x - 3, y - 16, 6, 5, '#f2f5f8');
  rect(ctx, x - 3, y - 16, 6, 1, '#ffffff');
  const visorX = f > 0 ? x : x - 3;
  rect(ctx, visorX, y - 15, 3, 3, '#1c8fc4');
  rect(ctx, visorX + 1, y - 15, 1, 1, '#bff3ff');
  rect(ctx, f > 0 ? x + 3 : x - 4, y - 16, 1, 1, lamp ? '#fff2b0' : '#555');
  if (p.leak > 0) rect(ctx, packX + (f > 0 ? 0 : 1), y - 9, 1, 1, Math.sin(t * 20) > 0 ? '#ff5060' : '#fff');
}

/** A twisted piece of hull plating with a glint now and then. */
export function drawScrap(ctx: Ctx, s: Scrap, x: number, y: number, t: number): void {
  rect(ctx, x - 4, y, 8, 1, SHADOW);
  rect(ctx, x - 4, y - 2, 5, 2, '#8a929a');
  rect(ctx, x - 1, y - 4, 4, 2, '#b8c0c8');
  rect(ctx, x + 2, y - 2, 2, 2, '#6a7078');
  rect(ctx, x - 3, y - 2, 1, 1, '#c8662c');
  if (Math.sin(t * 2.5 + s.phase) > 0.93) {
    rect(ctx, x, y - 6, 1, 3, '#ffffff');
    rect(ctx, x - 1, y - 5, 3, 1, '#ffffff');
  }
}

/** A small mast with a blinking red light. Blinks faster when it is about to run out. */
export function drawBeacon(ctx: Ctx, b: Beacon, x: number, y: number, t: number): void {
  rect(ctx, x - 3, y, 6, 1, SHADOW);
  rect(ctx, x - 2, y - 2, 4, 2, '#5f6870');
  rect(ctx, x, y - 9, 1, 7, '#9aa4ac');
  const speed = b.timeLeft < 4 ? 14 : 5;
  const on = Math.sin(t * speed) > 0;
  rect(ctx, x - 1, y - 11, 3, 2, on ? '#ff3050' : '#6a1a24');
  if (on) {
    rect(ctx, x - 3, y - 10, 1, 1, '#ff9aa8');
    rect(ctx, x + 3, y - 10, 1, 1, '#ff9aa8');
  }
}
