// The job and template editor page.

import { draftToPreview } from "../../domain/job-draft.js";
import { buildJobEditor } from "../../presentation/overlays/job-editor.js";
import { button, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { footerLead } from "../parts.js";
import { frame } from "./frame.js";
import { FORMS_CSS } from "../styles/forms.js";

// A box of fields under its heading; a collapsible one opens and closes with `moreOpen`.
export function formGroup(context, entry) {
  const fields = entry.fields.map((field) => renderField(context, field)).join("");
  if (!entry.collapsible) return `<section class="voc-block voc-form-group" data-key="group:${e(entry.key)}"><h3 class="voc-block-title">${e(entry.title)}</h3>${fields}</section>`;
  const toggle = `<button type="button" class="voc-disclosure" data-action="set-overlay" data-args="${e(JSON.stringify({ moreOpen: !entry.open }))}" aria-expanded="${entry.open}">${icon(entry.open ? "mdi:chevron-up" : "mdi:chevron-down")}<span>${e(entry.title)}</span></button>`;
  return `<section class="voc-block voc-form-group" data-key="group:${e(entry.key)}">${toggle}${entry.open ? fields : ""}</section>`;
}

// Removing stands apart on the left; leaving comes next; the confirming actions end the row,
// adding to the queue last. Removing and saving as a template stand on the left: as buttons on
// a wide card, in a menu on a narrow one, so the row stays one line (LAY-09). Both are rendered.
export function renderJobEditor(context, vm) {
  const pending = vm.pending ? { state: "disabled", reason: "command_pending" } : null;
  const removal = vm.remove ? { action: vm.remove.action, args: vm.remove.args, label: vm.remove.label, iconName: "mdi:delete-outline", decision: vm.remove.decision, reasonText: context.reason(vm.remove.decision), tone: "danger" } : null;
  const template = vm.saveAsTemplate ? { action: vm.saveAsTemplate.action, label: vm.saveAsTemplate.label, iconName: "mdi:content-save-outline", decision: vm.saveAsTemplate.decision, reasonText: context.reason(vm.saveAsTemplate.decision) } : null;
  const lead = footerLead(context, { items: [removal, template], key: "editor", label: context.t("action.moreActions"), open: vm.menuOpen === true });
  const startNow = vm.startNow ? button({ action: "start-draft", args: vm.startNow.lowBattery ? { lowBattery: true } : undefined, label: vm.startNow.label, iconName: "mdi:play", decision: pending ?? vm.startNow.decision, reasonText: context.reason(vm.startNow.decision) }) : "";
  const save = button({ action: "save-draft", label: vm.save.label, iconName: "mdi:check", variant: "primary", decision: pending ?? vm.save.decision, reasonText: context.reason(vm.save.decision) });
  const actions = `${lead}${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${startNow}${save}`;
  // A lost hold heads the page with what can still be done (JOB-20, JOB-21).
  const hold = vm.hold ? `<div class="voc-notice voc-notice--warning" role="alert" data-key="hold">${icon("mdi:lock-alert-outline")}<span class="voc-notice-text">${e(vm.hold.text)}</span>${button({ action: vm.hold.action, label: vm.hold.label, variant: "text" })}</div>` : "";
  return frame(context, { key: "job-editor", title: vm.title, invalid: vm.invalid, content: `${hold}<form class="voc-form" novalidate>${vm.groups.map((entry) => formGroup(context, entry)).join("")}</form>`, actions });
}

export const jobEditorOverlay = Object.freeze({
  key: "job-editor",
  needsEntityCatalog: true,
  // What the integration offers for this draft; asked again only when that can change.
  scopes: ({ overlay }) => (overlay.draft ? [{ name: "preview", params: draftToPreview(overlay.draft) }] : []),
  build: ({ model, texts, context, overlay, ui }) => buildJobEditor({ model, texts, context, overlay, menu: ui?.menu ?? null }),
  render: renderJobEditor,
  css: FORMS_CSS,
});
