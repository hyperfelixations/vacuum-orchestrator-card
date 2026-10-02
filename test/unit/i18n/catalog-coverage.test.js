// Every vocabulary the card words has a text in every language: error codes, execution
// outcomes, readiness and due reasons, job and attempt states, robot roles, setup steps, views.
// Template texts produce text for the parameters they are called with.

const test = require("node:test");
const assert = require("node:assert/strict");

const camel = (value) => value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

async function catalogs() {
  const { TRANSLATIONS } = await import("../../../src/i18n/registry.js");
  const errors = await import("../../../src/domain/backend-errors.js");
  const schema = await import("../../../src/domain/job-schema.js");
  const { SETUP_STEPS } = await import("../../../src/application/setup-status.js");
  return { TRANSLATIONS, errors, schema, SETUP_STEPS };
}

function missing(TRANSLATIONS, keys) {
  return Object.entries(TRANSLATIONS).flatMap(([language, catalog]) => keys.filter((key) => !(key in catalog)).map((key) => `${language}:${key}`));
}

test("every known error code and error group is worded", async () => {
  const { TRANSLATIONS, errors } = await catalogs();
  assert.deepEqual(missing(TRANSLATIONS, errors.KNOWN_ERROR_CODES.map((code) => `error.code.${code}`)), []);
  assert.deepEqual(missing(TRANSLATIONS, errors.ERROR_GROUP_NAMES.map((group) => `error.group.${group}`)), []);
});

test("every outcome, readiness reason and due reason is worded", async () => {
  const { TRANSLATIONS, errors } = await catalogs();
  assert.deepEqual(missing(TRANSLATIONS, errors.FAILURE_CODES.map((code) => `failure.${code}`)), []);
  assert.deepEqual(missing(TRANSLATIONS, errors.READINESS_REASONS.map((code) => `readiness.reason.${code}`)), []);
  assert.deepEqual(missing(TRANSLATIONS, errors.DUE_REASONS.map((code) => `due.reason.${code}`)), []);
});

test("every job state, attempt state, mode, level, route and role is worded", async () => {
  const { TRANSLATIONS, schema } = await catalogs();
  const keys = [
    ...schema.JOB_STATES.map((state) => `job.state.${camel(state)}`),
    ...schema.ATTEMPT_STATES.map((state) => `attempt.state.${camel(state)}`),
    ...schema.CLEANING_MODES.map((mode) => `mode.${camel(mode)}`),
    ...schema.OPERATIONS.map((operation) => `operation.${camel(operation)}`),
    ...schema.SEMANTIC_LEVELS.map((level) => `level.${level}`),
    ...schema.MOP_ROUTES.map((route) => `route.${route}`),
    ...schema.ROBOT_ROLES.map((role) => `role.${role}`),
    ...Object.keys(schema.ROBOT_OPTION_MAPS).map((map) => `robotEditor.optionMap.${map}`),
    ...Object.keys(schema.ROBOT_TIMEOUT_FIELDS).map((field) => `robotEditor.timeout.${field}`),
    ...schema.QUEUE_MODES.map((mode) => `queue.mode.${mode}`),
  ];
  assert.deepEqual(missing(TRANSLATIONS, keys), []);
});

test("every view, setup step and phase has its texts", async () => {
  const { TRANSLATIONS, SETUP_STEPS } = await catalogs();
  const views = ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics"];
  const phases = ["probing", "not_installed", "not_set_up", "load_failed", "api_incompatible", "offline"];
  const keys = [
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
