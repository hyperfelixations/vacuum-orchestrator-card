"use strict";
// What Home Assistant sees on load: one custom element and one picker entry, configured in
// YAML only.
// Boundary: registration only; the element's lifecycle belongs to the component tests.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

test("the bundle registers exactly one element and one picker entry", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "dist", "vacuum-orchestrator-card.js"), "utf8");
  vm.runInContext(source, dom.getInternalVMContext());
  assert.equal(typeof dom.window.customElements.get("vacuum-orchestrator-card"), "function");
  assert.equal(dom.window.customCards.filter((entry) => entry.type === "vacuum-orchestrator-card").length, 1);
  assert.equal(dom.window.customCards[0].preview, true);
  assert.match(dom.window.customCards[0].documentationURL, /github\.com/);
  assert.equal(dom.window.vacuumOrchestratorCardVersion, "0.1.0");
  const Card = dom.window.customElements.get("vacuum-orchestrator-card");
  assert.deepEqual([typeof Card.getConfigForm, typeof Card.getConfigElement], ["undefined", "undefined"]);
  const suggest = dom.window.customCards[0].getEntitySuggestion;
  assert.equal(JSON.stringify(suggest({ states: { "vacuum.rocky": {} } }, "vacuum.rocky")), '{"config":{"type":"custom:vacuum-orchestrator-card"}}');
  assert.equal(suggest(undefined, "vacuum.rocky"), null);
});
