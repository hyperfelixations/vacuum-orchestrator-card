"use strict";
// The layer and import contract of src/: no upward imports, no sibling imports outside the
// declared pairs, no cycles, no unresolved specifiers, no ambient browser or clock access in
// product layers, and `hass` confined to the backend and the element. The guard reads parsed
// code (ARC-10) and proves on synthetic sources that it rejects what it forbids.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ALLOWED_SIBLING_IMPORTS,
  AMBIENT_ALLOWED,
  FORBIDDEN_CALLS,
  FORBIDDEN_GLOBALS,
  FORBIDDEN_IMPORTS,
  analyze,
  analyzeSource,
  classify,
  files,
  importsOf,
  relative,
  resolveImport,
} = require("./source-architecture.js");

// The import graph, built once for every test of this file.
const EDGES = Object.freeze(files.flatMap((file) => importsOf(file).map((specifier) => ({ file, specifier, target: resolveImport(file, specifier) }))));
const edges = () => EDGES;

// The ambient names a source spells as a reference or as a binding of its own.
const ambientIn = ({ references, declarations }) => FORBIDDEN_GLOBALS.filter((name) => references.has(name) || declarations.has(name));

test("the guard sees code inside template expressions", () => {
  const seen = analyzeSource("const text = `Result: ${fetch(\"/synthetic\")} and ${console.log(hass)}`;");
  assert.deepEqual(ambientIn(seen), ["fetch"]);
  assert.ok(seen.references.has("console"));
  assert.ok(seen.names.has("hass"));
});

test("the guard sees every kind of import", () => {
  const seen = analyzeSource('import "./side.js"; import { a } from "./a.js"; export * from "./b.js"; export { c } from "./c.js"; import("./d.js"); import(name);');
  assert.deepEqual(seen.imports, [
    { kind: "side-effect", specifier: "./side.js" },
    { kind: "static", specifier: "./a.js" },
    { kind: "re-export", specifier: "./b.js" },
    { kind: "re-export", specifier: "./c.js" },
    { kind: "dynamic", specifier: "./d.js" },
    { kind: "dynamic", specifier: null },
  ]);
});

test("the guard tells references from property names, labels and module names", () => {
  const harmless = analyzeSource('const o = { window: 1, document() {} }; o.window; label: for (;;) { break label; } export { o as fetch };');
  assert.deepEqual(ambientIn(harmless), []);
  const shorthand = analyzeSource("const o = { window };");
  assert.deepEqual(ambientIn(shorthand), ["window"]);
  assert.deepEqual(ambientIn(analyzeSource("typeof document;")), ["document"]);
  assert.deepEqual(ambientIn(analyzeSource("function f({ self }) { return self; }")), ["self"], "a binding named like a global hides the global and counts itself");
});

test("the guard finds the forbidden clock and chance calls", () => {
  const seen = analyzeSource("Date.now(); Math.random(); new Date(); new Date(0); Date.parse(x);");
  assert.deepEqual([...seen.calls].sort(), [...FORBIDDEN_CALLS].sort());
});

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
  const graph = new Map(files.map((file) => [file, []]));
  for (const edge of edges()) if (edge.target) graph.get(edge.file).push(edge.target);
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
    const seen = analyze(file);
    for (const name of ambientIn(seen)) offenders.push(`${relative(file)}: ${name}`);
    for (const call of seen.calls) offenders.push(`${relative(file)}: ${call}`);
  }
  assert.deepEqual(offenders, []);
});

// Home Assistant replaces the hass object constantly; only the two owners may hold it.
test("hass is referenced only by the backend and the element", () => {
  const offenders = files
    .filter((file) => !["backend", "element"].includes(classify(file).name))
    .filter((file) => analyze(file).names.has("hass"))
    .map(relative);
  assert.deepEqual(offenders, []);
});

test("only the diagnostics reporter and the translation check write to the console", () => {
  const allowed = new Set(["controllers/runtime/browser-platform.js", "i18n/integrity.js"]);
  const offenders = files.filter((file) => !allowed.has(relative(file)) && analyze(file).references.has("console")).map(relative);
  assert.deepEqual(offenders, []);
});
