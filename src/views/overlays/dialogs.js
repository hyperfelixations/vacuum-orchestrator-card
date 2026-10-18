// Card dialogs: confirmation, cancelling a started job, ending the queue, robot choice for a
// direct start, the queue's waiting time and recovery resolution.

import { buildCancelJob, buildConfirm, buildCorrectJob, buildQueueEnd, buildQueueSettings, buildRecovery, buildStartJob } from "../../presentation/overlays/dialogs.js";
import { argsAttr, button, decisionAttributes, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { loadingState } from "../parts.js";
import { dialog } from "./dialog.js";
import { FORMS_CSS } from "../styles/forms.js";

export const DIALOGS_CSS = `
.voc-choices { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.voc-choice { display: flex; align-items: center; gap: 12px; width: 100%; min-height: var(--voc-icon-target); padding: 10px 12px; border: 1px solid var(--divider-color); border-radius: 12px; background: transparent; color: var(--primary-text-color); font: inherit; text-align: start; cursor: pointer; }
.voc-choice > ha-icon { --mdc-icon-size: 22px; color: var(--voc-muted); }
.voc-choice:hover { background: var(--voc-chip-bg); }
.voc-choice:focus-visible { outline: 2px solid var(--voc-accent-ink); outline-offset: 2px; }
.voc-choice:disabled, .voc-choice[aria-disabled="true"] { opacity: .55; cursor: not-allowed; }
.voc-choice--primary { border-color: var(--voc-accent-border); background: var(--voc-accent-soft); }
.voc-choice--primary > ha-icon { color: var(--voc-accent-ink); }
.voc-choice-text { display: grid; gap: 2px; min-width: 0; }
.voc-choice-label { font-size: 14px; font-weight: 750; line-height: 20px; }
.voc-choice-note { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 650; color: var(--voc-muted); }
.voc-choice-note ha-icon { --mdc-icon-size: 15px; }
.voc-choice-note[data-eligible="true"] { color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
`;

export const confirmOverlay = Object.freeze({
  key: "confirm",
  dialog: true,
  build: ({ model, texts, overlay }) => buildConfirm({ model, texts, overlay }),
  render(context, vm) {
    const actions = `${button({ action: "back", label: context.t("action.keep"), variant: "quiet", extra: " data-autofocus" })}${button({ action: "confirm-command", label: vm.confirmLabel, iconName: vm.confirmIcon, variant: vm.tone === "danger" ? "danger" : "primary", decision: vm.pending ? { state: "disabled", reason: "command_pending" } : null })}`;
    return dialog(context, { key: "confirm", title: vm.title, lead: vm.text, actions });
  },
});

// A choice before a command: going back on the left, the confirming action on the right.
function choiceDialog(context, vm, { action, iconName, variant }) {
  const actions = `${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action, label: vm.confirmLabel, iconName, variant, decision: vm.pending ? { state: "disabled", reason: "command_pending" } : null })}`;
  return dialog(context, { key: vm.key, title: vm.title, lead: vm.lead, content: `<div class="voc-form">${renderField(context, vm.field)}</div>`, actions });
}

export const cancelJobOverlay = Object.freeze({
  key: "cancel-job",
  dialog: true,
  build: ({ model, texts, overlay }) => buildCancelJob({ model, texts, overlay }),
  render: (context, vm) => choiceDialog(context, vm, { action: "confirm-cancel", iconName: "mdi:stop-circle-outline", variant: "danger" }),
  css: FORMS_CSS,
});

export const correctJobOverlay = Object.freeze({
  key: "correct-job",
  dialog: true,
  build: ({ model, texts, overlay }) => buildCorrectJob({ model, texts, overlay }),
  render: (context, vm) => choiceDialog(context, vm, { action: "confirm-correct", iconName: "mdi:check", variant: "primary" }),
  css: FORMS_CSS,
});

export const queueEndOverlay = Object.freeze({
  key: "queue-end",
  dialog: true,
  build: ({ model, texts, overlay }) => buildQueueEnd({ model, texts, overlay }),
  render: (context, vm) => choiceDialog(context, vm, { action: "confirm-end-queue", iconName: "mdi:stop", variant: "primary" }),
  css: FORMS_CSS,
});

// A choice is one row that starts at once: what it is and, below, why it fits or not.
function choiceRow(context, vm, { key, args, iconName, label, note, eligible = null, primary = false }) {
  if (vm.decision?.state === "hidden") return "";
  const mark = eligible === null ? "" : icon(eligible ? "mdi:check-circle-outline" : "mdi:information-outline");
  const reason = note ? `<span class="voc-choice-note"${eligible === null ? "" : ` data-eligible="${eligible}"`}>${mark}${e(note)}</span>` : "";
  return `<li data-key="robot:${e(key)}"><button type="button" class="voc-choice${primary ? " voc-choice--primary" : ""}" data-action="start-job"${argsAttr(args)}${decisionAttributes(vm.decision, context.reason(vm.decision))}>${icon(iconName)}<span class="voc-choice-text"><span class="voc-choice-label">${e(label)}</span>${reason}</span></button></li>`;
}

export const startJobOverlay = Object.freeze({
  key: "start-job",
  dialog: true,
  scopes: ({ overlay }) => [{ name: "execution", params: { jobId: overlay.jobId } }],
  build: ({ model, texts, context, overlay }) => buildStartJob({ model, texts, context, overlay }),
  render(context, vm) {
    const automatic = choiceRow(context, vm, { key: "auto", args: { jobId: vm.jobId, choose: false }, iconName: "mdi:auto-fix", label: context.t("start.automatic"), note: context.t("start.automaticNote"), primary: true });
    const robots = vm.robots.map((robot) => choiceRow(context, vm, { key: robot.key, args: { jobId: vm.jobId, robotId: robot.robotId, choose: false }, iconName: "mdi:robot-vacuum", label: robot.name, note: robot.note, eligible: robot.eligible })).join("");
    const content = `${vm.loading ? loadingState(context) : ""}<ul class="voc-choices">${automatic}${robots}</ul>`;
    return dialog(context, { key: "start-job", title: vm.title, lead: vm.lead, content, actions: button({ action: "back", label: context.t("action.back"), variant: "quiet" }) });
  },
  css: DIALOGS_CSS,
});

export const queueSettingsOverlay = Object.freeze({
  key: "queue-settings",
  dialog: true,
  build: ({ texts, context, overlay }) => buildQueueSettings({ texts, context, overlay }),
  render(context, vm) {
    const actions = `${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action: "save-queue-settings", label: context.t("action.save"), iconName: "mdi:check", variant: "primary", decision: vm.save, reasonText: context.reason(vm.save) })}`;
    return dialog(context, { key: "queue-settings", title: vm.title, lead: context.t("queueSettings.lead"), invalid: vm.invalid, content: `<div class="voc-form">${vm.fields.map((field) => renderField(context, field)).join("")}</div>`, actions });
  },
});

export const recoveryOverlay = Object.freeze({
  key: "recovery",
  dialog: true,
  build: ({ model, texts, context, overlay }) => buildRecovery({ model, texts, context, overlay }),
  render(context, vm) {
    const confirm = renderField(context, { key: "overlay:confirmStopped", label: context.t("recovery.confirmLabel"), control: "switch", value: vm.confirmStopped, switchLabel: context.t("recovery.confirmSwitch"), hint: context.t("recovery.confirmHint") });
    const content = `<div class="voc-block" data-key="recovery-facts"><p class="voc-overlay-lead">${e(vm.reason)}</p><p class="voc-overlay-lead">${e(context.t("recovery.explanation"))}</p>${vm.open ? confirm : ""}</div>`;
    const actions = `${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${vm.open ? button({ action: "resolve-recovery", label: context.t("recovery.resolve"), iconName: "mdi:check", variant: "primary", decision: vm.decision, reasonText: context.reason(vm.decision) }) : ""}`;
    return dialog(context, { key: "recovery", title: vm.title, content, actions });
  },
});
