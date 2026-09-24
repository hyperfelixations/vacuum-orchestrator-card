"use strict";
// The shipped file itself: one strict IIFE with no runtime dependency and no source map.
// Boundary: what the bundle contains, not what the card does with it.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("the release artifact is a dependency-free strict IIFE", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "dist", "vacuum-orchestrator-card.js"), "utf8");
  assert.match(source, /Vacuum Orchestrator Card/);
  assert.match(source, /'use strict'/);
  assert.doesNotMatch(source, /^\s*(?:import|export)\b/m);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /sourceMappingURL/);
});
