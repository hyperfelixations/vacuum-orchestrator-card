export const TOKENS_CSS = `
:host {
  display: block;
  --voc-radius: 20px;
  --voc-muted: var(--secondary-text-color);
  --voc-faint: color-mix(in srgb, var(--secondary-text-color) 72%, transparent);
  --voc-hairline: color-mix(in srgb, var(--divider-color, var(--primary-text-color)) 42%, transparent);
  --voc-panel: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
  --voc-warning: var(--warning-color, var(--primary-text-color));
  --voc-warning-bg: color-mix(in srgb, var(--voc-warning) 14%, transparent);
  --voc-warning-border: color-mix(in srgb, var(--voc-warning) 45%, transparent);
  --voc-warning-ink: color-mix(in srgb, var(--voc-warning) 62%, var(--primary-text-color));
  -webkit-tap-highlight-color: transparent;
}
`;
