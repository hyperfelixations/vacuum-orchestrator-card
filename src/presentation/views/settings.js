// The settings view: the integration's one integration-wide setting, the queue run's wait time,
// where the integration lives in Home Assistant, and the running card version. Robots, rooms and
// templates keep their own views. See internal dev doc §8 "Einstellungen".

import { CARD_VERSION } from "../../core/card-metadata.js";
import { queueAffordances } from "../../domain/affordances.js";
import { INTEGRATION_PAGE_PATH } from "../common/links.js";
import { slotData } from "../common/lookups.js";
import { number, seconds, t } from "../common/texts.js";

export function buildSettingsView({ model, texts, context }) {
  const queue = slotData(model, "queue");
  const status = model.slots?.queue?.status ?? "idle";
  const graceSeconds = queue?.graceSeconds;
  return {
    key: "settings",
    loading: !queue && (status === "loading" || status === "idle"),
    error: !queue ? model.slots?.queue?.error ?? null : null,
    grace: Number.isFinite(graceSeconds)
      ? { value: graceSeconds > 0 ? seconds(texts, graceSeconds) : t(texts, "settings.graceOff"), decision: queueAffordances(queue.mode, context).configure }
      : null,
    integration: {
      facts: [
        { label: t(texts, "settings.version"), value: model.integrationVersion || null },
        { label: t(texts, "settings.apiVersion"), value: Number.isInteger(model.apiVersion) ? number(texts, model.apiVersion) : null },
      ],
      open: model.permissions?.isAdmin ? { path: INTEGRATION_PAGE_PATH } : null,
    },
    card: { facts: [{ label: t(texts, "settings.version"), value: CARD_VERSION }] },
  };
}
