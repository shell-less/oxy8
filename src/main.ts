import './style.css';
import { CONFIG } from './config';
import { Keyboard } from './core/input';
import { hasNextPlanet, landOn, type GameState } from './game/state';
import { step } from './game/update';
import { Hud } from './render/hud';
import { Minimap } from './render/minimap';
import { Renderer } from './render/renderer';
import { PLANETS } from './world/planets';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = byId<HTMLCanvasElement>('screen');
const overlay = byId<HTMLDivElement>('overlay');
const renderer = new Renderer(canvas.getContext('2d')!);
const minimap = new Minimap(byId<HTMLCanvasElement>('minimap'));
const hud = new Hud();
const keyboard = new Keyboard();

const params = new URLSearchParams(location.search);
const debug = import.meta.env.DEV || params.has('debug');
const requested = Number(params.get('planet')) || 1;
/** In debug mode ?planet=2 starts on the second planet. */
const startPlanet = debug ? Math.min(PLANETS.length - 1, Math.max(0, requested - 1)) : 0;

let state: GameState = landOn(startPlanet);
/** Energy on arrival, so a retry after dying starts from the same point. */
let arrivalEnergy = state.energy;
let running = false;
/** What clicking the overlay does next. */
let onContinue: () => void = () => start();

function showOverlay(title: string, hazard: string, sub: string, next: () => void): void {
  byId('overlay-title').textContent = title;
  byId('overlay-hazard').textContent = hazard;
  byId('overlay-sub').textContent = sub;
  overlay.hidden = false;
  running = false;
  onContinue = next;
}

function briefing(): void {
  const planet = state.world.planet;
  showOverlay(
    `Planeet ${state.planetIndex + 1} · ${planet.name}`,
    `${planet.theme.hazardName}: ${planet.theme.hazardDescription}`,
    `Vind ${planet.partsNeeded} scheepsonderdelen. Klik om te landen.`,
    start,
  );
}

function start(): void {
  overlay.hidden = true;
  running = true;
  hud.showToast(`Geland op ${state.world.planet.name}. Let op: ${state.world.planet.theme.hazardName.toLowerCase()}`);
  canvas.focus();
}

function travelTo(index: number, energy: number): void {
  state = landOn(index, { energy });
  arrivalEnergy = energy;
  briefing();
}

function checkStatus(): void {
  if (state.status === 'dead') {
    showOverlay('Zuurstof op', '', 'Je pak is leeg. Klik om opnieuw te landen.', () => {
      travelTo(state.planetIndex, arrivalEnergy);
      start();
    });
  } else if (state.status === 'launched') {
    if (hasNextPlanet(state)) {
      const next = PLANETS[state.planetIndex + 1];
      const energy = state.energy;
      showOverlay('Schip gerepareerd', '', `Op naar ${next.name}. Klik om verder te gaan.`, () => travelTo(state.planetIndex + 1, energy));
    } else {
      showOverlay('Ontsnapt', '', 'Je hebt alle planeten gehaald. Klik om opnieuw te beginnen.', () => travelTo(0, CONFIG.player.startEnergy));
    }
  }
}

overlay.addEventListener('click', () => onContinue());
window.addEventListener('keydown', (e) => {
  if (!overlay.hidden && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    onContinue();
  }
});

if (debug) {
  byId('debug').hidden = false;
  const timeBtn = byId<HTMLButtonElement>('dbg-time');
  timeBtn.addEventListener('click', () => {
    state.timeScale = state.timeScale === 1 ? 20 : 1;
    timeBtn.textContent = state.timeScale === 1 ? 'Tijd x20' : 'Tijd normaal';
    canvas.focus();
  });
  byId('dbg-next').addEventListener('click', () => {
    travelTo((state.planetIndex + 1) % PLANETS.length, state.energy);
    timeBtn.textContent = 'Tijd x20';
  });
}

briefing();

let last = performance.now();
let t = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  const input = keyboard.poll();
  if (running) {
    step(state, input, dt);
    checkStatus();
  }
  for (const text of renderer.consumeEvents(state)) hud.showToast(text);
  renderer.update(state, dt);
  renderer.draw(state);
  hud.update(state, dt, t);
  minimap.update(state, dt, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
