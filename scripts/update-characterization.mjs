import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(ROOT, "test", "characterization");
export function discoverCharacterizationTests(dir = directory) {
  if (!fs.existsSync(dir)) throw new Error(`characterize:update: no characterization tests found under ${dir}`);
  const tests = fs.readdirSync(dir).filter((name) => name.endsWith(".test.js")).sort().map((name) => path.join(dir, name));
  if (!tests.length) throw new Error(`characterize:update: no characterization tests found under ${dir}`);
  return tests;
}
export function main(args = process.argv.slice(2)) {
  const tests = discoverCharacterizationTests();
  if (args.includes("--list")) { tests.forEach((file) => console.log(path.relative(ROOT, file).replaceAll(path.sep, "/"))); return 0; }
  return spawnSync(process.execPath, ["--test", ...tests], { cwd: ROOT, stdio: "inherit", env: { ...process.env, UPDATE_CHARACTERIZATION: "1" } }).status ?? 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
