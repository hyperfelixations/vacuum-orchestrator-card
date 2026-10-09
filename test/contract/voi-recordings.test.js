// The integration's recordings: exactly the synchronized files, unchanged since `npm run
// sync:voi`, and equal to the integration's own when its sibling checkout is at their commit.

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const RECORDINGS = path.join(__dirname, "..", "fixtures", "voi", "recordings");
const SIBLING = path.join(__dirname, "..", "..", "..", "vacuum-orchestrator");
const provenance = JSON.parse(fs.readFileSync(path.join(RECORDINGS, "provenance.json"), "utf8"));
const names = fs.readdirSync(RECORDINGS).filter((name) => name !== "provenance.json").sort();
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("the provenance names every recording with its digest and the integration commit", () => {
  assert.match(provenance.voi_commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(provenance.files).sort(), names);
  for (const name of names) assert.equal(sha256(fs.readFileSync(path.join(RECORDINGS, name))), provenance.files[name], name);
});

test("every recording is a format 2 recording of API version 4", () => {
  for (const name of names) {
    const recording = JSON.parse(fs.readFileSync(path.join(RECORDINGS, name), "utf8"));
    assert.equal(`${recording.scenario}.json`, name);
    assert.equal(recording.provenance.format, 2, name);
    assert.equal(recording.provenance.api_version, 4, name);
    assert.ok(recording.hass && Array.isArray(recording.steps), name);
  }
});

test("the recordings equal the integration's own at their commit", (t) => {
  let head = null;
  try {
    head = execFileSync("git", ["-C", SIBLING, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // No sibling checkout of the integration.
  }
  if (head !== provenance.voi_commit) {
    t.skip(`the integration checkout is not at ${provenance.voi_commit}`);
    return;
  }
  const source = path.join(SIBLING, "tests", "contract", "recordings");
  assert.deepEqual(fs.readdirSync(source).filter((name) => name.endsWith(".json")).sort(), names);
  for (const name of names) assert.ok(fs.readFileSync(path.join(source, name)).equals(fs.readFileSync(path.join(RECORDINGS, name))), name);
});
