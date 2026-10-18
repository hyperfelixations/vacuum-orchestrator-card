// The job detail page.

import { buildJobDetail } from "../../presentation/overlays/job-detail.js";
import { button, chip, e, icon, pill } from "../../render/primitives/markup.js";
import { facts, footerLead, loadingState, traceList } from "../parts.js";
import { block, frame } from "./frame.js";
import { DETAIL_CSS } from "../styles/detail.js";

const ACTION = Object.freeze({
  delete: { action: "delete-job", iconName: "mdi:delete-outline", labelKey: "action.delete", variant: "danger" },
  cancel: { action: "cancel-job", iconName: "mdi:stop-circle-outline", labelKey: "action.cancelJob", variant: "danger" },
  edit: { action: "edit-job", iconName: "mdi:pencil-outline", labelKey: "action.edit" },
  start: { action: "start-job", iconName: "mdi:play", labelKey: "action.startNow", variant: "primary" },
  retry: { action: "retry-job", iconName: "mdi:restore", labelKey: "action.retry", variant: "primary" },
  saveAsTemplate: { action: "open-save-template", iconName: "mdi:content-save-outline", labelKey: "action.saveAsTemplate" },
  moveTop: { action: "move-job", args: { direction: "top" }, iconName: "mdi:arrow-collapse-up", labelKey: "action.moveTop", variant: "icon" },
  moveBottom: { action: "move-job", args: { direction: "bottom" }, iconName: "mdi:arrow-collapse-down", labelKey: "action.moveBottom", variant: "icon" },
});

function decisionOf(vm, key) {
  return key === "saveAsTemplate" ? vm.saveAsTemplate : vm.actions[key];
}

function actionButton(context, vm, key, className = "") {
  const spec = ACTION[key];
  const decision = decisionOf(vm, key);
  return button({ action: spec.action, args: { jobId: vm.jobId, ...(spec.args || {}) }, label: context.t(spec.labelKey), iconName: spec.iconName, variant: spec.variant || "text", className, decision, reasonText: context.reason(decision) });
}

const visible = (vm, key) => decisionOf(vm, key) && decisionOf(vm, key).state !== "hidden";

// The footer follows the job row: the destructive action first and set apart — a waiting job is
// deleted, a started one cancelled, never both side by side (JOB-08) — with saving as a template;
// on a narrow card both sit in a menu, a cancel stays in sight. Editing comes next, and last the
// action that drives the run, start or retry.
function footer(context, vm) {
  const queued = vm.state === "queued";
  const [destructive] = (queued ? ["delete"] : ["cancel", "delete"]).filter((key) => visible(vm, key));
  const run = (queued ? ["start"] : ["retry"]).filter((key) => visible(vm, key));
  const item = (key, tone) => {
    const spec = ACTION[key];
    const decision = decisionOf(vm, key);
    return { action: spec.action, args: { jobId: vm.jobId, ...(spec.args || {}) }, label: context.t(spec.labelKey), iconName: spec.iconName, decision, reasonText: context.reason(decision), tone };
  };
  const lead = footerLead(context, {
    always: destructive === "cancel" ? actionButton(context, vm, "cancel") : "",
    items: [destructive === "delete" ? item("delete", "danger") : null, visible(vm, "saveAsTemplate") ? item("saveAsTemplate") : null],
    key: `detail:${vm.jobId}`,
    label: context.t("action.moreFor", { job: vm.title }),
    open: vm.menuOpen === true,
  });
  return [lead, ...["edit"].filter((key) => visible(vm, key)).map((key) => actionButton(context, vm, key)), ...run.map((key) => actionButton(context, vm, key))].join("");
}

// The queue position with the controls that change it.
function position(context, vm) {
  if (!vm.position) return "";
  const moves = ["moveTop", "moveBottom"].map((key) => actionButton(context, vm, key)).join("");
  return `<div class="voc-detail-position" data-key="position"><span>${e(context.t("detail.position", { position: vm.position }))}</span>${moves}</div>`;
}

