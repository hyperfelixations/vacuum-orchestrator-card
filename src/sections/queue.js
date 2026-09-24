// Queue section: keyed job rows, explicit command metadata, and no optimistic reorder.

import { buildQueueViewModel } from "../presentation/sections/queue-vm.js";
import { actionButton, actionDisabledKey, actionStructure, e, emptyState, errorBanner, renderSettings, setText, t } from "./render-utils.js";

// The row controls: two moves, edit, delete, and one state-dependent primary action. Moving
// to the very top or bottom stays on the detail page, where there is room to explain it.
const ROW_ACTIONS = [
  { key: "moveUp", action: "move-up", command: "move_job", direction: "up", iconName: "mdi:arrow-up", labelKey: "moveUp" },
  { key: "moveDown", action: "move-down", command: "move_job", direction: "down", iconName: "mdi:arrow-down", labelKey: "moveDown" },
  { key: "edit", action: "edit-job", iconName: "mdi:pencil-outline", labelKey: "edit" },
  { key: "delete", action: "delete-job", command: "delete_job", iconName: "mdi:delete-outline", labelKey: "delete", confirm: true },
  { key: "start", action: "start-job", command: "start_job", iconName: "mdi:play", labelKey: "start" },
  { key: "cancel", action: "cancel-job", command: "cancel_job", iconName: "mdi:stop-circle-outline", labelKey: "cancel", confirm: true },
  { key: "retry", action: "retry-job", command: "retry_job", iconName: "mdi:restore", labelKey: "retry" },
];

function actionButtons(context, row) {
  return ROW_ACTIONS.map((spec) => actionButton(context, {
    action: spec.action,
    state: row.actions?.[spec.key],
    jobId: row.jobId,
    direction: spec.direction,
    command: spec.command,
    confirm: spec.confirm,
    iconName: spec.iconName,
    label: t(context, `action.${spec.labelKey}`),
    className: `voc-job-action voc-job-action-${spec.key}`,
  })).join("");
}

export function renderJobRow(context, row, { active = false } = {}) {
  const readiness = row.readiness || {};
  const pending = row.pending;
  return `<article class="voc-job-row${active ? " voc-job-row-active" : ""}" data-job-id="${e(row.jobId)}" data-state="${e(row.state)}">
    <div class="voc-job-position" data-row-position="true">${e(row.positionText)}</div>
    <div class="voc-job-main">
      <div class="voc-job-identity">
      <div class="voc-job-heading"><button type="button" class="voc-job-name" data-action="open-detail" data-job-id="${e(row.jobId)}" aria-label="${e(t(context, "action.openDetail"))}: ${e(row.name)}">${e(row.name)}</button><span class="voc-job-state voc-tone-${e(row.stateTone)}" data-row-state="true">${e(row.stateLabel)}</span></div>
      <div class="voc-job-subtitle"><span class="voc-job-areas">${e(row.areasText)}</span><span class="voc-job-mode-words" data-row-mode-words="true">${e(row.modeLabel)}</span></div>
      </div>
      <div class="voc-job-meta"><span class="voc-job-mode" data-row-mode="true">${e(row.modeShortLabel)}</span><span class="voc-job-readiness voc-readiness-${e(readiness.state)}" data-row-readiness="true"${readiness.state === "notApplicable" ? " hidden" : ""}>${e(readiness.label)}</span></div>
      <div class="voc-job-detail-line"><span class="voc-job-settings-slot">${renderSettings(row.settings, context)}</span>${row.source ? `<span class="voc-job-source" data-row-source="true">${e(row.source)}</span>` : ""}<span class="voc-job-time" data-row-time="true">${e(row.timeLabel)}</span></div>
    </div>
    <div class="voc-job-actions" data-row-actions="true">${actionButtons(context, row)}</div>
    <div class="voc-job-pending" data-row-pending="true"${pending ? "" : " hidden"}>${e(t(context, "hint.commandPending"))}</div>
  </article>`;
}

function activeMarkup(context, rows) {
  if (!rows.length) return "";
  return `<section class="voc-active-jobs" aria-labelledby="voc-active-jobs-title"><h3 id="voc-active-jobs-title">${e(t(context, "section.active"))}</h3>${rows.map((row) => renderJobRow(context, row, { active: true })).join("")}</section>`;
}

