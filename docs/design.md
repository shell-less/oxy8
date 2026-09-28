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
| Energy | 30 at the start of a new game, carried everywhere after that, max 100 | Energy cells in supply bunkers (+35, once per bunker; left in the bunker if it would not fit) | Installing a ship part (20), helmet lamp at night (~12 per night), every flight (10) |
| Ship parts | 0 per planet | Parts bunkers (one each, once) | Installing into the ship's engine |
| Scrap | 0, carried everywhere | 10 pieces lying on every planet, picked up by walking over them | Recipes on the ship's workbench |

Food was considered and dropped: oxygen alone keeps the pressure on.

## Day and night

A full day lasts 5 real minutes. Nights are dark: you see what your helmet lamp, bunker lights and crystals light up. The lamp costs energy at night and switches off when energy runs out. With the lamp off at night, creepers only notice you from about half the distance, but you also see almost nothing and reveal less of the minimap.

## Creepers

Slow patrols on an ellipse around bunkers. Every parts bunker has one, plus two supply bunkers. They chase you when you come close, at about 40% of your speed, and give up when you get away or they stray too far from their bunker. They cannot be killed. After a hit they retreat and ignore you for a few seconds.

**Jumpers** (Umbra-9) do not walk. They hop in small jumps around their bunker. When they see you they crouch for about half a second while a red marker shows where they will land; the marker follows you until the jump starts, then stays put. They only hurt you by landing on you, so stepping aside during the jump dodges them. After a pounce they need a moment to recover.

**Gliders** (Nereid-117) skate along the ellipse around their bunker. When they see you they brace for 0.7 seconds while a red dotted line shows the direction of their charge; the line follows you until the slide starts, then stays put. They slide in a straight line, faster than you walk, and slow down over about 100 pixels. They cannot steer, so stepping out of the line dodges them. After a slide they sit dazed for a moment and then skate back to their route.

Which kind guards a planet is set per planet in `PLANETS`; a list mixes kinds, taken in turn by the guarded bunkers. A planet can also guard more supply bunkers than the default two.

## Planets

The order is fixed, so everyone plays the same planets. Planet 1 needs 3 parts, later planets need 5, and every new planet should be a bit harder than the one before.

| # | Name | Look | Hazard | Parts |
| --- | --- | --- | --- | --- |
| 1 | Kepler-442 | Red dust, craters, turquoise crystals | **Sandstorms**: less sight and speed for you, less sight for creepers. Warning a few seconds before. | 3 |
| 2 | Nereid-117 | Blue ice plains, tall ice spires, gliding creepers | **Freezing nights**: oxygen drain up to 1.9x in the dark | 5 |
| 3 | Umbra-9 | Purple, crater-heavy, pink crystals, jumping creepers | **Meteor showers**: a red ring marks the impact spot, a hit costs 15% | 5 |
| 4 | Viridia | Green, rocky, yellow crystals; the finale with crawlers, gliders and jumpers together, and four guarded supply bunkers instead of two (one stays safe) | **Toxic pools**: standing in one drains oxygen fast | 5 |

## Ship, engine and travel

The ship still flies, but its engine is too weak for the next planet. The parts found on a planet upgrade the engine; once all parts of that planet are installed, the engine reaches one planet further. Planets you can already reach stay reachable, so you can **always fly back** to an earlier planet, even halfway through a repair.

Hold E at the ship: it installs a carried part when you have the energy, otherwise it opens the **star map**. The star map lists every planet with its status (here, visited, new, locked, unknown) and, for planets you have seen, how many **energy cells are left** there, so you can decide whether a trip back is worth the flight. Every flight costs 10 energy. After the last planet is repaired, the star map offers the way home, which ends the game.

Planets keep their state: looted bunkers stay empty, taken energy cells and scrap stay gone, installed parts stay installed, and the explored minimap is remembered. Leftovers are energy cells and scrap.

You always land in the morning next to the ship with a full oxygen tank.

## Crafting

Hold E at the ship to open the ship menu: the **workbench** on the left, the star map on the right (stacked on narrow screens). Recipes cost scrap only, so energy stays the currency for travel and repairs.

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

