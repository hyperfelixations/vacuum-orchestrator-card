import {
  PASS_MAX,
  PASS_MIN,
  canonicalizeMode,
  isMopRoute,
  isSemanticLevel,
  isSettingsPolicy,
} from "./job-schema.js";
const TEXT_FIELDS = ["name", "source", "reason", "note", "dedupeKey"];
const OPTIONAL_FIELDS = [
  "name",
  "vacuumPower",
  "mopIntensity",
  "mopRoute",
  "source",
  "reason",
  "note",
  "dedupeKey",
];

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = cloneValue(item);
    return copy;
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function freezeDraft(draft, metadata) {
  const copy = cloneValue(draft);
  Object.defineProperties(copy, {
    _baseline: { enumerable: false, value: cloneValue(metadata.baseline), writable: false },
    _jobId: { enumerable: false, value: metadata.jobId ?? null, writable: false },
    _revision: { enumerable: false, value: metadata.revision ?? null, writable: false },
  });
  return deepFreeze(copy);
}

function areaValue(value) {
  if (typeof value === "string") {
    return { areaId: value.trim(), mapContext: null };
  }
  if (!value || typeof value !== "object") return { areaId: "", mapContext: null };
  const { areaId, mapContext } = value;
  return {
    areaId: typeof areaId === "string" ? areaId.trim() : "",
    mapContext: mapContext === null || mapContext === undefined ? null : String(mapContext).trim(),
  };
}

function areaIds(draft) {
  return (Array.isArray(draft.areas) ? draft.areas : []).map((value) => areaValue(value).areaId);
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function canonicalSnapshot(draft) {
  const values = {};
  values.areas = areaIds(draft);
  values.mode = canonicalizeMode(draft.mode);
  values.name = draft.name ?? null;
  values.vacuumPower = draft.vacuumPower ?? null;
  values.mopIntensity = draft.mopIntensity ?? null;
  values.mopRoute = draft.mopRoute ?? null;
  values.passes = draft.passes;
  values.source = draft.source ?? null;
  values.reason = draft.reason ?? null;
  values.note = draft.note ?? null;
  values.dedupeKey = draft.dedupeKey ?? null;
  values.requiredOn = stringList(draft.requiredOn);
  values.requiredOff = stringList(draft.requiredOff);
  values.settingsPolicy = draft.settingsPolicy ?? "best_effort";
  return values;
}

function jobSnapshot(normalized) {
  if (!normalized) return null;
  return {
    areas: [...normalized.areas],
    mode: normalized.mode,
    name: normalized.name,
    vacuumPower: normalized.vacuumPower,
    mopIntensity: normalized.mopIntensity,
    mopRoute: normalized.mopRoute,
    passes: normalized.passes,
    source: normalized.source,
    reason: normalized.reason,
    note: normalized.note,
    dedupeKey: normalized.dedupeKey,
    requiredOn: [...normalized.requiredOn],
    requiredOff: [...normalized.requiredOff],
    settingsPolicy: normalized.settingsPolicy,
  };
}

function sameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index]));
  }
  return left === right;
}

function draftChanged(draft) {
  const baseline = draft._baseline;
  if (!baseline) return false;
  const current = canonicalSnapshot(draft);
  return Object.keys(current).some((key) => !sameValue(current[key], baseline[key]));
}

