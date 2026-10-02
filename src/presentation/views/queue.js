// The queue view: recovery and attention first, then work in progress, then the waiting jobs in
// the integration's order, then quick starts from templates. See internal dev doc §8 "Queue".

import { recoveryAffordance, templateAffordances } from "../../domain/affordances.js";
import { list, robotName, roomIndex, slotData } from "../common/lookups.js";
import { pagination, reasonText, t } from "../common/texts.js";
import { buildJobRow } from "./job-row.js";

export const QUICK_TEMPLATE_LIMIT = 4;

export function buildQueueView({ model, texts, context, options = {}, timeFormat = "auto" }) {
  const queue = slotData(model, "queue");
  const index = roomIndex(model);
  const openJobs = list(slotData(model, "openJobs")?.jobs);
  const shared = { model, texts, index, context, timeFormat };
  const recovery = list(queue?.recoveryTargets).map((target) => ({
    key: target.robotId,
    robotId: target.robotId,
    robot: robotName(target.robotId, model),
    reason: reasonText(texts, target.reason) || t(texts, "recovery.reasonUnknown"),
    decision: recoveryAffordance(target.robotId, context),
  }));
  const active = options.show_active === false ? [] : openJobs.filter((job) => job.state !== "needs_attention").map((job) => buildJobRow(job, shared));
  const attention = options.show_attention === false ? [] : openJobs.filter((job) => job.state === "needs_attention").map((job) => buildJobRow(job, shared));
  const waiting = list(queue?.jobs).map((job) => buildJobRow(job, { ...shared, total: queue.total }));
  const templates = options.show_templates === false
    ? []
    : list(slotData(model, "templates")?.items)
        .filter((template) => template.enabled)
        .slice(0, QUICK_TEMPLATE_LIMIT)
        .map((template) => ({ key: template.templateId, templateId: template.templateId, name: template.name, decision: templateAffordances(template, context).instantiate }));
  const status = model.slots?.queue?.status ?? "idle";
  return {
    key: "queue",
    loading: !queue && (status === "loading" || status === "idle"),
    error: !queue && model.slots?.queue?.error ? model.slots.queue.error : null,
    recovery,
    attentionNeeded: Boolean(queue?.needsAttention) && recovery.length === 0 && attention.length === 0,
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
