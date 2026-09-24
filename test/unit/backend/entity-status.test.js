"use strict";
// The integration's diagnostic entities. The registry says which entities belong to the
// integration; the state machine says what they currently read.

const test = require("node:test");
const assert = require("node:assert/strict");

function entity(objectId, state) {
  return {
    registry: { entity_id: `sensor.${objectId}`, platform: "vacuum_orchestrator" },
    state: { entity_id: `sensor.${objectId}`, state },
  };
}

test("entity status joins the registry with the state machine", async () => {
  const { findEntityStatus } = await import("../../../src/backend/entity-status.js");
  const rows = [
    entity("vacuum_orchestrator_queue_mode", "paused"),
    entity("vacuum_orchestrator_queue_length", "3"),
    entity("vacuum_orchestrator_active_jobs", "1"),
    entity("vacuum_orchestrator_jobs_needing_attention", "2"),
  ];
  const status = findEntityStatus({
    entities: rows.map((row) => row.registry).concat([{ entity_id: "sensor.other", platform: "sensor" }]),
    states: Object.fromEntries(rows.map((row) => [row.state.entity_id, row.state]).concat([["sensor.other", { state: "99" }]])),
  });
  assert.equal(status.queueMode, "paused");
  assert.equal(status.queueLength, 3);
  assert.equal(status.activeJobs, 1);
  assert.equal(status.attentionJobs, 2);
  assert.equal(status.available, true);
});

// The entity registry has no `state` field; reading it there was silently always empty.
test("a registry without states yields nothing rather than a false reading", async () => {
  const { findEntityStatus } = await import("../../../src/backend/entity-status.js");
  const status = findEntityStatus({ entities: [{ entity_id: "sensor.vacuum_orchestrator_queue_length", platform: "vacuum_orchestrator" }], states: {} });
  assert.equal(status.available, false);
  assert.equal(status.queueLength, null);
  assert.equal(findEntityStatus({}).available, false);
});

test("an unavailable diagnostic entity is skipped", async () => {
  const { findEntityStatus } = await import("../../../src/backend/entity-status.js");
  const status = findEntityStatus({
    entities: [{ entity_id: "sensor.vacuum_orchestrator_queue_length", platform: "vacuum_orchestrator" }],
    states: { "sensor.vacuum_orchestrator_queue_length": { state: "unavailable" } },
  });
  assert.equal(status.available, false);
});
