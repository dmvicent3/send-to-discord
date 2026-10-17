const { test } = require("node:test");
const assert = require("node:assert/strict");
const { youtubeLink } = require("../src/sites/youtube-url.js");

const ID = "dQw4w9WgXcQ";
const LINK = `https://www.youtube.com/watch?v=${ID}`;

test("returns the bare watch link for every video URL form", () => {
  for (const href of [
    LINK,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc&t=30`,
    `/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=754s&si=x&pp=y&list=PL1&index=3`,
    `https://www.youtube.com/watch?list=PL1&v=${ID}`,
  ]) {
    assert.equal(youtubeLink(href), LINK, href);
  }
});

test("returns null for anything that is not a video", () => {
  for (const href of [
    "https://www.youtube.com/",
    `https://www.youtube.com/shorts/${ID}`,
    "https://www.youtube.com/@channel",
    "https://www.youtube.com/results?search_query=x",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQx",
    "https://www.youtube.com/watch?v=dQw4w9WgX!Q",
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    "",
  ]) {
    assert.equal(youtubeLink(href), null, href);
  }
});
