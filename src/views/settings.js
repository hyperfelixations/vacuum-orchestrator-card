// The settings view. See internal dev doc §8 "Einstellungen".

import { buildSettingsView } from "../presentation/views/settings.js";
import { button, e } from "../render/primitives/markup.js";
import { block } from "./overlays/frame.js";
import { errorState, facts, loadingState } from "./parts.js";
import { SETTINGS_CSS } from "./styles/settings.js";

// One title per section; its one "Change" stands in the heading, named by the section (LAY-08).
function change(context, action, decision, section) {
  return button({ action, label: context.t("action.change"), iconName: "mdi:pencil-outline", variant: "text", decision, reasonText: context.reason(decision), extra: ` aria-describedby="${e(section)}"` });
}

function section(context, { key, iconName, title, action = "", content }) {
  const id = `voc-settings-${key}`;
  return block(title, content, { iconName, key, id, action: action ? action(id) : "" });
}

function defaultsBlock(context, vm) {
  if (!vm.defaults) return "";
  const builtIn = vm.defaults.builtIn ? `<p class="voc-settings-note" data-key="built-in">${e(vm.defaults.builtIn)}</p>` : "";
  return section(context, {
    key: "defaults",
    iconName: "mdi:tune-variant",
    title: context.t("settings.defaults"),
    action: (id) => change(context, "open-job-defaults", vm.defaults.decision, id),
    content: `<p class="voc-overlay-lead">${e(context.t("settings.defaultsHint"))}</p>${builtIn}${facts(vm.defaults.facts)}`,
  });
}

function queueBlock(context, vm) {
  let content = "";
  if (vm.error) content = errorState(context, vm.error);
  else if (vm.loading) content = loadingState(context);
  else if (vm.queue) content = `<p class="voc-overlay-lead">${e(context.t("settings.queueHint"))}</p>${facts(vm.queue.facts)}`;
  return section(context, { key: "queue", iconName: "mdi:format-list-numbered", title: context.t("settings.queue"), action: vm.queue ? (id) => change(context, "open-queue-settings", vm.queue.decision, id) : "", content });
}

function roomsBlock(context, vm) {
  if (!vm.rooms) return "";
  return section(context, {
    key: "rooms",
    iconName: "mdi:sort",
    title: context.t("settings.rooms"),
    action: (id) => change(context, "open-room-order", vm.rooms.decision, id),
    content: `<p class="voc-overlay-lead">${e(context.t("settings.roomsHint"))}</p>${facts(vm.rooms.facts)}`,
  });
}

// "About": the integration and the card, with the ways into the setup and Home Assistant.
function aboutBlock(context, vm) {
  const actions = [
    vm.about.setup ? button({ action: vm.about.setup.action, label: context.t("settings.openSetup"), iconName: "mdi:clipboard-check-outline" }) : "",
    vm.about.open ? button({ action: "navigate", args: { path: vm.about.open.path }, label: context.t("settings.openIntegration"), iconName: "mdi:open-in-app" }) : "",
  ].join("");
  const open = actions ? `<div class="voc-inline-actions">${actions}</div>` : "";
  return section(context, { key: "about", iconName: "mdi:information-outline", title: context.t("settings.about"), content: `<p class="voc-overlay-lead">${e(context.t("settings.integrationHint"))}</p>${facts(vm.about.facts)}${open}` });
}

export function renderSettings(context, vm) {
  return `<div class="voc-view voc-settings" data-key="view:settings">${defaultsBlock(context, vm)}${queueBlock(context, vm)}${roomsBlock(context, vm)}${aboutBlock(context, vm)}</div>`;
}

export const settingsView = Object.freeze({
  key: "settings",
  icon: "mdi:cog-outline",
  requires: ["get_queue"],
  defaultEnabled: (model) => model.permissions?.canCommand !== false,
  optionsSchema: Object.freeze({}),
  primary: null,
  scopes: () => [],
  build: ({ model, texts, context }) => buildSettingsView({ model, texts, context }),
  render: renderSettings,
  css: SETTINGS_CSS,
});
