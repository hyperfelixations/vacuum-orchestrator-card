"use strict";
// Every way a backend answer can be wrong, and the guard that refuses it. A malformed answer
// must never reach the store, so each rule is stated as its own case.
// Boundary: the shape of an answer; what the card then does with it is a component test.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireJob, wireQueuePage, wireJobListPage, wireRobot, wireArea } = require("../../fixtures/wire.js");

let protocol;
test.before(async () => {
  protocol = await import("../../../src/backend/protocol.js");
});

// Each case removes or corrupts exactly one thing in an otherwise valid record.
function rejects(guard, valid, cases) {
  assert.equal(guard(valid), true, "the untouched record is accepted");
  for (const [reason, mutate] of Object.entries(cases)) {
    const broken = mutate(structuredClone(valid));
    assert.equal(guard(broken), false, reason);
  }
}

test("a job record is refused on every violated field rule", () => {
  rejects(protocol.isJobRecord, wireJob(), {
    "not an object": () => null,
    "missing field": (job) => {
      delete job.settings_policy;
      return job;
    },
    "unsupported api version": (job) => ({ ...job, api_version: 1 }),
    "job id is not a string": (job) => ({ ...job, job_id: 7 }),
    "negative revision": (job) => ({ ...job, revision: -1 }),
    "unknown state": (job) => ({ ...job, state: "sleeping" }),
    "no areas": (job) => ({ ...job, areas: [] }),
    "duplicate area": (job) => ({ ...job, areas: ["kitchen", "kitchen"] }),
    "unknown mode": (job) => ({ ...job, mode: "polish" }),
    "passes below one": (job) => ({ ...job, passes: 0 }),
    "passes above ten": (job) => ({ ...job, passes: 11 }),
    "unknown settings policy": (job) => ({ ...job, settings_policy: "whatever" }),
    "created_at is neither text nor a number": (job) => ({ ...job, created_at: true }),
    "updated_at is neither text nor a number": (job) => ({ ...job, updated_at: {} }),
    "optional text is not text": (job) => ({ ...job, note: 5 }),
    "unknown vacuum level": (job) => ({ ...job, vacuum_power: "turbo" }),
    "unknown mop route": (job) => ({ ...job, mop_route: "zigzag" }),
    "requirement lists are not string lists": (job) => ({ ...job, required_on: [1] }),
    "duplicate requirement": (job) => ({ ...job, required_on: ["a", "a"] }),
    "contradictory requirement": (job) => ({ ...job, required_on: ["a"], required_off: ["a"] }),
    "malformed readiness": (job) => ({ ...job, readiness: { state: "unsure" } }),
    "target field of the wrong type": (job) => ({ ...job, assigned_robot_id: 3 }),
    "malformed timestamp extension": (job) => ({ ...job, started_at: true }),
    "malformed work unit": (job) => ({ ...job, work_units: [{ work_unit_id: "w" }] }),
  });
});

test("a readiness report needs a known state and three string lists", () => {
  rejects(protocol.isReadiness, { state: "ready", failed_on: [], failed_off: [], unknown: [] }, {
    "unknown state": (report) => ({ ...report, state: "maybe" }),
    "missing list": (report) => {
      delete report.unknown;
      return report;
    },
    "list of the wrong type": (report) => ({ ...report, failed_on: "binary_sensor.door" }),
  });
});

test("a queue page is refused when its paging or its jobs do not hold up", () => {
  rejects(protocol.isQueuePage, wireQueuePage([wireJob()]), {
    "unknown queue mode": (page) => ({ ...page, mode: "spinning" }),
    "needs_attention is not a boolean": (page) => ({ ...page, needs_attention: "no" }),
    "negative offset": (page) => ({ ...page, offset: -1 }),
    "limit below one": (page) => ({ ...page, limit: 0 }),
    "limit above the backend maximum": (page) => ({ ...page, limit: 101 }),
    "more jobs than the page allows": (page) => ({ ...page, limit: 1, jobs: [wireJob(), wireJob({ job_id: "job-2" })] }),
    "jobs is not a list": (page) => ({ ...page, jobs: {} }),
    "a job in the page is malformed": (page) => ({ ...page, jobs: [{ job_id: "job-1" }] }),
  });
});

