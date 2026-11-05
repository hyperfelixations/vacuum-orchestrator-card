// The element's pure projections: the render signature names everything a render shows, and the
// scope demand follows the active view, the page on screen and a dialog above it.

const test = require("node:test");
const assert = require("node:assert/strict");

const MODEL = Object.freeze({ robotsLive: {}, entityReadings: {}, areas: [], operations: [], permissions: { canCommand: true }, entityCatalog: [{ entityId: "sensor.a", name: "A", domain: "sensor" }] });
const BASE = Object.freeze({ sessionVersion: 3, configVersion: 1, language: "en", scheme: "light", nowMs: 125_500, clockMode: "minute", ui: { view: "queue" }, model: MODEL });

test("the render signature follows a renamed entity and counts seconds only on the second clock", async () => {
  const { renderSignature } = await import("../../../src/element/render-signature.js");
  const renamed = { ...MODEL, entityCatalog: [{ entityId: "sensor.a", name: "Renamed", domain: "sensor" }] };
  assert.notEqual(renderSignature({ ...BASE, model: renamed }), renderSignature(BASE), "the same number of entities, another name");
  assert.equal(renderSignature({ ...BASE, nowMs: 126_400 }), renderSignature(BASE), "within the minute");
  assert.notEqual(renderSignature({ ...BASE, clockMode: "second", nowMs: 126_400 }), renderSignature({ ...BASE, clockMode: "second" }));
});

test("a card demands the shell's scopes and those of its view, its page and a dialog above it", async () => {
  const { cardDemand } = await import("../../../src/element/card-demand.js");
  const demand = (tabs, layers = {}) => cardDemand({ ui: { pages: { runs: 25 } }, config: { page_size: 25 }, language: "de", model: {}, tabs, layers: { page: null, dialog: null, ...layers } });
  const shell = demand({ active: "queue", activeTab: { options: {} } });
  assert.deepEqual(Object.keys(shell), ["queue", "openJobs", "rooms", "robots", "candidates", "registry", "setup", "errorTexts", "templates"], "the queue view adds its quick starts");
  assert.deepEqual([shell.queue.params, shell.errorTexts.params], [{ offset: 0, limit: 25 }, { language: "de" }]);
  const history = demand({ active: "history", activeTab: { options: { source: "runs" } } }, { page: { kind: "job-detail", jobId: "job-1" }, dialog: { kind: "start-job", jobId: "job-2" } });
  assert.deepEqual(history.runs, { name: "runs", params: { offset: 25, limit: 25 } });
  assert.deepEqual([history.job, history.trace], [{ name: "job", params: { jobId: "job-1" } }, { name: "trace", params: { jobId: "job-1" } }]);
  assert.deepEqual(history.execution, { name: "execution", params: { jobId: "job-2" } }, "the dialog on top reads the execution it starts");
});
