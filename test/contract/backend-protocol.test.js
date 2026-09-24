"use strict";
// The backend protocol contract: every message the card sends and every answer it accepts,
// checked against the fake that implements the integration's target contract.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeOrchestrator, VirtualClock } = require("../helpers/fake-orchestrator.js");

async function modules() {
  return {
    backend: await import("../../src/backend/index.js"),
    protocol: await import("../../src/backend/protocol.js"),
  };
}

test("fake target backend accepts every target query and produces schema-valid responses", async () => {
  const { backend, protocol } = await modules();
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile: "target", clock });
  const hass = fake.attachTo({});
  const port = backend.createOrchestratorBackend({ getHass: () => hass, platform: clock, clock });
  await port.connect();
  assert.equal(fake.calls.ws.some((message) => message.type === protocol.WS.DESCRIBE), true);
  const describe = await hass.callWS(protocol.describeMessage());
  assert.equal(protocol.isDescribeResponse(describe), true);
  const queue = await hass.callWS(protocol.queueGetMessage({ offset: 0, limit: 50 }));
  assert.equal(protocol.isQueuePage(queue), true);
  const history = await hass.callWS(protocol.jobsListMessage({ offset: 0, limit: 50 }));
  assert.equal(protocol.isJobListPage(history), true);
  const robots = await hass.callWS(protocol.robotsListMessage());
  assert.equal(protocol.isRobotsResponse(robots), true);
  const areas = await hass.callWS(protocol.areasStatusMessage());
  assert.equal(protocol.isAreasStatusResponse(areas), true);
  port.dispose();
});

test("target fake preserves readiness for non-queued jobs", async () => {
  const { protocol } = await modules();
  const fake = createFakeOrchestrator({
    profile: "target",
    seed: {
      jobs: [{
        job_id: "running-1",
        state: "running",
        areas: ["kitchen"],
        mode: "vacuum",
        readiness: { state: "blocked", failed_on: ["binary_sensor.door"], failed_off: [], unknown: [] },
      }],
    },
  });
  const hass = fake.attachTo({});
  const job = await hass.callWS(protocol.jobGetMessage("running-1"));
  assert.equal(protocol.isJobRecord(job), true);
  assert.equal(job.readiness.state, "blocked");
});

test("contract records an unsupported query as the stable unknown_command error", async () => {
  const { protocol } = await modules();
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile: "today", clock });
  const hass = fake.attachTo({});
  await assert.rejects(hass.callWS(protocol.robotsListMessage()), (error) => error.code === "unknown_command");
  fake.failNext("unauthorized");
  await assert.rejects(hass.callWS(protocol.queueGetMessage()), (error) => error.code === "unauthorized");
});
