const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWebhookUrl, sendToWebhook, fileNameFromUrl, sendFilesToWebhook, sendFiles } = require("../src/core/webhook.js");

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

const FALLBACK = "https://rxddit.com/r/pics/comments/1/t/";

// Routes each request: webhook posts get `hook(init)`, downloads get `files[url]` (a Response or a function).
function routedFetch({ hook = () => new Response(null, { status: 204 }), files = {} } = {}) {
  const posts = [];
  const downloads = [];
  const fn = async (url, init) => {
    if (url === HOOK) {
      posts.push(init);
      return hook(init);
    }
    downloads.push(url);
    const file = files[url];
    if (!file) return new Response("missing", { status: 404 });
    return typeof file === "function" ? file() : file;
  };
  return { fn, posts, downloads };
}

const blobFile = (name) => ({ name, blob: new Blob([name], { type: "image/jpeg" }) });
const fileNames = (init) => [...init.body.entries()].filter(([key]) => key.startsWith("files[")).map(([, value]) => value.name);

test("fileNameFromUrl takes the last path segment without the query", () => {
  assert.equal(fileNameFromUrl("https://i.redd.it/abc.jpg?x=1"), "abc.jpg");
});

test("sendFilesToWebhook posts one file as multipart with an empty payload", async () => {
  const fetch = routedFetch();
  assert.deepEqual(await sendFilesToWebhook(HOOK, [blobFile("abc.jpg")], fetch.fn), { ok: true });
  assert.equal(fetch.posts.length, 1);
  const body = fetch.posts[0].body;
  assert.ok(body instanceof FormData);
  assert.equal(body.get("payload_json"), "{}");
  assert.equal(body.get("files[0]").name, "abc.jpg");
});

test("sendFilesToWebhook sends 23 files as batches of 10, 10 and 3 in order", async () => {
  const fetch = routedFetch();
  const files = Array.from({ length: 23 }, (_, i) => blobFile(`f${i}.jpg`));
  await sendFilesToWebhook(HOOK, files, fetch.fn);
  assert.deepEqual(fetch.posts.map(fileNames), [
    files.slice(0, 10).map((f) => f.name),
    files.slice(10, 20).map((f) => f.name),
    files.slice(20).map((f) => f.name),
  ]);
  assert.deepEqual(fileNames(fetch.posts[1]).length, 10);
  assert.equal(fetch.posts[1].body.get("files[0]").name, "f10.jpg");
});

test("sendFilesToWebhook stops at a 413 and flags it as too large", async () => {
  const fetch = routedFetch({ hook: () => new Response("too big", { status: 413 }) });
  const files = Array.from({ length: 12 }, (_, i) => blobFile(`f${i}.jpg`));
  assert.deepEqual(await sendFilesToWebhook(HOOK, files, fetch.fn), { ok: false, reason: "HTTP 413", tooLarge: true });
  assert.equal(fetch.posts.length, 1);
});

test("sendFilesToWebhook reports other failures", async () => {
  const failing = routedFetch({ hook: () => new Response("no", { status: 500 }) });
  assert.deepEqual(await sendFilesToWebhook(HOOK, [blobFile("a.jpg")], failing.fn), { ok: false, reason: "HTTP 500" });
  const offline = async () => {
    throw new TypeError("offline");
  };
  assert.deepEqual(await sendFilesToWebhook(HOOK, [blobFile("a.jpg")], offline), { ok: false, reason: "network" });
});

const IMG = "https://i.redd.it/abc.jpg";
const image = () => new Response(new Blob(["img"], { type: "image/jpeg" }));
const isFallback = (init) => init.headers?.["Content-Type"] === "application/json" && JSON.parse(init.body).content === FALLBACK;

test("sendFiles downloads and uploads without sending the fallback", async () => {
  const fetch = routedFetch({ files: { [IMG]: image } });
  assert.deepEqual(await sendFiles(HOOK, [IMG], FALLBACK, fetch.fn), { ok: true });
  assert.equal(fetch.posts.length, 1);
  assert.equal(fetch.posts[0].body.get("files[0]").name, "abc.jpg");
});

test("sendFiles sends the fallback link when a download fails", async () => {
  const fetch = routedFetch();
  assert.deepEqual(await sendFiles(HOOK, [IMG], FALLBACK, fetch.fn), { ok: true });
  assert.equal(fetch.posts.length, 1);
  assert.ok(isFallback(fetch.posts[0]));
});

test("sendFiles skips files over 100 MiB without reading them", async () => {
  let read = false;
  const huge = () => ({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Length": "104857601" }),
    blob: async () => {
      read = true;
      return new Blob(["x"]);
    },
  });
  const fetch = routedFetch({ files: { [IMG]: huge } });
  assert.deepEqual(await sendFiles(HOOK, [IMG], FALLBACK, fetch.fn), { ok: true });
  assert.equal(fetch.posts.length, 1);
  assert.ok(isFallback(fetch.posts[0]));
  assert.equal(read, false);
});

test("sendFiles sends the fallback link when the upload is too large", async () => {
  const fetch = routedFetch({
    files: { [IMG]: image },
    hook: (init) => new Response(null, { status: init.body instanceof FormData ? 413 : 204 }),
  });
  assert.deepEqual(await sendFiles(HOOK, [IMG], FALLBACK, fetch.fn), { ok: true });
  assert.equal(fetch.posts.length, 2);
  assert.ok(isFallback(fetch.posts[1]));
});
