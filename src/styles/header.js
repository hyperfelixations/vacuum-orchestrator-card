// Header parts and the warning block (RCC header slice). Absent header columns are removed
// through `data-parts` on the root, never through `:has()`.

export const HEADER_CSS = `
.voc-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 11px;
  align-items: center;
  min-width: 0;
}

.voc-icon-badge {
  width: 39px;
  height: 39px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tone-soft);
  border: 1px solid var(--tone-border);
}

.voc-icon-badge ha-icon {
  --mdc-icon-size: 22px;
  width: 22px;
  height: 22px;
  color: var(--tone-ink);
}

.voc-root[data-parts="icon title"] .voc-header,
.voc-root[data-parts="icon pill"] .voc-header { grid-template-columns: auto 1fr; }
.voc-root[data-parts="title pill"] .voc-header { grid-template-columns: 1fr auto; }
.voc-root[data-parts="icon"] .voc-header { grid-template-columns: auto; }
.voc-root[data-parts="title"] .voc-header,
.voc-root[data-parts="pill"] .voc-header { grid-template-columns: 1fr; }
.voc-root[data-parts="icon pill"] .voc-status-pill,
.voc-root[data-parts="pill"] .voc-status-pill { justify-self: end; }

.voc-title-block { min-width: 0; }

.voc-title {
  font-size: 21px;
  font-weight: 920;
  line-height: 1.05;
  color: var(--primary-text-color);
}

.voc-root[data-title="clip"] .voc-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voc-subtitle {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  color: var(--voc-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voc-root[data-subtitle="wrap"] .voc-subtitle {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  overflow-wrap: anywhere;
}

.voc-status-pill {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  color: var(--tone-ink);
  background: var(--tone-soft);
  border: 1px solid var(--tone-border);
}

.voc-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 14px;
  background: var(--voc-warning-bg);
  border: 1px solid var(--voc-warning-border);
  color: var(--primary-text-color);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.3;
}

.voc-warning-icon {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  fill: var(--voc-warning-ink);
}

.voc-warning-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
`;
