// Job detail page: summary chips, a finished job's result, progress, the three axes of the waiting
// reason, execution explanation, attempts and trace.

export const DETAIL_CSS = `
.voc-detail-summary { display: grid; gap: 6px; }
.voc-detail-line { display: flex; flex-wrap: wrap; gap: 6px; }
.voc-detail-position { display: flex; align-items: center; gap: var(--voc-target-gap); font-size: 12px; font-weight: 700; color: var(--voc-muted); }
.voc-detail-position > span { margin-right: 4px; }
.voc-detail-ok { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; font-weight: 700; color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
.voc-detail-ok ha-icon { --mdc-icon-size: 16px; }
.voc-inline-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.voc-axis { display: grid; gap: 4px; }
.voc-axis + .voc-axis, .voc-inline-actions + .voc-axis { padding-top: 6px; border-top: 1px solid var(--voc-hairline); }
.voc-axis-title { font-size: 12px; font-weight: 850; }
.voc-axis li[data-ready="true"] ha-icon { color: var(--voc-success); }
.voc-axis li strong { font-weight: 850; }
.voc-result li ha-icon { color: var(--voc-muted); }
.voc-result li[data-tone="success"] ha-icon { color: var(--voc-success); }
.voc-result li[data-tone="attention"] ha-icon { color: var(--voc-warning); }
.voc-result + .voc-inline-actions { padding-top: 2px; }
.voc-trace-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }

.voc-phase { display: grid; gap: 4px; }
.voc-phase + .voc-phase { padding-top: 6px; border-top: 1px solid var(--voc-hairline); }
.voc-phase-title { font-size: 12px; font-weight: 850; }
.voc-phase-robots { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.voc-phase-robots li { display: grid; grid-template-columns: 16px auto 1fr; align-items: center; gap: 6px; font-size: 12px; line-height: 1.3; }
.voc-phase-robots ha-icon { --mdc-icon-size: 16px; }
.voc-phase-robots li[data-eligible="true"] ha-icon { color: var(--voc-success); }
.voc-phase-robots li[data-eligible="false"] ha-icon { color: var(--voc-faint); }
.voc-phase-robot { font-weight: 850; }
.voc-phase-reason { min-width: 0; color: var(--voc-muted); font-weight: 650; overflow-wrap: anywhere; }

.voc-attempts { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 12px; }
.voc-attempts li { display: flex; flex-wrap: wrap; gap: 6px; }
.voc-attempts span { color: var(--voc-muted); font-weight: 650; }

.voc-trace { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 11.5px; }
.voc-trace li { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: baseline; }
.voc-trace-time { color: var(--voc-faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
.voc-trace li.voc-trace-day { display: block; margin-top: 6px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--voc-muted); }
.voc-trace li.voc-trace-day:first-child { margin-top: 0; }
.voc-trace-event { font-weight: 800; }
.voc-trace li[data-tone="attention"] .voc-trace-event { color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-trace-detail { min-width: 0; color: var(--voc-muted); overflow-wrap: anywhere; }
.voc-trace-count { font-weight: 800; color: var(--voc-muted); font-variant-numeric: tabular-nums; }

@container voc-card (max-width: 399px) {
  .voc-trace li { grid-template-columns: 1fr; gap: 0; }
}
`;
