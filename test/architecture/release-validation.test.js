"use strict";
// The local release validator accepts the same version vocabulary as the manual workflow.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..", "..");
const script = path.join(root, "scripts", "validate-release.mjs");

function validate(version) {
  return spawnSync(process.execPath, [script, version], { cwd: root, encoding: "utf8" });
}

test("the declared package version passes the local release preflight", () => {
  const version = require("../../package.json").version;
  const result = validate(version);
  assert.equal(result.status, 0, result.stderr);
});

test("the card requires the same Home Assistant release as the integration", () => {
  assert.equal(require("../../hacs.json").homeassistant, "2026.10.0");
});

test("version aliases, leading zeros and other prerelease kinds are rejected", () => {
  for (const version of ["v0.0.1", "00.0.1", "0.00.1", "0.0.1-beta.1", "0.0.1-dev.0", "0.0.1+build"]) {
    const result = validate(version);
    assert.notEqual(result.status, 0, `${version} was accepted`);
  }
});
