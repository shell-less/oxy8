# Oxy8: notes for contributors and Claude

Browser game, TypeScript + Vite, Canvas 2D, no game engine and no runtime dependencies. Read `docs/design.md` before changing gameplay.

## Language

- Code, comments, commit messages and docs: English.
- Everything the player sees (HUD, toasts, prompts, overlays): Dutch.

## Commands

```bash
npm run dev         # http://localhost:5173/oxy8/ (debug buttons visible)
npm test            # Vitest, no browser needed
npm run typecheck
npm run build
```

Run `npm run typecheck && npm test` before every commit. CI runs the same, plus the build.

## Architecture

The game logic knows nothing about drawing. Rendering reads state and never changes gameplay.

```
src/
  config.ts          All balance numbers. Tune here, not in systems.
  main.ts            Bootstrap, game loop, overlay flow, debug buttons.
  core/              rng (seeded), clock (day/night), input (keyboard to InputState).
  world/             themes (look + hazard per planet type), planets (fixed order),
                     generate (pure, deterministic layout), race (mirrored race planets from a match seed), types.
  game/              state (GameState, landOn, events), update (step: runs the systems in order),
                     campaign (per-planet progress, engine unlocks, leftovers), travel (star map rows,
                     flying), save (localStorage, validated, versioned, migrated), tutorial (tips and when to show them),
                     crafting (recipes and the workbench rules).
  systems/           movement, interaction, creepers, hazards, survival, items (scrap pickup, bottle, beacons),
                     bombs (race only: placing, arming, triggering, defusing).
                     Pure functions on GameState.
  net/               network races, shared by browser and server: protocol (messages), view (what one
                     player may see), apply (snapshots onto the browser's mirror state), match (one room,
                     host-independent), codes (room codes). No sockets or Cloudflare code here.
  render/            renderer (camera, draw order, night lighting, screen effects), sprites,
                     ground (painted once per planet), particles, minimap, hud, starmap (ship menu with workbench), tips and touch (on-screen controls, DOM).
tests/               Vitest tests for world generation and systems.
```

### Rules that keep it maintainable

- **Determinism.** Gameplay randomness comes from `createRng` with a seed derived from the planet (`deriveSeed(seed, salt)`). Never use `Math.random()` in `world/`, `game/` or `systems/`. Visual-only randomness in `render/` may use `Math.random()`.
- **Players.** Everything that belongs to one astronaut (position, oxygen, energy, parts, inventory, lamp, interaction, minimap) lives on `Player` in `state.players`. Systems take the player they act on; `step()` takes one `InputState` or one per player. Solo play has one player; race mode will have two. Rendering, the HUD, tips and saving use `localPlayer(state)`.
- **Hidden information stays on the server.** In a network race the browser only gets what `net/view.ts` lets through. Anything a player may not see (empty bunkers, the other player's bombs, the other player off screen) must not appear in a snapshot; `tests/net.test.ts` checks this.
- **Events, not side effects.** Systems call `emit(state, …)` for toasts, particles, shake. The renderer drains `state.events` each frame.
- **Config over constants.** New tunable numbers go in `config.ts` with a comment and a unit.
- **Sprites in code.** Sprites are small rectangle drawings in `render/sprites.ts`, anchored at the foot point. Keep to whole pixels.
- **Worlds are regenerated, not saved.** A save stores only what changed per planet (`PlanetProgress`). Changing generation for an existing planet changes it for players with a save, so treat seeds and generation order as stable. When `SaveData` changes shape, bump its version and handle the old one.
- **Tests for rules.** A new gameplay rule gets a test in `tests/`. Use `landOn(index)` and `step(state, input, dt)`; see `tests/systems.test.ts` for helpers.

### Adding things

- **A new planet:** add an entry to `PLANETS` in `world/planets.ts`. It should be at least as hard as the previous one (the tests check this).
- **A new mechanic:** add a tip for it to `TIPS` in `game/tutorial.ts`, triggered at the moment the player first needs it.
- **A new planet type or hazard:** add a theme to `world/themes.ts`, extend `HazardKind`, handle it in `systems/hazards.ts` (return modifiers), `render/hud.ts` (status text) and, if it has visuals, `render/renderer.ts`. TypeScript's exhaustive switches point you to every place.

## Workflow

- Work on a branch, open a pull request to `main`. CI must be green before merging.
- `main` deploys to https://shell-less.github.io/oxy8/ automatically.
- Keep pull requests small: one feature or fix each.
- Update `docs/design.md` when a gameplay decision changes.
