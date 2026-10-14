// The integration's recordings as `npm run voi:record` wrote them: unchanged since, of API
// version 4, and named with their integration commit. See TESTING.md "Recordings".

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { RECORDINGS_DIRECTORY: RECORDINGS } = require("../helpers/recordings.js");

const provenance = JSON.parse(fs.readFileSync(path.join(RECORDINGS, "provenance.json"), "utf8"));
const names = fs.readdirSync(RECORDINGS).filter((name) => name !== "provenance.json").sort();
const pin = fs.readFileSync(path.join(__dirname, "..", "voi-ref"), "utf8");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("test/voi-ref names one integration commit", () => {
  assert.match(pin, /^[0-9a-f]{40}\n$/);
});

test("the provenance names every recording with its digest and the integration commit", () => {
  assert.match(provenance.voi_commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof provenance.dirty, "boolean");
  assert.equal(provenance.pin, pin.trim());
  assert.deepEqual(Object.keys(provenance.files).sort(), names);
  for (const name of names) assert.equal(sha256(fs.readFileSync(path.join(RECORDINGS, name))), provenance.files[name], name);
});

test("every recording is a format 2 recording of API version 4 from that commit", () => {
  for (const name of names) {
    const recording = JSON.parse(fs.readFileSync(path.join(RECORDINGS, name), "utf8"));
    assert.equal(`${recording.scenario}.json`, name);
    assert.equal(recording.provenance.format, 2, name);
    assert.equal(recording.provenance.api_version, 4, name);
    assert.ok(provenance.voi_commit.startsWith(recording.provenance.voi_commit), name);
    assert.equal(recording.provenance.dirty, provenance.dirty, name);
    assert.ok(recording.hass && Array.isArray(recording.steps), name);
  }
});