// `job` is an already normalized job (or null for a new one); the draft never sees wire data.
export function createDraft(job = null, defaults = {}) {
  const normalized = job && typeof job === "object" && job.jobId ? job : null;
  const source = normalized
    ? {
        areas: [...normalized.areas],
        mode: normalized.mode,
        name: normalized.name,
        vacuumPower: normalized.vacuumPower,
        mopIntensity: normalized.mopIntensity,
        mopRoute: normalized.mopRoute,
        passes: normalized.passes,
        source: normalized.source,
        reason: normalized.reason,
        note: normalized.note,
        dedupeKey: normalized.dedupeKey,
        requiredOn: [...normalized.requiredOn],
        requiredOff: [...normalized.requiredOff],
        settingsPolicy: normalized.settingsPolicy,
      }
    : {
        areas: [],
        mode: "vacuum",
        name: null,
        vacuumPower: null,
        mopIntensity: null,
        mopRoute: null,
        passes: 1,
        source: null,
        reason: null,
        note: null,
        dedupeKey: null,
        requiredOn: [],
        requiredOff: [],
        settingsPolicy: "best_effort",
      };
  const draft = { ...source };
  for (const [key, value] of Object.entries(defaults || {})) {
    if (value !== undefined) draft[key] = cloneValue(value);
  }
  return freezeDraft(draft, {
    baseline: normalized ? jobSnapshot(normalized) : canonicalSnapshot(draft),
    jobId: normalized?.jobId ?? null,
    revision: normalized?.revision ?? null,
  });
}

function setPath(root, path, value) {
  const parts = Array.isArray(path) ? path.map(String) : String(path).split(".");
  if (!parts.length || parts.some((part) => !part)) return root;
  const unsafe = new Set(["__proto__", "constructor", "prototype"]);
  if (parts.some((part) => unsafe.has(part))) return root;
  const result = cloneValue(root);
  let cursor = result;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = parts[index + 1];
    if (cursor[part] === undefined || cursor[part] === null) {
      cursor[part] = /^\d+$/.test(next) ? [] : {};
    }
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = cloneValue(value);
  return result;
}

export function applyDraftChange(draft, path, value) {
  if (!draft || typeof draft !== "object") return createDraft(null);
  const changed = setPath(draft, path, value);
  return freezeDraft(changed, {
    baseline: draft._baseline || canonicalSnapshot(draft),
    jobId: draft._jobId ?? null,
    revision: draft._revision ?? null,
  });
}

function setError(errors, path, code) {
  if (errors[path] === undefined) errors[path] = code;
}

function validText(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim());
}

function payloadFrom(draft, { includeNulls = false } = {}) {
  const snapshot = canonicalSnapshot(draft);
  const result = {
    areas: [...snapshot.areas],
    mode: snapshot.mode,
    passes: snapshot.passes,
    settings_policy: snapshot.settingsPolicy,
    required_on: [...snapshot.requiredOn],
    required_off: [...snapshot.requiredOff],
  };
  const mappings = [
    ["name", "name"],
    ["vacuumPower", "vacuum_power"],
    ["mopIntensity", "mop_intensity"],
    ["mopRoute", "mop_route"],
    ["source", "source"],
    ["reason", "reason"],
    ["note", "note"],
    ["dedupeKey", "dedupe_key"],
  ];
  for (const [key, wireKey] of mappings) {
    const value = snapshot[key];
    if (includeNulls || value !== null && value !== undefined) result[wireKey] = value;
  }
  return result;
}

export function draftToCreatePayload(draft) {
  return Object.freeze(payloadFrom(draft));
}

