export const TABS_CSS = `
.voc-tab-row { display: flex; min-width: 0; gap: 8px; align-items: center; }
.voc-tabs { display: flex; min-width: 0; flex: 1; gap: 5px; align-items: center; overflow-x: auto; scrollbar-width: thin; }
.voc-tab { flex: 0 0 auto; min-height: 32px; padding: 6px 12px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--voc-muted); cursor: pointer; font: inherit; font-size: 12px; font-weight: 800; }
.voc-tab[aria-selected="true"] { border-color: var(--tone-border); background: var(--tone-soft); color: var(--tone-ink); }
.voc-tab:focus-visible, .voc-button:focus-visible, .voc-icon-button:focus-visible, .voc-chip:focus-visible { outline: 2px solid var(--focus-color, var(--primary-color)); outline-offset: 2px; }
.voc-tab-short { display: none; }
.voc-primary-action { flex: 0 0 auto; border-color: var(--tone-border); background: var(--tone-soft); color: var(--tone-ink); }
`;
