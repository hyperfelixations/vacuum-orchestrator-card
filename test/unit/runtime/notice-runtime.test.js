// The card's notice that goes by itself (UI-33): its timer starts with the notice, a later notice
// replaces it, a pointer moving on it, focus inside it, a hidden page and a detached card hold it
// with the running line, a resting pointer it appears under does not, and it expires exactly once.
// Boundary: the runtime against jsdom and a virtual clock, never the assembled card.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { VirtualClock } = require("../../helpers/virtual-clock.js");

async function setup({ hidden = false } = {}) {
  const { createNoticeRuntime } = await import("../../../src/controllers/runtime/notice-runtime.js");
  const dom = new JSDOM("<!doctype html><div id=host></div>");
  const host = dom.window.document.getElementById("host");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<div class="voc-notice voc-notice--float" data-key="notice:1"><span class="voc-notice-text">Job added.</span><button type="button">x</button></div><button type="button" class="outside">y</button>';
  const clock = new VirtualClock(0);
  let visibility = null;
  const state = { hidden };
  const platform = {
    monotonicNow: () => clock.now(),
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (handle) => clock.clearTimeout(handle),
    isDocumentHidden: () => state.hidden,
    onVisibilityChange(fn) {
      visibility = fn;
      return () => (visibility = null);
    },
  };
  const expired = [];
  const runtime = createNoticeRuntime({ root, platform, onExpire: (id) => expired.push(id) });
  runtime.connect();
  const notice = () => root.querySelector(".voc-notice--float");
  const fire = (target, type, init = {}) => target.dispatchEvent(new dom.window.Event(type, { bubbles: true, composed: true, ...init }));
  return {
    runtime,
    clock,
    root,
    notice,
    expired,
    paused: () => notice().hasAttribute("data-paused"),
    pointer: (type) => fire(notice().querySelector(".voc-notice-text"), type),
    pointerOut: (to = null) => notice().querySelector(".voc-notice-text").dispatchEvent(Object.assign(new dom.window.Event("pointerout", { bubbles: true, composed: true }), { relatedTarget: to })),
    setHidden(value) {
      state.hidden = value;
      visibility?.();
    },
    outside: () => root.querySelector(".outside"),
  };
}

test("a timed notice expires after its time, once", async () => {
  const env = await setup();
  env.runtime.sync({ id: 1, durationMs: 2200 });
  env.clock.advance(2199);
  assert.deepEqual(env.expired, []);
  env.clock.advance(1);
  assert.deepEqual(env.expired, [1]);
  env.runtime.sync({ id: 1, durationMs: 2200 });
  env.clock.advance(5000);
  assert.deepEqual(env.expired, [1], "a notice that expired is not timed again");
});

test("a notice without a time stays, and a later notice replaces the timer", async () => {
  const env = await setup();
  env.runtime.sync({ id: 1, durationMs: null });
  env.clock.advance(60_000);
  assert.deepEqual(env.expired, []);
  env.runtime.sync({ id: 2, durationMs: 3000 });
  env.clock.advance(2000);
  env.runtime.sync({ id: 3, durationMs: 3000 });
  env.clock.advance(2000);
  assert.deepEqual(env.expired, [], "the second notice's timer ended with it");
  env.clock.advance(1000);
  assert.deepEqual(env.expired, [3]);
  env.runtime.sync(null);
  env.clock.advance(10_000);
  assert.deepEqual(env.expired, [3]);
});

test("a pointer moving on the notice holds its time and its line, and leaving goes on from there", async () => {
  const env = await setup();
  env.runtime.sync({ id: 1, durationMs: 3000 });
  env.clock.advance(1000);
  env.pointer("pointermove");
  assert.equal(env.paused(), true);
  env.clock.advance(60_000);
  assert.deepEqual(env.expired, []);
  env.pointerOut(env.notice().querySelector("button"));
  assert.equal(env.paused(), true, "moving within the notice still holds it");
  env.pointerOut(env.outside());
  assert.equal(env.paused(), false);
  env.clock.advance(1999);
  assert.deepEqual(env.expired, []);
  env.clock.advance(1);
  assert.deepEqual(env.expired, [1]);
});

test("a notice that appears under a resting pointer is not held by it", async () => {
  const env = await setup();
  env.runtime.sync({ id: 1, durationMs: 2000 });
  env.pointer("pointerover");
  assert.equal(env.paused(), false);
  env.clock.advance(2000);
  assert.deepEqual(env.expired, [1]);
});

test("focus inside the notice holds it until focus leaves it", async () => {
  const env = await setup();
  env.runtime.sync({ id: 1, durationMs: 2000 });
  env.notice().querySelector("button").focus();
  env.clock.advance(10_000);
  assert.deepEqual([env.expired, env.paused()], [[], true]);
  env.outside().focus();
  assert.equal(env.paused(), false);
  env.clock.advance(2000);
  assert.deepEqual(env.expired, [1]);
});

test("a hidden page and a detached card hold the notice; both holds must end", async () => {
  const env = await setup({ hidden: true });
  env.runtime.sync({ id: 1, durationMs: 2000 });
  assert.equal(env.paused(), true, "a notice that arrives on a hidden page waits for it");
  env.clock.advance(10_000);
  env.runtime.disconnect();
  env.setHidden(false);
  env.clock.advance(10_000);
  assert.deepEqual(env.expired, [], "a detached card does not lose its notice");
  env.runtime.connect();
  env.clock.advance(1999);
  assert.deepEqual(env.expired, []);
  env.clock.advance(1);
  assert.deepEqual(env.expired, [1]);
});
