// The editor draft for a job intent, and for a template wrapping one. An immutable value: every
// change returns a new frozen draft that keeps its baseline. A new draft starts from the
// integration's job defaults and carries exactly the settings its mode uses. Validation mirrors
// the integration's input schema (`api/job_input.py`) so obvious mistakes are caught early; the
// integration remains the authority. See internal dev doc §7 "Entwurf".

import { MODE_SETTINGS, PASS_MAX, PASS_MIN, SETTING_FIELDS, canonicalizeMode, isSettingValue, isSettingsPolicy } from "./job-schema.js";

export const INTENT_FIELDS = Object.freeze([
  "roomIds",
  "mode",
  "name",
  "vacuumPower",
  "mopIntensity",
  "mopRoute",
  "passes",
  "reason",
  "note",
  "dedupeKey",
  "requiredOn",
  "requiredOff",
  "settingsPolicy",
]);

export const TEMPLATE_FIELDS = Object.freeze(["templateName", "enabled", "automatic"]);

// The integration resolves "all" to the rooms a robot can clean when a job is created; a
// template keeps the choice itself.
export const ALL_ROOMS = "all";

const WIRE_NAMES = Object.freeze({
  roomIds: "areas",
  mode: "mode",
  name: "name",
  vacuumPower: "vacuum_power",
  mopIntensity: "mop_intensity",
  mopRoute: "mop_route",
  passes: "passes",
  reason: "reason",
  note: "note",
  dedupeKey: "dedupe_key",
  requiredOn: "required_on",
  requiredOff: "required_off",
  settingsPolicy: "settings_policy",
});
// Text fields `update_job` accepts as an explicit null.
const TEXT_FIELDS = Object.freeze(["name", "reason", "note", "dedupeKey"]);
const SETTINGS = new Set(SETTING_FIELDS);
const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const EMPTY_INTENT = Object.freeze({
  roomIds: [],
  allRooms: false,
  mode: "vacuum",
  name: null,
  vacuumPower: null,
  mopIntensity: null,
  mopRoute: null,
  passes: 1,
  reason: null,
  note: null,
  dedupeKey: null,
  requiredOn: [],
  requiredOff: [],
  settingsPolicy: "best_effort",
});

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

// The settings a mode uses; any other setting of a job is unset.
export function settingsForMode(mode) {
  return MODE_SETTINGS[canonicalizeMode(mode)] || [];
}

function intentOf(source) {
  return {
    roomIds: [...(source.roomIds ?? source.areas ?? [])],
    allRooms: source.allRooms === true,
    mode: source.mode ?? EMPTY_INTENT.mode,
    name: source.name ?? null,
    vacuumPower: source.vacuumPower ?? null,
    mopIntensity: source.mopIntensity ?? null,
    mopRoute: source.mopRoute ?? null,
    passes: source.passes ?? EMPTY_INTENT.passes,
    reason: source.reason ?? null,
    note: source.note ?? null,
    dedupeKey: source.dedupeKey ?? null,
    requiredOn: [...(source.requiredOn ?? [])],
    requiredOff: [...(source.requiredOff ?? [])],
    settingsPolicy: source.settingsPolicy ?? EMPTY_INTENT.settingsPolicy,
  };
}

// A new intent: the job defaults, or the empty intent while they are not known.
function defaultIntent(jobDefaults) {
  if (!jobDefaults) return copy(EMPTY_INTENT);
  return { ...copy(EMPTY_INTENT), mode: jobDefaults.mode, passes: jobDefaults.passes, settingsPolicy: jobDefaults.settingsPolicy };
}

// Settings the mode uses keep their value or take the default; the others are cleared.
function fitSettings(values, jobDefaults) {
  const used = new Set(settingsForMode(values.mode));
  const result = { ...values };
  for (const field of SETTING_FIELDS) {
    if (!used.has(field)) result[field] = null;
    else if (result[field] === null) result[field] = jobDefaults?.[field] ?? null;
  }
  return result;
}

