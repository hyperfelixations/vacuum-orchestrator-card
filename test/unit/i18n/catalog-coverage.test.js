// Every vocabulary the card words has a text in every language: the card's own error codes, form
// validation codes, execution outcomes, readiness and due reasons, job and attempt states, robot roles, setup steps, views.
// Template texts produce text for the parameters they are called with.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DOMAIN = path.join(__dirname, "../../../src/domain");
// Codes the editors check themselves outside a draft validator.
const DIALOG_CODES = ["queue_grace_out_of_range", "release_duration_mismatch", "room_name_required"];

// Every `fail(field, "code")` of a draft validator.
function validatorCodes() {
  const codes = new Set(DIALOG_CODES);
  for (const file of fs.readdirSync(DOMAIN).filter((name) => name.endsWith("-draft.js"))) {
    for (const match of fs.readFileSync(path.join(DOMAIN, file), "utf8").matchAll(/fail\([^,]+,\s*"([a-z_]+)"/g)) codes.add(match[1]);
  }
  return [...codes];
}

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

test("every client code is worded; integration codes are the integration's to word", async () => {
  const { TRANSLATIONS, errors } = await catalogs();
  assert.deepEqual(missing(TRANSLATIONS, [...errors.CLIENT_CODES.map((code) => `error.code.${code}`), "error.unknownCode"]), []);
  const worded = Object.keys(TRANSLATIONS.en).filter((key) => key.startsWith("error.code.")).map((key) => key.slice("error.code.".length));
  assert.deepEqual(worded.filter((code) => !errors.isClientCode(code)), []);
});

test("every code a form validator raises is worded", async () => {
  const { TRANSLATIONS } = await catalogs();
  const codes = validatorCodes();
  assert.ok(codes.includes("job_requires_area") && codes.includes("invalid_minimum_battery") && codes.includes("interval_positive"));
  assert.deepEqual(missing(TRANSLATIONS, codes.map((code) => `validation.${code}`)), []);
});

test("every outcome, readiness reason and due reason is worded", async () => {
  const { TRANSLATIONS, errors } = await catalogs();
  assert.deepEqual(missing(TRANSLATIONS, errors.FAILURE_CODES.map((code) => `failure.${code}`)), []);
  assert.deepEqual(missing(TRANSLATIONS, errors.READINESS_REASONS.map((code) => `readiness.reason.${code}`)), []);
  assert.deepEqual(missing(TRANSLATIONS, errors.DUE_REASONS.map((code) => `due.reason.${code}`)), []);
});

test("every job state, attempt state, mode, setting rung, origin and role is worded", async () => {
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
