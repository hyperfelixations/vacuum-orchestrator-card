"use strict";
// The promise card-mod relies on: nodes the card did not create are never touched.
// Boundary: the mount contract only; styling decisions live in the style slices.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

test("shadow mount keeps foreign card-mod nodes outside owned nodes", async () => {
  const { createShadowMount } = await import("../../src/render/composition/shadow-mount.js");
  const { createRenderContext } = await import("../../src/render/primitives/render-context.js");
  const dom = new JSDOM("<!doctype html><body></body>");
  const root = dom.window.document.createElement("div");
  const mount = createShadowMount(root);
  mount.mount(createRenderContext(dom.window.document), { css: "a{}", bodyHtml: "<div>one</div>" });
  const cardMod = dom.window.document.createElement("card-mod");
  root.appendChild(cardMod);
  mount.mount(createRenderContext(dom.window.document), { css: "b{}", bodyHtml: "<div>two</div>" });
  assert.ok(mount.foreignNodes().includes(cardMod));
  assert.equal(root.querySelector("ha-card").textContent.trim(), "two");
});
