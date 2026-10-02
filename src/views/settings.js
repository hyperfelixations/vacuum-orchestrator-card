// The settings view. See internal dev doc §8 "Einstellungen".

import { buildSettingsView } from "../presentation/views/settings.js";
import { button, e } from "../render/primitives/markup.js";
import { block } from "./overlays/frame.js";
import { errorState, facts, loadingState } from "./parts.js";
import { SETTINGS_CSS } from "./styles/settings.js";

// The button keeps its visible name and is described by the setting it changes.
function graceSetting(context, grace) {
  const change = button({ action: "open-queue-settings", label: context.t("action.change"), iconName: "mdi:pencil-outline", decision: grace.decision, reasonText: context.reason(grace.decision), extra: ' aria-describedby="voc-setting-grace"' });
  return `<div class="voc-setting" data-key="setting:grace"><div class="voc-setting-text"><strong id="voc-setting-grace">${e(context.t("settings.grace"))}</strong><span>${e(context.t("settings.graceHint"))}</span></div><span class="voc-setting-value">${e(grace.value)}</span>${change}</div>`;
}

function queueBlock(context, vm) {
  let content = "";
  if (vm.error) content = errorState(context, vm.error);
  else if (vm.loading) content = loadingState(context);
  else if (vm.grace) content = graceSetting(context, vm.grace);
  return block(context.t("settings.queue"), content, { iconName: "mdi:format-list-numbered", key: "queue" });
}

function integrationBlock(context, vm) {
  const open = vm.integration.open
    ? `<div class="voc-inline-actions">${button({ action: "navigate", args: { path: vm.integration.open.path }, label: context.t("settings.openIntegration"), iconName: "mdi:open-in-app" })}</div>`
    : "";
  return block(context.t("settings.integration"), `<p class="voc-overlay-lead">${e(context.t("settings.integrationHint"))}</p>${facts(vm.integration.facts)}${open}`, { iconName: "mdi:puzzle-outline", key: "integration" });
}

export function renderSettings(context, vm) {
  return `<div class="voc-view voc-settings" data-key="view:settings">${queueBlock(context, vm)}${integrationBlock(context, vm)}</div>`;
}

export const settingsView = Object.freeze({
  key: "settings",
  icon: "mdi:cog-outline",
  requires: ["get_queue"],
  defaultEnabled: (model) => model.permissions?.isAdmin === true,
  optionsSchema: Object.freeze({}),
  primary: null,
  scopes: () => [],
  build: ({ model, texts, context }) => buildSettingsView({ model, texts, context }),
  render: renderSettings,
  css: SETTINGS_CSS,
});
