# Send to Discord: YouTube Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A click-to-arm Discord button after Share on the YouTube watch page that sends the clean `https://www.youtube.com/watch?v=<id>` link to the webhook.

**Architecture:** One pure, tested URL function (`src/sites/youtube-url.js`) and one thin adapter (`src/sites/youtube.js`) that clones YouTube's Share `<button>`, wires it with the shared `wireButton`, and resolves the link from `location.href` at click time. A third `content_scripts` entry; background unchanged.

**Tech Stack:** Plain JavaScript, Firefox MV3, `node --test`, `web-ext`.

**Spec:** `docs/superpowers/specs/2026-10-17-youtube-support-design.md`

## Global Constraints

- Sent link, exactly: `https://www.youtube.com/watch?v=<id>`; id matches `^[A-Za-z0-9_-]{11}$`; no timestamp, no other parameters.
- Labels, verbatim: `Discord`, `Send?`, `Sending…`, `Sent ✓`, `Failed`; failure reason in `title`. Armed 3000 ms, result 2000 ms (from `button-state.js`).
- Colours: armed/sending `#5865F2` (sending opacity 0.5), sent `#00BA7C`, failed `#F4212E`.
- Content script `matches: ["*://www.youtube.com/*"]`; no new permissions.
- Pure files end with `if (typeof module !== "undefined") module.exports = { ... };` and touch no browser globals.
- Done means green: `npm test` passes and `npm run lint` reports 0 errors, 0 warnings.

## Review Focus

- **Navigating to another video without a reload** keeps the row on screen: the button must send the video now playing. Covered by resolving from `location.href` at click time (Task 2) and manual check 4.
- **YouTube re-rendering the action row** (navigation, resize, theater mode) can drop or duplicate the button: exactly one `.s2d-yt` per row. Covered by the idempotent scan (Task 2) and manual checks 4 and 6.
- **Links copied from playlists or with `&t=`/`si=`** must come out bare. Covered by Task 1 tests.
- **Non-English YouTube UI**: Share must be found without its label text (the user's UI may be Portuguese). Covered by locating Share structurally (Task 2) and manual check 1.
- **Non-video pages** (home, Shorts, channel) never get a button, and a stale button never sends a non-video URL. Covered by `youtubeLink` returning `null` (Task 1) and the `no post link` failure path.

---

### Task 1: `youtubeLink`

**Files:**
- Create: `src/sites/youtube-url.js`, `test/youtube-url.test.js`

**Interfaces:**
- Produces: `youtubeLink(href: string) -> string | null`.

- [ ] **Step 1: Write the failing tests** in `test/youtube-url.test.js`:

```js
const ID = "dQw4w9WgXcQ";
const LINK = `https://www.youtube.com/watch?v=${ID}`;
// "returns the bare watch link for every video URL form"
for (const href of [
  LINK,
  `https://youtube.com/watch?v=${ID}`,
  `https://m.youtube.com/watch?v=${ID}`,
  `https://youtu.be/${ID}`,
  `https://youtu.be/${ID}?si=abc&t=30`,
  `/watch?v=${ID}`,
  `https://www.youtube.com/watch?v=${ID}&t=754s&si=x&pp=y&list=PL1&index=3`,
  `https://www.youtube.com/watch?list=PL1&v=${ID}`,
]) assert.equal(youtubeLink(href), LINK, href);
// "returns null for anything that is not a video"
for (const href of [
  "https://www.youtube.com/",
  `https://www.youtube.com/shorts/${ID}`,
  "https://www.youtube.com/@channel",
  "https://www.youtube.com/results?search_query=x",
  "https://www.youtube.com/watch",
  "https://www.youtube.com/watch?v=short",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQx",
  "https://www.youtube.com/watch?v=dQw4w9WgX!Q",
  `https://evil.com/watch?v=${ID}`,
  `https://youtube.com.evil.com/watch?v=${ID}`,
  "",
]) assert.equal(youtubeLink(href), null, href);
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL, `Cannot find module '../src/sites/youtube-url.js'`.
- [ ] **Step 3: Implement `youtubeLink`** per the spec's Link section: `new URL(href, "https://www.youtube.com")` inside try/catch; hosts compared lower-case.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: clean YouTube watch links`.

---

### Task 2: YouTube adapter

**Files:**
- Create: `src/sites/youtube.js`
- Modify: `manifest.json`, `README.md`, `AGENTS.md` (design docs list)

**Interfaces:**
- Consumes: `wireButton(el, { render, resolve })` and `STATES` (`src/core`), `youtubeLink` (Task 1).

- [ ] **Step 1: Inject.** On each scan, for each `ytd-watch-metadata #top-level-buttons-computed` row:
  - skip it if it already contains `.s2d-yt`;
  - Share = the row's last element child, located by position, never by label;
  - take Share's `<button>` and skip if there is none;
  - deep-clone that button and strip `id`, `aria-*` and `data-*` from it and its descendants;
  - replace the contents of its `.yt-spec-button-shape-next__icon` with a 24×24 Discord `svg` (`fill="currentColor"`, path copied from `ICONS.discord` in `src/sites/x.js`); if that element is missing, prepend the svg;
  - put the label in `.yt-spec-button-shape-next__button-text-content`, creating that span when Share has none;
  - wrap the button in `<div class="s2d-yt">`, then insert the wrapper with `share.after(wrapper)`.

  Scan via a body `MutationObserver` with one `requestAnimationFrame` scan per batch, plus an initial scan (same pattern as `x.js`).
- [ ] **Step 2: Style and render.**
  - Inject a `<style id="s2d-yt-style">` with:
    - `.s2d-yt { margin-left: 8px; }`;
    - the Global Constraints colours keyed on `.s2d-yt[data-state=…] button`;
    - `.s2d-yt svg { width: 24px; height: 24px; }`.
  - `render(state, detail)`:
    - sets `data-state` on the wrapper;
    - sets the label text from the Global Constraints labels;
    - sets `title` to `Failed: <detail>` when failed, otherwise the label.
- [ ] **Step 3: Resolve.** `resolve = async () => { const url = youtubeLink(location.href); return url ? { type: "send", url } : null; }`.
- [ ] **Step 4: Manifest and docs.**
  - **Manifest:** a third `content_scripts` entry with `matches: ["*://www.youtube.com/*"]`, `js: ["src/core/button-state.js", "src/core/arm.js", "src/sites/youtube-url.js", "src/sites/youtube.js"]` and `run_at: "document_idle"`.
  - **Manifest `description`:** `"Adds a button to X, Reddit and YouTube posts that sends them to a Discord webhook."`
  - **README:** a YouTube section covering the watch page only, what is sent and the labels.
  - **`AGENTS.md`:** add this spec and plan to the design docs list (load writing-for-agents first).
- [ ] **Step 5: Run `npm test` and `npm run lint`.** Expected: all pass, 0/0/0.
- [ ] **Step 6: Manual (`npm start`, then open a YouTube video)**, the spec's six checks:
  1. Placement and style in light and dark mode (and in the user's UI language).
  2. The link arrives in Discord with the player.
  3. A `&t=` or playlist video sends a bare link.
  4. Moving to a sidebar video, then sending, gives the new video and only one button.
  5. A single click times out after 3 s.
  6. Theater mode and a narrow window keep the button.
- [ ] **Step 7: Commit** `feat: send-to-Discord button on YouTube watch pages`.
