// The diagnostics view. See internal dev doc §8 "Diagnose".

import { boolOption } from "../config/option-schemas.js";
import { buildDiagnosticsView, diagnosticsNeeded } from "../presentation/views/diagnostics.js";
import { button, e, icon, pill } from "../render/primitives/markup.js";
import { block } from "./overlays/frame.js";
import { errorState, facts, loadingState, traceList } from "./parts.js";
import { DIAGNOSTICS_CSS } from "./styles/diagnostics.js";

function setupList(context, vm) {
  if (!vm.setup.length) return "";
  const rows = vm.setup.map((step) => `<li data-key="step:${e(step.key)}" data-done="${step.done}">${icon(step.done ? "mdi:check-circle" : "mdi:circle-outline")}<span>${e(step.label)}</span></li>`).join("");
  return block(context.t("diagnostics.setup"), `<ul class="voc-checklist">${rows}</ul>`, { iconName: "mdi:clipboard-check-outline", key: "setup" });
}

function traceBlock(context, vm) {
  if (vm.trace === null) return "";
  let content;
  if (vm.trace.length) content = traceList(vm.trace);
  else if (vm.traceLoading) content = loadingState(context);
  else content = `<p class="voc-overlay-lead">${e(context.t("diagnostics.traceEmpty"))}</p>`;
  return block(context.t("diagnostics.trace"), `<p class="voc-overlay-lead">${e(context.t("diagnostics.traceLead"))}</p>${content}`, { iconName: "mdi:timeline-text-outline", key: "trace" });
}

export function renderDiagnostics(context, vm) {
  const wrap = (content) => `<div class="voc-view voc-diagnostics" data-key="view:diagnostics">${content}</div>`;
  if (vm.error) return wrap(errorState(context, vm.error));
  if (vm.loading) return wrap(loadingState(context));
  const connection = `<div class="voc-diagnostics-connection" data-key="connection">${pill(vm.connection.label, vm.connection.tone, { iconName: "mdi:lan-connect" })}</div>`;
  const sink = vm.sinkFailures ? `<div class="voc-alert" data-key="sink" role="status">${icon("mdi:database-alert-outline")}<div class="voc-alert-text"><span>${e(vm.sinkFailures)}</span></div></div>` : "";
  const download = vm.download
    ? `<div class="voc-diagnostics-download" data-key="download"><span>${e(context.t("diagnostics.downloadHint"))}</span>${button({ action: "navigate", args: { path: vm.download.path }, label: context.t("onboarding.action.openIntegration"), iconName: "mdi:open-in-app" })}</div>`
    : "";
  const versions = block(context.t("diagnostics.versions"), `${connection}${facts(vm.facts)}`, { iconName: "mdi:information-outline", key: "versions" });
  return wrap(`${sink}${versions}${setupList(context, vm)}${traceBlock(context, vm)}${download}`);
}

export const diagnosticsView = Object.freeze({
  key: "diagnostics",
  icon: "mdi:stethoscope",
  requires: ["get_diagnostics"],
  defaultEnabled: (model) => diagnosticsNeeded(model),
  optionsSchema: Object.freeze({ show_trace: boolOption(true) }),
  primary: null,
  scopes: ({ options }) => [{ name: "diagnostics" }, ...(options.show_trace === false ? [] : [{ name: "trace" }])],
  build: ({ model, texts, options }) => buildDiagnosticsView({ model, texts, options }),
  render: renderDiagnostics,
  css: DIAGNOSTICS_CSS,
});
