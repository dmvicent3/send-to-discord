// Injects a click-to-arm "Send to Discord" button into each X post's action bar.

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

function render(btn, state, reason = "") {
  const wrapper = btn.closest(".x2d-btn");
  wrapper.dataset.state = state;
  btn.querySelector("svg path").setAttribute("d", ICON_FOR_STATE[state]);
  const tooltip = TOOLTIP[state] + (state === STATES.failed ? reason : "");
  btn.title = tooltip;
  btn.setAttribute("aria-label", tooltip);
}

// Share carries no trailing spacing (it was last), so set our margin until share→ours matches prev→share.
// Re-measures a few frames because adding width makes X's bar redistribute space.
// X re-renders its buttons, so the icons are looked up afresh each frame and skipped until laid out.
function alignToShare(group, wrapper, tries = 6) {
  if (tries === 0) return;
  requestAnimationFrame(() => {
    const xButtons = [...group.querySelectorAll("button")].filter((b) => !b.closest(".x2d-btn"));
    const rects = [xButtons.at(-2), xButtons.at(-1), wrapper].map((el) => el?.querySelector("svg")?.getBoundingClientRect());
    if (!wrapper.isConnected || rects.some((rect) => !rect || rect.width === 0)) {
      if (wrapper.isConnected) alignToShare(group, wrapper, tries - 1);
      return;
    }
    const [prevX, shareX, ourX] = rects.map((rect) => rect.left + rect.width / 2);
    const shift = iconShift(prevX, shareX, ourX);
    if (Math.abs(shift) <= 1) return;
    wrapper.style.marginLeft = `${nextMargin(parseFloat(wrapper.style.marginLeft) || 0, shift)}px`;
    alignToShare(group, wrapper, tries - 1);
  });
}

function injectButton(article) {
  const group = findActionBar(article);
  if (!group || group.querySelector(".x2d-btn")) return;
  const buttons = group.querySelectorAll("button");
  const share = buttons[buttons.length - 1];
  const original = share?.querySelector("svg");
  if (!original) return;

  const slot = findSlot(group, share);
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
  alignToShare(group, wrapper);
  const btn = wrapper.matches("button") ? wrapper : wrapper.querySelector("button");
  wireButton(btn, {
    render: (state, reason) => render(btn, state, reason),
    resolve: async () => {
      const url = toFxUrl(findPermalink(article) ?? "");
      return url ? { type: "send", url } : null;
    },
  });
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
