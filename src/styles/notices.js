// The per-card notice: the result of this card's last command, until dismissed or replaced.

export const NOTICES_CSS = `
.voc-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
}

.voc-notice ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; flex: none; }
.voc-notice-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.voc-notice--error { background: color-mix(in srgb, var(--voc-error) 12%, transparent); border: 1px solid color-mix(in srgb, var(--voc-error) 40%, transparent); }
.voc-notice--error ha-icon { color: var(--voc-error); }
.voc-notice--success { background: color-mix(in srgb, var(--voc-success) 12%, transparent); border: 1px solid color-mix(in srgb, var(--voc-success) 38%, transparent); }
.voc-notice--success ha-icon { color: var(--voc-success); }
`;
