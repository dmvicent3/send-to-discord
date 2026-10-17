const { test } = require("node:test");
const assert = require("node:assert/strict");
const { findPermalink, findActionBar, findSlot, iconShift, nextMargin } = require("../src/sites/x-dom.js");

const { h } = require("./helpers/fake-dom.js");

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

test("iconShift is the extra offset that matches the previous icon spacing", () => {
  // bookmark at 15, share at 50 (35 apart); ours sits at 75 (25 apart) -> move 10 right
  assert.equal(iconShift(15, 50, 75), 10);
  assert.equal(iconShift(15, 50, 85), 0);
  assert.equal(iconShift(15, 50, 90.4), -5);
});

test("iconShift is 0 when nothing is laid out", () => {
  assert.equal(iconShift(0, 0, 0), 0);
});

test("nextMargin adds the shift and stays within 0..max", () => {
  assert.equal(nextMargin(0, 10), 10);
  assert.equal(nextMargin(10, -4), 6);
  assert.equal(nextMargin(5, -20), 0);
  assert.equal(nextMargin(0, 370), 48);
});
