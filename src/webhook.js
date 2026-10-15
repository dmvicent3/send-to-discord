// Validates Discord webhook URLs and posts messages to them.

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

if (typeof module !== "undefined") module.exports = { normalizeWebhookUrl, sendToWebhook };
