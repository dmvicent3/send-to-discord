// Pure placement logic for the YouTube watch page's action menu (ytd-menu-renderer):
// like/share buttons, flexible items (Save, Clip…), then the round "…" more-actions button.

const BUTTON_GROUPS = ["top-level-buttons-computed", "flexible-item-buttons"];

function isOurs(node) {
  return (node.getAttribute("class") ?? "").split(/\s+/).includes("s2d-yt");
}

function findButton(node) {
  if (node.tagName === "BUTTON") return node;
  for (const child of node.children) {
    const found = findButton(child);
    if (found) return found;
  }
  return null;
}

// The "…" button: the last rendered button of the menu that is neither ours nor a group of other buttons.
// Chosen by structure, not by label, so any UI language works.
function isMoreButton(node) {
  return !isOurs(node) && !BUTTON_GROUPS.includes(node.getAttribute("id")) && Boolean(findButton(node));
}

// Where our button belongs in `menu`: right before "…". Inject it, move an existing one there, or leave it.
// `extras` are duplicate buttons to remove. anchor is null while "…" is not rendered yet.
function placement(menu) {
  const children = [...menu.children];
  const anchor = children.filter(isMoreButton).at(-1) ?? null;
  const [existing = null, ...extras] = children.filter(isOurs);
  if (!anchor) return { anchor, action: "wait", existing, extras };
  if (!existing) return { anchor, action: "inject", existing, extras };
  const inPlace = children.indexOf(existing) === children.indexOf(anchor) - 1;
  return { anchor, action: inPlace ? "ok" : "move", existing, extras };
}

if (typeof module !== "undefined") module.exports = { placement, findButton };
