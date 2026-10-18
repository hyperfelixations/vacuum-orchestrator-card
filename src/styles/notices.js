// Notices: the card's own (`--float`), the result of its last command until dismissed or replaced,
// floats over the card's foot like a snackbar and moves no control (LAY-12); a page's notes stand
// in its flow. Their surface is opaque.

export const NOTICES_CSS = `
.voc-notice--float {
  position: absolute;
  inset-inline: 12px;
  bottom: 12px;
  z-index: 4;
  box-shadow: 0 6px 18px color-mix(in srgb, #000 22%, transparent);
}
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

.voc-notice ha-icon { --mdc-icon-size: 18px; }
.voc-notice-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.voc-notice--error { background: color-mix(in srgb, var(--voc-error) 12%, var(--card-background-color, #fff)); border: 1px solid color-mix(in srgb, var(--voc-error) 40%, transparent); }
.voc-notice--error ha-icon { color: var(--voc-error); }
.voc-notice--warning { background: color-mix(in srgb, var(--voc-warning) 14%, var(--card-background-color, #fff)); border: 1px solid var(--voc-warning-border); }
.voc-notice--warning ha-icon { color: var(--voc-warning-ink); }
.voc-notice--success { background: color-mix(in srgb, var(--voc-success) 12%, var(--card-background-color, #fff)); border: 1px solid color-mix(in srgb, var(--voc-success) 38%, transparent); }
.voc-notice--success ha-icon { color: var(--voc-success); }
.voc-notice--info { background: color-mix(in srgb, var(--voc-accent) 10%, var(--card-background-color, #fff)); border: 1px solid var(--voc-accent-border); }
.voc-notice--info ha-icon { color: var(--voc-accent-ink); }
`;
