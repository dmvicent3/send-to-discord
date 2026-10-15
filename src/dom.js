// Locates parts of an X post using only children/parentElement/getAttribute, so it is testable without a browser.

const isTag = (node, tag) => node.tagName.toUpperCase() === tag;

// Depth-first, document order; skips posts nested inside `root`.
function* descendants(root) {
  for (const child of root.children) {
    if (isTag(child, "ARTICLE")) continue;
    yield child;
    yield* descendants(child);
  }
}

function findPermalink(article) {
  for (const node of descendants(article)) {
    const href = isTag(node, "A") ? node.getAttribute("href") : null;
    if (href?.includes("/status/") && [...node.children].some((child) => isTag(child, "TIME"))) return href;
  }
  return null;
}

function findActionBar(article) {
  let bar = null;
  for (const node of descendants(article)) {
    if (node.getAttribute("role") !== "group") continue;
    if ([...descendants(node)].some((child) => isTag(child, "BUTTON"))) bar = node;
  }
  return bar;
}

// The outermost wrapper that holds only `share`, below `group`.
function findSlot(group, share) {
  let slot = share;
  while (slot.parentElement && slot.parentElement !== group && slot.parentElement.childElementCount === 1) {
    slot = slot.parentElement;
  }
  return slot;
}

// Pixels to move our icon so its distance from share equals share's distance from the previous icon (x = icon centres).
function iconShift(prevX, shareX, ourX) {
  return Math.round(shareX - prevX - (ourX - shareX));
}

if (typeof module !== "undefined") module.exports = { findPermalink, findActionBar, findSlot, iconShift };
