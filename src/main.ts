import './style.css';
import { Keyboard } from './core/input';
import { unlockIfRepaired } from './game/campaign';
import { craft } from './game/crafting';
import { clearSave, fromSaveData, readSave, toSaveData, writeSave, type SaveData } from './game/save';
import { landOn, type GameState } from './game/state';
import { travel, type Destination } from './game/travel';
import { step } from './game/update';
import { SoundBoard } from './render/audio';
import { Hud } from './render/hud';
import { Minimap } from './render/minimap';
import { Renderer } from './render/renderer';
import { StarMap } from './render/starmap';
import { Tips } from './render/tips';
import { PLANETS } from './world/planets';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = byId<HTMLCanvasElement>('screen');
const overlay = byId<HTMLDivElement>('overlay');
const renderer = new Renderer(canvas.getContext('2d')!);
const minimap = new Minimap(byId<HTMLCanvasElement>('minimap'));
const hud = new Hud();
const keyboard = new Keyboard();
const starMap = new StarMap(pickDestination, resume, (id) => {
  const result = craft(state, id);
  if (!result.ok) hud.showToast(result.note);
  else save();
  starMap.open(state);
});
const tips = new Tips();
const sound = new SoundBoard();
// Browsers only allow audio after the player did something.
window.addEventListener('pointerdown', () => sound.unlock());
window.addEventListener('keydown', () => sound.unlock());

const params = new URLSearchParams(location.search);
const debug = import.meta.env.DEV || params.has('debug');

let state: GameState = landOn(0);
/** Snapshot taken on landing. Dying rolls back to it. */
let checkpoint: SaveData = toSaveData(state);
let running = false;
/** The primary overlay button; Enter and Space press it. */
let primaryAction: (() => void) | null = null;

interface OverlayButton { label: string; action: () => void }

function showOverlay(title: string, hazard: string, sub: string, buttons: OverlayButton[]): void {
  byId('overlay-title').textContent = title;
  byId('overlay-hazard').textContent = hazard;
  byId('overlay-sub').textContent = sub;
  const actions = byId('overlay-actions');
  actions.replaceChildren(...buttons.map((b, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = i === 0 ? 'btn primary' : 'btn';
    el.textContent = b.label;
    el.addEventListener('click', b.action);
    return el;
  }));
  primaryAction = buttons[0]?.action ?? null;
  overlay.hidden = false;
  running = false;
}

function hideOverlay(): void {
  overlay.hidden = true;
  primaryAction = null;
}

function save(): void {
  writeSave({ live: toSaveData(state), checkpoint });
}

/** Briefing before walking out of the ship. Shows the hazard on a first visit. */
function briefing(): void {
  const planet = state.world.planet;
  const firstVisit = state.campaign.planets[state.planetIndex] === null;
  const sub = state.partsInstalled >= planet.partsNeeded
    ? 'De motor is hier al gerepareerd.'
    : `Vind ${planet.partsNeeded - state.partsInstalled} scheepsonderdelen voor een sterkere motor.`;
  showOverlay(
    `Planeet ${state.planetIndex + 1} · ${planet.name}`,
    `${planet.theme.hazardName}: ${planet.theme.hazardDescription}`,
    firstVisit ? sub : `Terug op ${planet.name}. ${sub}`,
    [{ label: 'Landen', action: start }],
  );
}

function start(): void {
  hideOverlay();
  running = true;
  tips.landed();
  const planet = state.world.planet;
  hud.showToast(`Geland op ${planet.name}. Let op: ${planet.theme.hazardName.toLowerCase()}`);
  canvas.focus();
}

function resume(): void {
  running = true;
  canvas.focus();
}

/** Makes the given state current, as a fresh landing: new checkpoint, saved. */
function arrive(next: GameState): void {
  state = next;
  checkpoint = toSaveData(state);
  save();
  briefing();
}

function pickDestination(index: number, row: Destination): void {
  const result = travel(state, index);
  if (!result.ok) {
    hud.showToast(row.note || result.reason);
    return;
  }
  starMap.hide();
  sound.play('launch');
  if (result.state.status === 'escaped') {
    state = result.state;
    clearSave();
    showOverlay('Thuis', '', 'Je motor bracht je helemaal naar huis. Je bent ontsnapt.', [{ label: 'Nieuw spel', action: newGame }]);
    return;
  }
  arrive(result.state);
}

function newGame(): void {
  clearSave();
  arrive(landOn(0));
}

