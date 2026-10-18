// Markup parts several views share: groups, the job row, empty, loading and error states,
// pagination and fact lists. Commands are `data-action` plus `data-args`.

import { atEnd, button, chip, e, icon, pill } from "../render/primitives/markup.js";
import { failureText } from "../presentation/common/texts.js";
import { menu } from "./controls/menu.js";

// The rarer actions of a page's footer stand on its left: as buttons on a wide card, in a menu on
// a narrow one, destructive ones last, so the footer stays one line (LAY-09). Both are rendered;
// the card's width decides. `always` stays in sight on any card. `items`: menu items (`menu`), a
// destructive one with `tone: "danger"`.
export function footerLead(context, { always = "", items, key, label, open = false }) {
  const shown = items.filter((item) => item && item.decision?.state !== "hidden");
  if (!always && !shown.length) return "";
  const buttons = shown.map((item) => button({ ...item, variant: item.tone === "danger" ? "danger" : "text" })).join("");
  const ordered = [...shown.filter((item) => item.tone !== "danger"), ...shown.filter((item) => item.tone === "danger")];
  return `<span class="voc-action-start voc-actions-lead">${always}${buttons ? `<span class="voc-actions-buttons">${buttons}</span>` : ""}${menu(context, { key, label, items: ordered, open })}</span>`;
}

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
  return `<dl class="voc-facts">${items.map((row) => `<dt>${e(row.label)}</dt><dd${row.key ? ` data-key="fact:${e(row.key)}"` : ""}>${e(row.value)}</dd>`).join("")}</dl>`;
}

// A day heads its first entry (V6).
export function traceList(rows) {
  return `<ol class="voc-trace">${rows.map((record, index) => `${index === 0 || rows[index - 1].day !== record.day ? `<li class="voc-trace-day">${e(record.day)}</li>` : ""}<li data-key="trace:${e(record.key)}" data-tone="${e(record.tone)}"><span class="voc-trace-time">${e(record.time)}</span><span class="voc-trace-event">${e(record.event)}</span>${record.detail ? `<span class="voc-trace-detail">${e(record.detail)}</span>` : ""}${record.count > 1 ? `<span class="voc-trace-count">×${e(record.count)}</span>` : ""}</li>`).join("")}</ol>`;
}

export function pagination(context, vm, scope) {
  if (!vm) return "";
  const previous = button({ action: "page", args: { scope, direction: "previous" }, label: context.t("action.previousPage"), iconName: "mdi:chevron-left", variant: "icon", ...atEnd(context, !vm.hasPrevious) });
  const next = button({ action: "page", args: { scope, direction: "next" }, label: context.t("action.nextPage"), iconName: "mdi:chevron-right", variant: "icon", ...atEnd(context, !vm.hasNext) });
  return `<nav class="voc-pagination" aria-label="${e(context.t("pagination.label"))}">${previous}<span class="voc-page-status">${e(vm.label)}</span>${next}</nav>`;
}

// Managing a waiting job: icons beside the row, in this order.
const MANAGE_ACTIONS = Object.freeze([
  { key: "moveUp", action: "move-job", args: { direction: "up" }, iconName: "mdi:arrow-up", labelKey: "action.moveUp" },
  { key: "moveDown", action: "move-job", args: { direction: "down" }, iconName: "mdi:arrow-down", labelKey: "action.moveDown" },
  { key: "edit", action: "edit-job", iconName: "mdi:pencil-outline", labelKey: "action.edit" },
]);

// The one action a row offers by the job's state, with its label (UI-06, UI-24); destructive ones
// in the error colour (UI-20).
const MAIN_ACTIONS = Object.freeze({
  delete: { action: "delete-job", iconName: "mdi:delete-outline", labelKey: "action.delete", variant: "danger" },
  release: { action: "open-release", iconName: "mdi:lock-open-variant-outline", labelKey: "action.release" },
  start: { action: "start-job", iconName: "mdi:play", labelKey: "action.startNow" },
  cancel: { action: "cancel-job", iconName: "mdi:stop-circle-outline", labelKey: "action.cancelJob", variant: "danger" },
  retry: { action: "retry-job", iconName: "mdi:restore", labelKey: "action.retry" },
});

const ACTION_LAYOUT = Object.freeze(["none", "one"]);

function mainButton(context, row) {
  const main = row.main;
  const spec = main ? MAIN_ACTIONS[main.key] : null;
  if (!spec || main.decision?.state === "hidden") return "";
  const args = main.key === "release" ? { roomId: main.roomIds[0], roomIds: main.roomIds, jobId: row.jobId } : { jobId: row.jobId };
  return button({ action: spec.action, args, label: context.t(spec.labelKey), iconName: spec.iconName, variant: spec.variant || "text", className: "voc-job-main-action", decision: main.decision, reasonText: context.reason(main.decision) });
}

