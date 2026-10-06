// The runtime owners: per-card UI state, the render controller, the console reporter, keyboard
// and interaction delegation, and the browser platform adapter.
// Boundary: controller behaviour against jsdom or stubs, never the assembled card.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

test("ui state keeps the view, an overlay stack, pages, choices and the notice", async () => {
  const { createUIState } = await import("../../../src/controllers/runtime/ui-state.js");
  const ui = createUIState();
  let published = 0;
  ui.subscribe(() => {
    published += 1;
  });
  ui.openOverlay({ kind: "job-editor", draft: { name: "a" } });
  ui.openOverlay({ kind: "confirm" });
  assert.equal(ui.overlay.kind, "confirm");
  ui.closeOverlay();
  assert.equal(ui.overlay.kind, "job-editor", "a dialog gives back the page it sat on");
  ui.updateOverlay({ submitted: true });
  assert.equal(ui.overlay.submitted, true);
  ui.setView("rooms");
  assert.equal(ui.overlay, null, "switching views leaves every page");
  ui.setPage("queue", -5);
  assert.equal(ui.snapshot.pages.queue, 0);
  ui.toggle("x");
  ui.toggle("x");
  assert.deepEqual(ui.snapshot.expanded, []);
  ui.choose("map:r", "image.a");
  assert.equal(ui.snapshot.choices["map:r"], "image.a");
  ui.setNotice({ kind: "success", messageKey: "k" });
  assert.ok(Object.isFrozen(ui.snapshot.notice));
  assert.equal(published, 10);
  assert.ok(Object.isFrozen(ui.snapshot));
});

test("a focus request is data for the next render, not a reason for one", async () => {
  const { createUIState } = await import("../../../src/controllers/runtime/ui-state.js");
  const ui = createUIState();
  let published = 0;
  ui.subscribe(() => {
    published += 1;
  });
  ui.requestFocus("#voc-overlay-title");
  assert.equal(published, 0);
  assert.equal(ui.consumeFocus(), "#voc-overlay-title");
  assert.equal(ui.consumeFocus(), null);
  assert.equal(ui.updateOverlay({ x: 1 }).overlays.length, 0, "no overlay, nothing to merge");
});

test("the render controller skips an unchanged signature and commits only a successful render", async () => {
  const { createRenderController, RENDER_PATH } = await import("../../../src/controllers/render/render-controller.js");
  let fail = true;
  let renders = 0;
  const controller = createRenderController({
    computeViewModel: () => ({ n: renders }),
    renderView: () => {
      if (fail) throw new Error("boom");
      renders += 1;
    },
  });
  assert.throws(() => controller.render({ signature: "a" }), /boom/);
  assert.equal(controller.hasRendered, false);
  fail = false;
  assert.equal(controller.render({ signature: "a" }), RENDER_PATH.RENDER);
  assert.equal(controller.render({ signature: "a" }), RENDER_PATH.SKIP);
  assert.equal(controller.render({ signature: "a", force: true }), RENDER_PATH.RENDER);
  controller.invalidate();
  assert.equal(controller.render({ signature: "a" }), RENDER_PATH.RENDER);
  controller.markFailed();
  assert.equal(controller.lastViewModel, null);
  assert.equal(controller.render({ signature: "a" }), RENDER_PATH.RENDER);
  assert.equal(renders, 4);
});

test("the reporter writes a changed warning set once and each new render failure once", async () => {
  const { createDiagnosticsReporter } = await import("../../../src/controllers/runtime/diagnostics-reporter.js");
  const logs = [];
  const reporter = createDiagnosticsReporter({ platform: { log: (...args) => logs.push(args) }, describe: (entry) => entry.key });
  reporter.reportWarnings([{ key: "one" }]);
  reporter.reportWarnings([{ key: "one" }]);
  reporter.reportWarnings([{ key: "two" }, { key: "three" }]);
  reporter.reportRenderFailure(new Error("x"));
  reporter.reportRenderFailure(new Error("x"));
  reporter.reportRenderSuccess();
  reporter.reportRenderFailure(new Error("x"));
  assert.deepEqual(logs.map(([level]) => level), ["warn", "warn", "warn", "error", "error"]);
  assert.match(logs[0][1], /: one$/);
});

