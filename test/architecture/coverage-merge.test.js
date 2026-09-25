"use strict";

// Synthetic Istanbul maps verify layer inventory, bundle execution and coverage floors.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createCoverageMap } = require("istanbul-lib-coverage");

const ROOT = path.join(__dirname, "..", "..");
const SENTINELS = ["src/index.js", "src/element/vacuum-orchestrator-card.js"];
let merge;
test.before(async () => {
  merge = await import("../../scripts/merge-coverage.mjs");
});

function fileCoverage(relative, { statements = 2, executed = statements, calls = executed ? 1 : 0, functions = 1 } = {}) {
  const file = path.join(ROOT, ...relative.split("/"));
  const statementMap = {};
  const s = {};
  for (let index = 0; index < statements; index++) {
    statementMap[index] = { start: { line: index + 1, column: 0 }, end: { line: index + 1, column: 1 } };
    s[index] = index < executed ? 1 : 0;
  }
  const fnMap = {};
  const f = {};
  for (let index = 0; index < functions; index++) {
    const loc = { start: { line: 1, column: index }, end: { line: 1, column: index + 1 } };
    fnMap[index] = { name: `fn${index}`, decl: loc, loc, line: 1 };
    f[index] = calls;
  }
  return { path: file, statementMap, s, fnMap, f, branchMap: {}, b: {} };
}

function mapOf(entries) {
  const map = createCoverageMap({});
  for (const entry of entries) map.addFileCoverage(entry);
  return map;
}

const executedBundle = () => mapOf(SENTINELS.map((file) => fileCoverage(file)));

test("bundle execution guards cover each bundle-loading layer", () => {
  assert.deepEqual([...merge.BUNDLE_SENTINELS], SENTINELS);
  assert.deepEqual([...merge.BUNDLE_LAYERS], ["bundle", "surface", "browser"]);
  assert.doesNotThrow(() => merge.enforceExecution({ unit: mapOf([]), bundle: executedBundle(), surface: executedBundle(), browser: executedBundle() }));
});

test("missing bundle execution fails with the layer and module", () => {
  const blind = mapOf([fileCoverage(SENTINELS[0], { executed: 0 }), fileCoverage(SENTINELS[1])]);
  assert.throws(() => merge.enforceExecution({ bundle: blind, surface: executedBundle(), browser: executedBundle() }), /bundle coverage never executed the bundle: src\/index\.js/);
  const absent = mapOf([fileCoverage(SENTINELS[0])]);
  assert.throws(() => merge.enforceExecution({ bundle: executedBundle(), surface: absent, browser: executedBundle() }), /surface coverage never executed the bundle: src\/element\/vacuum-orchestrator-card\.js/);
});

test("statement hits without a card function call do not count as execution", () => {
  const noFunctions = mapOf([fileCoverage(SENTINELS[0]), fileCoverage(SENTINELS[1], { functions: 0 })]);
  assert.throws(() => merge.enforceExecution({ bundle: noFunctions, surface: executedBundle(), browser: executedBundle() }), /bundle coverage called no function/);
  const uncalled = mapOf([fileCoverage(SENTINELS[0]), fileCoverage(SENTINELS[1], { calls: 0 })]);
  assert.throws(() => merge.enforceExecution({ bundle: executedBundle(), surface: uncalled, browser: executedBundle() }), /surface coverage called no function/);
});

test("every layer and the merge must include the complete source inventory", () => {
  const inventory = ["src/a.js", "src/b.js"];
  const full = () => mapOf(inventory.map((file) => fileCoverage(file)));
  const layers = { unit: full(), bundle: full(), surface: full(), browser: full() };
  assert.doesNotThrow(() => merge.enforceInventories(layers, full(), inventory));
  assert.throws(() => merge.enforceInventories({ ...layers, surface: mapOf([fileCoverage("src/a.js")]) }, full(), inventory), /surface coverage does not cover the src\/ inventory[\s\S]*missing from surface:\s*src\/b\.js/);
});

test("coverage thresholds reject missing percentages metric by metric", () => {
  assert.ok(Object.isFrozen(merge.MERGED_THRESHOLDS));
  for (const metric of ["statements", "branches", "functions", "lines"]) {
    assert.ok(Number.isInteger(merge.MERGED_THRESHOLDS[metric]) && merge.MERGED_THRESHOLDS[metric] >= 70);
  }
  const half = mapOf([fileCoverage("src/a.js", { statements: 4, executed: 2 })]);
  assert.throws(() => merge.enforceThresholds(half, { statements: 60 }), /statements: 50% < 60%/);
  assert.doesNotThrow(() => merge.enforceThresholds(half, { statements: 50 }));
});
