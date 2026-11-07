// Templates: a job from one, creating, editing and removing them, and allowing another job in the
// current due period. See internal dev doc §9 "Aktionsvertrag".

import { templateTarget } from "../../../domain/affordances.js";
import { createDraft } from "../../../domain/job-draft.js";
import { QUEUE_SCOPES, findIn, jobDefaults } from "./shared.js";

export function templateActions({ ui, getModel, lifecycle }) {
  const { run, confirmOr } = lifecycle;
  return {
    "create-from-template": ({ templateId }) => run("create_job_from_template", { template_id: templateId }, { target: templateTarget(templateId), invalidates: QUEUE_SCOPES, success: { key: "notice.jobCreated" } }),
    "create-template": () => ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "template", jobDefaults: jobDefaults(getModel()) }) }),
    "edit-template": ({ templateId }) => {
      const template = findIn(getModel(), "templates", "templateId", templateId);
      if (template) ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "template", target: template, jobDefaults: jobDefaults(getModel()) }) });
    },
    "remove-template": ({ templateId }) => confirmOr(
      { operation: "remove_template", parameters: { template_id: templateId }, options: { target: templateTarget(templateId), invalidates: ["templates"], closeOverlay: ui.overlay?.kind === "job-editor", success: { key: "notice.templateRemoved" } } },
      { titleKey: "confirm.removeTemplate.title", textKey: "confirm.removeTemplate.text", confirmKey: "confirm.removeTemplate.confirm", icon: "mdi:delete-outline", vars: { template: findIn(getModel(), "templates", "templateId", templateId)?.name ?? "" } }
    ),
    "reset-template-demand": ({ templateId }) => run("reset_template_demand", { template_id: templateId }, { target: templateTarget(templateId), invalidates: ["templates"], success: { key: "notice.templateDemandReset" } }),
  };
}
