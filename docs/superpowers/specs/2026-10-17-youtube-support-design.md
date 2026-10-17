# Send to Discord: YouTube support

Date: 2026-10-17. Status: approved in chat, awaiting written-spec review. Builds on `2026-10-16-reddit-support-design.md` (core/sites structure, `wireButton`).

## Goal

A click-to-arm Discord button on the YouTube watch page that sends the video's clean link to the same webhook. Discord embeds YouTube links natively with an inline player, so no embed fixer and no file upload are needed.

Success: on `www.youtube.com/watch`, two clicks on the Discord button put `https://www.youtube.com/watch?v=<id>` in the channel for the video currently playing, including after moving to another video without a page reload. X and Reddit behave as before.

## Decisions

| Topic | Decision |
|---|---|
| What is sent | The link only, `https://www.youtube.com/watch?v=<id>`; Discord shows its own player |
| Timestamp | Never: the link always starts at 0 |
| Other parameters | Dropped (`t`, `si`, `pp`, `list`, `index`, and anything else) |
| Where | Watch page only, directly after YouTube's Share button. Not Shorts, not thumbnail grids |
| Look | Cloned from YouTube's Share button (inherits light/dark styling), Discord glyph, text label |
| Destination | Same single webhook |

## Link

`youtubeLink(href) -> string | null` in `src/sites/youtube-url.js` (pure, tested):

- Parses `href` (relative resolves against `https://www.youtube.com`).
- Host `youtube.com`, `www.youtube.com` or `m.youtube.com` with path `/watch` and a `v` parameter; or host `youtu.be` with the id as the first path segment.
- The id must match `^[A-Za-z0-9_-]{11}$`.
- Returns `https://www.youtube.com/watch?v=<id>`; anything else (Shorts, channels, home, search, malformed id, other hosts) → `null`.

## Button

- Anchor: YouTube's Share button in the watch page's action row (inside `ytd-watch-metadata`). The adapter clones the Share wrapper's plain `<button>` (it carries YouTube's `yt-spec-button-shape-next` styling classes) into a plain `<div class="s2d-yt">`. The wrapper itself is a YouTube custom element and is not cloned: cloning it would re-run YouTube's rendering and overwrite the icon and label. The clone has `id`, `aria-*` and test attributes stripped.
- The clone's icon is replaced with the Discord glyph (same path data as X, `fill="currentColor"`), and its text becomes the state label.
- Inserted directly after the Share wrapper. When YouTube shows Download, Clip or Save after Share, the Discord button sits before them.
- Reconciled, not just skipped (`placement(row)` in `src/sites/youtube-dom.js`, pure, tested): Share is the last child with a rendered `<button>` that is neither ours nor part of the like/dislike control (no `--segmented-` button); nothing is injected until it exists. Our button is moved back after Share if YouTube re-adds Share after it, and duplicates are removed. A `MutationObserver` with one scan per animation frame re-adds it after YouTube re-renders the row (navigation between videos, layout changes).
- Labels per state: `Discord` · `Send?` · `Sending…` · `Sent ✓` · `Failed`; the failure reason goes in the button's `title`. Colours via a small injected stylesheet keyed on `data-state`: armed and sending `#5865F2` (sending at half opacity), sent `#00BA7C`, failed `#F4212E`. Timings as X: armed 3 s, result 2 s.

## Resolving what to send

`resolve()` runs on the second click and returns `{ type: "send", url: youtubeLink(location.href) }`, or `null` when the current page is not a video (→ `Failed`, reason `no post link`). It reads `location.href` at click time because YouTube changes videos without reloading and keeps the same row on screen. The background script is unchanged.

## Manifest

Third `content_scripts` entry: `matches: ["*://www.youtube.com/*"]`, `js: ["src/core/button-state.js", "src/core/arm.js", "src/sites/youtube-url.js", "src/sites/youtube.js"]`, `run_at: "document_idle"`. The script loads on every YouTube page (YouTube is a single-page app, so a match on `/watch*` alone would miss navigations from the home page); it adds nothing outside the watch page. No new permissions.

## Testing

- `youtubeLink`:
  - plain watch link;
  - `youtu.be/<id>`;
  - `m.youtube.com` and bare `youtube.com`;
  - extra `t`, `si`, `pp`, `list` and `index` parameters dropped;
  - relative `/watch?v=<id>`;
  - Shorts, channel, home and search pages → `null`;
  - id of the wrong length or with bad characters → `null`;
  - another host → `null`.
- `npm test` and `npm run lint` green; X and Reddit tests unchanged.
- Manual on `www.youtube.com`:
  1. Button right after Share, matching its style, in light and dark theme.
  2. Two clicks send `https://www.youtube.com/watch?v=<id>` and Discord shows the player.
  3. Open a video with `&t=` / from a playlist: the sent link has neither.
  4. Click another video from the sidebar, then send: the new video's link, one button only.
  5. One click and wait 3 s: back to `Discord`, nothing sent.
  6. Theater mode and a narrow window: the button stays in the row.

## Out of scope

Shorts, thumbnail grids, timestamps, playlist links, `music.youtube.com`, uploading video files.
