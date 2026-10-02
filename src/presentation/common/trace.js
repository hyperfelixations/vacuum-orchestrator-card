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
  return state;
}

// `withJob`: name the job a record belongs to, for traces that are not already one job's.
export function traceRows(records, { model, texts, limit = Infinity, withJob = false }) {
  const index = roomIndex(model);
  return list(records)
    .slice(0, limit)
    .map((record) => {
      const details = record.details;
      const job = withJob && details.job_id ? findJob(model, details.job_id) : null;
      return {
        key: String(record.sequence),
        time: dateTime(texts, record.timestamp),
        event: eventLabel(texts, record.event),
        tone: record.event === "internal_error" || record.event === "dispatch_blocked" ? "attention" : "neutral",
        detail: [
          withJob && details.job_id ? (job ? jobTitle(job, index, model) : details.job_id) : null,
          stateText(texts, record.event, details.state),
          details.reason && reasonText(texts, details.reason),
          details.robot_id && robotName(details.robot_id, model),
          details.room_id && roomName(details.room_id, index, model),
          details.command,
          details.stage,
          details.exception_type,
        ].filter(Boolean).join(" · "),
      };
    });
}
