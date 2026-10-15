// The pending-queue page and the queue run as the integration reports them. Positions follow
// from the page offset; the integration owns the order and names the run's phase. See internal
// dev doc §7 "Queue".

import { normalizeActions } from "./availability.js";
import { isAttentionKind, isOperation, isQueueMode, isRunPhase } from "./job-schema.js";
import { normalizeJob } from "./job.js";
import { normalizeJobDefaults } from "./settings.js";
import { bool, finite, instant, integer, isRecord, records, strings, text } from "./wire-values.js";

function queueRun(wire) {
  if (!isRecord(wire)) return null;
  const runId = text(wire.run_id);
  if (!runId) return null;
  return Object.freeze({
    runId,
    // `off`, `active`, `standby` (waits for work until `endsAt`), `paused` or `ending`.
    phase: isRunPhase(wire.phase) ? wire.phase : "off",
    endsAt: instant(wire.ends_at),
    startedAt: instant(wire.started_at),
    completedAt: instant(wire.completed_at),
  });
}

// `robot_id` may name a removed profile, a source identity or `legacy:unscoped`; recovery
// must send it back unchanged.
function recoveryTarget(wire) {
  const robotId = text(wire.robot_id);
  return robotId ? Object.freeze({ robotId, reason: text(wire.reason) }) : null;
}

// Something at a robot or a job needs someone now; `failsAt` while a job waits for the fix.
function attention(wire) {
  if (!isAttentionKind(wire.kind)) return null;
  return Object.freeze({
    kind: wire.kind,
    robotId: text(wire.robot_id),
    jobId: text(wire.job_id),
    codes: strings(wire.codes),
    operations: Object.freeze(strings(wire.operations).filter(isOperation)),
    since: instant(wire.since),
    failsAt: instant(wire.fails_at),
  });
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
    serverTime: instant(wire.server_time),
    queueRevision: integer(wire.queue_revision),
    needsAttention: bool(wire.needs_attention) === true,
    attention: Object.freeze(records(wire.attention).map(attention).filter(Boolean)),
    recoveryTargets: Object.freeze(records(wire.recovery_targets).map(recoveryTarget).filter(Boolean)),
    graceSeconds: finite(wire.queue_grace_seconds),
    startDelaySeconds: finite(wire.start_delay_seconds),
    jobDefaults: normalizeJobDefaults(wire.job_defaults),
    run: queueRun(wire.queue_run),
    actions: normalizeActions(wire.actions),
    total: Math.max(0, integer(wire.total) ?? jobs.length),
    offset,
    limit: Math.max(1, integer(wire.limit) ?? 50),
    jobs: Object.freeze(jobs),
  });
}

// The run's phase as the integration names it; `off` without a run.
export function queueRunPhase(run) {
  return run?.phase ?? "off";
}
