// Adds a click-to-arm "discord" link to each old-layout Reddit post's action row.

const LABELS = {
  idle: "discord",
  armed: "send?",
  sending: "sending…",
  sent: "sent ✓",
  failed: "failed: ",
};

// Firefox's content.fetch runs as the page: same origin, so the user's session covers NSFW and quarantined posts.
const pageFetch = typeof content !== "undefined" && content.fetch ? (...args) => content.fetch(...args) : fetch;

async function resolvePost(permalink) {
  if (!permalink) return null;
  try {
    const response = await pageFetch(new URL(`${permalink}.json?raw_json=1`, location.origin).href, { credentials: "include" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const plan = planRedditShare(json[0].data.children[0].data);
    return plan.type === "files"
      ? { type: "send-files", urls: plan.urls, fallback: plan.fallback }
      : { type: "send", url: plan.url };
  } catch (error) {
    console.warn("x-to-discord: post lookup failed, sending the embed link", error);
    return { type: "send", url: embedLink(permalink) };
  }
}

function injectButton(thing) {
  const row = findOwnButtonsRow(thing);
  if (!row || row.querySelector(".s2d-reddit")) return;
  const item = document.createElement("li");
  item.className = "s2d-reddit";
  const link = document.createElement("a");
  link.href = "#";
  item.appendChild(link);
  row.appendChild(item);
  wireButton(link, {
    render: (state, reason = "") => {
      item.dataset.state = state;
      link.textContent = LABELS[state] + (state === STATES.failed ? reason : "");
    },
    resolve: () => resolvePost(postPermalink(thing)),
  });
}

let queued = false;
function scan() {
  queued = false;
  for (const thing of document.querySelectorAll("div.thing.link")) {
    if (isPost(thing)) injectButton(thing);
  }
}

new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(scan);
}).observe(document.body, { childList: true, subtree: true });

scan();
