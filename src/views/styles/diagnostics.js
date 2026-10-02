// Diagnostics view: connection state, version facts, the setup checklist and the trace.

export const DIAGNOSTICS_CSS = `
.voc-diagnostics-connection { display: flex; }
.voc-checklist { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 12.5px; font-weight: 700; }
.voc-checklist li { display: flex; align-items: center; gap: 6px; color: var(--voc-muted); }
.voc-checklist li[data-done="true"] { color: var(--primary-text-color); }
.voc-checklist ha-icon { --mdc-icon-size: 16px; width: 16px; height: 16px; flex: none; }
.voc-checklist li[data-done="true"] ha-icon { color: var(--voc-success); }
.voc-diagnostics-download { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; font-weight: 650; color: var(--voc-muted); }
.voc-diagnostics-download > span { flex: 1 1 200px; }
`;
