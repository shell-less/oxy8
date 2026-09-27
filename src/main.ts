import { CONFIG } from './config';
import './style.css';
import { darknessAt, formatClock, hourOf } from './core/clock';
import { Keyboard, mergeInput } from './core/input';
import { unlockIfRepaired } from './game/campaign';
import { craft } from './game/crafting';
import { clearSave, fromSaveData, readSave, toSaveData, writeSave, type SaveData } from './game/save';
import { landOn, type GameState } from './game/state';
import { travel, type Destination } from './game/travel';
import { step } from './game/update';
import { SoundBoard } from './render/audio';
import { Music } from './render/music';
import { Hud } from './render/hud';
import { Minimap } from './render/minimap';
import { Renderer } from './render/renderer';
import { StarMap } from './render/starmap';
import { TitleScene } from './render/title';
import { Tips } from './render/tips';
import { InputMode, TouchControls } from './render/touch';
import { PLANETS } from './world/planets';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = byId<HTMLCanvasElement>('screen');
const overlay = byId<HTMLDivElement>('overlay');
const renderer = new Renderer(canvas.getContext('2d')!);
const titleScene = new TitleScene(canvas.getContext('2d')!);
const gameEl = byId<HTMLDivElement>('game');
const minimap = new Minimap(byId<HTMLCanvasElement>('minimap'));
const hud = new Hud();
hud.restoreKeysVisible();
const keyboard = new Keyboard();
const starMap = new StarMap(pickDestination, resume, (id) => {
  const result = craft(state, id);
  if (!result.ok) hud.showToast(result.note);
  else save();
  starMap.open(state);
});
const tips = new Tips();
const inputMode = new InputMode();
const touch = new TouchControls(gameEl, () => { if (running) pauseMenu(); });
hud.touch = tips.touch = inputMode.touch;
inputMode.onChange((isTouch) => {
  hud.touch = tips.touch = isTouch;
  if (splash) byId('overlay-sub').textContent = splashText();
});
const portrait = matchMedia('(orientation: portrait)');
const sound = new SoundBoard();
const music = new Music();
// Browsers only allow audio after the player did something.
window.addEventListener('pointerdown', () => sound.unlock());
window.addEventListener('keydown', () => sound.unlock());

const params = new URLSearchParams(location.search);
const debug = import.meta.env.DEV || params.has('debug');

let state: GameState = landOn(0);
/** Snapshot taken on landing. Dying rolls back to it. */
let checkpoint: SaveData = toSaveData(state);
let running = false;
/** While true the animated title scene is drawn instead of the world, and the HUD is hidden. */
let titleMode = false;
let titleTheme = PLANETS[0].theme;
/** The primary overlay button; Enter and Space press it. */
let primaryAction: (() => void) | null = null;

interface OverlayButton { label: string; action: () => void }

function setTitleMode(on: boolean): void {
  titleMode = on;
  gameEl.classList.toggle('title-mode', on);
}

function showOverlay(title: string, hazard: string, sub: string, buttons: OverlayButton[]): void {
  setTitleMode(false);
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
  music.setMood(planet.theme.id);
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

/** True while the opening "press a key" screen is up. It exists so the title music can start. */
let splash = false;

/**
 * The opening screen. Browsers only allow sound after the player did something, so the title
 * asks for one click or key first; the title menu then appears with its music already playing.
 */
function openingScreen(): void {
  const saved = readSave();
  showOverlay('Oxy8', '', splashText(), []);
  titleTheme = saved ? PLANETS[saved.live.planetIndex].theme : PLANETS[0].theme;
  setTitleMode(true);
  gameEl.classList.add('splash');
  splash = true;
}

function splashText(): string {
  return inputMode.touch ? 'Tik om te beginnen.' : 'Klik of druk op een toets om te beginnen.';
}

function leaveSplash(): void {
  if (!splash) return;
  splash = false;
  gameEl.classList.remove('splash');
  sound.unlock();
  if (inputMode.touch) goFullscreen();
  title();
}

/** On phones, use the whole screen and keep it in landscape where the browser allows it. */
function goFullscreen(): void {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {
      // Not supported (iPhone Safari) or refused: the game still fits the screen.
    });
}

/** Pause menu, opened with the pause button on touch screens or P on a keyboard. */
function pauseMenu(): void {
  const toggle = (label: string, on: boolean, flip: () => void): OverlayButton => ({
    label: `${label}: ${on ? 'aan' : 'uit'}`,
    action: () => {
      flip();
      pauseMenu();
    },
  });
  showOverlay('Pauze', '', `${state.world.planet.name} · ${formatClock(state.time)}`, [
    { label: 'Verder', action: () => {
      hideOverlay();
      resume();
    } },
    toggle('Geluid', !sound.muted, () => sound.setMuted(!sound.muted)),
    toggle('Muziek', music.enabled, () => music.setEnabled(!music.enabled)),
    toggle('Tips', tips.enabled, () => tips.setEnabled(!tips.enabled)),
  ]);
}

/** Title screen: continue a saved game, start a new one, switch tips on or off. */
function title(): void {
  const saved = readSave();
  music.setMood('title');
  const musicButton: OverlayButton = {
    label: music.enabled ? 'Muziek: aan' : 'Muziek: uit',
    action: () => {
      music.setEnabled(!music.enabled);
      title();
    },
  };
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
      musicButton,
    ]);
    titleTheme = PLANETS[0].theme;
    setTitleMode(true);
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
    musicButton,
  ]);
  titleTheme = planet.theme;
  setTitleMode(true);
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

// A click (not pointerdown) leaves the opening screen, so the same click cannot land on a title button.
window.addEventListener('click', leaveSplash);

window.addEventListener('keydown', (e) => {
  if (splash) {
    if (e.repeat) return;
    e.preventDefault();
    leaveSplash();
    return;
  }
  if (e.code === 'KeyP' && !e.repeat && running) {
    pauseMenu();
    return;
  }
  if (e.code === 'KeyH' && !e.repeat) {
    hud.setKeysVisible(!hud.keysVisible);
    return;
  }
  if (e.code === 'KeyN' && !e.repeat) {
    music.setEnabled(!music.enabled);
    hud.showToast(music.enabled ? 'Muziek aan' : 'Muziek uit');
    return;
  }
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
  Object.assign(window, { oxy8: { state: () => state, sound, music } });
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

openingScreen();

let last = performance.now();
let t = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  // Turning a phone upright pauses the game; the page asks to turn it back.
  if (running && inputMode.touch && portrait.matches) pauseMenu();
  touch.setActive(running && inputMode.touch);
  const input = mergeInput(keyboard.poll(), touch.poll());
  if (running) {
    step(state, input, dt);
    handleAppEvents();
    if (state.status === 'dead') onDeath();
    else if (state.status === 'stranded') onStranded();
  }
  tips.update(state, dt, running);
  sound.handle(state.events);
  sound.update(state, dt, running);
  const out = sound.output();
  if (out) music.attach(out.ctx, out.master);
  music.update(titleMode ? 0 : darknessAt(hourOf(state.time)) / CONFIG.day.maxDarkness, !running && !titleMode);
  for (const text of renderer.consumeEvents(state)) hud.showToast(text);
  renderer.update(state, dt);
  if (titleMode) titleScene.draw(dt, titleTheme);
  else renderer.draw(state);
  hud.update(state, dt, t);
  touch.update(state);
  minimap.update(state, dt, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
