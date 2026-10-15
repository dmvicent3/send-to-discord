// Handles messages from the content script; the webhook POST runs here because X's CSP blocks it in the page.

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
    case "open-options":
      await browser.runtime.openOptionsPage();
      return undefined;
  }
});
