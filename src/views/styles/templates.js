// Templates view: one card per template with intent, state badges and its create action.

export const TEMPLATES_CSS = `
.voc-template-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 8px; }
.voc-template { display: grid; gap: 8px; align-content: start; min-width: 0; padding: 10px 10px 10px 12px; border-radius: 14px; background: var(--voc-chip-bg); border: 1px solid var(--voc-hairline); }
.voc-template[data-tone="muted"] { opacity: .72; }
.voc-template-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.voc-template-icon { display: flex; flex: none; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 12px; background: var(--voc-panel); border: 1px solid var(--voc-hairline); color: var(--voc-muted); }
.voc-template[data-tone="running"] .voc-template-icon { color: var(--voc-info); border-color: color-mix(in srgb, var(--voc-info) 40%, transparent); }
.voc-template-icon ha-icon { --mdc-icon-size: 21px; width: 21px; height: 21px; }
.voc-template-title { flex: 1; min-width: 0; display: grid; gap: 2px; }
.voc-template-name { margin: 0; font-size: 14.5px; font-weight: 900; overflow-wrap: anywhere; }
.voc-template-meta { font-size: 12px; font-weight: 700; color: var(--voc-muted); overflow-wrap: anywhere; }
.voc-template-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; }
.voc-template-create { margin-left: auto; }
.voc-template-note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px; background: var(--voc-panel); font-size: 12px; font-weight: 700; color: var(--voc-muted); }
.voc-template-note > ha-icon { --mdc-icon-size: 15px; width: 15px; height: 15px; flex: none; }
.voc-template-note > span { flex: 1 1 160px; min-width: 0; }
`;