export function validateDraft(draft) {
  const value = draft && typeof draft === "object" ? draft : createDraft(null);
  const errors = {};
  const areas = Array.isArray(value.areas) ? value.areas : [];
  const normalizedAreas = areas.map(areaValue);
  if (!normalizedAreas.length) setError(errors, "areas", "job_requires_area");
  const seenAreas = new Set();
  for (let index = 0; index < normalizedAreas.length; index += 1) {
    const area = normalizedAreas[index];
    if (!area.areaId) setError(errors, `areas.${index}`, "empty_target");
    else if (seenAreas.has(area.areaId)) setError(errors, `areas.${index}`, "duplicate_area");
    seenAreas.add(area.areaId);
    if (area.mapContext === "") setError(errors, `areas.${index}`, "empty_map_context");
  }
  const contexts = normalizedAreas.map((area) => area.mapContext);
  if (new Set(contexts).size > 1) setError(errors, "areas", "mixed_map_contexts");

  const mode = canonicalizeMode(value.mode);
  if (!mode) setError(errors, "mode", "invalid_cleaning_mode");
  if (!Number.isInteger(value.passes) || value.passes < PASS_MIN || value.passes > PASS_MAX) {
    setError(errors, "passes", "invalid_pass_count");
  }

  for (const field of TEXT_FIELDS) {
    if (!validText(value[field])) setError(errors, field, `empty_${field === "dedupeKey" ? "dedupe_key" : field}`);
  }
  if (value.vacuumPower !== null && value.vacuumPower !== undefined && !isSemanticLevel(value.vacuumPower)) {
    setError(errors, "vacuumPower", "unsupported_cleaning_preference");
  }
  if (value.mopIntensity !== null && value.mopIntensity !== undefined && !isSemanticLevel(value.mopIntensity)) {
    setError(errors, "mopIntensity", "unsupported_cleaning_preference");
  }
  if (value.mopRoute !== null && value.mopRoute !== undefined && !isMopRoute(value.mopRoute)) {
    setError(errors, "mopRoute", "unsupported_cleaning_preference");
  }
  if (!isSettingsPolicy(value.settingsPolicy)) setError(errors, "settingsPolicy", "unsupported_cleaning_preference");

  const requiredOn = Array.isArray(value.requiredOn) ? value.requiredOn : [];
  const requiredOff = Array.isArray(value.requiredOff) ? value.requiredOff : [];
  const normalizedOn = stringList(requiredOn);
  const normalizedOff = stringList(requiredOff);
  if (normalizedOn.length !== requiredOn.length || new Set(normalizedOn).size !== normalizedOn.length) {
    setError(errors, "requiredOn", "invalid_required_on");
  }
  if (normalizedOff.length !== requiredOff.length || new Set(normalizedOff).size !== normalizedOff.length) {
    setError(errors, "requiredOff", "invalid_required_off");
  }
  if (normalizedOn.some((item) => normalizedOff.includes(item))) {
    setError(errors, "requiredOn", "contradictory_state_requirement");
    setError(errors, "requiredOff", "contradictory_state_requirement");
  }

  const valid = Object.keys(errors).length === 0;
  const payload = valid ? payloadFrom(value) : null;
  return Object.freeze({
    errors: Object.freeze({ ...errors }),
    dirty: draftChanged(value),
    payload,
    valid,
  });
}

function canonicalField(draft, key) {
  if (key === "areas") return areaIds({ areas: draft?.areas || [] });
  if (key === "mode") return canonicalizeMode(draft?.mode);
  if (key === "requiredOn" || key === "requiredOff") return stringList(draft?.[key]);
  return draft?.[key] ?? null;
}

// Only fields that actually differ from the stored job travel to `update_job`.
export function draftToUpdatePatch(draft, job) {
  const normalized = job && typeof job === "object" && job.jobId ? job : null;
  if (!normalized) return Object.freeze({});
  const current = {
    areas: [...normalized.areas],
    mode: normalized.mode,
    name: normalized.name,
    vacuumPower: normalized.vacuumPower,
    mopIntensity: normalized.mopIntensity,
    mopRoute: normalized.mopRoute,
    passes: normalized.passes,
    source: normalized.source,
    reason: normalized.reason,
    note: normalized.note,
    dedupeKey: normalized.dedupeKey,
    requiredOn: [...normalized.requiredOn],
    requiredOff: [...normalized.requiredOff],
    settingsPolicy: normalized.settingsPolicy,
  };
  const wireNames = {
    areas: "areas",
    mode: "mode",
    name: "name",
    vacuumPower: "vacuum_power",
    mopIntensity: "mop_intensity",
    mopRoute: "mop_route",
    passes: "passes",
    source: "source",
    reason: "reason",
    note: "note",
    dedupeKey: "dedupe_key",
    requiredOn: "required_on",
    requiredOff: "required_off",
    settingsPolicy: "settings_policy",
  };
  const patch = {};
  for (const key of Object.keys(wireNames)) {
    const next = canonicalField(draft, key);
    if (!sameValue(next, current[key])) patch[wireNames[key]] = Array.isArray(next) ? [...next] : next;
  }
  return Object.freeze(patch);
}

export { TEXT_FIELDS, OPTIONAL_FIELDS };
