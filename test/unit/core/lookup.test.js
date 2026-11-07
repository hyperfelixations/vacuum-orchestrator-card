// Tables the card reads with a key from outside, an integration value or error path, know only
// their own entries: a key spelled like a member of Object.prototype is unknown, never that member.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../helpers/voi-records.js");
const { modelFor } = require("../../helpers/model.js");

const PROTOTYPE_NAMES = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"];

test("own reads only a table's own entries", async () => {
  const { own } = await import("../../../src/core/lookup.js");
  const table = Object.freeze({ known: 1 });
  assert.equal(own(table, "known"), 1);
  for (const name of PROTOTYPE_NAMES) assert.equal(own(table, name), undefined, name);
  assert.deepEqual([own(null, "known"), own(table, null), own(table, undefined)], [undefined, undefined, undefined]);
});

test("integration values and error paths named like prototype members are unknown", async () => {
  const { canonicalizeMode, isSettingValue } = await import("../../../src/domain/job-schema.js");
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const { createDraft, draftFieldOf } = await import("../../../src/domain/job-draft.js");
  const { releaseFieldOf } = await import("../../../src/domain/release-draft.js");
  const { robotFieldOf } = await import("../../../src/domain/robot-draft.js");
  const { roomFieldOf } = await import("../../../src/domain/room-draft.js");
  const job = createDraft();
  const template = createDraft({ kind: "template" });
  for (const name of PROTOTYPE_NAMES) {
    assert.equal(canonicalizeMode(name), null, name);
    assert.equal(isSettingValue(name, "standard"), false, name);
    assert.equal(normalizeJob(W.wireJob({ mode: name })), null, name);
    assert.deepEqual([draftFieldOf(job, name), draftFieldOf(template, name)], [null, null], name);
    assert.equal(releaseFieldOf(`grants.0.${name}`), null, name);
    assert.equal(robotFieldOf(`configuration.${name}`), null, name);
    assert.deepEqual([roomFieldOf(`configuration.${name}`), roomFieldOf(`configuration.due_policy.${name}`)], [null, null], name);
    assert.equal(Object.hasOwn(createDraft({ defaults: { [name]: "x" } }), name), false, name);
  }
});

test("an adapter or a trace reason named like a prototype member is shown as reported", async () => {
  const { model, texts } = await modelFor("showcase", { from: "A busy afternoon" });
  const { adapterLabel } = await import("../../../src/presentation/common/texts.js");
  const { traceRows } = await import("../../../src/presentation/common/trace.js");
  for (const name of PROTOTYPE_NAMES) {
    assert.equal(adapterLabel(texts, name), name);
    const [row] = traceRows([{ sequence: 1, timestamp: "2026-03-14T12:00:00+00:00", event: "setting", details: { reason: name } }], { model, texts });
    assert.doesNotMatch(row.detail, /function|\[native code\]|undefined/, name);
  }
});
