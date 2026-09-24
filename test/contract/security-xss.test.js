"use strict";
// Every variable text reaches the DOM escaped, whatever the backend or the user put in it.
// Boundary: the markup boundary itself, not the individual sections that call it.

const test = require("node:test");
const assert = require("node:assert/strict");
test("the markup boundary escapes every HTML-significant character", async () => {
  const { escapeHtml } = await import("../../src/core/text.js");
  assert.equal(escapeHtml(`<img src=x onerror="bad">`), "&lt;img src=x onerror=&quot;bad&quot;&gt;");
});
