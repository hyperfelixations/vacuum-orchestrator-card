// The robots view. See internal dev doc §8 "Roboter".

import { boolOption } from "../config/option-schemas.js";
import { buildRobotsView } from "../presentation/views/robots.js";
import { button, chip, e, icon, pill } from "../render/primitives/markup.js";
import { emptyState, errorState, loadingState } from "./parts.js";
import { ROBOTS_CSS } from "./styles/robots.js";

function robotCard(context, robot) {
  const facts = robot.facts.map((fact) => `<span class="voc-robot-fact" data-key="fact:${e(fact.key)}" title="${e(fact.label)}">${icon(fact.icon)}<span class="voc-sr-only">${e(fact.label)}: </span>${e(fact.value)}</span>`).join("");
  const notes = [
    robot.disabled ? `<div class="voc-robot-note" data-key="disabled">${icon("mdi:pause-circle-outline")}<span>${e(context.t("robot.disabled"))}</span></div>` : "",
    robot.active ? `<div class="voc-robot-note" data-key="active" data-tone="running">${icon("mdi:progress-clock")}<span>${e(context.t("robot.active"))}</span></div>` : "",
    robot.error ? `<div class="voc-robot-note" data-key="error" data-tone="attention">${icon("mdi:alert-circle-outline")}<span>${e(context.t("robot.error", { error: robot.error }))}</span></div>` : "",
    robot.blocked && !robot.recovery ? `<div class="voc-robot-note" data-key="blocked" data-tone="attention">${icon("mdi:block-helper")}<span>${e(robot.blocked)}</span></div>` : "",
    robot.recovery ? `<div class="voc-robot-note" data-key="recovery" data-tone="attention">${icon("mdi:robot-vacuum-alert")}<span>${e(robot.recovery.reason)}</span>${button({ action: "open-recovery", args: { robotId: robot.robotId }, label: context.t("action.resolve"), variant: "primary", decision: robot.recovery.decision, reasonText: context.reason(robot.recovery.decision) })}</div>` : "",
    robot.unresolved ? `<div class="voc-robot-note" data-key="unresolved">${icon("mdi:help-circle-outline")}<span>${e(context.t("robot.unresolved"))}</span></div>` : "",
  ].join("");
  const operations = robot.operations.length ? `<div class="voc-robot-chips" data-key="operations">${robot.operations.map((operation) => chip(operation)).join("")}</div>` : "";
  const rooms = robot.rooms.length
    ? `<div class="voc-robot-line" data-key="rooms">${icon("mdi:floor-plan")}<span>${e(robot.rooms.join(", "))}</span></div>`
    : `<div class="voc-robot-line voc-room-warning" data-key="rooms">${icon("mdi:map-marker-question-outline")}<span>${e(context.t("robot.noRooms"))}</span></div>`;
  const levels = robot.levels.length ? `<div class="voc-robot-levels" data-key="levels">${robot.levels.map((level) => `<span>${e(level)}</span>`).join("")}</div>` : "";
  const choices = robot.mapChoices.length ? `<div class="voc-chips" data-key="map-choices">${robot.mapChoices.map((entry) => button({ action: "choose", args: { key: `map:${robot.robotId}`, value: entry.entityId }, label: entry.label, variant: "quiet", pressed: entry.selected, key: `map:${entry.entityId}` })).join("")}</div>` : "";
  const map = robot.map ? `<figure class="voc-robot-map" data-key="map"><img src="${e(context.resolveUrl(robot.map.picture))}" alt="${e(context.t("robot.mapAlt", { robot: robot.name, map: robot.map.label }))}" loading="lazy">${choices}</figure>` : "";
  const home = robot.actions.returnToDock.state === "hidden" ? "" : `<div class="voc-robot-actions" data-key="actions">${button({ action: "return-robot", args: { robotId: robot.robotId }, label: context.t("action.returnToDock"), iconName: "mdi:home-import-outline", variant: "text", decision: robot.actions.returnToDock, reasonText: context.reason(robot.actions.returnToDock) })}</div>`;
  const configure = button({ action: "edit-robot", args: { robotId: robot.robotId }, label: context.t("robot.settings", { robot: robot.name }), iconName: "mdi:cog-outline", variant: "icon", decision: robot.actions.configure, reasonText: context.reason(robot.actions.configure) });
  return `<article class="voc-robot" data-key="robot:${e(robot.robotId)}" data-tone="${e(robot.tone)}"><header class="voc-robot-head"><span class="voc-robot-icon" aria-hidden="true">${icon("mdi:robot-vacuum")}</span><div class="voc-robot-title"><h3 class="voc-robot-name">${e(robot.name)}</h3><div class="voc-robot-state">${pill(robot.state, robot.tone)}${robot.batteryText ? `<span class="voc-robot-battery">${icon("mdi:battery-outline")}${e(robot.batteryText)}</span>` : ""}</div></div>${configure}</header>${facts ? `<div class="voc-robot-facts">${facts}</div>` : ""}${notes}${home}${operations}${rooms}${levels}${map}</article>`;
}

export function renderRobots(context, vm) {
  if (vm.error) return `<div class="voc-view voc-robots" data-key="view:robots">${errorState(context, vm.error)}</div>`;
  if (vm.loading) return `<div class="voc-view voc-robots" data-key="view:robots">${loadingState(context)}</div>`;
  const discovered = vm.newCandidates
    ? `<div class="voc-alert voc-alert--info" data-key="candidates" role="status">${icon("mdi:magnify-scan")}<div class="voc-alert-text"><strong>${e(context.t("robot.discovered", { count: vm.newCandidates }))}</strong></div>${button({ action: "add-robot", label: context.t("action.addRobot"), iconName: "mdi:plus", variant: "primary", decision: vm.add, reasonText: context.reason(vm.add) })}</div>`
    : "";
  const cards = vm.robots.length ? `<div class="voc-robot-grid">${vm.robots.map((robot) => robotCard(context, robot)).join("")}</div>` : emptyState("mdi:robot-vacuum-variant", context.t("robot.empty"));
  return `<div class="voc-view voc-robots" data-key="view:robots">${discovered}${cards}</div>`;
}

export const robotsView = Object.freeze({
  key: "robots",
  icon: "mdi:robot-vacuum",
  requires: ["get_robots"],
  defaultEnabled: () => true,
  optionsSchema: Object.freeze({ show_map: boolOption(true), show_capabilities: boolOption(true) }),
  primary: Object.freeze({ action: "add-robot", icon: "mdi:plus", labelKey: "action.addRobot", operation: "add_robot", target: "create" }),
  scopes: () => [{ name: "candidates" }],
  build: ({ model, texts, context, options, ui }) => buildRobotsView({ model, texts, context, options, ui }),
  render: renderRobots,
  css: ROBOTS_CSS,
});
