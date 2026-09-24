"use strict";
// The transport: WebSocket queries, the documented callService signature, and one normalized
// failure shape for everything that can go wrong.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeOrchestrator, VirtualClock } = require("../../helpers/fake-orchestrator.js");

test("queries return the validated payload and commands use the documented signature", async () => {
  const { createClient } = await import("../../../src/backend/client.js");
  const { queueGetMessage } = await import("../../../src/backend/protocol.js");
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile: "target", clock });
  const hass = fake.attachTo({});
  const client = createClient({ getHass: () => hass, platform: clock });

  const page = await client.query(queueGetMessage({ offset: 0, limit: 10 }));
  assert.equal(page.api_version, 2);
  assert.equal(page.ok, undefined, "a query result is the payload, not a wrapper");

  const created = await client.command("create_job", { areas: ["kitchen"], mode: "vacuum" }, { response: true });
  assert.equal(created.ok, true);
  const last = fake.calls.services.at(-1);
  assert.deepEqual(
    [last.domain, last.service, last.data, last.target, last.returnResponse, last.wantsResponse],
    ["vacuum_orchestrator", "create_job", { areas: ["kitchen"], mode: "vacuum" }, undefined, false, true]
  );

  fake.failNext("job_requires_area");
  const failed = await client.command("create_job", { areas: [], mode: "vacuum" }, { response: true });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "job_requires_area");
  assert.equal(failed.group, "validation");
});

test("an unexpected response shape is a backend error, not a crash", async () => {
  const { createClient } = await import("../../../src/backend/client.js");
  const { queueGetMessage } = await import("../../../src/backend/protocol.js");
  const { isBackendError } = await import("../../../src/domain/backend-errors.js");
  const clock = new VirtualClock();
  const client = createClient({ getHass: () => ({ callWS: async () => ({ nonsense: true }) }), platform: clock });
  const result = await client.query(queueGetMessage({ offset: 0, limit: 1 }));
  assert.equal(isBackendError(result), true);
  assert.equal(result.code, "invalid_response");
});

test("the timeout is driven by the injected platform timer", async () => {
  const { createClient } = await import("../../../src/backend/client.js");
  const fake = createFakeOrchestrator({ profile: "today", clock: new VirtualClock() });
  const hass = fake.attachTo({});
  const platform = new VirtualClock();
  const client = createClient({ getHass: () => hass, platform, timeoutMs: 10 });
  fake.failNext("timeout");
  const promise = client.command("pause_queue", {}, { response: false });
  platform.advance(10);
  const result = await promise;
  assert.equal(result.ok, false);
  assert.equal(result.code, "timeout");
});

// Home Assistant has offered more than one way to reach the backend over the years. The card
// uses the documented one and falls back only when it is absent.
test("the client falls back to the raw connection and refuses when there is none", async () => {
  const { createClient } = await import("../../../src/backend/client.js");
  const { queueGetMessage } = await import("../../../src/backend/protocol.js");
  const { VirtualClock } = require("../../helpers/fake-orchestrator.js");
  const clock = new VirtualClock();
  const sent = [];
  const connectionOnly = {
    connection: {
      sendMessagePromise: (message) => {
        sent.push(message);
        if (message.type === "call_service") return Promise.resolve({ response: { ok: true } });
        return Promise.resolve({ api_version: 2, commit_id: 1, queue_revision: 1, mode: "idle", needs_attention: false, total: 0, offset: 0, limit: 10, jobs: [] });
      },
    },
  };
  const client = createClient({ getHass: () => connectionOnly, platform: clock });

  const page = await client.query(queueGetMessage({ offset: 0, limit: 10 }));
  assert.equal(page.api_version, 2);
  const command = await client.command("run_queue", {});
  assert.equal(command.ok, true);
  assert.equal(sent.at(-1).type, "call_service");
  assert.equal(sent.at(-1).domain, "vacuum_orchestrator");
  assert.equal(sent.at(-1).return_response, true);

  // Nothing to talk to at all is a named failure, not an exception.
  const nothing = createClient({ getHass: () => ({}), platform: clock });
  const failedQuery = await nothing.query(queueGetMessage({ offset: 0, limit: 10 }));
  assert.equal(failedQuery.code, "orchestrator_not_loaded");
  const failedCommand = await nothing.command("run_queue", {});
  assert.deepEqual([failedCommand.ok, failedCommand.code], [false, "orchestrator_not_loaded"]);

  // A disposed client answers the same way instead of reaching for a torn-down connection.
  const disposable = createClient({ getHass: () => connectionOnly, platform: clock });
  disposable.dispose();
  assert.equal((await disposable.query(queueGetMessage({ offset: 0, limit: 10 }))).code, "orchestrator_not_loaded");
  assert.equal((await disposable.command("run_queue", {})).code, "orchestrator_not_loaded");
});
