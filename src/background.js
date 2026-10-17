// Handles messages from the content scripts; webhook POSTs and media downloads run here because page CSPs block them.

async function storedWebhook() {
  const { webhookUrl } = await browser.storage.local.get("webhookUrl");
  return webhookUrl || null;
}

// Uploads go over XMLHttpRequest so their progress can be reported; everything else uses fetch.
function fetchWithUploadProgress(url, init) {
  return init?.onUploadProgress ? xhrFetch(url, init) : fetch(url, init);
}

// Sends progress labels back to the frame whose button started the send.
function progressTo(sender, id) {
  return (label) => {
    if (!id || !sender.tab) return;
    browser.tabs.sendMessage(sender.tab.id, { type: "progress", id, label }, { frameId: sender.frameId }).catch(() => {});
  };
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message?.type) {
    case "send": {
      const webhook = await storedWebhook();
      if (!webhook) return { ok: false, reason: "no webhook" };
      return sendToWebhook(webhook, message.url);
    }
    case "send-files": {
      const webhook = await storedWebhook();
      if (!webhook) return { ok: false, reason: "no webhook" };
      return sendFiles(webhook, message.urls, message.fallback, fetchWithUploadProgress, progressTo(sender, message.id));
    }
    case "send-video": {
      const webhook = await storedWebhook();
      if (!webhook) return { ok: false, reason: "no webhook" };
      return sendVideo(webhook, message.page, fetchWithUploadProgress, progressTo(sender, message.id));
    }
    case "open-options":
      await browser.runtime.openOptionsPage();
      return undefined;
  }
});
