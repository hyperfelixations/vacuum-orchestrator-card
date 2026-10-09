// Copies the integration's recordings into test/fixtures/voi/recordings and writes their
// provenance: the integration commit they come from and the SHA-256 of every file. The tests
// replay these files instead of imitating the integration; see TESTING.md "Recordings".
//
//   npm run sync:voi                          from ../vacuum-orchestrator
//   npm run sync:voi -- --from <checkout>     from another checkout of the integration
//
// The recordings must be committed in that checkout, so the commit names exactly these bytes.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "test", "fixtures", "voi", "recordings");
const SOURCE_DIRECTORY = path.join("tests", "contract", "recordings");
const PROVENANCE = "provenance.json";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function git(checkout, ...args) {
  return execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
}

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function main() {
  const checkout = path.resolve(ROOT, argument("--from") ?? path.join("..", "vacuum-orchestrator"));
  const source = path.join(checkout, SOURCE_DIRECTORY);
  if (!fs.existsSync(source)) throw new Error(`no recordings at ${source}`);
  const uncommitted = git(checkout, "status", "--porcelain", "--", SOURCE_DIRECTORY);
  if (uncommitted) throw new Error(`commit the recordings in ${checkout} first:\n${uncommitted}`);
  const names = fs.readdirSync(source).filter((name) => name.endsWith(".json")).sort();
  if (!names.length) throw new Error(`no recordings at ${source}`);

  fs.mkdirSync(TARGET, { recursive: true });
  for (const name of fs.readdirSync(TARGET)) {
    if (name !== PROVENANCE && !names.includes(name)) fs.rmSync(path.join(TARGET, name));
  }
  const files = {};
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(source, name));
    fs.writeFileSync(path.join(TARGET, name), bytes);
    files[name] = sha256(bytes);
  }
  const provenance = { voi_commit: git(checkout, "rev-parse", "HEAD"), files };
  fs.writeFileSync(path.join(TARGET, PROVENANCE), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`${names.length} recordings from ${provenance.voi_commit}`);
}

main();
