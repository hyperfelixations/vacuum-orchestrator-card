"use strict";
// The rendering base: escaped parsing, keyed patching and the foreign-node-safe mount.
// Boundary: primitives in isolation; composed markup is a section or component test.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

test("render context parses escaped nodes in the supplied document", async () => {
  const { createRenderContext } = await import("../../../src/render/primitives/render-context.js");
  const dom = new JSDOM("<!doctype html><body></body>");
  const context = createRenderContext(dom.window.document, { texts: { t: (key) => key } });
  const nodes = context.htmlToNodes("<span>safe</span>");
  assert.equal(nodes[0].textContent, "safe");
  assert.equal(context.ownerDocument, dom.window.document);
});

test("keyed patch reuses existing keyed nodes", async () => {
  const { keyedPatch } = await import("../../../src/render/primitives/dom.js");
  const dom = new JSDOM("<!doctype html><body><div id='root'><div data-key='a'></div></div></body>");
  const parent = dom.window.document.querySelector("#root");
  const existing = parent.firstElementChild;
  keyedPatch(parent, [{ key: "a" }, { key: "b" }], { key: "key", render: (item) => { const node = dom.window.document.createElement("div"); node.dataset.key = item.key; return node; } });
  assert.equal(parent.firstElementChild, existing);
  assert.equal(parent.children.length, 2);
});

test("shadow mount preserves foreign nodes", async () => {
  const { createShadowMount } = await import("../../../src/render/composition/shadow-mount.js");
  const { createRenderContext } = await import("../../../src/render/primitives/render-context.js");
  const dom = new JSDOM("<!doctype html><body></body>");
  const root = dom.window.document.createElement("div");
  const mount = createShadowMount(root);
  const context = createRenderContext(dom.window.document);
  mount.mount(context, { css: "a{}", bodyHtml: "<div>one</div>" });
  const foreign = dom.window.document.createElement("card-mod");
  root.appendChild(foreign);
  mount.mount(context, { css: "b{}", bodyHtml: "<div>two</div>" });
  assert.equal(root.querySelector("card-mod"), foreign);
  assert.equal(root.querySelector("ha-card div").textContent, "two");
});
