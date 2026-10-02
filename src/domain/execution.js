// The integration's read-only execution explanation for one job: per planned operation and
// robot, readiness and eligibility; per attempt, its state and outcome. The query uses the
// dispatcher's own rules; a later command check stays authoritative.

import { isAttemptState, isCompletionQuality, isOperation } from "./job-schema.js";
import { normalizeReadiness } from "./readiness.js";
import { enumerated, isRecord, records, strings, text } from "./wire-values.js";

function robotExplanation(wire) {
  const robotId = text(wire.robot_id);
  if (!robotId) return null;
  return Object.freeze({
    robotId,
    operation: enumerated(wire.operation, isOperation),
    readiness: normalizeReadiness(wire.readiness),
    eligible: wire.eligible === true,
    eligibilityReason: text(wire.eligibility_reason),
    appliedPreferences: strings(wire.applied_preferences),
    omittedPreferences: strings(wire.omitted_preferences),
  });
}

function attempt(wire) {
  const attemptId = text(wire.attempt_id);
  if (!attemptId) return null;
  return Object.freeze({
    attemptId,
    workUnitId: text(wire.work_unit_id),
    robotId: text(wire.robot_id),
    state: enumerated(wire.state, isAttemptState) ?? "unknown",
    quality: enumerated(wire.quality, isCompletionQuality),
    failureCode: text(wire.failure_code),
    appliedPreferences: strings(wire.applied_preferences),
    omittedPreferences: strings(wire.omitted_preferences),
  });
}

export function normalizeExecution(wire) {
  if (!isRecord(wire)) return null;
  const jobId = text(wire.job_id);
  if (!jobId) return null;
  return Object.freeze({
    jobId,
    robots: Object.freeze(records(wire.robots).map(robotExplanation).filter(Boolean)),
    attempts: Object.freeze(records(wire.attempts).map(attempt).filter(Boolean)),
  });
}

// Explanations grouped by planned operation, in plan order of first appearance.
export function explanationsByOperation(execution) {
  const groups = new Map();
  for (const item of execution?.robots || []) {
    const key = item.operation ?? "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Object.freeze([...groups].map(([operation, robots]) => Object.freeze({ operation, robots: Object.freeze(robots), eligible: robots.some((robot) => robot.eligible) })));
}
