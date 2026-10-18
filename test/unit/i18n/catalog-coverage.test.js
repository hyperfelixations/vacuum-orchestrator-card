// Every vocabulary the card words has a text in every language: the card's own error codes,
// execution outcomes, readiness and due reasons, job and attempt states, robot roles, setup steps, views.
// Template texts produce text for the parameters they are called with.

const test = require("node:test");
const assert = require("node:assert/strict");

const camel = (value) => value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

async function catalogs() {
  const { TRANSLATIONS } = await import("../../../src/i18n/registry.js");
  const errors = await import("../../../src/domain/backend-errors.js");
  const schema = await import("../../../src/domain/job-schema.js");
  const { SETUP_STEPS } = await import("../../../src/domain/setup.js");
  return { TRANSLATIONS, errors, schema, SETUP_STEPS };
}

function missing(TRANSLATIONS, keys) {
  return Object.entries(TRANSLATIONS).flatMap(([language, catalog]) => keys.filter((key) => !(key in catalog)).map((key) => `${language}:${key}`));
}

test("every client code is worded; integration codes are the integration's to word", async () => {
  const { TRANSLATIONS, errors } = await catalogs();
  assert.deepEqual(missing(TRANSLATIONS, [...errors.CLIENT_CODES.map((code) => `error.code.${code}`), "error.unknownCode"]), []);
  const worded = Object.keys(TRANSLATIONS.en).filter((key) => key.startsWith("error.code.")).map((key) => key.slice("error.code.".length));
  assert.deepEqual(worded.filter((code) => !errors.isClientCode(code)), []);
});

test("every outcome, readiness reason and due reason is worded", async () => {
  const { TRANSLATIONS, errors } = await catalogs();
  assert.deepEqual(missing(TRANSLATIONS, errors.FAILURE_CODES.map((code) => `failure.${code}`)), []);
  assert.deepEqual(missing(TRANSLATIONS, errors.READINESS_REASONS.map((code) => `readiness.reason.${code}`)), []);
  assert.deepEqual(missing(TRANSLATIONS, errors.DUE_REASONS.map((code) => `due.reason.${code}`)), []);
});

test("every job state, attempt state, mode, setting rung, origin, role, release kind, policy and quality is worded", async () => {
  const { TRANSLATIONS, schema } = await catalogs();
  const keys = [
    ...schema.JOB_STATES.map((state) => `job.state.${camel(state)}`),
    ...schema.ATTEMPT_STATES.map((state) => `attempt.state.${camel(state)}`),
    ...schema.CLEANING_MODES.map((mode) => `mode.${camel(mode)}`),
    ...schema.OPERATIONS.map((operation) => `operation.${camel(operation)}`),
    "setting.off",
    ...schema.SETTING_FIELDS.flatMap((field) => [`field.${field}`, ...schema.SETTING_LADDERS[field].map((value) => `setting.${field}.${value}`)]),
    ...schema.PROVENANCE_KINDS.map((kind) => `origin.${kind}`),
    ...schema.AFTER_CANCEL.map((choice) => `detail.afterCancel.${choice}`),
    ...schema.ROBOT_ROLES.map((role) => `role.${role}`),
    ...Object.keys(schema.ROBOT_OPTION_MAPS).map((map) => `robotEditor.optionMap.${map}`),
    ...schema.ROBOT_TIMEOUT_FIELDS.map((field) => `robotEditor.timeout.${field}`),
    ...schema.QUEUE_MODES.map((mode) => `queue.mode.${mode}`),
    ...schema.RELEASE_KINDS.flatMap((kind) => [`release.kind.${camel(kind)}`, `release.explain.${camel(kind)}`]),
    ...schema.SETTINGS_POLICIES.map((policy) => `policy.${camel(policy)}`),
    ...schema.COMPLETION_QUALITIES.map((quality) => `quality.${quality}`),
    ...schema.READINESS_STATES.map((state) => `readiness.${state}`),
    ...schema.DUE_BASES.map((basis) => `room.basis.${basis}`),
  ];
  assert.deepEqual(missing(TRANSLATIONS, keys), []);
});

test("every view, setup step and phase has its texts", async () => {
  const { TRANSLATIONS, SETUP_STEPS } = await catalogs();
  const views = ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics"];
  const { PHASES } = await import("../../../src/backend/session.js");
  const phases = PHASES.filter((phase) => phase !== "ready");
  const { cardStatus } = await import("../../../src/presentation/shell/status.js");
  const statuses = phases.map((phase) => cardStatus({ phase }));
  const keys = [
    ...statuses.flatMap((status) => [`status.${status}`, `subtitle.${status}`]),
    ...views.map((view) => `view.${view}`),
    ...SETUP_STEPS.flatMap((step) => [`setup.step.${step}.title`, `setup.step.${step}.text`]),
    ...phases.flatMap((phase) => [`onboarding.${phase}.title`, `onboarding.${phase}.text`]),
    ...["live", "connecting", "reconnecting", "failed", "idle"].map((state) => `diagnostics.subscription.${state}`),
  ];
  assert.deepEqual(missing(TRANSLATIONS, keys), []);
});

test("every text is a non-empty string or a function returning one", async () => {
  const { TRANSLATIONS } = await catalogs();
  const vars = new Proxy({}, { get: (_target, name) => (name === "count" ? 2 : `‹${String(name)}›`) });
  const empty = [];
  for (const [language, catalog] of Object.entries(TRANSLATIONS)) {
    for (const [key, entry] of Object.entries(catalog)) {
      const value = typeof entry === "function" ? entry(vars) : entry;
      if (typeof value !== "string" || !value.trim()) empty.push(`${language}:${key}`);
    }
  }
  assert.deepEqual(empty, []);
});

// UI-05: counts of one read as one, in both languages.
test("a count of one is singular", async () => {
  const { en } = await import("../../../src/i18n/languages/en.js");
  const { de } = await import("../../../src/i18n/languages/de.js");
  assert.deepEqual([en["robot.maxPasses"]({ count: 1 }), de["robot.maxPasses"]({ count: 1 }), en["robot.maxPasses"]({ count: 3 })], ["Up to 1 pass", "Bis zu 1 Durchgang", "Up to 3 passes"]);
  assert.deepEqual([en["diagnostics.sinkFailures"]({ count: 1 }).startsWith("Vacuum Orchestrator could not save 1 change."), de["diagnostics.sinkFailures"]({ count: 2 }).startsWith("Vacuum Orchestrator konnte 2 Änderungen nicht speichern.")], [true, true]);
  assert.deepEqual([en["setup.step.rooms.done"]({ count: 1, total: 1 }), de["setup.step.rooms.done"]({ count: 1, total: 1 })], ["1 of 1 room reachable", "1 von 1 Raum erreichbar"]);
  assert.deepEqual([en["rooms.releasedCount"]({ count: 1 }), de["rooms.releasedCount"]({ count: 1 })], ["1 room released", "1 Raum freigegeben"]);
});

// V6: how sure a cleaning record is, in plain words rather than the jargon "Derived".
test("the quality of a cleaning record is said in plain words", async () => {
  const { en } = await import("../../../src/i18n/languages/en.js");
  const { de } = await import("../../../src/i18n/languages/de.js");
  assert.deepEqual([en["quality.confirmed"], en["quality.derived"], de["quality.confirmed"], de["quality.derived"]], ["Confirmed by the robot", "Not fully observed", "Vom Roboter bestätigt", "Nicht vollständig beobachtet"]);
});
