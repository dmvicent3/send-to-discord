// Adds a click-to-arm "Discord" button after Share on the YouTube watch page.

const DISCORD_ICON = "M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.07 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1 0 .13 12.3 12.3 0 0 1-1.87.89.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z";

const LABELS = {
  idle: "Discord",
  armed: "Send?",
  sending: "Sending…",
  sent: "Sent ✓",
  failed: "Failed",
};

const STYLE = `
.s2d-yt { margin-left: 8px; display: flex; }
.s2d-yt svg { width: 24px; height: 24px; }
.s2d-yt button { transition: color 0.2s, opacity 0.2s; }
.s2d-yt[data-state="armed"] button,
.s2d-yt[data-state="sending"] button { color: #5865F2 !important; }
.s2d-yt[data-state="sending"] button { opacity: 0.5; }
.s2d-yt[data-state="sent"] button { color: #00BA7C !important; }
.s2d-yt[data-state="failed"] button { color: #F4212E !important; }
`;

function discordSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", DISCORD_ICON);
  svg.appendChild(path);
  return svg;
}

// Clones Share's plain <button> (YouTube's styling classes) rather than its custom-element wrapper,
// which would re-render and overwrite our icon and label.
function buildButton(shareButton) {
  const button = shareButton.cloneNode(true);
  for (const el of [button, ...button.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      if (attr.name === "id" || attr.name.startsWith("aria-") || attr.name.startsWith("data-")) el.removeAttribute(attr.name);
    }
  }
  const icon = button.querySelector(".yt-spec-button-shape-next__icon");
  if (icon) icon.replaceChildren(discordSvg());
  else button.prepend(discordSvg());
  let text = button.querySelector(".yt-spec-button-shape-next__button-text-content");
  if (!text) {
    text = document.createElement("span");
    text.className = "yt-spec-button-shape-next__button-text-content";
    button.appendChild(text);
  }
  return { button, text };
}

// Keeps exactly one button right after Share, even when YouTube re-renders the row around it.
function placeButton(row) {
  const { anchor: share, action, existing, extras } = placement(row);
  for (const extra of extras) extra.remove();
  if (action === "move") share.after(existing);
  if (action === "inject") injectButton(share);
}

function injectButton(share) {
  const { button, text } = buildButton(share.querySelector("button"));
  const wrapper = document.createElement("div");
  wrapper.className = "s2d-yt";
  wrapper.appendChild(button);
  share.after(wrapper);

  wireButton(button, {
    render: (state, detail = "") => {
      wrapper.dataset.state = state;
      text.textContent = LABELS[state];
      button.title = state === STATES.failed ? `Failed: ${detail}` : LABELS[state];
    },
    // Read at click time: YouTube changes videos without reloading and keeps this row on screen.
    resolve: async () => {
      const url = youtubeLink(location.href);
      return url ? { type: "send", url } : null;
    },
  });
}

let queued = false;
function scan() {
  queued = false;
  for (const row of document.querySelectorAll("ytd-watch-metadata #top-level-buttons-computed")) placeButton(row);
}

const style = document.createElement("style");
style.id = "s2d-yt-style";
style.textContent = STYLE;
document.head.appendChild(style);

new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(scan);
}).observe(document.body, { childList: true, subtree: true });

scan();