function shadow(html) {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = html;
  return { window, root };
}

test("arrow keys move between tabs and choose them; Escape goes to the overlay owner", async () => {
  const { createKeyboardRuntime } = await import("../../../src/controllers/runtime/keyboard-runtime.js");
  const { window, root } = shadow(`<div role="tablist"><button role="tab" data-view="queue">Q</button><button role="tab" data-view="rooms">R</button></div>`);
  const chosen = [];
  let escapes = 0;
  const keyboard = createKeyboardRuntime({ root, onView: (view) => chosen.push(view), onEscape: () => ++escapes > 0 });
  keyboard.connect();
  const [queue] = root.querySelectorAll("[role=tab]");
  queue.focus();
  queue.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, composed: true }));
  queue.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true, composed: true }));
  queue.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
  assert.deepEqual(chosen, ["rooms", "rooms"]);
  assert.equal(escapes, 1);
  keyboard.disconnect();
  queue.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
  assert.equal(escapes, 1);
});

test("Tab stays inside a dialog", async () => {
  const { createKeyboardRuntime } = await import("../../../src/controllers/runtime/keyboard-runtime.js");
  const { window, root } = shadow(`<section role="dialog"><button id="first">A</button><button disabled>B</button><button id="last">C</button></section>`);
  const keyboard = createKeyboardRuntime({ root });
  keyboard.connect();
  const last = root.querySelector("#last");
  last.focus();
  const forward = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
  last.dispatchEvent(forward);
  assert.equal(root.activeElement.id, "first");
  assert.equal(forward.defaultPrevented, true);
  const backward = new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, composed: true, cancelable: true });
  root.activeElement.dispatchEvent(backward);
  assert.equal(root.activeElement.id, "last");
});

test("choice groups are roving tab stops and the entity search leads into its matches", async () => {
  const { handleControlKeydown } = await import("../../../src/views/controls/keyboard.js");
  const { window, root } = shadow(`<div data-control="choice"><button role="radio" id="a">A</button><button role="radio" id="b" aria-disabled="true">B</button><button role="radio" id="c">C</button></div><div data-control="entities"><input id="q"><button class="voc-entity-match" id="m1"></button><button class="voc-entity-match" id="m2"></button></div>`);
  let clicked = null;
  root.querySelector("#c").addEventListener("click", () => {
    clicked = "c";
  });
  const key = (target, name) => {
    const event = new window.KeyboardEvent("keydown", { key: name, cancelable: true });
    Object.defineProperty(event, "target", { value: target });
    return handleControlKeydown(event);
  };
  root.querySelector("#a").focus();
  assert.equal(key(root.querySelector("#a"), "ArrowRight"), true);
  assert.equal(root.activeElement.id, "c", "a disabled option is skipped");
  assert.equal(clicked, "c", "a single choice selects as it moves");
  assert.equal(key(root.querySelector("#q"), "ArrowDown"), true);
  assert.equal(root.activeElement.id, "m1");
  assert.equal(key(root.querySelector("#m1"), "ArrowUp"), true);
  assert.equal(root.activeElement.id, "q");
  assert.equal(key(root.querySelector("#q"), "Enter"), false);
  assert.equal(handleControlKeydown({}), false);
});

test("clicks become view or action events with parsed arguments; inert controls stay silent", async () => {
  const { createInteractionRuntime } = await import("../../../src/controllers/runtime/interaction-runtime.js");
  const { window, root } = shadow(`<button role="tab" data-view="rooms"><span id="inner">R</span></button><button data-action="move-job" data-args='{"jobId":"a"}' id="go"></button><button data-action="x" data-args="{broken" id="bad"></button><button data-action="y" aria-disabled="true" id="off"></button><input data-field="name" id="field">`);
  const events = [];
  const runtime = createInteractionRuntime({ root, onAction: (event) => events.push([event.type, event.view || event.action || event.field, event.args]) });
  runtime.connect();
  const click = (id) => root.querySelector(id).dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
  click("#inner");
  click("#go");
  click("#bad");
  click("#off");
  root.querySelector("#field").dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(events, [["view", "rooms", undefined], ["action", "move-job", { jobId: "a" }], ["action", "x", {}], ["input", "name", {}]]);
  runtime.disconnect();
  click("#go");
  assert.equal(events.length, 4);
});

