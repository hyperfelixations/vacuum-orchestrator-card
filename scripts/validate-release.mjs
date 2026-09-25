import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desired = String(process.argv[2] ?? "");

if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-dev\.[1-9][0-9]*)?$/u.test(desired)) {
  throw new Error(`release version must be MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-dev.N, received ${JSON.stringify(desired)}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const lockJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
const { CARD_VERSION } = await import(pathToFileURL(path.join(ROOT, "src", "core", "card-metadata.js")).href);
const hacs = JSON.parse(fs.readFileSync(path.join(ROOT, "hacs.json"), "utf8"));
// The lockfile carries the version twice and npm keeps both in step; a release that checked
// only one of them could ship a package whose metadata disagrees with itself.
const values = {
  "package.json": packageJson.version,
  "package-lock.json version": lockJson.version,
  "package-lock.json packages[\"\"].version": lockJson.packages?.[""]?.version,
  "src/core/card-metadata.js": CARD_VERSION,
};
const mismatches = Object.entries(values).filter(([, value]) => value !== desired);
if (mismatches.length) {
  throw new Error(`release version mismatch for ${mismatches.map(([file, value]) => `${file}=${value}`).join(", ")}; expected ${desired}`);
}
const asset = "vacuum-orchestrator-card.js";
if (hacs.filename !== asset) {
  throw new Error(`hacs.json names ${JSON.stringify(hacs.filename)} as the released file; expected ${asset}`);
}
if (typeof hacs.name !== "string" || hacs.name.trim() === "") {
  throw new Error("hacs.json must carry a non-empty name");
}
console.log(`Release version validated: ${desired} (HACS asset ${asset})`);
