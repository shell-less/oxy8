import { CONFIG } from '../config';
import type { Theme } from '../world/themes';
import { rect, type Ctx } from './pixels';

const VW = CONFIG.view.width;
const VH = CONFIG.view.height;

/** 5x7 pixel glyphs for the logo. '#' is a filled pixel. */
const GLYPHS: Record<string, string[]> = {
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
};

interface Star { x: number; y: number; depth: number; phase: number }

/**
 * The title scene: a starfield drifting past, a big planet rising at the bottom,
 * the ship crossing now and then, and the pixel logo. Pure decoration.
 */
export class TitleScene {
  private stars: Star[] = [];
  private t = 0;
  private planet: HTMLCanvasElement | null = null;
  private planetTheme: Theme | null = null;

  constructor(private ctx: Ctx) {
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random() * VW, y: Math.random() * VH, depth: 0.2 + Math.random() * 0.8, phase: Math.random() * 6.28 });
    }
  }

  draw(dt: number, theme: Theme): void {
    this.t += dt;
    const { ctx, t } = this;
    ctx.fillStyle = '#05040c';
    ctx.fillRect(0, 0, VW, VH);

    for (const s of this.stars) {
      s.x -= dt * 6 * s.depth;
      if (s.x < 0) s.x += VW;
      const twinkle = Math.sin(t * 2 + s.phase) > 0.7;
      const c = s.depth > 0.7 ? '#e6f6ff' : s.depth > 0.4 ? '#8a94b8' : '#4a4e70';
      rect(ctx, s.x, s.y, 1, 1, twinkle ? '#ffffff' : c);
    }

    this.drawPlanet(theme);
    this.drawShip();
    this.drawLogo();
  }

  /** A large dithered planet whose top edge rises into view at the bottom of the screen. */
  private drawPlanet(theme: Theme): void {
    if (this.planetTheme !== theme) {
      this.planet = paintPlanet(theme);
      this.planetTheme = theme;
    }
    const rise = Math.min(1, this.t / 2.5);
    const eased = 1 - (1 - rise) ** 3;
    const y = Math.round(VH + 10 - eased * 70);
    this.ctx.drawImage(this.planet!, Math.round(VW / 2 - this.planet!.width / 2), y);
  }

  /** The player's ship drifts across every few seconds, trailing exhaust. */
  private drawShip(): void {
    const { ctx, t } = this;
    const period = 11;
    const k = (t % period) / period;
    if (k > 0.55) return;
    const x = Math.round(-40 + (k / 0.55) * (VW + 80));
    const y = Math.round(78 + Math.sin(t * 1.3) * 3);
    for (let i = 1; i < 8; i++) {
      if (Math.sin(t * 30 + i) > -0.3) rect(ctx, x - 12 - i * 3, y - 1 + ((i * 7) % 3) - 1, 2, 1, i < 3 ? '#ffd24a' : '#ff8a3d');
    }
    rect(ctx, x - 10, y - 4, 18, 7, '#c7ccd2');
    rect(ctx, x - 10, y - 4, 18, 1, '#e6eaee');
    rect(ctx, x + 8, y - 3, 3, 5, '#aab0b8');
    rect(ctx, x + 3, y - 3, 4, 3, '#3fd0ff');
    rect(ctx, x - 12, y - 6, 5, 2, '#ff8a3d');
    rect(ctx, x - 12, y + 3, 5, 2, '#ff8a3d');
  }

  private drawLogo(): void {
    const { ctx, t } = this;
    const text = 'OXY8';
    const scale = 4;
    const gap = 2;
    const width = text.length * (5 * scale) + (text.length - 1) * gap * scale;
    const x0 = Math.round(VW / 2 - width / 2);
    const y0 = 14 + Math.round(Math.sin(t * 1.6) * 1.5);
    [...text].forEach((ch, i) => {
      const glyph = GLYPHS[ch];
      const gx = x0 + i * (5 + gap) * scale;
      glyph.forEach((row, ry) => {
        [...row].forEach((cell, rx) => {
          if (cell !== '#') return;
          const px = gx + rx * scale;
          const py = y0 + ry * scale;
          rect(ctx, px + 1, py + 1, scale, scale, '#1a1030');
          const top = ry < 2 ? '#bff3ff' : ry < 5 ? '#4fd8ff' : '#1c8fc4';
          rect(ctx, px, py, scale, scale, ch === '8' ? (ry < 3 ? '#ffe9a0' : '#ffd24a') : top);
        });
      });
    });
  }
}

function paintPlanet(theme: Theme): HTMLCanvasElement {
  const r = 150;
  const canvas = document.createElement('canvas');
  canvas.width = r * 2;
  canvas.height = r * 2;
  const g = canvas.getContext('2d')!;
  const shades = theme.ground;
  for (let y = 0; y < r * 2; y++) {
    for (let x = 0; x < r * 2; x++) {
      const dx = x - r;
      const dy = y - r;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      // Light from the top left, with ordered dithering between shades.
      const light = 0.5 - (dx + dy) / (r * 3.2) - (d / r) ** 4 * 0.35;
      const dither = ((x & 1) ^ (y & 1)) * 0.08 - 0.04;
      const k = Math.max(0, Math.min(4, Math.floor((light + dither) * 5)));
      const [cr, cg, cb] = shades[k];
      g.fillStyle = `rgb(${cr},${cg},${cb})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  // Rim light.
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(r, r, r - 1, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  return canvas;
}
