// The job and template editor page.

import { buildJobEditor } from "../../presentation/overlays/job-editor.js";
import { button, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { frame } from "./frame.js";
import { FORMS_CSS } from "../styles/forms.js";

function group(context, entry) {
  const fields = entry.fields.map((field) => renderField(context, field)).join("");
  if (!entry.collapsible) return `<section class="voc-block voc-form-group" data-key="group:${e(entry.key)}"><h3 class="voc-block-title">${e(entry.title)}</h3>${fields}</section>`;
  const toggle = `<button type="button" class="voc-disclosure" data-action="set-overlay" data-args="${e(JSON.stringify({ moreOpen: !entry.open }))}" aria-expanded="${entry.open}">${icon(entry.open ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(entry.title)}</span></button>`;
  return `<section class="voc-block voc-form-group" data-key="group:${e(entry.key)}">${toggle}${entry.open ? fields : ""}</section>`;
}

export function renderJobEditor(context, vm) {
  const remove = vm.remove ? button({ action: vm.remove.action, args: vm.remove.args, label: vm.remove.label, iconName: "mdi:delete-outline", variant: "danger", decision: vm.remove.decision, reasonText: context.reason(vm.remove.decision), className: "voc-action-start" }) : "";
  const actions = `${remove}${button({ action: "back", label: context.t("action.cancel"), variant: "quiet" })}${button({ action: "save-draft", label: vm.save.label, iconName: "mdi:check", variant: "primary", decision: vm.pending ? { state: "disabled", reason: "command_pending" } : vm.save.decision, reasonText: context.reason(vm.save.decision) })}`;
  const invalid = vm.invalid ? `<div class="voc-notice voc-notice--error" role="alert" data-key="invalid">${icon("mdi:alert-circle-outline")}<span class="voc-notice-text">${e(context.t("editor.fixErrors"))}</span></div>` : "";
  return frame(context, { key: "job-editor", title: vm.title, content: `${invalid}<form class="voc-form" novalidate>${vm.groups.map((entry) => group(context, entry)).join("")}</form>`, actions });
}

export const jobEditorOverlay = Object.freeze({
  key: "job-editor",
  needsEntityCatalog: true,
  build: ({ model, texts, context, overlay }) => buildJobEditor({ model, texts, context, overlay }),
  render: renderJobEditor,
  css: FORMS_CSS,
});
