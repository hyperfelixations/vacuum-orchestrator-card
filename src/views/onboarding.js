// The onboarding body: what the user does next while the integration is missing, not set up,
// failing or incompatible.

import { button, e, icon, link } from "../render/primitives/markup.js";

export function renderOnboarding(_context, vm) {
  const steps = vm.steps.length ? `<ol class="voc-onboarding-steps">${vm.steps.map((step) => `<li>${e(step)}</li>`).join("")}</ol>` : "";
  const actions = vm.actions
    .map((action) => (action.kind === "link"
      ? link({ href: action.href, label: action.label, iconName: action.icon })
      : button({ action: "navigate", args: { path: action.path }, label: action.label, iconName: action.icon, variant: "primary" })))
    .join("");
  return `<section class="voc-onboarding" data-key="onboarding:${e(vm.phase)}" data-phase="${e(vm.phase)}"${vm.busy ? ' data-busy="true"' : ""}><div class="voc-onboarding-head">${icon(vm.icon)}<h2 class="voc-onboarding-title">${e(vm.title)}</h2></div><p class="voc-onboarding-text">${e(vm.text)}</p>${steps}${vm.note ? `<p class="voc-onboarding-note">${e(vm.note)}</p>` : ""}${actions ? `<div class="voc-onboarding-actions">${actions}</div>` : ""}</section>`;
}
