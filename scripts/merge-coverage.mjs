// Normalizes direct-source, jsdom-bundle and Chromium V8 coverage to src/. The report is
// intentionally source-only: dist/ is generated output and never enters the quality floor.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";
import coverageModule from "istanbul-lib-coverage";
import reportModule from "istanbul-lib-report";
import reportsModule from "istanbul-reports";

const { createCoverageMap } = coverageModule;
const { createContext } = reportModule;
const { create: createReport } = reportsModule;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src") + path.sep;
const COVERAGE = path.join(ROOT, "coverage");
const MERGED_THRESHOLDS = Object.freeze({ statements: 95, branches: 92, functions: 70, lines: 95 });

function readMap(file) {
  if (!fs.existsSync(file)) throw new Error(`coverage input is missing: ${path.relative(ROOT, file)}`);
  return createCoverageMap(JSON.parse(fs.readFileSync(file, "utf8")));
}

function sourceOnly(map, label) {
  const filtered = createCoverageMap({});
  for (const file of map.files()) {
    const absolute = path.resolve(file);
    if (absolute === SRC.slice(0, -1) || absolute.startsWith(SRC)) filtered.addFileCoverage(map.fileCoverageFor(file));
  }
  if (filtered.files().length === 0) throw new Error(`${label} coverage contains no source-normalized src/ files`);
  return filtered;
}

async function browserMap() {
  const directory = path.join(COVERAGE, "browser", "raw");
  if (!fs.existsSync(directory)) throw new Error("browser coverage produced no raw directory");
  const map = createCoverageMap({});
  for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith(".json")).sort()) {
    const entries = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    for (const entry of entries) {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(entry.url).pathname).replace(/^\//u, "");
      } catch {
        continue;
      }
      if (pathname !== "dist/vacuum-orchestrator-card.js") continue;
      const local = path.join(ROOT, ...pathname.split("/"));
      if (!fs.existsSync(local)) continue;
      const converter = v8ToIstanbul(local, 0, { source: entry.source });
      await converter.load();
      converter.applyCoverage(entry.functions);
      map.merge(converter.toIstanbul());
    }
  }
  const measured = new Set(map.files().map((file) => path.resolve(file)));
  for (const file of sourceFileInventory()) {
    if (measured.has(path.resolve(file))) continue;
    map.addFileCoverage({ path: file, statementMap: {}, fnMap: {}, branchMap: {}, s: {}, f: {}, b: {} });
  }
  return sourceOnly(map, "browser");
}

function sourceFileInventory(directory = path.join(ROOT, "src"), found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFileInventory(full, found);
    else if (entry.name.endsWith(".js")) found.push(full);
  }
  return found;
}

const relativeSorted = (files) => files
  .map((file) => path.relative(ROOT, path.resolve(file)).split(path.sep).join("/"))
  .sort();

function describeDifference(label, expected, actual) {
  const missing = expected.filter((file) => !actual.includes(file));
  const extra = actual.filter((file) => !expected.includes(file));
  const parts = [];
  if (missing.length) parts.push(`missing from ${label}:\n  ${missing.join("\n  ")}`);
  if (extra.length) parts.push(`present only in ${label}:\n  ${extra.join("\n  ")}`);
  return parts.join("\n");
}

function enforceInventories(layers, merged) {
  const source = relativeSorted(sourceFileInventory());
  const failures = [];
  for (const [label, map] of Object.entries(layers)) {
    const files = relativeSorted(map.files());
    if (files.join("|") !== source.join("|")) {
      failures.push(`${label} coverage does not cover the src/ inventory\n${describeDifference(label, source, files)}`);
    }
  }
  const mergedFiles = relativeSorted(merged.files());
  if (mergedFiles.join("|") !== source.join("|")) {
    failures.push(`the merged map does not cover the src/ inventory\n${describeDifference("the merge", source, mergedFiles)}`);
  }
  if (failures.length) throw new Error(failures.join("\n\n"));
  console.log(`Coverage inventory: all ${source.length} source files present in every layer and in the merge.`);
}

function emit(name, map) {
  const directory = path.join(COVERAGE, name);
  fs.mkdirSync(directory, { recursive: true });
  const context = createContext({ dir: directory, coverageMap: map });
  for (const reporter of ["json", "json-summary", "lcovonly", "text-summary", "html"]) createReport(reporter).execute(context);
}

function enforceThresholds(map) {
  const summary = map.getCoverageSummary().toJSON();
  const failures = [];
  for (const [metric, minimum] of Object.entries(MERGED_THRESHOLDS)) {
    if (summary[metric].pct < minimum) failures.push(`${metric}: ${summary[metric].pct}% < ${minimum}%`);
  }
  if (failures.length) throw new Error(`merged source coverage is below its 0.0.1 quality floor:\n${failures.join("\n")}`);
  console.log(`Merged coverage quality floor passed: ${Object.entries(MERGED_THRESHOLDS).map(([metric, minimum]) => `${metric}>=${minimum}%`).join(", ")}`);
}

const unit = sourceOnly(readMap(path.join(COVERAGE, "raw-unit", "coverage-final.json")), "unit");
const bundle = sourceOnly(readMap(path.join(COVERAGE, "raw-bundle", "coverage-final.json")), "bundle");
const browser = await browserMap();
const merged = createCoverageMap({});
merged.merge(unit);
merged.merge(bundle);
merged.merge(browser);

emit("unit", unit);
emit("bundle", bundle);
emit("browser", browser);
emit("merged", merged);
enforceInventories({ unit, bundle, browser }, merged);

const inventory = { unit: unit.files().length, bundle: bundle.files().length, browser: browser.files().length, merged: merged.files().length };
fs.writeFileSync(path.join(COVERAGE, "layers.json"), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(`Source-normalized coverage files: ${Object.entries(inventory).map(([name, count]) => `${name}=${count}`).join(", ")}`);
enforceThresholds(merged);