// Wide enough, the managing actions stand beside the row as icons; on a narrow card they sit in
// the row's menu next to its main action (LAY-09). Both are rendered; the card's width decides.
function rowActionBar(context, row, rowActions) {
  const specs = MANAGE_ACTIONS.filter((spec) => rowActions.includes(spec.key) && row.actions[spec.key]?.state !== "hidden");
  const args = (spec) => ({ jobId: row.jobId, ...(spec.args || {}) });
  const icons = specs.map((spec) => button({ action: spec.action, args: args(spec), label: context.t(spec.labelKey), iconName: spec.iconName, variant: "icon", decision: row.actions[spec.key], reasonText: context.reason(row.actions[spec.key]) }));
  const items = specs.map((spec) => ({ action: spec.action, args: args(spec), label: context.t(spec.labelKey), iconName: spec.iconName, decision: row.actions[spec.key], reasonText: context.reason(row.actions[spec.key]) }));
  const main = rowActions.includes("main") ? mainButton(context, row) : "";
  const count = specs.length + (main ? 1 : 0);
  const manage = specs.length ? `<span class="voc-job-manage">${icons.join("")}</span>` : "";
  const more = specs.length ? menu(context, { key: `job:${row.jobId}`, label: context.t("action.moreFor", { job: row.title }), items, open: row.menuOpen === true }) : "";
  const gap = specs.length && main ? '<span class="voc-job-actions-gap" aria-hidden="true"></span>' : "";
  // The managing icons end the row, so they line up from row to row whatever main action a row
  // has; on a narrow card the menu holding them takes their place.
  return { layout: ACTION_LAYOUT[count] || "several", markup: count ? `<div class="voc-job-actions">${main}${gap}${manage}${more}</div>` : "" };
}

function progressMarkup(progress) {
  if (!progress) return "";
  const bars = progress.bars.map((bar) => `<span class="voc-job-percent" data-key="${e(bar.key)}">${progress.labelled ? `<span>${e(bar.label)}</span>` : ""}<span class="voc-progress" role="progressbar" aria-label="${e(bar.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e(bar.value)}"><span style="width:${e(bar.value)}%"></span></span><span>${e(bar.text)}</span></span>`).join("");
  const fault = progress.fault ? `<span class="voc-job-status" data-tone="attention">${icon("mdi:wrench-clock")}<span>${e(progress.fault.text)}</span></span>` : "";
  return `<span class="voc-job-progress"><span class="voc-job-progress-line">${e(progress.line)}</span>${bars ? `<span class="voc-job-percents">${bars}</span>` : ""}</span>${fault}`;
}

// `rowActions`: the controls a row shows: the managing icons by key and `main`, the action of the
// job's state. Destructive actions other than that live on the detail page and in the editor, one
// step away from an accidental tap. A log row leads with the mode instead of the queue position
// and names when the job last changed.
export function jobRow(context, row, { rowActions = ["moveUp", "moveDown", "edit", "main"], log = false } = {}) {
  const actions = rowActionBar(context, row, rowActions);
  const statePill = log || row.showState ? pill(row.stateLabel, row.stateTone) : "";
  // The lead shows the queue position when there is one, else the mode icon.
  const byPosition = Boolean(row.position) && !log;
  const status = row.status ? `<span class="voc-job-status" data-tone="${e(row.status.tone)}" data-code="${e(row.status.code)}">${icon(row.status.icon)}<span>${e(row.status.text)}</span></span>` : "";
  const outcome = row.outcome ? `<span class="voc-job-outcome">${icon("mdi:alert-outline")}<span>${e(row.outcome)}</span></span>` : "";
  const chips = row.settings.map((setting) => chip(setting.text, { iconName: setting.icon, label: setting.label })).join("");
  return `<article class="voc-job" data-key="job:${e(row.jobId)}" data-state="${e(row.state)}" data-tone="${e(row.stateTone)}" data-actions="${actions.layout}"${row.pending ? ' data-pending="true"' : ""}${row.selected ? ' data-selected="true"' : ""}><div class="voc-job-lead" aria-hidden="true">${byPosition ? `<span class="voc-job-position">${e(row.position)}</span>` : icon(row.modeIcon)}</div><button type="button" class="voc-job-main" data-action="open-job" data-args="${e(JSON.stringify({ jobId: row.jobId }))}" aria-label="${e(context.t("action.openJob", { job: row.title }))}"${row.selected ? ' aria-current="true"' : ""}><span class="voc-job-title-line"><span class="voc-job-title">${e(row.title)}</span>${statePill}</span><span class="voc-job-meta"><span class="voc-job-mode">${byPosition ? icon(row.modeIcon) : ""}${e(row.modeLabel)}</span>${row.showRooms ? `<span class="voc-job-rooms">${e(row.rooms)}</span>` : ""}${chips}${log && row.time ? `<span class="voc-job-time">${e(row.time)}</span>` : ""}</span>${status}${progressMarkup(row.progress)}${outcome}</button>${actions.markup}</article>`;
}
