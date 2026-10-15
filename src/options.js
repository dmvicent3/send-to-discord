const input = document.getElementById("webhook");
const status = document.getElementById("status");

browser.storage.local.get("webhookUrl").then(({ webhookUrl }) => {
  input.value = webhookUrl || "";
});

document.getElementById("save").addEventListener("click", async () => {
  const webhookUrl = normalizeWebhookUrl(input.value);
  if (!webhookUrl) {
    status.textContent = "Not a Discord webhook URL";
    return;
  }
  await browser.storage.local.set({ webhookUrl });
  input.value = webhookUrl;
  status.textContent = "Saved";
});

document.getElementById("test").addEventListener("click", async () => {
  const { webhookUrl } = await browser.storage.local.get("webhookUrl");
  if (!webhookUrl) {
    status.textContent = "Save a webhook URL first";
    return;
  }
  status.textContent = "Sending…";
  const result = await sendToWebhook(webhookUrl, "X to Discord: test message");
  status.textContent = result.ok ? "Test sent" : `Failed: ${result.reason}`;
});
