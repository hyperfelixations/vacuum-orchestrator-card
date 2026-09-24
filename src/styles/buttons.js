export const BUTTONS_CSS = `
.voc-button, .voc-icon-button, .voc-chip { min-height: 32px; border: 1px solid var(--voc-hairline); border-radius: 999px; background: var(--secondary-background-color, var(--voc-panel)); color: var(--primary-text-color); cursor: pointer; font: inherit; font-size: 12px; font-weight: 800; }
.voc-button { display: inline-flex; gap: 6px; align-items: center; justify-content: center; padding: 6px 12px; }
.voc-button ha-icon { width: 16px; height: 16px; flex: none; }
.voc-button[disabled], .voc-icon-button[disabled], .voc-chip[disabled] { cursor: default; opacity: .5; }
.voc-button[aria-disabled="true"], .voc-icon-button[aria-disabled="true"] { cursor: not-allowed; opacity: .65; }
.voc-icon-button { display: inline-flex; width: 32px; align-items: center; justify-content: center; padding: 0; }
.voc-icon-button ha-icon { width: 18px; height: 18px; }
/* The card's footer: one queue-wide control, separated from the section body by a hairline. */
.voc-queue-controls { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; padding-top: 10px; border-top: 1px solid var(--voc-hairline); }
`;