## Controls

**Keyboard:** WASD or arrows to walk, hold E to act, F lamp, Q bottle, R beacon, M sound, N music, P pause, H hides the key legend.

**Touch screens** (phones and tablets, landscape only; upright shows "Draai je telefoon" and pauses the game):

- **Walking:** a floating stick on the left half of the screen. It appears where the thumb lands and is analog: just past the dead zone you walk at 30% speed, at the rim at full speed. Slow walking helps to step out of a jumper's ring or a glider's line.
- **Action:** a big button bottom right that you hold, like E. It names what it will do (Openen, Inbouwen, Schip), fills a ring while you hold it, and is dimmed when there is nothing to do.
- **Small buttons** around it: lamp always, bottle and beacon only while you carry one (with a count).
- **Pause** button top right: continue, sound, music, tips.

The game picks the layout from the device and then follows what the player last used: a touch switches to the touch layout, a key or mouse click back to the keyboard one. Tips, the HUD and the ship menu leave out key names on touch screens; tips with keys have a `touchText`. On phones the first tap also asks for fullscreen and a landscape lock where the browser allows it (not on iPhone Safari). Everything touch lives in `src/render/touch.ts` and produces the same `InputState` as the keyboard; stick numbers are in `CONFIG.touch`.

## Tutorial

No tutorial level and no manual. Short tips appear at the moment they become useful, one at a time at the top of the screen, each only once per browser: how to walk, what the bunkers are, that creepers cannot be beaten, where to take a part, what to do when oxygen runs low, the helmet lamp at dusk and without lamp at night, the star map once the engine is ready, and leftovers on earlier planets. The tips live in `src/game/tutorial.ts` in priority order. A small key legend sits in the bottom-left corner of the HUD; item keys fade while you carry nothing to use, and H hides the legend. The title screen can switch them off; a new game does not repeat tips already seen.

## Balance

The numbers live in `src/config.ts`; `tests/balance.test.ts` guards the promises below, so a tweak or a new planet cannot quietly make the game unwinnable.

- **Every planet pays for itself.** Its energy cells cover all installs, the next flight and one night of lamp, even when you arrive with zero energy. Anything you bring along is slack for the lamp and trips back.
- **No wasted cells.** A cell stays in its bunker when your bar is too full to take all of it.
- **Oxygen reach.** Every parts bunker is a round trip from a supply bunker on a freezing night, with a 50% detour and one creeper hit to spare.
- **Escapable creepers.** Crawlers chase at under 60% of your walking speed; a jumper's landing and a glider's line can be walked out of in time.
- **Scrap.** One planet holds enough scrap for the suit reinforcement and a bottle.

## Title screen

The game opens with "Klik of druk op een toets om te beginnen" over the title scene. Browsers only allow sound after the player did something, so this one click or key press lets the title music play while the menu is on screen. A click (not a pointer press) leaves it, so the same click never lands on a menu button.

An animated scene drawn in the same 320x180 pixel style (`src/render/title.ts`): drifting stars, the pixel logo, the ship passing by, and the planet of your saved game rising at the bottom (Kepler-442 for a new game). The buttons sit below it: continue, new game, tips on or off, sound on or off.

## Sound

All sound is synthesised with Web Audio in `src/render/audio.ts`: no audio files. Systems emit `{ type: 'sound', name }` events; the sound board turns them into short retro effects. Continuous sounds: wind during sandstorms and a warning beep below 25% oxygen (faster below 10%). M or the title screen switches sound off; the choice is remembered.

## Music

Background music is generated live too (`src/render/music.ts`): a soft pad, a bass note and a sparse arpeggio with echo, looping over a four-chord progression. Every mood has its own key, scale and tempo: the title (D minor, wide), Kepler-442 (A dorian, a bit of drive), Nereid-117 (E minor, slow and glassy), Umbra-9 (C phrygian, eerie) and Viridia (G harmonic minor, 104 bpm). Viridia is the finale and gets an extra rhythm layer: a soft kick, off-beat hats and a pulsing bass, mixed to the same peak level as the other moods. Music crossfades when you land somewhere else, gets darker at night and softer in menus. N or the title screen switches music off; M still mutes everything.

