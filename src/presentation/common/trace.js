// Trace records as rows: time, the event's name and its details in words. An event this card
// does not know keeps the integration's name.

import { isAttemptState, isJobState } from "../../domain/job-schema.js";
import { findJob, jobTitle, list, robotName, roomIndex, roomName } from "./lookups.js";
import { attemptStateLabel, dateTime, jobStateLabel, reasonText, t } from "./texts.js";

function eventLabel(texts, event) {
  const key = `trace.event.${event}`;
  const label = t(texts, key);
  return label === key ? event : label;
}

// Job and attempt states in words; other states keep the integration's value.
function stateText(texts, event, state) {
  if (!state) return null;
  if (event === "job_transition" && isJobState(state)) return jobStateLabel(texts, state);
  if (event === "attempt_transition" && isAttemptState(state)) return attemptStateLabel(texts, state);
  // A job not started yet: its reason says why, its readiness state adds nothing.
  if (event === "dispatch_blocked") return null;
  return state;
}

// Reasons the integration records only in its trace, worded by the card (UI-04).
const TRACE_REASONS = new Set(["job_prerequisites"]);
const traceReason = (texts, code) => (TRACE_REASONS.has(code) ? t(texts, `trace.reason.${code}`) : reasonText(texts, code));

// `withJob`: name the job a record belongs to, for traces that are not already one job's.
export function traceRows(records, { model, texts, limit = Infinity, withJob = false }) {
  const index = roomIndex(model);
  const rows = list(records)
    .map((record) => {
      const details = record.details;
      const job = withJob && details.job_id ? findJob(model, details.job_id) : null;
      return {
        key: String(record.sequence),
        time: dateTime(texts, record.timestamp),
        event: eventLabel(texts, record.event),
        // A job that may not start yet is no fault; only an internal error is (UI-20).
        tone: record.event === "internal_error" ? "attention" : "neutral",
        detail: [
          withJob && details.job_id ? (job ? jobTitle(job, index, model) : details.job_id) : null,
          stateText(texts, record.event, details.state),
          details.reason && traceReason(texts, details.reason),
          details.robot_id && robotName(details.robot_id, model),
          details.room_id && roomName(details.room_id, index, model),
          details.command,
          details.stage,
          details.exception_type,
        ].filter(Boolean).join(" · "),
      };
    });
  // The same entry again at the shown time is counted rather than repeated.
  const shown = new Map();
  for (const row of rows) {
    const same = `${row.time}|${row.event}|${row.detail}`;
    if (shown.has(same)) shown.get(same).count += 1;
    else shown.set(same, { ...row, count: 1 });
  }
  return [...shown.values()].slice(0, limit);
}
