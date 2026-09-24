// Registry history. It shows what happened; the only action it offers is creating the job
// again, which the backend models as a new job.

import { buildJobRowViewModel } from "./job-row-vm.js";
import { hasCapability, listOf } from "./helpers.js";

export function buildHistoryViewModel({ model = {}, texts, options = {}, nowMs = null, ui } = {}) {
  if (!hasCapability(model, "jobsHistory")) {
    return { key: "history", available: false, unavailable: { capability: "jobsHistory" }, rows: [], empty: false, ui };
  }
  const history = model.history || {};
  const jobs = listOf(history.jobs);
  const offset = history.offset ?? 0;
  const limit = history.limit || options.pageSize || 25;
  const total = history.total ?? jobs.length;
  return {
    key: "history",
    available: true,
    unavailable: null,
    rows: jobs.map((job, index) =>
      buildJobRowViewModel({ job, index, total, model, texts, timeFormat: options.timeFormat, nowMs, history: true })
    ),
    offset,
    limit,
    total,
    page: Math.floor(offset / Math.max(1, limit)) + 1,
    pageCount: Math.max(1, Math.ceil(total / Math.max(1, limit))),
    hasPrevious: offset > 0,
    hasNext: offset + limit < total,
    empty: jobs.length === 0,
    ui,
  };
}