## Race mode (designed, not built)

A two-player versus mode. Solo play stays as it is and keeps working offline; race is an extra mode that needs a server.

### The match

Two players land at opposite ends of one planet, each next to their own ship. The planet type is picked at random from the four (with its hazard and its creepers), and the layout comes from a fresh match seed. There is enough for one ship to leave, not for two. The first player to install all parts and launch wins. Every death loses the match: oxygen running out, creepers, meteors or a bomb. If both players die in the same moment, the match is a draw.

### Scarcity: one short of two

| | Per player needed | On the planet | Why |
| --- | --- | --- | --- |
| Parts | 4 | 7 parts bunkers, one part each | Any split of 7 gives one player at least 4, so the race is about the majority. |
| Energy | 90 (4 installs x 20 + flight 10) | 30 at the start each, 3 cells of 35 | Two cells get one player out with a little lamp slack; both would need four. |

A deadlock is still possible (one player has the parts, the other the energy). Two things end it:

- **Supply drop.** At the start of the second night (day 2, 18:00, about 7 minutes into the race) a pod lands in the centre, marked on both minimaps. Ten seconds before, both players get a warning, and the pod is seen falling onto its shadow. It holds one part and one energy cell: whoever opens it first takes the part, and the cell too if all of it fits; otherwise the cell stays for the other player. Its lights show what is still inside.
- **Time limit.** After about 12 minutes the player with the most installed parts wins; energy breaks a tie, then it is a draw.

### A fair, mirrored planet

Race planets are point-symmetric around the centre: every bunker, rock, crystal, pool, scrap piece and creeper route has a mirror on the other side, and the ships stand mirrored at the left and right end. Size 120 x 80 tiles (the solo planets are 90 x 60), with the same density of rocks and crystals as the solo planet of that type. Both clients generate the same world from the match seed (`generateRaceWorld` in `src/world/race.ts`).

With an odd number of parts bunkers and energy cells, one of each sits by the centre, the most contested spot on the map. Two bunkers cannot both stand exactly on the centre, so the centre parts bunker and the centre supply bunker (with a cell) stand on either side of it, across the line between the ships. Both are then exactly as far from either ship, and no rocks or crystals stand within 90 px of the centre, so the way in is the same for both players.

On top of the seven parts bunkers there are five supply bunkers: the centre one with a cell, a mirrored pair with cells and a mirrored pair without. Every parts bunker and the pair with cells has a creeper; mirrored bunkers get mirrored creepers (same kind and route, starting at the opposite point). The planet type is picked from the match seed, so each of the four comes up about equally often.

The ships stand about 780 px from the centre, which is roughly 15 seconds of walking in a straight line; detours around rocks and creepers make it longer. If matches feel too short, move the ships further out (`CONFIG.race`).

### Hidden and visible information

- **Parts bunkers never show whether they are empty.** You only learn it after holding E for the full opening time ("Leeg"); the wasted time is the cost.
- Your own minimap marks the bunkers you looted, so only the opponent's moves are a guess.
- **Energy cells stay visible** (the yellow light on a supply bunker), so cells turn into a visible sprint.
- The opponent is visible when on screen, not on the minimap.

### Bombs

| Rule | Value | Why |
| --- | --- | --- |
| Recipe | 4 scrap on the workbench, carry at most 1 | 10 scrap on the planet makes scrap contested; about two bombs per match. |
| Placing | Only within ~40 px of a bunker, never near a ship | A trap for bunkers, not a way to lock someone in. |
| Arming | 3 seconds after placing | Time to walk away. |
| Trigger | Any player within 12 px, the owner included | Creepers do not trigger bombs; their patrols around bunkers would set them all off. |
| Effect | Whoever triggers it loses the match | |
| Defusing | Hold E for ~2 s from 20-26 px away, just outside the trigger radius | The bomb goes into your inventory (if you do not carry one already). Standing in that ring, defusing comes before opening the bunker. |

