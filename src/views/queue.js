// The queue view. See internal dev doc §8 "Queue".

import { boolOption } from "../config/option-schemas.js";
import { buildQueueView } from "../presentation/views/queue.js";
import { button, e, icon } from "../render/primitives/markup.js";
import { emptyState, errorState, group, jobRow, loadingState, pagination } from "./parts.js";
import { QUEUE_CSS } from "./styles/queue.js";

function recoveryAlert(context, item) {
  return `<div class="voc-alert" data-key="recovery:${e(item.robotId)}" role="status">${icon("mdi:robot-vacuum-alert")}<div class="voc-alert-text"><strong>${e(context.t("recovery.title", { robot: item.robot }))}</strong><span>${e(item.reason)}</span></div>${button({ action: "open-recovery", args: { robotId: item.robotId }, label: context.t("action.resolve"), variant: "primary", decision: item.decision, reasonText: context.reason(item.decision) })}</div>`;
}

function templateButtons(context, vm) {
  return vm.templates
    .map((template) => button({ action: "create-from-template", args: { templateId: template.templateId }, label: template.name, iconName: "mdi:content-copy", decision: template.decision, reasonText: context.reason(template.decision), key: `template:${template.templateId}` }))
    .join("");
}

export function renderQueue(context, vm) {
  if (vm.error) return `<div class="voc-view voc-queue" data-key="view:queue">${errorState(context, vm.error)}</div>`;
  if (vm.loading) return `<div class="voc-view voc-queue" data-key="view:queue">${loadingState(context)}</div>`;
  const parts = [];
  if (vm.recovery.length) parts.push(`<div class="voc-alerts" data-key="recovery">${vm.recovery.map((item) => recoveryAlert(context, item)).join("")}</div>`);
  if (vm.attentionNeeded) parts.push(`<div class="voc-alert" data-key="attention" role="status">${icon("mdi:alert-outline")}<div class="voc-alert-text"><strong>${e(context.t("attention.title"))}</strong><span>${e(context.t("attention.text"))}</span></div></div>`);
  if (vm.active.length) parts.push(group(context.t("queue.active"), vm.active.map((row) => jobRow(context, row)).join(""), { key: "active" }));
  if (vm.attention.length) parts.push(group(context.t("queue.attention"), vm.attention.map((row) => jobRow(context, row, { rowActions: [] })).join(""), { key: "attention-jobs" }));
  if (vm.empty) {
    const create = button({ action: "create-job", label: context.t("action.createJob"), iconName: "mdi:plus", variant: "primary" });
    parts.push(emptyState("mdi:playlist-check", context.t("queue.empty"), `${create}${templateButtons(context, vm)}`));
  } else if (vm.waiting.length) {
    parts.push(group(context.t("queue.waiting"), vm.waiting.map((row) => jobRow(context, row)).join(""), { count: vm.waitingTotal, key: "waiting" }));
    if (vm.templates.length) parts.push(`<div class="voc-quick" data-key="quick"><span class="voc-quick-label">${e(context.t("queue.fromTemplate"))}</span>${templateButtons(context, vm)}</div>`);
  }
  parts.push(pagination(context, vm.pagination, "queue"));
  return `<div class="voc-view voc-queue" data-key="view:queue">${parts.join("")}</div>`;
}

export const queueView = Object.freeze({
  key: "queue",
  icon: "mdi:format-list-numbered",
  requires: ["get_queue"],
  defaultEnabled: () => true,
  optionsSchema: Object.freeze({ show_active: boolOption(true), show_attention: boolOption(true), show_templates: boolOption(true) }),
  primary: Object.freeze({ action: "create-job", icon: "mdi:plus", labelKey: "action.createJob", operation: "create_job", target: "create" }),
  scopes: ({ options }) => (options.show_templates === false ? [] : [{ name: "templates" }]),
  build: ({ model, texts, context, options, config }) => buildQueueView({ model, texts, context, options, timeFormat: config.time_format }),
  render: renderQueue,
  css: QUEUE_CSS,
});
