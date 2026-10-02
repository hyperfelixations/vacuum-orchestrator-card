// Buttons, pills and chips shared by the shell and every view.

export const BUTTONS_CSS = `
button { font: inherit; color: inherit; }

.voc-button {
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--voc-control);
  padding: 6px 13px;
  border: 1px solid var(--voc-hairline);
  border-radius: 999px;
  background: var(--voc-chip-bg);
  color: var(--primary-text-color);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.1;
  text-decoration: none;
  white-space: nowrap;
}

.voc-button ha-icon { --mdc-icon-size: 17px; width: 17px; height: 17px; flex: none; }
.voc-button:hover { background: color-mix(in srgb, var(--primary-text-color) 7%, transparent); }
.voc-button--primary { border-color: var(--tone-border); background: var(--tone-soft); color: var(--tone-ink); }
.voc-button--primary:hover { background: color-mix(in srgb, var(--tone-color) 28%, transparent); }
.voc-button--quiet { background: transparent; }
.voc-button--danger { border-color: color-mix(in srgb, var(--voc-error) 45%, transparent); color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-button--icon { width: var(--voc-icon-target); min-width: var(--voc-icon-target); min-height: var(--voc-icon-target); padding: 0; border-color: transparent; background: transparent; color: var(--voc-muted); }
.voc-button--icon:hover { background: var(--voc-chip-bg); color: var(--primary-text-color); }
.voc-button[disabled] { cursor: default; opacity: .4; }
.voc-button[aria-disabled="true"] { cursor: not-allowed; opacity: .55; }
.voc-button[aria-pressed="true"] { border-color: var(--tone-border); background: var(--tone-soft); color: var(--tone-ink); }

.voc-tab:focus-visible, .voc-button:focus-visible, .voc-root :is(input, textarea, [role="radio"], [role="option"], [role="switch"], [role="checkbox"]):focus-visible {
  outline: 2px solid var(--voc-focus);
  outline-offset: 2px;
}

.voc-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.35;
  white-space: nowrap;
  border: 1px solid transparent;
}

.voc-pill ha-icon { --mdc-icon-size: 13px; width: 13px; height: 13px; }
.voc-pill--neutral { background: var(--voc-chip-bg); border-color: var(--voc-hairline); color: var(--voc-muted); }
.voc-pill--ready { background: color-mix(in srgb, var(--voc-success) 16%, transparent); color: color-mix(in srgb, var(--voc-success) 78%, var(--primary-text-color)); }
.voc-pill--running { background: color-mix(in srgb, var(--voc-info) 16%, transparent); color: color-mix(in srgb, var(--voc-info) 78%, var(--primary-text-color)); }
.voc-pill--attention { background: color-mix(in srgb, var(--voc-error) 15%, transparent); color: color-mix(in srgb, var(--voc-error) 78%, var(--primary-text-color)); }
.voc-pill--muted { background: transparent; border-color: var(--voc-hairline); color: var(--voc-faint); }

.voc-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--voc-chip-bg);
  border: 1px solid var(--voc-hairline);
  color: var(--voc-muted);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.3;
}

.voc-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voc-chip ha-icon { --mdc-icon-size: 13px; width: 13px; height: 13px; flex: none; }
`;
