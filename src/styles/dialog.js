// Card dialogs (LAY-05, LAY-06, LAY-14): a scrim over the whole card, which keeps its size, and the
// dialog centred on it, at most 440 px wide. Heading, content and actions stand together; only a
// card too short for the dialog lets its content scroll between heading and actions, which stay in
// view. The scrim follows Home Assistant's light or dark theme (`data-scheme`). See internal dev
// doc §9 "Kartendialoge".

export const DIALOG_CSS = `
.voc-scrim {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 12px;
  background: color-mix(in srgb, #000 32%, transparent);
}

.voc-root[data-scheme="dark"] > .voc-scrim { background: color-mix(in srgb, #000 48%, transparent); }

.voc-dialog {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 440px;
  max-height: 100%;
  min-height: 0;
  padding: 16px;
  border-radius: 16px;
  background: var(--ha-card-background, var(--card-background-color));
  border: 1px solid var(--voc-card-border);
  box-shadow: var(--voc-card-shadow);
  color: var(--primary-text-color);
}

.voc-layer > * { flex: none; }
.voc-dialog-title { margin: 0; font-size: 17px; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
.voc-dialog-title:focus { outline: none; }

.voc-layer > .voc-dialog-scroll {
  flex: 0 1 auto;
  min-height: 0;
  display: grid;
  gap: 12px;
  align-content: start;
  margin: -4px -16px;
  padding: 4px max(0px, calc(16px - var(--voc-scrollbar, 0px))) 4px 16px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--voc-hairline) transparent;
}

.voc-dialog-scroll[data-overflow-top] { mask-image: linear-gradient(to bottom, transparent, #000 16px); }
.voc-dialog-scroll[data-overflow-bottom] { mask-image: linear-gradient(to top, transparent, #000 16px); }
.voc-dialog-scroll[data-overflow-top][data-overflow-bottom] { mask-image: linear-gradient(to bottom, transparent, #000 16px, #000 calc(100% - 16px), transparent); }

.voc-dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.voc-dialog-actions .voc-action-start { margin-right: auto; }
.voc-dialog-scroll[data-overflow-bottom] + .voc-dialog-actions { margin-top: -6px; padding-top: 9px; border-top: 1px solid var(--divider-color, var(--voc-hairline)); }
`;
