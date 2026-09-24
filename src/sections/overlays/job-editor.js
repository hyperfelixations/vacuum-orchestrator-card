// The job editor page. Controls declare their field path; the element turns each interaction
// into the next draft through the domain reducer.

import { buildEditorFormViewModel } from "../../presentation/sections/editor-form-vm.js";
import { CONTROL_REGISTRY } from "../controls/index.js";
import { renderFormField } from "../controls/form-field.js";
import { e, errorBanner, setText, t } from "../render-utils.js";

function controlMarkup(context, field) {
  const control = CONTROL_REGISTRY[field.control] || CONTROL_REGISTRY["text-field"];
  return control.render(context, field);
}

function fieldMarkup(context, field) {
  return renderFormField(field, controlMarkup(context, field));
}

function groupMarkup(context, group) {
  return `<fieldset class="voc-editor-group" data-editor-group="${e(group.key)}"><legend>${e(group.title)}</legend>${group.fields.map((field) => fieldMarkup(context, field)).join("")}</fieldset>`;
}

export const jobEditorOverlay = {
  key: "editor",

  build(model, texts, options = {}, ui) {
    return buildEditorFormViewModel({ model, texts, options, ui, draft: ui?.draft, job: options.job || null, mode: options.mode || "create", backendError: model?.lastCommandError || null });
  },

  structureSignature(content) {
    const fields = content.groups.flatMap((group) => group.fields).map((field) => `${field.path}:${field.control}:${field.error ? 1 : 0}`).join("|");
    return `${content.mode}|${content.backendError ? "error" : "ok"}|${content.saveEnabled ? "enabled" : "disabled"}|${fields}`;
  },

  render(context, viewModel) {
    const command = viewModel.mode === "edit" ? "update_job" : "create_job";
    const statusText = viewModel.dirty ? t(context, "form.unsaved") : "";
    // Save is inert until there is a valid change; the field errors say what is missing.
    const save = `<button type="button" class="voc-action-button voc-primary-button" data-action="save-job" data-command="${e(command)}"${viewModel.saveEnabled ? "" : " disabled"}>${e(t(context, "action.save"))}</button>`;
    return `<section class="voc-overlay voc-job-editor" data-overlay="editor" data-editor-mode="${e(viewModel.mode)}" role="region" aria-labelledby="voc-editor-title" data-focus-region="true"><header class="voc-overlay-head"><button type="button" class="voc-back-button" data-action="back" data-confirm="${viewModel.dirty}" aria-label="${e(t(context, "action.back"))}">${e(t(context, "action.back"))}</button><h2 id="voc-editor-title">${e(viewModel.title)}</h2><span class="voc-overlay-status">${e(statusText)}</span></header>${viewModel.backendError ? errorBanner(context, viewModel.backendError, "voc-editor-error") : ""}<form class="voc-editor-form" data-voc-editor-form="true" data-submit-command="${e(command)}" novalidate>${viewModel.groups.map((group) => groupMarkup(context, group)).join("")}<div class="voc-editor-actions"><button type="button" class="voc-secondary-button" data-action="cancel" data-confirm="${viewModel.dirty}">${e(t(context, "action.cancel"))}</button>${save}</div></form></section>`;
  },

  patch(context, root, viewModel) {
    const section = root?.matches?.(".voc-job-editor") ? root : root?.querySelector?.(".voc-job-editor");
    if (!section) return;
    setText(section, "#voc-editor-title", viewModel.title);
    const status = section.querySelector(".voc-overlay-status");
    if (status) status.textContent = viewModel.dirty ? t(context, "form.unsaved") : "";
    const fields = viewModel.groups.flatMap((group) => group.fields);
    for (const field of fields) {
      const wrapper = [...section.querySelectorAll("[data-field-path]")].find((candidate) => candidate.dataset.fieldPath === field.path && candidate.classList.contains("voc-form-field"));
      if (!wrapper) continue;
      const controlNode = wrapper.querySelector(`[data-control][data-field-path="${field.path}"]`);
      const control = CONTROL_REGISTRY[field.control] || CONTROL_REGISTRY["text-field"];
      if (controlNode) control.patch(context, controlNode, field);
      wrapper.classList.toggle("voc-form-field-invalid", Boolean(field.error));
      const error = wrapper.querySelector(".voc-field-error");
      if (error) {
        error.textContent = field.error || "";
        error.hidden = !field.error;
      }
    }
    const save = section.querySelector('[data-action="save-job"]');
    if (save) save.disabled = !viewModel.saveEnabled;
  },
};

export default jobEditorOverlay;
