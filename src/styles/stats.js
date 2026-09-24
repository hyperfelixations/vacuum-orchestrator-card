export const STATS_CSS = `
.voc-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
.voc-stat-tile { display: grid; gap: 3px; min-width: 0; padding: 9px 10px; border: 1px solid var(--voc-hairline); border-radius: 14px; background: var(--voc-panel); }
.voc-stat-value { color: var(--primary-text-color); font-size: 18px; font-weight: 850; line-height: 1; }
.voc-stat-label { overflow: hidden; color: var(--voc-muted); font-size: 10px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
`;
