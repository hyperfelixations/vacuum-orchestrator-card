// Setup assistant: a vertical list of numbered steps; done steps show a check, the current one
// its explanation and actions.

export const SETUP_CSS = `
.voc-setup-lead { margin: 0; font-size: 12.5px; font-weight: 650; line-height: 1.4; color: var(--voc-muted); }
.voc-setup-steps { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.voc-setup-step { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; padding-bottom: 14px; }
.voc-setup-step:last-child { padding-bottom: 0; }
.voc-setup-step:not(:last-child)::before { content: ""; position: absolute; left: 13.5px; top: 30px; bottom: 2px; width: 1px; background: var(--voc-hairline); }
.voc-setup-marker { display: flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid var(--voc-hairline); background: var(--voc-panel); color: var(--voc-muted); font-size: 12.5px; font-weight: 900; }
.voc-setup-marker ha-icon { --mdc-icon-size: 16px; width: 16px; height: 16px; }
.voc-setup-step[data-done="true"] .voc-setup-marker { border-color: color-mix(in srgb, var(--voc-success) 45%, transparent); background: color-mix(in srgb, var(--voc-success) 16%, transparent); color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
.voc-setup-step[data-current="true"] .voc-setup-marker { border-color: var(--tone-border); background: var(--tone-soft); color: var(--tone-ink); }
.voc-setup-main { display: grid; gap: 8px; min-width: 0; padding-top: 4px; }
.voc-setup-head { display: grid; gap: 2px; }
.voc-setup-title { margin: 0; font-size: 13.5px; font-weight: 850; }
.voc-setup-step[data-done="false"][data-current="false"] .voc-setup-title { color: var(--voc-muted); }
.voc-setup-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 12px; font-weight: 650; color: var(--voc-muted); overflow-wrap: anywhere; }
.voc-setup-mark { display: inline-flex; align-items: center; min-height: 18px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--voc-hairline); font-size: 10.5px; font-weight: 800; color: var(--voc-muted); }
.voc-setup-mark[data-tone="default"] { border-color: var(--tone-border); color: var(--tone-ink); }
.voc-setup-open { padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.voc-setup-open:hover { text-decoration: underline; }
.voc-setup-open:focus-visible { outline: 2px solid var(--tone-ink); outline-offset: 2px; border-radius: 4px; }
.voc-setup-body { display: grid; gap: 8px; padding: 10px 12px; border-radius: 14px; background: var(--voc-chip-bg); border: 1px solid var(--voc-hairline); }
.voc-setup-text { margin: 0; font-size: 12.5px; font-weight: 600; line-height: 1.4; }
.voc-setup-note { display: flex; gap: 6px; margin: 0; font-size: 12px; font-weight: 650; line-height: 1.35; color: var(--voc-muted); }
.voc-setup-note ha-icon { --mdc-icon-size: 15px; width: 15px; height: 15px; flex: none; }
.voc-setup-label { margin: 0; font-size: 10px; font-weight: 850; letter-spacing: .075em; text-transform: uppercase; color: var(--voc-faint); }
.voc-setup-items { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.voc-setup-items li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 7px 8px 7px 10px; border-radius: 12px; background: var(--voc-panel); }
.voc-setup-item-text { display: grid; gap: 1px; flex: 1 1 140px; min-width: 0; }
.voc-setup-item-text strong { font-size: 12.5px; font-weight: 850; overflow-wrap: anywhere; }
.voc-setup-item-text span { font-size: 11px; font-weight: 650; color: var(--voc-muted); overflow-wrap: anywhere; }
.voc-setup-more { margin: 0; font-size: 11.5px; font-weight: 650; color: var(--voc-muted); }
.voc-alert--success { background: color-mix(in srgb, var(--voc-success) 9%, transparent); border-color: color-mix(in srgb, var(--voc-success) 38%, transparent); }
.voc-alert--success > ha-icon { color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
`;
