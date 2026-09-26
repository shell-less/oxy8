import { CONFIG } from '../config';
import type { GameState } from '../game/state';

/** One pixel per tile. Only explored tiles and the bunkers on them are shown. */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private timer = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CONFIG.world.tilesX;
    canvas.height = CONFIG.world.tilesY;
    this.ctx = canvas.getContext('2d')!;
  }

  /** Redraws a few times per second; the blinking player dot uses render time t. */
  update(state: GameState, dt: number, t: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15;
    const { tilesX: W, tilesY: H, tileSize: T } = CONFIG.world;
    const ctx = this.ctx;
    const world = state.world;
    const explored = (x: number, y: number) => state.explored[Math.floor(y / T) * W + Math.floor(x / T)] === 1;

    ctx.fillStyle = '#07060f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = world.planet.theme.minimap;
    for (let i = 0; i < W * H; i++) if (state.explored[i]) ctx.fillRect(i % W, Math.floor(i / W), 1, 1);

    ctx.fillStyle = '#3f9a2c';
    for (const p of world.pools) {
      if (explored(p.x, p.y)) ctx.fillRect(Math.floor(p.x / T) - 1, Math.floor(p.y / T) - 1, Math.max(2, Math.floor((p.rx / T) * 2)), 2);
    }
    ctx.fillStyle = '#b8c0c8';
    for (const s of world.scrap) {
      if (!s.taken && explored(s.x, s.y)) ctx.fillRect(Math.floor(s.x / T), Math.floor(s.y / T), 1, 1);
    }
    for (const b of world.bunkers) {
      if (!explored(b.x, b.y)) continue;
      ctx.fillStyle = b.kind === 'parts' ? (b.looted ? '#6a4a30' : '#ff9a3c') : '#43d6ff';
      ctx.fillRect(Math.floor(b.x / T) - 1, Math.floor(b.y / T) - 1, 2, 2);
    }
    ctx.fillStyle = '#e6eaee';
    ctx.fillRect(Math.floor(world.ship.x / T) - 1, Math.floor(world.ship.y / T) - 1, 3, 2);
    if (Math.sin(t * 8) > -0.5) {
      ctx.fillStyle = '#7dff8a';
      ctx.fillRect(Math.floor(state.player.x / T), Math.floor(state.player.y / T), 1, 1);
    }
  }
}
