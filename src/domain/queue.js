// The pending-queue page and the queue run as the integration reports them. Positions follow
// from the page offset; the integration owns the order. See internal dev doc §7 "Queue".

import { isQueueMode } from "./job-schema.js";
import { normalizeJob } from "./job.js";
import { bool, finite, instant, integer, isRecord, records, text } from "./wire-values.js";

function queueRun(wire) {
  if (!isRecord(wire)) return null;
  const runId = text(wire.run_id);
  if (!runId) return null;
  return Object.freeze({
    runId,
    startedAt: instant(wire.started_at),
    active: wire.active === true,
    idleSince: instant(wire.idle_since),
    deadline: instant(wire.deadline),
    completedAt: instant(wire.completed_at),
  });
}

// `robot_id` may name a removed profile, a source identity or `legacy:unscoped`; recovery
// must send it back unchanged.
function recoveryTarget(wire) {
  const robotId = text(wire.robot_id);
  return robotId ? Object.freeze({ robotId, reason: text(wire.reason) }) : null;
}

export function normalizeQueuePage(wire) {
  if (!isRecord(wire)) return null;
  const offset = Math.max(0, integer(wire.offset) ?? 0);
  const jobs = records(wire.jobs)
    .map(normalizeJob)
    .filter(Boolean)
    .map((job, index) => Object.freeze({ ...job, position: offset + index + 1 }));
  return Object.freeze({
    mode: isQueueMode(wire.mode) ? wire.mode : "idle",
    integrationVersion: text(wire.integration_version),
    activeCount: integer(wire.active_count),
    attentionCount: integer(wire.attention_count),
    commitId: integer(wire.commit_id),
    runtimeId: text(wire.runtime_id),
    runtimeSequence: integer(wire.runtime_sequence),
    queueRevision: integer(wire.queue_revision),
    needsAttention: bool(wire.needs_attention) === true,
    recoveryTargets: Object.freeze(records(wire.recovery_targets).map(recoveryTarget).filter(Boolean)),
    graceSeconds: finite(wire.queue_grace_seconds),
    run: queueRun(wire.queue_run),
    total: Math.max(0, integer(wire.total) ?? jobs.length),
    offset,
    limit: Math.max(1, integer(wire.limit) ?? 50),
    jobs: Object.freeze(jobs),
  });
}

// A run is live while the integration says so; its deadline only exists during the quiet
// period. The phase is read, never computed.
export function queueRunPhase(run) {
  if (!run) return "none";
  if (!run.active) return "finished";
  return run.deadline !== null ? "winding_down" : "active";
}
