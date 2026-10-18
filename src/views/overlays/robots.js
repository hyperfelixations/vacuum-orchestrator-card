// Robot dialogs: add a discovered robot, edit a profile.

import { buildRenameRobot, buildRobotAdd, buildRobotEditor, buildRobotMap } from "../../presentation/overlays/robots.js";
import { button, chip, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { errorState, footerLead, loadingState } from "../parts.js";
import { FORMS_CSS } from "../styles/forms.js";
import { ROBOTS_CSS } from "../styles/robots.js";
import { dialog } from "./dialog.js";
import { block, frame } from "./frame.js";

function section(context, key, title, open, content) {
  const toggle = `<button type="button" class="voc-disclosure" data-action="toggle-section" data-args="${e(JSON.stringify({ key }))}" aria-expanded="${open}">${icon(open ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(title)}</span></button>`;
  return `<section class="voc-block" data-key="section:${e(key)}">${toggle}${open ? content : ""}</section>`;
}

export const robotAddOverlay = Object.freeze({
  key: "robot-add",
  scopes: () => [{ name: "candidates" }],
  build: ({ model, texts, context, ui }) => buildRobotAdd({ model, texts, context, ui }),
  render(context, vm) {
    let content;
    if (vm.error) content = errorState(context, vm.error);
    else if (vm.loading) content = loadingState(context);
    else if (!vm.candidates.length) content = `<div class="voc-empty" data-key="empty">${icon("mdi:robot-vacuum-off")}<div>${e(context.t("robotAdd.none"))}</div></div>`;
    else {
      content = `<div class="voc-candidates">${vm.candidates
        .map((candidate) => {
          const roles = candidate.roles.length
            ? `<section class="voc-robot-capabilities" data-key="roles"><button type="button" class="voc-disclosure" data-action="toggle" data-args="${e(JSON.stringify({ key: candidate.rolesKey }))}" aria-expanded="${candidate.rolesOpen}">${icon(candidate.rolesOpen ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(candidate.rolesLabel)}</span></button>${candidate.rolesOpen ? `<div class="voc-robot-chips">${candidate.roles.map((role) => chip(role)).join("")}</div>` : ""}</section>`
            : "";
          const ambiguous = candidate.ambiguous.length ? `<div class="voc-robot-note" data-tone="attention">${icon("mdi:help-circle-outline")}<span>${e(context.t("robotAdd.ambiguous", { roles: candidate.ambiguous.join(", ") }))}</span></div>` : "";
          const action = candidate.configured
            ? `<span class="voc-pill voc-pill--muted">${e(context.t("robotAdd.configured"))}</span>`
            : button({ action: "add-candidate", args: { entityId: candidate.entityId }, label: context.t("action.addRobot"), iconName: "mdi:plus", variant: "primary", decision: candidate.decision, reasonText: context.reason(candidate.decision) });
          return `<article class="voc-robot" data-key="candidate:${e(candidate.key)}"><header class="voc-robot-head"><span class="voc-robot-icon" aria-hidden="true">${icon("mdi:robot-vacuum")}</span><div class="voc-robot-title"><h3 class="voc-robot-name">${e(candidate.name)}</h3><div class="voc-robot-line">${e(candidate.detail)}</div></div>${action}</header>${roles}${ambiguous}</article>`;
        })
        .join("")}</div>`;
    }
    return frame(context, { key: "robot-add", title: vm.title, lead: context.t("robotAdd.lead"), content });
  },
  css: `
.voc-candidates { display: grid; gap: 8px; }
`,
});

function roleRow(context, row) {
  return `<div class="voc-role${row.mode.attention ? " is-attention" : ""}" data-key="role:${e(row.key)}">${renderField(context, row.mode)}${row.entity ? renderField(context, row.entity) : ""}</div>`;
}

function requirementRow(context, row) {
  const remove = button({ action: "remove-requirement", args: { index: row.index }, label: context.t("field.remove", { item: row.name }), iconName: "mdi:close", variant: "icon" });
  return `<div class="voc-list-item" data-key="requirement:${e(row.key)}"><div class="voc-list-head"><strong>${e(row.name)}</strong>${remove}</div>${renderField(context, row.accepted)}${renderField(context, row.operation)}${row.error ? `<div class="voc-field-error" role="alert">${e(row.error)}</div>` : ""}</div>`;
}

function optionGroup(context, group, vm) {
  const rows = group.fields.map((field) => `<div class="voc-option-row" data-key="option:${e(field.key)}">${renderField(context, field)}${field.removable ? button({ action: "remove-option", args: { field: field.key }, label: context.t("field.remove", { item: field.label }), iconName: "mdi:close", variant: "icon" }) : ""}</div>`).join("");
  const add = group.free
    ? `<div class="voc-option-add" data-key="option-add">${renderField(context, { key: "overlay:newOptionKey", label: context.t("robotEditor.newOptionKey"), control: "text", value: vm.sections.options.newKey })}${renderField(context, { key: "overlay:newOptionValue", label: context.t("robotEditor.optionValue"), control: "text", value: vm.sections.options.newValue })}${button({ action: "add-option", args: { group: group.key }, label: context.t("robotEditor.addOption"), iconName: "mdi:plus", variant: "quiet" })}</div>`
    : "";
  return `<div class="voc-group" data-key="option-group:${e(group.key)}"><h4 class="voc-group-title">${e(group.title)}</h4>${group.error ? `<div class="voc-field-error" role="alert">${e(group.error)}</div>` : ""}<div class="voc-list-fields">${rows}</div>${add}</div>`;
}

export const robotEditorOverlay = Object.freeze({
  key: "robot-editor",
  needsEntityCatalog: true,
  build: ({ model, texts, context, overlay, ui }) => ({ ...buildRobotEditor({ model, texts, context, overlay }), menuOpen: ui?.menu === "robot-editor" }),
  render(context, vm) {
    const s = vm.sections;
    const content = [
      block(context.t("robotEditor.group.general"), vm.general.map((field) => renderField(context, field)).join(""), { key: "group:general" }),
      block(context.t("robotEditor.group.areas"), `${renderField(context, vm.areaScope)}${vm.areas ? renderField(context, vm.areas) : ""}`, { key: "group:areas" }),
      section(context, "roles", context.t("robotEditor.group.roles"), s.roles.open, `<p class="voc-overlay-lead">${e(context.t("robotEditor.rolesLead"))}</p><div class="voc-roles">${s.roles.rows.map((row) => roleRow(context, row)).join("")}</div>`),
      section(context, "requirements", context.t("robotEditor.group.requirements"), s.requirements.open, `${s.requirements.rows.map((row) => requirementRow(context, row)).join("")}${renderField(context, s.requirements.search)}`),
      section(context, "optionMaps", context.t("robotEditor.group.options"), s.options.open, `<p class="voc-overlay-lead">${e(context.t("robotEditor.optionsLead"))}</p>${s.options.groups.map((group) => optionGroup(context, group, vm)).join("")}`),
      section(context, "timeouts", context.t("robotEditor.group.timeouts"), s.timeouts.open, `<div class="voc-list-fields">${s.timeouts.fields.map((field) => renderField(context, field)).join("")}</div>`),
      section(context, "identity", context.t("robotEditor.group.identity"), s.identity.open, s.identity.fields.map((field) => renderField(context, field)).join("")),
    ].join("");
    // On a narrow card removing sits in a menu, so the footer stays one line (LAY-09).
    const remove = footerLead(context, { items: [vm.remove ? { action: "remove-robot", args: { robotId: vm.robotId }, label: context.t("robotEditor.remove"), iconName: "mdi:delete-outline", decision: vm.remove, reasonText: context.reason(vm.remove), tone: "danger" } : null, vm.rename ? { action: "rename-robot", args: { robotId: vm.robotId }, label: context.t("action.rename"), iconName: "mdi:rename-outline", decision: vm.rename, reasonText: context.reason(vm.rename) } : null], key: "robot-editor", label: context.t("action.moreActions"), open: vm.menuOpen === true });
    const actions = `${remove}${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action: "save-robot", label: context.t("action.save"), iconName: "mdi:check", variant: "primary", decision: vm.save, reasonText: context.reason(vm.save) })}`;
    return frame(context, { key: "robot-editor", title: vm.title, lead: vm.lead, invalid: vm.invalid, content: `<div class="voc-form">${content}</div>`, actions });
  },
  css: `${FORMS_CSS}
.voc-roles { display: grid; }
.voc-role { display: grid; gap: 8px; padding: 9px 0; border-top: 1px solid var(--voc-hairline); }
.voc-role:first-child { border-top: 0; padding-top: 2px; }
.voc-role .voc-option { min-height: 28px; padding: 3px 10px; }
.voc-role.is-attention .voc-field-hint { color: var(--voc-warning-ink); }
`,
});

export const renameRobotOverlay = Object.freeze({
  key: "rename-robot",
  dialog: true,
  build: ({ model, texts, context, overlay }) => buildRenameRobot({ model, texts, context, overlay }),
  render(context, vm) {
    const decision = vm.pending ? { state: "disabled", reason: "command_pending" } : vm.save;
    const actions = `${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action: "save-robot-name", label: context.t("action.save"), iconName: "mdi:check", variant: "primary", decision, reasonText: context.reason(vm.save) })}`;
    return dialog(context, { key: "rename-robot", title: vm.title, invalid: vm.invalid, content: `<div class="voc-form">${renderField(context, vm.field)}</div>`, actions });
  },
  css: FORMS_CSS,
});

// UI-10: the map large on its own page; the stage is laid out after each render
// (`controllers/runtime/map-rotation.js`).
export const robotMapOverlay = Object.freeze({
  key: "robot-map",
  build: ({ model, overlay }) => buildRobotMap({ model, overlay }),
  render(context, vm) {
    const content = vm.missing
      ? `<div class="voc-unavailable" data-key="missing">${icon("mdi:map-marker-question-outline")}<div>${e(context.t("robot.mapMissing"))}</div></div>`
      : `<div class="voc-map-stage" data-map-stage data-rotation="${e(vm.rotation)}"><img src="${e(context.resolveUrl(vm.picture))}" alt="${e(vm.title)}"></div>`;
    return frame(context, { key: "robot-map", title: vm.title, content });
  },
  css: ROBOTS_CSS,
});
