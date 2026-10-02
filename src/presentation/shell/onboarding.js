// What the card shows instead of its views while the integration is not usable: how to get it,
// how to set it up, or why it does not answer. Navigation targets are Home Assistant's own
// "My" redirects, so Home Assistant keeps ownership of installation and setup.

import { INTEGRATION_PAGE_PATH, INTEGRATION_URL, SET_UP_PATH } from "../common/links.js";
import { failureText, t } from "../common/texts.js";

const ICONS = Object.freeze({
  probing: "mdi:lan-pending",
  not_installed: "mdi:package-variant-closed-plus",
  not_set_up: "mdi:puzzle-plus-outline",
  load_failed: "mdi:alert-circle-outline",
  api_incompatible: "mdi:swap-horizontal-circle-outline",
  offline: "mdi:lan-disconnect",
});

export function buildOnboarding({ model = {}, texts } = {}) {
  const phase = model.phase;
  if (!phase || phase === "ready") return null;
  const isAdmin = model.permissions?.isAdmin === true;
  const base = {
    phase,
    icon: ICONS[phase] || ICONS.probing,
    title: t(texts, `onboarding.${phase}.title`),
    text: t(texts, `onboarding.${phase}.text`),
    steps: [],
    actions: [],
    note: null,
    busy: phase === "probing",
  };
  if (phase === "not_installed") {
    base.steps = [1, 2, 3].map((step) => t(texts, `onboarding.not_installed.step${step}`));
    base.actions = [{ kind: "link", href: INTEGRATION_URL, label: t(texts, "onboarding.action.guide"), icon: "mdi:open-in-new" }];
  } else if (phase === "not_set_up") {
    base.actions = isAdmin ? [{ kind: "navigate", path: SET_UP_PATH, label: t(texts, "onboarding.action.setUp"), icon: "mdi:plus" }] : [];
    if (!isAdmin) base.note = t(texts, "onboarding.adminRequired");
  } else if (phase === "load_failed") {
    base.actions = isAdmin ? [{ kind: "navigate", path: INTEGRATION_PAGE_PATH, label: t(texts, "onboarding.action.openIntegration"), icon: "mdi:cog-outline" }] : [];
    base.note = model.phaseFailure ? failureText(texts, model.phaseFailure) : null;
  } else if (phase === "api_incompatible") {
    base.text = t(texts, "onboarding.api_incompatible.text", { version: model.phaseFailure?.detail ?? "?", supported: "2" });
    base.actions = [{ kind: "link", href: INTEGRATION_URL, label: t(texts, "onboarding.action.guide"), icon: "mdi:open-in-new" }];
  }
  return base;
}
