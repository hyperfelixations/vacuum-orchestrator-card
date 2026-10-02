// Confirmation, robot choice for a direct start, and recovery resolution.

import { buildConfirm, buildQueueSettings, buildRecovery, buildStartJob } from "../../presentation/overlays/dialogs.js";
import { button, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { loadingState } from "../parts.js";
import { frame } from "./frame.js";

export const DIALOGS_CSS = `
.voc-choices { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.voc-choices li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.voc-choice-note { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 650; color: var(--voc-muted); }
.voc-choice-note ha-icon { --mdc-icon-size: 15px; width: 15px; height: 15px; }
.voc-choice-note[data-eligible="true"] { color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
`;

export const confirmOverlay = Object.freeze({
  key: "confirm",
  build: ({ model, texts, overlay }) => buildConfirm({ model, texts, overlay }),
  render(context, vm) {
    const actions = `${button({ action: "back", label: context.t("action.keep"), variant: "quiet", extra: " data-autofocus" })}${button({ action: "confirm-command", label: vm.confirmLabel, iconName: vm.confirmIcon, variant: vm.tone === "danger" ? "danger" : "primary", decision: vm.pending ? { state: "disabled", reason: "command_pending" } : null })}`;
    return frame(context, { key: "confirm", title: vm.title, lead: vm.text, actions, dialog: true });
  },
});

export const startJobOverlay = Object.freeze({
  key: "start-job",
  scopes: ({ overlay }) => [{ name: "execution", params: { jobId: overlay.jobId } }],
  build: ({ model, texts, context, overlay }) => buildStartJob({ model, texts, context, overlay }),
  render(context, vm) {
    const automatic = `<li data-key="robot:auto">${button({ action: "start-job", args: { jobId: vm.jobId, choose: false }, label: context.t("start.automatic"), iconName: "mdi:auto-fix", variant: "primary", decision: vm.decision, reasonText: context.reason(vm.decision) })}<span class="voc-choice-note">${e(context.t("start.automaticNote"))}</span></li>`;
    const robots = vm.robots
      .map((robot) => `<li data-key="robot:${e(robot.key)}">${button({ action: "start-job", args: { jobId: vm.jobId, robotId: robot.robotId, choose: false }, label: robot.name, iconName: "mdi:robot-vacuum", decision: vm.decision, reasonText: context.reason(vm.decision) })}${robot.note ? `<span class="voc-choice-note" data-eligible="${robot.eligible}">${icon(robot.eligible ? "mdi:check-circle-outline" : "mdi:information-outline")}${e(robot.note)}</span>` : ""}</li>`)
      .join("");
    const content = `${vm.loading ? loadingState(context) : ""}<ul class="voc-choices">${automatic}${robots}</ul>`;
    return frame(context, { key: "start-job", title: vm.title, lead: vm.lead, content, dialog: true });
  },
  css: DIALOGS_CSS,
});

export const queueSettingsOverlay = Object.freeze({
  key: "queue-settings",
  build: ({ texts, context, overlay }) => buildQueueSettings({ texts, context, overlay }),
  render(context, vm) {
    const actions = `${button({ action: "back", label: context.t("action.cancel"), variant: "quiet" })}${button({ action: "save-queue-settings", label: context.t("action.save"), iconName: "mdi:check", variant: "primary", decision: vm.save, reasonText: context.reason(vm.save) })}`;
    return frame(context, { key: "queue-settings", title: vm.title, lead: context.t("queueSettings.lead"), content: `<div class="voc-form">${renderField(context, vm.field)}</div>`, actions, dialog: true });
  },
});

export const recoveryOverlay = Object.freeze({
  key: "recovery",
  build: ({ model, texts, context, overlay }) => buildRecovery({ model, texts, context, overlay }),
  render(context, vm) {
    const confirm = renderField(context, { key: "overlay:confirmStopped", label: context.t("recovery.confirmLabel"), control: "switch", value: vm.confirmStopped, switchLabel: context.t("recovery.confirmSwitch"), hint: context.t("recovery.confirmHint") });
    const content = `<div class="voc-block" data-key="recovery-facts"><p class="voc-overlay-lead">${e(vm.reason)}</p><p class="voc-overlay-lead">${e(context.t("recovery.explanation"))}</p>${vm.open ? confirm : ""}</div>`;
    const actions = `${button({ action: "back", label: context.t("action.cancel"), variant: "quiet" })}${vm.open ? button({ action: "resolve-recovery", label: context.t("recovery.resolve"), iconName: "mdi:check", variant: "primary", decision: vm.decision, reasonText: context.reason(vm.decision) }) : ""}`;
    return frame(context, { key: "recovery", title: vm.title, content, actions, dialog: true });
  },
});
