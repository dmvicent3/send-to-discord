# X to Discord Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Firefox MV3 extension that adds a click-to-arm button to every X post and sends the post's `fxtwitter.com` link to one Discord webhook.

**Architecture:** Three pure scripts carry the logic and the tests (`fxurl.js`, `webhook.js`, `button-state.js`). Thin adapters wire them to the browser: `content.js` (DOM injection, click handling), `background.js` (webhook POST, since X's CSP blocks it in the page), `options.js` (settings). No bundler: pure scripts define globals for the browser and `module.exports` for Node tests.

**Tech Stack:** Plain JavaScript (ES2022), Firefox WebExtensions MV3, `node --test` (Node 20+), `web-ext` via `npx`.

**Spec:** `docs/superpowers/specs/2026-10-16-x-to-discord-design.md`

## Global Constraints

- Firefox only, Manifest V3, `browser_specific_settings.gecko.id` = `x-to-discord@dmvicent3`, `strict_min_version` = `128.0`.
- Background is `background.scripts` (event page), never `service_worker`.
- Webhook URL lives only in `browser.storage.local` under the key `webhookUrl`; it never appears in the repo.
- Discord message body is exactly `{ "content": "<url>" }`.
- Colours: blurple `#5865F2`, hover circle `rgba(88, 101, 242, 0.1)`, sent `#00BA7C`, failed `#F4212E`.
- Timings: armed → idle after `3000` ms; sent/failed → idle after `2000` ms.
- Tooltips, verbatim: `Send to Discord`, `Click again to send`, `Sending…`, `Sent`, `Failed: <reason>`.
- Every pure file ends with `if (typeof module !== "undefined") module.exports = { ... };` so it loads both as a content/background script and under `require`.
- Done means green: `npm test` passes and `npx web-ext lint --source-dir .` reports 0 errors.

## Review Focus

- **X recycles or re-renders post DOM** (virtualised timeline): the permalink must be resolved at click time, not cached at injection, and a button React removed must be re-injected. Idempotency checks for an existing `.x2d-btn` inside the action bar, not a mark on the article (deviation from the spec's `data-x2d`, for this reason). Covered by Task 4 manual checks 2 and 3.
- **Reposts and quoted posts**: a repost sends the original post's link; a quoted post sends the outer post. Covered by `findPermalink` behaviour (Task 4) and manual check 4.
- **Pasted webhook with whitespace or a `discordapp.com`/`ptb.`/`canary.` host**: accepted after trimming. Covered by `normalizeWebhookUrl` tests (Task 2).
- **Hosts in odd case or `mobile.`/`www.` prefixes, `/i/web/status/<id>` links**: rewritten correctly. Covered by `toFxUrl` tests (Task 1).
- **Discord 429 / 404 / network down**: button shows `Failed: <reason>` and returns to idle; no retry. Covered by `sendToWebhook` tests (Task 2).

---

### Task 1: Scaffold and `toFxUrl`

**Files:**
- Create: `package.json`, `src/fxurl.js`, `test/fxurl.test.js`

**Interfaces:**
- Produces: `toFxUrl(href: string) -> string | null` (global in content scripts; `require("../src/fxurl.js").toFxUrl` in tests).

- [ ] **Step 1: Create `package.json`**: `name: "x-to-discord"`, `private: true`, `scripts.test: "node --test test/"`. No dependencies.

- [ ] **Step 2: Write the failing tests in `test/fxurl.test.js`** (`node:test` + `node:assert/strict`):

```js
const cases = [
  ["https://x.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
  ["https://twitter.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
  ["https://mobile.twitter.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
  ["https://www.x.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
  ["https://X.COM/jack/status/20", "https://fxtwitter.com/jack/status/20"],
  ["/jack/status/20", "https://fxtwitter.com/jack/status/20"],
  ["https://x.com/jack/status/20/photo/1", "https://fxtwitter.com/jack/status/20"],
  ["https://x.com/jack/status/20/analytics", "https://fxtwitter.com/jack/status/20"],
  ["https://x.com/jack/status/20?s=20&t=abc", "https://fxtwitter.com/jack/status/20"],
  ["https://x.com/jack/status/20#m", "https://fxtwitter.com/jack/status/20"],
  ["https://x.com/i/web/status/20", "https://fxtwitter.com/i/status/20"],
];
// test "rewrites status links": each case -> assert.equal(toFxUrl(input), expected)
// test "rejects non-status links": each of
//   "https://x.com/jack", "https://x.com/home", "https://example.com/jack/status/20",
//   "https://x.com/jack/status/abc", "", "not a url"  -> assert.equal(toFxUrl(input), null)
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL, `Cannot find module '../src/fxurl.js'`.

- [ ] **Step 4: Implement `toFxUrl` in `src/fxurl.js`.** Parse with `new URL(href, "https://x.com")` inside try/catch; accept hostnames `x.com`, `twitter.com` with optional `www.` or `mobile.` prefix (URL lowercases them); match the pathname against `^/(\w{1,15}|i/web)/status/(\d+)`; map `i/web` to `i`.

- [ ] **Step 5: Run `npm test`.** Expected: all pass.

- [ ] **Step 6: Commit** `feat: fxtwitter URL rewrite`.

---

### Task 2: Webhook sender, background script, options page, manifest

**Files:**
- Create: `src/webhook.js`, `test/webhook.test.js`, `src/background.js`, `src/options.html`, `src/options.js`, `icons/icon.svg`, `manifest.json`

**Interfaces:**
- Produces in `src/webhook.js`:
  - `normalizeWebhookUrl(input: string) -> string | null`: trimmed URL if valid, else `null`.
  - `sendToWebhook(webhookUrl: string, content: string, fetchImpl = fetch) -> Promise<{ ok: true } | { ok: false, reason: string }>`; never throws.
- Produces the runtime message protocol (`browser.runtime.sendMessage`), handled in `background.js`:
  - `{ type: "has-webhook" }` → `boolean`
  - `{ type: "send", url: string }` → result of `sendToWebhook(stored, url)`
  - `{ type: "open-options" }` → `undefined` (calls `browser.runtime.openOptionsPage()`)

- [ ] **Step 1: Write the failing tests in `test/webhook.test.js`:**

```js
// normalizeWebhookUrl: valid (returns trimmed input)
//   "https://discord.com/api/webhooks/1/abc"
//   "  https://discord.com/api/webhooks/1/abc\n"   -> without whitespace
//   "https://discordapp.com/api/webhooks/1/abc"
//   "https://ptb.discord.com/api/webhooks/1/abc"
//   "https://canary.discord.com/api/webhooks/1/abc"
// normalizeWebhookUrl: invalid -> null
//   "http://discord.com/api/webhooks/1/abc", "https://discord.com/channels/1/2",
//   "https://evil.com/api/webhooks/1/abc", "https://discord.com.evil.com/api/webhooks/1/abc", ""

// sendToWebhook with a fake fetch recording (url, init):
//   204 response -> { ok: true }; init.method === "POST";
//     init.headers["Content-Type"] === "application/json";
//     JSON.parse(init.body) deepEqual { content: "https://fxtwitter.com/jack/status/20" }
//   429 response -> { ok: false, reason: "HTTP 429" }
//   404 response -> { ok: false, reason: "HTTP 404" }
//   fetch rejects -> { ok: false, reason: "network" }
```

- [ ] **Step 2: Run `npm test`.** Expected: webhook tests FAIL (module missing), fxurl tests pass.

- [ ] **Step 3: Implement `src/webhook.js`.** Host check is exact match against `discord.com`, `discordapp.com`, `ptb.discord.com`, `canary.discord.com`; protocol `https:`; pathname starts with `/api/webhooks/`. `sendToWebhook` treats any `response.ok` as success; on failure `console.warn`s the status and body text.

- [ ] **Step 4: Run `npm test`.** Expected: all pass.

- [ ] **Step 5: Write `src/background.js`** implementing the message protocol above with `browser.runtime.onMessage.addListener` returning a Promise; stored URL read via `browser.storage.local.get("webhookUrl")`. `send` with no stored URL returns `{ ok: false, reason: "no webhook" }`.

- [ ] **Step 6: Write `src/options.html` + `src/options.js`.** One text input (prefilled from storage), **Save** (stores `normalizeWebhookUrl(input)`, shows "Saved" or "Not a Discord webhook URL") and **Test** (calls `sendToWebhook(saved, "X to Discord: test message")`, shows "Test sent" or the failure reason). Load `webhook.js` before `options.js`. Respect `prefers-color-scheme`.

- [ ] **Step 7: Write `icons/icon.svg`** (Discord-style glyph, `fill="#5865F2"`) **and `manifest.json`**: name `X to Discord`, version `0.1.0`, gecko id/min version from Global Constraints, `permissions: ["storage"]`, `host_permissions: ["https://discord.com/api/webhooks/*", "https://discordapp.com/api/webhooks/*", "https://ptb.discord.com/api/webhooks/*", "https://canary.discord.com/api/webhooks/*"]`, `background.scripts: ["src/webhook.js", "src/background.js"]`, `options_ui.page: "src/options.html"`, `icons: { "48": "icons/icon.svg", "96": "icons/icon.svg" }`, `content_scripts` on `*://x.com/*`, `*://twitter.com/*`, `*://mobile.twitter.com/*` with `js: ["src/fxurl.js", "src/button-state.js", "src/content.js"]`, `run_at: "document_idle"`. Create empty `src/button-state.js` and `src/content.js` placeholders so lint resolves them (Tasks 3 and 4 fill them).

- [ ] **Step 8: Verify.** `npx web-ext lint --source-dir . --ignore-files "test/**" "docs/**"` → 0 errors. Then `npx web-ext run --source-dir .`, open the add-on's options, paste a real webhook, Save, Test → the test message appears in the channel.

- [ ] **Step 9: Commit** `feat: webhook sender, background, options page, manifest`.

---

### Task 3: Button state machine

**Files:**
- Create: `test/button-state.test.js`
- Modify: `src/button-state.js`

**Interfaces:**
- Produces:
  - `STATES = { idle, armed, sending, sent, failed }` (string values equal to the keys).
  - `ARM_MS = 3000`, `RESULT_MS = 2000`.
  - `transition(state: string, event: string) -> string` with events `"click" | "timeout" | "sent" | "failed"`.
  - `TOOLTIP: Record<state, string>`; `failed` holds `"Failed: "` (content.js appends the reason).

- [ ] **Step 1: Write the failing tests** asserting this exact table, and that every unlisted `(state, event)` pair returns `state` unchanged:

| from | event | to |
|---|---|---|
| idle | click | armed |
| armed | click | sending |
| armed | timeout | idle |
| sending | sent | sent |
| sending | failed | failed |
| sent | timeout | idle |
| failed | timeout | idle |

Plus: `sending` + `click` → `sending`; `sent` + `click` → `sent`; tooltips equal the Global Constraints strings.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement** as a lookup table keyed `"state:event"`.

- [ ] **Step 4: Run `npm test`.** Expected: all pass.

- [ ] **Step 5: Commit** `feat: button state machine`.

---

### Task 4: Content script (injection, styling, wiring)

**Files:**
- Modify: `src/content.js`

**Interfaces:**
- Consumes: `toFxUrl` (Task 1), `transition`, `STATES`, `ARM_MS`, `RESULT_MS`, `TOOLTIP` (Task 3), the runtime message protocol (Task 2).
- Internal functions (names fixed so reviewers can find them):
  - `findPermalink(article: Element) -> string | null`: href of `a[href*="/status/"]` whose direct child is a `<time>` and whose closest `article` is `article` itself (excludes quoted posts); falls back to `location.href` when `article` is the only post with no such anchor on a `/status/` page.
  - `injectButton(article: Element) -> void`: no-op if the article's `[role="group"]` already contains `.x2d-btn` or has no share button to clone.
  - `render(btn: Element, state: string, reason?: string) -> void`: sets icon, `data-state`, and `title`.

- [ ] **Step 1: Stylesheet.** Inject one `<style id="x2d-style">` at startup with rules keyed on `.x2d-btn` and `[data-state]`: hover/armed/sending colour `#5865F2` and hover circle `rgba(88, 101, 242, 0.1)` (target the same inner element X uses for its hover circle, found by inspecting the cloned share button), `sending` at `opacity: 0.5`, `sent` `#00BA7C`, `failed` `#F4212E`.

- [ ] **Step 2: Injection.** Share button = the last direct child of `[role="group"]` that contains a `button`. `cloneNode(true)` its wrapper, remove every `data-testid` and `aria-*` attribute in the clone, add class `x2d-btn`, set `aria-label` to the current tooltip, swap the `<svg>` for ours (same `viewBox="0 0 24 24"`, `fill="currentColor"`, X's icon classes copied from the original svg). Icons: Discord glyph (idle), send arrow (armed/sending), check (sent), cross (failed). Append after the share button.

- [ ] **Step 3: Observer.** `MutationObserver` on `document.body` (`childList`, `subtree`) queues a single `requestAnimationFrame` that runs `injectButton` over every `article[data-testid="tweet"]` in the document. Run once at startup.

- [ ] **Step 4: Click handling.** One listener per button; `preventDefault()` + `stopPropagation()` on every click. In `idle`: ask `has-webhook`; if false send `open-options` and stay idle; else move to `armed` and start a `ARM_MS` timer. In `armed`: clear the timer, resolve `toFxUrl(findPermalink(article))` *now* (not cached); if `null` go to `failed` with reason `no post link`; else go to `sending` and send `{ type: "send", url }`, then `sent` or `failed` with `reason`. After `sent`/`failed` start a `RESULT_MS` timer back to `idle`. All state changes go through `transition` and `render`.

- [ ] **Step 5: Verify.** `npm test` and `npx web-ext lint ...` (as Task 2) are green. Then `npx web-ext run --source-dir . --start-url https://x.com/home` (log in to X in the launched profile) and check each:
  1. Home timeline, light and dark theme: button aligned and spaced like share, grey at rest, blurple on hover.
  2. Scroll far down and back up: every post has exactly one button.
  3. Open a post, go back, open another: buttons present each time; the sent link matches the post clicked.
  4. Repost sends the original's link; a post quoting another sends the outer post.
  5. Single click then wait 3 s: returns to idle, nothing sent. Fast double-click: sends once, green check, back to idle after 2 s. Clicking the button never opens the post.
  6. Clear the webhook in options: click opens options. Set a broken webhook (`.../webhooks/1/wrong`): red cross, tooltip `Failed: HTTP 401` or `HTTP 404`.
  7. Discord channel shows a full fxtwitter embed for each sent link.

- [ ] **Step 6: Commit** `feat: inject send-to-Discord button on X posts`.

---

### Task 5: README and signed build

**Files:**
- Create: `README.md`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Scripts.** Add `lint: "web-ext lint --source-dir . --ignore-files test/** docs/** node_modules/**"`, `start: "web-ext run --source-dir . --start-url https://x.com/home"`, `sign: "web-ext sign --channel=unlisted --source-dir . --ignore-files test/** docs/** node_modules/**"` (each prefixed `npx`).

- [ ] **Step 2: README.md**: what it does, install from the signed `.xpi`, set the webhook in options, dev commands, and that signing needs `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` from https://addons.mozilla.org/developers/addon/api/key/ (kept in the shell or an untracked `.env`, never committed).

- [ ] **Step 3: Sign (needs the user's AMO keys; stop and ask for them to be set).** `npm run sign` → `.xpi` in `web-ext-artifacts/`. Install it in Firefox release via `about:addons` → gear → Install Add-on From File; restart Firefox; button still present.

- [ ] **Step 4: Commit** `docs: README and signing scripts`, then `git push`.
