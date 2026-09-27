import { CONFIG } from './config';
import './style.css';
import { darknessAt, formatClock, hourOf } from './core/clock';
import { mergeInput, NO_INPUT } from './core/input';
import { Keyboard } from './render/keyboard';
import { unlockIfRepaired } from './game/campaign';
import { craft } from './game/crafting';
import { clearSave, fromSaveData, readSave, toSaveData, writeSave, type SaveData } from './game/save';
import { landOn, localPlayer, startRace, type GameState, type RaceResult } from './game/state';
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
import { normaliseRoomCode } from './net/codes';
import { OnlineRace, type OnlineEvents } from './online/connection';

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
  if (online) {
    // The server crafts; the workbench shows the result once the next snapshot is in.
    online.craft(id);
    setTimeout(() => { if (starMap.isOpen) starMap.open(state); }, 250);
    return;
  }
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
/** Race mode is still being built: only in development, with ?debug, or with ?race in the address. */
const raceAvailable = debug || params.has('race');

let state: GameState = landOn(0);
/** The connection while in a network race; null otherwise. */
let online: OnlineRace | null = null;
/** Snapshot taken on landing. Dying rolls back to it. */
let checkpoint: SaveData = toSaveData(state);
let running = false;
/** While true the animated title scene is drawn instead of the world, and the HUD is hidden. */
let titleMode = false;
let titleTheme = PLANETS[0].theme;
/** The primary overlay button; Enter and Space press it. */
let primaryAction: (() => void) | null = null;

interface OverlayButton { label: string; action: () => void }

function setTitleMode(on: boolean, lobby = false): void {
  titleMode = on;
  gameEl.classList.toggle('title-mode', on);
  gameEl.classList.toggle('lobby', on && lobby);
}

/** Shows a dialog. `input` adds a text field (a room code) with that placeholder; read it with overlayInput(). */
function showOverlay(title: string, hazard: string, sub: string, buttons: OverlayButton[], input?: string): void {
  setTitleMode(false);
  const field = byId<HTMLInputElement>('overlay-input');
  field.hidden = input === undefined;
  field.placeholder = input ?? '';
  field.value = '';
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
  if (input !== undefined) field.focus();
}

function overlayInput(): string {
  return byId<HTMLInputElement>('overlay-input').value;
}

function hideOverlay(): void {
  overlay.hidden = true;
  primaryAction = null;
}

function save(): void {
  // Race mode has no campaign to save, and must not overwrite the solo save.
  if (state.mode === 'race') return;
  writeSave({ live: toSaveData(state), checkpoint });
}

/** Briefing before walking out of the ship. Shows the hazard on a first visit. */
function briefing(): void {
  const planet = state.world.planet;
  music.setMood(planet.theme.id);
  const firstVisit = state.campaign.planets[state.planetIndex] === null;
  const installed = localPlayer(state).partsInstalled;
  const sub = installed >= planet.partsNeeded
    ? 'De motor is hier al gerepareerd.'
    : `Vind ${planet.partsNeeded - installed} scheepsonderdelen voor een sterkere motor.`;
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
  if (online) {
    hud.showToast('Een online race gaat door, pauzeren kan niet');
    return;
  }
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
      ...raceButton(),
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
    ...raceButton(),
    tipsButton,
    soundButton,
    musicButton,
  ]);
  titleTheme = planet.theme;
  setTitleMode(true);
}

function raceButton(): OverlayButton[] {
  return raceAvailable ? [{ label: 'Race online', action: onlineMenu }, { label: 'Race (lokaal)', action: raceIntro }] : [];
}

/** What the connection shows on screen. */
const onlineEvents: OnlineEvents = {
  waiting(code) {
    lobby(`Kamer ${code}`, 'Geef deze code aan de ander.', 'Zodra die meedoet, begint de race.', [
      { label: 'Annuleren', action: leaveOnline },
    ]);
  },
  start(mirror, seat) {
    state = mirror;
    const planet = state.world.planet;
    music.setMood(planet.theme.id);
    hideOverlay();
    setTitleMode(false);
    running = true;
    tips.landed();
    hud.showToast(`Race op ${planet.name}. Jouw schip staat ${seat === 0 ? 'links' : 'rechts'}`);
    canvas.focus();
  },
  notice(text) {
    hud.showToast(text);
  },
  rematchAsked() {
    if (state.status === 'over' && !overlay.hidden) byId('overlay-sub').textContent += ' De ander wil een revanche.';
    else hud.showToast('De ander wil een revanche');
  },
  failed(text) {
    online = null;
    lobby('Race online', '', text, [{ label: 'Terug', action: title }]);
  },
};

/** A screen before an online race starts: over the title scene, like the menu. */
function lobby(heading: string, hazard: string, sub: string, buttons: OverlayButton[], input?: string): void {
  showOverlay(heading, hazard, sub, buttons, input);
  setTitleMode(true, true);
}

