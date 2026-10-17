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
  ui.updateOverlay({ errors: { passes: "out_of_range" } });
  assert.deepEqual(ui.overlay.errors, { passes: "out_of_range" });
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

// One menu is open at a time; opening a page or another view closes it.
test("ui state holds one open menu, closed by a page or another view", async () => {
  const { createUIState } = await import("../../../src/controllers/runtime/ui-state.js");
  const ui = createUIState();
  let published = 0;
  ui.subscribe(() => {
    published += 1;
  });
  assert.equal(ui.snapshot.menu, null);
  ui.setMenu("job:a");
  ui.setMenu("job:a");
  assert.equal(published, 1, "the same menu again changes nothing");
  ui.openOverlay({ kind: "job-detail", jobId: "a" });
  assert.equal(ui.snapshot.menu, null, "a page closes the menu");
  ui.setMenu("job:b");
  ui.setView("rooms");
  assert.equal(ui.snapshot.menu, null, "another view closes it too");
  ui.setMenu("job:c");
  ui.setMenu(null);
  assert.equal(ui.snapshot.menu, null);
});

// UI-16: an open overlay keeps its id, so a command's answer reaches the page or dialog it came
// from wherever that lies in the stack, and nothing once it is closed.
test("an open overlay is found and changed by its id, and the top layers close together", async () => {
  const { createUIState } = await import("../../../src/controllers/runtime/ui-state.js");
  const ui = createUIState();
  ui.openOverlay({ kind: "job-detail" });
  const detail = ui.overlay;
  ui.openOverlay({ kind: "job-editor" });
  ui.openOverlay({ kind: "confirm" });
  assert.deepEqual(ui.snapshot.overlays.map((overlay) => overlay.id), [1, 2, 3]);
  ui.patchOverlay(detail.id, { busy: true });
  assert.deepEqual([ui.find(detail.id).busy, ui.overlay.kind], [true, "confirm"], "below the top as well");
  ui.closeOverlay(2);
  assert.deepEqual(ui.snapshot.overlays.map((overlay) => overlay.kind), ["job-detail"]);
  const before = ui.snapshot;
  assert.equal(ui.patchOverlay(3, { busy: true }), before, "a closed overlay takes nothing");
  assert.equal(ui.find(3), null);
  ui.closeOverlay(5);
  ui.openOverlay({ kind: "job-detail" });
  assert.equal(ui.overlay.id, 4, "an id is never given twice");
});