test("a registry page follows the same paging rules without a queue mode", () => {
  rejects(protocol.isJobListPage, wireJobListPage([wireJob()]), {
    "negative total": (page) => ({ ...page, total: -1 }),
    "limit above the backend maximum": (page) => ({ ...page, limit: 101 }),
    "a job in the page is malformed": (page) => ({ ...page, jobs: [42] }),
  });
});

test("a describe answer needs a version, a capability list and three limits", () => {
  const valid = { api_version: 2, integration_version: "0.2.0", capabilities: ["queueRead"], limits: { max_page_size: 100, max_areas_per_job: 8, max_passes: 10 } };
  rejects(protocol.isDescribeResponse, valid, {
    "integration version missing": (answer) => ({ ...answer, integration_version: null }),
    "capabilities are not strings": (answer) => ({ ...answer, capabilities: [1] }),
    "limits are missing": (answer) => ({ ...answer, limits: null }),
    "a limit is below one": (answer) => ({ ...answer, limits: { ...answer.limits, max_passes: 0 } }),
  });
});

test("a subscription event is refused on a malformed counter and accepts the target extensions", () => {
  const valid = { api_version: 2, commit_id: 4, queue_revision: 2, mode: "running", pending_jobs: 3, needs_attention: false };
  rejects(protocol.isSubscriptionEvent, valid, {
    "unknown mode": (event) => ({ ...event, mode: "elsewhere" }),
    "pending jobs is not a count": (event) => ({ ...event, pending_jobs: "many" }),
    "sequence is not a count": (event) => ({ ...event, sequence: -1 }),
    "attention ids are not strings": (event) => ({ ...event, attention_job_ids: [7] }),
  });
  assert.equal(protocol.isSubscriptionEvent({ ...valid, sequence: 12, attention_job_ids: ["job-1"] }), true);
});

test("a robot answer is refused on every violated capability rule", () => {
  rejects(protocol.isRobotsResponse, { api_version: 2, robots: [wireRobot()] }, {
    "robots is not a list": (answer) => ({ ...answer, robots: null }),
    "unknown availability": (answer) => ({ ...answer, robots: [{ ...answer.robots[0], availability: "asleep" }] }),
    "battery is neither a number nor absent": (answer) => ({ ...answer, robots: [{ ...answer.robots[0], battery_percentage: "full" }] }),
    "allowed areas are not strings": (answer) => ({ ...answer, robots: [{ ...answer.robots[0], allowed_area_ids: [3] }] }),
    "capabilities are missing": (answer) => ({ ...answer, robots: [{ ...answer.robots[0], capabilities: null }] }),
    "cancel is not a boolean": (answer) => ({ ...answer, robots: [{ ...answer.robots[0], capabilities: { ...answer.robots[0].capabilities, cancel: "yes" } }] }),
  });
  assert.equal(protocol.isRobotsResponse({ api_version: 2, robots: [wireRobot({ battery_percentage: null })] }), true);
});

test("an area answer is refused on a malformed timestamp or due state", () => {
  rejects(protocol.isAreasStatusResponse, { api_version: 2, areas: [wireArea()] }, {
    "areas is not a list": (answer) => ({ ...answer, areas: "kitchen" }),
    "unknown due state": (answer) => ({ ...answer, areas: [{ ...answer.areas[0], due_state: "dusty" }] }),
    "timestamp of the wrong type": (answer) => ({ ...answer, areas: [{ ...answer.areas[0], last_mopped_at: true }] }),
    "blocking entities are not strings": (answer) => ({ ...answer, areas: [{ ...answer.areas[0], blocking_entity_ids: [null] }] }),
  });
  // Epoch milliseconds are as valid as an ISO string.
  assert.equal(protocol.isAreasStatusResponse({ api_version: 2, areas: [wireArea({ last_vacuumed_at: 1_758_000_000_000 })] }), true);
});

test("page arguments outside the backend's limits are refused before a message is built", () => {
  assert.deepEqual(protocol.queueGetMessage({ offset: 10, limit: 25 }), { type: "vacuum_orchestrator/queue/get", offset: 10, limit: 25 });
  assert.deepEqual(protocol.jobsListMessage(0, 50), { type: "vacuum_orchestrator/jobs/list", offset: 0, limit: 50 });
  assert.throws(() => protocol.queueGetMessage({ offset: -1 }), TypeError);
  assert.throws(() => protocol.queueGetMessage({ limit: 0 }), TypeError);
  assert.throws(() => protocol.queueGetMessage({ limit: 101 }), TypeError);
});
