const { test } = require("node:test");
const assert = require("node:assert/strict");
const { h } = require("./helpers/fake-dom.js");
const { placement } = require("../src/sites/youtube-dom.js");

// The watch page's ytd-menu-renderer: top-level buttons (like, share), flexible items (save), then "...".
const topLevel = () => h("div", { id: "top-level-buttons-computed" }, h("segmented-like-dislike-button-view-model", {}, h("button", {})), h("yt-button-view-model", {}, h("button", {})));
const flexible = () => h("div", { id: "flexible-item-buttons" }, h("yt-button-view-model", {}, h("button", {})));
const more = () => h("yt-button-shape", { id: "button-shape" }, h("button", { class: "yt-spec-button-shape-next--icon-button" }));
const ours = () => h("div", { class: "s2d-yt" }, h("button", {}));

test("anchors on the more-actions button, after Save", () => {
  const m = more();
  assert.deepEqual(placement(h("ytd-menu-renderer", {}, topLevel(), flexible(), m)), { anchor: m, action: "inject", existing: null, extras: [] });
});

test("waits until the more-actions button has rendered", () => {
  assert.equal(placement(h("ytd-menu-renderer", {}, topLevel(), flexible(), h("yt-button-shape", { id: "button-shape" }))).anchor, null);
  assert.equal(placement(h("ytd-menu-renderer", {}, topLevel(), flexible())).anchor, null);
});

test("leaves our button alone when it sits right before the more-actions button", () => {
  const [m, o] = [more(), ours()];
  assert.deepEqual(placement(h("ytd-menu-renderer", {}, topLevel(), flexible(), o, m)), { anchor: m, action: "ok", existing: o, extras: [] });
});

test("moves our button when YouTube re-renders the row around it", () => {
  const [m, o] = [more(), ours()];
  assert.deepEqual(placement(h("ytd-menu-renderer", {}, o, topLevel(), flexible(), m)), { anchor: m, action: "move", existing: o, extras: [] });
});

test("keeps one button and reports the extras", () => {
  const [m, a, b] = [more(), ours(), ours()];
  assert.deepEqual(placement(h("ytd-menu-renderer", {}, topLevel(), flexible(), a, b, m)), { anchor: m, action: "move", existing: a, extras: [b] });
});
