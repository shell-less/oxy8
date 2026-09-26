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
| Energy | 30 on planet 1, carried over after that | Energy cells in supply bunkers (+35, once per bunker) | Installing a ship part (20), helmet lamp at night (~11 per night) |
| Ship parts | 0 per planet | Parts bunkers (one each, once) | Installing into the ship |

Food was considered and dropped: oxygen alone keeps the pressure on.

## Day and night

A full day lasts 5 real minutes. Nights are dark: you see what your helmet lamp, bunker lights and crystals light up. The lamp costs energy at night and switches off when energy runs out. With the lamp off at night, creepers only notice you from about half the distance, but you also see almost nothing and reveal less of the minimap.

## Creepers

Slow patrols on an ellipse around bunkers. Every parts bunker has one, plus two supply bunkers. They chase you when you come close, at about 40% of your speed, and give up when you get away or they stray too far from their bunker. They cannot be killed. After a hit they retreat and ignore you for a few seconds.

## Planets

The order is fixed, so everyone plays the same planets. Planet 1 needs 3 parts, later planets need 5, and every new planet should be a bit harder than the one before.

| # | Name | Look | Hazard | Parts |
| --- | --- | --- | --- | --- |
| 1 | Kepler-442 | Red dust, craters, turquoise crystals | **Sandstorms**: less sight and speed for you, less sight for creepers. Warning a few seconds before. | 3 |
| 2 | Nereid-117 | Blue ice plains, tall ice spires | **Freezing nights**: oxygen drain up to 1.9x in the dark | 5 |
| 3 | Umbra-9 | Purple, crater-heavy, pink crystals | **Meteor showers**: a red ring marks the impact spot, a hit costs 15% | 5 |
| 4 (later) | Viridia | Green, rocky, yellow crystals | **Toxic pools**: standing in one drains oxygen fast | 5 |

Launching takes you to the next planet. Energy carries over; oxygen is refilled by the ship. Dying restarts the current planet with the energy you arrived with.

## Roadmap

1. ~~Project setup: Vite, TypeScript, CI, GitHub Pages~~
2. ~~Port the mockup into modules with the same behaviour~~
3. Progression: travel back to earlier planets, save progress in the browser (localStorage)
4. Tutorial, including the helmet lamp
5. Crafting formulas for more complex objects
6. Polish: sound, balance, title screen

## Open questions

- What does travelling back to an earlier planet offer? Leftover energy cells, or something for crafting?
- Should the world stay as you left it when you return (looted bunkers stay empty)?
- Which crafting recipes come first, and do they need a new resource?