// Why it waits, on the integration's three axes: the job itself, the robots, the queue (UI-06).
function waiting(context, vm) {
  if (!vm.waiting) return "";
  const axis = (key, title, entry) => {
    if (!entry) return "";
    const items = entry.items.length
      ? entry.items.map((item) => `<li data-key="${e(item.key)}"${item.ready === undefined ? "" : ` data-ready="${item.ready}"`}>${icon(item.ready ? "mdi:check-circle-outline" : item.never ? "mdi:close-circle-outline" : "mdi:alert-circle-outline")}<span>${e(item.text)}</span></li>`).join("")
      : `<li data-ready="true">${icon("mdi:check-circle-outline")}<span>${e(context.t("waiting.axis.ready"))}</span></li>`;
    return `<div class="voc-axis" data-key="axis:${key}" data-ready="${entry.ready}"><div class="voc-axis-title">${e(title)}</div><ul class="voc-reasons">${items}</ul></div>`;
  };
  const release = vm.releaseable.map((room) => button({ action: "open-release", args: { roomId: room.roomId }, label: context.t("detail.releaseRoom", { room: room.name }), iconName: "mdi:lock-open-variant-outline", decision: room.decision, reasonText: context.reason(room.decision), key: `release:${room.roomId}` })).join("");
  const content = `${axis("job", context.t("waiting.axis.job"), vm.waiting.job)}${release ? `<div class="voc-inline-actions">${release}</div>` : ""}${axis("robots", context.t("waiting.axis.robots"), vm.waiting.robots)}${axis("queue", context.t("waiting.axis.queue"), vm.waiting.queue)}`;
  return block(context.t("detail.readiness"), content, { iconName: "mdi:timer-sand", key: "readiness" });
}

// What a started job is doing.
function progress(context, vm) {
  const value = vm.progress;
  if (!value) return "";
  const bars = value.bars.map((bar) => `<div class="voc-job-percent" data-key="${e(bar.key)}"><span>${e(bar.label)}</span><span class="voc-progress" role="progressbar" aria-label="${e(bar.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e(bar.value)}"><span style="width:${e(bar.value)}%"></span></span><span>${e(bar.text)}</span></div>`).join("");
  const fault = value.fault ? `<p class="voc-job-status" data-tone="attention">${icon("mdi:wrench-clock")}<span>${e(value.fault.text)}</span></p>` : "";
  return block(context.t("detail.progress"), `<p class="voc-overlay-lead">${e(value.line)}</p>${bars}${fault}`, { iconName: "mdi:progress-clock", key: "progress" });
}

function execution(context, vm) {
  if (vm.executionLoading) return block(context.t("detail.robots"), loadingState(context), { iconName: "mdi:robot-vacuum", key: "execution" });
  if (!vm.execution?.length) return "";
  const groups = vm.execution
    .map((group) => `<div class="voc-phase" data-key="phase:${e(group.key)}"><div class="voc-phase-title">${e(group.title)}</div><ul class="voc-phase-robots">${group.robots
      .map((robot) => `<li data-key="${e(robot.key)}" data-eligible="${robot.eligible}">${icon(robot.eligible ? "mdi:check-circle" : "mdi:close-circle-outline")}<span class="voc-phase-robot">${e(robot.name)}</span><span class="voc-phase-reason">${e(robot.reason)}${robot.settings ? ` · ${e(robot.settings)}` : ""}</span></li>`)
      .join("")}</ul></div>`)
    .join("");
  return block(context.t("detail.robots"), `<p class="voc-overlay-lead">${e(context.t("detail.robotsLead"))}</p>${groups}`, { iconName: "mdi:robot-vacuum", key: "execution" });
}

// How a finished job ended, with the correction beside what it corrects.
function result(context, vm) {
  if (!vm.result) return "";
  const lines = vm.result.lines.map((line) => `<li data-key="${e(line.key)}"${line.tone ? ` data-tone="${e(line.tone)}"` : ""}>${icon(line.icon)}<span>${e(line.text)}</span></li>`);
  if (vm.result.corrected) lines.push(`<li data-key="corrected">${icon("mdi:pencil-outline")}<span>${e(context.t("detail.correctedAt", { when: vm.result.corrected }))}</span></li>`);
  const decision = vm.result.correct;
  const correct = decision && decision.state !== "hidden" ? `<div class="voc-inline-actions">${button({ action: "correct-job", args: { jobId: vm.jobId }, label: context.t("action.correctResult"), iconName: "mdi:clipboard-edit-outline", decision, reasonText: context.reason(decision) })}</div>` : "";
  return block(context.t("detail.result"), `<ul class="voc-reasons voc-result">${lines.join("")}</ul>${correct}`, { iconName: "mdi:flag-checkered", key: "result" });
}

