"use strict";
// The pure helpers every section projection formats through, and the keyed patch the sections
// rely on to keep focus. Boundary: single functions with an injected text port; how a section
// composes them is its own test.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const TEXTS = {
  t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  formatNumber: (value) => `n${value}`,
  formatDateTime: (value) => `d${value}`,
  formatRelative: (nowMs, value) => `r${nowMs - value}`,
  formatDuration: (value) => `u${value}`,
};

// Without a text port the helpers still have to answer something a person can read.
test("each helper falls back to a readable value when nothing is supplied", async () => {
  const helpers = await import("../../../../src/presentation/sections/helpers.js");
  assert.deepEqual(helpers.listOf(null), []);
  assert.deepEqual(helpers.listOf(["a"]), ["a"]);

  assert.equal(helpers.text(null, "action.save", undefined, "Save"), "Save");
  assert.equal(helpers.text(TEXTS, "action.save"), "action.save");

  assert.equal(helpers.number(TEXTS, 3), "n3");
  assert.equal(helpers.number(null, 3), "3");
  assert.equal(helpers.number(TEXTS, null), "—");
  assert.equal(helpers.number(TEXTS, "not a number"), "—");

  assert.equal(helpers.dateTime(TEXTS, 10), "d10");
  assert.equal(helpers.dateTime(null, 10), "10");
  assert.equal(helpers.dateTime(TEXTS, null), "—");

  assert.equal(helpers.duration(TEXTS, 60000), "u60000");
  assert.equal(helpers.duration(null, 60000), "60000");
  assert.equal(helpers.duration(TEXTS, null), "—");
});

test("a time without a clock falls back to the absolute form", async () => {
  const { displayTime, relative } = await import("../../../../src/presentation/sections/helpers.js");
  assert.equal(displayTime(TEXTS, 100, "absolute", 500), "d100");
  assert.equal(displayTime(TEXTS, 100, "auto", 500), "r400");
  assert.equal(displayTime(TEXTS, 100, "auto", null), "d100", "no clock means no relative wording");
  assert.equal(relative(null, 100, 500), "100");
});

test("a field id is safe to put in an attribute whatever the path looks like", async () => {
  const { fieldId } = await import("../../../../src/presentation/sections/helpers.js");
  assert.equal(fieldId("areas"), "voc-field-areas");
  assert.equal(fieldId("areas.0.mapContext"), "voc-field-areas-0-mapContext");
  assert.equal(fieldId('"><img src=x>'), "voc-field-img-src-x");
  assert.equal(fieldId(""), "voc-field-field");
  assert.equal(fieldId(null), "voc-field-field");
});

test("a path reads through missing links instead of throwing", async () => {
  const { pathValue } = await import("../../../../src/presentation/sections/helpers.js");
  const object = { a: { b: { c: 1 } } };
  assert.equal(pathValue(object, "a.b.c"), 1);
  assert.equal(pathValue(object, "a.x.c"), undefined);
  assert.equal(pathValue(null, "a"), undefined);
  assert.deepEqual(pathValue(object, ""), object);
});

