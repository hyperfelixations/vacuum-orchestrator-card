// The jsdom mount: a card test that fails before it unmounts still ends its process and reports
// the failure; the card's timers would otherwise keep the test runner waiting.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MOUNT = path.join(__dirname, "..", "helpers", "mount-card.js");

test("a card test that fails before unmounting ends and reports the failure", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "voc-mount-"));
  const file = path.join(directory, "failing.test.js");
  fs.writeFileSync(
    file,
    [
      'const test = require("node:test");',
      `const { mountCard } = require(${JSON.stringify(MOUNT)});`,
      'test("fails while the card is open", async () => {',
      '  await mountCard({ recording: "queue_end", from: "The queue waits for work" });',
      '  throw new Error("expected failure");',
      "});",
    ].join("\n")
  );
  try {
    // A runner of its own: the parent runner's context would make it report to the parent.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--test", file], { encoding: "utf8", env, timeout: 60000 });
    assert.equal(run.error, undefined, "the test process ends by itself");
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /expected failure/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
