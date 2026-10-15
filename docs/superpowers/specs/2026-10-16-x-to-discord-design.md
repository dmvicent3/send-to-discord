# X to Discord: design

Date: 2026-10-16. Status: approved in chat, awaiting written-spec review.

## Goal

A personal Firefox extension that adds a button to every post on X (x.com / twitter.com). Clicking it twice posts the post's link to one Discord channel through a webhook, rewritten to `fxtwitter.com` so Discord renders a proper embed.

Success: from any timeline, profile, or post page, two clicks put a working fxtwitter embed in the channel, and the button is indistinguishable in style from X's own action buttons.

## Decisions

| Topic | Decision |
|---|---|
| Browser | Firefox only, Manifest V3 (`browser_specific_settings.gecko.id` set) |
| Destinations | One webhook URL, set on the options page |
| Message body | Only the fxtwitter link: `{ "content": "<url>" }` |
| Confirmation | Click-to-arm, second click sends; no dialog |
| Build | Plain JavaScript, no bundler; `web-ext` for run/lint/sign |
| Distribution | Self-distributed, signed as an unlisted add-on through AMO (`web-ext sign --channel=unlisted`), so it installs permanently in release Firefox |

## Components

- **`manifest.json`**: MV3; `content_scripts` on `*://x.com/*` and `*://twitter.com/*`; `background.scripts` (Firefox MV3 uses an event page, not a service worker); `host_permissions` for `https://discord.com/api/webhooks/*`; `permissions: ["storage"]`; `options_ui`.
- **`src/fxurl.js`**: pure function `toFxUrl(href) -> string | null`. Loaded first in the content-script list and also importable by tests. No DOM access.
- **`src/content.js`**: finds posts, injects buttons, runs the per-button state machine, messages the background script.
- **`src/background.js`**: receives `{ type: "send", url }`, reads the webhook from `browser.storage.local`, POSTs it, replies `{ ok, status?, error? }`. Also handles `{ type: "open-options" }` and `{ type: "test" }`.
- **`src/options.html` + `src/options.js`**: one input for the webhook URL, Save and Test buttons. Validates the URL starts with `https://discord.com/api/webhooks/` (also accept `discordapp.com` and `ptb.`/`canary.` subdomains).

The webhook POST lives in the background script because X's Content Security Policy blocks `fetch` to discord.com from content-script context.

## URL rewrite (`toFxUrl`)

Input: the href of the post's own permalink. Output: `https://fxtwitter.com/<user>/status/<id>`.

- Accept hosts `x.com`, `twitter.com`, `mobile.twitter.com`, `www.` variants, and relative paths (`/user/status/123`).
- Match `/<user>/status/<digits>`; drop everything after the id (`/photo/1`, `/analytics`, `?s=20&t=...`, `#...`).
- Anything else returns `null`; the button then shows the failed state.

## Finding the post's link

Posts are `article[data-testid="tweet"]`. The permalink is the anchor wrapping the post's own `<time>` element (`a[href*="/status/"]:has(> time)`), which excludes quoted posts (their `time` sits inside a nested container) and links in the post text. When the article is the focused post on a status page and has no such anchor, fall back to `location.href`.

## Injection

- A `MutationObserver` on `document.body` (childList, subtree) collects new articles; processing is batched with `requestAnimationFrame`.
- Each processed article gets `data-x2d="1"` so it is handled once.
- The button goes into the action bar (`[role="group"]` inside the article), as the last item, next to share.

## Styling

- Build the button by cloning the wrapper of X's share button in the same action bar (`cloneNode(true)`), then replace its SVG with ours and strip `data-testid`/`aria-*` from the clone. This inherits X's hashed classes, so size, spacing, alignment, and the round hover background match, including in dim and dark themes.
- Our SVG uses `fill="currentColor"` at the same viewBox size as X's icons.
- Hover and armed colour: Discord blurple `#5865F2`, with hover circle `rgba(88, 101, 242, 0.1)`, applied through a small injected stylesheet keyed on our own class (`.x2d-btn`). Colours for sent (`#00BA7C`, X's green) and failed (`#F4212E`, X's red) come from the same stylesheet.
- If no share button is found to clone, skip that article (rather than inject an off-style button).

## Button state machine

| State | Look | Tooltip (`title`) | Next |
|---|---|---|---|
| idle | grey Discord icon | Send to Discord | click → armed |
| armed | blurple, send-arrow icon | Click again to send | click → sending; 3 s → idle |
| sending | blurple, 50% opacity, clicks ignored | Sending… | response → sent / failed |
| sent | green check | Sent | 2 s → idle |
| failed | red cross | Failed: <reason> | 2 s → idle |

- Every click handler calls `preventDefault()` and `stopPropagation()` so the post does not open.
- State is per button; arming one does not affect others.
- A fast double-click is just two clicks inside the armed window, so it sends.
- If no webhook is configured, the first click (idle) opens the options page instead of arming.

## Errors

- No webhook stored: open options page (see above).
- `toFxUrl` returns `null`: failed state, reason "no post link".
- Non-2xx from Discord (bad webhook 401/404, rate limit 429): failed state with the status code in the tooltip; details logged with `console.warn` in the background script.
- Network error: failed state, reason "network".

## Testing

- `toFxUrl` unit tests with `node --test`: each accepted host, relative paths, trailing segments, query and hash stripping, non-status URLs returning `null`.
- `web-ext lint` clean.
- Manual checklist with `web-ext run`: home timeline, profile, single post page, quoted post (sends the outer post), light and dark theme, no-webhook flow, bad-webhook flow, double-click.

## Out of scope

Multiple webhooks, extra message text, other browsers, keyboard shortcut, context-menu entry.
