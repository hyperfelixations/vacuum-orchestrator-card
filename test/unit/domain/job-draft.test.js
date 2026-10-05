// The job and template draft: immutable changes, validation mirroring the integration's input
// schema, and the three payloads (create intent, update patch, whole template).

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

const load = async () => ({ ...(await import("../../../src/domain/job-draft.js")), ...(await import("../../../src/domain/job.js")), ...(await import("../../../src/domain/templates.js")) });

test("a new draft starts empty and every change returns a new frozen draft", async () => {
  const { createDraft, applyDraftChange, validateDraft } = await load();
  const draft = createDraft();
  assert.deepEqual(draft.roomIds, []);
  assert.equal(draft.mode, "vacuum");
  const next = applyDraftChange(draft, "roomIds", ["room-kitchen"]);
  assert.notEqual(next, draft);
  assert.deepEqual(draft.roomIds, []);
  assert.ok(Object.isFrozen(next) && Object.isFrozen(next.roomIds));
  assert.equal(validateDraft(next).dirty, true);
  assert.equal(validateDraft(draft).dirty, false);
});

test("unknown and unsafe fields are ignored", async () => {
  const { createDraft, applyDraftChange } = await load();
  const draft = createDraft();
  assert.equal(applyDraftChange(draft, "__proto__", { polluted: true }), draft);
  assert.equal(applyDraftChange(draft, "meta", {}), draft);
  assert.equal(applyDraftChange(draft, "robotId", "x"), draft);
  assert.equal({}.polluted, undefined);
});

test("defaults prefill a new draft, such as the room a job is created for", async () => {
  const { createDraft } = await load();
  assert.deepEqual(createDraft({ defaults: { roomIds: ["room-hall"], unknown: 1 } }).roomIds, ["room-hall"]);
});

test("validation names the field and the integration's code", async () => {
  const { createDraft, applyDraftChange, validateDraft } = await load();
  let draft = createDraft();
  assert.equal(validateDraft(draft).errors.roomIds, "job_requires_area");
  const set = (field, value) => {
    draft = applyDraftChange(draft, field, value);
  };
  set("roomIds", ["room-a", "room-a"]);
  set("passes", 11);
  set("requiredOn", ["binary_sensor.door", "not an entity"]);
  set("requiredOff", ["binary_sensor.door"]);
  const { errors, valid } = validateDraft(draft);
  assert.equal(valid, false);
  assert.deepEqual({ ...errors }, { roomIds: "duplicate_area", passes: "invalid_pass_count", requiredOn: "invalid_entity_id", requiredOff: "contradictory_state_requirement" });
});

test("suction off is valid only while mopping, water off only while vacuuming", async () => {
  const { createDraft, applyDraftChange, validateDraft, levelOptionsFor } = await load();
  const base = applyDraftChange(createDraft(), "roomIds", ["room-a"]);
  const check = (mode, field) => validateDraft(applyDraftChange(applyDraftChange(base, "mode", mode), field, "off")).errors[field] ?? null;
  assert.equal(check("vacuum", "vacuumPower"), "preference_conflicts_with_cleaning_mode");
  assert.equal(check("mop", "vacuumPower"), null);
  assert.equal(check("mop", "mopIntensity"), "preference_conflicts_with_cleaning_mode");
  assert.equal(check("vacuum", "mopIntensity"), null);
  assert.equal(check("vacuum_then_mop", "mopIntensity"), "preference_conflicts_with_cleaning_mode");
  const levels = ["off", "low", "high"];
  assert.deepEqual(levelOptionsFor("vacuumPower", "vacuum", levels), ["low", "high"]);
  assert.deepEqual(levelOptionsFor("vacuumPower", "mop", levels), levels);
  assert.deepEqual(levelOptionsFor("mopIntensity", "vacuum", levels), levels);
});