function attempts(context, vm) {
  if (!vm.attempts.length) return "";
  const rows = vm.attempts.map((attempt) => `<li data-key="attempt:${e(attempt.key)}"><strong>${e(attempt.robot)}</strong><span>${e([attempt.state, attempt.quality, attempt.outcome, attempt.settings].filter(Boolean).join(" · "))}</span></li>`).join("");
  return block(context.t("detail.attempts"), `<ul class="voc-attempts">${rows}</ul>`, { iconName: "mdi:history", key: "attempts" });
}

// The log opens in place and, open, can be saved as the integration gave it, incidents included
// (DIA-06).
function trace(context, vm) {
  if (!vm.trace.length) return "";
  const toggle = `<button type="button" class="voc-disclosure" data-action="${e(vm.traceToggle.action)}" data-args="${e(JSON.stringify(vm.traceToggle.args))}" aria-expanded="${vm.traceOpen}">${icon(vm.traceOpen ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(context.t("detail.trace"))}</span></button>`;
  const save = vm.saveTrace && vm.traceOpen ? button({ action: vm.saveTrace.action, args: vm.saveTrace.args, label: context.t("action.saveTrace"), iconName: "mdi:download-outline", variant: "text", className: "voc-trace-save" }) : "";
  const rows = vm.traceOpen ? traceList(vm.trace) : "";
  return `<section class="voc-block" data-key="trace"><div class="voc-trace-head">${toggle}${save}</div>${rows}</section>`;
}

function missing(context, vm) {
  return vm.loading ? loadingState(context) : `<div class="voc-unavailable" data-key="missing">${icon("mdi:file-question-outline")}<div>${e(context.t("detail.missing"))}</div></div>`;
}

function detailContent(context, vm) {
  const summary = `<div class="voc-detail-summary" data-key="summary"><div class="voc-detail-line">${chip(vm.mode, { iconName: vm.modeIcon })}${vm.rooms.map((room) => chip(room, { iconName: "mdi:floor-plan" })).join("")}${vm.settings.map((setting) => chip(setting.text, { iconName: setting.icon, label: setting.label })).join("")}</div>${position(context, vm)}${vm.outcome ? `<div class="voc-job-outcome">${icon("mdi:alert-outline")}<span>${e(vm.outcome)}</span></div>` : ""}${vm.afterCancel ? `<div class="voc-job-outcome" data-key="after-cancel">${icon("mdi:home-import-outline")}<span>${e(vm.afterCancel)}</span></div>` : ""}</div>`;
  return `${summary}${result(context, vm)}${progress(context, vm)}${waiting(context, vm)}${execution(context, vm)}${attempts(context, vm)}${block(context.t("detail.details"), facts(vm.facts), { iconName: "mdi:information-outline", key: "facts" })}${trace(context, vm)}`;
}

export function renderJobDetail(context, vm) {
  if (!vm.jobId) return frame(context, { key: "job-detail", title: vm.title, content: missing(context, vm) });
  return frame(context, { key: "job-detail", title: vm.title, status: pill(vm.stateLabel, vm.stateTone), content: detailContent(context, vm), actions: footer(context, vm) });
}

// The same detail beside a wide queue's list: a region named by its heading, its actions at its end
// (LAY-03).
export function renderDetailPane(context, vm) {
  const head = `<header class="voc-pane-head"><h3 class="voc-pane-title" id="voc-pane-title">${e(vm.title)}</h3>${vm.jobId ? pill(vm.stateLabel, vm.stateTone) : ""}</header>`;
  const body = vm.jobId ? `${detailContent(context, vm)}<div class="voc-pane-actions">${footer(context, vm)}</div>` : missing(context, vm);
  return `<section class="voc-detail-pane" data-key="pane:${e(vm.jobId || "missing")}" role="region" aria-labelledby="voc-pane-title">${head}${body}</section>`;
}

export const jobDetailOverlay = Object.freeze({
  key: "job-detail",
  scopes: ({ overlay }) => [
    { name: "job", params: { jobId: overlay.jobId } },
    { name: "execution", params: { jobId: overlay.jobId } },
    { name: "trace", params: { jobId: overlay.jobId } },
    { name: "templates", params: {} },
  ],
  build: ({ model, texts, context, overlay, config, ui }) => buildJobDetail({ model, texts, context, overlay, config, menu: ui?.menu ?? null }),
  render: renderJobDetail,
  css: DETAIL_CSS,
});