test("the capability, pending and job lookups read the frozen model", async () => {
  const helpers = await import("../../../../src/presentation/sections/helpers.js");
  const model = {
    capabilities: { queueRead: true, robotsRead: false },
    commands: { pending: ["job:job-1"] },
    queue: { pending: [{ jobId: "job-1", name: "Kitchen", areas: ["kitchen"] }] },
    active: { jobs: [] },
    history: { jobs: [{ jobId: "job-2", name: null, areas: ["hall"] }] },
    attention: { jobs: [] },
  };
  assert.equal(helpers.hasCapability(model, "queueRead"), true);
  assert.equal(helpers.hasCapability(model, "robotsRead"), false);
  assert.equal(helpers.hasCapability({}, "queueRead"), false);

  assert.equal(helpers.commandPending(model, "job:job-1"), true);
  assert.equal(helpers.commandPending(model, "job:job-2"), false);
  assert.deepEqual([...helpers.pendingTargets(model)], ["job:job-1"]);
  assert.deepEqual([...helpers.pendingTargets({})], []);

  assert.equal(helpers.findJob(model, "job-2")?.jobId, "job-2");
  assert.equal(helpers.findJob(model, "nothing"), null);
  assert.equal(helpers.findJob(model, null), null);

  const areas = helpers.areaMap({ areas: { catalog: [{ areaId: "hall", name: "Hall" }] } });
  assert.equal(helpers.jobLabel(model.queue.pending[0], areas), "Kitchen", "a name wins");
  assert.equal(helpers.jobLabel(model.history.jobs[0], areas), "Hall", "without a name the rooms say it");
  assert.equal(helpers.jobLabel({ jobId: "job-3", areas: [] }, areas), "job-3", "the id is the last resort");
  assert.equal(helpers.jobLabel(null, areas), "");
});

test("the keyed patch reuses, adds, reorders and removes rows", async () => {
  const { keyedPatch } = await import("../../../../src/render/primitives/dom.js");
  const dom = new JSDOM("<!doctype html><body><div id='list'></div></body>");
  const document = dom.window.document;
  const parent = document.getElementById("list");
  const render = (item) => {
    const node = document.createElement("div");
    node.dataset.jobId = item.jobId;
    node.textContent = item.label;
    return node;
  };
  const patch = (node, item) => {
    node.textContent = item.label;
  };
  const options = { key: "jobId", render, patch };

  keyedPatch(parent, [{ jobId: "a", label: "A" }, { jobId: "b", label: "B" }], options);
  const first = parent.children[0];
  assert.deepEqual([...parent.children].map((node) => node.dataset.jobId), ["a", "b"]);

  // The same key keeps the very same node, which is what keeps focus and scroll position.
  keyedPatch(parent, [{ jobId: "b", label: "B" }, { jobId: "a", label: "A2" }], options);
  assert.deepEqual([...parent.children].map((node) => node.dataset.jobId), ["b", "a"]);
  assert.equal(parent.children[1], first);
  assert.equal(first.textContent, "A2");

  keyedPatch(parent, [{ jobId: "b", label: "B" }], options);
  assert.deepEqual([...parent.children].map((node) => node.dataset.jobId), ["b"]);

  // A renderer that declines an item leaves the list unchanged rather than inserting nothing.
  keyedPatch(parent, [{ jobId: "b", label: "B" }, { jobId: "c", label: "C" }], { key: "jobId", render: () => null, patch });
  assert.deepEqual([...parent.children].map((node) => node.dataset.jobId), ["b"]);

  assert.deepEqual(keyedPatch(null, [], options), []);
});

test("attribute and text writers accept an absent node and every falsy value", async () => {
  const { setAttribute, setText, measuredWidth, computedStyleOf } = await import("../../../../src/render/primitives/dom.js");
  const dom = new JSDOM("<!doctype html><body><span id='one'>x</span></body>");
  const node = dom.window.document.getElementById("one");

  setText(node, null);
  assert.equal(node.textContent, "");
  setText(node, 0);
  assert.equal(node.textContent, "0");
  setText(null, "ignored");

  setAttribute(node, "hidden", true);
  assert.equal(node.getAttribute("hidden"), "");
  setAttribute(node, "hidden", false);
  assert.equal(node.hasAttribute("hidden"), false);
  setAttribute(node, "title", "Kitchen");
  assert.equal(node.getAttribute("title"), "Kitchen");
  setAttribute(node, "title", null);
  assert.equal(node.hasAttribute("title"), false);
  setAttribute(null, "title", "ignored");

  assert.equal(measuredWidth(null), 0);
  assert.equal(computedStyleOf(null), null);
  assert.ok(computedStyleOf(node));
});
