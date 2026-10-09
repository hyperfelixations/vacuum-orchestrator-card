"use strict";
// The integration's recordings, as synchronized into test/fixtures/voi/recordings (TESTING.md
// "Recordings"), by scenario name.

const fs = require("node:fs");
const path = require("node:path");

const DIRECTORY = path.join(__dirname, "..", "fixtures", "voi", "recordings");

function loadRecording(name) {
  const file = path.join(DIRECTORY, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`no recording ${name}; run npm run sync:voi`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

module.exports = { loadRecording, RECORDINGS_DIRECTORY: DIRECTORY };
