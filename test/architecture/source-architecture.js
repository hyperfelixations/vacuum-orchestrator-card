"use strict";
// The source layout as data: every file under src/, the layer it belongs to, and what its parsed
// code imports, references and declares. The architecture tests assert over this; see internal
// dev doc §3 "Schichten und Importvertrag".

const fs = require("node:fs");
const path = require("node:path");
const { parseAst } = require("rollup/parseAst");

const SRC_DIR = path.resolve(__dirname, "..", "..", "src");

// Ordered: the first matching prefix wins. `group` is what sibling separation compares.
const LAYERS = Object.freeze([
  { prefix: "core/", name: "core", layer: 0 },
  { prefix: "config/", name: "config", layer: 1 },
  { prefix: "i18n/", name: "i18n", layer: 1 },
  { prefix: "domain/", name: "domain", layer: 1 },
  { prefix: "backend/", name: "backend", layer: 2 },
  { prefix: "application/", name: "application", layer: 3 },
  { prefix: "presentation/common/", name: "presentation/common", layer: 4 },
  { prefix: "presentation/shell/", name: "presentation/shell", layer: 4 },
  { prefix: "presentation/views/", name: "presentation/views", layer: 4 },
  { prefix: "presentation/overlays/", name: "presentation/overlays", layer: 4 },
  { prefix: "render/primitives/", name: "render/primitives", layer: 5 },
  { prefix: "render/composition/", name: "render/composition", layer: 5 },
  { prefix: "styles/", name: "styles", layer: 5 },
  { prefix: "views/", name: "views", layer: 6 },
  { prefix: "controllers/render/", name: "controllers/render", layer: 7 },
  { prefix: "controllers/runtime/", name: "controllers/runtime", layer: 7 },
  { prefix: "element/", name: "element", layer: 8 },
]);
const COMPOSITION_ROOT = Object.freeze({ name: "index", layer: 9 });

// Same-layer imports that are part of the design. Everything else on one layer is a sibling
// import and forbidden.
const ALLOWED_SIBLING_IMPORTS = Object.freeze([
  ["render/composition", "render/primitives"],
  ["presentation/shell", "presentation/common"],
  ["presentation/views", "presentation/common"],
  ["presentation/overlays", "presentation/common"],
  ["presentation/overlays", "presentation/views"],
]);

// Imports forbidden even though they point downwards.
const FORBIDDEN_IMPORTS = Object.freeze([
  ["backend", "config", "the backend reports codes, never configuration"],
  ["backend", "i18n", "the backend reports codes, never text"],
  ["application", "i18n", "the domain model carries codes; wording is presentation"],
]);

// Ambient browser and clock access. Allowed only in the platform adapter and the composition
// root; everything else receives time, timers and the document as arguments.
const FORBIDDEN_GLOBALS = Object.freeze([
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "ResizeObserver",
  "MutationObserver",
  "matchMedia",
  "customElements",
  "requestIdleCallback",
  "cancelAnimationFrame",
  "IntersectionObserver",
  "performance",
  "globalThis",
  "self",
]);
const FORBIDDEN_CALLS = Object.freeze(["Date.now()", "Math.random()", "new Date()"]);

// Files allowed to touch the ambient environment, and why.
const AMBIENT_ALLOWED = Object.freeze({
  "controllers/runtime/browser-platform.js": "the single runtime adapter",
  "index.js": "registration against the global element registry",
  "i18n/integrity.js": "the load-time translation parity warning",
});

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const files = walk(SRC_DIR).sort();
const relative = (file) => path.relative(SRC_DIR, file).split(path.sep).join("/");

function classify(file) {
  const rel = relative(file);
  if (rel === "index.js") return COMPOSITION_ROOT;
  return LAYERS.find((entry) => rel.startsWith(entry.prefix)) || { name: "unknown", layer: -1 };
}

function readSource(file) {
  return fs.readFileSync(file, "utf8");
}

const POSITION_KEYS = new Set(["type", "start", "end", "loc", "range"]);

// Every node below `node`, with the node that holds it and the key it is held under.
function visitTree(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent, key);
  for (const [name, value] of Object.entries(node)) {
    if (POSITION_KEYS.has(name) || !value || typeof value !== "object") continue;
    if (Array.isArray(value)) value.forEach((child) => visitTree(child, visit, node, name));
    else visitTree(value, visit, node, name);
  }
}

