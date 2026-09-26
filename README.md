# Oxy8

A small pixel-art space survival game for the browser. You crash on a planet, your suit leaks oxygen, and slow creepers guard the abandoned bunkers that hold what you need. Salvage ship parts, install them, and hop to the next planet.

**Play:** https://shell-less.github.io/oxy8/

## How to play

| Key | Action |
| --- | --- |
| WASD or arrow keys | Walk |
| E (hold) | Open a bunker, install a part, launch |
| F | Helmet lamp on or off |
| Enter or Space | Continue from a menu screen |

Keep your oxygen above zero. Supply bunkers (blue) always refill oxygen and sometimes hold a one-time energy cell (yellow light). Parts bunkers (orange stripes) hold one ship part each. Installing a part costs energy, and so does the helmet lamp at night. Creepers cannot be killed: a hit tears your suit for 25% oxygen.

Each planet has its own hazard: sandstorms, freezing nights, meteor showers, and (on a later planet) toxic pools.

## Development

Requires Node 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173/oxy8/
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # production build in dist/
```

Add `?debug` to the URL to show debug buttons (fast clock, skip planet). With `?debug&planet=2` you start on planet 2. The dev server always shows them.

Every push to `main` is tested, built and deployed to GitHub Pages. Pull requests run the same checks.

## Documentation

- [docs/design.md](docs/design.md): game design decisions and the roadmap
- [CLAUDE.md](CLAUDE.md): architecture and conventions, for humans and for Claude
