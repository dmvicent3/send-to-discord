// Validates Discord webhook URLs and posts messages and files to them.

const WEBHOOK_HOSTS = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];

function normalizeWebhookUrl(input) {
  const trimmed = input.trim();
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const valid =
    url.protocol === "https:" &&
    WEBHOOK_HOSTS.includes(url.hostname) &&
    url.pathname.startsWith("/api/webhooks/");
  return valid ? trimmed : null;
}

async function sendToWebhook(webhookUrl, content, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
  } catch (error) {
    console.warn("x-to-discord: webhook request failed", error);
    return { ok: false, reason: "network" };
  }
  if (response.ok) return { ok: true };
  console.warn("x-to-discord: webhook returned", response.status, await response.text().catch(() => ""));
  return { ok: false, reason: `HTTP ${response.status}` };
}

const FILES_PER_MESSAGE = 10;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

function fileNameFromUrl(url) {
  return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "file";
}

// Posts one message of files; a 413 splits it in half and retries, and a lone file that is too large is skipped.
async function sendBatch(webhookUrl, files, fetchImpl, skipped) {
  const body = new FormData();
  body.append("payload_json", "{}");
  files.forEach(({ name, blob }, i) => body.append(`files[${i}]`, blob, name));
  let response;
  try {
    response = await fetchImpl(webhookUrl, { method: "POST", body });
  } catch (error) {
    console.warn("x-to-discord: webhook upload failed", error);
    return { ok: false, reason: "network" };
  }
  if (response.status === 413) {
    if (files.length === 1) {
      skipped.push(files[0].name);
      return { ok: true };
    }
    const half = Math.ceil(files.length / 2);
    const first = await sendBatch(webhookUrl, files.slice(0, half), fetchImpl, skipped);
    return first.ok ? sendBatch(webhookUrl, files.slice(half), fetchImpl, skipped) : first;
  }
  if (!response.ok) {
    console.warn("x-to-discord: webhook returned", response.status, await response.text().catch(() => ""));
    return { ok: false, reason: `HTTP ${response.status}` };
  }
  return { ok: true };
}

// Posts files in messages of up to 10 with no text, in order; reports the names Discord refused as too large.
async function sendFilesToWebhook(webhookUrl, files, fetchImpl = fetch) {
  const skipped = [];
  for (let start = 0; start < files.length; start += FILES_PER_MESSAGE) {
    const result = await sendBatch(webhookUrl, files.slice(start, start + FILES_PER_MESSAGE), fetchImpl, skipped);
    if (!result.ok) return result;
  }
  return { ok: true, skipped };
}

async function download(url, fetchImpl) {
  try {
    // no-store: media is held in memory only, never written to the HTTP cache on disk.
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) return null;
    if (Number(response.headers.get("Content-Length")) > MAX_DOWNLOAD_BYTES) return null;
    return { name: fileNameFromUrl(response.url || url), blob: await response.blob() };
  } catch (error) {
    console.warn("x-to-discord: download failed", url, error);
    return null;
  }
}

// Uploads the files; a download failure or oversize file sends the fallback link instead,
// and files Discord refuses as too large are followed by the fallback link.
async function sendFiles(webhookUrl, urls, fallback, fetchImpl = fetch) {
  const files = [];
  for (const url of urls) {
    const file = await download(url, fetchImpl);
    if (!file) return sendToWebhook(webhookUrl, fallback, fetchImpl);
    files.push(file);
  }
  const result = await sendFilesToWebhook(webhookUrl, files, fetchImpl);
  if (!result.ok) return result;
  return result.skipped.length ? sendToWebhook(webhookUrl, fallback, fetchImpl) : { ok: true };
}

const ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };

// The https URL in a page's <meta property="og:video" content="..."> tag, or null.
function ogVideoUrl(html) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, name, value]) => [name.toLowerCase(), value]));
    if (attrs.property !== "og:video" || !attrs.content) continue;
    const url = attrs.content.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity]);
    return url.startsWith("https://") ? url : null;
  }
  return null;
}

// Uploads the video an embed page offers (its og:video); anything that keeps it from uploading sends the page link.
async function sendVideo(webhookUrl, page, fetchImpl = fetch) {
  let videoUrl = null;
  try {
    const response = await fetchImpl(page, { cache: "no-store" });
    if (response.ok) videoUrl = ogVideoUrl(await response.text());
  } catch (error) {
    console.warn("x-to-discord: embed page fetch failed", page, error);
  }
  return videoUrl ? sendFiles(webhookUrl, [videoUrl], page, fetchImpl) : sendToWebhook(webhookUrl, page, fetchImpl);
}

if (typeof module !== "undefined") {
  module.exports = { normalizeWebhookUrl, sendToWebhook, fileNameFromUrl, sendFilesToWebhook, sendFiles, ogVideoUrl, sendVideo };
}
