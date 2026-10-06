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

function defaultsBlock(context, vm) {
  if (!vm.defaults) return "";
  const change = button({ action: "open-job-defaults", label: context.t("action.change"), iconName: "mdi:pencil-outline", decision: vm.defaults.decision, reasonText: context.reason(vm.defaults.decision), extra: ' aria-describedby="voc-setting-defaults"' });
  const builtIn = vm.defaults.builtIn ? `<span class="voc-setting-value" data-key="built-in">${e(vm.defaults.builtIn)}</span>` : "";
  const head = `<div class="voc-setting" data-key="setting:defaults"><div class="voc-setting-text"><strong id="voc-setting-defaults">${e(context.t("settings.defaults"))}</strong><span>${e(context.t("settings.defaultsHint"))}</span></div>${builtIn}${change}</div>`;
  return block(context.t("settings.defaults"), `${head}${facts(vm.defaults.facts)}`, { iconName: "mdi:tune-variant", key: "defaults" });
}

function queueBlock(context, vm) {
  let content = "";
  if (vm.error) content = errorState(context, vm.error);
  else if (vm.loading) content = loadingState(context);
  else if (vm.grace) content = graceSetting(context, vm.grace);
  return block(context.t("settings.queue"), content, { iconName: "mdi:format-list-numbered", key: "queue" });
}

function integrationBlock(context, vm) {
  const actions = [
    vm.integration.setup ? button({ action: vm.integration.setup.action, label: context.t("settings.openSetup"), iconName: "mdi:clipboard-check-outline" }) : "",
    vm.integration.open ? button({ action: "navigate", args: { path: vm.integration.open.path }, label: context.t("settings.openIntegration"), iconName: "mdi:open-in-app" }) : "",
  ].join("");
  const open = actions ? `<div class="voc-inline-actions">${actions}</div>` : "";
  return block(context.t("settings.integration"), `<p class="voc-overlay-lead">${e(context.t("settings.integrationHint"))}</p>${facts(vm.integration.facts)}${open}`, { iconName: "mdi:puzzle-outline", key: "integration" });
}

function cardBlock(context, vm) {
  return block(context.t("settings.card"), facts(vm.card.facts), { iconName: "mdi:card-text-outline", key: "card" });
}

export function renderSettings(context, vm) {
  return `<div class="voc-view voc-settings" data-key="view:settings">${defaultsBlock(context, vm)}${queueBlock(context, vm)}${integrationBlock(context, vm)}${cardBlock(context, vm)}</div>`;
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
