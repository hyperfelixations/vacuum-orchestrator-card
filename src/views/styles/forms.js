// Editor and dialog fields: choice groups, stepper, text inputs, switches and the entity picker.

export const FORMS_CSS = `
.voc-form { display: grid; gap: 10px; min-width: 0; }
.voc-form-group { gap: 12px; }
.voc-field { display: grid; gap: 6px; min-width: 0; }
.voc-field--inline { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
.voc-field--inline > .voc-field-text { display: grid; gap: 2px; flex: 1 1 150px; min-width: 0; }
.voc-field--inline > .voc-field-error { flex-basis: 100%; }
.voc-field-label { font-size: 12px; font-weight: 800; color: var(--primary-text-color); }
.voc-field-optional { font-weight: 650; color: var(--voc-faint); }
.voc-field-hint { font-size: 11.5px; font-weight: 600; line-height: 1.35; color: var(--voc-muted); }
.voc-field-error { font-size: 11.5px; font-weight: 750; line-height: 1.35; color: color-mix(in srgb, var(--voc-error) 85%, var(--primary-text-color)); }

.voc-segmented, .voc-chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.voc-option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: var(--voc-control);
  padding: 5px 11px;
  border: 1px solid var(--voc-hairline);
  border-radius: 999px;
  background: var(--voc-chip-bg);
  color: var(--voc-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
}
.voc-option ha-icon { --mdc-icon-size: 16px; width: 16px; height: 16px; }
.voc-option:hover { color: var(--primary-text-color); }
.voc-option.is-selected { border-color: var(--tone-border); background: var(--tone-soft); color: var(--tone-ink); }
.voc-option[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.voc-option.is-muted { opacity: .55; }
.voc-option-badge { display: inline-flex; color: var(--voc-warning-ink); }
.voc-option-badge ha-icon { --mdc-icon-size: 14px; width: 14px; height: 14px; }
.voc-field.is-invalid .voc-segmented, .voc-field.is-invalid .voc-chips { padding: 4px; margin: -4px; border-radius: 14px; outline: 1px solid color-mix(in srgb, var(--voc-error) 55%, transparent); }

.voc-input {
  box-sizing: border-box;
  width: 100%;
  min-height: max(36px, var(--voc-control));
  padding: 7px 11px;
  border: 1px solid var(--voc-hairline);
  border-radius: 12px;
  background: var(--voc-chip-bg);
  color: var(--primary-text-color);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
}
.voc-input[type="number"] { max-width: 160px; }
textarea.voc-input { resize: vertical; min-height: 64px; line-height: 1.35; }
.voc-input:focus { border-color: var(--tone-border); }
.voc-input[aria-invalid="true"] { border-color: color-mix(in srgb, var(--voc-error) 60%, transparent); }

.voc-stepper { display: inline-flex; align-items: center; gap: 4px; }
.voc-stepper-input { width: 64px; text-align: center; font-variant-numeric: tabular-nums; -moz-appearance: textfield; }
.voc-stepper-input::-webkit-inner-spin-button, .voc-stepper-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

.voc-switch { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; font-size: 12.5px; font-weight: 700; }
.voc-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.voc-switch-track { position: relative; flex: none; width: 36px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 18%, transparent); transition: background .15s; }
.voc-switch-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 999px; background: var(--card-background-color, #fff); box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s; }
.voc-switch input:checked + .voc-switch-track { background: var(--tone-color); }
.voc-switch input:checked + .voc-switch-track .voc-switch-thumb { transform: translateX(16px); }
.voc-switch input:focus-visible + .voc-switch-track { outline: 2px solid var(--voc-focus); outline-offset: 2px; }

.voc-entities { display: grid; gap: 6px; min-width: 0; }
.voc-entity-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.voc-entity-chip { display: inline-flex; align-items: center; gap: 2px; padding: 0 2px 0 10px; border-radius: 999px; background: var(--tone-soft); border: 1px solid var(--tone-border); color: var(--tone-ink); font-size: 12px; font-weight: 800; }
.voc-entity-remove { width: var(--voc-chip-target); min-width: var(--voc-chip-target); min-height: var(--voc-chip-target); color: inherit; }
.voc-entity-matches { display: grid; gap: 2px; padding: 4px; border-radius: 12px; border: 1px solid var(--voc-hairline); background: var(--ha-card-background, var(--card-background-color)); }
.voc-entity-match { display: grid; gap: 1px; padding: 6px 9px; border: 0; border-radius: 9px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.voc-entity-match:hover, .voc-entity-match:focus-visible { background: var(--voc-chip-bg); }
.voc-entity-name { font-size: 12.5px; font-weight: 800; }
.voc-entity-id { font-size: 11px; font-weight: 600; color: var(--voc-muted); }

.voc-disclosure { display: flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--voc-faint); cursor: pointer; font: inherit; font-size: 10px; font-weight: 850; letter-spacing: .075em; text-transform: uppercase; }
.voc-disclosure ha-icon { --mdc-icon-size: 16px; width: 16px; height: 16px; }

.voc-list-item { display: grid; gap: 8px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--voc-hairline); background: var(--voc-chip-bg); }
.voc-list-head { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12.5px; }
.voc-list-head strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.voc-list-current { font-size: 11.5px; font-weight: 650; color: var(--voc-muted); }
.voc-list-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.voc-option-row { display: flex; align-items: flex-end; gap: 4px; min-width: 0; }
.voc-option-row .voc-field { flex: 1; }
.voc-option-add { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end; }
`;
