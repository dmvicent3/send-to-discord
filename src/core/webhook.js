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

const PHASE_LABEL = { preparing: "preparing…", downloading: "downloading", uploading: "uploading" };

// Turns (phase, fraction) updates into labels like "uploading 42%": emits only changes, never goes backwards within a phase.
function progressReporter(emit) {
  let phase = null;
  let percent = -1;
  return (nextPhase, fraction = 0) => {
    const nextPercent = Math.floor(Math.min(1, Math.max(0, fraction)) * 100);
    if (nextPhase === phase && nextPercent <= percent) return;
    phase = nextPhase;
    percent = nextPercent;
    emit(nextPhase === "preparing" ? PHASE_LABEL.preparing : `${PHASE_LABEL[nextPhase]} ${nextPercent}%`);
  };
}

// fetch-like request over XMLHttpRequest, which (unlike fetch) reports upload progress.
function xhrFetch(url, { method = "GET", body, onUploadProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (onUploadProgress) xhr.upload.onprogress = (event) => event.lengthComputable && onUploadProgress(event.loaded, event.total);
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: async () => xhr.responseText });
    xhr.onerror = () => reject(new TypeError("NetworkError"));
    xhr.send(body);
  });
}

// Posts one message of files; a 413 splits it in half and retries, and a lone file that is too large is skipped.
// onUpload gets the fraction of this message's bytes sent so far.
async function sendBatch(webhookUrl, files, fetchImpl, skipped, onUpload) {
  const body = new FormData();
  body.append("payload_json", "{}");
  files.forEach(({ name, blob }, i) => body.append(`files[${i}]`, blob, name));
  let response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: "POST",
      body,
      onUploadProgress: (loaded, total) => total && onUpload(loaded / total),
    });
  } catch (error) {
    console.warn("x-to-discord: webhook upload failed", error);
    return { ok: false, reason: "network" };
  }
  if (response.status === 413) {
    const sizes = files.map(({ name, blob }) => `${name} ${(blob.size / 1048576).toFixed(2)} MiB`).join(", ");
    console.warn("x-to-discord: Discord refused the upload as too large:", sizes, await response.text().catch(() => ""));
    if (files.length === 1) {
      skipped.push(files[0].name);
      return { ok: true };
    }
    const half = Math.ceil(files.length / 2);
    const first = await sendBatch(webhookUrl, files.slice(0, half), fetchImpl, skipped, onUpload);
    return first.ok ? sendBatch(webhookUrl, files.slice(half), fetchImpl, skipped, onUpload) : first;
  }
  if (!response.ok) {
    console.warn("x-to-discord: webhook returned", response.status, await response.text().catch(() => ""));
    return { ok: false, reason: `HTTP ${response.status}` };
  }
  return { ok: true };
}

// Posts files in messages of up to 10 with no text, in order; reports the names Discord refused as too large.
async function sendFilesToWebhook(webhookUrl, files, fetchImpl = fetch, report = () => {}) {
  const skipped = [];
  const totalBytes = files.reduce((sum, { blob }) => sum + blob.size, 0) || 1;
  let sentBytes = 0;
  for (let start = 0; start < files.length; start += FILES_PER_MESSAGE) {
    const batch = files.slice(start, start + FILES_PER_MESSAGE);
    const batchBytes = batch.reduce((sum, { blob }) => sum + blob.size, 0);
    const onUpload = (fraction) => report("uploading", (sentBytes + fraction * batchBytes) / totalBytes);
    const result = await sendBatch(webhookUrl, batch, fetchImpl, skipped, onUpload);
    if (!result.ok) return result;
    sentBytes += batchBytes;
  }
  return { ok: true, skipped };
}

// Reads the body in chunks so onFraction can follow it when the size is known.
async function download(url, fetchImpl, onFraction) {
  try {
    // no-store: media is held in memory only, never written to the HTTP cache on disk.
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) return null;
    const total = Number(response.headers.get("Content-Length"));
    if (total > MAX_DOWNLOAD_BYTES) return null;
    let blob;
    if (response.body && total > 0) {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        chunks.push(chunk.value);
        received += chunk.value.byteLength;
        onFraction(received / total);
      }
      blob = new Blob(chunks, { type: response.headers.get("Content-Type") ?? "" });
    } else {
      blob = await response.blob();
      onFraction(1);
    }
    return { name: fileNameFromUrl(response.url || url), blob };
  } catch (error) {
    console.warn("x-to-discord: download failed", url, error);
    return null;
  }
}

// Uploads the files; a download failure or oversize file sends the fallback link instead,
// and files Discord refuses as too large are followed by the fallback link.
// onProgress gets labels like "downloading 42%".
async function sendFiles(webhookUrl, urls, fallback, fetchImpl = fetch, onProgress = () => {}) {
  const report = progressReporter(onProgress);
  report("preparing");
  const files = [];
  for (const [i, url] of urls.entries()) {
    const file = await download(url, fetchImpl, (fraction) => report("downloading", (i + fraction) / urls.length));
    if (!file) return sendToWebhook(webhookUrl, fallback, fetchImpl);
    files.push(file);
  }
  const result = await sendFilesToWebhook(webhookUrl, files, fetchImpl, report);
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
const EMBED_USER_AGENT = "Mozilla/5.0 (compatible; SendToDiscordBot/0.2)";

async function sendVideo(webhookUrl, page, fetchImpl = fetch, onProgress = () => {}) {
  let last = null;
  const emit = (label) => label !== last && onProgress((last = label));
  emit("preparing…");
  let videoUrl = null;
  try {
    // vxreddit only serves its embed page to user agents containing "bot"; browsers are redirected to Reddit.
    const response = await fetchImpl(page, { cache: "no-store", headers: { "User-Agent": EMBED_USER_AGENT } });
    if (response.ok) videoUrl = ogVideoUrl(await response.text());
    if (!videoUrl) console.warn("x-to-discord: no video on the embed page, sending the link", response.status, response.url || page);
  } catch (error) {
    console.warn("x-to-discord: embed page fetch failed", page, error);
  }
  return videoUrl ? sendFiles(webhookUrl, [videoUrl], page, fetchImpl, emit) : sendToWebhook(webhookUrl, page, fetchImpl);
}

if (typeof module !== "undefined") {
  module.exports = { normalizeWebhookUrl, sendToWebhook, fileNameFromUrl, sendFilesToWebhook, sendFiles, ogVideoUrl, sendVideo, progressReporter, xhrFetch };
}
