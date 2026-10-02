// Volatile runtime trace records and the anonymized diagnostics summary. Unknown events and
// additional fields are tolerated; the trace sequence is neither a commit nor a runtime
// sequence.

import { finite, instant, integer, isRecord, records, text } from "./wire-values.js";

const DETAIL_FIELDS = Object.freeze(["job_id", "attempt_id", "robot_id", "room_id", "run_id", "work_unit_id", "command", "stage", "operation", "state", "reason", "quality", "exception_type"]);

function traceRecord(wire) {
  const sequence = integer(wire.sequence);
  const event = text(wire.event);
  if (sequence === null || !event) return null;
  const details = {};
  for (const field of DETAIL_FIELDS) {
    const value = text(wire[field]);
    if (value !== null) details[field] = value;
  }
  return Object.freeze({ sequence, timestamp: instant(wire.timestamp), event, details: Object.freeze(details) });
}

export function normalizeTracePage(wire) {
  if (!isRecord(wire)) return null;
  return Object.freeze({
    runtimeId: text(wire.runtime_id),
    traceSequence: integer(wire.trace_sequence),
    total: integer(wire.total) ?? 0,
    records: Object.freeze(records(wire.records).map(traceRecord).filter(Boolean)),
  });
}

export function normalizeDiagnosticsSummary(wire) {
  if (!isRecord(wire)) return null;
  const traceWindow = isRecord(wire.trace_window) ? wire.trace_window : {};
  const totals = isRecord(wire.totals) ? wire.totals : {};
  return Object.freeze({
    version: text(wire.version),
    apiVersion: integer(wire.api_version),
    storeVersion: integer(wire.store_version),
    runtimeId: text(wire.runtime_id),
    commitId: integer(wire.commit_id),
    runtimeSequence: integer(wire.runtime_sequence),
    sinkFailures: integer(wire.sink_failures),
    traceWindow: Object.freeze({ recorded: finite(traceWindow.recorded), retained: finite(traceWindow.retained), dropped: finite(traceWindow.dropped) }),
    totals: Object.freeze({ jobs: integer(totals.jobs), rooms: integer(totals.rooms) }),
  });
}