function freezeDraft(values, meta) {
  return deepFreeze({ ...copy(values), meta: copy(meta) });
}

// `kind`: "job" or "template"; `target`: the job or template being edited, or null for a new
// one; `defaults` prefill a new draft (for example the room a job is created for);
// `jobDefaults`: the integration's job defaults, for a new draft and for a change of mode.
export function createDraft({ kind = "job", target = null, defaults = {}, jobDefaults = null } = {}) {
  const intentSource = kind === "template" ? target?.intent : target;
  let values = intentSource && typeof intentSource === "object" ? intentOf(intentSource) : defaultIntent(jobDefaults);
  if (kind === "template") {
    values.templateName = target?.name ?? null;
    values.enabled = target ? target.enabled !== false : true;
    values.automatic = target ? target.automatic === true : false;
  }
  for (const [key, value] of Object.entries(defaults || {})) {
    if (value !== undefined && key in values) values[key] = copy(value);
  }
  values = fitSettings(values, jobDefaults);
  const id = kind === "template" ? target?.templateId ?? null : target?.jobId ?? null;
  return freezeDraft(values, { kind, id, jobDefaults: jobDefaults ? copy(jobDefaults) : null, baseline: copy(values) });
}

export function applyDraftChange(draft, field, value) {
  if (!draft || typeof field !== "string" || UNSAFE_KEYS.has(field) || !(field in draft) || field === "meta") return draft;
  const { meta, ...values } = draft;
  const next = { ...values, [field]: copy(value) };
  // A new mode keeps the settings both modes use and takes the defaults for the others.
  return freezeDraft(field === "mode" ? fitSettings(next, meta.jobDefaults) : next, meta);
}

// All rooms and single rooms exclude each other: choosing one ends the other.
export function toggleRoom(draft, value) {
  if (value === ALL_ROOMS) return applyDraftChange(applyDraftChange(draft, "roomIds", []), "allRooms", !draft.allRooms);
  const current = draft.allRooms ? [] : draft.roomIds;
  const roomIds = current.includes(value) ? current.filter((roomId) => roomId !== value) : [...current, value];
  return applyDraftChange(applyDraftChange(draft, "allRooms", false), "roomIds", roomIds);
}