test("the platform navigates inside Home Assistant and refuses foreign targets", async () => {
  const { createBrowserPlatform } = await import("../../../src/controllers/runtime/browser-platform.js");
  const { window } = new JSDOM("<!doctype html><body></body>", { url: "http://ha.local/lovelace/0", pretendToBeVisual: true });
  const platform = createBrowserPlatform(() => window.document);
  const heard = [];
  window.addEventListener("location-changed", (event) => heard.push(event.detail));
  assert.equal(platform.navigate("/config/integrations"), true);
  assert.equal(window.location.pathname, "/config/integrations");
  assert.deepEqual(heard, [{ replace: false }]);
  assert.equal(platform.navigate("https://example.org"), false);
  assert.equal(platform.isDocumentHidden(), false);
  let fired = false;
  const handle = platform.setTimeout(() => {
    fired = true;
  }, 0);
  platform.clearTimeout(handle);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(fired, false);
  assert.equal(createBrowserPlatform(() => null).setTimeout(() => {}, 0), null);
  const observed = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(element) { observed.push(element); this.callback([]); }
    disconnect() { observed.length = 0; }
  };
  let sized = 0;
  const stop = platform.observeResize(window.document.body, () => { sized += 1; });
  assert.deepEqual([observed[0], sized], [window.document.body, 1]);
  stop();
  assert.equal(observed.length, 0);
  assert.equal(typeof createBrowserPlatform(() => null).observeResize(null, () => {}), "function", "without an observer there is nothing to stop");
});

test("the tab strip marks the edges with more tabs and reveals the active tab without passing its end", async () => {
  const { stripOverflow, revealOffset } = await import("../../../src/controllers/runtime/tab-strip-runtime.js");
  assert.deepEqual(stripOverflow({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 }), { start: false, end: false });
  assert.deepEqual(stripOverflow({ scrollLeft: 0, clientWidth: 300, scrollWidth: 360 }), { start: false, end: true });
  assert.deepEqual(stripOverflow({ scrollLeft: 60, clientWidth: 300, scrollWidth: 360 }), { start: true, end: false });
  assert.deepEqual(stripOverflow({ scrollLeft: 30, clientWidth: 300, scrollWidth: 360 }), { start: true, end: true });
  const strip = { scrollLeft: 0, clientWidth: 300, scrollWidth: 360 };
  assert.equal(revealOffset({ ...strip, left: 100, right: 150 }), 0, "a visible tab leaves the strip alone");
  assert.equal(revealOffset({ ...strip, left: 316, right: 360 }), 60, "the last tab scrolls to the end, not beyond");
  assert.equal(revealOffset({ ...strip, left: 250, right: 290 }), 18, "a tab under the fade moves clear of it");
  assert.equal(revealOffset({ ...strip, scrollLeft: 60, left: 10, right: 50 }), 0);
});

test("the tab strip runtime marks overflow after a render and on scroll, and observes the card's size", async () => {
  const { createTabStripRuntime } = await import("../../../src/controllers/runtime/tab-strip-runtime.js");
  const dom = new JSDOM('<!doctype html><div id="host"></div>');
  const host = dom.window.document.getElementById("host");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<div class="voc-tabs"><button role="tab" data-view="queue" aria-selected="true"></button></div>';
  const strip = root.querySelector(".voc-tabs");
  const metrics = { scrollLeft: 0, clientWidth: 300, scrollWidth: 420 };
  for (const name of Object.keys(metrics)) Object.defineProperty(strip, name, { get: () => metrics[name], set: (value) => { metrics[name] = value; }, configurable: true });
  let resized = null;
  let observing = 0;
  const runtime = createTabStripRuntime({ root, platform: { observeResize: (element, fn) => { observing += 1; resized = fn; assert.equal(element, host); return () => { observing -= 1; }; } } });
  runtime.connect();
  runtime.sync();
  assert.deepEqual([strip.hasAttribute("data-overflow-start"), strip.hasAttribute("data-overflow-end")], [false, true]);
  metrics.scrollLeft = 120;
  strip.dispatchEvent(new dom.window.Event("scroll"));
  assert.deepEqual([strip.hasAttribute("data-overflow-start"), strip.hasAttribute("data-overflow-end")], [true, false]);
  metrics.scrollWidth = 300;
  metrics.scrollLeft = 0;
  resized();
  assert.deepEqual([strip.hasAttribute("data-overflow-start"), strip.hasAttribute("data-overflow-end")], [false, false]);
  runtime.disconnect();
  assert.equal(observing, 0);
});

