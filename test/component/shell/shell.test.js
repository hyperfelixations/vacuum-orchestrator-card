"use strict";
// The assembled shell: header, warning block, tab strip and the rule that a working card shows
// no warning. Section content is covered in test/component/sections.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, JOBS } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment();
});
test.after(() => env.cleanupAll());

test("the header speaks the configured language and summarizes the queue", async () => {
  const mounted = await mountCard({ env, config: { language: "de" }, seed: { jobs: JOBS } });
  assert.equal(mounted.text(".voc-title"), "Reinigung");
  assert.equal(mounted.text(".voc-subtitle"), "2 Aufträge offen");
  assert.equal(mounted.text(".voc-status-pill"), "Bereit");
  mounted.unmount();
});

// Missing optional capabilities and a read-only user are normal states. A warning block that
// is always on stops being read.
test("a working card with today's backend shows no warning, for admins and read-only users", async () => {
  for (const isAdmin of [true, false]) {
    const mounted = await mountCard({ env, seed: { jobs: JOBS }, hass: { isAdmin } });
    assert.equal(mounted.root.querySelector(".voc-warning"), null, `isAdmin=${isAdmin}`);
    mounted.unmount();
  }
});

test("a read-only user keeps the queue and sees the read-only pill", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS }, hass: { isAdmin: false } });
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  const start = mounted.root.querySelector(".voc-job-action-start");
  assert.equal(start.getAttribute("aria-disabled"), "true");
  mounted.unmount();
});

// Sections the backend cannot serve yet are still listed, so the user sees what is coming.
test("the tab strip lists degraded sections and hides history and diagnostics by default", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  const tabs = [...mounted.root.querySelectorAll("[role=tab]")];
  assert.deepEqual(tabs.map((tab) => tab.dataset.section), ["queue", "rooms", "robots"]);
  assert.deepEqual(tabs.map((tab) => tab.dataset.degraded === "true"), [false, true, true]);
  assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  mounted.unmount();
});

test("show.unavailable_sections: false leaves one section and auto-hides the tab strip", async () => {
  const mounted = await mountCard({ env, config: { show: { unavailable_sections: false } }, seed: { jobs: JOBS } });
  assert.equal(mounted.root.querySelector("[role=tablist]"), null);
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  mounted.unmount();
});

test("all variable header text is text content, not markup", async () => {
  const mounted = await mountCard({ env, config: { title: "<img src=x onerror=alert(1)>" } });
  assert.equal(mounted.root.querySelectorAll("img,script").length, 0);
  assert.match(mounted.text(".voc-title"), /<img/);
  mounted.unmount();
});
