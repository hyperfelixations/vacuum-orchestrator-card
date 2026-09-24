"use strict";
// Capability negotiation: what the installed backend can do, derived from `describe` where it
// exists and from the API version plus `hass.services` where it does not.

const test = require("node:test");
const assert = require("node:assert/strict");

test("legacy negotiation takes queries from the API version and commands from hass.services", async () => {
  const { CAPABILITY, capabilitiesFrom } = await import("../../../src/backend/capabilities.js");
  const legacy = capabilitiesFrom({ apiVersion: 2, services: { create_job: {}, pause_queue: {} } });
  assert.equal(legacy.values[CAPABILITY.QUEUE_READ], true);
  assert.equal(legacy.values[CAPABILITY.JOB_CREATE], true);
  assert.equal(legacy.values[CAPABILITY.QUEUE_PAUSE], true);
  assert.equal(legacy.values[CAPABILITY.JOB_DELETE], false, "a service the integration does not register");
  assert.equal(legacy.values[CAPABILITY.DESCRIBE], false);
  assert.equal(legacy.source, "legacy");
  assert.equal(legacy.negotiated, true);
});

test("a describe response is authoritative and carries its limits", async () => {
  const { capabilitiesFrom } = await import("../../../src/backend/capabilities.js");
  const target = capabilitiesFrom({
    apiVersion: 2,
    describe: { api_version: 2, integration_version: "0.2.0", capabilities: ["queueRead", "robotsRead"], limits: { max_page_size: 50, max_areas_per_job: 3, max_passes: 4 } },
  });
  assert.equal(target.values.queueRead, true);
  assert.equal(target.values.robotsRead, true);
  assert.equal(target.values.describe, true);
  assert.equal(target.values.jobsHistory, false);
  assert.equal(target.source, "describe");
  assert.equal(target.integrationVersion, "0.2.0");
  assert.equal(target.limits.max_page_size, 50);
});

// A query that answers `unknown_command` is recorded for the session so the card stops asking.
test("a probe result overrides both other sources", async () => {
  const { capabilitiesFrom, missingCapabilities } = await import("../../../src/backend/capabilities.js");
  const snapshot = capabilitiesFrom({ apiVersion: 2, probes: { robotsRead: true, queueRead: false } });
  assert.equal(snapshot.values.robotsRead, true);
  assert.equal(snapshot.values.queueRead, false);
  assert.equal(missingCapabilities(snapshot.values).includes("queueRead"), true);
});

test("the capability map always answers for every known key", async () => {
  const { CAPABILITY_KEYS, NO_CAPABILITIES, capabilitiesFrom } = await import("../../../src/backend/capabilities.js");
  const snapshot = capabilitiesFrom({ apiVersion: 2 });
  for (const key of CAPABILITY_KEYS) assert.equal(typeof snapshot.values[key], "boolean", key);
  assert.equal(NO_CAPABILITIES.negotiated, false);
});
