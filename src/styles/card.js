export const CARD_CSS = `
ha-card {
  /* An inline box cannot be a size container, so the element's own display is not left to chance. */
  display: block;
  container: voc-card / inline-size;
  border-radius: var(--voc-radius);
  padding: 0;
  overflow: hidden;
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary-text-color) 6%, transparent), transparent), var(--ha-card-background, var(--card-background-color));
  border: 1px solid color-mix(in srgb, var(--divider-color, var(--primary-text-color)) 70%, transparent);
  box-shadow: var(--ha-card-box-shadow, 0 8px 26px color-mix(in srgb, var(--primary-text-color) 18%, transparent));
}

.voc-root {
  position: relative;
  display: grid;
  gap: 11px;
  padding: 15px 16px 16px;
  color: var(--primary-text-color);
}

.voc-top-line {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, var(--tone-color), transparent);
}

.voc-root[data-accent-line="bottom"] .voc-top-line {
  inset: auto 0 0;
}

.voc-body {
  min-width: 0;
}

.voc-no-section,
.voc-render-failed {
  padding: 12px 4px;
  color: var(--voc-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

/* Text for assistive technology only. */
.voc-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
`;
