// The queue view: recovery and attention first, then work in progress, then the waiting jobs in
// the integration's order, then quick starts from templates. See internal dev doc §8 "Queue".

import { recoveryAffordance, templateAffordances } from "../../domain/affordances.js";
import { faultsText } from "../common/faults.js";
import { list, robotName, roomIndex, slotData } from "../common/lookups.js";
import { pagination, reasonText, t } from "../common/texts.js";
import { buildJobRow } from "./job-row.js";

export const QUICK_TEMPLATE_LIMIT = 4;

// Which jobs wait for the fix: an operation that mops covers the combined one, and so does one
// that vacuums.
function blockedJobs(operations, texts) {
  const mop = operations.includes("mop");
  const vacuum = operations.includes("vacuum");
  if (mop && vacuum) return t(texts, "attention.blocksAll");
  if (mop) return t(texts, "attention.blocksMop");
  if (vacuum) return t(texts, "attention.blocksVacuum");
  return operations.length ? t(texts, "attention.blocksAll") : null;
}

// A device that needs someone now (EXE-12): what, at which robot, and what it holds back. Robot and
// job recoveries have their own banner and row.
function deviceAttention(queue, { model, texts }) {
  return list(queue?.attention)
    .filter((entry) => entry.kind === "device_fault" && entry.robotId)
    .map((entry) => {
      return {
        key: `${entry.robotId}:${entry.codes.join(",")}`,
        title: t(texts, "attention.device", { robot: robotName(entry.robotId, model) }),
        what: faultsText(entry.codes, entry.robotId, { model, texts }),
        // The deadline of a job waiting for the fix stands on its row.
        effect: blockedJobs(entry.operations, texts),
      };
    });
}

export function buildQueueView({ model, texts, context, options = {}, ui = {}, timeFormat = "auto" }) {
  const queue = slotData(model, "queue");
  const index = roomIndex(model);
  const openJobs = list(slotData(model, "openJobs")?.jobs);
  const shared = { model, texts, index, context, timeFormat, menu: ui?.menu ?? null };
  const recovery = list(queue?.recoveryTargets).map((target) => ({
    key: target.robotId,
    robotId: target.robotId,
    robot: robotName(target.robotId, model),
    reason: reasonText(texts, target.reason) || t(texts, "recovery.reasonUnknown"),
    decision: recoveryAffordance(target.robotId, context),
  }));
  const active = options.show_active === false ? [] : openJobs.filter((job) => job.state !== "needs_attention").map((job) => buildJobRow(job, shared));
  const attention = options.show_attention === false ? [] : openJobs.filter((job) => job.state === "needs_attention").map((job) => buildJobRow(job, shared));
  const waiting = list(queue?.jobs).map((job) => buildJobRow(job, shared));
  const templates = options.show_templates === false
    ? []
    : list(slotData(model, "templates")?.items)
        .filter((template) => template.enabled)
        .slice(0, QUICK_TEMPLATE_LIMIT)
        .map((template) => ({ key: template.templateId, templateId: template.templateId, name: template.name, decision: templateAffordances(template, context).instantiate }));
  const devices = deviceAttention(queue, { model, texts });
  const status = model.slots?.queue?.status ?? "idle";
  return {
    key: "queue",
    loading: !queue && (status === "loading" || status === "idle"),
    error: !queue && model.slots?.queue?.error ? model.slots.queue.error : null,
    recovery,
    devices,
    attentionNeeded: Boolean(queue?.needsAttention) && recovery.length === 0 && attention.length === 0 && devices.length === 0,
    active,
    attention,
    waiting,
    waitingTotal: queue?.total ?? 0,
    empty: Boolean(queue) && waiting.length === 0 && active.length === 0 && attention.length === 0,
    templates,
    pagination: pagination(queue, texts),
    offset: queue?.offset ?? 0,
    limit: queue?.limit ?? 0,
  };
}
