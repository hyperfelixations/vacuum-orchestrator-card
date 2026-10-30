// The frame in each real engine: in a sections grid cell the card keeps the cell's height in every
// view and overlay, without a dashboard height it keeps its standard height, and with rows: auto
// it is at least the floor high and keeps its height while a page or dialog is open.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, act, mountCard, named } = require("../../helpers/browser-helpers.js");

const TEN_ROWS_PX = 10 * 64 - 8;
const ALL_VIEWS = { views: ["queue", "rooms", "robots", "templates", "history", "diagnostics", "setup", "settings"] };

const cardHeight = (card) => card.evaluate((element) => element.shadowRoot.querySelector("ha-card").getBoundingClientRect().height);

async function expectHeight(card, expected, what) {
  expect(Math.abs((await cardHeight(card)) - expected), what).toBeLessThanOrEqual(0.5);
}

async function view(page, card, key) {
  await act(page, card.locator(`[role=tab][data-view="${key}"]`));
  await expect(card.locator(`[data-key="view:${key}"]`)).toBeVisible();
}

// Leaves the dialog or page on top through its one way back (LAY-19).
const leave = async (page, card) => act(page, (await card.locator(".voc-dialog").count()) ? card.locator('.voc-dialog-actions [data-action="back"]') : card.locator('.voc-overlay [data-action="back"]'));

// Opens a page or dialog from a view, checks the height and goes back to the view. A target is a
// selector or a function of the card that finds it.
async function overlay(page, card, { from, open, key }) {
  await view(page, card, from);
  for (const target of [].concat(open)) await act(page, typeof target === "function" ? target(card) : card.locator(target));
  await expect(card.locator(`[data-key="overlay:${key === "template" ? "job-editor" : key}"]`)).toBeVisible();
  await expectHeight(card, TEN_ROWS_PX, `${key} keeps the cell's height`);
  await expect(card.locator(".voc-dialog-actions, .voc-overlay-actions").last()).toBeInViewport({ ratio: 1 });
  while (await card.locator(".voc-dialog, .voc-overlay").count()) await leave(page, card);
}

test("in a sections grid cell the card keeps the cell's height in every view and overlay", async ({ page }) => {
  // Every view and overlay, each step waited for: far more steps than any other spec here.
  test.slow();
  let card = await mountCard(page, { ...BUSY, layout: "grid", config: ALL_VIEWS });
  await expect(card.locator("ha-card")).toHaveAttribute("data-frame", "fill");
  for (const key of ALL_VIEWS.views) {
    await view(page, card, key);
    await expectHeight(card, TEN_ROWS_PX, `${key} keeps the cell's height`);
  }
  const overlays = [
    { key: "job-detail", from: "queue", open: (card) => named(card, ".voc-job", "Conservatory", ".voc-job-main") },
    { key: "save-template", from: "queue", open: [(card) => named(card, ".voc-job", "Conservatory", ".voc-job-main"), '[data-action="open-save-template"]'] },
    { key: "job-editor", from: "queue", open: ".voc-primary-action" },
    { key: "cancel-job", from: "queue", open: (card) => named(card, ".voc-job", "Studio", '[data-action="cancel-job"]') },
    { key: "queue-end", from: "queue", open: ".voc-queue-end" },
    { key: "job-defaults", from: "settings", open: '[data-action="open-job-defaults"]' },
    { key: "queue-settings", from: "settings", open: '[data-action="open-queue-settings"]' },
    { key: "release", from: "rooms", open: (card) => named(card, ".voc-room", "Conservatory", '[data-action="open-release"]') },
    { key: "room-editor", from: "rooms", open: [(card) => named(card, ".voc-room", "Dining Room", ".voc-menu-button"), (card) => named(card, ".voc-room", "Dining Room", '[role="menu"] [data-action="edit-room"]')] },
    { key: "robot-add", from: "robots", open: ".voc-primary-action" },
    { key: "template", from: "templates", open: [(card) => named(card, ".voc-template", "Weekly clean", ".voc-menu-button"), (card) => named(card, ".voc-template", "Weekly clean", '[role="menu"] [data-action="edit-template"]')] },
  ];
  for (const entry of overlays) await overlay(page, card, entry);
  // A direct start and a robot's profile need a free robot: either robot can start the dining room.
  card = await mountCard(page, { recording: "robot_choice", from: "Either robot can start the dining room", layout: "grid", config: ALL_VIEWS });
  await overlay(page, card, { key: "start-job", from: "queue", open: (card) => named(card, ".voc-job", "Dining Room", '[data-action="start-job"]') });
  await overlay(page, card, { key: "robot-editor", from: "robots", open: [(card) => named(card, ".voc-robot", "Dusty", ".voc-menu-button"), (card) => named(card, ".voc-robot", "Dusty", '[role="menu"] [data-action="edit-robot"]')] });
});

