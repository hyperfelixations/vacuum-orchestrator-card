import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "test", "baseline");
function list(directory, prefix = "") {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? list(path.join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
const hash = crypto.createHash("sha256");
for (const relative of list(BASELINE).sort()) {
  hash.update(relative.replaceAll(path.sep, "/"));
  hash.update("\0");
  hash.update(fs.readFileSync(path.join(BASELINE, ...relative.split("/"))));
  hash.update("\0");
}
console.log(hash.digest("hex"));
