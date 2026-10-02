// Markup parts several views share: groups, the job row, empty, loading and error states,
// pagination and fact lists. Commands are `data-action` plus `data-args`.

import { button, chip, e, icon, pill } from "../render/primitives/markup.js";
import { failureText } from "../presentation/common/texts.js";

export function group(title, content, { count = null, key = null } = {}) {
  if (!content) return "";
  return `<section class="voc-group"${key ? ` data-key="${e(key)}"` : ""}><h3 class="voc-group-title">${e(title)}${count === null ? "" : `<span class="voc-group-count">· ${e(count)}</span>`}</h3>${content}</section>`;
}

export function emptyState(iconName, text, actions = "", hint = "") {
  return `<div class="voc-empty" data-key="empty">${icon(iconName)}<div>${e(text)}</div>${hint ? `<p class="voc-empty-hint">${e(hint)}</p>` : ""}${actions ? `<div class="voc-empty-actions">${actions}</div>` : ""}</div>`;
}

export function loadingState(context) {
  return `<div class="voc-loading" data-key="loading" role="status">${e(context.t("state.loading"))}</div>`;
}

export function errorState(context, failure) {
  return `<div class="voc-unavailable" data-key="error" role="alert">${icon("mdi:alert-circle-outline")}<div>${e(failureText(context.texts, failure))}</div>${button({ action: "reload", label: context.t("action.retryLoad"), iconName: "mdi:refresh" })}</div>`;
}

export function facts(rows) {
  const items = rows.filter((row) => row && row.value !== null && row.value !== undefined && row.value !== "");
  if (!items.length) return "";
  return `<dl class="voc-facts">${items.map((row) => `<dt>${e(row.label)}</dt><dd>${e(row.value)}</dd>`).join("")}</dl>`;
}

export function traceList(rows) {
  return `<ol class="voc-trace">${rows.map((record) => `<li data-key="trace:${e(record.key)}" data-tone="${e(record.tone)}"><span class="voc-trace-time">${e(record.time)}</span><span class="voc-trace-event">${e(record.event)}</span>${record.detail ? `<span class="voc-trace-detail">${e(record.detail)}</span>` : ""}</li>`).join("")}</ol>`;
}

export function pagination(context, vm, scope) {
  if (!vm) return "";
  const previous = button({ action: "page", args: { scope, direction: "previous" }, label: context.t("action.previousPage"), iconName: "mdi:chevron-left", variant: "icon", decision: vm.hasPrevious ? null : { state: "disabled", reason: "at_boundary" } });
  const next = button({ action: "page", args: { scope, direction: "next" }, label: context.t("action.nextPage"), iconName: "mdi:chevron-right", variant: "icon", decision: vm.hasNext ? null : { state: "disabled", reason: "at_boundary" } });
  return `<nav class="voc-pagination" aria-label="${e(context.t("pagination.label"))}">${previous}<span class="voc-page-status">${e(vm.label)}</span>${next}</nav>`;
}

// The trailing slot always holds the action that drives the job's run (start, cancel, retry), so
// start and stop share one place; the managing actions precede it, set apart.
const ROW_ACTIONS = Object.freeze([
  { key: "moveUp", group: "manage", action: "move-job", args: { direction: "up" }, iconName: "mdi:arrow-up", labelKey: "action.moveUp" },
  { key: "moveDown", group: "manage", action: "move-job", args: { direction: "down" }, iconName: "mdi:arrow-down", labelKey: "action.moveDown" },
  { key: "edit", group: "manage", action: "edit-job", iconName: "mdi:pencil-outline", labelKey: "action.edit" },
  { key: "start", group: "run", action: "start-job", iconName: "mdi:play", labelKey: "action.startNow" },
  { key: "cancel", group: "run", action: "cancel-job", iconName: "mdi:stop-circle-outline", labelKey: "action.cancelJob", onlyActive: true },
  { key: "retry", group: "run", action: "retry-job", iconName: "mdi:restore", labelKey: "action.retry" },
]);

const ACTION_LAYOUT = Object.freeze(["none", "one"]);

function rowActionBar(context, row, rowActions) {
  const specs = ROW_ACTIONS.filter((spec) => rowActions.includes(spec.key) && row.actions[spec.key]?.state !== "hidden" && (!spec.onlyActive || row.state !== "queued"));
  const parts = [];
  specs.forEach((spec, index) => {
    if (index > 0 && specs[index - 1].group !== spec.group) parts.push('<span class="voc-job-actions-gap" aria-hidden="true"></span>');
    parts.push(button({
      action: spec.action,
      args: { jobId: row.jobId, ...(spec.args || {}) },
      label: context.t(spec.labelKey),
      iconName: spec.iconName,
      variant: "icon",
      decision: row.actions[spec.key],
      reasonText: context.reason(row.actions[spec.key]),
    }));
  });
  return { layout: ACTION_LAYOUT[specs.length] || "several", markup: specs.length ? `<div class="voc-job-actions">${parts.join("")}</div>` : "" };
}

const READINESS_ICON = Object.freeze({ ready: "mdi:check-circle-outline", blocked: "mdi:lock-outline", unknown: "mdi:help-circle-outline" });

// `rowActions`: the frequent controls a row shows; destructive ones live on the detail page and
// in the editor, one step away from an accidental tap. A log row leads with the mode instead of
// the queue position and names when the job last changed.
export function jobRow(context, row, { rowActions = ["moveUp", "moveDown", "start", "edit", "cancel", "retry"], log = false } = {}) {
  const actions = rowActionBar(context, row, rowActions);
  const statePill = row.state === "queued" && !log ? "" : pill(row.stateLabel, row.stateTone);
  // The lead shows the queue position when there is one, else the mode icon.
  const byPosition = Boolean(row.position) && !log;
  const readiness = row.readiness && row.state === "queued"
    ? `<span class="voc-job-readiness" data-readiness="${e(row.readiness.state)}">${icon(READINESS_ICON[row.readiness.state])}<span>${e(row.readiness.summary || row.readiness.label)}</span>${row.readiness.more ? `<span class="voc-job-more">+${e(row.readiness.more)}</span>` : ""}</span>`
    : "";
  const outcome = row.outcome ? `<span class="voc-job-outcome">${icon("mdi:alert-outline")}<span>${e(row.outcome)}</span></span>` : "";
  const chips = row.settings.map((setting) => chip(setting.text, { iconName: setting.icon })).join("");
  return `<article class="voc-job" data-key="job:${e(row.jobId)}" data-state="${e(row.state)}" data-tone="${e(row.stateTone)}" data-actions="${actions.layout}"${row.pending ? ' data-pending="true"' : ""}><div class="voc-job-lead" aria-hidden="true">${byPosition ? `<span class="voc-job-position">${e(row.position)}</span>` : icon(row.modeIcon)}</div><button type="button" class="voc-job-main" data-action="open-job" data-args="${e(JSON.stringify({ jobId: row.jobId }))}" aria-label="${e(context.t("action.openJob", { job: row.title }))}"><span class="voc-job-title-line"><span class="voc-job-title">${e(row.title)}</span>${statePill}</span><span class="voc-job-meta"><span class="voc-job-mode">${byPosition ? icon(row.modeIcon) : ""}${e(row.modeLabel)}</span>${row.showRooms ? `<span class="voc-job-rooms">${e(row.rooms)}</span>` : ""}${chips}${log && row.time ? `<span class="voc-job-time">${e(row.time)}</span>` : ""}</span>${readiness}${outcome}</button>${actions.markup}</article>`;
}
