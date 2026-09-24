// Pure editor projection. Draft validation and payload shaping stay in the domain layer.

import {
  createDraft,
  draftToCreatePayload,
  draftToUpdatePatch,
  validateDraft,
} from "../../domain/job-draft.js";
import { CLEANING_MODES, MOP_ROUTES, SEMANTIC_LEVELS, SETTINGS_POLICIES } from "../../domain/job-schema.js";
import { fieldId, hasCapability, listOf, modeSuffix, pathValue, text } from "./helpers.js";

export const EDITOR_GROUPS = [
  { key: "areas", titleKey: "form.rooms" },
  { key: "mode", titleKey: "form.mode" },
  { key: "settings", titleKey: "form.settings" },
  { key: "source", titleKey: "form.source" },
  { key: "requirements", titleKey: "form.requirements" },
];

const FIELD_DEFINITIONS = [
  { path: "areas", group: "areas", control: "chip-select", labelKey: "job.field.areas", required: true, multiple: true },
  { path: "mode", group: "mode", control: "segmented", labelKey: "job.field.mode", required: true },
  { path: "passes", group: "settings", control: "stepper", labelKey: "job.field.passes", min: 1, max: 10 },
  { path: "vacuumPower", group: "settings", control: "segmented", labelKey: "job.field.vacuumPower" },
  { path: "mopIntensity", group: "settings", control: "segmented", labelKey: "job.field.mopIntensity" },
  { path: "mopRoute", group: "settings", control: "chip-select", labelKey: "job.field.mopRoute" },
  { path: "settingsPolicy", group: "settings", control: "segmented", labelKey: "job.field.settingsPolicy" },
  { path: "name", group: "source", control: "text-field", labelKey: "job.field.name" },
  { path: "source", group: "source", control: "text-field", labelKey: "job.field.source" },
  { path: "reason", group: "source", control: "text-field", labelKey: "job.field.reason" },
  { path: "note", group: "source", control: "text-field", labelKey: "job.field.note" },
  { path: "dedupeKey", group: "source", control: "text-field", labelKey: "job.field.dedupeKey" },
  { path: "requiredOn", group: "requirements", control: "entity-combobox", labelKey: "job.field.requiredOn", multiple: true },
  { path: "requiredOff", group: "requirements", control: "entity-combobox", labelKey: "job.field.requiredOff", multiple: true },
];

function valuesOf(enumeration) {
  if (Array.isArray(enumeration)) return enumeration;
  if (enumeration && typeof enumeration === "object") return Object.values(enumeration);
  return [];
}

function option(texts, value, labelKeyPrefix, fallback = value) {
  return { value, label: text(texts, `${labelKeyPrefix}.${value}`, undefined, fallback) };
}

function modeOption(texts, value) {
  return { value, label: text(texts, `job.mode.${modeSuffix(value)}`, undefined, value) };
}

function policyOption(texts, value) {
  const suffix = value === "best_effort" ? "bestEffort" : value;
  return { value, label: text(texts, `policy.${suffix}`, undefined, value) };
}

function withNotSet(texts, options) {
  return [{ value: null, label: text(texts, "form.notSet", undefined, "—") }, ...options];
}

// Home Assistant knows every area; only the backend knows which ones a robot can reach.
// Without that knowledge the card offers all areas and says why.
function areaOptions(model, texts) {
  const areas = listOf(model.areas?.catalog);
  const asOption = (area) => ({ value: area.areaId, label: area.name, icon: area.icon });
  if (!hasCapability(model, "robotsRead")) {
    return {
      options: areas.map(asOption),
      hint: { key: "unavailable.capabilityMissing", vars: { capability: text(texts, "capability.robotsRead") } },
    };
  }
  const reachable = new Set(listOf(model.robots?.items).flatMap((robot) => listOf(robot.allowedAreaIds)));
  return { options: areas.filter((area) => reachable.has(area.areaId)).map(asOption), hint: null };
}

function entityOptions(model) {
  return listOf(model.entities).map((entity) => ({ value: entity.entityId, label: entity.name, state: entity.state }));
}

function optionsFor(field, model, texts) {
  if (field.path === "areas") return areaOptions(model, texts);
  if (field.path === "mode") return { options: valuesOf(CLEANING_MODES).map((value) => modeOption(texts, value)) };
  if (field.path === "vacuumPower" || field.path === "mopIntensity") {
    return { options: withNotSet(texts, valuesOf(SEMANTIC_LEVELS).map((value) => option(texts, value, "level"))) };
  }
  if (field.path === "mopRoute") {
    return { options: withNotSet(texts, valuesOf(MOP_ROUTES).map((value) => option(texts, value, "route"))) };
  }
  if (field.path === "settingsPolicy") {
    return { options: valuesOf(SETTINGS_POLICIES).map((value) => policyOption(texts, value)) };
  }
  if (field.path === "requiredOn" || field.path === "requiredOff") return { options: entityOptions(model), filterable: true };
  return { options: [] };
}

