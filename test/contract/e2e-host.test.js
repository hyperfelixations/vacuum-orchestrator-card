"use strict";
// The smoke test's host starter (test/e2e/host.js, internal dev doc §10 "Smoke-Test"): it takes the
// host's one JSON report line and, when the host fails to start, reports something unreadable,
// ends early or never becomes ready, stops the process it started and fails with the reason.
// Stand-in hosts are short Node processes.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { stopProcess, waitForReport } = require("../e2e/host.js");

// A stand-in host running `body`; it ends when its stdin closes, like the real one.
function standIn(body) {
  const script = `process.stdin.on("end", () => process.exit(0)); process.stdin.resume(); ${body}`;
  return spawn(process.execPath, ["-e", script], { stdio: ["pipe", "pipe", "pipe"] });
}

const ended = (child) => child.exitCode !== null || child.signalCode !== null;

test("the report line of a host that becomes ready is read after its other output", async () => {
  const child = standIn('console.log("starting"); console.log(JSON.stringify({ url: "http://127.0.0.1:1", session: "s" }));');
  assert.deepEqual(await waitForReport(child, [], 10_000), { url: "http://127.0.0.1:1", session: "s" });
  await stopProcess(child, 10_000);
  assert.ok(ended(child));
});

test("an unreadable report line fails the start and the host is stopped", async () => {
  const child = standIn('console.log("{not json");');
  await assert.rejects(waitForReport(child, [], 10_000), /unreadable report/);
  await stopProcess(child, 10_000);
  assert.ok(ended(child));
});

test("a host that ends before it is ready fails the start with its output", async () => {
  const child = standIn('console.error("broken environment"); process.exit(3);');
  await assert.rejects(waitForReport(child, [], 10_000), /ended with 3 before it was ready[\s\S]*broken environment/);
});

test("a host that never becomes ready is stopped after the wait, by force if it ignores stdin", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { stdio: ["pipe", "pipe", "pipe"] });
  await assert.rejects(waitForReport(child, [], 200), /not ready within/);
  await stopProcess(child, 200);
  assert.ok(ended(child));
});

test("a host that cannot be started fails the start, and stopping it waits for nothing", async () => {
  const child = spawn("vacuum-orchestrator-no-such-interpreter", [], { stdio: ["pipe", "pipe", "pipe"] });
  await assert.rejects(waitForReport(child, [], 10_000), /could not start/);
  await stopProcess(child, 10_000);
});
