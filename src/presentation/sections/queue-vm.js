// Pure queue projection. Ordering, positions and action permissions stay backend and domain
// concerns; this module pages and words them.

import { buildJobRowViewModel } from "./job-row-vm.js";

export function buildQueueViewModel({ model = {}, texts, options = {}, ui, nowMs = null } = {}) {
  const queue = model.queue || {};
  const pending = queue.pending || [];
  const activeJobs = model.active?.jobs || [];
  const offset = queue.offset ?? 0;
  const limit = queue.limit || options.pageSize || 25;
  const total = queue.total ?? pending.length;
  const shared = { model, texts, timeFormat: options.timeFormat, nowMs };

  return {
    key: "queue",
    mode: queue.mode || "idle",
    revision: queue.revision ?? null,
    offset,
    limit,
    total,
    page: Math.floor(offset / Math.max(1, limit)) + 1,
    pageCount: Math.max(1, Math.ceil(total / Math.max(1, limit))),
    hasPrevious: offset > 0,
    hasNext: offset + limit < total,
    pending: pending.map((job, index) => buildJobRowViewModel({ ...shared, job, index, total })),
    active: activeJobs.map((job, index) => buildJobRowViewModel({ ...shared, job, index, total: activeJobs.length })),
    error: model.lastCommandError,
    empty: pending.length === 0 && activeJobs.length === 0,
    ui,
  };
}
