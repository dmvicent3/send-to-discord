// Pure placement logic for the YouTube watch page's action row (#top-level-buttons-computed).

const LIKE_TAGS = [
  "SEGMENTED-LIKE-DISLIKE-BUTTON-VIEW-MODEL",
  "LIKE-BUTTON-VIEW-MODEL",
  "DISLIKE-BUTTON-VIEW-MODEL",
  "YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER",
];

function classes(node) {
  return (node.getAttribute("class") ?? "").split(/\s+/);
}

function isOurs(node) {
  return classes(node).includes("s2d-yt");
}

function findButton(node) {
  if (node.tagName === "BUTTON") return node;
  for (const child of node.children) {
    const found = findButton(child);
    if (found) return found;
  }
  return null;
}

// Share is the last rendered button that is not ours and not part of the like/dislike control.
// It is chosen by structure, not by label, so any UI language works.
function isShareCandidate(node) {
  if (isOurs(node) || LIKE_TAGS.includes(node.tagName)) return false;
  const button = findButton(node);
  return Boolean(button) && !classes(button).some((name) => name.includes("--segmented-"));
}

// Where our button belongs in `row`: inject after the anchor, move an existing one there, or leave it.
// `extras` are duplicate buttons to remove. anchor is null while Share is not rendered yet.
function placement(row) {
  const children = [...row.children];
  const anchor = children.filter(isShareCandidate).at(-1) ?? null;
  const [existing = null, ...extras] = children.filter(isOurs);
  if (!anchor) return { anchor, action: "wait", existing, extras };
  if (!existing) return { anchor, action: "inject", existing, extras };
  const inPlace = children.indexOf(existing) === children.indexOf(anchor) + 1;
  return { anchor, action: inPlace ? "ok" : "move", existing, extras };
}

if (typeof module !== "undefined") module.exports = { placement };
