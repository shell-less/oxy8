import { CONFIG } from '../config';
import { darknessAt, hourOf } from '../core/clock';
import { localPlayer, type GameState } from '../game/state';
import { stormIntensity } from '../systems/hazards';
import { paintGround, paintImpact } from './ground';
import { Particles } from './particles';
import { radialGlow, rect, type Ctx } from './pixels';
import { drawBeacon, drawBunker, drawCreeper, drawCrystal, drawPlayer, drawPounceMarker, drawScrap, drawSlideMarker, drawShip } from './sprites';

const VW = CONFIG.view.width;
const VH = CONFIG.view.height;

/** Draws the world at 320x180; CSS scales the canvas up with crisp pixels. */
export class Renderer {
  readonly particles = new Particles();
  private ground: HTMLCanvasElement | null = null;
  private groundFor: GameState['world'] | null = null;
  private light: HTMLCanvasElement;
  private lightCtx: Ctx;
  private shake = 0;
  private flash = 0;
  private camX = 0;
  private camY = 0;
  private emitTimer = 0;
  private smokeTimer = 0;
  /** Render time in seconds, drives all animations. */
  private t = 0;

  constructor(private ctx: Ctx) {
    this.light = document.createElement('canvas');
    this.light.width = VW;
    this.light.height = VH;
    this.lightCtx = this.light.getContext('2d')!;
  }

  /** Turns game events into effects. Returns the toast texts for the HUD. */
  consumeEvents(state: GameState): string[] {
    const toasts: string[] = [];
    for (const e of state.events) {
      switch (e.type) {
        case 'toast': toasts.push(e.text); break;
        case 'burst': this.particles.burst(e.x, e.y, e.color, e.count); break;
        case 'shake': this.shake = Math.max(this.shake, e.amount); break;
        case 'hurt': this.flash = 0.6; break;
        case 'crater': if (this.ground) paintImpact(this.ground, state.world.planet.theme, e.x, e.y); break;
      }
    }
    state.events.length = 0;
    return toasts;
  }

  update(state: GameState, dt: number): void {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.ambientParticles(state, dt);
    this.particles.update(dt);
  }

  draw(state: GameState): void {
    const { ctx, t } = this;
    const world = state.world;
    const theme = world.planet.theme;
    if (this.groundFor !== world) {
      this.ground = paintGround(world);
      this.groundFor = world;
      this.particles.clear();
    }
    const hour = hourOf(state.time);
    const darkness = darknessAt(hour);
    const p = localPlayer(state);

    let cx = p.x - VW / 2;
    let cy = p.y - VH / 2 - 8;
    if (this.shake > 0) {
      cx += (Math.random() - 0.5) * 8 * this.shake;
      cy += (Math.random() - 0.5) * 8 * this.shake;
    }
    cx = Math.round(Math.max(0, Math.min(world.width - VW, cx)));
    cy = Math.round(Math.max(0, Math.min(world.height - VH, cy)));
    this.camX = cx;
    this.camY = cy;

    ctx.drawImage(this.ground!, cx, cy, VW, VH, 0, 0, VW, VH);

    // Everything with height is sorted by its foot y, so things further down overlap things behind them.
    const onScreen = (x: number, y: number) => x > cx - 40 && x < cx + VW + 40 && y > cy - 40 && y < cy + VH + 40;
    const drawList: [number, () => void][] = [];
    for (const b of world.bunkers) if (onScreen(b.x, b.y)) drawList.push([b.y, () => drawBunker(ctx, b, b.x - cx, b.y - cy, t)]);
    const ship = world.ship;
    if (onScreen(ship.x, ship.y)) {
      drawList.push([ship.y, () => drawShip(ctx, ship.x - cx, ship.y - cy, t, world.planet.partsNeeded, p.partsInstalled)]);
    }
    for (const c of world.crystals) if (onScreen(c.x, c.y)) drawList.push([c.y, () => drawCrystal(ctx, c, c.x - cx, c.y - cy, t, theme)]);
    for (const s of world.scrap) if (!s.taken && onScreen(s.x, s.y)) drawList.push([s.y, () => drawScrap(ctx, s, s.x - cx, s.y - cy, t)]);
    for (const b of state.beacons) if (onScreen(b.x, b.y)) drawList.push([b.y, () => drawBeacon(ctx, b, Math.round(b.x - cx), Math.round(b.y - cy), t)]);
    for (const c of world.creepers) {
      if (onScreen(c.x, c.y)) drawList.push([c.y, () => drawCreeper(ctx, c, Math.round(c.x - cx), Math.round(c.y - cy), t, theme)]);
    }
    drawList.push([p.y, () => drawPlayer(ctx, p, Math.round(p.x - cx), Math.round(p.y - cy), t, p.lamp)]);
    drawList.sort((a, b) => a[0] - b[0]).forEach(([, draw]) => draw());

    this.particles.draw(ctx, cx, cy);
    this.drawProgress(state);
    if (darkness > 0.01) this.drawNight(state, darkness, onScreen);
    this.drawMeteorMarkers(state);
    // Warnings are drawn above the night layer: a fair game shows the danger even in the dark.
    for (const c of world.creepers) {
      if (c.jump && onScreen(c.jump.toX, c.jump.toY)) drawPounceMarker(ctx, c, Math.round(c.jump.toX - cx), Math.round(c.jump.toY - cy), t);
      if (c.slide && onScreen(c.x, c.y)) drawSlideMarker(ctx, c, Math.round(c.x - cx), Math.round(c.y - cy), t);
    }
    this.drawScreenEffects(state, hour, darkness);
  }

