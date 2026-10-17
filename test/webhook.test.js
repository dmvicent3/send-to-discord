const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWebhookUrl, sendToWebhook } = require("../src/core/webhook.js");

const HOOK = "https://discord.com/api/webhooks/1/abc";
const LINK = "https://fxtwitter.com/jack/status/20";

test("normalizeWebhookUrl accepts Discord webhook URLs", () => {
  for (const input of [
    HOOK,
    "https://discordapp.com/api/webhooks/1/abc",
    "https://ptb.discord.com/api/webhooks/1/abc",
    "https://canary.discord.com/api/webhooks/1/abc",
  ]) {
    assert.equal(normalizeWebhookUrl(input), input, input);
  }
});

test("normalizeWebhookUrl trims surrounding whitespace", () => {
  assert.equal(normalizeWebhookUrl(`  ${HOOK}\n`), HOOK);
});

test("normalizeWebhookUrl rejects anything else", () => {
  for (const input of [
    "http://discord.com/api/webhooks/1/abc",
    "https://discord.com/channels/1/2",
    "https://evil.com/api/webhooks/1/abc",
    "https://discord.com.evil.com/api/webhooks/1/abc",
    "",
  ]) {
    assert.equal(normalizeWebhookUrl(input), null, input);
  }
});

function fakeFetch(respond) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return respond();
  };
  fn.calls = calls;
  return fn;
}

const status = (code) => () => ({ ok: code >= 200 && code < 300, status: code, text: async () => "" });

test("sendToWebhook posts the link as JSON content", async () => {
  const fetch = fakeFetch(status(204));
  assert.deepEqual(await sendToWebhook(HOOK, LINK, fetch), { ok: true });
  const { url, init } = fetch.calls[0];
  assert.equal(url, HOOK);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), { content: LINK });
});

test("sendToWebhook reports HTTP errors", async () => {
  assert.deepEqual(await sendToWebhook(HOOK, LINK, fakeFetch(status(429))), { ok: false, reason: "HTTP 429" });
  assert.deepEqual(await sendToWebhook(HOOK, LINK, fakeFetch(status(404))), { ok: false, reason: "HTTP 404" });
});

test("sendToWebhook reports network failures", async () => {
  const fetch = fakeFetch(() => {
    throw new TypeError("NetworkError");
  });
  assert.deepEqual(await sendToWebhook(HOOK, LINK, fetch), { ok: false, reason: "network" });
});