test("the tab row drops the action label, then inactive labels, then all labels, measuring from the labelled row each time", async () => {
  const { createTabStripRuntime } = await import("../../../src/controllers/runtime/tab-strip-runtime.js");
  const dom = new JSDOM('<!doctype html><div id="host"></div>');
  const root = dom.window.document.getElementById("host").attachShadow({ mode: "open" });
  root.innerHTML = '<div class="voc-tab-row"><div class="voc-tabs"><button role="tab" data-view="queue" aria-selected="true"></button></div></div>';
  const row = root.querySelector(".voc-tab-row");
  const strip = root.querySelector(".voc-tabs");
  const widths = { labelled: 460, action: 420, labels: 340, icons: 280 };
  let clientWidth = 300;
  Object.defineProperty(strip, "clientWidth", { get: () => clientWidth });
  Object.defineProperty(strip, "scrollWidth", { get: () => Math.max(clientWidth, widths[row.getAttribute("data-compact") || "labelled"]) });
  Object.defineProperty(strip, "scrollLeft", { get: () => 0, set: () => {} });
  const runtime = createTabStripRuntime({ root, platform: { observeResize: () => () => {} } });
  const level = () => row.getAttribute("data-compact");
  for (const [width, expected] of [[300, "icons"], [350, "labels"], [430, "action"], [500, null]]) {
    clientWidth = width;
    runtime.sync();
    assert.equal(level(), expected, `at ${width}`);
  }
  clientWidth = 200;
  runtime.sync();
  assert.deepEqual([level(), strip.hasAttribute("data-overflow-end")], ["icons", true]);
});

test("the tab row is measured again once a web font has loaded, until it disconnects", async () => {
  const { createTabStripRuntime } = await import("../../../src/controllers/runtime/tab-strip-runtime.js");
  const dom = new JSDOM('<!doctype html><div id="host"></div>');
  const fonts = new dom.window.EventTarget();
  Object.defineProperty(dom.window.document, "fonts", { value: fonts });
  const root = dom.window.document.getElementById("host").attachShadow({ mode: "open" });
  root.innerHTML = '<div class="voc-tab-row"><div class="voc-tabs"><button role="tab" data-view="queue" aria-selected="true"></button></div></div>';
  const row = root.querySelector(".voc-tab-row");
  const strip = root.querySelector(".voc-tabs");
  let labelled = 520;
  Object.defineProperty(strip, "clientWidth", { get: () => 480 });
  Object.defineProperty(strip, "scrollWidth", { get: () => (row.hasAttribute("data-compact") ? 480 : labelled) });
  Object.defineProperty(strip, "scrollLeft", { get: () => 0, set: () => {} });
  const runtime = createTabStripRuntime({ root, platform: { observeResize: () => () => {} } });
  runtime.connect();
  runtime.sync();
  assert.equal(row.getAttribute("data-compact"), "action", "the fallback font is wider");
  labelled = 470;
  fonts.dispatchEvent(new dom.window.Event("loadingdone"));
  assert.equal(row.hasAttribute("data-compact"), false, "the loaded font fits");
  runtime.disconnect();
  labelled = 520;
  fonts.dispatchEvent(new dom.window.Event("loadingdone"));
  assert.equal(row.hasAttribute("data-compact"), false);
});