function textValue(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function same(one, other) {
  if (Array.isArray(one) || Array.isArray(other)) {
    return Array.isArray(one) && Array.isArray(other) && one.length === other.length && one.every((item, index) => item === other[index]);
  }
  return one === other;
}

function canonical(draft) {
  const values = { allRooms: draft.allRooms === true };
  for (const field of [...INTENT_FIELDS, ...TEMPLATE_FIELDS]) {
    if (!(field in draft)) continue;
    const value = draft[field];
    if (TEXT_FIELDS.includes(field) || field === "templateName") values[field] = textValue(value);
    else if (field === "mode") values[field] = canonicalizeMode(value);
    else if (Array.isArray(value)) values[field] = value.map((item) => String(item).trim()).filter(Boolean);
    else values[field] = value ?? null;
  }
  return values;
}

export function isDirty(draft) {
  const current = canonical(draft);
  const baseline = canonical({ ...draft.meta.baseline });
  return Object.keys(current).some((field) => !same(current[field], baseline[field]));
}

export function validateDraft(draft) {
  const values = canonical(draft);
  const errors = {};
  const fail = (field, code) => {
    if (!(field in errors)) errors[field] = code;
  };
  if (!values.allRooms && values.roomIds.length === 0) fail("roomIds", "job_requires_area");
  if (!values.allRooms && new Set(values.roomIds).size !== values.roomIds.length) fail("roomIds", "duplicate_area");
  if (!values.mode) fail("mode", "invalid_cleaning_mode");
  if (!Number.isInteger(values.passes) || values.passes < PASS_MIN || values.passes > PASS_MAX) fail("passes", "invalid_pass_count");
  // An unset setting takes the integration's default.
  for (const field of settingsForMode(values.mode)) {
    if (values[field] !== null && !isSettingValue(field, values[field])) fail(field, "unsupported_cleaning_preference");
  }
  if (!isSettingsPolicy(values.settingsPolicy)) fail("settingsPolicy", "unsupported_cleaning_preference");
  for (const field of ["requiredOn", "requiredOff"]) {
    if (values[field].some((entityId) => !ENTITY_ID.test(entityId))) fail(field, "invalid_entity_id");
    if (new Set(values[field]).size !== values[field].length) fail(field, "duplicate_entity");
  }
  if (values.requiredOn.some((entityId) => values.requiredOff.includes(entityId))) {
    fail("requiredOn", "contradictory_state_requirement");
    fail("requiredOff", "contradictory_state_requirement");
  }
  if (draft.meta.kind === "template" && values.templateName === null) fail("templateName", "template_name_required");
  return Object.freeze({ valid: Object.keys(errors).length === 0, errors: Object.freeze(errors), dirty: isDirty(draft) });
}

// The full intent for `create_job` or a template: unset optional fields and the settings the
// mode does not use are omitted.
export function draftToIntent(draft) {
  const values = canonical(draft);
  const used = new Set(settingsForMode(values.mode));
  const result = {};
  for (const field of INTENT_FIELDS) {
    const value = values[field];
    if (value === null && (TEXT_FIELDS.includes(field) || SETTINGS.has(field))) continue;
    if (SETTINGS.has(field) && !used.has(field)) continue;
    result[WIRE_NAMES[field]] = Array.isArray(value) ? [...value] : value;
  }
  if (values.allRooms) result.areas = ALL_ROOMS;
  return Object.freeze(result);
}

// Only the fields that differ from the job being edited travel to `update_job`; a cleared text
// travels as an explicit null. A setting the new mode does not use is left to the integration.
export function draftToUpdatePatch(draft) {
  const values = canonical(draft);
  const baseline = canonical({ ...draft.meta.baseline });
  const used = new Set(settingsForMode(values.mode));
  const patch = {};
  for (const field of INTENT_FIELDS) {
    if (field === "roomIds") continue;
    if (same(values[field], baseline[field])) continue;
    if (SETTINGS.has(field) && (!used.has(field) || values[field] === null)) continue;
    if (values[field] === null && !TEXT_FIELDS.includes(field)) continue;
    patch[WIRE_NAMES[field]] = Array.isArray(values[field]) ? [...values[field]] : values[field];
  }
  if (values.allRooms !== baseline.allRooms || (!values.allRooms && !same(values.roomIds, baseline.roomIds))) {
    patch.areas = values.allRooms ? ALL_ROOMS : [...values.roomIds];
  }
  return Object.freeze(patch);
}

// `save_template` replaces the whole template.
export function draftToTemplate(draft) {
  const values = canonical(draft);
  const result = { name: values.templateName, intent: draftToIntent(draft), enabled: values.enabled !== false, automatic: values.automatic === true };
  if (draft.meta.id) result.template_id = draft.meta.id;
  return Object.freeze(result);
}

// The `preview_job` parameters for a draft: what decides the offered rungs and whether it could
// start now. Texts are left out, so typing asks nothing; the chosen rungs only decide a strict
// start, so choosing one under best effort asks nothing either.
export function draftToPreview(draft) {
  const intent = draftToIntent(draft);
  const parameters = {};
  const settings = intent.settings_policy === "strict" ? ["vacuum_power", "mop_intensity", "mop_route"] : [];
  for (const key of ["areas", "mode", ...settings, "passes", "settings_policy", "required_on", "required_off"]) {
    if (intent[key] !== undefined) parameters[key] = intent[key];
  }
  if (Array.isArray(parameters.areas) && parameters.areas.length === 0) delete parameters.areas;
  return Object.freeze(parameters);
}
