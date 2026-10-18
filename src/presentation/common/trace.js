// Trace records as rows: time, the event's name and its details in words. An event this card
// does not know keeps the integration's name.

import { isAttemptState, isJobState, SETTING_FIELDS, SETTING_WIRE_NAMES } from "../../domain/job-schema.js";
import { findJob, jobTitle, list, robotName, roomIndex, roomName } from "./lookups.js";
import { attemptStateLabel, dayOf, jobStateLabel, queueModeLabel, reasonText, secondOf, settingName, t } from "./texts.js";

// The integration's trace vocabulary the card words (UI-04): the commands it traces, the stages of
// its records and the availability it observes of a robot.
export const TRACE_COMMANDS = Object.freeze(new Set([
  "create_job", "update_job", "delete_job", "move_job", "start_job", "run_queue", "pause_queue", "resume_queue", "end_queue", "cancel_job", "return_robot", "retry_job", "correct_job",
  "configure_queue", "configure_job_defaults", "save_template", "save_job_as_template", "remove_template", "create_job_from_template", "reset_template_demand",
  "create_room", "update_room", "disable_room", "enable_room", "release_room", "revoke_room", "add_robot", "configure_robot", "remove_robot", "rename_robot", "resolve_recovery",
  "complete_setup", "hold_job", "renew_job_hold", "release_job_hold", "release_rooms", "revoke_rooms",
]));
export const TRACE_STAGES = Object.freeze(new Set([
  "received", "returned", "rejected", "failed", "loading", "loaded", "committing", "committed", "starting", "ready", "closing", "closed",
  "completed", "paused", "idle", "started", "waiting", "resumed", "idle_reset", "unchanged", "requested", "confirmed", "timeout", "omitted",
  "selected", "stale", "return", "abandoned",
]));
export const TRACE_ROBOT_STATES = Object.freeze(new Set(["available", "busy", "unavailable", "unknown", "online", "offline"]));
// Reasons the integration records only in its trace, worded by the card; every other reason is an
// integration code the integration words.
export const TRACE_REASONS = Object.freeze(new Set([
  "job_prerequisites", "verified_stopped", "operator_assumed_stopped", "stopped", "returning",
  "entity_missing", "status_unusable", "cleaning_continues", "observation_failed",
]));
const SETTING_BY_WIRE = Object.freeze({ cleaning_mode: "mode", ...Object.fromEntries(SETTING_FIELDS.map((field) => [SETTING_WIRE_NAMES[field], field])) });
const ROBOT_EVENTS = new Set(["robot_observation", "availability"]);
const VACUUM_STATES = new Set(["cleaning", "docked", "returning", "idle", "paused", "error", "unavailable"]);

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
  if (event === "queue_run") return queueModeLabel(texts, state);
  if (ROBOT_EVENTS.has(event) && TRACE_ROBOT_STATES.has(state)) return t(texts, `trace.robotState.${state}`);
  return state;
}

// A robot's status as its vendor reports it: Home Assistant's vacuum state in words, any other
// status written out as reported.
function vendorStatus(texts, code) {
  if (VACUUM_STATES.has(code)) return t(texts, `vacuum.state.${code}`);
  if (TRACE_REASONS.has(code)) return t(texts, `trace.reason.${code}`);
  const text = String(code).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function traceReason(texts, event, code) {
  if (event === "setting" && SETTING_BY_WIRE[code]) return settingName(texts, SETTING_BY_WIRE[code]);
  if (ROBOT_EVENTS.has(event)) return vendorStatus(texts, code);
  return TRACE_REASONS.has(code) ? t(texts, `trace.reason.${code}`) : reasonText(texts, code);
}

const known = (texts, set, prefix, value) => (value && set.has(value) ? t(texts, `${prefix}.${value}`) : value);

// `withJob`: name the job a record belongs to, for traces that are not already one job's.
export function traceRows(records, { model, texts, limit = Infinity, withJob = false }) {
  const index = roomIndex(model);
  const rows = list(records)
    .map((record) => {
      const details = record.details;
      const job = withJob && details.job_id ? findJob(model, details.job_id) : null;
      return {
        key: String(record.sequence),
        day: dayOf(texts, record.timestamp),
        time: secondOf(texts, record.timestamp),
        event: eventLabel(texts, record.event),
        // A job that may not start yet is no fault; only an internal error is (UI-20).
        tone: record.event === "internal_error" ? "attention" : "neutral",
        detail: [
          withJob && details.job_id ? (job ? jobTitle(job, index, model) : details.job_id) : null,
          known(texts, TRACE_COMMANDS, "trace.command", details.command),
          stateText(texts, record.event, details.state),
          details.reason && traceReason(texts, record.event, details.reason),
          details.robot_id && robotName(details.robot_id, model),
          details.room_id && roomName(details.room_id, index, model),
          known(texts, TRACE_STAGES, "trace.stage", details.stage),
          details.exception_type,
        ].filter(Boolean).join(" · "),
      };
    });
  // The same entry within the shown second is counted wherever it stands (a dispatcher cycles
  // through the waiting jobs), and so is a run of it on one day; a row keeps its newest time.
  const merged = [];
  const bySecond = new Map();
  for (const row of rows) {
    const entry = `${row.day}|${row.event}|${row.detail}|${row.tone}`;
    const same = bySecond.get(`${row.time}|${entry}`);
    const last = merged.at(-1);
    if (same) same.count += 1;
    else if (last && `${last.day}|${last.event}|${last.detail}|${last.tone}` === entry) last.count += 1;
    else {
      const kept = { ...row, count: 1 };
      merged.push(kept);
      bySecond.set(`${row.time}|${entry}`, kept);
    }
  }
  return merged.slice(0, limit);
}
