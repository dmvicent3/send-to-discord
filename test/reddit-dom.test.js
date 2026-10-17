const { test } = require("node:test");
const assert = require("node:assert/strict");
const { h } = require("./helpers/fake-dom.js");
const { hasClass, isPost, findOwnButtonsRow, postPermalink } = require("../src/sites/reddit-dom.js");

const row = (id) => h("ul", { class: "flat-list buttons", id }, h("li", {}, h("a", {})));
const comment = (id) => h("div", { class: "thing comment" }, h("div", { class: "entry" }, row(id)));

test("hasClass matches whole class names only", () => {
  const node = h("div", { class: "thing  link\tpromoted" });
  assert.equal(hasClass(node, "link"), true);
  assert.equal(hasClass(node, "lin"), false);
  assert.equal(hasClass(h("div"), "link"), false);
});

test("isPost accepts link things and rejects comments", () => {
  assert.equal(isPost(h("div", { class: "thing link" })), true);
  assert.equal(isPost(h("div", { class: "thing comment" })), false);
  assert.equal(isPost(h("div", { class: "thing link comment" })), false);
  assert.equal(isPost(h("div", { class: "link" })), false);
});

test("findOwnButtonsRow finds the row inside the post's entry", () => {
  const own = row("own");
  const thing = h("div", { class: "thing link" }, h("div", { class: "entry" }, h("p", { class: "title" }), own));
  assert.equal(findOwnButtonsRow(thing), own);
});

test("findOwnButtonsRow ignores comment rows before and after the post's own row", () => {
  const own = row("own");
  const thing = h("div", { class: "thing link" },
    h("div", { class: "child" }, comment("before")),
    h("div", { class: "entry" }, own),
    h("div", { class: "child" }, comment("after")));
  assert.equal(findOwnButtonsRow(thing), own);
});

test("findOwnButtonsRow returns null when the post has no row of its own", () => {
  const thing = h("div", { class: "thing link" }, h("div", { class: "child" }, comment("c")));
  assert.equal(findOwnButtonsRow(thing), null);
  assert.equal(findOwnButtonsRow(h("div", { class: "thing link" }, h("ul", { class: "flat-list" }))), null);
});

test("postPermalink reads data-permalink", () => {
  assert.equal(postPermalink(h("div", { class: "thing link", "data-permalink": "/r/pics/comments/1/t/" })), "/r/pics/comments/1/t/");
  assert.equal(postPermalink(h("div", { class: "thing link" })), null);
});
