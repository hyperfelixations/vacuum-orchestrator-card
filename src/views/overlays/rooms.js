// Room dialogs: release, settings, new room.

import { buildRelease, buildRoomCreate, buildRoomEditor } from "../../presentation/overlays/rooms.js";
import { button, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { FORMS_CSS } from "../styles/forms.js";
import { block, frame } from "./frame.js";

function invalidNotice(context, invalid) {
  return invalid ? `<div class="voc-notice voc-notice--error" role="alert" data-key="invalid">${icon("mdi:alert-circle-outline")}<span class="voc-notice-text">${e(context.t("editor.fixErrors"))}</span></div>` : "";
}

export const releaseOverlay = Object.freeze({
  key: "release",
  build: ({ model, texts, context, overlay }) => buildRelease({ model, texts, context, overlay }),
  render(context, vm) {
    if (vm.missing) return frame(context, { key: "release", title: vm.title, lead: context.t("release.missingRoom"), dialog: true });
    const current = vm.current ? `<p class="voc-overlay-lead">${e(context.t("release.current", { kind: vm.current }))}</p>` : "";
    const revoke = vm.revoke ? button({ action: "revoke-room", args: { roomId: vm.roomId, close: true }, label: context.t("rooms.lock"), iconName: "mdi:lock-outline", variant: "danger", decision: vm.revoke, reasonText: context.reason(vm.revoke), className: "voc-action-start" }) : "";
    const actions = `${revoke}${button({ action: "back", label: context.t("action.cancel"), variant: "quiet" })}${button({ action: "release-room", args: { roomId: vm.roomId }, label: context.t("rooms.release"), iconName: "mdi:lock-open-variant-outline", variant: "primary", decision: vm.submit, reasonText: context.reason(vm.submit) })}`;
    return frame(context, { key: "release", title: vm.title, content: `${current}<div class="voc-form">${vm.fields.map((field) => renderField(context, field)).join("")}</div>`, actions, dialog: true });
  },
  css: FORMS_CSS,
});

function requirementRow(context, row) {
  const remove = button({ action: "remove-requirement", args: { index: row.index }, label: context.t("field.remove", { item: row.name }), iconName: "mdi:close", variant: "icon" });
  const current = row.current !== null ? `<span class="voc-list-current">${e(context.t("room.currentState", { state: row.current }))}</span>` : "";
  return `<div class="voc-list-item" data-key="requirement:${e(row.key)}"><div class="voc-list-head"><strong>${e(row.name)}</strong>${current}${remove}</div><div class="voc-list-fields">${renderField(context, row.accepted)}${renderField(context, row.maxAge)}</div>${row.error ? `<div class="voc-field-error" role="alert">${e(row.error)}</div>` : ""}</div>`;
}

function bindingRow(context, row) {
  const remove = button({ action: "remove-binding", args: { index: row.index }, label: context.t("field.remove", { item: context.t("room.binding") }), iconName: "mdi:close", variant: "icon" });
  return `<div class="voc-list-item" data-key="binding:${e(row.key)}"><div class="voc-list-head"><strong>${e(context.t("room.binding"))}</strong>${remove}</div>${renderField(context, row.robot)}<div class="voc-list-fields">${renderField(context, row.mapId)}${renderField(context, row.targets)}</div>${row.error ? `<div class="voc-field-error" role="alert">${e(row.error)}</div>` : ""}</div>`;
}

export const roomEditorOverlay = Object.freeze({
  key: "room-editor",
  needsEntityCatalog: true,
  build: ({ model, texts, context, overlay }) => buildRoomEditor({ model, texts, context, overlay }),
  render(context, vm) {
    const groups = vm.groups.map((group) => block(group.title, group.fields.map((field) => renderField(context, field)).join(""), { key: `group:${group.key}` })).join("");
    const conditions = block(context.t("room.group.conditions"), `${vm.requirements.map((row) => requirementRow(context, row)).join("")}${renderField(context, vm.requirementSearch)}`, { key: "group:conditions" });
    const toggle = `<button type="button" class="voc-disclosure" data-action="set-overlay" data-args="${e(JSON.stringify({ bindingsOpen: !vm.bindingsOpen }))}" aria-expanded="${vm.bindingsOpen}">${icon(vm.bindingsOpen ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(context.t("room.group.targets"))}</span></button>`;
    const detected = vm.detected.length ? `<ul class="voc-reasons">${vm.detected.map((item) => `<li data-key="detected:${e(item.key)}">${icon("mdi:information-outline")}<span>${e(item.text)}</span></li>`).join("")}</ul>` : "";
    const addBinding = vm.robots.map((robot) => button({ action: "add-binding", args: { robotId: robot.robotId }, label: context.t("room.addBinding", { robot: robot.name }), iconName: "mdi:plus", variant: "quiet", key: `add-binding:${robot.robotId}` })).join("");
    const targets = `<section class="voc-block" data-key="group:targets">${toggle}${vm.bindingsOpen ? `<p class="voc-overlay-lead">${e(context.t("room.targetsLead"))}</p>${detected}${vm.bindings.map((row) => bindingRow(context, row)).join("")}<div class="voc-inline-actions">${addBinding}</div>` : ""}</section>`;
    const disable = vm.disable ? button({ action: "disable-room", args: { roomId: vm.roomId }, label: context.t("room.disable"), iconName: "mdi:eye-off-outline", variant: "danger", decision: vm.disable, reasonText: context.reason(vm.disable), className: "voc-action-start" }) : "";
    const actions = `${disable}${button({ action: "back", label: context.t("action.cancel"), variant: "quiet" })}${button({ action: "save-room", label: context.t("action.save"), iconName: "mdi:check", variant: "primary", decision: vm.save, reasonText: context.reason(vm.save) })}`;
    return frame(context, { key: "room-editor", title: vm.title, content: `${invalidNotice(context, vm.invalid)}<div class="voc-form">${groups}${conditions}${targets}</div>`, actions });
  },
  css: FORMS_CSS,
});

export const roomCreateOverlay = Object.freeze({
  key: "room-create",
  build: ({ model, texts, context, overlay }) => buildRoomCreate({ model, texts, context, overlay }),
  render(context, vm) {
    const actions = `${button({ action: "back", label: context.t("action.cancel"), variant: "quiet" })}${button({ action: "save-new-room", label: context.t("action.createRoom"), iconName: "mdi:check", variant: "primary", decision: vm.save, reasonText: context.reason(vm.save) })}`;
    return frame(context, { key: "room-create", title: vm.title, lead: context.t("room.createLead"), content: `<div class="voc-form">${vm.fields.map((field) => renderField(context, field)).join("")}</div>`, actions, dialog: true });
  },
});
