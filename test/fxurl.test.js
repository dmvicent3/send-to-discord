const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toFxUrl } = require("../src/fxurl.js");

test("rewrites status links", () => {
  const cases = [
    ["https://x.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
    ["https://twitter.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
    ["https://mobile.twitter.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
    ["https://www.x.com/jack/status/20", "https://fxtwitter.com/jack/status/20"],
    ["https://X.COM/jack/status/20", "https://fxtwitter.com/jack/status/20"],
    ["/jack/status/20", "https://fxtwitter.com/jack/status/20"],
    ["https://x.com/jack/status/20/photo/1", "https://fxtwitter.com/jack/status/20"],
    ["https://x.com/jack/status/20/analytics", "https://fxtwitter.com/jack/status/20"],
    ["https://x.com/jack/status/20?s=20&t=abc", "https://fxtwitter.com/jack/status/20"],
    ["https://x.com/jack/status/20#m", "https://fxtwitter.com/jack/status/20"],
    ["https://x.com/i/web/status/20", "https://fxtwitter.com/i/status/20"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(toFxUrl(input), expected, input);
  }
});

test("rejects non-status links", () => {
  const inputs = [
    "https://x.com/jack",
    "https://x.com/home",
    "https://example.com/jack/status/20",
    "https://x.com/jack/status/abc",
    "",
    "not a url",
  ];
  for (const input of inputs) {
    assert.equal(toFxUrl(input), null, input);
  }
});
