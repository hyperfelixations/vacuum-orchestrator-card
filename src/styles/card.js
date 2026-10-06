// Card surface, content root and accent line (RCC card slice). The surface is selected by type,
// so an `ha-card` rule card-mod appends after this sheet wins at equal specificity.

export const CARD_CSS = `
ha-card {
  display: block;
  container: voc-card / inline-size;
  border-radius: var(--voc-radius);
  padding: 0;
  overflow: hidden;
  background: linear-gradient(135deg, var(--voc-top-overlay), transparent), var(--ha-card-background, var(--card-background-color));
  border: 1px solid var(--voc-card-border);
  box-shadow: var(--ha-card-box-shadow, var(--voc-card-shadow));
}

.voc-root {
  --voc-pad-top: 15px;
  --voc-pad-x: 16px;
  --voc-pad-bottom: 16px;
  position: relative;
  display: grid;
  gap: 11px;
  padding: var(--voc-pad-top) var(--voc-pad-x) var(--voc-pad-bottom);
  color: var(--primary-text-color);
  outline: none;
}

.voc-top-line {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--tone-color), transparent);
}

.voc-root[data-accent-line="bottom"] .voc-top-line {
  top: auto;
  bottom: 0;
}

.voc-body {
  min-width: 0;
}

.voc-body:focus { outline: none; }
.voc-body:focus-visible { outline: 2px solid var(--voc-focus); outline-offset: -2px; border-radius: 14px; }

.voc-render-failed {
  padding: 6px 0;
  color: var(--secondary-text-color);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
}

.voc-sr-only,
.voc-live-region {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
