// Menus: a `⋯` button and, while open, its list of items floating over the content below (or
// above) it, on the card's surface. See internal dev doc §9 "Menüs".

export const MENU_CSS = `
.voc-menu-anchor { position: relative; display: inline-flex; }
.voc-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 4;
  display: grid;
  min-width: 184px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid var(--voc-card-border);
  background: var(--ha-card-background, var(--card-background-color));
  box-shadow: var(--voc-card-shadow);
}
.voc-menu[data-placement="above"] { top: auto; bottom: calc(100% + 4px); }
.voc-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--voc-row-target);
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--primary-text-color);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.voc-menu-item ha-icon { --mdc-icon-size: 18px; color: var(--voc-muted); }
.voc-menu-item:hover, .voc-menu-item:focus-visible { background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); }
.voc-menu-item:focus-visible { outline: 2px solid var(--voc-focus); outline-offset: -2px; }
.voc-menu-item[aria-disabled="true"] { color: var(--voc-faint); cursor: default; }
.voc-menu-item[aria-disabled="true"] ha-icon { color: var(--voc-faint); }
`;
