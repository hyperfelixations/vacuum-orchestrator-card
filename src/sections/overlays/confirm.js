// Destructive confirmation route. The runtime uses data-focus-trap to enforce keyboard focus.

import { actionButton, e, t } from "../render-utils.js";

export const confirmOverlay = {
  key: "confirm",

  build(_model, _texts, options = {}, ui) {
    return {
      key: "confirm",
      titleKey: options.titleKey || "confirm.deleteJob.title",
      textKey: options.textKey || "confirm.deleteJob.text",
      confirmKey: options.confirmKey || "confirm.deleteJob.confirm",
      action: options.action || "confirm-command",
      command: options.command || null,
      jobId: options.jobId || null,
      jobName: options.jobName || options.name || ui?.selectedJob?.name || "",
      defaultFocus: "cancel",
      ui,
    };
  },

  render(context, viewModel) {
    const title = t(context, viewModel.titleKey);
    const message = t(context, viewModel.textKey, { name: viewModel.jobName || "" });
    const confirmLabel = t(context, viewModel.confirmKey);
    return `<section class="voc-overlay voc-confirm-overlay" data-overlay="confirm" role="alertdialog" aria-modal="true" aria-labelledby="voc-confirm-title" aria-describedby="voc-confirm-text" data-focus-trap="true"><div class="voc-confirm-panel"><h2 id="voc-confirm-title">${e(title)}</h2><p id="voc-confirm-text">${e(message)}</p><div class="voc-confirm-actions"><button type="button" class="voc-secondary-button" data-action="dismiss" data-focus-default="true">${e(t(context, "action.cancel"))}</button>${actionButton(context, { action: viewModel.action, command: viewModel.command, jobId: viewModel.jobId, label: confirmLabel, iconName: "mdi:check", extra: ' data-focus-confirm="true"' })}</div></div></section>`;
  },

  patch() {},
};

export default confirmOverlay;
