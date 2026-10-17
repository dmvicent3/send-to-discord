// Handles messages from the content scripts; webhook POSTs and media downloads run here because page CSPs block them.

async function storedWebhook() {
  const { webhookUrl } = await browser.storage.local.get("webhookUrl");
  return webhookUrl || null;
}

browser.runtime.onMessage.addListener(async (message) => {
  switch (message?.type) {
    case "send": {
      const webhook = await storedWebhook();
      if (!webhook) return { ok: false, reason: "no webhook" };
      return sendToWebhook(webhook, message.url);
    }
    case "send-files": {
      const webhook = await storedWebhook();
      if (!webhook) return { ok: false, reason: "no webhook" };
      return sendFiles(webhook, message.urls, message.fallback);
    }
    case "send-video": {
      const webhook = await storedWebhook();
      if (!webhook) return { ok: false, reason: "no webhook" };
      return sendVideo(webhook, message.page);
    }
    case "open-options":
      await browser.runtime.openOptionsPage();
      return undefined;
  }
});
