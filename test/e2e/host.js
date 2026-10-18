"use strict";

// Starts the integration's E2E host for the smoke test and stops it afterwards: a real Home
// Assistant with its frontend on 127.0.0.1, the integration added through its config flow, a
// simulated Roborock and this card's built bundle on the default dashboard. The host reports
// one JSON line once ready and runs until its stdin closes (integration dev doc "E2E-Host").
//
// VOI_CHECKOUT names the integration's checkout (default: next to the card) and VOI_PYTHON an
// interpreter with its requirements-e2e.txt (default: its .venv-ha on Windows, else `python`).

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const BUNDLE = path.join(ROOT, "dist", "vacuum-orchestrator-card.js");
// Where the tests find the host; the file names the session file, never a token.
const HOST_FILE = path.join(ROOT, "test-results", "e2e-host.json");
const READY_MS = 240_000;
const STOP_MS = 60_000;

function checkout() {
  return path.resolve(ROOT, process.env.VOI_CHECKOUT ?? path.join("..", "vacuum-orchestrator"));
}

function interpreter(voi) {
  if (process.env.VOI_PYTHON) return process.env.VOI_PYTHON;
  const local = path.join(voi, ".venv-ha", "Scripts", "python.exe");
  return process.platform === "win32" && fs.existsSync(local) ? local : "python";
}

function waitForReport(child, log) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`the E2E host was not ready within ${READY_MS / 1000} s\n${log.join("")}`)), READY_MS);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (const line of buffer.split(/\r?\n/).slice(0, -1)) {
        if (!line.trim().startsWith("{")) continue;
        clearTimeout(timer);
        resolve(JSON.parse(line));
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    });
    child.stderr.on("data", (chunk) => log.push(String(chunk)));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`the E2E host ended with ${code} before it was ready\n${log.join("")}`));
    });
  });
}

module.exports = async function startHost() {
  if (!fs.existsSync(BUNDLE)) throw new Error("build the card first: npm run build");
  const voi = checkout();
  const log = [];
  const child = spawn(interpreter(voi), ["-m", "tests.e2e_host", "--household", "single_roborock", "--install-voi", "--card", BUNDLE], { cwd: voi, stdio: ["pipe", "pipe", "pipe"] });
  const report = await waitForReport(child, log);
  fs.mkdirSync(path.dirname(HOST_FILE), { recursive: true });
  fs.writeFileSync(HOST_FILE, JSON.stringify({ url: report.url, session: report.session }));
  // Playwright calls the returned function once every test has run.
  return async function stopHost() {
    const ended = new Promise((resolve) => child.once("exit", resolve));
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), STOP_MS);
    await ended;
    clearTimeout(timer);
    fs.rmSync(HOST_FILE, { force: true });
  };
};

module.exports.HOST_FILE = HOST_FILE;
