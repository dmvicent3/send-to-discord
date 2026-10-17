// Adds a click-to-arm, icon-only Discord button just before the "…" button on the YouTube watch page.

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

// Clones the "…" button's plain <button> (round, icon-only, YouTube's styling classes) and empties it,
// so nothing of YouTube's icon, label or ripple remains; its custom-element wrapper is not cloned.
function buildButton(moreButton) {
  const button = moreButton.cloneNode(false);
  for (const attr of [...button.attributes]) {
    if (attr.name === "id" || attr.name.startsWith("aria-") || attr.name.startsWith("data-")) button.removeAttribute(attr.name);
  }
  const icon = document.createElement("div");
  icon.className = "yt-spec-button-shape-next__icon";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
  icon.appendChild(svg);
  button.appendChild(icon);
  return button;
}

function injectButton(more) {
  const button = buildButton(findButton(more));
  const wrapper = document.createElement("div");
  wrapper.className = "s2d-yt";
  wrapper.appendChild(button);
  more.before(wrapper);

  wireButton(button, {
    render: (state, detail = "") => {
      wrapper.dataset.state = state;
      button.querySelector("path").setAttribute("d", ICON_FOR_STATE[state]);
      const tooltip = TOOLTIP[state] + (state === STATES.failed ? detail : "");
      button.title = tooltip;
      button.setAttribute("aria-label", tooltip);
    },
    // Read at click time: YouTube changes videos without reloading and keeps this row on screen.
    resolve: async () => {
      const url = youtubeLink(location.href);
      return url ? { type: "send", url } : null;
    },
  });
}

// Keeps exactly one button right before "…", even when YouTube re-renders the menu around it.
function placeButton(menu) {
  const { anchor: more, action, existing, extras } = placement(menu);
  for (const extra of extras) extra.remove();
  if (action === "move") more.before(existing);
  if (action === "inject") injectButton(more);
}

let queued = false;
function scan() {
  queued = false;
  for (const row of document.querySelectorAll("ytd-watch-metadata #top-level-buttons-computed")) {
    if (row.parentElement) placeButton(row.parentElement);
  }
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