  private drawProgress(state: GameState): void {
    const me = localPlayer(state);
    const ia = me.interaction;
    if (ia.progress <= 0 || !ia.target) return;
    const anchor = ia.target.kind === 'ship' ? state.world.ship : ia.target.bunker;
    const x = anchor.x - this.camX;
    const y = anchor.y - (ia.target.kind === 'ship' ? 30 : 34) - this.camY;
    rect(this.ctx, x - 10, y, 20, 3, '#0b0a14');
    rect(this.ctx, x - 9, y + 1, Math.round(18 * ia.progress), 1, '#7dff8a');
  }

  /** Night: a dark layer with holes cut out for light sources, then additive glows on top. */
  private drawNight(state: GameState, darkness: number, onScreen: (x: number, y: number) => boolean): void {
    const { ctx, lightCtx: lx, camX: cx, camY: cy, t } = this;
    const world = state.world;
    const theme = world.planet.theme;
    const p = localPlayer(state);

    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, VW, VH);
    lx.fillStyle = `rgba(5,3,18,${darkness})`;
    lx.fillRect(0, 0, VW, VH);
    lx.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a: number) => {
      const g = lx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.6, `rgba(0,0,0,${a * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = g;
      lx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (p.lamp) hole(p.x - cx + p.facing * 6, p.y - cy - 8, 58 + Math.sin(t * 9) * 1.5, 1);
    else hole(p.x - cx, p.y - cy - 8, 20, 0.65);
    const litBunkers = world.bunkers.filter((b) => (b.kind === 'supply' || !b.looted) && onScreen(b.x, b.y));
    for (const b of litBunkers) hole(b.x - cx, b.y - cy - 12, 32, 0.8);
    hole(world.ship.x - cx, world.ship.y - cy - 10, 36, 0.7);
    for (const c of world.crystals) if (onScreen(c.x, c.y)) hole(c.x - cx, c.y - cy - 4, 16, 0.6);
    for (const pool of world.pools) if (onScreen(pool.x, pool.y)) hole(pool.x - cx, pool.y - cy, pool.rx, 0.35);
    ctx.drawImage(this.light, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    if (p.lamp) radialGlow(ctx, p.x - cx + p.facing * 10, p.y - cy - 8, 40, '255,230,170', 0.12 * darkness);
    for (const b of litBunkers) {
      radialGlow(ctx, b.x - cx, b.y - cy - 12, 22, b.kind === 'parts' ? '255,140,60' : '60,210,255', 0.35 * darkness);
    }
    for (const c of world.crystals) {
      if (onScreen(c.x, c.y)) radialGlow(ctx, c.x - cx, c.y - cy - 5, 12, theme.crystalGlow, (0.3 + 0.15 * Math.sin(t * 2 + c.phase)) * darkness);
    }
    for (const pool of world.pools) {
      if (onScreen(pool.x, pool.y)) radialGlow(ctx, pool.x - cx, pool.y - cy, pool.rx, '120,255,90', (0.14 + 0.05 * Math.sin(t * 2 + pool.x)) * darkness);
    }
    for (const b of state.beacons) {
      if (onScreen(b.x, b.y)) radialGlow(ctx, b.x - cx, b.y - cy - 10, 14, '255,48,80', (Math.sin(t * 5) > 0 ? 0.7 : 0.25) * darkness);
    }
    for (const c of world.creepers) {
      if (onScreen(c.x, c.y)) {
        const z = c.jump?.z ?? 0;
        radialGlow(ctx, c.x - cx + (c.facing > 0 ? 3 : -4), c.y - cy - 7 - z, c.mode === 'chase' ? 10 : 7, '255,40,70', 0.6 * darkness);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawMeteorMarkers(state: GameState): void {
    const { ctx, camX: cx, camY: cy, t } = this;
    const warn = CONFIG.hazards.meteor.warningSeconds;
    for (const m of state.hazards.meteors) {
      const x = m.x - cx;
      const y = m.y - cy;
      const r = 3 + (m.timeLeft / warn) * 11;
      ctx.strokeStyle = Math.sin(t * 20) > 0 ? '#ff5a2a' : '#ffd27a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (m.timeLeft < 0.6) {
        const k = m.timeLeft / 0.6;
        const hx = x + k * 50;
        const hy = y - k * 120;
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + 14, hy - 34);
        ctx.stroke();
        rect(ctx, hx - 1, hy - 1, 3, 3, '#fff6d8');
      }
    }
  }

  private drawScreenEffects(state: GameState, hour: number, darkness: number): void {
    const me = localPlayer(state);
    const { ctx, t } = this;
    const theme = state.world.planet.theme;
    const warm = Math.max(0, 1 - Math.abs(hour - 18.5) / 2.2, 1 - Math.abs(hour - 5.5) / 1.8);
    if (warm > 0) {
      ctx.fillStyle = `rgba(${theme.tint},${warm * 0.12})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    const storm = stormIntensity(state.hazards.storm);
    if (storm > 0) {
      ctx.fillStyle = `rgba(${theme.dustRgb},${storm * 0.42})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (theme.hazard === 'cold' && darkness > 0.2) {
      ctx.strokeStyle = `rgba(200,235,255,${0.3 * darkness})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, VW - 6, VH - 6);
    }
    const playing = state.status === 'playing';
    if (me.inPool && playing) {
      ctx.fillStyle = `rgba(120,255,90,${0.1 + 0.05 * Math.sin(t * 6)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,40,60,${this.flash * 0.3})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (me.oxygen < 25 && playing) {
      ctx.strokeStyle = `rgba(255,50,70,${((Math.sin(t * 6) + 1) / 2) * 0.6})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, VW - 3, VH - 3);
    }
  }

  /** Blowing dust, ship smoke, footsteps, suit leaks, pool bubbles and storm streaks. */
  private ambientParticles(state: GameState, dt: number): void {
    const P = this.particles;
    const theme = state.world.planet.theme;
    const p = localPlayer(state);
    const { camX: cx, camY: cy } = this;
    if (Math.random() < 0.35) P.spawn(cx + Math.random() * VW - 20, cy + Math.random() * VH, 16 + Math.random() * 10, 2, 1.6, theme.dust);
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.25;
      const s = state.world.ship;
      P.spawn(s.x - 24, s.y - 12, -4 - Math.random() * 4, -8 - Math.random() * 6, 1.6, '#6d6670', 2);
    }
    for (const pool of state.world.pools) {
      if (pool.x > cx - 50 && pool.x < cx + VW + 50 && pool.y > cy - 50 && pool.y < cy + VH + 50 && Math.random() < 0.08) {
        P.spawn(pool.x + (Math.random() - 0.5) * pool.rx * 1.4, pool.y + (Math.random() - 0.5) * pool.ry * 1.4, 0, -7, 0.8, '#9cff6a');
      }
    }
    if (state.status !== 'playing') return;
    if (p.moving) {
      this.emitTimer -= dt;
      if (this.emitTimer <= 0) {
        this.emitTimer = 0.14;
        P.spawn(p.x + (Math.random() - 0.5) * 4, p.y, (Math.random() - 0.5) * 6, -Math.random() * 6, 0.5, theme.footprint);
      }
    }
    if (p.leak > 0 && Math.random() < 0.6) {
      P.spawn(p.x - p.facing * 5, p.y - 9, -p.facing * (10 + Math.random() * 20), (Math.random() - 0.5) * 14 - 6, 0.6, '#dff6ff');
    }
    if (p.inPool && Math.random() < 0.3) {
      P.spawn(p.x + (Math.random() - 0.5) * 6, p.y - 10, (Math.random() - 0.5) * 8, -10, 0.7, '#9cff6a');
    }
    const storm = stormIntensity(state.hazards.storm);
    for (let i = 0; i < storm * 5; i++) {
      P.spawn(cx - 20 + Math.random() * VW, cy + Math.random() * VH, 110 + Math.random() * 70, 8 + Math.random() * 8, 2.8, theme.dust);
    }
  }
}
