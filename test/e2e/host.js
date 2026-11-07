"use strict";

// Starts the integration's E2E host for the smoke test and stops it afterwards: a real Home
// Assistant with its frontend on 127.0.0.1, the integration added through its config flow, a
// simulated Roborock and this card's built bundle on the default dashboard. The host reports
// one JSON line once ready and runs until its stdin closes (integration dev doc "E2E-Host"). A
// host that fails to start, reports something unreadable or never becomes ready is stopped.
//
// VOI_CHECKOUT names the integration's checkout (default: test/helpers/voi-checkout.js) and
// VOI_PYTHON an interpreter with its requirements-e2e.txt (default: its .venv-ha on Windows,
// else `python`).

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { defaultVoiCheckout } = require("../helpers/voi-checkout.js");

const ROOT = path.resolve(__dirname, "..", "..");
const BUNDLE = path.join(ROOT, "dist", "vacuum-orchestrator-card.js");
// Where the tests find the host; the file names the session file, never a token.
const HOST_FILE = path.join(ROOT, "test-results", "e2e-host.json");
const READY_MS = 240_000;
const STOP_MS = 60_000;

function checkout() {
  return path.resolve(ROOT, process.env.VOI_CHECKOUT ?? defaultVoiCheckout(ROOT));
}

function interpreter(voi) {
  if (process.env.VOI_PYTHON) return process.env.VOI_PYTHON;
  const local = path.join(voi, ".venv-ha", "Scripts", "python.exe");
  return process.platform === "win32" && fs.existsSync(local) ? local : "python";
}

// The host's report: the first output line that starts with "{".
function waitForReport(child, log, readyMs = READY_MS) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const finish = (error, report) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(report);
    };
    const timer = setTimeout(() => finish(new Error(`the E2E host was not ready within ${readyMs / 1000} s\n${log.join("")}`)), readyMs);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      const line = lines.find((entry) => entry.trim().startsWith("{"));
      if (line === undefined) return;
      try {
        finish(null, JSON.parse(line));
      } catch (error) {
        finish(new Error(`the E2E host wrote an unreadable report (${error.message}): ${line}`));
      }
    });
    child.stderr.on("data", (chunk) => log.push(String(chunk)));
    child.on("error", (error) => finish(new Error(`the E2E host could not start: ${error.message}`)));
    child.on("exit", (code) => finish(new Error(`the E2E host ended with ${code} before it was ready\n${log.join("")}`)));
  });
}

// Closing stdin asks the host to stop; after `graceMs` it is killed. A process that never
// started or has ended needs nothing.
async function stopProcess(child, graceMs = STOP_MS) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise((resolve) => child.once("exit", resolve));
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), graceMs);
  await ended;
  clearTimeout(timer);
}

module.exports = async function startHost() {
  if (!fs.existsSync(BUNDLE)) throw new Error("build the card first: npm run build");
  const voi = checkout();
  const log = [];
  const child = spawn(interpreter(voi), ["-m", "tests.e2e_host", "--household", "single_roborock", "--install-voi", "--card", BUNDLE], { cwd: voi, stdio: ["pipe", "pipe", "pipe"] });
  let report;
  try {
    report = await waitForReport(child, log);
  } catch (error) {
    await stopProcess(child);
    throw error;
  }
  fs.mkdirSync(path.dirname(HOST_FILE), { recursive: true });
  fs.writeFileSync(HOST_FILE, JSON.stringify({ url: report.url, session: report.session }));
  // Playwright calls the returned function once every test has run.
  return async function stopHost() {
    await stopProcess(child);
    fs.rmSync(HOST_FILE, { force: true });
  };
};

module.exports.HOST_FILE = HOST_FILE;
module.exports.waitForReport = waitForReport;
module.exports.stopProcess = stopProcess;
