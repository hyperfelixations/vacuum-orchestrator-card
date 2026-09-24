// Shared pure helpers for section view models. They read the frozen CardDomainModel and
// format only through the text port; they never touch the browser or a wire record.

export function listOf(value) {
  return Array.isArray(value) ? value : [];
}

export function text(texts, key, vars, fallback = key) {
  return texts && typeof texts.t === "function" ? texts.t(key, vars) : fallback;
}

export function number(texts, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return texts && typeof texts.formatNumber === "function" ? texts.formatNumber(Number(value), 0) : String(value);
}

export function dateTime(texts, value) {
  if (value === null || value === undefined) return "—";
  return texts && typeof texts.formatDateTime === "function" ? texts.formatDateTime(value) : String(value);
}

export function relative(texts, value, nowMs) {
  if (value === null || value === undefined || !Number.isFinite(nowMs)) return dateTime(texts, value);
  return texts && typeof texts.formatRelative === "function" ? texts.formatRelative(nowMs, value) : String(value);
}

export function duration(texts, value) {
  if (value === null || value === undefined) return "—";
  return texts && typeof texts.formatDuration === "function" ? texts.formatDuration(value) : String(value);
}

// `auto` prefers the relative form, which is what a queue is usually read for; `absolute`
// always shows the timestamp. Both need the current time, which the caller supplies.
export function displayTime(texts, value, format, nowMs) {
  return format === "absolute" ? dateTime(texts, value) : relative(texts, value, nowMs);
}

export function fieldId(path) {
  return `voc-field-${String(path || "field").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export function pathValue(object, path) {
  if (!path) return object;
  return String(path)
    .split(".")
    .reduce((current, part) => (current === null || current === undefined ? undefined : current[part]), object);
}

export function areaMap(model) {
  const map = new Map();
  for (const area of listOf(model?.areas?.catalog)) map.set(area.areaId, area);
  for (const status of listOf(model?.areas?.items)) {
    map.set(status.areaId, { ...(map.get(status.areaId) || { areaId: status.areaId, name: status.areaId }), status });
  }
  return map;
}

export function areaLabel(areaId, byId) {
  return byId?.get?.(areaId)?.name || areaId || "";
}

// One job lookup for every surface that has only an id in hand.
export function findJob(model, jobId) {
  if (!jobId) return null;
  const branches = [model?.active?.jobs, model?.queue?.pending, model?.history?.jobs, model?.attention?.jobs];
  for (const branch of branches) {
    const found = listOf(branch).find((job) => job.jobId === jobId);
    if (found) return found;
  }
  return null;
}

// What a job is called: its name, else the rooms it cleans, else its id.
export function jobLabel(job, areasById) {
  if (!job) return "";
  return job.name || listOf(job.areas).map((areaId) => areaLabel(areaId, areasById)).join(", ") || job.jobId;
}

export function entityMap(model) {
  return new Map(listOf(model?.entities).map((entity) => [entity.entityId, entity]));
}

export function entityLabel(entityId, byId) {
  return byId?.get?.(entityId)?.name || entityId || "";
}

export function stateLabel(texts, state) {
  const suffix = state === "needs_attention" ? "needsAttention" : state;
  return text(texts, `job.state.${suffix}`, undefined, state || "—");
}

const MODE_SUFFIX = Object.freeze({ vacuum_and_mop: "vacuumAndMop", vacuum_then_mop: "vacuumThenMop" });

export function modeSuffix(mode) {
  return MODE_SUFFIX[mode] || mode;
}

export function modeLabel(texts, mode) {
  return text(texts, `job.mode.${modeSuffix(mode)}`, undefined, mode || "—");
}

export function modeShortLabel(texts, mode) {
  return text(texts, `job.mode.short.${modeSuffix(mode)}`, undefined, mode || "—");
}

export function readinessLabel(texts, state) {
  return text(texts, `job.readiness.${state}`, undefined, state || "—");
}

export function hasCapability(model, key) {
  return model?.capabilities?.[key] === true;
}

export function commandPending(model, target) {
  return listOf(model?.commands?.pending).includes(target);
}

export function pendingTargets(model) {
  return new Set(listOf(model?.commands?.pending));
}

export function terminal(job) {
  return ["completed", "failed", "cancelled"].includes(job?.state);
}

export function active(job) {
  return ["dispatching", "running", "canceling"].includes(job?.state);
}
