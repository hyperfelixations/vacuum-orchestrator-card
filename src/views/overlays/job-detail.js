// The job detail page.

import { buildJobDetail } from "../../presentation/overlays/job-detail.js";
import { button, chip, e, icon, pill } from "../../render/primitives/markup.js";
import { facts, loadingState, traceList } from "../parts.js";
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

// The footer follows the job row: destructive actions first and set apart (withdrawing a waiting
// job is one of them), editing and saving as a template next, and last the action that drives the
// run — start, cancel of a started job, or retry — where the row keeps it too.
function footer(context, vm) {
  const queued = vm.state === "queued";
  const lead = ["delete", ...(queued ? ["cancel"] : [])].filter((key) => visible(vm, key));
  const run = (queued ? ["start"] : ["cancel", "retry"]).filter((key) => visible(vm, key));
  return [
    ...lead.map((key, index) => actionButton(context, vm, key, index === lead.length - 1 ? "voc-action-start" : "")),
    ...["saveAsTemplate", "edit"].filter((key) => visible(vm, key)).map((key) => actionButton(context, vm, key)),
    ...run.map((key) => actionButton(context, vm, key)),
  ].join("");
}

// The queue position with the controls that change it.
function position(context, vm) {
  if (!vm.position) return "";
  const moves = ["moveTop", "moveBottom"].map((key) => actionButton(context, vm, key)).join("");
  return `<div class="voc-detail-position" data-key="position"><span>${e(context.t("detail.position", { position: vm.position }))}</span>${moves}</div>`;
}

function readiness(context, vm) {
  if (!vm.readiness) return "";
  const icons = { ready: "mdi:check-circle-outline", blocked: "mdi:lock-outline", unknown: "mdi:help-circle-outline" };
  const reasons = vm.readiness.reasons.length
    ? `<ul class="voc-reasons">${vm.readiness.reasons.map((reason) => `<li>${icon("mdi:alert-circle-outline")}<span>${e(reason)}</span></li>`).join("")}</ul>`
    : `<p class="voc-detail-ok">${icon(icons.ready)}<span>${e(context.t("detail.readyText"))}</span></p>`;
  const release = vm.releaseable.map((room) => button({ action: "open-release", args: { roomId: room.roomId }, label: context.t("detail.releaseRoom", { room: room.name }), iconName: "mdi:lock-open-variant-outline", decision: room.decision, reasonText: context.reason(room.decision), key: `release:${room.roomId}` })).join("");
  return block(context.t("detail.readiness"), `${reasons}${release ? `<div class="voc-inline-actions">${release}</div>` : ""}`, { iconName: icons[vm.readiness.state], key: "readiness" });
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

function attempts(context, vm) {
  if (!vm.attempts.length) return "";
  const rows = vm.attempts.map((attempt) => `<li data-key="attempt:${e(attempt.key)}"><strong>${e(attempt.robot)}</strong><span>${e([attempt.state, attempt.quality, attempt.outcome, attempt.settings].filter(Boolean).join(" · "))}</span></li>`).join("");
  return block(context.t("detail.attempts"), `<ul class="voc-attempts">${rows}</ul>`, { iconName: "mdi:history", key: "attempts" });
}

function trace(context, vm) {
  if (!vm.trace.length) return "";
  const toggle = `<button type="button" class="voc-disclosure" data-action="set-overlay" data-args="${e(JSON.stringify({ traceOpen: !vm.traceOpen }))}" aria-expanded="${vm.traceOpen}">${icon(vm.traceOpen ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(context.t("detail.trace"))}</span></button>`;
  const rows = vm.traceOpen ? traceList(vm.trace) : "";
  return `<section class="voc-block" data-key="trace">${toggle}${rows}</section>`;
}

export function renderJobDetail(context, vm) {
  if (!vm.jobId) {
    const content = vm.loading ? loadingState(context) : `<div class="voc-unavailable" data-key="missing">${icon("mdi:file-question-outline")}<div>${e(context.t("detail.missing"))}</div></div>`;
    return frame(context, { key: "job-detail", title: vm.title, content });
  }
  const summary = `<div class="voc-detail-summary" data-key="summary"><div class="voc-detail-line">${chip(vm.mode, { iconName: "mdi:broom" })}${vm.rooms.map((room) => chip(room, { iconName: "mdi:floor-plan" })).join("")}${vm.settings.map((setting) => chip(setting.text, { iconName: setting.icon, label: setting.label })).join("")}</div>${position(context, vm)}${vm.outcome ? `<div class="voc-job-outcome">${icon("mdi:alert-outline")}<span>${e(vm.outcome)}</span></div>` : ""}${vm.afterCancel ? `<div class="voc-job-outcome" data-key="after-cancel">${icon("mdi:home-import-outline")}<span>${e(vm.afterCancel)}</span></div>` : ""}</div>`;
  const actions = footer(context, vm);
  const content = `${summary}${readiness(context, vm)}${execution(context, vm)}${attempts(context, vm)}${block(context.t("detail.details"), facts(vm.facts), { iconName: "mdi:information-outline", key: "facts" })}${trace(context, vm)}`;
  return frame(context, { key: "job-detail", title: vm.title, status: pill(vm.stateLabel, vm.stateTone), content, actions });
}

export const jobDetailOverlay = Object.freeze({
  key: "job-detail",
  scopes: ({ overlay }) => [
    { name: "job", params: { jobId: overlay.jobId } },
    { name: "execution", params: { jobId: overlay.jobId } },
    { name: "trace", params: { jobId: overlay.jobId } },
    { name: "templates", params: {} },
  ],
  build: ({ model, texts, context, overlay, config }) => buildJobDetail({ model, texts, context, overlay, config }),
  render: renderJobDetail,
  css: DETAIL_CSS,
});
