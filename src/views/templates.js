// The templates view. See internal dev doc §8 "Vorlagen".

import { buildTemplatesView, templatesAreEmpty } from "../presentation/views/templates.js";
import { button, chip, e, icon, pill } from "../render/primitives/markup.js";
import { emptyState, errorState, itemMenu, loadingState } from "./parts.js";
import { TEMPLATES_CSS } from "./styles/templates.js";

// UI-32: one main action, a job from the template, then the menu.
function templateCard(context, template) {
  const args = { templateId: template.templateId };
  const more = itemMenu(context, {
    key: `template:${template.templateId}`,
    label: context.t("action.moreFor", { job: template.name }),
    items: [
      { action: "edit-template", args, iconName: "mdi:pencil-outline", labelKey: "action.edit", decision: template.actions.edit },
      { action: "remove-template", args, iconName: "mdi:delete-outline", labelKey: "action.delete", decision: template.actions.remove, tone: "danger" },
    ],
    open: template.menuOpen === true,
  });
  const badges = template.badges.map((badge) => pill(badge.text, badge.tone)).join("");
  const chips = template.settings.map((setting) => chip(setting.text, { iconName: setting.icon, label: setting.label })).join("");
  const suppressed = template.suppressed
    ? `<div class="voc-template-note" data-key="suppressed">${icon("mdi:timer-sand-complete")}<span>${e(template.suppressed)}</span>${button({ action: "reset-template-demand", args: { templateId: template.templateId }, label: context.t("action.resetDemand"), variant: "quiet", decision: template.actions.resetDemand, reasonText: context.reason(template.actions.resetDemand) })}</div>`
    : "";
  const create = button({ action: "create-from-template", args: { templateId: template.templateId }, label: context.t("action.createFromTemplate"), iconName: "mdi:playlist-plus", decision: template.actions.instantiate, reasonText: context.reason(template.actions.instantiate), className: "voc-template-create" });
  return `<article class="voc-template" data-key="template:${e(template.templateId)}" data-tone="${e(template.tone)}"><header class="voc-template-head"><span class="voc-template-icon" aria-hidden="true">${icon(template.modeIcon)}</span><div class="voc-template-title"><h3 class="voc-template-name">${e(template.name)}</h3><div class="voc-template-meta">${e([template.modeLabel, template.rooms].filter(Boolean).join(" · "))}</div></div></header>${suppressed}<div class="voc-template-foot">${badges}${chips}<span class="voc-template-actions">${create}${more}</span></div></article>`;
}

export function renderTemplates(context, vm) {
  const wrap = (content) => `<div class="voc-view voc-templates" data-key="view:templates">${content}</div>`;
  if (vm.error) return wrap(errorState(context, vm.error));
  if (vm.loading) return wrap(loadingState(context));
  if (!vm.templates.length) {
    const create = button({ action: "create-template", label: context.t("action.createTemplate"), iconName: "mdi:plus", variant: "primary", decision: vm.create, reasonText: context.reason(vm.create) });
    return wrap(emptyState("mdi:content-copy", context.t("templates.empty"), create, context.t("templates.emptyHint")));
  }
  return wrap(`<div class="voc-template-list">${vm.templates.map((template) => templateCard(context, template)).join("")}</div>`);
}

export const templatesView = Object.freeze({
  key: "templates",
  icon: "mdi:content-copy",
  requires: ["get_templates"],
  defaultEnabled: () => true,
  optionsSchema: Object.freeze({}),
  primary: Object.freeze({ action: "create-template", icon: "mdi:plus", labelKey: "action.createTemplate", operation: "save_template", target: "create" }),
  bodyHoldsPrimary: ({ model }) => templatesAreEmpty(model),
  scopes: () => [{ name: "templates" }],
  build: ({ model, texts, context, ui }) => buildTemplatesView({ model, texts, context, ui }),
  render: renderTemplates,
  css: TEMPLATES_CSS,
});
