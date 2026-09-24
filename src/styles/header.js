export const HEADER_CSS = `
.voc-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  min-width: 0;
}

.voc-header[data-parts="icon title"] { grid-template-columns: auto minmax(0, 1fr); }
.voc-header[data-parts="icon pill"] { grid-template-columns: auto minmax(0, 1fr); }
.voc-header[data-parts="title pill"] { grid-template-columns: minmax(0, 1fr) auto; }
.voc-header[data-parts="icon"], .voc-header[data-parts="title"], .voc-header[data-parts="pill"] { grid-template-columns: minmax(0, 1fr); }
.voc-header[data-parts="icon pill"] .voc-pill, .voc-header[data-parts="pill"] .voc-pill { justify-self: end; }

.voc-icon-badge {
  display: flex;
  width: 39px;
  height: 39px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--tone-border);
  border-radius: 14px;
  background: var(--tone-soft);
}

.voc-icon-badge ha-icon { width: 22px; height: 22px; color: var(--tone-ink); }
.voc-title-block { min-width: 0; }
.voc-title { color: var(--primary-text-color); font-size: 21px; font-weight: 920; line-height: 1.05; }
.voc-root[data-title="clip"] .voc-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voc-subtitle { margin-top: 4px; color: var(--voc-muted); font-size: 12px; font-weight: 650; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voc-root[data-subtitle="wrap"] .voc-subtitle { overflow-wrap: anywhere; overflow: visible; text-overflow: clip; white-space: normal; }
.voc-pill { padding: 6px 10px; border: 1px solid var(--tone-border); border-radius: 999px; background: var(--tone-soft); color: var(--tone-ink); font-size: 12px; font-weight: 900; white-space: nowrap; }
`;