function errorFor(errors, path) {
  if (!errors) return null;
  if (errors[path]) return errors[path];
  const nested = Object.keys(errors).find((key) => key.startsWith(`${path}.`));
  return nested ? errors[nested] : null;
}

function backendErrorFor(error, path) {
  if (!error) return null;
  const explicit = error.field || error.path;
  if (explicit === path) return error.code || error.detail || "error.backend.unknown";
  const related = {
    job_requires_area: "areas",
    empty_target: "areas",
    invalid_cleaning_mode: "mode",
    invalid_pass_count: "passes",
    empty_name: "name",
    empty_source: "source",
    empty_reason: "reason",
    empty_note: "note",
    empty_dedupe_key: "dedupeKey",
    invalid_required_on: "requiredOn",
    invalid_required_off: "requiredOff",
  }[error.code];
  return related === path ? error.code : null;
}

function fieldErrorText(texts, code, path) {
  if (!code) return null;
  const key = {
    job_requires_area: "form.error.areas",
    empty_target: "form.error.required",
    duplicate_area: "form.error.areas",
    mixed_map_contexts: "form.error.areas",
    invalid_pass_count: "form.error.passes",
    empty_name: "form.error.text",
    empty_source: "form.error.text",
    empty_reason: "form.error.text",
    empty_note: "form.error.text",
    empty_dedupe_key: "form.error.text",
    invalid_required_on: "form.error.entities",
    invalid_required_off: "form.error.entities",
    contradictory_state_requirement: "form.error.entities",
    unsupported_cleaning_preference: "form.error.text",
  }[code];
  return key ? text(texts, key, undefined, code) : text(texts, "warning.commandFailed", { code, path }, code);
}

function draftValue(draft, path) {
  const value = pathValue(draft, path);
  return value === undefined ? null : value;
}

function buildField(field, { draft, errors, backendError, model, texts }) {
  const options = optionsFor(field, model, texts);
  const value = draftValue(draft, field.path);
  return {
    ...field,
    id: fieldId(field.path),
    name: field.path,
    label: text(texts, field.labelKey, undefined, field.path),
    optionalLabel: field.required ? null : text(texts, "form.optional", undefined, "optional"),
    value,
    options: options.options || [],
    filterable: options.filterable === true,
    hint: options.hint
      ? { text: text(texts, options.hint.key, options.hint.vars, options.hint.key) }
      : field.path === "settingsPolicy"
        ? { text: text(texts, "form.help.settingsPolicy", undefined, "") }
        : null,
    min: field.min,
    max: field.max,
    error: fieldErrorText(texts, errorFor(errors, field.path) || backendErrorFor(backendError, field.path), field.path),
    errorCode: errorFor(errors, field.path) || backendErrorFor(backendError, field.path),
    describedBy: `${fieldId(field.path)}-error`,
  };
}

export function buildEditorFormViewModel({ model = {}, texts, draft: suppliedDraft, job = null, mode = "create", options = {}, ui, backendError = null } = {}) {
  const draft = suppliedDraft || createDraft(job, options.defaults || {});
  const validation = validateDraft(draft);
  const isEdit = mode === "edit" || Boolean(job);
  const payload = isEdit ? draftToUpdatePatch(draft, job) : draftToCreatePayload(draft);
  const groups = EDITOR_GROUPS.map((group) => {
    const title = text(texts, group.titleKey, undefined, group.key);
    const fields = FIELD_DEFINITIONS
      .filter((field) => field.group === group.key)
      .map((field) => buildField(field, { draft, errors: validation.errors, backendError, model, texts }));
    // A group of one field would otherwise print its heading twice; the label stays for
    // assistive technology and only loses its box.
    if (fields.length === 1 && fields[0].label === title) fields[0].labelHidden = true;
    return { ...group, title, fields };
  });
  const backendBanner = backendError
    ? {
        code: backendError.code || "unknown",
        group: backendError.group || "unknown",
        detail: backendError.detail || "",
      }
    : null;
  const pending = listOf(model.commands?.pending).includes(isEdit && job ? `job:${job.jobId}` : "create");
  const dirty = Boolean(validation.dirty);
  const hasErrors = Object.keys(validation.errors).length > 0;
  return {
    key: "editor",
    mode: isEdit ? "edit" : "create",
    jobId: job?.jobId ?? null,
    title: text(texts, isEdit ? "action.edit" : "action.createJob", undefined, isEdit ? "Edit" : "Add job"),
    groups,
    draft,
    originalJob: job,
    errors: validation.errors,
    backendError: backendBanner,
    dirty,
    hasErrors,
    pending,
    saveEnabled: !pending && dirty && !hasErrors && model.permissions?.canCommand !== false,
    payload,
    ui,
  };
}