test("the cell's rows set the height; rows: auto gives the card its own height", async ({ page }) => {
  let card = await mountCard(page, { ...BUSY, layout: "grid", rows: 7 });
  await expectHeight(card, 7 * 64 - 8, "seven rows");
  card = await mountCard(page, { ...BUSY, layout: "grid", rows: 14 });
  await expectHeight(card, 14 * 64 - 8, "fourteen rows");
  card = await mountCard(page, { ...BUSY, layout: "grid", rows: "auto" });
  await expect(card.locator("ha-card")).not.toHaveAttribute("data-frame", /.*/);
});

test("a panel view gives the card its full height", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, layout: "panel" });
  await expect(card.locator("ha-card")).toHaveAttribute("data-frame", "fill");
  await expectHeight(card, 800, "the panel's height");
});

// LAY-17: masonry, stacks and the editor preview set no height; the card keeps ten rows.
test("without a dashboard height the card keeps its standard height in every view, page and dialog", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, config: ALL_VIEWS });
  await expect(card.locator("ha-card")).toHaveAttribute("data-frame", "lock");
  for (const key of ALL_VIEWS.views) {
    await view(page, card, key);
    await expectHeight(card, TEN_ROWS_PX, `${key} keeps the standard height`);
  }
  await view(page, card, "queue");
  await act(page, card.locator(".voc-primary-action"));
  await expectHeight(card, TEN_ROWS_PX, "the editor keeps it");
  await act(page, card.locator('.voc-overlay [data-action="back"]'));
  await act(page, card.locator(".voc-queue-end"));
  await expectHeight(card, TEN_ROWS_PX, "a dialog keeps it");
});

// LAY-01: a short view is already as high as the floor, so nothing opened over it moves the card.
test("with rows: auto a short card is at least the floor high, also with a page or dialog open", async ({ page }) => {
  const card = await mountCard(page, { recording: "robot_choice", from: "Either robot can start the dining room", rows: "auto" });
  await expect(card.locator("ha-card")).not.toHaveAttribute("data-frame", /.*/);
  await expectHeight(card, 440, "the short queue stands on the floor");
  await act(page, named(card, ".voc-job", "Dining Room", '[data-action="start-job"]'));
  await expectHeight(card, 440, "the robot choice keeps it");
  await act(page, card.locator('.voc-dialog-actions [data-action="back"]'));
  await act(page, named(card, ".voc-job", "Dining Room", ".voc-job-main"));
  await expect(card.locator('[data-key="overlay:job-detail"]')).toBeVisible();
  await expectHeight(card, 440, "the detail page keeps it");
  await act(page, card.locator('.voc-overlay [data-action="back"]'));
  await expectHeight(card, 440, "the queue again");
});

test("with rows: auto a tall card keeps its height while a page or dialog is open and lets it go after", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, rows: "auto" });
  const natural = await cardHeight(card);
  expect(natural, "the queue is taller than the frame's floor").toBeGreaterThan(440);
  await act(page, named(card, ".voc-job", "Studio", '[data-action="cancel-job"]'));
  await expect(card.locator(".voc-root")).toHaveAttribute("data-dialog", "cancel-job");
  await expect(card.locator("ha-card")).not.toHaveAttribute("data-frame", /.*/);
  await expectHeight(card, natural, "a dialog lies over the queue at its height");
  await leave(page, card);
  await act(page, card.locator(".voc-primary-action"));
  await expectHeight(card, natural, "the long editor keeps the queue's height");
  await act(page, card.locator('.voc-overlay [data-action="back"]'));
  await expect(card.locator("ha-card")).not.toHaveAttribute("data-frame", /.*/);
  await expectHeight(card, natural, "the queue again");
});
