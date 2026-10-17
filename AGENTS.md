# Send to Discord

Personal Firefox (MV3) extension: a button on each X post and old-layout Reddit post that sends it to one Discord webhook (X as an `fxtwitter.com` link; Reddit as uploaded images or an `vxreddit.com`/external link). Plain JavaScript, no bundler.

## Done means green

`npm test` passes and `npm run lint` reports 0 errors and 0 warnings.

## Shape

- `src/core/` holds what every site shares (click-to-arm in `arm.js`, state machine, webhook); `src/sites/` holds one adapter per site plus its pure helpers, and each site is its own `content_scripts` entry. A new site is a new adapter that calls `wireButton(el, { render, resolve })`.
- Decisions sit in pure files with tests (`src/sites/fxurl.js`); site adapters, `background.js` and `options.js` are thin wiring around them. Put new logic in a pure file with a test, then wire it.
- The webhook `fetch` belongs in `background.js`: X's CSP blocks it from the content script.
- The X button is cloned from X's own share button so it inherits X's styling; selectors for X's DOM (`article[data-testid="tweet"]`, `[role="group"]`) are the fragile part when X ships changes.

## Design docs

- X MVP: `docs/superpowers/specs/2026-10-16-x-to-discord-design.md`, `docs/superpowers/plans/2026-10-16-x-to-discord.md`
- Reddit support and rename: `docs/superpowers/specs/2026-10-16-reddit-support-design.md`, `docs/superpowers/plans/2026-10-16-reddit-support.md`

## Task board

`C:\Users\Utilizador\Documents\Obsidian Vault\Send to Discord\Send to Discord Kanban.md` (lanes: todo, in-progress, done). Check it when starting; move cards as status changes.
