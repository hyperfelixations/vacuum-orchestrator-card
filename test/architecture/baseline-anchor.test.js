"use strict";
// The release job binds its draft to a stable, platform-independent baseline digest.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("baseline anchor reports a POSIX SHA-256 for the release workflow", () => {
  const root = path.join(__dirname, "..", "..");
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "baseline-anchor.mjs")], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\bposix\s+[0-9a-f]{64}\b/);
});
