const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EMBED_HOST, embedLink, planRedditShare } = require("../src/sites/reddit-share.js");

const post = (name) => require(`./fixtures/reddit/${name}.json`)[0].data.children[0].data;

test("embedLink prefixes the permalink with the embed host", () => {
  assert.equal(EMBED_HOST, "vxreddit.com");
  assert.equal(embedLink("/r/a/comments/1/t/"), "https://vxreddit.com/r/a/comments/1/t/");
});

test("image post uploads the file with the embed link as fallback", () => {
  assert.deepEqual(planRedditShare(post("image")), {
    type: "files",
    urls: ["https://i.redd.it/abc.jpg"],
    fallback: "https://vxreddit.com/r/pics/comments/1/t/",
  });
});

test("gif post uploads the gif", () => {
  assert.deepEqual(planRedditShare(post("gif")).urls, ["https://i.redd.it/def.gif"]);
});

test("gallery keeps order, skips failed items and prefers s.gif", () => {
  assert.deepEqual(planRedditShare(post("gallery")), {
    type: "files",
    urls: ["https://i.redd.it/m1.jpg", "https://i.redd.it/m3.gif"],
    fallback: "https://vxreddit.com/r/pics/comments/3/t/",
  });
});

test("gallery with no valid items, video and self posts send the embed link", () => {
  for (const [name, id] of [["gallery-empty", 4], ["video", 5], ["self", 7]]) {
    assert.deepEqual(planRedditShare(post(name)), { type: "link", url: `https://vxreddit.com/r/pics/comments/${id}/t/` }, name);
  }
});

test("external link post sends the external url as-is", () => {
  assert.deepEqual(planRedditShare(post("external")), { type: "link", url: "https://www.youtube.com/watch?v=x" });
});

test("crosspost of an image uploads the parent's file with the parent's fallback", () => {
  assert.deepEqual(planRedditShare(post("crosspost-image")), {
    type: "files",
    urls: ["https://i.redd.it/abc.jpg"],
    fallback: "https://vxreddit.com/r/pics/comments/1/t/",
  });
});

test("crosspost of a video sends the parent's embed link", () => {
  assert.deepEqual(planRedditShare(post("crosspost-video")), { type: "link", url: "https://vxreddit.com/r/pics/comments/5/t/" });
});
