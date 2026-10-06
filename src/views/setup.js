// The setup assistant view. See internal dev doc §8 "Einrichtung".

import { SETUP_STEP_CHOICE, buildSetupView, setupNeeded } from "../presentation/views/setup.js";
import { argsAttr, button, e, icon } from "../render/primitives/markup.js";
import { loadingState } from "./parts.js";
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
    itemList(step.candidates.map((candidate) => item(`candidate:${candidate.key}`, candidate.name, candidate.detail, button({ action: "add-candidate", args: { entityId: candidate.entityId }, label: context.t("action.addRobot"), iconName: "mdi:plus", variant: "primary", decision: candidate.decision, reasonText: context.reason(candidate.decision) })))),
  rooms: (context, step) =>
    `${step.uncovered.length ? `<p class="voc-setup-label">${e(context.t("setup.step.rooms.uncovered"))}</p>` : ""}${itemList(step.uncovered.map((room) => item(`room:${room.key}`, room.name, null, button({ action: "edit-room", args: { roomId: room.roomId }, label: context.t("setup.step.rooms.assign"), iconName: "mdi:map-marker-plus-outline", decision: room.decision, reasonText: context.reason(room.decision) }))))}${more(context, step.more)}`,
  release: (context, step) =>
    `${itemList(step.rooms.map((room) => item(`release:${room.key}`, room.name, null, button({ action: "open-release", args: { roomId: room.roomId }, label: context.t("rooms.openRelease"), iconName: "mdi:lock-open-variant-outline", decision: room.decision, reasonText: context.reason(room.decision) }))))}${more(context, step.more)}`,
  defaults: (context, step) => link(context, step),
  conditions: (context, step) => link(context, step),
  due: (context, step) => link(context, step),
  templates: (context, step) => link(context, step),
  queue: (context, step) => link(context, step),
  firstJob: (context, step) => `<div class="voc-inline-actions">${button({ action: "create-job", label: context.t("action.createJob"), iconName: "mdi:plus", variant: "primary", decision: step.create, reasonText: context.reason(step.create) })}</div>`,
});

// A collapsed step opens through its title; the marks say which steps are optional and where the
// built-in defaults apply.
function stepCard(context, step) {
  const marker = step.done ? icon("mdi:check") : `<span>${e(step.number)}</span>`;
  const marks = [step.optional ? `<span class="voc-setup-mark">${e(context.t("setup.optional"))}</span>` : "", step.builtIn ? `<span class="voc-setup-mark" data-tone="default">${e(context.t("settings.defaultsBuiltIn"))}</span>` : ""].join("");
  const status = step.summary || marks ? `<span class="voc-setup-summary">${marks}${step.summary ? `<span>${e(step.summary)}</span>` : ""}</span>` : "";
  const title = step.current
    ? `<h3 class="voc-setup-title">${e(step.title)}</h3>`
    : `<h3 class="voc-setup-title"><button type="button" class="voc-setup-open" data-action="choose"${argsAttr({ key: SETUP_STEP_CHOICE, value: step.key })} aria-expanded="false">${e(step.title)}</button></h3>`;
  const body = step.current
    ? `<div class="voc-setup-body"><p class="voc-setup-text">${e(step.text)}</p>${step.note ? `<p class="voc-setup-note">${icon("mdi:information-outline")}<span>${e(step.note)}</span></p>` : ""}${BODIES[step.key](context, step)}</div>`
    : "";
  return `<li class="voc-setup-step" data-key="step:${e(step.key)}" data-done="${step.done}" data-current="${step.current}"${step.current ? ' aria-current="step"' : ""}><span class="voc-setup-marker" aria-hidden="true">${marker}</span><div class="voc-setup-main"><div class="voc-setup-head">${title}${step.done ? `<span class="voc-sr-only">${e(context.t("setup.doneLabel"))}</span>` : ""}${status}</div>${body}</div></li>`;
}

// The setup steps again, opened from the settings once the setup view is no longer a tab.
export const setupGuideOverlay = Object.freeze({
  key: "setup-guide",
  scopes: () => [{ name: "candidates" }, { name: "templates" }],
  build: ({ model, texts, context, ui }) => buildSetupView({ model, texts, context, ui }),
  render: (context, vm) => frame(context, { key: "setup-guide", title: context.t("view.setup"), content: renderSetup(context, vm) }),
  css: SETUP_CSS,
});

export function renderSetup(context, vm) {
  const wrap = (content) => `<div class="voc-view voc-setup" data-key="view:setup">${content}</div>`;
  if (vm.loading) return wrap(loadingState(context));
  const lead = vm.allDone
    ? `<div class="voc-alert voc-alert--success" data-key="done" role="status">${icon("mdi:check-circle-outline")}<div class="voc-alert-text"><strong>${e(context.t("setup.allDone"))}</strong></div></div>`
    : `<p class="voc-setup-lead" data-key="lead">${e(context.t(vm.complete ? "setup.leadReady" : "setup.lead"))}</p>`;
  return wrap(`${lead}<ol class="voc-setup-steps">${vm.steps.map((step) => stepCard(context, step)).join("")}</ol>`);
}

export const setupView = Object.freeze({
  key: "setup",
  icon: "mdi:clipboard-check-outline",
  requires: ["get_robots", "get_rooms"],
  defaultEnabled: (model) => setupNeeded(model),
  preferredStart: (model) => setupNeeded(model),
  optionsSchema: Object.freeze({}),
  primary: null,
  scopes: () => [{ name: "candidates" }, { name: "templates" }],
  build: ({ model, texts, context, ui }) => buildSetupView({ model, texts, context, ui }),
  render: renderSetup,
  css: SETUP_CSS,
});
