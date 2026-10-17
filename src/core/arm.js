// Click-to-arm handling shared by every site: first click arms, second click sends.
// Sites supply render(state, detail) for the look and resolve() for the message to send.
// detail is the failure reason, or a progress label ("uploading 42%") while sending.

let hasWebhook = false;
browser.storage.local.get("webhookUrl").then(({ webhookUrl }) => {
  hasWebhook = Boolean(webhookUrl);
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "webhookUrl" in changes) hasWebhook = Boolean(changes.webhookUrl.newValue);
});

// Progress labels from the background, keyed by the id of the send they belong to.
const progressListeners = new Map();
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "progress") progressListeners.get(message.id)?.(message.label);
});

function wireButton(el, { render, resolve }) {
  let state = STATES.idle;
  let timer = null;

  const go = (event, reason) => {
    state = transition(state, event);
    render(state, reason);
    clearTimeout(timer);
    if (state === STATES.armed) timer = setTimeout(() => go("timeout"), ARM_MS);
    if (state === STATES.sent || state === STATES.failed) timer = setTimeout(() => go("timeout"), RESULT_MS);
  };

  const send = async () => {
    let result;
    try {
      const message = await resolve();
      if (!message) return go("failed", "no post link");
      const id = crypto.randomUUID();
      progressListeners.set(id, (label) => {
        if (state === STATES.sending) render(state, label);
      });
      try {
        result = await browser.runtime.sendMessage({ ...message, id });
      } finally {
        progressListeners.delete(id);
      }
    } catch (error) {
      console.warn("x-to-discord: send message failed", error);
      result = { ok: false, reason: "extension error" };
    }
    if (result?.ok) go("sent");
    else go("failed", result?.reason ?? "no response");
  };

  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state === STATES.idle && !hasWebhook) {
      browser.runtime.sendMessage({ type: "open-options" });
      return;
    }
    const before = state;
    go("click");
    if (before === STATES.armed && state === STATES.sending) send();
  });

  render(state);
}
