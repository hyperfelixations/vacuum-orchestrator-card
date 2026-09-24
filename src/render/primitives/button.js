import { escapeHtml } from "../../core/text.js";

// The shell's own button. The label stays a separate element so a narrow layout can hide the
// words without losing the accessible name, which always comes from aria-label.
export function buttonMarkup({ label = "", action = "", command = "", icon = "", disabled = false, ariaDisabled = false, title = "", className = "" } = {}) {
  const content = `${icon ? `<ha-icon icon="${escapeHtml(icon)}" aria-hidden="true"></ha-icon>` : ""}<span class="voc-button-label">${escapeHtml(label)}</span>`;
  return `<button type="button" class="voc-button ${escapeHtml(className)}" data-action="${escapeHtml(action)}"${command ? ` data-command="${escapeHtml(command)}"` : ""} aria-label="${escapeHtml(label)}"${disabled ? " disabled" : ""}${ariaDisabled ? ' aria-disabled="true"' : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${content}</button>`;
}

export function renderButton(context, options) {
  return context.htmlToElement(buttonMarkup(options));
}
