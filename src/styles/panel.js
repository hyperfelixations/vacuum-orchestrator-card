// The main panel (RCC main panel): headline figure, run state and the queue-wide control.

export const PANEL_CSS = `
.voc-panel {
  display: grid;
  grid-template-columns: minmax(84px, auto) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border-radius: 17px;
  padding: 9px 10px 9px 12px;
  background: var(--voc-panel);
  border: 1px solid var(--voc-hairline);
}

.voc-panel-headline { min-width: 0; }

.voc-panel-label {
  display: block;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .075em;
  text-transform: uppercase;
  color: var(--voc-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voc-panel-value {
  display: block;
  margin-top: 4px;
  font-size: 33px;
  font-weight: 950;
  line-height: .95;
  font-variant-numeric: tabular-nums;
  color: var(--primary-text-color);
}

.voc-panel-status { min-width: 0; display: grid; gap: 4px; }

.voc-panel-mode {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
}

.voc-dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--voc-faint);
}

.voc-panel[data-queue-mode="running"] .voc-dot { background: var(--voc-info); box-shadow: 0 0 0 3px color-mix(in srgb, var(--voc-info) 22%, transparent); }
.voc-panel[data-queue-mode="paused"] .voc-dot { background: var(--voc-warning); }

.voc-panel-robots { display: flex; flex-wrap: wrap; gap: 2px 12px; }
.voc-panel-robot { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; line-height: 1.25; color: var(--voc-muted); }
.voc-panel-robot .voc-dot { flex-basis: 6px; width: 6px; height: 6px; }
.voc-panel-robot[data-tone="running"] .voc-dot { background: var(--voc-info); }
.voc-panel-robot[data-tone="ready"] .voc-dot { background: var(--voc-success); }
.voc-panel-robot[data-tone="attention"] .voc-dot { background: var(--voc-error); }
.voc-panel-control { justify-self: end; }
`;
