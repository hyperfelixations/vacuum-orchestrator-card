"use strict";
// The source layout as data: every file under src/, the layer it belongs to, and the imports it
// makes. The architecture tests assert over this; see internal dev doc §2 "Schichten- und
// Importvertrag".

const fs = require("node:fs");
const path = require("node:path");

const SRC_DIR = path.resolve(__dirname, "..", "..", "src");

// Ordered: the first matching prefix wins. `group` is what sibling separation compares.
const LAYERS = Object.freeze([
  { prefix: "core/", name: "core", layer: 0 },
  { prefix: "config/", name: "config", layer: 1 },
  { prefix: "i18n/", name: "i18n", layer: 1 },
  { prefix: "domain/", name: "domain", layer: 1 },
  { prefix: "backend/", name: "backend", layer: 2 },
  { prefix: "application/", name: "application", layer: 3 },
  { prefix: "presentation/shell/", name: "presentation/shell", layer: 4 },
  { prefix: "presentation/sections/", name: "presentation/sections", layer: 4 },
  { prefix: "render/primitives/", name: "render/primitives", layer: 5 },
  { prefix: "render/composition/", name: "render/composition", layer: 5 },
  { prefix: "styles/", name: "styles", layer: 5 },
  { prefix: "sections/", name: "sections", layer: 6 },
  { prefix: "controllers/render/", name: "controllers/render", layer: 7 },
  { prefix: "controllers/runtime/", name: "controllers/runtime", layer: 7 },
  { prefix: "element/", name: "element", layer: 8 },
]);
const COMPOSITION_ROOT = Object.freeze({ name: "index", layer: 9 });

// Same-layer imports that are part of the design. Everything else on one layer is a sibling
// import and forbidden.
const ALLOWED_SIBLING_IMPORTS = Object.freeze([["render/composition", "render/primitives"]]);

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
]);
const FORBIDDEN_CALLS = Object.freeze([/\bDate\.now\s*\(/, /\bMath\.random\s*\(/, /\bnew Date\s*\(\s*\)/]);

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

// Code only: comments and the text of strings and templates cannot reference a global.
function codeOf(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

function importsOf(file) {
  return [...readSource(file).matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)].map((match) => match[1]);
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
  codeOf,
  importsOf,
  resolveImport,
};
