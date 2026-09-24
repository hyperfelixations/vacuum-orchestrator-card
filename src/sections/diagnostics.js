// What the card knows about its backend, in one place. It is the section that stays useful
// when the others cannot be served, so it requires no backend capability of its own.

import { buildDiagnosticsViewModel } from "../presentation/sections/diagnostics-vm.js";
import { e, errorBanner, t } from "./render-utils.js";

const ROWS = Object.freeze([
  ["apiVersion", "diagnostics.apiVersion"],
  ["integrationVersion", "diagnostics.integrationVersion"],
  ["subscription", "diagnostics.subscription"],
  ["commitId", "diagnostics.commitId"],
  ["queueRevision", "diagnostics.queueRevision"],
  ["lastUpdatedLabel", "diagnostics.lastUpdated"],
  ["snapshotAgeLabel", "diagnostics.snapshotAge"],
]);

function value(raw) {
  return raw === null || raw === undefined || raw === "" ? "—" : String(raw);
}

function dataRow(context, key, labelKey, raw) {
  return `<div class="voc-diagnostic-row" data-diagnostic-key="${e(key)}"><dt>${e(t(context, labelKey))}</dt><dd>${e(value(raw))}</dd></div>`;
}

export const diagnosticsSection = {
  key: "diagnostics",

  build(model, texts, options = {}, ui) {
    return buildDiagnosticsViewModel({ model, texts, nowMs: options.nowMs ?? null, ui });
  },

  structureSignature(content) {
    return [
      content.connection,
      content.stale ? "stale" : "fresh",
      content.readOnly ? "read-only" : "writable",
      content.lastCommandError ? "error" : "ok",
      content.capabilities.map((capability) => `${capability.key}:${capability.available ? 1 : 0}`).join(","),
    ].join("|");
  },

  render(context, viewModel) {
    const capabilities = viewModel.capabilities
      .map(
        (capability) =>
          `<li class="voc-capability${capability.available ? " is-available" : " is-missing"}" data-capability-key="${e(capability.key)}"><span class="voc-capability-mark" aria-hidden="true">${capability.available ? "✓" : "—"}</span><span>${e(capability.label)}</span><span class="voc-sr-only">${e(t(context, capability.available ? "value.yes" : "value.no"))}</span></li>`
      )
      .join("");
    const notes = [
      viewModel.stale ? `<p class="voc-diagnostic-note">${e(t(context, "hint.staleSnapshot"))}</p>` : "",
      viewModel.readOnly ? `<p class="voc-diagnostic-note">${e(t(context, "unavailable.readOnly"))}</p>` : "",
    ].join("");
    return `<section class="voc-section voc-diagnostics-section" data-section="diagnostics"><h2 class="voc-section-title">${e(t(context, "section.diagnostics"))}</h2>${viewModel.lastCommandError ? errorBanner(context, viewModel.lastCommandError) : ""}<div class="voc-diagnostics-status"><span class="voc-diagnostic-connection" data-connection="${e(viewModel.connection)}">${e(viewModel.connectionLabel)}</span></div>${notes}<dl class="voc-diagnostic-list">${ROWS.map(([key, labelKey]) => dataRow(context, key, labelKey, viewModel[key])).join("")}</dl><section class="voc-diagnostic-subsection"><h3>${e(t(context, "diagnostics.capabilities"))}</h3><ul class="voc-capability-list">${capabilities}</ul></section></section>`;
  },

  patch(_context, root, viewModel) {
    const section = root?.matches?.(".voc-diagnostics-section") ? root : root?.querySelector?.(".voc-diagnostics-section");
    if (!section) return;
    const connection = section.querySelector(".voc-diagnostic-connection");
    if (connection) {
      connection.textContent = viewModel.connectionLabel;
      connection.setAttribute("data-connection", viewModel.connection);
    }
    for (const [key] of ROWS) {
      const element = section.querySelector(`[data-diagnostic-key="${key}"] dd`);
      if (element) element.textContent = value(viewModel[key]);
    }
  },
};

export default diagnosticsSection;