// The identifiers a declaration pattern binds.
function patternNames(pattern, found = []) {
  if (!pattern) return found;
  if (pattern.type === "Identifier") found.push(pattern);
  else if (pattern.type === "ObjectPattern") pattern.properties.forEach((property) => patternNames(property.type === "RestElement" ? property.argument : property.value, found));
  else if (pattern.type === "ArrayPattern") pattern.elements.forEach((element) => patternNames(element, found));
  else if (pattern.type === "AssignmentPattern") patternNames(pattern.left, found);
  else if (pattern.type === "RestElement") patternNames(pattern.argument, found);
  return found;
}

function bindingsOf(node) {
  switch (node.type) {
    case "VariableDeclarator":
      return patternNames(node.id);
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      return [...(node.id ? [node.id] : []), ...node.params.flatMap((param) => patternNames(param))];
    case "ClassDeclaration":
    case "ClassExpression":
      return node.id ? [node.id] : [];
    case "CatchClause":
      return patternNames(node.param);
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      return [node.local];
    default:
      return [];
  }
}

// An identifier that names a property, a key, a label or the outside name of a module binding
// refers to nothing in scope. A shorthand property `{ window }` reads the binding.
function namesNoBinding(parent, key) {
  if (!parent) return false;
  if (parent.type === "MemberExpression") return key === "property" && !parent.computed;
  if (parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") return key === "key" && !parent.computed && !parent.shorthand;
  if (parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") return key === "label";
  if (parent.type === "ImportSpecifier") return key === "imported";
  if (parent.type === "ExportSpecifier") return key === "exported";
  return parent.type === "MetaProperty";
}

const literal = (node) => (node?.type === "Literal" && typeof node.value === "string" ? node.value : null);
const named = (node, name) => node?.type === "Identifier" && node.name === name;

// What one module's code does, from its syntax tree: the modules it imports (static, re-export,
// side-effect and dynamic; a computed dynamic import has no specifier), the names it references
// and declares, every identifier and property name it spells, and the FORBIDDEN_CALLS it makes.
// Template expressions are code like any other; comments and string text are not.
function analyzeSource(source) {
  const imports = [];
  const references = new Set();
  const declarations = new Set();
  const names = new Set();
  const calls = new Set();
  const bound = new Set();
  visitTree(parseAst(source), (node, parent, key) => {
    for (const identifier of bindingsOf(node)) {
      bound.add(identifier);
      declarations.add(identifier.name);
    }
    if (node.type === "ImportDeclaration") imports.push({ kind: node.specifiers.length ? "static" : "side-effect", specifier: literal(node.source) });
    else if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) imports.push({ kind: "re-export", specifier: literal(node.source) });
    else if (node.type === "ImportExpression") imports.push({ kind: "dynamic", specifier: literal(node.source) });
    else if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed) {
      if (named(node.callee.object, "Date") && named(node.callee.property, "now")) calls.add("Date.now()");
      if (named(node.callee.object, "Math") && named(node.callee.property, "random")) calls.add("Math.random()");
    } else if (node.type === "NewExpression" && named(node.callee, "Date") && node.arguments.length === 0) calls.add("new Date()");
    else if (node.type === "Identifier") {
      names.add(node.name);
      if (!bound.has(node) && !namesNoBinding(parent, key)) references.add(node.name);
    }
  });
  return { imports, references, declarations, names, calls };
}

// Each source is parsed once per test process.
const analyses = new Map();
function analyze(file) {
  if (!analyses.has(file)) analyses.set(file, analyzeSource(readSource(file)));
  return analyses.get(file);
}

// A computed dynamic import names no module and fails the resolution check.
function importsOf(file) {
  return analyze(file).imports.map((entry) => entry.specifier ?? "<computed dynamic import>");
}

function resolveImport(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const candidate = path.resolve(path.dirname(file), specifier);
  return fs.existsSync(candidate) ? candidate : null;
}

module.exports = {
  SRC_DIR,
  LAYERS,
  ALLOWED_SIBLING_IMPORTS,
  FORBIDDEN_IMPORTS,
  FORBIDDEN_GLOBALS,
  FORBIDDEN_CALLS,
  AMBIENT_ALLOWED,
  files,
  relative,
  classify,
  readSource,
  visitTree,
  analyzeSource,
  analyze,
  importsOf,
  resolveImport,
};
