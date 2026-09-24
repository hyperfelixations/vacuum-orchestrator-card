// One queue page plus one registry page become the ordered model the sections read.
// Positions are derived from the page offset and never stored on the backend side.

import { isActiveState, isQueueMode, isTerminalState } from "./job-schema.js";
import { normalizeJob } from "./job.js";

function integer(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function pageJobs(page) {
  if (!page || typeof page !== "object" || !Array.isArray(page.jobs)) return [];
  return page.jobs.map(normalizeJob).filter(Boolean);
}

const EMPTY_PAGE = Object.freeze({ available: false, total: 0, offset: 0, limit: 0 });

export function buildQueueModel({ queuePage = null, registryPage = null } = {}) {
  const queueAvailable = Boolean(queuePage && typeof queuePage === "object");
  const registryAvailable = Boolean(registryPage && typeof registryPage === "object");
  const offset = Math.max(0, integer(queuePage?.offset, 0));
  const limit = Math.max(0, integer(queuePage?.limit, 0));
  const registry = pageJobs(registryPage);
  return Object.freeze({
    available: queueAvailable,
    mode: isQueueMode(queuePage?.mode) ? queuePage.mode : "idle",
    revision: integer(queuePage?.queue_revision, 0),
    commitId: integer(queuePage?.commit_id, null),
    needsAttention: queuePage?.needs_attention === true,
    total: Math.max(0, integer(queuePage?.total, 0)),
    offset,
    limit,
    pending: Object.freeze(
      pageJobs(queuePage).map((job, index) => Object.freeze({ ...job, position: offset + index + 1 }))
    ),
    active: Object.freeze(registry.filter((job) => isActiveState(job.state))),
    history: Object.freeze(registry.filter((job) => isTerminalState(job.state))),
    attention: Object.freeze(registry.filter((job) => job.state === "needs_attention")),
    registry: registryAvailable
      ? Object.freeze({
          available: true,
          total: integer(registryPage?.total, registry.length),
          offset: integer(registryPage?.offset, 0),
          limit: integer(registryPage?.limit, registry.length),
        })
      : EMPTY_PAGE,
  });
}