Hard to spot, but readable: a tiny red blink every ~2.5 s, visible within ~50 px; a faint beep within ~60 px that speeds up as you get closer; at night the helmet lamp makes a bomb glint. The owner sees their own bombs faintly. The strongest play: a bomb next to a bunker you already emptied, since the opponent cannot see that it is empty.

### Playing online

"Race online" on the title screen offers "Kamer maken" and "Meedoen met code". The maker sees the four-letter code large on the title scene and passes it on; the other types it in (any case, spaces allowed). The race starts the moment the second player is in, with a toast saying which side your ship is on. One player per device: WASD or arrows, E, F, Q, R and B for the bomb. On a touch screen a red "Bom" button appears left of the lamp while you carry a bomb; it is dimmed where a bomb may not lie (away from a bunker, near a ship).

Online there is no pause, and the workbench does not stop the race. A dropped connection reconnects by itself for 20 seconds; the other player sees "De ander is weggevallen" and "De ander is terug". The result is told from your side ("Je wint", "Je liep op een bom") with "Revanche" and "Menu".

### Playing locally

Until the server exists, a race is played by two players on one keyboard. The title screen offers "Race (lokaal)" in development, with `?debug`, or with `?race` in the address; the live game does not show it otherwise.

- **Player 1:** WASD, E action, F lamp, Q bottle, R beacon, B bomb.
- **Player 2:** arrows, Enter action, right Shift lamp, / bottle, . beacon, comma bomb.
- **Tab** switches the screen between the players: camera, HUD, minimap, tips and toasts follow whoever is shown. Both players can always move. Opening the workbench switches the screen to the player who opened it.

Player 2's suit has a lime stripe instead of orange. The HUD names whose screen it is and counts down to the time limit. At the ship, a repaired engine offers "Opstijgen" (costs the flight energy) instead of the star map; the ship menu shows only the workbench. Race mode never writes the solo save.

### Technology

Hidden information decides the architecture. If both browsers held the full state, the developer tools would show every bomb and every empty bunker. So the server is authoritative and sends each player only what they may see.

The game itself stays on GitHub Pages. The race server runs on **Cloudflare Workers with Durable Objects**, on the free plan. Colyseus on Azure Container Apps was the first idea; Cloudflare won because it is free for a project this size, has no server to manage and no minute-long cold start, and one Durable Object per room fits a room code exactly. The game logic has no dependencies, so the same `step()` runs there unchanged.

**How a room works**

- A Worker (`oxy8-race` on workers.dev) creates rooms and forwards connections. `POST /rooms` returns a new four-letter code (no look-alike letters such as O/0 or I/1); `GET /rooms/CODE` upgrades to a WebSocket and hands it to the Durable Object named CODE.
- Each room is one Durable Object (`RaceRoom`) with three phases. **Waiting**: fewer than two players; it uses the WebSocket Hibernation API and no timers, so an open room costs nothing. **Playing**: both connected; it picks a match seed, runs `step()` at 20 ticks per second and sends each player a snapshot at every tick. **Over**: the tick stops; "Revanche" from both players starts a new planet with a new seed.
- Clients send an input message only when their `InputState` changes, at most 10 per second. Incoming messages count against the free plan's 100,000 requests per day; outgoing messages are free. That leaves room for dozens of matches a day even if every message counts, and a 12-minute match keeps a room awake for about 92 GB-s of the 13,000 per day.
- A player who drops out has 20 seconds to reconnect with the same room code; after that the other player wins.

**What each player receives**

The server is authoritative and never sends what a player may not see, so the developer tools reveal nothing. The per-player view is a pure function of `GameState` and a player id (`src/net/view.ts`), tested like the rest of the rules:

- Their own player in full.
- The opponent only when on or near their screen: position, facing, lamp, installed parts (visible on the ship).
- Parts bunkers as empty only when this player knows (`knownEmpty`); supply bunkers and their energy cells as they are.
- Bombs they own, and other bombs only within the blink radius.
- Creepers, meteors, scrap, the supply drop, hazards and the clock as they are.
- Only their own toasts and sounds (`isFor`), and world effects near them.

