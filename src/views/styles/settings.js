// Settings view: one row per setting with its explanation, current value and change button.

export const SETTINGS_CSS = `
.voc-setting { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px 12px; }
.voc-setting-text { display: grid; gap: 2px; min-width: 0; }
.voc-setting-text strong { font-size: 13px; font-weight: 850; line-height: 1.25; }
.voc-setting-text span { font-size: 12px; font-weight: 650; line-height: 1.35; color: var(--voc-muted); }
.voc-setting-value { font-size: 15px; font-weight: 850; font-variant-numeric: tabular-nums; white-space: nowrap; }

@container voc-card (max-width: 399px) {
  .voc-setting { grid-template-columns: minmax(0, 1fr) auto; }
  .voc-setting-text { grid-column: 1 / -1; }
}
`;
