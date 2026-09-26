import type { Player } from '../game/state';
import type { Theme } from '../world/themes';
import type { Bunker, Creeper, Crystal } from '../world/types';
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
  rect(ctx, x - 4, y - 8, 8, 1, '#ff8a3d');
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