// QUE-09: the clock ticks on the second while a shown time counts seconds, else on the minute
// boundary of the card's clock; never while the page is hidden, and at once when it shows.
test("the clock ticks each second or on the minute, and not while the page is hidden", async () => {
  const { createClockRuntime, watchTimes } = await import("../../../src/controllers/runtime/clock-runtime.js");
  let time = 90_250;
  let hidden = false;
  let visibility = null;
  const timers = [];
  const platform = {
    setTimeout: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => (timer.cancelled = true),
    isDocumentHidden: () => hidden,
    onVisibilityChange: (fn) => {
      visibility = fn;
      return () => (visibility = null);
    },
  };
  const live = () => timers.filter((timer) => !timer.cancelled);
  const fire = (timer) => {
    timer.cancelled = true;
    timer.fn();
  };
  let ticks = 0;
  const clock = createClockRuntime({ platform, now: () => time, onTick: () => (ticks += 1) });
  assert.equal(live().length, 0, "nothing ticks before the card is connected");
  clock.connect();
  assert.deepEqual(live().map((timer) => timer.ms), [29_750], "to the next minute");
  clock.plan("second");
  assert.deepEqual(live().map((timer) => timer.ms), [750], "to the next second");
  time += 750;
  fire(live()[0]);
  assert.deepEqual([ticks, live().map((timer) => timer.ms)], [1, [1000]]);
  hidden = true;
  visibility();
  assert.deepEqual([ticks, live().length], [1, 0], "a hidden page does not tick");
  hidden = false;
  visibility();
  assert.deepEqual([ticks, live().length], [2, 1], "shown again it ticks at once");
  clock.disconnect();
  assert.deepEqual([live().length, visibility], [0, null]);

  const texts = { language: "en", formatRelative: (now, then) => `${then - now}` };
  const minutes = watchTimes(texts);
  assert.equal(minutes.texts.formatRelative(0, 90_000), "90000");
  assert.equal(minutes.mode, "minute");
  minutes.texts.formatRelative(0, -30_000);
  assert.deepEqual([minutes.mode, minutes.texts.language], ["second", "en"], "a time under a minute counts seconds");
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

// WAI-ARIA APG "Menu": arrow keys, Home and End move between the items of an open menu; a disabled
// item stays reachable.
test("arrow keys, Home and End move through an open menu", async () => {
  const { handleControlKeydown } = await import("../../../src/views/controls/keyboard.js");
  const { window, root } = shadow(`<div role="menu"><button role="menuitem" id="up">Up</button><button role="menuitem" id="down" aria-disabled="true">Down</button><button role="menuitem" id="edit">Edit</button></div>`);
  const key = (id, name) => {
    const event = new window.KeyboardEvent("keydown", { key: name, cancelable: true });
    Object.defineProperty(event, "target", { value: root.querySelector(id) });
    return handleControlKeydown(event);
  };
  root.querySelector("#up").focus();
  assert.equal(key("#up", "ArrowDown"), true);
  assert.equal(root.activeElement.id, "down", "a disabled item can be reached and says why");
  assert.equal(key("#down", "End"), true);
  assert.equal(root.activeElement.id, "edit");
  assert.equal(key("#edit", "ArrowDown"), true);
  assert.equal(root.activeElement.id, "up", "the menu wraps around");
  assert.equal(key("#up", "ArrowUp"), true);
  assert.equal(root.activeElement.id, "edit");
  assert.equal(key("#edit", "Home"), true);
  assert.equal(root.activeElement.id, "up");
  assert.equal(key("#up", "Enter"), false, "Enter activates the item as a button");
});

// An open menu opens upward when below there is less room in its scroll region than it needs
// and above there is more.
test("an open menu opens above its button only where below is too short", async () => {
  const { placeMenus } = await import("../../../src/controllers/runtime/menu-placement.js");
  const { root } = shadow(`<div data-scroll id="region"><div class="voc-menu-anchor" id="anchor"><div class="voc-menu" id="menu"></div></div></div>`);
  const rect = (top, bottom) => () => ({ top, bottom, height: bottom - top });
  root.querySelector("#region").getBoundingClientRect = rect(0, 400);
  root.querySelector("#menu").getBoundingClientRect = rect(0, 130);
  root.querySelector("#anchor").getBoundingClientRect = rect(100, 136);
  placeMenus(root);
  assert.equal(root.querySelector("#menu").hasAttribute("data-placement"), false, "room below");
  root.querySelector("#anchor").getBoundingClientRect = rect(330, 366);
  placeMenus(root);
  assert.equal(root.querySelector("#menu").getAttribute("data-placement"), "above");
  root.querySelector("#region").getBoundingClientRect = rect(300, 400);
  placeMenus(root);
  assert.equal(root.querySelector("#menu").hasAttribute("data-placement"), false, "no more room above than below");
  placeMenus(null);
});

test("clicks become view, action or background events with parsed arguments; inert controls stay silent", async () => {
  const { createInteractionRuntime } = await import("../../../src/controllers/runtime/interaction-runtime.js");
  const { window, root } = shadow(`<button role="tab" data-view="rooms"><span id="inner">R</span></button><button data-action="move-job" data-args='{"jobId":"a"}' id="go"></button><button data-action="x" data-args="{broken" id="bad"></button><button data-action="y" aria-disabled="true" id="off"></button><input data-field="name" id="field"><p id="plain">text</p>`);
  const events = [];
  const runtime = createInteractionRuntime({ root, onAction: (event) => events.push([event.type, event.view || event.action || event.field, event.args]) });
  runtime.connect();
  const click = (id) => root.querySelector(id).dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
  click("#inner");
  click("#go");
  click("#bad");
  click("#off");
  click("#plain");
  root.querySelector("#field").dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(events, [["view", "rooms", undefined], ["action", "move-job", { jobId: "a" }], ["action", "x", {}], ["background", undefined, undefined], ["input", "name", {}]], "a click on nothing the card acts on is a background click");
  runtime.disconnect();
  click("#go");
  assert.equal(events.length, 5);
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

test("the tab row drops the inactive labels, then the action label, keeps the active label and scrolls, measuring from the labelled row each time", async () => {
  const { createTabStripRuntime } = await import("../../../src/controllers/runtime/tab-strip-runtime.js");
  const dom = new JSDOM('<!doctype html><div id="host"></div>');
  const root = dom.window.document.getElementById("host").attachShadow({ mode: "open" });
  root.innerHTML = '<div class="voc-tab-row"><div class="voc-tabs"><button role="tab" data-view="queue" aria-selected="true"></button></div></div>';
  const row = root.querySelector(".voc-tab-row");
  const strip = root.querySelector(".voc-tabs");
  const widths = { labelled: 460, labels: 400, action: 340 };
  let clientWidth = 300;
  Object.defineProperty(strip, "clientWidth", { get: () => clientWidth });
  Object.defineProperty(strip, "scrollWidth", { get: () => Math.max(clientWidth, widths[row.getAttribute("data-compact") || "labelled"]) });
  Object.defineProperty(strip, "scrollLeft", { get: () => 0, set: () => {} });
  const runtime = createTabStripRuntime({ root, platform: { observeResize: () => () => {} } });
  const level = () => row.getAttribute("data-compact");
  for (const [width, expected] of [[350, "action"], [420, "labels"], [500, null]]) {
    clientWidth = width;
    runtime.sync();
    assert.equal(level(), expected, `at ${width}`);
  }
  clientWidth = 200;
  runtime.sync();
  assert.deepEqual([level(), strip.hasAttribute("data-overflow-end")], ["action", true], "the active tab keeps its label; the strip scrolls");
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
  assert.equal(row.getAttribute("data-compact"), "labels", "the fallback font is wider");
  labelled = 470;
  fonts.dispatchEvent(new dom.window.Event("loadingdone"));
  assert.equal(row.hasAttribute("data-compact"), false, "the loaded font fits");
  runtime.disconnect();
  labelled = 520;
  fonts.dispatchEvent(new dom.window.Event("loadingdone"));
  assert.equal(row.hasAttribute("data-compact"), false);
});
