# Oxy8 game design

This file records what we decided and why. Update it when a decision changes, so the next person (or Claude session) does not undo it by accident.

## Pillars

- **Casual.** Short sessions, no grinding, playable without reading a manual.
- **Survival through oxygen.** Oxygen is your health. Everything that hurts you costs oxygen.
- **Collect and build.** Every planet is a small loop: explore, salvage parts, install them, launch.
- **Pixel retro, top-down.** Rendered at 320x180 and scaled up with crisp pixels.

## Resources

| Resource | Starts at | Gained from | Spent on |
| --- | --- | --- | --- |
| Oxygen | 100% on each landing | Supply bunkers (always, unlimited) | Passive drain (~3 minutes from full), creeper hits (25%), hazards |
| Energy | 30 at the start of a new game, carried everywhere after that | Energy cells in supply bunkers (+35, once per bunker) | Installing a ship part (20), helmet lamp at night (~11 per night), every flight (10) |
| Ship parts | 0 per planet | Parts bunkers (one each, once) | Installing into the ship's engine |
| Scrap | 0, carried everywhere | 10 pieces lying on every planet, picked up by walking over them | Recipes on the ship's workbench |

Food was considered and dropped: oxygen alone keeps the pressure on.

## Day and night

A full day lasts 5 real minutes. Nights are dark: you see what your helmet lamp, bunker lights and crystals light up. The lamp costs energy at night and switches off when energy runs out. With the lamp off at night, creepers only notice you from about half the distance, but you also see almost nothing and reveal less of the minimap.

## Creepers

Slow patrols on an ellipse around bunkers. Every parts bunker has one, plus two supply bunkers. They chase you when you come close, at about 40% of your speed, and give up when you get away or they stray too far from their bunker. They cannot be killed. After a hit they retreat and ignore you for a few seconds.

**Jumpers** (Umbra-9) do not walk. They hop in small jumps around their bunker. When they see you they crouch for about half a second while a red marker shows where they will land; the marker follows you until the jump starts, then stays put. They only hurt you by landing on you, so stepping aside during the jump dodges them. After a pounce they need a moment to recover. Which kind guards a planet is set per planet in `PLANETS`.

## Planets

The order is fixed, so everyone plays the same planets. Planet 1 needs 3 parts, later planets need 5, and every new planet should be a bit harder than the one before.

| # | Name | Look | Hazard | Parts |
| --- | --- | --- | --- | --- |
| 1 | Kepler-442 | Red dust, craters, turquoise crystals | **Sandstorms**: less sight and speed for you, less sight for creepers. Warning a few seconds before. | 3 |
| 2 | Nereid-117 | Blue ice plains, tall ice spires | **Freezing nights**: oxygen drain up to 1.9x in the dark | 5 |
| 3 | Umbra-9 | Purple, crater-heavy, pink crystals, jumping creepers | **Meteor showers**: a red ring marks the impact spot, a hit costs 15% | 5 |
| 4 (later) | Viridia | Green, rocky, yellow crystals | **Toxic pools**: standing in one drains oxygen fast | 5 |

## Ship, engine and travel

The ship still flies, but its engine is too weak for the next planet. The parts found on a planet upgrade the engine; once all parts of that planet are installed, the engine reaches one planet further. Planets you can already reach stay reachable, so you can **always fly back** to an earlier planet, even halfway through a repair.

Hold E at the ship: it installs a carried part when you have the energy, otherwise it opens the **star map**. The star map lists every planet with its status (here, visited, new, locked, unknown) and, for planets you have seen, how many **energy cells are left** there, so you can decide whether a trip back is worth the flight. Every flight costs 10 energy. After the last planet is repaired, the star map offers the way home, which ends the game.

Planets keep their state: looted bunkers stay empty, taken energy cells and scrap stay gone, installed parts stay installed, and the explored minimap is remembered. Leftovers are energy cells and scrap.

You always land in the morning next to the ship with a full oxygen tank.

## Crafting

Hold E at the ship to open the ship menu: the **workbench** on top, the star map below. Recipes cost scrap only, so energy stays the currency for travel and repairs.

| Recipe | Scrap | Effect |
| --- | --- | --- |
| Zuurstoffles | 3 | Carry one. Q adds 40% oxygen anywhere. |
| Lokbaken | 2 | Carry up to two. R places it; creepers within 120 px go for the beacon instead of you for 20 seconds. Jumpers pounce on it. |
| Pakversterking | 6 | One-time upgrade. Creeper and meteor hits cost 40% less oxygen. |

Scrap left on a planet counts as a leftover on the star map, next to energy cells. Scrap has its own seed, so adding it did not move anything on existing planets. Recipes live in `src/game/crafting.ts`, numbers in `CONFIG.crafting`.

## Saving and dying

The game saves itself in the browser (localStorage) on every landing and after every completed action. The title screen offers "Verder spelen" or "Nieuw spel". Resuming puts you at the ship with a full tank.

Dying rolls back to the moment you landed on the current planet: the planet, your energy and your progress there are restored to that point.

**Stranded is game over.** With less energy than a flight costs and no energy cells left on the current planet, the ship can never leave. The game ends and the save is removed. Energy is the long-term resource: spending it on the lamp or on trips back is a real choice.

## Tutorial

No tutorial level and no manual. Short tips appear at the moment they become useful, one at a time at the top of the screen, each only once per browser: how to walk, what the bunkers are, that creepers cannot be beaten, where to take a part, what to do when oxygen runs low, the helmet lamp at dusk and without lamp at night, the star map once the engine is ready, and leftovers on earlier planets. The tips live in `src/game/tutorial.ts` in priority order. The title screen can switch them off; a new game does not repeat tips already seen.

## Sound

All sound is synthesised with Web Audio in `src/render/audio.ts`: no audio files. Systems emit `{ type: 'sound', name }` events; the sound board turns them into short retro effects. Continuous sounds: wind during sandstorms and a warning beep below 25% oxygen (faster below 10%). M or the title screen switches sound off; the choice is remembered.

## Roadmap

1. ~~Project setup: Vite, TypeScript, CI, GitHub Pages~~
2. ~~Port the mockup into modules with the same behaviour~~
3. ~~Progression: star map, travel back to earlier planets, save progress in the browser~~
4. ~~Tutorial: contextual tips, including the helmet lamp~~
5. ~~Crafting: scrap, workbench, oxygen bottle, decoy beacon, suit reinforcement~~
6. Polish: ~~sound~~, balance, title screen

## Open questions

- More recipes later? Candidates: an efficient helmet lamp (half the energy), a bigger oxygen tank.
