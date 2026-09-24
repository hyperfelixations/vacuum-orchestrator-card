// Stable backend error groups; presentation translates message keys elsewhere.

const GROUPS = {
  validation: [
    "job_requires_area",
    "duplicate_area",
    "mixed_map_contexts",
    "invalid_pass_count",
    "invalid_cleaning_mode",
    "contradictory_state_requirement",
    "empty_job_update",
    "empty_target",
    "empty_map_context",
    "empty_name",
    "empty_source",
    "empty_reason",
    "empty_note",
    "empty_dedupe_key",
    "invalid_required_on",
    "invalid_required_off",
  ],
  conflict: [
    "unknown_job",
    "dedupe_key_already_queued",
    "job_not_editable",
    "job_not_deletable",
    "job_not_movable",
    "job_not_startable",
    "job_not_cancellable",
    "job_not_retryable",
    "job_not_dispatchable",
    "duplicate_queue_job",
  ],
  capability: [
    "unsupported_operation",
    "unsupported_pass_count",
    "unsupported_pass_scope",
    "unsupported_cleaning_preference",
    "unsupported_map_context",
    "unsupported_cancel_semantics",
    "unmapped_target",
    "capabilities_changed_before_dispatch",
  ],
  robot: [
    "no_robot_configured",
    "unknown_robot",
    "robot_needs_attention",
    "robot_already_executing",
    "robot_availability_unknown",
    "target_overlap_active",
    "source_robot_already_leased",
  ],
  storage: [
    "critical_storage_state_uncertain",
    "critical_storage_unreadable",
    "snapshot_digest_mismatch",
    "critical_commit_readback_mismatch",
    "non_monotonic_commit",
  ],
  connection: [
    "orchestrator_not_loaded",
    "orchestrator_not_initialized",
    "multiple_orchestrator_entries_loaded",
    "unknown_command",
  ],
  auth: ["unauthorized"],
  // Refusals the card decides itself, before a request leaves the browser.
  client: ["capability_missing", "command_pending", "invalid_response", "timeout"],
  unknown: [],
};

export const ERROR_GROUPS = Object.freeze(
  Object.fromEntries(
    Object.entries(GROUPS).map(([group, codes]) => [group, Object.freeze([...codes])])
  )
);

const CODE_TO_GROUP = new Map();
for (const [group, codes] of Object.entries(GROUPS)) {
  for (const code of codes) CODE_TO_GROUP.set(code, group);
}

const knownMessageKeys = {};
for (const code of CODE_TO_GROUP.keys()) {
  knownMessageKeys[code] = `error.backend.${code}`;
}
knownMessageKeys.unknown = "error.backend.unknown";
knownMessageKeys.timeout = "error.backend.timeout";
knownMessageKeys.invalid_response = "error.backend.invalid_response";
knownMessageKeys.capability_missing = "unavailable.capabilityMissing";
knownMessageKeys.command_pending = "hint.commandPending";
export const BACKEND_ERROR_MESSAGE_KEYS = Object.freeze(knownMessageKeys);

export function classifyBackendError(code) {
  const normalized = typeof code === "string" && code.trim() ? code.trim() : "unknown";
  const group = CODE_TO_GROUP.get(normalized) || "unknown";
  return Object.freeze({
    group,
    messageKey: BACKEND_ERROR_MESSAGE_KEYS[normalized] || "error.backend.unknown",
  });
}

export class BackendError extends Error {
  constructor(code = "unknown", detail = null, options = {}) {
    const normalizedCode = typeof code === "string" && code.trim() ? code.trim() : "unknown";
    const classification = classifyBackendError(normalizedCode);
    const detailText = detail === null || detail === undefined ? null : String(detail);
    super(detailText ? `${normalizedCode}: ${detailText}` : normalizedCode);
    this.name = "BackendError";
    this.code = normalizedCode;
    this.group = classification.group;
    this.messageKey = classification.messageKey;
    this.detail = detailText;
    this.ok = false;
    this.data = null;
    if (options && options.cause !== undefined) this.cause = options.cause;
    if (options && options.rawCode !== undefined) this.rawCode = options.rawCode;
  }
}

export function isBackendError(value) {
  return value instanceof BackendError || Boolean(value && value.name === "BackendError");
}

export function toBackendError(value, fallbackCode = "unknown") {
  if (isBackendError(value)) return value;
  if (value && typeof value === "object") {
    const record = value;
    const code = record.code || record.error_code || record.errorCode || record.type;
    const detail = record.detail || record.message || record.error || null;
    if (typeof code === "string" && code.trim()) {
      return new BackendError(code, detail, { cause: value, rawCode: code });
    }
  }
  if (typeof value === "string" && value.trim()) {
    return new BackendError(fallbackCode, value, { cause: value });
  }
  const detail = value && value.message ? value.message : null;
  return new BackendError(fallbackCode, detail, { cause: value });
}