/** Race online: make a room and share its code, or join one with a code. */
function onlineMenu(): void {
  lobby('Race online', 'Twee spelers, elk op een eigen scherm.', `Bouw als eerste ${CONFIG.race.partsToWin} onderdelen in en stijg op. Wie doodgaat, verliest. WASD of pijltjes, E actie, F lamp, Q fles, R baken, B bom.`, [
    { label: 'Kamer maken', action: createRoom },
    { label: 'Meedoen met code', action: joinRoom },
    { label: 'Terug', action: title },
  ]);
}

function createRoom(): void {
  lobby('Kamer maken', '', 'Even geduld…', []);
  OnlineRace.create(onlineEvents)
    .then((race) => { online = race; })
    .catch(() => lobby('Race online', '', 'De raceserver is niet bereikbaar. Probeer het straks nog eens.', [{ label: 'Terug', action: onlineMenu }]));
}

function joinRoom(): void {
  const submit = () => {
    const code = normaliseRoomCode(overlayInput());
    if (!code) {
      hud.showToast('Een kamercode heeft vier letters');
      return;
    }
    lobby(`Kamer ${code}`, '', 'Verbinden…', [{ label: 'Annuleren', action: leaveOnline }]);
    online = OnlineRace.join(code, onlineEvents);
  };
  lobby('Meedoen', '', 'Typ de code die je van de ander kreeg.', [
    { label: 'Meedoen', action: submit },
    { label: 'Terug', action: onlineMenu },
  ], 'ABCD');
}

function leaveOnline(): void {
  online?.close();
  online = null;
  title();
}

const RACE_KEYS = 'Speler 1: WASD, E actie, F lamp, Q fles, R baken, B bom. '
  + 'Speler 2: pijltjes, Enter actie, rechter Shift lamp, / fles, . baken, komma bom. Tab wisselt het beeld.';

/** Explains a local race before it starts. Two players share one keyboard. */
function raceIntro(): void {
  showOverlay(
    'Race',
    'Twee spelers, een planeet, onderdelen voor een schip.',
    `Bouw als eerste ${CONFIG.race.partsToWin} onderdelen in en stijg op. Wie doodgaat, verliest. ${RACE_KEYS}`,
    [
      { label: 'Start', action: () => newRace() },
      { label: 'Terug', action: title },
    ],
  );
}

/** A fresh race on a random planet. Race mode never saves, so the solo game stays as it was. */
function newRace(seed = Math.floor(Math.random() * 1e9)): void {
  state = startRace(seed);
  const planet = state.world.planet;
  music.setMood(planet.theme.id);
  showOverlay(
    `Race · ${planet.name}`,
    `${planet.theme.hazardName}: ${planet.theme.hazardDescription}`,
    `Speler 1 landt links, speler 2 rechts. ${RACE_KEYS}`,
    [{ label: 'Landen', action: start }],
  );
}

/** The race has ended: who won and why. */
function onRaceOver(): void {
  const result = state.race?.result;
  if (!result) return;
  if (online) {
    onlineRaceOver(online, result);
    return;
  }
  const name = (id: number) => `Speler ${id + 1}`;
  let heading: string;
  let text: string;
  if (result.winner === null) {
    heading = 'Gelijkspel';
    text = result.reason === 'death' ? 'Jullie gingen tegelijk dood.' : 'De tijd is om en jullie staan gelijk.';
  } else {
    const winner = name(result.winner);
    heading = `${winner} wint`;
    const loser = state.players.find((p) => p.id !== result.winner);
    if (result.reason === 'launch') text = `${winner} is als eerste opgestegen.`;
    else if (result.reason === 'death' && loser && state.race?.blownUp.includes(loser.id)) text = `${name(loser.id)} liep op een bom.`;
    else if (result.reason === 'death') text = `Het pak van ${loser ? name(loser.id).toLowerCase() : 'de ander'} is leeg.`;
    else text = `De tijd is om. ${winner} heeft de meeste onderdelen ingebouwd, of bij gelijkstand de meeste energie.`;
  }
  if (result.reason === 'launch') sound.play('launch');
  showOverlay(heading, '', text, [
    { label: 'Nieuwe race', action: () => newRace() },
    { label: 'Menu', action: title },
  ]);
}

