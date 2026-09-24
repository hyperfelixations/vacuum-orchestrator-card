"use strict";
// Frozen recordings of what the card produces. A difference is a change, not necessarily a
// defect: re-record with `npm run characterize:update` and review every changed file.

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASELINE_DIR = path.join(__dirname, "..", "baseline");
const UPDATE = process.env.UPDATE_CHARACTERIZATION === "1";

// Markup without the stylesheet (recorded separately) and with one element per line, so a
// diff points at the node that changed.
function serializeCard(card) {
  const root = card.shadowRoot.querySelector(".voc-root");
  if (!root) return "";
  return `${root.outerHTML.replace(/>\s*</g, ">\n<").trim()}\n`;
}

function expectBaseline(relative, actual) {
  const file = path.join(BASELINE_DIR, ...relative.split("/"));
  if (UPDATE || !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, actual, "utf8");
    if (!UPDATE) throw new Error(`characterization: recorded missing baseline ${relative}; review it and run again`);
    return;
  }
  const expected = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  assert.equal(actual, expected, `${relative} changed; review and re-record with npm run characterize:update`);
}

module.exports = { serializeCard, expectBaseline, BASELINE_DIR };
