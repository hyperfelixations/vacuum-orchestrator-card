"use strict";
// The layer and import contract of src/: no upward imports, no sibling imports outside the
// declared pairs, no cycles, no unresolved specifiers, no ambient browser or clock access in
// product layers, and `hass` confined to the backend and the element.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ALLOWED_SIBLING_IMPORTS,
  AMBIENT_ALLOWED,
  FORBIDDEN_CALLS,
  FORBIDDEN_GLOBALS,
  FORBIDDEN_IMPORTS,
  classify,
  codeOf,
  files,
  importsOf,
  readSource,
  relative,
  resolveImport,
} = require("./source-architecture.js");

function edges() {
  return files.flatMap((file) =>
    importsOf(file).map((specifier) => ({ file, specifier, target: resolveImport(file, specifier) }))
  );
}

test("every source file belongs to a declared layer", () => {
  assert.deepEqual(files.filter((file) => classify(file).name === "unknown").map(relative), []);
});

test("every import is relative and resolves to a file", () => {
  const unresolved = edges().filter((edge) => !edge.target).map((edge) => `${relative(edge.file)} -> ${edge.specifier}`);
  assert.deepEqual(unresolved, []);
});

test("no layer imports upwards", () => {
  const upward = edges()
    .filter((edge) => edge.target && classify(edge.target).layer > classify(edge.file).layer)
    .map((edge) => `${relative(edge.file)} -> ${relative(edge.target)}`);
  assert.deepEqual(upward, []);
});

test("sibling groups on one layer stay separate", () => {
  const allowed = new Set(ALLOWED_SIBLING_IMPORTS.map(([from, to]) => `${from}>${to}`));
  const siblings = edges()
    .filter((edge) => edge.target)
    .filter((edge) => {
      const from = classify(edge.file);
      const to = classify(edge.target);
      return from.layer === to.layer && from.name !== to.name && !allowed.has(`${from.name}>${to.name}`);
    })
    .map((edge) => `${relative(edge.file)} -> ${relative(edge.target)}`);
  assert.deepEqual(siblings, []);
});

test("explicitly forbidden downward imports do not occur", () => {
  const offenders = [];
  for (const edge of edges().filter((item) => item.target)) {
    for (const [from, to, reason] of FORBIDDEN_IMPORTS) {
      if (classify(edge.file).name === from && classify(edge.target).name === to) {
        offenders.push(`${relative(edge.file)} -> ${relative(edge.target)} (${reason})`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the import graph has no cycle", () => {
  const graph = new Map(files.map((file) => [file, edges().filter((edge) => edge.file === file && edge.target).map((edge) => edge.target)]));
  const state = new Map();
  const cycles = [];
  const visit = (file, trail) => {
    if (state.get(file) === "done") return;
    if (state.get(file) === "open") {
      cycles.push([...trail.slice(trail.indexOf(file)), file].map(relative).join(" -> "));
      return;
    }
    state.set(file, "open");
    for (const next of graph.get(file) || []) visit(next, [...trail, file]);
    state.set(file, "done");
  };
  for (const file of files) visit(file, []);
  assert.deepEqual(cycles, []);
});

test("product layers reach no ambient browser global or clock", () => {
  const offenders = [];
  for (const file of files) {
    if (AMBIENT_ALLOWED[relative(file)]) continue;
    const code = codeOf(readSource(file));
    for (const name of FORBIDDEN_GLOBALS) {
      if (new RegExp(`(?<![\\w$.])${name}\\b`).test(code)) offenders.push(`${relative(file)}: ${name}`);
    }
    for (const pattern of FORBIDDEN_CALLS) if (pattern.test(code)) offenders.push(`${relative(file)}: ${pattern}`);
  }
  assert.deepEqual(offenders, []);
});

// Home Assistant replaces the hass object constantly; only the two owners may hold it.
test("hass is referenced only by the backend and the element", () => {
  const offenders = files
    .filter((file) => !["backend", "element"].includes(classify(file).name))
    .filter((file) => /\bhass\b/.test(codeOf(readSource(file))))
    .map(relative);
  assert.deepEqual(offenders, []);
});

test("only the diagnostics reporter and the translation check write to the console", () => {
  const allowed = new Set(["controllers/runtime/browser-platform.js", "i18n/integrity.js"]);
  const offenders = files.filter((file) => !allowed.has(relative(file)) && /\bconsole\./.test(codeOf(readSource(file)))).map(relative);
  assert.deepEqual(offenders, []);
});
