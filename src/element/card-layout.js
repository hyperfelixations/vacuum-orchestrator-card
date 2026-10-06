// The card's size on a dashboard. In a sections view Home Assistant gives a card with a numeric
// row count a fixed cell, and a panel view gives it the whole view: the card then fills that
// height ("fill"). Anywhere else its height follows the open view ("auto"). See internal dev doc
// §9 "Rahmen und Höhe".

// Home Assistant's sections grid (`hui-grid-section`): rows of 56 px with 8 px gaps.
export const ROW_PX = 56;
export const ROW_GAP_PX = 8;

export const GRID_OPTIONS = Object.freeze({ columns: "full", rows: 10, min_columns: 12, min_rows: 7 });

export function rowsHeightPx(rows) {
  return rows * (ROW_PX + ROW_GAP_PX) - ROW_GAP_PX;
}

// An overlay opened in "auto" keeps the card's height, but never less than the smallest grid size.
export const FRAME_MIN_PX = rowsHeightPx(GRID_OPTIONS.min_rows);

const own = (value, key) => (value && typeof value === "object" && Object.hasOwn(value, key) ? value[key] : undefined);

// The rows Home Assistant applies: the card's `grid_options`, else its legacy `layout_options`,
// else the card's default, as `hui-card` merges them.
export function configuredRows(config) {
  const rows = own(own(config, "grid_options"), "rows") ?? own(own(config, "layout_options"), "grid_rows");
  return rows === undefined || rows === null ? GRID_OPTIONS.rows : rows;
}

export function frameMode({ layout = null, config = null } = {}) {
  if (layout === "panel") return "fill";
  if (layout === "grid" && typeof configuredRows(config) === "number") return "fill";
  return "auto";
}
