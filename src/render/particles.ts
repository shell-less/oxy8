import type { Ctx } from './pixels';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/** Purely visual particles in world coordinates. Not deterministic on purpose: they never affect gameplay. */
export class Particles {
  private list: Particle[] = [];

  spawn(x: number, y: number, vx: number, vy: number, life: number, color: string, size = 1): void {
    this.list.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }

  burst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 35;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - 10, 0.5 + Math.random() * 0.5, color);
    }
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: Ctx, camX: number, camY: number): void {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.list = [];
  }
}