The world layout is not sent: both clients generate it from the match seed. A snapshot only carries what changes.

**The client**

The browser does not simulate a network race. It keeps a mirror `GameState`: the world from the seed, dynamic parts overwritten by each snapshot, so the renderer, HUD and minimap work unchanged. The other astronaut and the creepers glide between snapshots (`net/smooth.ts`).

The own astronaut is predicted (`net/predict.ts`), because the first playtest felt sluggish with a round trip between key and movement. The browser moves it at once with the same `movePlayer()` the server runs, and numbers every input it sends. Each snapshot says which input the server stepped with last and for how long; the browser puts its astronaut where the server has it and replays everything after that. Walking stays exactly where the player expects it. Only real disagreements show, eased in when small: a creeper's knockback, or the up to one tick (about 3 px) that the 20 Hz server walks longer or shorter after a key is released.

**Code and deployment**

- `src/net/`: the protocol types, the per-player view and the snapshot applier, shared by client and server. `server/`: the Worker, the Durable Object and `wrangler.jsonc`, with its own `package.json` so the game keeps no runtime dependencies. `wrangler dev` runs a room locally.
- A GitHub Actions workflow deploys the server when `server/` or `src/` changes on `main`, with a Cloudflare API token and account id as repository secrets. The game reads the server address from `VITE_RACE_SERVER` at build time.

### Changes in the code

- `GameState` gets `players[]` and two ships instead of one `player`; oxygen, energy, inventory and parts move per player. Creepers chase the nearest player.
- `mode: 'solo' | 'race'` with its numbers in `CONFIG.race`.
- A mirrored generator for race planets.
- A network input source next to keyboard and touch; a bomb button on touch and B on the keyboard.
- Tips for race-only mechanics (hidden bunkers, bombs, defusing, the supply drop).

### Build order

1. ~~Refactor the state to several players, with no visible change to solo play.~~ Creepers go for the nearest player, meteors aim at the players in turn, toxic pools drain only who stands in them.
2. ~~Mirrored race generation.~~ A debug button in `npm run dev` ("Raceplaneet") lands you on a random race planet; the second player stands still at the other ship.
3. Race rules, testable with two players on one keyboard, so balancing can start before there is a server. Split in three:
   - ~~3a. Local race: two players on one keyboard, Tab to switch, launch to win, every death loses, time limit, result screen.~~
   - ~~3b. Hidden empty bunkers and the supply drop.~~
   - ~~3c. Bombs and defusing.~~ The bomb is on the workbench in a race only; the result screen says when someone stepped on a bomb. Touch got its bomb button with online races.
4. Room server and room codes, in three pull requests:
   - 4a. Match core and per-player view: `src/net/`, pure and tested, no Cloudflare yet.
   - 4b. The Worker and Durable Object, local runs with `wrangler dev`, the deploy workflow.
   - ~~4c. The client: "Race online" on the title screen (make a room, join with a code), the mirror state with interpolation, disconnects and "Revanche".~~ Like the local race, it shows on the title screen only in development, with `?debug` or with `?race`, until it has been playtested.
5. Rematch, mobile testing, balance.

## Roadmap

1. ~~Project setup: Vite, TypeScript, CI, GitHub Pages~~
2. ~~Port the mockup into modules with the same behaviour~~
3. ~~Progression: star map, travel back to earlier planets, save progress in the browser~~
4. ~~Tutorial: contextual tips, including the helmet lamp~~
5. ~~Crafting: scrap, workbench, oxygen bottle, decoy beacon, suit reinforcement~~
6. ~~Polish: sound, title screen, balance~~
7. ~~Gliders on Nereid-117, Viridia as planet 4 with every kind of creeper, its own music, title music from the first click~~
8. ~~Touch controls for phones and tablets~~
9. Race mode (two players, one planet): designed, see above

## Open questions

- More recipes later? Candidates: an efficient helmet lamp (half the energy), a bigger oxygen tank.
