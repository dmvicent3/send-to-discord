# Send to Discord: Reddit Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the click-to-arm button to old-layout Reddit posts (RES on `www.reddit.com`), uploading image/gallery posts as files and sending links otherwise, and rename the extension to Send to Discord.

**Architecture:** Split today's X-only content script into shared `src/core/` (state machine, arm/click handling, webhook + file sending) and per-site adapters in `src/sites/`. Reddit decisions live in pure files tested with fixtures and fake elements; `reddit.js` only reads the DOM, fetches the post JSON and wires the button. The background script gains a `send-files` message that downloads media and posts multipart batches.

**Tech Stack:** Plain JavaScript, Firefox MV3, `node --test`, `web-ext`.

**Spec:** `docs/superpowers/specs/2026-10-16-reddit-support-design.md`

## Global Constraints

- Gecko id stays `x-to-discord@dmvicent3`; `strict_min_version` stays `142.0`.
- Pure files end with `if (typeof module !== "undefined") module.exports = { ... };` and touch no browser globals.
- One webhook (`browser.storage.local` key `webhookUrl`) for both sites.
- Reddit labels, verbatim: `discord`, `send?`, `sending…`, `sent ✓`, `failed: <reason>`. Timings as X: armed 3000 ms, result 2000 ms.
- `EMBED_HOST = "rxddit.com"`; rxddit link = `https://rxddit.com` + permalink.
- Gallery batch size `10`; download cap `100 * 1024 * 1024` bytes.
- Image messages carry no text: multipart `payload_json` is exactly `{}`.
- Done means green: `npm test` passes and `npm run lint` reports 0 errors, 0 warnings.

## Review Focus

- **RES never-ending scroll and expandos** add `.thing` nodes late and may re-render rows: one button per post, added for page 2+. Covered by the observer in Task 5 and manual check 3.
- **Comment threads on a post page** contain `.thing.comment` with their own `.flat-list.buttons`: only the post's row gets a button. Covered by `findOwnButtonsRow` tests (Task 4).
- **Galleries with removed/failed items or more than 10 images**: invalid items skipped, order kept, 10/10/n batches. Covered by Task 2 and Task 3 tests.
- **Upload rejected as too large (413) or an image download failing**: the rxddit link is sent instead and the button shows `sent ✓`. Covered by `sendFiles` tests (Task 3).
- **X regressions from the restructure**: X behaves exactly as before. Covered by the moved X tests (Task 1) and the X manual pass (Task 1 Step 6).

---

### Task 1: Restructure into core and sites (no behaviour change)

**Files:**
- Move: `src/button-state.js` → `src/core/button-state.js`; `src/webhook.js` → `src/core/webhook.js`; `src/fxurl.js` → `src/sites/fxurl.js`; `src/dom.js` → `src/sites/x-dom.js`; `src/content.js` → `src/sites/x.js`
- Create: `src/core/arm.js`
- Modify: `manifest.json`, `src/options.html`, all `test/*.test.js` require paths

**Interfaces:**
- Produces in `src/core/arm.js` (browser-only, not unit-tested):
  - `wireButton(el: Element, { render(state: string, reason?: string): void, resolve(): Promise<SendMessage | null> }): void`. `null` from `resolve` → failed with reason `no post link`. Keeps the cached `hasWebhook` and the `open-options` behaviour.
  - `SendMessage = { type: "send", url: string } | { type: "send-files", urls: string[], fallback: string }`; the reply `{ ok: true } | { ok: false, reason: string }` drives sent/failed.
