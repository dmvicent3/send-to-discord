const { test } = require("node:test");
const assert = require("node:assert/strict");
const { STATES, ARM_MS, RESULT_MS, TOOLTIP, transition } = require("../src/button-state.js");

const TABLE = [
  ["idle", "click", "armed"],
  ["armed", "click", "sending"],
  ["armed", "timeout", "idle"],
  ["sending", "sent", "sent"],
  ["sending", "failed", "failed"],
  ["sent", "timeout", "idle"],
  ["failed", "timeout", "idle"],
];

test("transition follows the state table", () => {
  for (const [from, event, to] of TABLE) {
    assert.equal(transition(from, event), to, `${from} + ${event}`);
  }
});

test("unlisted transitions keep the current state", () => {
  const listed = new Set(TABLE.map(([from, event]) => `${from}:${event}`));
  for (const state of Object.values(STATES)) {
    for (const event of ["click", "timeout", "sent", "failed"]) {
      if (!listed.has(`${state}:${event}`)) {
        assert.equal(transition(state, event), state, `${state} + ${event}`);
      }
    }
  }
  assert.equal(transition("sending", "click"), "sending");
  assert.equal(transition("sent", "click"), "sent");
});

test("timings and tooltips match the spec", () => {
  assert.deepEqual(STATES, { idle: "idle", armed: "armed", sending: "sending", sent: "sent", failed: "failed" });
  assert.equal(ARM_MS, 3000);
  assert.equal(RESULT_MS, 2000);
  assert.deepEqual(TOOLTIP, {
    idle: "Send to Discord",
    armed: "Click again to send",
    sending: "Sending…",
    sent: "Sent",
    failed: "Failed: ",
  });
});
