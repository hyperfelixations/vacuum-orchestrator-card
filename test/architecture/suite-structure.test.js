"use strict";
// The rules the test suite itself obeys: where a test lives says what it may touch, every test
// file states what it covers, and no helper or fixture exists without a user.
// See TESTING.md "The layers".

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEST_DIR = path.join(__dirname, "..");
const ROOT = path.join(TEST_DIR, "..");
const LAYERS = ["unit", "component", "contract", "architecture", "characterization", "property", "browser"];
const SHARED = ["fixtures", "helpers", "manifests", "baseline"];
const NODE_DIRECTORIES = new Set([
  "unit/application", "unit/backend", "unit/config", "unit/core", "unit/domain", "unit/i18n",
  "unit/presentation/common", "unit/presentation/shell", "unit/presentation/views", "unit/presentation/overlays",
  "unit/render", "unit/runtime", "unit/views",
  "component/lifecycle", "component/views", "component/shell", "contract", "architecture",
  "characterization", "property",
]);
const BROWSER_DIRECTORIES = ["core", "interaction", "geometry", "accessibility", "visual"];

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
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

function localDependencies(entry, seen = new Set()) {
  const file = fs.existsSync(entry) ? entry : `${entry}.js`;
  if (!fs.existsSync(file) || seen.has(file)) return seen;
  seen.add(file);
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:require|import)\(\s*["'](\.[^"']+)["']\s*\)/g)) {
    localDependencies(path.resolve(path.dirname(file), match[1]), seen);
  }
  return seen;
}

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

test("every test belongs to a registered owner directory", () => {
  const unknown = testFiles.map(rel).filter((name) => {
    const directory = name.split("/").slice(0, -1).join("/");
    return name.endsWith(".spec.js")
      ? !BROWSER_DIRECTORIES.includes(name.split("/")[1])
      : !NODE_DIRECTORIES.has(directory);
  });
  assert.deepEqual(unknown, []);
  for (const directory of NODE_DIRECTORIES) {
    assert.ok(testFiles.some((file) => rel(file).startsWith(`${directory}/`) && rel(file).split("/").slice(0, -1).join("/") === directory), directory);
  }
});

test("every browser owner has a public command and a no-build pipeline command", () => {
  for (const directory of BROWSER_DIRECTORIES) {
    assert.ok(scripts[`test:browser:${directory}`]?.startsWith("npm run build && "), directory);
    assert.match(scripts[`test:browser:${directory}:run`] || "", new RegExp(`test/browser/${directory}\\b`));
  }
  for (const engine of ["firefox-core", "webkit-core"]) {
    assert.ok(scripts["test:browser:cross-engine:run"].includes(`--project=${engine}`));
  }
});

test("every browser spec uses the coverage-aware Playwright fixture", () => {
  const browserSpecs = testFiles.filter((file) => rel(file).startsWith("browser/"));
  const bypasses = browserSpecs.filter((file) => {
    const source = fs.readFileSync(file, "utf8");
    return /require\(\s*["']@playwright\/test["']\s*\)/.test(source) || !source.includes("helpers/playwright.js");
  });
  assert.deepEqual(bypasses.map(rel), []);
});

// Unit tests import sources directly; only component tests and above load the built bundle.
test("unit tests reach source and never reach the bundle through a helper", () => {
  const offenders = [];
  for (const file of testFiles.filter((item) => rel(item).startsWith("unit/"))) {
    const source = fs.readFileSync(file, "utf8");
    if (!/["'][.][.][\/].*src[\/]/.test(source)) offenders.push(`${rel(file)} has no direct source import`);
    const dependencies = [...localDependencies(file)];
    if (dependencies.some((dependency) => /load-card[.]jsdom|mount-card[.]js|[/\\]dist[/\\]/.test(dependency))) offenders.push(`${rel(file)} reaches the bundle`);
  }
  assert.deepEqual(offenders, []);
});

test("component tests load the assembled card", () => {
  const offenders = testFiles.filter((file) => rel(file).startsWith("component/") &&
    ![...localDependencies(file)].some((dependency) => /load-card[.]jsdom[.]js$/.test(dependency)));
  assert.deepEqual(offenders.map(rel), []);
});

test("every test file opens with a header that says what it covers", () => {
  const missing = testFiles.filter((file) => {
    const lines = fs.readFileSync(file, "utf8").split("\n").slice(0, 6);
    return lines.filter((line) => line.startsWith("//")).length < 1;
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