test("the create intent omits unset optional fields and uses wire names", async () => {
  const { createDraft, applyDraftChange, draftToIntent } = await load();
  let draft = applyDraftChange(createDraft(), "roomIds", ["room-kitchen"]);
  draft = applyDraftChange(draft, "name", "  ");
  draft = applyDraftChange(draft, "mopRoute", "deep");
  assert.deepEqual({ ...draftToIntent(draft) }, { areas: ["room-kitchen"], mode: "vacuum", mop_route: "deep", passes: 1, required_on: [], required_off: [], settings_policy: "best_effort" });
});

test("an update patch carries only changed fields and clears an optional one with null", async () => {
  const { createDraft, applyDraftChange, draftToUpdatePatch, normalizeJob } = await load();
  const job = normalizeJob(W.wireJob({ name: "Kitchen", passes: 2, vacuum_power: "high" }));
  let draft = createDraft({ target: job });
  assert.equal(draft.meta.id, "job-1");
  assert.deepEqual({ ...draftToUpdatePatch(draft) }, {});
  draft = applyDraftChange(draft, "name", "");
  draft = applyDraftChange(draft, "passes", 3);
  draft = applyDraftChange(draft, "vacuumPower", "high");
  assert.deepEqual({ ...draftToUpdatePatch(draft) }, { name: null, passes: 3 });
});

test("all rooms is a choice of its own: it needs no room, travels as \"all\" and replaces single rooms", async () => {
  const { ALL_ROOMS, createDraft, applyDraftChange, validateDraft, draftToIntent, draftToUpdatePatch, draftToTemplate, normalizeJob, normalizeTemplate } = await load();
  assert.equal(ALL_ROOMS, "all");
  const fresh = createDraft();
  assert.equal(fresh.allRooms, false);
  const all = applyDraftChange(fresh, "allRooms", true);
  assert.deepEqual([validateDraft(all).valid, validateDraft(all).dirty], [true, true]);
  assert.equal(draftToIntent(all).areas, "all");
  const job = createDraft({ target: normalizeJob(W.wireJob()) });
  assert.equal(job.allRooms, false, "a job holds the rooms it was created with");
  assert.deepEqual({ ...draftToUpdatePatch(applyDraftChange(job, "allRooms", true)) }, { areas: "all" });
  assert.deepEqual({ ...draftToUpdatePatch(applyDraftChange(applyDraftChange(job, "allRooms", true), "allRooms", false)) }, {});
  const template = createDraft({ kind: "template", target: normalizeTemplate(W.wireTemplate({ intent: { areas: "all", mode: "vacuum" } })) });
  assert.deepEqual([template.allRooms, [...template.roomIds], validateDraft(template).dirty], [true, [], false]);
  assert.equal(draftToTemplate(template).intent.areas, "all");
  assert.equal(validateDraft(applyDraftChange(template, "allRooms", false)).errors.roomIds, "job_requires_area");
});

test("a template draft wraps the intent and needs a name", async () => {
  const { createDraft, applyDraftChange, validateDraft, draftToTemplate, normalizeTemplate } = await load();
  const fresh = createDraft({ kind: "template" });
  assert.equal(validateDraft(fresh).errors.templateName, "template_name_required");
  const template = normalizeTemplate(W.wireTemplate({ automatic: true }));
  let draft = createDraft({ kind: "template", target: template });
  assert.deepEqual([draft.templateName, draft.enabled, draft.automatic, draft.meta.id], ["Daily vacuum", true, true, "template-1"]);
  draft = applyDraftChange(draft, "enabled", false);
  assert.deepEqual(JSON.parse(JSON.stringify(draftToTemplate(draft))), {
    name: "Daily vacuum",
    intent: { areas: ["room-kitchen"], mode: "vacuum", passes: 1, required_on: [], required_off: [], settings_policy: "best_effort" },
    enabled: false,
    automatic: true,
    template_id: "template-1",
  });
  const created = draftToTemplate(applyDraftChange(applyDraftChange(fresh, "templateName", "Weekly"), "roomIds", ["room-a"]));
  assert.equal("template_id" in created, false);
});
