// The history view. See internal dev doc §8 "Verlauf".

import { enumOption } from "../config/option-schemas.js";
import { activeSegment, buildHistoryView } from "../presentation/views/history.js";
import { button, chip, e, icon } from "../render/primitives/markup.js";
import { emptyState, errorState, jobRow, loadingState, pagination } from "./parts.js";
import { HISTORY_CSS } from "./styles/history.js";

function segments(context, vm) {
  if (!vm.segments.length) return "";
  const items = vm.segments.map((segment) => button({ action: "choose", args: { key: "history:segment", value: segment.key }, label: segment.label, variant: "quiet", pressed: segment.selected, key: `segment:${segment.key}` })).join("");
  return `<div class="voc-segments" role="group" aria-label="${e(context.t("view.history"))}" data-key="segments">${items}</div>`;
}

function runRow(run) {
  const meta = `<span>${e([run.operation, run.source].join(" · "))}</span>${run.when ? `<span>${e(run.when)}</span>` : ""}`;
  const quality = run.quality ? chip(run.quality, { iconName: "mdi:check-decagram-outline" }) : "";
  const failure = run.failure ? `<span class="voc-job-outcome">${icon("mdi:alert-outline")}<span>${e(run.failure)}</span></span>` : "";
  return `<article class="voc-run" data-key="run:${e(run.key)}" data-tone="${e(run.tone)}"><span class="voc-run-icon" aria-hidden="true">${icon(run.icon)}</span><div class="voc-run-main"><span class="voc-run-title">${e(run.title)}</span><span class="voc-run-meta">${meta}${quality}</span>${failure}</div></article>`;
}

export function renderHistory(context, vm) {
  const wrap = (content) => `<div class="voc-view voc-history" data-key="view:history">${segments(context, vm)}${content}</div>`;
  if (vm.error) return wrap(errorState(context, vm.error));
  if (vm.loading) return wrap(loadingState(context));
  let list;
  if (vm.segment === "jobs") list = vm.jobs.length ? `<div class="voc-list" data-key="jobs">${vm.jobs.map((row) => jobRow(context, row, { rowActions: ["retry"], log: true })).join("")}</div>` : emptyState("mdi:history", context.t("history.jobsEmpty"));
  else list = vm.runs.length ? `<div class="voc-list" data-key="runs">${vm.runs.map(runRow).join("")}</div>` : emptyState("mdi:history", context.t("history.runsEmpty"));
  return wrap(`${list}${pagination(context, vm.pagination, vm.scope)}`);
}

export const historyView = Object.freeze({
  key: "history",
  icon: "mdi:history",
  requires: ["get_history"],
  defaultEnabled: () => true,
  optionsSchema: Object.freeze({ source: enumOption("both", ["jobs", "runs", "both"]) }),
  primary: null,
  scopes: ({ ui, options, config }) => {
    const scope = activeSegment(options.source, ui) === "jobs" ? "jobLog" : "runs";
    return [{ name: scope, params: { offset: ui.pages?.[scope] ?? 0, limit: config.page_size } }];
  },
  build: ({ model, texts, context, options, ui, config }) => buildHistoryView({ model, texts, context, options, ui, timeFormat: config.time_format }),
  render: renderHistory,
  css: HISTORY_CSS,
});
