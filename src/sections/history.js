// Terminal registry history section.

import { buildHistoryViewModel } from "../presentation/sections/history-vm.js";
import { actionButton, actionDisabledKey, e, emptyState, renderSettings, setText, t, unavailable } from "./render-utils.js";

function historyRow(context, row) {
  return `<article class="voc-job-row voc-history-row" data-job-id="${e(row.jobId)}" data-state="${e(row.state)}">
    <div class="voc-job-position">${e(row.positionText)}</div>
    <div class="voc-job-main"><div class="voc-job-heading"><button type="button" class="voc-job-name" data-action="open-detail" data-job-id="${e(row.jobId)}" aria-label="${e(t(context, "action.openDetail"))}: ${e(row.name)}">${e(row.name)}</button><span class="voc-job-state voc-tone-${e(row.stateTone)}">${e(row.stateLabel)}</span></div><div class="voc-job-meta"><span class="voc-job-areas">${e(row.areasText)}</span><span class="voc-job-mode">${e(row.modeShortLabel)}</span><span class="voc-history-result" data-history-result="true">${e(row.resultLabel || row.stateLabel)}</span></div><div class="voc-job-detail-line"><span class="voc-job-settings-slot">${renderSettings(row.settings, context)}</span><span class="voc-job-time">${e(row.timeLabel)}</span><span class="voc-history-duration" data-history-duration="true">${e(row.durationLabel)}</span></div></div>
    <div class="voc-job-actions" data-row-actions="true">${actionButton(context, { action: "retry-job", command: "retry_job", jobId: row.jobId, state: row.actions?.retry, iconName: "mdi:refresh", label: t(context, "action.retry"), className: "voc-job-action voc-job-action-retry" })}</div>
  </article>`;
}

export const historySection = {
  key: "history",

  build(model, texts, options = {}, ui) {
    return buildHistoryViewModel({ model, texts, options, nowMs: options.nowMs ?? null, ui });
  },

  structureSignature(content) {
    if (!content.available) return "unavailable";
    return `${content.empty ? "empty" : "rows"}|${content.rows.map((row) => `${row.jobId}:${row.actions.retry.state}`).join("|")}|${content.total > content.limit ? `pages:${content.hasPrevious ? 1 : 0}${content.hasNext ? 1 : 0}` : "no-pages"}`;
  },

  render(context, viewModel) {
    if (!viewModel.available) return `<section class="voc-section voc-history-section" data-section="history">${unavailable(context, viewModel.unavailable)}</section>`;
    const body = viewModel.empty ? emptyState(context, "history") : viewModel.rows.map((row) => historyRow(context, row)).join("");
    // The same paging contract as the queue: the nav carries the page it is on, so the card
    // can ask the backend for the next or the previous one.
    const previous = viewModel.hasPrevious
      ? actionButton(context, { action: "load-previous", command: "load_page", label: t(context, "action.back"), iconName: "mdi:chevron-left", extra: ' data-page-direction="previous"' })
      : "";
    const next = viewModel.hasNext
      ? actionButton(context, { action: "load-more", command: "load_page", label: t(context, "action.loadMore"), iconName: "mdi:chevron-right", extra: ' data-page-direction="next"' })
      : "";
    const pages = viewModel.total > viewModel.limit
      ? `<nav class="voc-pagination" aria-label="${e(t(context, "action.loadMore"))}" data-offset="${viewModel.offset}" data-limit="${viewModel.limit}">${previous}<span class="voc-page-status">${e(`${viewModel.page} / ${viewModel.pageCount}`)}</span>${next}</nav>`
      : "";
    return `<section class="voc-section voc-history-section" data-section="history"><h2 class="voc-section-title">${e(t(context, "section.history"))}</h2>${body}${pages}</section>`;
  },

  patch(context, root, viewModel) {
    const section = root?.matches?.(".voc-history-section") ? root : root?.querySelector?.(".voc-history-section");
    if (!section || !viewModel.available) return;
    for (const row of viewModel.rows) {
      const element = [...section.querySelectorAll(".voc-history-row")].find((candidate) => candidate.dataset.jobId === row.jobId);
      if (!element) continue;
      setText(element, ".voc-job-name", row.name);
      setText(element, "[data-history-result]", row.resultLabel || row.stateLabel);
      setText(element, "[data-history-duration]", row.durationLabel);
      const retry = element.querySelector(".voc-job-action-retry");
      if (retry) {
        retry.disabled = row.actions.retry.state === "disabled";
        const key = actionDisabledKey(row.actions.retry.reason);
        if (key) retry.title = t(context, `action.disabled.${key}`);
        else retry.removeAttribute("title");
      }
    }
    setText(section, ".voc-page-status", `${viewModel.page} / ${viewModel.pageCount}`);
  },
};

export default historySection;
