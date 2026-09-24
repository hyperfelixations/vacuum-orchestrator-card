"use strict";
// The editor draft: a pure reducer over an already normalized job, validated against the same
// invariants the backend enforces.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireJob } = require("../../fixtures/wire.js");

const WIRE = wireJob({
  revision: 4,
  name: "Kitchen",
  vacuum_power: "standard",
  source: "test",
  reason: "routine",
  required_on: ["binary_sensor.door"],
});

test("draft reducer validates backend invariants and emits only changed update fields", async () => {
  const draftModule = await import("../../../src/domain/job-draft.js");
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const job = normalizeJob(WIRE);
  const draft = draftModule.createDraft(job);
  assert.equal(draftModule.validateDraft(draft).dirty, false);
  const changed = draftModule.applyDraftChange(draft, "passes", 2);
  const result = draftModule.validateDraft(changed);
  assert.equal(result.valid, true);
  assert.equal(result.dirty, true);
  assert.deepEqual(draftModule.draftToUpdatePatch(changed, job), { passes: 2 });
  assert.deepEqual(draftModule.draftToUpdatePatch(draft, job), {});
});

// The create payload speaks the wire vocabulary; unset optional fields are left out rather
// than sent as null.
test("a new draft produces a create payload with only the fields that were filled in", async () => {
  const { createDraft, applyDraftChange, draftToCreatePayload } = await import("../../../src/domain/job-draft.js");
  let draft = createDraft(null);
  draft = applyDraftChange(draft, "areas", ["kitchen"]);
  draft = applyDraftChange(draft, "mode", "vacuum_and_mop");
  draft = applyDraftChange(draft, "vacuumPower", "high");
  const payload = draftToCreatePayload(draft);
  assert.deepEqual(payload.areas, ["kitchen"]);
  assert.equal(payload.mode, "vacuum_and_mop");
  assert.equal(payload.vacuum_power, "high");
  assert.equal(payload.settings_policy, "best_effort");
  assert.equal("name" in payload, false);
});

test("draft validation catches duplicate areas, mixed map contexts and contradictory requirements", async () => {
  const { createDraft, applyDraftChange, validateDraft } = await import("../../../src/domain/job-draft.js");
  let draft = createDraft(null, {
    areas: [
      { areaId: "kitchen", mapContext: "ground" },
      { areaId: "kitchen", mapContext: "upper" },
    ],
    requiredOn: ["binary_sensor.door", "binary_sensor.door"],
    requiredOff: ["binary_sensor.door"],
  });
  draft = applyDraftChange(draft, "passes", 0);
  const result = validateDraft(draft);
  assert.equal(result.errors["areas.1"], "duplicate_area");
  assert.equal(result.errors.areas, "mixed_map_contexts");
  assert.equal(result.errors.passes, "invalid_pass_count");
  assert.equal(result.errors.requiredOn, "invalid_required_on");
  assert.equal(result.errors.requiredOff, "contradictory_state_requirement");
});


// One case per invariant, so a rule that quietly stops firing cannot hide behind the others.
test("every draft invariant reports its own error code", async () => {
  const { createDraft, validateDraft } = await import("../../../src/domain/job-draft.js");
  const cases = [
    ["areas", { areas: [] }, "job_requires_area"],
    ["areas.0", { areas: [{ areaId: "", mapContext: null }] }, "empty_target"],
    ["areas.0", { areas: [{ areaId: "kitchen", mapContext: "" }] }, "empty_map_context"],
    ["mode", { areas: ["kitchen"], mode: "polish" }, "invalid_cleaning_mode"],
    ["passes", { areas: ["kitchen"], passes: 11 }, "invalid_pass_count"],
    ["passes", { areas: ["kitchen"], passes: 1.5 }, "invalid_pass_count"],
    ["name", { areas: ["kitchen"], name: "   " }, "empty_name"],
    ["source", { areas: ["kitchen"], source: "" }, "empty_source"],
    ["reason", { areas: ["kitchen"], reason: " " }, "empty_reason"],
    ["note", { areas: ["kitchen"], note: "" }, "empty_note"],
    ["dedupeKey", { areas: ["kitchen"], dedupeKey: " " }, "empty_dedupe_key"],
    ["vacuumPower", { areas: ["kitchen"], vacuumPower: "turbo" }, "unsupported_cleaning_preference"],
    ["mopIntensity", { areas: ["kitchen"], mopIntensity: "soaked" }, "unsupported_cleaning_preference"],
    ["mopRoute", { areas: ["kitchen"], mopRoute: "zigzag" }, "unsupported_cleaning_preference"],
    ["settingsPolicy", { areas: ["kitchen"], settingsPolicy: "whatever" }, "unsupported_cleaning_preference"],
    ["requiredOn", { areas: ["kitchen"], requiredOn: ["a", "a"] }, "invalid_required_on"],
    ["requiredOff", { areas: ["kitchen"], requiredOff: [""] }, "invalid_required_off"],
  ];
  for (const [path, defaults, code] of cases) {
    const result = validateDraft(createDraft(null, defaults));
    assert.equal(result.errors[path], code, `${path} should report ${code}`);
    assert.equal(result.valid, false);
    assert.equal(result.payload, null, "an invalid draft has no payload");
  }
});

test("a draft built from nothing is still a valid object to validate", async () => {
  const { validateDraft } = await import("../../../src/domain/job-draft.js");
  const result = validateDraft(null);
  assert.equal(result.valid, false);
  assert.equal(result.errors.areas, "job_requires_area");
  assert.equal(result.dirty, false);
});

// Clearing an optional value is a change the backend has to be told about explicitly.
test("an update patch sends null for a value the user cleared", async () => {
  const { createDraft, applyDraftChange, draftToUpdatePatch } = await import("../../../src/domain/job-draft.js");
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const job = normalizeJob(WIRE);
  const cleared = applyDraftChange(createDraft(job), "vacuumPower", null);
  assert.deepEqual(draftToUpdatePatch(cleared, job), { vacuum_power: null });

  const renamed = applyDraftChange(createDraft(job), "name", "Kitchen at night");
  assert.deepEqual(draftToUpdatePatch(renamed, job), { name: "Kitchen at night" });
});

test("a change to an unknown path leaves the draft as it was", async () => {
  const { createDraft, applyDraftChange, validateDraft } = await import("../../../src/domain/job-draft.js");
  const draft = createDraft(null, { areas: ["kitchen"] });
  const unchanged = applyDraftChange(draft, "nothing.here", 5);
  assert.equal(validateDraft(unchanged).dirty, false);
  assert.deepEqual([...unchanged.areas], [...draft.areas]);
  assert.deepEqual([...applyDraftChange(null, "passes", 2).areas], []);
});
