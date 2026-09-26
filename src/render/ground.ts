import { createRng, deriveSeed } from '../core/rng';
import type { Theme } from '../world/themes';
import type { World } from '../world/types';
import { disc } from './pixels';

/**
 * Paints the static ground of a planet once into an offscreen canvas: dithered noise,
 * craters, pebbles, pools and rocks. Uses its own seed, so decoration never shifts gameplay.
 */
export function paintGround(world: World): HTMLCanvasElement {
  const { width, height } = world;
  const theme = world.planet.theme;
  const rng = createRng(deriveSeed(world.planet.seed, 3));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;

  // Smooth value noise with per-pixel jitter, quantised to five shades.
  const scale = theme.noiseScale;
  const gw = Math.ceil(width / scale) + 2;
  const gh = Math.ceil(height / scale) + 2;
  const grid: number[] = [];
  for (let i = 0; i < gw * gh; i++) grid.push(rng.next());
  const img = g.createImageData(width, height);
  const d = img.data;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    const gy = y / scale;
    const y0 = Math.floor(gy);
    const sy = smooth(gy - y0);
    for (let x = 0; x < width; x++) {
      const gx = x / scale;
      const x0 = Math.floor(gx);
      const sx = smooth(gx - x0);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0];
      const e = grid[(y0 + 1) * gw + x0 + 1];
      let v = (a + (b - a) * sx) * (1 - sy) + (c + (e - c) * sx) * sy;
      v = (v - 0.5) * 1.8 + 0.5 + (rng.next() - 0.5) * 0.22;
      const shade = theme.ground[Math.max(0, Math.min(4, Math.floor(v * 5)))];
      const q = (y * width + x) * 4;
      d[q] = shade[0];
      d[q + 1] = shade[1];
      d[q + 2] = shade[2];
      d[q + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  for (let i = 0; i < theme.craterCount; i++) {
    paintCraterAt(g, theme, rng.next() * width, rng.next() * height, rng.int(6, 19));
  }
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = rng.chance(0.5) ? theme.pebbles[0] : theme.pebbles[1];
    g.fillRect(Math.floor(rng.next() * width), Math.floor(rng.next() * height), 1 + rng.int(0, 1), 1);
  }

  for (const p of world.pools) {
    disc(g, p.x, p.y, p.rx + 2, '#16300f', 0.6);
    disc(g, p.x, p.y, p.rx, '#2c7420', 0.6);
    disc(g, p.x - 2, p.y - 1, Math.max(3, p.rx - 6), '#44a42e', 0.6);
    g.fillStyle = '#8ef060';
    for (let j = 0; j < 6; j++) g.fillRect(p.x + (rng.next() - 0.5) * p.rx, p.y + (rng.next() - 0.5) * p.ry * 0.8, 2, 1);
  }

  for (const r of world.rocks) {
    disc(g, r.x + 2, r.y + 2, r.r, 'rgba(5,4,12,.45)', 0.75);
    disc(g, r.x, r.y, r.r, theme.rock[0], 0.75);
    disc(g, r.x - 1, r.y - 1, Math.max(1, r.r - 2), theme.rock[1], 0.75);
    disc(g, r.x - 2, r.y - 2, Math.max(1, r.r - 5), theme.rock[2], 0.75);
  }
  return canvas;
}

function paintCraterAt(g: CanvasRenderingContext2D, theme: Theme, x: number, y: number, r: number): void {
  disc(g, x - 1, y - 1, r, theme.crater[0], 0.7);
  disc(g, x, y, r - 1, theme.crater[1], 0.7);
  disc(g, x + 1, y + 1, Math.max(2, r - 4), theme.crater[2], 0.7);
}

/** A small scorch left behind by a meteor impact. */
export function paintImpact(ground: HTMLCanvasElement, theme: Theme, x: number, y: number): void {
  const g = ground.getContext('2d')!;
  disc(g, x, y, 5, theme.crater[1], 0.7);
  disc(g, x + 1, y + 1, 3, theme.crater[2], 0.7);
}
