"use strict";
// The rules the test suite itself obeys: where a test lives says what it may touch, every test
// file states what it covers, and no helper or fixture exists without a user.
// See TESTING.md "The layers".

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEST_DIR = path.join(__dirname, "..");
const LAYERS = ["unit", "component", "contract", "architecture", "characterization", "property", "browser"];
const SHARED = ["fixtures", "helpers", "manifests", "baseline"];

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const all = walk(TEST_DIR);
const rel = (file) => path.relative(TEST_DIR, file).split(path.sep).join("/");
const testFiles = all.filter((file) => /\.(test|spec)\.js$/.test(file));
const sources = all.filter((file) => file.endsWith(".js"));

test("the test root holds only the declared layers and shared directories", () => {
  const top = fs.readdirSync(TEST_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(top.filter((name) => !LAYERS.includes(name) && !SHARED.includes(name)), []);
});

test("node tests end in .test.js and browser specs in .spec.js, each in its own layer", () => {
  const misplaced = testFiles.filter((file) => {
    const name = rel(file);
    return name.endsWith(".spec.js") ? !name.startsWith("browser/") : name.startsWith("browser/");
  });
  assert.deepEqual(misplaced.map(rel), []);
});

// Unit tests import sources directly; only component tests and above load the built bundle.
test("unit tests never load the bundle", () => {
  const offenders = testFiles.filter((file) => rel(file).startsWith("unit/") && /dist\/|load-card|mount-card/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(offenders.map(rel), []);
});

test("every test file opens with a header that says what it covers", () => {
  const missing = testFiles.filter((file) => {
    const lines = fs.readFileSync(file, "utf8").split("\n").slice(0, 6);
    return lines.filter((line) => line.startsWith("//")).length < 2;
  });
  assert.deepEqual(missing.map(rel), []);
});

test("every helper and fixture module is used", () => {
  const shared = sources.filter((file) => /^(helpers|fixtures)\//.test(rel(file)));
  const unused = shared.filter((file) => {
    const base = path.basename(file);
    // The harness page pulls its stubs in with a script tag, so HTML counts as a user.
    return !all.some((other) => other !== file && /\.(js|mjs|cjs|html)$/.test(other) && fs.readFileSync(other, "utf8").includes(base));
  });
  const config = fs.readFileSync(path.join(TEST_DIR, "..", "playwright.config.js"), "utf8");
  assert.deepEqual(unused.filter((file) => !config.includes(path.basename(file))).map(rel), []);
});
