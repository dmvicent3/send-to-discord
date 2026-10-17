const { test } = require("node:test");
const assert = require("node:assert/strict");
const { h } = require("./helpers/fake-dom.js");
const { placement } = require("../src/sites/youtube-dom.js");

const like = () => h("segmented-like-dislike-button-view-model", {}, h("button", { class: "yt-spec-button-shape-next--segmented-start" }));
const share = () => h("yt-button-view-model", {}, h("button-view-model", {}, h("button", { class: "yt-spec-button-shape-next--tonal" })));
const ours = () => h("div", { class: "s2d-yt" }, h("button", {}));

test("anchors on Share, after the like control", () => {
  const s = share();
  const row = h("div", {}, like(), s);
  assert.deepEqual(placement(row), { anchor: s, action: "inject", existing: null, extras: [] });
});

test("waits while only the like control has a button", () => {
  assert.equal(placement(h("div", {}, like(), h("yt-button-view-model"))).anchor, null);
  assert.equal(placement(h("div", {}, like())).anchor, null);
});

test("never anchors on a segmented button even under another tag", () => {
  const row = h("div", {}, h("like-button-view-model", {}, h("button", {})), h("x", {}, h("button", { class: "a yt-spec-button-shape-next--segmented-end" })));
  assert.equal(placement(row).anchor, null);
});

test("leaves our button alone when it already follows Share", () => {
  const s = share();
  const o = ours();
  assert.deepEqual(placement(h("div", {}, like(), s, o)), { anchor: s, action: "ok", existing: o, extras: [] });
});

test("moves our button when YouTube re-adds Share after it", () => {
  const s = share();
  const o = ours();
  assert.deepEqual(placement(h("div", {}, like(), o, s)), { anchor: s, action: "move", existing: o, extras: [] });
});

test("keeps one button and reports the extras", () => {
  const s = share();
  const [a, b] = [ours(), ours()];
  assert.deepEqual(placement(h("div", {}, like(), s, a, b)), { anchor: s, action: "ok", existing: a, extras: [b] });
});