- `src/sites/x.js` keeps `alignToShare`, `injectButton`, the stylesheet and observer; it passes `render` (today's icon/tooltip `render`) and `resolve = async () => { const url = toFxUrl(findPermalink(article) ?? ""); return url ? { type: "send", url } : null; }`.

- [ ] **Step 1: `git mv` the files** and update every `require` in `test/` to the new paths. Run `npm test`. Expected: 22/22 pass.
- [ ] **Step 2: Extract `wireButton` into `src/core/arm.js`** with the interface above; `x.js` calls it. The `hasWebhook` cache and `storage.onChanged` listener move with it.
- [ ] **Step 3: Update `manifest.json`**: background `["src/core/webhook.js", "src/background.js"]`; X content script `js: ["src/core/button-state.js", "src/core/arm.js", "src/sites/fxurl.js", "src/sites/x-dom.js", "src/sites/x.js"]`. Update `src/options.html` to load `core/webhook.js`.
- [ ] **Step 4: Update `AGENTS.md`** "Shape" section to name `src/core/` and `src/sites/` and the per-site adapter rule.
- [ ] **Step 5: Run `npm test` and `npm run lint`.** Expected: 22/22, lint 0/0/0.
- [ ] **Step 6: X regression (manual, `npm start`):** button placement, arm/send, fast double-click, no-webhook opens options. Expected: identical to before.
- [ ] **Step 7: Commit** `refactor: split core and site adapters`.

---

### Task 2: `planRedditShare`

**Files:**
- Create: `src/sites/reddit-share.js`, `test/reddit-share.test.js`, `test/fixtures/reddit/*.json`

**Interfaces:**
- Produces: `EMBED_HOST`, `rxdditLink(permalink: string) -> string`, `planRedditShare(post: object) -> { type: "files", urls: string[], fallback: string } | { type: "link", url: string }` where `post = json[0].data.children[0].data`.

- [ ] **Step 1: Write fixtures** (hand-trimmed to the fields the spec's rules read): `image.json`, `gif.json`, `gallery.json` (3 items, the 2nd `status: "failed"`, the 3rd animated with `s.gif`), `gallery-empty.json`, `video.json`, `external.json` (`url: "https://www.youtube.com/watch?v=x"`), `self.json`, `crosspost-image.json`, `crosspost-video.json`.
- [ ] **Step 2: Write the failing tests**, one per fixture:

```js
// image   -> { type: "files", urls: ["https://i.redd.it/abc.jpg"], fallback: "https://rxddit.com/r/pics/comments/1/t/" }
// gif     -> files ["https://i.redd.it/def.gif"]
// gallery -> files ["https://i.redd.it/m1.jpg", "<item 3 s.gif>"]   (order kept, failed item skipped)
// gallery-empty, video, self -> { type: "link", url: "https://rxddit.com" + permalink }
// external -> { type: "link", url: "https://www.youtube.com/watch?v=x" }
// crosspost-image -> files from the parent; fallback built from the parent's permalink
// crosspost-video -> rxddit link of the parent
// rxdditLink("/r/a/comments/1/t/") === "https://rxddit.com/r/a/comments/1/t/"
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL, module missing.
- [ ] **Step 4: Implement** following the spec's ordered rules 1–6 and the `m` → extension map.
- [ ] **Step 5: Run `npm test`.** Expected: all pass.
- [ ] **Step 6: Commit** `feat: decide what to send for a Reddit post`.

---

### Task 3: File sending (webhook + background)

**Files:**
- Modify: `src/core/webhook.js`, `test/webhook.test.js`, `src/background.js`, `manifest.json`

**Interfaces:**
- Produces in `src/core/webhook.js`:
  - `fileNameFromUrl(url: string) -> string`: last path segment, query dropped.
  - `sendFilesToWebhook(webhookUrl, files: { name: string, blob: Blob }[], fetchImpl = fetch) -> Promise<{ ok: true } | { ok: false, reason: string, tooLarge?: true }>`: batches of 10, `FormData` with `payload_json` = `"{}"` and `files[i]`; stops at the first failing batch; 413 sets `tooLarge: true`.
  - `sendFiles(webhookUrl, urls: string[], fallback: string, fetchImpl = fetch) -> Promise<{ ok: true } | { ok: false, reason: string }>`: downloads (cap 100 MiB via `Content-Length`), then `sendFilesToWebhook`; download failure, over-cap, or `tooLarge` → `sendToWebhook(webhookUrl, fallback, fetchImpl)`.
- Background handles `{ type: "send-files", urls, fallback }` → `sendFiles(stored, urls, fallback)`.

- [ ] **Step 1: Write the failing tests** (fake fetch routing by URL; Node 20+ has `FormData`/`Blob`):
  - `fileNameFromUrl("https://i.redd.it/abc.jpg?x=1") === "abc.jpg"`.
  - 1 file → 1 request; body is `FormData` with `payload_json === "{}"` and `files[0]` named `abc.jpg`.
  - 23 files → 3 requests with 10, 10, 3 files, in input order.
  - batch returns 413 → `{ ok: false, reason: "HTTP 413", tooLarge: true }`, no further batches.
  - `sendFiles`: all good → `{ ok: true }` and no fallback request; a 404 download → exactly one JSON request `{ content: fallback }`; `Content-Length: 104857601` → fallback without reading the body; upload 413 → fallback sent, result `{ ok: true }`.
- [ ] **Step 2: Run `npm test`.** Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three functions; wire `send-files` in `background.js`.
- [ ] **Step 4: Manifest**: add `https://i.redd.it/*`, `https://preview.redd.it/*` to `host_permissions`; `data_collection_permissions.required` → `["browsingActivity", "websiteContent"]`.
- [ ] **Step 5: Run `npm test` and `npm run lint`.** Expected: all pass, lint 0/0/0.
- [ ] **Step 6: Commit** `feat: upload image files to the webhook in batches`.

---

### Task 4: Reddit DOM lookups

**Files:**
- Create: `src/sites/reddit-dom.js`, `test/reddit-dom.test.js`

**Interfaces:**
- Produces (using only `children`, `parentElement`, `getAttribute`, like `x-dom.js`):
  - `hasClass(node, name) -> boolean`
  - `isPost(node) -> boolean`: element with classes `thing` and `link` (not `comment`).
  - `findOwnButtonsRow(thing) -> Element | null`: the first `ul` with classes `flat-list` and `buttons` under `thing`, not descending into nested `.thing` elements.
  - `postPermalink(thing) -> string | null`: `data-permalink`.

- [ ] **Step 1: Write the failing tests** with the `h()` fake-element helper (copy it from `test/dom.test.js` into a shared `test/helpers/fake-dom.js` and use it from both):
  - a link thing with `.entry > ul.flat-list.buttons` → that row;
  - a post-page thing whose comment area holds `.thing.comment` rows before/after → still the post's own row;
  - a `.thing.comment` → `isPost` false;
  - a thing with no row → `null`; `postPermalink` reads `data-permalink`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: old-Reddit DOM lookups`.

---

### Task 5: Reddit adapter

**Files:**
- Create: `src/sites/reddit.js`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: `wireButton` (Task 1), `planRedditShare`, `rxdditLink` (Task 2), `send-files` message (Task 3), `isPost`, `findOwnButtonsRow`, `postPermalink` (Task 4).

- [ ] **Step 1: Inject.** For every `div.thing.link` passing `isPost`, take `findOwnButtonsRow`; skip if missing or it already has `.s2d-reddit`; append `<li class="s2d-reddit"><a href="#">discord</a></li>`. Observer: same one-scan-per-frame pattern as `x.js`. Do nothing when the page has no `.thing` (new design).
- [ ] **Step 2: Render.** `render(state, reason)` sets the anchor text to the Global Constraints label (`failed: ` + reason) and `data-state` on the `li`.
- [ ] **Step 3: Resolve.** `fetch(permalink + ".json?raw_json=1", { credentials: "include" })`; plan with `planRedditShare`; map `files` → `{ type: "send-files", urls, fallback }`, `link` → `{ type: "send", url }`. Fetch or parse failure → `{ type: "send", url: rxdditLink(permalink) }`. No permalink → `null`.
- [ ] **Step 4: Manifest**: second `content_scripts` entry, `matches: ["*://www.reddit.com/*", "*://old.reddit.com/*"]`, `js: ["src/core/button-state.js", "src/core/arm.js", "src/sites/reddit-share.js", "src/sites/reddit-dom.js", "src/sites/reddit.js"]`, `run_at: "document_idle"`.
- [ ] **Step 5: Run `npm test` and `npm run lint`.** Expected: all pass, 0/0/0.
- [ ] **Step 6: Manual (RES old layout on `www.reddit.com`, `npm start` with RES installed in the profile):**
  1. Listing: one `discord` link per post, styled like `crosspost`, in night mode.
  2. Post page: only the post's row gets it, no comment rows.
  3. Never-ending scroll page 2: buttons present.
  4. Image → image in Discord, no text. GIF → animated.
  5. Gallery with > 10 images → several messages, in order.
  6. Video → rxddit link plays with sound.
  7. External (YouTube/imgur) → that URL. Text post → rxddit link.
  8. Crosspost of an image → the parent's image. NSFW post → works while logged in.
  9. Single click, wait 3 s → back to `discord`, nothing sent.
- [ ] **Step 7: Commit** `feat: send-to-Discord button on old-layout Reddit`.

---

### Task 6: Rename to Send to Discord

**Files:**
- Modify: `manifest.json`, `package.json`, `README.md`, `AGENTS.md`; vault `AGENTS.md`; vault board

- [ ] **Step 1: Manifest** `name: "Send to Discord"`, `description: "Adds a button to X and Reddit posts that sends them to a Discord webhook."`, `version: "0.2.0"`; gecko id unchanged. `package.json` `name: "send-to-discord"`. `src/options.js` test message → `"Send to Discord: test message"`; project `AGENTS.md` title → `# Send to Discord`.
- [ ] **Step 2: README** rewritten for both sites (Reddit section: needs the old layout, which RES provides; what each post type sends).
- [ ] **Step 3: Run `npm test` and `npm run lint`.** Expected: all pass, 0/0/0. **Commit** `chore: rename to Send to Discord`, merge the branch to `main`, `git push`.
- [ ] **Step 4: GitHub:** `gh repo rename send-to-discord -R dmvicent3/x-to-discord`, then `git remote set-url origin https://github.com/dmvicent3/send-to-discord.git`; `git fetch` succeeds.
- [ ] **Step 5: Folder** (ask the user to close editors/terminals in it first): rename `Desktop\Projects\x-to-discord` → `send-to-discord`; update the project path in the vault `AGENTS.md` project line (the vault board already moved to `Send to Discord/Send to Discord Kanban.md` on 2026-10-16).
- [ ] **Step 6: Sign** (user, with AMO keys): `npm run sign`, install the `0.2.0` `.xpi` over the existing add-on; the webhook setting survives (same id).
