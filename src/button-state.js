// Click-to-arm state machine for the send button: idle → armed → sending → sent/failed → idle.

const STATES = { idle: "idle", armed: "armed", sending: "sending", sent: "sent", failed: "failed" };

const ARM_MS = 3000;
const RESULT_MS = 2000;

const TOOLTIP = {
  idle: "Send to Discord",
  armed: "Click again to send",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed: ",
};

const TRANSITIONS = {
  "idle:click": STATES.armed,
  "armed:click": STATES.sending,
  "armed:timeout": STATES.idle,
  "sending:sent": STATES.sent,
  "sending:failed": STATES.failed,
  "sent:timeout": STATES.idle,
  "failed:timeout": STATES.idle,
};

function transition(state, event) {
  return TRANSITIONS[`${state}:${event}`] ?? state;
}

if (typeof module !== "undefined") module.exports = { STATES, ARM_MS, RESULT_MS, TOOLTIP, transition };
