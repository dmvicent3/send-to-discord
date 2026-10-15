# X to Discord

Firefox extension that adds a Discord button to every post on X. Click it once to arm it, click again to send: the post's link, rewritten to `fxtwitter.com` so Discord shows a full embed, is posted to one Discord channel through a webhook.

## Install

1. Download the signed `.xpi` (from `web-ext-artifacts/` after `npm run sign`).
2. In Firefox open `about:addons` → gear icon → **Install Add-on From File…** and pick the `.xpi`.
3. Open the add-on's **Options**, paste your webhook URL (Discord channel → Edit Channel → Integrations → Webhooks → Copy Webhook URL), **Save**, then **Test**.

The webhook URL is stored only in your browser (`browser.storage.local`).

## Use

| Button | Meaning |
|---|---|
| grey Discord icon | ready, click to arm |
| blurple arrow | armed: click again within 3 s to send |
| green check | sent |
| red cross | failed, hover for the reason |

If no webhook is set, the button opens the options page.

## Develop

Requires Node 20+.

```sh
npm test        # unit tests (node --test)
npm run lint    # web-ext lint
npm start       # launches a temporary Firefox profile with the extension loaded
```

## Sign

Firefox release only keeps signed add-ons. This one is signed as **unlisted** on addons.mozilla.org: it is never shown in the public catalogue.

1. Create API credentials at https://addons.mozilla.org/developers/addon/api/key/.
2. Put them in the environment (never commit them), e.g. in PowerShell:
   ```powershell
   $env:WEB_EXT_API_KEY = "user:12345:67"
   $env:WEB_EXT_API_SECRET = "..."
   ```
3. Bump `version` in `manifest.json` (AMO rejects a version it has already signed), then `npm run sign`. The `.xpi` lands in `web-ext-artifacts/`.
