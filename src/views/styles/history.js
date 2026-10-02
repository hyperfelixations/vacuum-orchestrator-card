// History view: the segment switch, the job log and cleaning-run rows.

export const HISTORY_CSS = `
.voc-segments { display: flex; flex-wrap: wrap; gap: 6px; }
.voc-list { display: grid; gap: 6px; }
.voc-run { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; align-items: start; padding: 9px 10px; border-radius: 14px; background: var(--voc-chip-bg); border: 1px solid var(--voc-hairline); }
.voc-run[data-tone="attention"] { border-color: color-mix(in srgb, var(--voc-error) 35%, transparent); }
.voc-run-icon { display: flex; width: 30px; height: 30px; align-items: center; justify-content: center; border-radius: 10px; background: var(--voc-panel); color: var(--voc-muted); }
.voc-run-icon ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
.voc-run-main { display: grid; gap: 4px; min-width: 0; }
.voc-run-title { font-size: 13px; font-weight: 850; overflow-wrap: anywhere; }
.voc-run-meta > span:first-child { flex-basis: 100%; }
.voc-run-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 11.5px; font-weight: 700; color: var(--voc-muted); }
.voc-job-time { color: var(--voc-faint); }
`;
