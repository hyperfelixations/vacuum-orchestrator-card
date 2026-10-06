// The card's size contract with Home Assistant's dashboards: the grid options it declares, the
// heights of the sections grid and where the card fills a height it is given.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/element/card-layout.js");

test("the card fills its section and asks for ten rows; it is never narrower than a column or lower than seven rows", async () => {
  const { GRID_OPTIONS } = await load();
  assert.deepEqual({ ...GRID_OPTIONS }, { columns: "full", rows: 10, min_columns: 12, min_rows: 7 });
  assert.ok(Object.isFrozen(GRID_OPTIONS));
});

test("row heights follow the sections grid: 56 px rows with 8 px gaps", async () => {
  const { rowsHeightPx, FRAME_MIN_PX } = await load();
  assert.deepEqual([1, 2, 7, 8, 10].map(rowsHeightPx), [56, 120, 440, 504, 632]);
  assert.equal(FRAME_MIN_PX, 440);
});

test("the card fills a height in a grid cell with numeric rows and in a panel; elsewhere its height is its own", async () => {
  const { frameMode } = await load();
  const cases = [
    [{ layout: "grid", config: {} }, "fill"],
    [{ layout: "grid", config: { grid_options: { rows: 4 } } }, "fill"],
    [{ layout: "grid", config: { grid_options: { rows: "auto" } } }, "auto"],
    [{ layout: "grid", config: { grid_options: { columns: 6 } } }, "fill"],
    [{ layout: "grid", config: { layout_options: { grid_rows: "auto" } } }, "auto"],
    [{ layout: "grid", config: { layout_options: { grid_rows: 3 } } }, "fill"],
    [{ layout: "grid", config: { grid_options: { rows: 5 }, layout_options: { grid_rows: "auto" } } }, "fill"],
    [{ layout: "panel", config: { grid_options: { rows: "auto" } } }, "fill"],
    [{ layout: undefined, config: {} }, "auto"],
    [{ layout: "masonry", config: { grid_options: { rows: 8 } } }, "auto"],
    [{ layout: "grid", config: null }, "fill"],
    [{}, "auto"],
  ];
  for (const [input, mode] of cases) assert.equal(frameMode(input), mode, JSON.stringify(input));
});