function paginationMarkup(context, viewModel) {
  if (viewModel.total <= viewModel.limit) return "";
  const previous = viewModel.hasPrevious
    ? actionButton(context, { action: "load-previous", command: "load_page", iconName: "mdi:chevron-left", label: t(context, "action.back"), extra: ' data-page-direction="previous"' })
    : "";
  const next = viewModel.hasNext
    ? actionButton(context, { action: "load-more", command: "load_page", iconName: "mdi:chevron-right", label: t(context, "action.loadMore"), extra: ' data-page-direction="next"' })
    : "";
  return `<nav class="voc-pagination" aria-label="${e(t(context, "action.loadMore"))}" data-offset="${viewModel.offset}" data-limit="${viewModel.limit}">${previous}<span class="voc-page-status">${e(`${viewModel.page} / ${viewModel.pageCount}`)}</span>${next}</nav>`;
}

function sectionMarkup(context, viewModel) {
  const body = `${viewModel.error ? errorBanner(context, viewModel.error) : ""}${activeMarkup(context, viewModel.active)}<section class="voc-pending-queue" aria-labelledby="voc-pending-queue-title"><h3 id="voc-pending-queue-title">${e(t(context, "section.pending"))}</h3>${viewModel.empty ? emptyState(context, "queue") : viewModel.pending.map((row) => renderJobRow(context, row)).join("")}</section>${paginationMarkup(context, viewModel)}`;
  return `<section class="voc-section voc-queue-section" data-section="queue" data-mode="${e(viewModel.mode)}" data-queue-revision="${e(viewModel.revision ?? "")}">${body}</section>`;
}

function rowById(root, jobId) {
  return [...(root?.querySelectorAll?.(".voc-job-row") || [])].find((row) => row.dataset.jobId === jobId) || null;
}

function patchActionButton(button, descriptor, context) {
  const state = descriptor?.state || "hidden";
  const reason = descriptor?.reason;
  const hard = reason === "at_boundary" || reason === "not_queued" || reason === "command_pending";
  button.disabled = state === "disabled" && hard;
  if (state === "disabled" && !button.disabled) button.setAttribute("aria-disabled", "true");
  else button.removeAttribute("aria-disabled");
  const key = actionDisabledKey(reason);
  if (state === "disabled" && key) button.setAttribute("title", t(context, `action.disabled.${key}`));
  else button.removeAttribute("title");
}

function patchRow(context, element, row) {
  if (!element) return;
  setText(element, "[data-row-position]", row.positionText);
  setText(element, ".voc-job-name", row.name);
  setText(element, "[data-row-state]", row.stateLabel);
  setText(element, ".voc-job-areas", row.areasText);
  setText(element, "[data-row-mode-words]", row.modeLabel);
  setText(element, "[data-row-mode]", row.modeShortLabel);
  const readiness = setText(element, "[data-row-readiness]", row.readiness.label);
  if (readiness) readiness.hidden = row.readiness.state === "notApplicable";
  setText(element, "[data-row-time]", row.timeLabel);
  const pending = element.querySelector("[data-row-pending]");
  if (pending) pending.hidden = !row.pending;
  for (const spec of ROW_ACTIONS) {
    const button = element.querySelector(`.voc-job-action-${spec.key}`);
    if (button) patchActionButton(button, row.actions?.[spec.key], context);
  }
}

export const queueSection = {
  key: "queue",

  build(model, texts, options = {}, ui) {
    return buildQueueViewModel({ model, texts, options, ui, nowMs: options.nowMs ?? null });
  },

  structureSignature(content) {
    const rows = [...content.active, ...content.pending].map((row) => `${row.jobId}:${actionStructure(row.actions)}`).join("|");
    return [
      content.error ? "error" : "ok",
      content.empty ? "empty" : "rows",
      content.mode,
      rows,
      content.total > content.limit ? `pages:${content.hasPrevious ? 1 : 0}${content.hasNext ? 1 : 0}` : "no-pages",
    ].join("|");
  },

  render(context, viewModel) {
    return sectionMarkup(context, viewModel);
  },

  patch(context, root, viewModel) {
    const section = root?.matches?.(".voc-queue-section") ? root : root?.querySelector?.(".voc-queue-section");
    if (!section) return;
    section.dataset.mode = viewModel.mode;
    if (viewModel.revision !== null && viewModel.revision !== undefined) section.dataset.queueRevision = String(viewModel.revision);
    const rows = [...viewModel.active, ...viewModel.pending];
    for (const row of rows) patchRow(context, rowById(section, row.jobId), row);
    setText(section, ".voc-page-status", `${viewModel.page} / ${viewModel.pageCount}`);
  },
};

export default queueSection;
