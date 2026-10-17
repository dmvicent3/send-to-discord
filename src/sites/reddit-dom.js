// Pure lookups on old-layout Reddit markup (RES or old.reddit.com): posts are div.thing.link.

function hasClass(node, name) {
  return (node.getAttribute("class") ?? "").split(/\s+/).includes(name);
}

function isPost(node) {
  return hasClass(node, "thing") && hasClass(node, "link") && !hasClass(node, "comment");
}

// The post's own action row; nested .thing elements (comments on a post page) are skipped.
function findOwnButtonsRow(thing) {
  const stack = [...thing.children].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (hasClass(node, "thing")) continue;
    if (node.tagName === "UL" && hasClass(node, "flat-list") && hasClass(node, "buttons")) return node;
    stack.push(...[...node.children].reverse());
  }
  return null;
}

function postPermalink(thing) {
  return thing.getAttribute("data-permalink");
}

if (typeof module !== "undefined") module.exports = { hasClass, isPost, findOwnButtonsRow, postPermalink };
