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
      body: JSON.stringify({ content }),
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

// Posts files in batches of 10 with no text; stops at the first failing batch.
async function sendFilesToWebhook(webhookUrl, files, fetchImpl = fetch) {
  for (let start = 0; start < files.length; start += FILES_PER_MESSAGE) {
    const body = new FormData();
    body.append("payload_json", "{}");
    files.slice(start, start + FILES_PER_MESSAGE).forEach(({ name, blob }, i) => body.append(`files[${i}]`, blob, name));
    let response;
    try {
      response = await fetchImpl(webhookUrl, { method: "POST", body });
    } catch (error) {
      console.warn("x-to-discord: webhook upload failed", error);
      return { ok: false, reason: "network" };
    }
    if (response.status === 413) return { ok: false, reason: "HTTP 413", tooLarge: true };
    if (!response.ok) {
      console.warn("x-to-discord: webhook returned", response.status, await response.text().catch(() => ""));
      return { ok: false, reason: `HTTP ${response.status}` };
    }
  }
  return { ok: true };
}

async function download(url, fetchImpl) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    if (Number(response.headers.get("Content-Length")) > MAX_DOWNLOAD_BYTES) return null;
    return { name: fileNameFromUrl(url), blob: await response.blob() };
  } catch (error) {
    console.warn("x-to-discord: download failed", url, error);
    return null;
  }
}

// Uploads the files; any download failure, oversize file or 413 sends the fallback link instead.
async function sendFiles(webhookUrl, urls, fallback, fetchImpl = fetch) {
  const files = [];
  for (const url of urls) {
    const file = await download(url, fetchImpl);
    if (!file) return sendToWebhook(webhookUrl, fallback, fetchImpl);
    files.push(file);
  }
  const result = await sendFilesToWebhook(webhookUrl, files, fetchImpl);
  return result.tooLarge ? sendToWebhook(webhookUrl, fallback, fetchImpl) : result;
}

if (typeof module !== "undefined") module.exports = { normalizeWebhookUrl, sendToWebhook, fileNameFromUrl, sendFilesToWebhook, sendFiles };
