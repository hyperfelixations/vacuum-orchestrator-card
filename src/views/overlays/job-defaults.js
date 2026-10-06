// Saving a job as a template, and the defaults for new jobs.

import { buildJobDefaults, buildSaveTemplate } from "../../presentation/overlays/job-defaults.js";
import { button, e, icon } from "../../render/primitives/markup.js";
import { renderField } from "../controls/fields.js";
import { frame } from "./frame.js";
import { FORMS_CSS } from "../styles/forms.js";

function actions(context, vm, action) {
  const decision = vm.pending ? { state: "disabled", reason: "command_pending" } : vm.save;
  return `${button({ action: "back", label: context.t("action.back"), variant: "quiet" })}${button({ action, label: context.t("action.save"), iconName: "mdi:check", variant: "primary", decision, reasonText: context.reason(vm.save) })}`;
}

export const saveTemplateOverlay = Object.freeze({
  key: "save-template",
  build: ({ model, texts, context, overlay }) => buildSaveTemplate({ model, texts, context, overlay }),
  render(context, vm) {
    const content = `<div class="voc-form">${vm.fields.map((field) => renderField(context, field)).join("")}</div>`;
    return frame(context, { key: "save-template", title: vm.title, lead: vm.lead, content, actions: actions(context, vm, "save-job-template"), dialog: true });
  },
  css: FORMS_CSS,
});

export const jobDefaultsOverlay = Object.freeze({
  key: "job-defaults",
  build: ({ model, texts, context, overlay }) => buildJobDefaults({ model, texts, context, overlay }),
  render(context, vm) {
    const invalid = vm.invalid ? `<div class="voc-notice voc-notice--error" role="alert" data-key="invalid">${icon("mdi:alert-circle-outline")}<span class="voc-notice-text">${e(context.t("editor.fixErrors"))}</span></div>` : "";
    const content = `${invalid}<div class="voc-form">${vm.fields.map((field) => renderField(context, field)).join("")}</div>`;
    return frame(context, { key: "job-defaults", title: vm.title, lead: vm.lead, content, actions: actions(context, vm, "save-job-defaults") });
  },
  css: FORMS_CSS,
});
