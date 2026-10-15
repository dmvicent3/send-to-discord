# X to Discord

Personal Firefox (MV3) extension: a button on each X post that sends its link, rewritten to `fxtwitter.com`, to one Discord webhook. Plain JavaScript, no bundler.

## Done means green

`node --test` passes and `web-ext lint` is clean.

## Shape

- Decisions sit in pure files with tests (`src/fxurl.js`); `content.js`, `background.js` and `options.js` are thin adapters around them. Put new logic in a pure file with a test, then wire it.
- The webhook `fetch` belongs in `background.js`: X's CSP blocks it from the content script.
- The injected button is cloned from X's own share button so it inherits X's styling; selectors for X's DOM (`article[data-testid="tweet"]`, `[role="group"]`) are the fragile part when X ships changes.

## Design docs

Spec and plan: `docs/superpowers/specs/2026-10-16-x-to-discord-design.md`, `docs/superpowers/plans/2026-10-16-x-to-discord.md`.

## Task board

`C:\Users\Utilizador\Documents\Obsidian Vault\X to Discord\X to Discord Kanban.md` (lanes: todo, in-progress, done). Check it when starting; move cards as status changes.
