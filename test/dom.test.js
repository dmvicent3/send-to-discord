const { test } = require("node:test");
const assert = require("node:assert/strict");
const { findPermalink, findActionBar, findSlot, slotGap } = require("../src/dom.js");

// Minimal element stand-in exposing the DOM properties dom.js relies on.
function h(tag, attrs = {}, ...children) {
  const node = {
    tagName: tag.toUpperCase(),
    attrs,
    children,
    parentElement: null,
    get childElementCount() {
      return this.children.length;
    },
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
  };
  for (const child of children) child.parentElement = node;
  return node;
}

const actionBar = () =>
  h("div", { role: "group" },
    h("div", {}, h("button", {})),
    h("div", {}, h("div", {}, h("button", { id: "share" }))));

test("findPermalink returns the post's own timestamp link", () => {
  const article = h("article", {},
    h("a", { href: "/alice/status/1" }, h("time")),
    h("a", { href: "/alice/status/1/photo/1" }, h("img")));
  assert.equal(findPermalink(article), "/alice/status/1");
});

test("findPermalink picks the outer post over a quoted one", () => {
  const article = h("article", {},
    h("a", { href: "/alice/status/1" }, h("time")),
    h("div", { role: "link" }, h("div", {}, h("time")), h("a", { href: "/bob/status/2" }, h("span"))));
  assert.equal(findPermalink(article), "/alice/status/1");
});

test("findPermalink ignores links inside a nested article", () => {
  const inner = h("article", {}, h("a", { href: "/bob/status/2" }, h("time")));
  const article = h("article", {}, h("div", {}, inner));
  assert.equal(findPermalink(article), null);
});

test("findPermalink returns null for a post without a timestamp link (ad)", () => {
  const article = h("article", {}, h("span", {}), h("a", { href: "/brand/status/9/analytics" }, h("span")));
  assert.equal(findPermalink(article), null);
});

test("findActionBar returns the last role=group that holds a button", () => {
  const media = h("div", { role: "group" }, h("img"));
  const bar = actionBar();
  const article = h("article", {}, media, bar);
  assert.equal(findActionBar(article), bar);
  assert.equal(findActionBar(h("article", {}, media)), null);
});

test("findSlot climbs single-child wrappers up to the group's child", () => {
  const bar = actionBar();
  const share = bar.children[1].children[0].children[0];
  assert.equal(findSlot(bar, share), bar.children[1]);
});

test("findSlot stops below a wrapper shared with another action", () => {
  const share = h("button", {});
  const shared = h("div", {}, h("div", {}, h("button", {})), h("div", {}, share));
  const bar = h("div", { role: "group" }, shared);
  assert.equal(findSlot(bar, share), shared.children[1]);
});

test("findSlot returns the button when it sits directly in the group", () => {
  const share = h("button", {});
  const bar = h("div", { role: "group" }, share);
  assert.equal(findSlot(bar, share), share);
});

test("slotGap measures the space between the previous action and share", () => {
  assert.equal(slotGap({ right: 300 }, { left: 312.4 }), 12);
});

test("slotGap falls back when there is no previous action or no measurable gap", () => {
  assert.equal(slotGap(null, { left: 312 }), 12);
  assert.equal(slotGap({ right: 0 }, { left: 0 }), 12);
  assert.equal(slotGap({ right: 320 }, { left: 312 }), 12);
});
