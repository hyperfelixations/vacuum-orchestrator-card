// The render path's own pieces (UI-35, UI-31): the platform runs work after the next paint and
// when the browser is idle, the morph keeps a body marked to be kept, and the shadow mount does
// not parse markup it already shows. Boundary: each piece against jsdom or a stand-in window.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

// A window whose frames and timers run only when the test says so.
function standInWindow({ idle = true } = {}) {
  const frames = [];
  const timers = [];
  const callbacks = [];
  const view = {
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: (id) => (frames[id - 1] = null),
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    clearTimeout: (id) => (timers[id - 1] = null),
  };
  if (idle) {
    view.requestIdleCallback = (fn) => callbacks.push(fn);
    view.cancelIdleCallback = (id) => (callbacks[id - 1] = null);
  }
  const frame = () => frames.splice(0).forEach((fn) => fn?.());
  const run = (ms) => timers.filter((timer) => timer && timer.ms === ms).forEach((timer) => ((timers[timers.indexOf(timer)] = null), timer.fn()));
  return { document: { defaultView: view }, frame, run, callbacks, timers };
}

test("work after the paint runs once: after the next frame, else after its limit", async () => {
  const { createBrowserPlatform, AFTER_PAINT_LIMIT_MS } = await import("../../../src/controllers/runtime/browser-platform.js");
  const browser = standInWindow();
  const platform = createBrowserPlatform(() => browser.document);
  const ran = [];
  platform.afterPaint(() => ran.push("painted"));
  browser.frame();
  assert.deepEqual(ran, [], "the frame is not painted yet while its callbacks run");
  browser.run(0);
  browser.run(AFTER_PAINT_LIMIT_MS);
  assert.deepEqual(ran, ["painted"], "once");
  platform.afterPaint(() => ran.push("hidden page"));
  browser.run(AFTER_PAINT_LIMIT_MS);
  assert.deepEqual(ran, ["painted", "hidden page"], "frames rest on a hidden page");
  platform.afterPaint(() => ran.push("cancelled")).cancel();
  browser.frame();
  browser.run(0);
  browser.run(AFTER_PAINT_LIMIT_MS);
  assert.equal(ran.length, 2);
  assert.equal(createBrowserPlatform(() => null).afterPaint(() => {}), null);
});

test("idle work waits for the browser, or for its fallback where there is no idle callback", async () => {
  const { createBrowserPlatform, IDLE_FALLBACK_MS } = await import("../../../src/controllers/runtime/browser-platform.js");
  const browser = standInWindow();
  const ran = [];
  createBrowserPlatform(() => browser.document).whenIdle(() => ran.push("idle"));
  browser.callbacks.forEach((fn) => fn?.());
  assert.deepEqual(ran, ["idle"]);
  const safari = standInWindow({ idle: false });
  createBrowserPlatform(() => safari.document).whenIdle(() => ran.push("fallback"));
  safari.run(IDLE_FALLBACK_MS);
  assert.deepEqual(ran, ["idle", "fallback"]);
  createBrowserPlatform(() => safari.document).whenIdle(() => ran.push("cancelled")).cancel();
  safari.run(IDLE_FALLBACK_MS);
  assert.equal(ran.length, 2);
});

test("a node marked to be kept takes the new attributes and keeps its children", async () => {
  const { morphElement } = await import("../../../src/render/primitives/morph.js");
  const { document } = new JSDOM("<!doctype html>").window;
  const host = document.createElement("div");
  host.innerHTML = `<div class="voc-root"><div class="voc-body" data-body="view:rooms"><p>rooms</p></div></div>`;
  const shown = host.querySelector("p");
  const next = document.createElement("div");
  next.innerHTML = `<div class="voc-root"><div class="voc-body" data-body="view:rooms" data-morph="keep" data-stale="" aria-busy="true"></div></div>`;
  morphElement(host.firstChild, next.firstChild);
  const body = host.querySelector(".voc-body");
  assert.deepEqual([body.firstChild, body.getAttribute("aria-busy"), body.hasAttribute("data-stale")], [shown, "true", true]);
  next.innerHTML = `<div class="voc-root"><div class="voc-body" data-body="view:queue"><ol></ol></div></div>`;
  morphElement(host.firstChild, next.firstChild);
  assert.deepEqual([body.querySelector("p"), body.hasAttribute("data-stale"), body.hasAttribute("aria-busy"), body.dataset.body], [null, false, false, "view:queue"]);
});

test("the shadow mount does not parse markup it already shows", async () => {
  const { createShadowMount } = await import("../../../src/render/composition/shadow-mount.js");
  const { createRenderContext } = await import("../../../src/render/primitives/render-context.js");
  const { document } = new JSDOM("<!doctype html>").window;
  const root = document.createElement("div");
  const mount = createShadowMount(root);
  const context = createRenderContext(document);
  let parsed = 0;
  const counting = { ...context, fragment: (html) => ((parsed += 1), context.fragment(html)) };
  const html = `<div class="voc-root"><p>one</p></div>`;
  assert.deepEqual([mount.mount(counting, { css: "a{}", html }), parsed], [{ changed: true }, 1]);
  assert.deepEqual([mount.mount(counting, { css: "a{}", html }), parsed], [{ changed: false }, 1]);
  assert.deepEqual([mount.mount(counting, { css: "b{}", html }), parsed], [{ changed: true }, 2], "a new stylesheet is a change");
  mount.showText("broken");
  assert.deepEqual([mount.mount(counting, { css: "b{}", html }), parsed], [{ changed: true }, 3], "after the fallback text the card is built again");
});
