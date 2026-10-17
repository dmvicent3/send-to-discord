# Send to Discord: Reddit support and rename

Date: 2026-10-16. Status: approved. 2026-10-17: embed host switched from rxddit.com (answers "Forbidden." to every request, including Discordbot) to vxreddit.com (player embed with audio). Builds on `2026-10-16-x-to-discord-design.md`.

## Goal

Add the same click-to-arm "send to Discord" button to Reddit posts, for the user's setup: `www.reddit.com` rendered in the **old layout by RES** (not `old.reddit.com`). Image posts are uploaded to Discord as files; everything else is sent as a link that embeds well. Rename the extension to **Send to Discord**.

Success: on an RES old-layout listing or post page, two clicks on `discord` put the image(s) in the channel for image/gallery posts, and a playable/previewable link for video, external and text posts; X keeps working exactly as today.

## Decisions

| Topic | Decision |
|---|---|
| Layout | Old layout only, detected from the DOM; new Reddit design gets nothing |
| Hosts | Content script on `www.reddit.com` and `old.reddit.com` |
| Destination | Same single webhook as X |
| Image/GIF post | Upload the file; message has no text |
| Gallery | Upload images, 10 per message, more messages if needed; no text |
| Reddit video | Upload the merged mp4 (video + audio) that the vxreddit page offers as `og:video`; downloaded in memory with `cache: "no-store"`. No mp4, failed download or too large → link `https://vxreddit.com<permalink>` |
| External link post | The external URL as-is |
| Text post / anything else | vxreddit link |
| Crosspost | Decide and build from the crosspost parent |
| Upload size | No hard-coded Discord limit: try, and on HTTP 413 send the vxreddit link instead. Skip download (go to link) for files over 100 MiB |
| Name | Display name `Send to Discord`; repo, folder and package `send-to-discord`; gecko id stays `x-to-discord@dmvicent3` so the signed install keeps updating |

## Structure

Shared code moves under `src/core/`, each site gets one adapter under `src/sites/`, and each site is its own `content_scripts` entry so neither loads on the other site.

- `src/core/button-state.js`: unchanged state machine; `TOOLTIP` stays for X.
- `src/core/arm.js`: the per-button click handling extracted from today's `content.js` (`wireButton`), parameterised by `render(state, reason)` and `resolve() -> Promise<message>` so both sites share timers, arming and the cached `hasWebhook`.
- `src/core/webhook.js`: existing `normalizeWebhookUrl`, `sendToWebhook`, plus `sendFilesToWebhook` (below).
- `src/sites/x.js`: today's `content.js` + `dom.js` behaviour, unchanged, using `arm.js`.
- `src/sites/reddit-share.js`: pure `planRedditShare(post)` (below).
- `src/sites/reddit-dom.js`: pure lookups on old-layout markup, same fake-element testing style as `dom.js`.
- `src/sites/reddit.js`: Reddit adapter (inject, resolve, wire).
- `src/background.js`: handles `send` (link) and new `send-files`.

## Reddit button

- Posts are `div.thing.link` (comments are `.thing.comment` and are ignored). Each post's own action row is `.flat-list.buttons` inside the post's own `.entry`, not a nested comment's.
- Append `<li class="s2d-reddit"><a role="button">discord</a></li>` (no `href`: a `#` link scrolls the page to the top) as the row's last item. It inherits the row's link styling, so RES themes (night mode) apply.
- Idempotent: skip a row that already contains `.s2d-reddit`. A `MutationObserver` with one scan per animation frame covers RES never-ending scroll and expandos.
- Labels per state: `discord` · `send?` · `sending…` · `sent ✓` · `failed: <reason>`; same timings as X (armed 3 s, result 2 s).

## Resolving what to send