/** The result of a network race, told from this player's side, with a rematch. */
function onlineRaceOver(race: OnlineRace, result: RaceResult): void {
  const me = race.seat;
  let heading: string;
  let text: string;
  if (result.winner === null) {
    heading = 'Gelijkspel';
    text = result.reason === 'death' ? 'Jullie gingen tegelijk dood.' : 'De tijd is om en jullie staan gelijk.';
  } else {
    const won = result.winner === me;
    heading = won ? 'Je wint' : 'Je verliest';
    const blownUp = state.race?.blownUp.includes(won ? 1 - me : me);
    if (result.reason === 'launch') text = won ? 'Je bent als eerste opgestegen.' : 'De ander is als eerste opgestegen.';
    else if (result.reason === 'left') text = 'De ander kwam niet meer terug.';
    else if (result.reason === 'time') text = won ? 'De tijd is om en jij hebt de meeste onderdelen ingebouwd.' : 'De tijd is om en de ander heeft meer ingebouwd.';
    else if (won) text = blownUp ? 'De ander liep op een bom.' : 'Het pak van de ander is leeg.';
    else text = blownUp ? 'Je liep op een bom.' : 'Je pak is leeg.';
  }
  if (result.reason === 'launch') sound.play('launch');
  const again = result.reason !== 'left';
  showOverlay(heading, '', text, [
    ...(again ? [{ label: 'Revanche', action: () => {
      race.rematch();
      byId('overlay-sub').textContent = `${text} Wachten tot de ander ook revanche wil…`;
    } }] : []),
    { label: 'Menu', action: leaveOnline },
  ]);
}

function onDeath(): void {
  if (state.mode === 'race') {
    showOverlay('Zuurstof op', '', 'Je pak is leeg.', [{ label: 'Terug naar het menu', action: title }]);
    return;
  }
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
    if (e.type === 'starmap') {
      openMap = true;
      // In a local race the menu belongs to whoever opened it, so the screen switches to them.
      if (e.player !== undefined) state.viewer = e.player;
    }
  }
  if (progressed) save();
  if (openMap) {
    // Online the race goes on while the workbench is open; locally the game waits.
    if (!online) running = false;
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
  // Typing a room code: only Enter (to submit) counts.
  if (e.target instanceof HTMLInputElement && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
  if (e.code === 'KeyP' && !e.repeat && running) {
    pauseMenu();
    return;
  }
  if (e.code === 'Tab' && running && state.mode === 'race' && !online) {
    e.preventDefault();
    if (e.repeat) return;
    state.viewer = (state.viewer + 1) % state.players.length;
    hud.showToast(`Beeld: speler ${state.viewer + 1}`);
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
  // Ignore held keys: player 2 acts with Enter, and a held Enter must not click through the race result.
  if (!overlay.hidden && primaryAction && !e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) {
    // Let a focused button handle its own activation.
    if (document.activeElement instanceof HTMLButtonElement) return;
    e.preventDefault();
    primaryAction();
  }
});

if (debug) {
  byId('debug').hidden = false;
  // For poking around in the browser console: oxy8.state()
  Object.assign(window, { oxy8: { state: () => state, online: () => online, sound, music } });
  const timeBtn = byId<HTMLButtonElement>('dbg-time');
  timeBtn.addEventListener('click', () => {
    state.timeScale = state.timeScale === 1 ? 20 : 1;
    timeBtn.textContent = state.timeScale === 1 ? 'Tijd x20' : 'Tijd normaal';
    canvas.focus();
  });
  byId('dbg-repair').addEventListener('click', () => {
    const me = localPlayer(state);
    me.partsCarried = me.partsInstalled = state.world.planet.partsNeeded;
    unlockIfRepaired(state, me);
    save();
    hud.showToast('Debug: motor gerepareerd');
    canvas.focus();
  });
  byId('dbg-energy').addEventListener('click', () => {
    const me = localPlayer(state);
    me.energy = Math.min(100, me.energy + 50);
    canvas.focus();
  });
  // Walk around a mirrored race planet. The second player stands still at the other ship until race rules exist.
  byId('dbg-race').addEventListener('click', () => {
    newRace();
    start();
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
  if (running && inputMode.touch && portrait.matches && !online) pauseMenu();
  touch.setActive(running && inputMode.touch);
  gameEl.classList.toggle('race', state.mode === 'race' && !titleMode);
  if (online && online.state === state) {
    // A network race: the server simulates, this browser sends input and draws the mirror.
    const input = mergeInput(keyboard.poll(), touch.poll());
    if (running) {
      online.update(starMap.isOpen ? NO_INPUT : input, now / 1000);
      handleAppEvents();
      if (state.status === 'over') onRaceOver();
    }
  } else if (running) {
    // A local race reads two players from one keyboard; touch controls are for solo play for now.
    const input = state.mode === 'race' ? keyboard.pollSplit() : mergeInput(keyboard.poll(), touch.poll());
    step(state, input, dt);
    handleAppEvents();
    if (state.status === 'dead') onDeath();
    else if (state.status === 'stranded') onStranded();
    else if (state.status === 'over') onRaceOver();
  } else {
    // Not playing: drop key presses, so none fires when the game resumes.
    keyboard.poll();
    touch.poll();
  }
  tips.update(state, dt, running);
  sound.handle(state.events, state.viewer);
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
