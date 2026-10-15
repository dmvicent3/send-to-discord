// Injects a click-to-arm "Send to Discord" button into each X post's action bar.

const ICONS = {
  discord:
    "M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.07 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1 0 .13 12.3 12.3 0 0 1-1.87.89.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z",
  send: "M2.5 3.2 22 12 2.5 20.8l2.6-7.6L14 12l-8.9-1.2z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
  cross: "M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z",
};

const ICON_FOR_STATE = {
  idle: ICONS.discord,
  armed: ICONS.send,
  sending: ICONS.send,
  sent: ICONS.check,
  failed: ICONS.cross,
};

const STYLE = `
.x2d-btn svg { border-radius: 9999px; transition: color 0.2s, background-color 0.2s, box-shadow 0.2s; }
.x2d-btn button:hover svg,
.x2d-btn[data-state="armed"] svg,
.x2d-btn[data-state="sending"] svg { color: #5865F2 !important; }
.x2d-btn button:hover svg { background-color: rgba(88, 101, 242, 0.1); box-shadow: 0 0 0 8px rgba(88, 101, 242, 0.1); }
.x2d-btn[data-state="sending"] svg { opacity: 0.5; }
.x2d-btn[data-state="sent"] svg { color: #00BA7C !important; }
.x2d-btn[data-state="failed"] svg { color: #F4212E !important; }
`;

let hasWebhook = false;
browser.storage.local.get("webhookUrl").then(({ webhookUrl }) => {
  hasWebhook = Boolean(webhookUrl);
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "webhookUrl" in changes) hasWebhook = Boolean(changes.webhookUrl.newValue);
});

function findPermalink(article) {
  for (const anchor of article.querySelectorAll('a[href*="/status/"]')) {
    if (anchor.querySelector(":scope > time") && anchor.closest("article") === article) {
      return anchor.href;
    }
  }
  return location.pathname.includes("/status/") ? location.href : null;
}

function render(btn, state, reason = "") {
  const wrapper = btn.closest(".x2d-btn");
  wrapper.dataset.state = state;
  btn.querySelector("svg path").setAttribute("d", ICON_FOR_STATE[state]);
  const tooltip = TOOLTIP[state] + (state === STATES.failed ? reason : "");
  btn.title = tooltip;
  btn.setAttribute("aria-label", tooltip);
}

function wireButton(btn, article) {
  let state = STATES.idle;
  let timer = null;

  const go = (event, reason) => {
    state = transition(state, event);
    render(btn, state, reason);
    clearTimeout(timer);
    if (state === STATES.armed) timer = setTimeout(() => go("timeout"), ARM_MS);
    if (state === STATES.sent || state === STATES.failed) timer = setTimeout(() => go("timeout"), RESULT_MS);
  };

  const send = async () => {
    const url = toFxUrl(findPermalink(article) ?? "");
    if (!url) return go("failed", "no post link");
    let result;
    try {
      result = await browser.runtime.sendMessage({ type: "send", url });
    } catch (error) {
      console.warn("x-to-discord: send message failed", error);
      result = { ok: false, reason: "extension error" };
    }
    if (result?.ok) go("sent");
    else go("failed", result?.reason ?? "no response");
  };

  btn.addEventListener("click", (event) => {
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

  render(btn, state);
}

function injectButton(article) {
  const group = article.querySelector('[role="group"]');
  if (!group || group.querySelector(".x2d-btn")) return;
  const buttons = group.querySelectorAll("button");
  const share = buttons[buttons.length - 1];
  const original = share?.querySelector("svg");
  if (!original) return;

  const slot = share.parentElement === group ? share : share.parentElement;
  const wrapper = slot.cloneNode(true);
  for (const el of [wrapper, ...wrapper.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      if (attr.name === "data-testid" || attr.name.startsWith("aria-")) el.removeAttribute(attr.name);
    }
  }
  wrapper.classList.add("x2d-btn");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", original.getAttribute("class") ?? "");
  svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
  wrapper.querySelector("svg").replaceWith(svg);

  slot.after(wrapper);
  wireButton(wrapper.matches("button") ? wrapper : wrapper.querySelector("button"), article);
}

let queued = false;
function scan() {
  queued = false;
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) injectButton(article);
}

const style = document.createElement("style");
style.id = "x2d-style";
style.textContent = STYLE;
document.head.appendChild(style);

new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(scan);
}).observe(document.body, { childList: true, subtree: true });

scan();