function confirmNewGame(): void {
  showOverlay('Nieuw spel', '', 'Je huidige voortgang gaat verloren.', [
    { label: 'Nieuw spel starten', action: newGame },
    { label: 'Terug', action: title },
  ]);
}

/** Title screen: continue a saved game, start a new one, switch tips on or off. */
function title(): void {
  const saved = readSave();
  const soundButton: OverlayButton = {
    label: sound.muted ? 'Geluid: uit' : 'Geluid: aan',
    action: () => {
      sound.setMuted(!sound.muted);
      title();
    },
  };
  const tipsButton: OverlayButton = {
    label: tips.enabled ? 'Tips: aan' : 'Tips: uit',
    action: () => {
      tips.setEnabled(!tips.enabled);
      title();
    },
  };
  if (!saved) {
    showOverlay('Oxy8', '', 'Je bent neergestort. Houd je zuurstof op peil en repareer je schip.', [
      { label: 'Nieuw spel', action: newGame },
      tipsButton,
      soundButton,
    ]);
    return;
  }
  const planet = PLANETS[saved.live.planetIndex];
  showOverlay('Oxy8', '', `Opgeslagen spel op ${planet.name}.`, [
    { label: 'Verder spelen', action: () => {
      checkpoint = saved.checkpoint;
      state = fromSaveData(saved.live);
      briefing();
    } },
    { label: 'Nieuw spel', action: confirmNewGame },
    tipsButton,
    soundButton,
  ]);
}

function onDeath(): void {
  showOverlay('Zuurstof op', '', `Je pak is leeg. Je begint opnieuw op ${state.world.planet.name}, zoals je hier landde.`, [
    { label: 'Opnieuw landen', action: () => {
      state = fromSaveData(checkpoint);
      save();
      start();
    } },
  ]);
}

function onStranded(): void {
  clearSave();
  showOverlay(
    'Gestrand',
    '',
    `Je energie is op en op ${state.world.planet.name} liggen geen energiecellen meer. Je schip komt hier niet meer weg.`,
    [{ label: 'Nieuw spel', action: newGame }],
  );
}

/** Handles events meant for the app rather than the renderer. */
function handleAppEvents(): void {
  let progressed = false;
  let openMap = false;
  for (const e of state.events) {
    if (e.type === 'progress') progressed = true;
    if (e.type === 'starmap') openMap = true;
  }
  if (progressed) save();
  if (openMap) {
    running = false;
    starMap.open(state);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) {
    sound.setMuted(!sound.muted);
    hud.showToast(sound.muted ? 'Geluid uit' : 'Geluid aan');
    return;
  }
  if (!overlay.hidden && primaryAction && (e.code === 'Enter' || e.code === 'Space')) {
    // Let a focused button handle its own activation.
    if (document.activeElement instanceof HTMLButtonElement) return;
    e.preventDefault();
    primaryAction();
  }
});

if (debug) {
  byId('debug').hidden = false;
  // For poking around in the browser console: oxy8.state()
  Object.assign(window, { oxy8: { state: () => state } });
  const timeBtn = byId<HTMLButtonElement>('dbg-time');
  timeBtn.addEventListener('click', () => {
    state.timeScale = state.timeScale === 1 ? 20 : 1;
    timeBtn.textContent = state.timeScale === 1 ? 'Tijd x20' : 'Tijd normaal';
    canvas.focus();
  });
  byId('dbg-repair').addEventListener('click', () => {
    state.partsCarried = state.partsInstalled = state.world.planet.partsNeeded;
    unlockIfRepaired(state);
    save();
    hud.showToast('Debug: motor gerepareerd');
    canvas.focus();
  });
  byId('dbg-energy').addEventListener('click', () => {
    state.energy = Math.min(100, state.energy + 50);
    canvas.focus();
  });
  byId('dbg-tips').addEventListener('click', () => {
    tips.reset();
    hud.showToast('Debug: tips worden opnieuw getoond');
    canvas.focus();
  });
}

title();

let last = performance.now();
let t = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  const input = keyboard.poll();
  if (running) {
    step(state, input, dt);
    handleAppEvents();
    if (state.status === 'dead') onDeath();
    else if (state.status === 'stranded') onStranded();
  }
  tips.update(state, dt, running);
  sound.handle(state.events);
  sound.update(state, dt, running);
  for (const text of renderer.consumeEvents(state)) hud.showToast(text);
  renderer.update(state, dt);
  renderer.draw(state);
  hud.update(state, dt, t);
  minimap.update(state, dt, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