On the second click the adapter reads `data-permalink` from the post and fetches `<permalink>.json?raw_json=1` (same origin, so the user's session applies to NSFW and quarantined posts). `post = json[0].data.children[0].data`; `src = post.crosspost_parent_list?.[0] ?? post`.

`planRedditShare(post) -> { type: "files", urls: string[], fallback: string } | { type: "link", url: string }`, in this order:

1. `src.is_gallery`: for each `src.gallery_data.items` (in order) take `src.media_metadata[item.media_id]`, skipping entries whose `status !== "valid"`; URL is `s.gif` when present, otherwise `https://i.redd.it/<media_id>.<ext>` with `ext` from `m` (`image/jpg`→`jpg`, `image/png`→`png`, `image/gif`→`gif`, `image/webp`→`webp`). No valid entries → vxreddit link.
2. `src.is_video` or `src.domain === "v.redd.it"` → `{ type: "video", page: <vxreddit link> }`; the background fetches the page, uploads its `og:video` mp4 via `sendFiles` with the page link as fallback (message `{ type: "send-video", page }`).
3. `src.domain === "i.redd.it"` or `src.post_hint === "image"` → files `[src.url]`.
4. `src.is_self` → vxreddit link.
5. `src.url` not on `reddit.com` / `redd.it` → link `src.url`.
6. Otherwise → vxreddit link.

vxreddit link = `https://vxreddit.com` + `src.permalink`. `fallback` for files is that vxreddit link. The vxreddit host is one constant (`EMBED_HOST`) so it can be swapped if the service dies.

If the JSON fetch fails, send the vxreddit link built from the DOM's `data-permalink`.

## Sending files

New message `{ type: "send-files", urls, fallback }`. Background:

1. Downloads each URL. A `Content-Length` over 100 MiB or a failed download → send `fallback` as a link and report the result of that.
2. `sendFilesToWebhook(webhookUrl, files, fetchImpl)` where `files = [{ name, blob }]`: posts batches of 10 as `multipart/form-data` with `payload_json` = `{}` and `files[0..9]`. File name = last path segment of the URL.
3. HTTP 413 on a batch → split it in half and retry each half, in order; a single file that still gets 413 is skipped. If any file was skipped, send `fallback` as a link after the images that did post (only the link when none did). Other non-2xx → `{ ok: false, reason: "HTTP <status>" }`; network error → `reason: "network"`.
4. Every JSON message sets `allowed_mentions: { parse: [] }`, so a link containing `@everyone` pings no one.

`host_permissions` gain `https://i.redd.it/*`, `https://preview.redd.it/*`, and for videos `https://vxreddit.com/*`, `https://renders.vxreddit.com/*` and `https://*.lambda-url.us-east-1.on.aws/*` (vxreddit.com redirects through its AWS Lambda converter to renders.vxreddit.com) (downloads come from the background, where CORS does not apply with host permission). `data_collection_permissions.required` gains `websiteContent`.

## Rename

- `manifest.json` `name` → `Send to Discord`, description covers X and Reddit; `version` → `0.2.0`.
- `package.json` `name` → `send-to-discord`; README rewritten for both sites.
- GitHub repo `dmvicent3/x-to-discord` → `send-to-discord` (`gh repo rename`; GitHub redirects the old URL); local `origin` updated.
- Local folder `Desktop\Projects\x-to-discord` → `send-to-discord`; vault board moves to `Send to Discord/Send to Discord Kanban.md`; the vault `AGENTS.md` link and the project `AGENTS.md` follow.

## Testing

- `planRedditShare` with hand-trimmed JSON fixtures: image, GIF, gallery (incl. an invalid entry and an animated `s.gif` entry), gallery with no valid entries, video, external link, self post, crosspost of an image, crosspost of a video.
- `sendFilesToWebhook` with a fake fetch: 1 file, 23 files → 3 requests of 10/10/3 in gallery order, `payload_json` present, 413 → caller gets a value it can turn into the fallback, non-2xx and network errors.
- `reddit-dom` lookups with fake elements: post's own action row vs a nested comment's, already-injected row skipped, comment things ignored.
- Existing X tests keep passing after the move; `npm run lint` clean.
- Manual (RES old layout on `www.reddit.com`): listing, post page, never-ending scroll page 2, image, gallery > 10 images, video, external link, text post, crosspost, NSFW post, night mode look; X regression pass.

## Out of scope

New Reddit design, merging video and audio ourselves (vxreddit does it), titles or text in messages, sharing comments, per-site webhooks.
