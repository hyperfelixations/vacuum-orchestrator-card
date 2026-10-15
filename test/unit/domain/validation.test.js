// The integration's verdict on a form's input: read from the wire, placed at the page's fields,
// and taken back field by field as the user changes them.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/domain/validation.js");

test("a verdict reads paths as dotted keys and is invalid only with an error", async () => {
  const { normalizeValidation } = await load();
  const verdict = normalizeValidation({ valid: false, errors: [{ path: ["areas", 1], code: "unknown_room" }, { path: [], code: "required_field" }, { path: ["passes"] }, "noise"] });
  assert.deepEqual(JSON.parse(JSON.stringify(verdict)), { valid: false, errors: [{ path: "areas.1", code: "unknown_room" }, { path: "", code: "required_field" }] });
  assert.ok(Object.isFrozen(verdict) && Object.isFrozen(verdict.errors));
  assert.deepEqual({ ...normalizeValidation({ valid: true, errors: [] }) }, { valid: true, errors: [] });
  assert.equal(normalizeValidation({ valid: true, errors: [{ path: ["name"], code: "empty_name" }] }).valid, false, "an error outweighs the flag");
  assert.equal(normalizeValidation({ errors: [] }), null);
  assert.equal(normalizeValidation(null), null);
});

test("each field keeps its first error; the input as a whole and unknown paths are the form's", async () => {
  const { formErrors, normalizeValidation } = await load();
  const fieldOf = (path) => ({ passes: "passes", "areas.1": "roomIds", "areas.2": "roomIds" })[path] ?? null;
  const verdict = normalizeValidation({
    valid: false,
    errors: [
      { path: ["areas", 1], code: "unknown_room" },
      { path: ["areas", 2], code: "duplicate_area" },
      { path: ["colour"], code: "unknown_field" },
      { path: [], code: "required_field" },
      { path: ["passes"], code: "out_of_range" },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(formErrors(verdict, fieldOf))), { errors: { roomIds: "unknown_room", passes: "out_of_range" }, formError: "unknown_field" });
  assert.deepEqual(JSON.parse(JSON.stringify(formErrors(null, fieldOf))), { errors: {}, formError: null });
});

test("a changed field drops its own error and those of the item it belongs to or holds", async () => {
  const { withoutFieldError } = await load();
  const errors = Object.freeze({ name: "empty_name", "requirements.0": "invalid_entity_id", "requirements.1.acceptedStates": "accepted_states_count", "requirements.10": "invalid_entity_id" });
  assert.deepEqual({ ...withoutFieldError(errors, "name") }, { "requirements.0": "invalid_entity_id", "requirements.1.acceptedStates": "accepted_states_count", "requirements.10": "invalid_entity_id" });
  assert.deepEqual(Object.keys(withoutFieldError(errors, "requirements.0.acceptedStates")), ["name", "requirements.1.acceptedStates", "requirements.10"], "a part clears its item, not a sibling");
  assert.deepEqual(Object.keys(withoutFieldError(errors, "requirements.1")), ["name", "requirements.0", "requirements.10"], "an item clears its parts");
  assert.equal(withoutFieldError(errors, "note"), errors, "nothing to drop keeps the errors");
  assert.equal(withoutFieldError(null, "name"), null);
});
