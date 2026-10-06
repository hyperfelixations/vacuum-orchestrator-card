// The job and template editor page.

import { draftToPreview } from "../../domain/job-draft.js";
import { buildJobEditor, previewable } from "../../presentation/overlays/job-editor.js";
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

// Removing stands apart on the left; leaving comes next; the confirming actions end the row,
// adding to the queue last.
export function renderJobEditor(context, vm) {
  const pending = vm.pending ? { state: "disabled", reason: "command_pending" } : null;
  const remove = vm.remove ? button({ action: vm.remove.action, args: vm.remove.args, label: vm.remove.label, iconName: "mdi:delete-outline", variant: "danger", decision: vm.remove.decision, reasonText: context.reason(vm.remove.decision), className: "voc-action-start" }) : "";
  const saveAsTemplate = vm.saveAsTemplate ? button({ action: vm.saveAsTemplate.action, args: vm.saveAsTemplate.args, label: vm.saveAsTemplate.label, iconName: "mdi:content-save-outline", decision: vm.saveAsTemplate.decision, reasonText: context.reason(vm.saveAsTemplate.decision) }) : "";
  const startNow = vm.startNow ? button({ action: "start-draft", label: vm.startNow.label, iconName: "mdi:play", decision: pending ?? vm.startNow.decision, reasonText: context.reason(vm.startNow.decision) }) : "";
  const save = button({ action: "save-draft", label: vm.save.label, iconName: "mdi:check", variant: "primary", decision: pending ?? vm.save.decision, reasonText: context.reason(vm.save.decision) });
  const actions = `${remove}${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${saveAsTemplate}${startNow}${save}`;
  const invalid = vm.invalid ? `<div class="voc-notice voc-notice--error" role="alert" data-key="invalid">${icon("mdi:alert-circle-outline")}<span class="voc-notice-text">${e(context.t("editor.fixErrors"))}</span></div>` : "";
  return frame(context, { key: "job-editor", title: vm.title, content: `${invalid}<form class="voc-form" novalidate>${vm.groups.map((entry) => group(context, entry)).join("")}</form>`, actions });
}

export const jobEditorOverlay = Object.freeze({
  key: "job-editor",
  needsEntityCatalog: true,
  // What the integration offers for this draft; asked again only when that can change.
  scopes: ({ overlay }) => (overlay.draft && previewable(overlay.draft) ? [{ name: "preview", params: draftToPreview(overlay.draft) }] : []),
  build: ({ model, texts, context, overlay }) => buildJobEditor({ model, texts, context, overlay }),
  render: renderJobEditor,
  css: FORMS_CSS,
});
