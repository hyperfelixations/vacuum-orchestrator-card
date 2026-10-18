// The queue view: recovery and attention first, then work in progress, then the waiting jobs in
// the integration's order, then quick starts from templates. See internal dev doc §8 "Queue".

import { CREATE_TARGET, decide, recoveryAffordance, templateAffordances } from "../../domain/affordances.js";
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

// The jobs the view lists, in its order: started, needing clarification, waiting.
function listedJobs(model, options) {
  const open = list(slotData(model, "openJobs")?.jobs);
  return {
    active: options.show_active === false ? [] : open.filter((job) => job.state !== "needs_attention"),
    attention: options.show_attention === false ? [] : open.filter((job) => job.state === "needs_attention"),
    waiting: list(slotData(model, "queue")?.jobs),
  };
}

// Nothing waits, runs or needs clarification in what the view shows: its empty state offers to add
// a job, in place of the tab row (UI-19).
export function queueIsEmpty(model, options = {}) {
  if (!slotData(model, "queue")) return false;
  const { active, attention, waiting } = listedJobs(model, options);
  return active.length + attention.length + waiting.length === 0;
}

// The job a wide queue's detail shows: the chosen one while it is listed, else the first (LAY-03).
export function detailJobId(model, options = {}, selected = null) {
  const { active, attention, waiting } = listedJobs(model, options);
  const ids = [...active, ...attention, ...waiting].map((job) => job.jobId);
  return ids.includes(selected) ? selected : (ids[0] ?? null);
}

// What the view reads beyond the queue: quick-start templates and, on a wide card, the job, its
// execution and its trace for the detail beside the list.
export function buildQueueScopes({ ui = {}, model = null, options = {} }) {
  const scopes = options.show_templates === false ? [] : [{ name: "templates" }];
  const jobId = ui.wide && model ? detailJobId(model, options, ui.selectedJob) : null;
  if (jobId) scopes.push({ name: "job", params: { jobId } }, { name: "execution", params: { jobId } }, { name: "trace", params: { jobId } });
  return scopes;
}

// `panelShown`: the main panel's headline already counts the waiting jobs.
export function buildQueueView({ model, texts, context, options = {}, ui = {}, timeFormat = "auto", panelShown = true }) {
  const queue = slotData(model, "queue");
  const index = roomIndex(model);
  const shared = { model, texts, index, context, timeFormat, menu: ui?.menu ?? null };
  const recovery = list(queue?.recoveryTargets).map((target) => ({
    key: target.robotId,
    robotId: target.robotId,
    robot: robotName(target.robotId, model),
    reason: reasonText(texts, target.reason) || t(texts, "recovery.reasonUnknown"),
    decision: recoveryAffordance(target.robotId, context),
  }));
  const shown = ui?.wide ? detailJobId(model, options, ui.selectedJob) : null;
  const row = (job) => ({ ...buildJobRow(job, shared), selected: job.jobId === shown });
  const listed = listedJobs(model, options);
  // The attention group's title already says what the row's state pill would (V6).
  const [active, attention, waiting] = [listed.active.map(row), listed.attention.map((job) => ({ ...row(job), showState: false })), listed.waiting.map(row)];
  // The detail itself is built beside the list by the view (LAY-03).
  const detail = shown ? { jobId: shown, traceOpen: list(ui?.expanded).includes(`trace:${shown}`) } : null;
  const templates = options.show_templates === false
    ? []
    : list(slotData(model, "templates")?.items)
        .filter((template) => template.enabled)
        .slice(0, QUICK_TEMPLATE_LIMIT)
        .map((template) => ({ key: template.templateId, templateId: template.templateId, name: template.name, decision: templateAffordances(template, context).instantiate }))
        .filter((template) => template.decision.state !== "hidden");
  const devices = deviceAttention(queue, { model, texts });
  // Only who may add a job is asked what to clean next (UI-22, UI-23).
  const create = decide(context, { operation: "create_job", target: CREATE_TARGET });
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
    waitingCount: panelShown ? null : (queue?.total ?? 0),
    empty: queueIsEmpty(model, options),
    emptyText: t(texts, create.state === "hidden" ? "queue.emptyReadOnly" : "queue.empty"),
    create,
    detail,
    templates,
    pagination: pagination(queue, texts),
    offset: queue?.offset ?? 0,
    limit: queue?.limit ?? 0,
  };
}
