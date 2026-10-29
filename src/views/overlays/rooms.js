// Room overlays: the release dialog, the settings page and the new room page.

import { buildRelease, buildRoomCreate, buildRoomEditor } from "../../presentation/overlays/rooms.js";
import { button, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { footerLead } from "../parts.js";
import { FORMS_CSS } from "../styles/forms.js";
import { dialog } from "./dialog.js";
import { block, frame } from "./frame.js";

// One room of a release: its kind, for a timed one a quick choice and hours beside minutes. With
// several rooms each row is framed, names its room and can be removed (REL-04, REL-06, REL-08).
function releaseRow(context, vm, row) {
  const several = vm.rows.length > 1;
  const remove = row.removable ? button({ action: "remove-release-room", args: { index: row.index }, label: context.t("release.removeRoom", { room: row.name }), iconName: "mdi:close", variant: "icon" }) : "";
  const head = several ? `<div class="voc-list-head"><strong class="voc-release-room">${e(row.name)}</strong>${remove}</div>` : "";
  const current = row.current ? `<p class="voc-field-hint">${e(context.t("release.current", { kind: row.current }))}</p>` : "";
  const duration = row.duration ? `${renderField(context, row.duration.quick)}<div class="voc-release-duration">${renderField(context, row.duration.hours)}${renderField(context, row.duration.minutes)}</div>` : "";
  const error = row.error ? `<div class="voc-field-error" role="alert">${e(row.error)}</div>` : "";
  return `<section class="voc-release-row${several ? " voc-list-item" : ""}" data-key="release:${e(row.roomId)}">${head}${current}${renderField(context, row.kind)}${duration}${error}</section>`;
}

export const releaseOverlay = Object.freeze({
  key: "release",
  dialog: true,
  build: ({ model, texts, context, overlay }) => buildRelease({ model, texts, context, overlay }),
  render(context, vm) {
    if (vm.missing) return dialog(context, { key: "release", title: vm.title, lead: context.t("release.missingRoom"), actions: button({ action: "back", label: context.t("action.back"), variant: "quiet" }) });
    // What the job the dialog was opened from still waits for afterwards.
    // One reason reads as a sentence, several as a list.
    const reasons = vm.afterwards.length === 1 ? ` <span>${e(vm.afterwards[0])}</span>` : `<ul>${vm.afterwards.map((reason) => `<li>${e(reason)}</li>`).join("")}</ul>`;
    const afterwards = vm.afterwards.length ? `<div class="voc-release-after" data-key="afterwards">${icon("mdi:information-outline")}<div><span>${e(context.t("release.afterwards"))}</span>${reasons}</div></div>` : "";
    const add = vm.addable.length ? `<div class="voc-release-add" role="group" aria-labelledby="voc-release-add-label"><span class="voc-field-label" id="voc-release-add-label">${e(context.t("release.addRoom"))}</span><div class="voc-chips">${vm.addable.map((room) => button({ action: "add-release-room", args: { roomId: room.roomId }, label: room.name, iconName: "mdi:plus", variant: "text" })).join("")}</div></div>` : "";
    const revoke = vm.revoke ? button({ action: "revoke-room", args: { roomId: vm.rows[0].roomId, close: true }, label: context.t("rooms.lock"), iconName: "mdi:lock-outline", variant: "quiet", decision: vm.revoke, reasonText: context.reason(vm.revoke), className: "voc-action-start" }) : "";
    const actions = `${revoke}${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action: "release-room", label: context.t("rooms.release"), iconName: "mdi:lock-open-variant-outline", variant: "primary", decision: vm.submit, reasonText: context.reason(vm.submit) })}`;
    return dialog(context, { key: "release", title: vm.title, invalid: vm.invalid, content: `<div class="voc-form">${vm.rows.map((row) => releaseRow(context, vm, row)).join("")}${add}${afterwards}</div>`, actions });
  },
  css: `${FORMS_CSS}
.voc-release-row { display: grid; gap: 10px; min-width: 0; }
.voc-release-row [data-key$=":kind"] .voc-segmented { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.voc-release-row [data-key$=":kind"] .voc-option { justify-content: flex-start; min-width: 0; }
.voc-release-row [data-key$=":kind"] .voc-option span { min-width: 0; overflow-wrap: anywhere; text-align: start; }
.voc-release-row.voc-list-item [data-key$=":kind"] > .voc-field-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.voc-release-duration { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px 12px; }
.voc-release-duration .voc-input[type="number"] { max-width: none; }
.voc-release-after { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; font-weight: 650; line-height: 1.35; color: var(--voc-muted); }
.voc-release-after ha-icon { --mdc-icon-size: 15px; flex: none; }
.voc-release-after ul { margin: 2px 0 0; padding-inline-start: 18px; }
.voc-release-add { display: grid; gap: 6px; min-width: 0; padding-top: 10px; border-top: 1px solid var(--voc-hairline); }
`,
});

function requirementRow(context, row) {
  const remove = button({ action: "remove-requirement", args: { index: row.index }, label: context.t("field.remove", { item: row.name }), iconName: "mdi:close", variant: "icon" });
  const current = row.current !== null ? `<span class="voc-list-current">${e(context.t("room.currentState", { state: row.current }))}</span>` : "";
  return `<div class="voc-list-item" data-key="requirement:${e(row.key)}"><div class="voc-list-head"><strong>${e(row.name)}</strong>${current}${remove}</div><div class="voc-list-fields">${renderField(context, row.accepted)}${renderField(context, row.maxAge)}</div>${row.error ? `<div class="voc-field-error" role="alert">${e(row.error)}</div>` : ""}</div>`;
}

function bindingRow(context, row) {
  const remove = button({ action: "remove-binding", args: { index: row.index }, label: context.t("field.remove", { item: context.t("room.binding") }), iconName: "mdi:close", variant: "icon" });
  return `<div class="voc-list-item" data-key="binding:${e(row.key)}"><div class="voc-list-head"><strong>${e(context.t("room.binding"))}</strong>${remove}</div>${renderField(context, row.robot)}${row.mapId.control === "text" ? `<div class="voc-list-fields">${renderField(context, row.mapId)}${renderField(context, row.targets)}</div>` : `${renderField(context, row.mapId)}${renderField(context, row.targets)}`}${row.error ? `<div class="voc-field-error" role="alert">${e(row.error)}</div>` : ""}</div>`;
}

export const roomEditorOverlay = Object.freeze({
  key: "room-editor",
  needsEntityCatalog: true,
  build: ({ model, texts, context, overlay, ui }) => ({ ...buildRoomEditor({ model, texts, context, overlay }), menuOpen: ui?.menu === "room-editor" }),
  render(context, vm) {
    const groups = vm.groups.map((group) => block(group.title, group.fields.map((field) => renderField(context, field)).join(""), { key: `group:${group.key}` })).join("");
    const conditions = block(context.t("room.group.conditions"), `${vm.requirements.map((row) => requirementRow(context, row)).join("")}${renderField(context, vm.requirementSearch)}`, { key: "group:conditions" });
    const toggle = `<button type="button" class="voc-disclosure" data-action="set-overlay" data-args="${e(JSON.stringify({ bindingsOpen: !vm.bindingsOpen }))}" aria-expanded="${vm.bindingsOpen}">${icon(vm.bindingsOpen ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(context.t("room.group.targets"))}</span></button>`;
    const detected = vm.detected.length ? `<ul class="voc-reasons">${vm.detected.map((item) => `<li data-key="detected:${e(item.key)}">${icon("mdi:information-outline")}<span>${e(item.text)}</span></li>`).join("")}</ul>` : "";
    const ignored = vm.ignored.map((item) => `<div class="voc-field-warning" data-key="ignored:${e(item.key)}">${icon("mdi:alert-outline")}<span>${e(item.text)}</span>${item.assign ? button({ action: "open-more-info", args: { entityId: item.assign.entityId }, label: context.t("rooms.assign"), iconName: "mdi:map-marker-plus-outline", variant: "text" }) : ""}</div>`).join("");
    const addBinding = vm.robots.map((robot) => button({ action: "add-binding", args: { robotId: robot.robotId }, label: context.t("room.addBinding", { robot: robot.name }), iconName: "mdi:plus", variant: "quiet", key: `add-binding:${robot.robotId}` })).join("");
    const targets = `<section class="voc-block" data-key="group:targets">${toggle}${vm.bindingsOpen ? `<p class="voc-overlay-lead">${e(context.t("room.targetsLead"))}</p>${detected}${ignored}${vm.bindings.map((row) => bindingRow(context, row)).join("")}<div class="voc-inline-actions">${addBinding}</div>` : ""}</section>`;
    // On a narrow card excluding sits in a menu, so the footer stays one line (LAY-09).
    const disable = footerLead(context, { items: [vm.disable ? { action: "disable-room", args: { roomId: vm.roomId }, label: context.t("action.exclude"), iconName: "mdi:eye-off-outline", decision: vm.disable, reasonText: context.reason(vm.disable) } : null], key: "room-editor", label: context.t("action.moreActions"), open: vm.menuOpen === true });
    const actions = `${disable}${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action: "save-room", label: context.t("action.save"), iconName: "mdi:check", variant: "primary", decision: vm.save, reasonText: context.reason(vm.save) })}`;
    return frame(context, { key: "room-editor", title: vm.title, invalid: vm.invalid, content: `<div class="voc-form">${groups}${conditions}${targets}</div>`, actions });
  },
  css: FORMS_CSS,
});

export const roomCreateOverlay = Object.freeze({
  key: "room-create",
  build: ({ model, texts, context, overlay }) => buildRoomCreate({ model, texts, context, overlay }),
  render(context, vm) {
    const actions = `${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action: "save-new-room", label: context.t("action.createRoom"), iconName: "mdi:check", variant: "primary", decision: vm.save, reasonText: context.reason(vm.save) })}`;
    return frame(context, { key: "room-create", title: vm.title, lead: context.t("room.createLead"), invalid: vm.invalid, content: `<div class="voc-form">${vm.fields.map((field) => renderField(context, field)).join("")}</div>`, actions });
  },
});
