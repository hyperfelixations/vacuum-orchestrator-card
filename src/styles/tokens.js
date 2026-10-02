// Design tokens. Values match the Room Climate Card's `--rtc-*` tokens one to one, so both
// cards share surface, hairlines, panels, warning tint and shadow. Target sizes grow to 44 px
// under a coarse pointer (WCAG 2.5.5). See internal dev doc §9 "Designsprache".

export const TOKENS_CSS = `
:host {
  display: block;
  --voc-radius: 20px;
  --voc-muted: var(--secondary-text-color);
  --voc-faint: color-mix(in srgb, var(--secondary-text-color) 72%, transparent);
  --voc-hairline: color-mix(in srgb, var(--divider-color, var(--primary-text-color)) 42%, transparent);
  --voc-panel: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
  --voc-chip-bg: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
  --voc-card-border: color-mix(in srgb, var(--divider-color, var(--primary-text-color)) 70%, transparent);
  --voc-top-overlay: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  --voc-card-shadow: 0 8px 26px rgba(0,0,0,0.18);
  --voc-warning: var(--warning-color, #ffa600);
  --voc-warning-bg: color-mix(in srgb, var(--voc-warning) 14%, transparent);
  --voc-warning-border: color-mix(in srgb, var(--voc-warning) 45%, transparent);
  --voc-warning-ink: color-mix(in srgb, var(--voc-warning) 62%, var(--primary-text-color));
  --voc-error: var(--error-color, #db4437);
  --voc-success: var(--success-color, #43a047);
  --voc-info: var(--info-color, #039be5);
  --voc-focus: var(--focus-color, var(--primary-color, #03a9f4));
  --voc-control: 34px;
  --voc-icon-target: 34px;
  --voc-row-target: 36px;
  --voc-tile-target: 40px;
  --voc-target-gap: 4px;
  --voc-chip-target: 26px;
  -webkit-tap-highlight-color: transparent;
}

@media (pointer: coarse) {
  :host {
    --voc-control: 40px;
    --voc-icon-target: 44px;
    --voc-row-target: 44px;
    --voc-tile-target: 44px;
    --voc-target-gap: 8px;
    --voc-chip-target: 40px;
  }
}
`;
