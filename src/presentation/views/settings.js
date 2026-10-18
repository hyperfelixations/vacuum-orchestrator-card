// The settings view: the integration-wide settings — the defaults for new jobs, the queue's start
// delay and its wait before a run ends — and "About": the integration, where it lives in Home
// Assistant, and the running card. Robots, rooms and templates keep their own views. See internal
// dev doc §8 "Einstellungen".

import { CARD_VERSION } from "../../core/card-metadata.js";
import { QUEUE_TARGET, decide } from "../../domain/affordances.js";
import { MODE_SETTINGS } from "../../domain/job-schema.js";
import { INTEGRATION_PAGE_PATH } from "../common/links.js";
import { slotData } from "../common/lookups.js";
import { modeLabel, number, policyLabel, seconds, settingLabel, settingName, t } from "../common/texts.js";

// The defaults as facts: the mode, the settings any mode uses, passes and policy.
function defaultsFacts(texts, defaults) {
  const settings = MODE_SETTINGS.vacuum_and_mop.map((field) => ({ label: settingName(texts, field), value: settingLabel(texts, field, defaults[field]) }));
  return [
    { label: t(texts, "field.mode"), value: modeLabel(texts, defaults.mode) },
    ...settings,
    { label: t(texts, "field.passes"), value: number(texts, defaults.passes) },
    { label: t(texts, "field.settingsPolicy"), value: policyLabel(texts, defaults.settingsPolicy) },
  ];
}

export function buildSettingsView({ model, texts, context }) {
  const queue = slotData(model, "queue");
  const status = model.slots?.queue?.status ?? "idle";
  const graceSeconds = queue?.graceSeconds;
  const delaySeconds = queue?.startDelaySeconds;
  return {
    key: "settings",
    loading: !queue && (status === "loading" || status === "idle"),
    error: !queue ? model.slots?.queue?.error ?? null : null,
    defaults: queue?.jobDefaults
      ? {
          facts: defaultsFacts(texts, queue.jobDefaults),
          builtIn: queue.jobDefaults.configured ? null : t(texts, "settings.defaultsBuiltIn"),
          decision: decide(context, { operation: "configure_job_defaults", target: QUEUE_TARGET }),
        }
      : null,
    queue: Number.isFinite(graceSeconds)
      ? {
          facts: [
            { key: "grace", label: t(texts, "settings.grace"), value: graceSeconds > 0 ? seconds(texts, graceSeconds) : t(texts, "settings.graceOff") },
            { key: "startDelay", label: t(texts, "settings.startDelay"), value: Number.isFinite(delaySeconds) ? (delaySeconds > 0 ? seconds(texts, delaySeconds) : t(texts, "settings.startDelayOff")) : null },
          ],
          decision: decide(context, { operation: "configure_queue", target: QUEUE_TARGET }),
        }
      : null,
    about: {
      facts: [
        { key: "integration", label: t(texts, "settings.integrationVersion"), value: model.integrationVersion || null },
        { key: "api", label: t(texts, "settings.apiVersion"), value: Number.isInteger(model.apiVersion) ? number(texts, model.apiVersion) : null },
        { key: "card", label: t(texts, "settings.cardVersion"), value: CARD_VERSION },
      ],
      open: model.permissions?.isAdmin ? { path: INTEGRATION_PAGE_PATH } : null,
      setup: model.setup ? { action: "open-setup" } : null,
    },
  };
}
