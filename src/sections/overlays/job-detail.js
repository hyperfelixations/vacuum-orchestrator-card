// Job detail route. It reuses the domain action decision and never fabricates progress.

import { buildJobDetailViewModel } from "../../presentation/sections/job-detail-vm.js";
import { actionButton, e, errorBanner, renderSettings, setText, t } from "../render-utils.js";

const ACTIONS = [
  { key: "moveTop", action: "move-top", command: "move_job", direction: "top", iconName: "mdi:arrow-collapse-up" },
  { key: "moveBottom", action: "move-bottom", command: "move_job", direction: "bottom", iconName: "mdi:arrow-collapse-down" },
  { key: "edit", action: "edit-job", iconName: "mdi:pencil-outline" },
  { key: "delete", action: "delete-job", command: "delete_job", iconName: "mdi:delete-outline", confirm: true },
  { key: "start", action: "start-job", command: "start_job", iconName: "mdi:play-outline" },
  { key: "cancel", action: "cancel-job", command: "cancel_job", iconName: "mdi:stop-circle-outline", confirm: true },
  { key: "retry", action: "retry-job", command: "retry_job", iconName: "mdi:refresh" },
];

function actionMarkup(context, viewModel) {
  return ACTIONS.map((spec) => actionButton(context, {
    action: spec.action,
    state: viewModel.actions?.[spec.key],
    jobId: viewModel.jobId,
    direction: spec.direction,
    command: spec.command,
    confirm: spec.confirm,
    iconName: spec.iconName,
    label: t(context, `action.${spec.key}`),
    className: `voc-detail-action voc-detail-action-${spec.key}`,
  })).join("");
}

// The record fields in reading order, each with its translation key.
const FIELDS = Object.freeze([
  ["source", "job.field.source"],
  ["reason", "job.field.reason"],
  ["note", "job.field.note"],
  ["createdLabel", "job.field.createdAt"],
  ["updatedLabel", "job.field.updatedAt"],
  ["assignedRobotName", "job.field.assignedRobotId"],
  ["blockedReason", "job.field.blockedReason"],
  ["retriesJobId", "job.field.retriesJobId"],
]);

function fieldValue(viewModel, key) {
  const value = viewModel[key];
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function entityList(items) {
  return items.length ? `<ul>${items.map((item) => `<li>${e(item.label)}</li>`).join("")}</ul>` : "";
}

export const jobDetailOverlay = {
  key: "detail",

  build(model, texts, options = {}, ui) {
    return buildJobDetailViewModel({ model, texts, options, ui, job: options.job || ui?.selectedJob || null });
  },

  structureSignature(content) {
    // Values are patched; anything that adds or removes a node is listed here.
    if (!content.available) return "missing";
    const actions = Object.entries(content.actions).map(([key, value]) => `${key}:${value.state}:${value.reason || ""}`).join(",");
    const readiness = content.readiness
      ? `${content.readiness.state}:${[...content.readiness.failedOn, ...content.readiness.failedOff, ...content.readiness.unknown].map((item) => item.id).join(",")}`
      : "none";
    const progress = content.progress ? content.progress.units.map((unit) => `${unit.id}:${unit.state}:${unit.active ? 1 : 0}`).join(",") : "none";
    return [content.jobId, content.mode, content.areas.map((area) => area.id).join(","), readiness, progress, content.failureCode || "", content.requiredOn.length, content.requiredOff.length, actions].join("|");
  },

  render(context, viewModel) {
    const head = (status) =>
      `<header class="voc-overlay-head"><button type="button" class="voc-back-button" data-action="back">${e(t(context, "action.back"))}</button><h2 id="voc-detail-title" tabindex="-1">${e(viewModel.title)}</h2>${status}</header>`;
    if (!viewModel.available) {
      return `<section class="voc-overlay voc-job-detail" data-overlay="detail" role="region" aria-labelledby="voc-detail-title">${head("")}</section>`;
    }
    const progress = viewModel.progress
      ? `<section class="voc-detail-block"><h3>${e(t(context, "job.field.workUnits"))}</h3><div class="voc-detail-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${viewModel.progress.total}" aria-valuenow="${viewModel.progress.completed}" style="--voc-progress:${viewModel.progress.value ?? 0}"><span></span></div><ul>${viewModel.progress.units.map((unit) => `<li${unit.active ? ' aria-current="step"' : ""}>${e(unit.operation)}: ${e(unit.state)}</li>`).join("")}</ul></section>`
      : "";
    const readiness = viewModel.readiness
      ? `<section class="voc-detail-block"><h3>${e(t(context, "job.field.readiness"))}</h3><p class="voc-readiness-${e(viewModel.readiness.state)}">${e(viewModel.readiness.label)}</p>${entityList([...viewModel.readiness.failedOn, ...viewModel.readiness.failedOff, ...viewModel.readiness.unknown])}</section>`
      : "";
    const requirements = [
      [viewModel.requiredOn, "job.field.requiredOn"],
      [viewModel.requiredOff, "job.field.requiredOff"],
    ]
      .filter(([items]) => items.length)
      .map(([items, key]) => `<section class="voc-detail-block"><h3>${e(t(context, key))}</h3>${entityList(items)}</section>`)
      .join("");
    const fields = FIELDS.map(([key, labelKey]) => `<div data-detail-field="${key}"><dt>${e(t(context, labelKey))}</dt><dd>${e(fieldValue(viewModel, key))}</dd></div>`).join("");
    return `<section class="voc-overlay voc-job-detail" data-overlay="detail" data-overlay-job-id="${e(viewModel.jobId)}" role="region" aria-labelledby="voc-detail-title">${head(`<span class="voc-overlay-status">${e(viewModel.stateLabel)}</span>`)}<div class="voc-detail-body"><div class="voc-detail-summary"><span>${e(viewModel.modeLabel)}</span><span>${e(viewModel.areas.map((area) => area.label).join(", "))}</span>${renderSettings(viewModel.row.settings, context)}</div>${viewModel.failureCode ? errorBanner(context, { code: viewModel.failureCode }) : ""}${readiness}${progress}<dl class="voc-detail-fields">${fields}</dl>${requirements}</div><div class="voc-detail-actions">${actionMarkup(context, viewModel)}</div></section>`;
  },

  patch(context, root, viewModel) {
    const section = root?.matches?.(".voc-job-detail") ? root : root?.querySelector?.(".voc-job-detail");
    if (!section || !viewModel.available) return;
    setText(section, "#voc-detail-title", viewModel.title);
    setText(section, ".voc-overlay-status", viewModel.stateLabel);
    for (const [key] of FIELDS) setText(section, `[data-detail-field="${key}"] dd`, fieldValue(viewModel, key));
    const progress = section.querySelector(".voc-detail-progress");
    if (progress && viewModel.progress) {
      progress.setAttribute("aria-valuenow", String(viewModel.progress.completed));
      progress.style.setProperty("--voc-progress", String(viewModel.progress.value ?? 0));
    }
  },
};

export default jobDetailOverlay;
