// The tab row: one tablist of views and, outside it, the active view's primary action. A row that
// does not fit drops labels step by step, then scrolls with a fading edge (see the tab strip
// runtime).

export const TABS_CSS = `
.voc-tab-row { display: flex; min-width: 0; gap: 8px; align-items: center; }
.voc-tabs, .voc-tabs-spacer { display: flex; min-width: 0; flex: 1; gap: 4px; align-items: center; }
.voc-tabs { overflow-x: auto; scrollbar-width: none; padding: 4px; margin: -4px; }
.voc-tabs::-webkit-scrollbar { display: none; }
.voc-primary-slot { flex: none; width: var(--voc-icon-target); }
.voc-tab-row[data-compact] .voc-primary-action { width: var(--voc-icon-target); min-height: var(--voc-icon-target); padding: 0; }
.voc-tab-row:is([data-compact="labels"], [data-compact="icons"]) .voc-tab:not([aria-selected="true"]), .voc-tab-row[data-compact="icons"] .voc-tab { min-width: var(--voc-icon-target); justify-content: center; padding: 6px 7px; }
.voc-tab-row[data-compact] .voc-primary-action .voc-button-label, .voc-tab-row:is([data-compact="labels"], [data-compact="icons"]) .voc-tab:not([aria-selected="true"]) .voc-tab-label, .voc-tab-row[data-compact="icons"] .voc-tab-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.voc-tabs[data-overflow-end] { mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); }
.voc-tabs[data-overflow-start] { mask-image: linear-gradient(to left, #000 calc(100% - 28px), transparent); }
.voc-tabs[data-overflow-start][data-overflow-end] { mask-image: linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent); }

.voc-tab {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: var(--voc-control);
  padding: 6px 12px 6px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--voc-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
}

.voc-tab ha-icon { --mdc-icon-size: 17px; width: 17px; height: 17px; }
.voc-tab:hover { background: var(--voc-chip-bg); color: var(--primary-text-color); }
.voc-tab[aria-selected="true"] { border-color: var(--tone-border); background: var(--tone-soft); color: var(--tone-ink); }
.voc-tab[data-unavailable="true"] { opacity: .6; }
`;
