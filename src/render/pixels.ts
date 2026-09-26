export type Ctx = CanvasRenderingContext2D;

/** Filled rectangle snapped to whole pixels. */
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Pixel-art ellipse built from horizontal lines. squashY < 1 flattens it for the top-down look. */
export function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string, squashY: number): void {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + dy * squashY), w * 2 + 1, 1);
  }
}

export function radialGlow(ctx: Ctx, x: number, y: number, r: number, rgb: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
