// The setup assistant view. See internal dev doc §8 "Einrichtung".

import { SETUP_STEP_CHOICE, buildSetupView, setupFirst, setupOffered } from "../presentation/views/setup.js";
import { argsAttr, button, e, icon } from "../render/primitives/markup.js";
import { errorState, loadingState } from "./parts.js";
import { frame } from "./overlays/frame.js";
import { SETUP_CSS } from "./styles/setup.js";

function itemList(rows) {
  return rows.length ? `<ul class="voc-setup-items">${rows.join("")}</ul>` : "";
}

function item(key, name, detail, action) {
  return `<li data-key="${e(key)}"><div class="voc-setup-item-text"><strong>${e(name)}</strong>${detail ? `<span>${e(detail)}</span>` : ""}</div>${action}</li>`;
}

function more(context, count) {
  return count ? `<p class="voc-setup-more">${e(context.t("setup.more", { count }))}</p>` : "";
}

function link(context, step) {
  return `<div class="voc-inline-actions">${button({ action: step.link.action, args: step.link.args, label: step.link.label, iconName: step.link.icon, decision: step.link.decision, reasonText: step.link.decision ? context.reason(step.link.decision) : null })}</div>`;
}

const BODIES = Object.freeze({
  robots: (context, step) =>
    itemList([
      ...step.robots.map((robot) => item(`robot:${robot.key}`, robot.name, "", button({ action: robot.rename.action, args: { robotId: robot.robotId }, label: context.t("action.rename"), iconName: "mdi:rename-outline", decision: robot.rename.decision, reasonText: context.reason(robot.rename.decision) }))),
      ...step.candidates.map((candidate) => item(`candidate:${candidate.key}`, candidate.name, candidate.detail, button({ action: "add-candidate", args: { entityId: candidate.entityId }, label: context.t("action.addRobot"), iconName: "mdi:plus", variant: "primary", decision: candidate.decision, reasonText: context.reason(candidate.decision) }))),
    ]),
  rooms: (context, step) =>
    `${step.uncovered.length ? `<p class="voc-setup-label">${e(context.t("setup.step.rooms.uncovered"))}</p>` : ""}${itemList(step.uncovered.map((room) => item(`room:${room.key}`, room.name, null, button({ action: "edit-room", args: { roomId: room.roomId }, label: context.t("setup.step.rooms.assign"), iconName: "mdi:map-marker-plus-outline", decision: room.decision, reasonText: context.reason(room.decision) }))))}${more(context, step.more)}`,
  defaults: (context, step) => link(context, step),
  queue: (context, step) => link(context, step),
});

// A collapsed step opens through its title; a mark says where the built-in defaults apply.
function stepCard(context, step) {
  const marker = `<span>${e(step.number)}</span>`;
  const marks = step.builtIn ? `<span class="voc-setup-mark" data-tone="default">${e(context.t("settings.defaultsBuiltIn"))}</span>` : "";
  const status = step.summary || marks ? `<span class="voc-setup-summary">${marks}${step.summary ? `<span>${e(step.summary)}</span>` : ""}</span>` : "";
  const title = step.current
    ? `<h3 class="voc-setup-title">${e(step.title)}</h3>`
    : `<h3 class="voc-setup-title"><button type="button" class="voc-setup-open" data-action="choose"${argsAttr({ key: SETUP_STEP_CHOICE, value: step.key })} aria-expanded="false">${e(step.title)}</button></h3>`;
  const body = step.current
    ? `<div class="voc-setup-body"><p class="voc-setup-text">${e(step.text)}</p>${step.note ? `<p class="voc-setup-note">${icon("mdi:information-outline")}<span>${e(step.note)}</span></p>` : ""}${BODIES[step.key](context, step)}${step.next ? `<div class="voc-inline-actions">${button({ action: "choose", args: { key: step.next.key, value: step.next.value }, label: step.next.label, iconName: "mdi:arrow-down", variant: "primary", key: "setup-next" })}</div>` : ""}</div>`
    : "";
  return `<li class="voc-setup-step" data-key="step:${e(step.key)}" data-current="${step.current}"${step.current ? ' aria-current="step"' : ""}><span class="voc-setup-marker" aria-hidden="true">${marker}</span><div class="voc-setup-main"><div class="voc-setup-head">${title}${status}</div>${body}</div></li>`;
}

// The setup steps again, opened from the settings once the assistant is finished.
export const setupGuideOverlay = Object.freeze({
  key: "setup-guide",
  scopes: () => [{ name: "candidates" }, { name: "templates" }],
  build: ({ model, texts, context, ui }) => buildSetupView({ model, texts, context, ui }),
  render: (context, vm) => frame(context, { key: "setup-guide", title: context.t("view.setup"), content: renderSetup(context, vm) }),
  css: SETUP_CSS,
});

export function renderSetup(context, vm) {
  const wrap = (content) => `<div class="voc-view voc-setup" data-key="view:setup">${content}</div>`;
  if (vm.error) return wrap(errorState(context, vm.error));
  if (vm.loading) return wrap(loadingState(context));
  const lead = `<p class="voc-setup-lead" data-key="lead">${e(vm.lead)}</p>`;
  const later = vm.finish ? button({ action: "defer-setup", label: context.t("setup.later"), variant: "quiet" }) : "";
  const finish = vm.finish ? `<div class="voc-inline-actions" data-key="finish">${later}${button({ action: "complete-setup", label: context.t("setup.finish"), iconName: "mdi:check", variant: vm.finishPrimary ? "primary" : "text", decision: vm.finish, reasonText: context.reason(vm.finish) })}</div>` : "";
  return wrap(`${lead}<ol class="voc-setup-steps">${vm.steps.map((step) => stepCard(context, step)).join("")}</ol>${finish}`);
}

export const setupView = Object.freeze({
  key: "setup",
  icon: "mdi:clipboard-check-outline",
  requires: ["get_setup"],
  defaultEnabled: (model, ui) => setupOffered(model, ui),
  preferredStart: (model, ui) => setupFirst(model, ui),
  optionsSchema: Object.freeze({}),
  primary: null,
  scopes: () => [{ name: "candidates" }, { name: "templates" }],
  build: ({ model, texts, context, ui }) => buildSetupView({ model, texts, context, ui }),
  render: renderSetup,
  css: SETUP_CSS,
});
