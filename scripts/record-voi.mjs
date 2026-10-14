// Records the Vacuum Orchestrator integration's scenarios into test/fixtures/voi/recordings: the
// integration's own code runs (`python -m tests.contract --record-to`), so the card's tests play
// what the real integration answers. Nothing of it is committed; see TESTING.md "Recordings".
//
//   npm run voi:record                       from ../vacuum-orchestrator and its .venv-ha
//   npm run voi:record -- --from <checkout> --python <interpreter>
//   npm run voi:record -- --force            record even if the recordings are current
//
// test/voi-ref names the integration commit CI and releases record from. A local checkout at
// another commit is used as it is, with a note.

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "test", "fixtures", "voi", "recordings");
const PARTIAL = `${TARGET}.partial`;
const PROVENANCE = "provenance.json";
const PIN = path.join(ROOT, "test", "voi-ref");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function git(checkout, ...args) {
  return execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
}

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// The recordings in TARGET belong to this clean commit and are unchanged.
function current(state) {
  const provenance = readJson(path.join(TARGET, PROVENANCE));
  if (!provenance || provenance.voi_commit !== state.voi_commit || provenance.dirty || state.dirty) return false;
  return Object.entries(provenance.files ?? {}).every(([name, digest]) => {
    const file = path.join(TARGET, name);
    return fs.existsSync(file) && sha256(fs.readFileSync(file)) === digest;
  });
}

function main() {
  const checkout = path.resolve(ROOT, argument("--from") ?? path.join("..", "vacuum-orchestrator"));
  if (!fs.existsSync(path.join(checkout, "tests", "contract", "__main__.py"))) {
    throw new Error(`no checkout of the integration at ${checkout}; clone it next to the card or pass --from`);
  }
  const python =
    argument("--python") ?? path.join(checkout, ".venv-ha", process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python"));
  const state = { voi_commit: git(checkout, "rev-parse", "HEAD"), dirty: git(checkout, "status", "--porcelain") !== "" };
  const pin = fs.readFileSync(PIN, "utf8").trim();
  if (pin !== state.voi_commit) console.log(`note: the integration is at ${state.voi_commit}${state.dirty ? " with changes" : ""}, test/voi-ref names ${pin}`);
  if (!process.argv.includes("--force") && current(state)) {
    console.log(`recordings of ${state.voi_commit} are current`);
    return;
  }

  fs.rmSync(PARTIAL, { recursive: true, force: true });
  const run = spawnSync(python, ["-m", "tests.contract", "--record-to", PARTIAL], { cwd: checkout, stdio: "inherit" });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`recording the integration failed with exit code ${run.status}`);

  const names = fs.readdirSync(PARTIAL).filter((name) => name.endsWith(".json")).sort();
  if (!names.length) throw new Error("the integration recorded nothing");
  const files = Object.fromEntries(names.map((name) => [name, sha256(fs.readFileSync(path.join(PARTIAL, name)))]));
  fs.writeFileSync(path.join(PARTIAL, PROVENANCE), `${JSON.stringify({ ...state, pin, files }, null, 2)}\n`);
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.renameSync(PARTIAL, TARGET);
  console.log(`${names.length} recordings of ${state.voi_commit}${state.dirty ? " with changes" : ""}`);
}

main();
