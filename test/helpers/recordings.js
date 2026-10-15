"use strict";
// The integration's recordings, as `npm run voi:record` wrote them into
// test/fixtures/voi/recordings (internal dev doc §10), by scenario name.

const fs = require("node:fs");
const path = require("node:path");

const DIRECTORY = path.join(__dirname, "..", "fixtures", "voi", "recordings");

function loadRecording(name) {
  const file = path.join(DIRECTORY, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`no recording ${name}; run npm run voi:record`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Whether every field of `match` equals the message's.
const matches = (message, match) => Object.entries(match).every(([key, value]) => JSON.stringify(message[key]) === JSON.stringify(value));

// The integration's first successful answer in a recording to a request like `match`, e.g.
// { type: "vacuum_orchestrator/configuration/get", query: "get_rooms" }.
function recordedAnswer(name, match) {
  const { steps } = loadRecording(name);
  for (const [position, step] of steps.entries()) {
    if (!step.send || !matches(step.send, match)) continue;
    const answer = steps.slice(position + 1).find((later) => later.receive?.type === "result" && later.receive.id === step.send.id)?.receive;
    if (answer?.success) return answer.result;
  }
  throw new Error(`${name} has no successful answer to ${JSON.stringify(match)}`);
}

// The subscription events of a recording, in order.
function recordedEvents(name) {
  return loadRecording(name).steps.filter((step) => step.receive?.type === "event").map((step) => step.receive.event);
}

module.exports = { loadRecording, recordedAnswer, recordedEvents, RECORDINGS_DIRECTORY: DIRECTORY };
