// The integration's diagnostic entities, used only as a low-latency status supplement.
// They are pushed by Home Assistant and therefore arrive before a query round trip; every
// detail still comes from the query API. See internal dev doc §6 "Entity-Statusvorlauf".
//
// The entity registry (`hass.entities`) carries the platform; the state machine
// (`hass.states`) carries the value. Both reads are needed.

const KEY_BY_SUFFIX = Object.freeze({
  queue_mode: "queueMode",
  queue_length: "queueLength",
  active_jobs: "activeJobs",
  jobs_needing_attention: "attentionJobs",
  attention_jobs: "attentionJobs",
  needs_attention: "needsAttention",
});

const EMPTY = Object.freeze({
  available: false,
  queueMode: null,
  queueLength: null,
  activeJobs: null,
  attentionJobs: null,
  needsAttention: null,
});

function registryEntries(hass) {
  const value = hass?.entities;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

// `sensor.vacuum_orchestrator_queue_mode` -> `queue_mode`. Falls back to the unique id so a
// renamed entity id keeps working.
function suffixOf(entry) {
  const id = typeof entry?.entity_id === "string" ? entry.entity_id : "";
  const objectId = id.includes(".") ? id.slice(id.indexOf(".") + 1) : id;
  return objectId.replace(/^vacuum_orchestrator_/, "");
}

function numberOf(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function findEntityStatus(hass) {
  const states = hass?.states;
  if (!states || typeof states !== "object") return EMPTY;
  const result = { ...EMPTY };
  let available = false;
  for (const entry of registryEntries(hass)) {
    if (entry?.platform !== "vacuum_orchestrator") continue;
    const key = KEY_BY_SUFFIX[suffixOf(entry)];
    if (!key) continue;
    const state = states[entry.entity_id]?.state;
    if (state === undefined || state === null || state === "unknown" || state === "unavailable") continue;
    available = true;
    if (key === "queueMode") result.queueMode = String(state);
    else if (key === "needsAttention") result.needsAttention = state === "on";
    else result[key] = numberOf(state);
  }
  return Object.freeze({ ...result, available });
}
