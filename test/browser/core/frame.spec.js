// The frame in each real engine: in a sections grid cell the card keeps the cell's height in every
// view and overlay, and a card with its own height keeps it while an overlay is open.

const { test, expect } = require("../../helpers/playwright.js");
const { act, mountCard } = require("../../helpers/browser-helpers.js");

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

// Opens an overlay from a view, checks the height and goes back to the view.
async function overlay(page, card, { from, open, key }) {
  await view(page, card, from);
  for (const target of [].concat(open)) await act(page, card.locator(target));
  await expect(card.locator(".voc-root")).toHaveAttribute("data-state", "overlay");
  await expectHeight(card, TEN_ROWS_PX, `${key} keeps the cell's height`);
  await expect(card.locator(".voc-overlay-actions, .voc-overlay-head").first()).toBeInViewport();
  while ((await card.locator(".voc-root").getAttribute("data-state")) === "overlay") await act(page, card.locator(".voc-back"));
}

test("in a sections grid cell the card keeps the cell's height in every view and overlay", async ({ page }) => {
  const card = await mountCard(page, { layout: "grid", config: ALL_VIEWS });
  await expect(card.locator("ha-card")).toHaveAttribute("data-frame", "fill");
  for (const key of ALL_VIEWS.views) {
    await view(page, card, key);
    await expectHeight(card, TEN_ROWS_PX, `${key} keeps the cell's height`);
  }
  const overlays = [
    { key: "job-detail", from: "queue", open: '[data-key="job:job-bathroom"] .voc-job-main' },
    { key: "save-template", from: "queue", open: ['[data-key="job:job-bathroom"] .voc-job-main', '[data-action="open-save-template"]'] },
    { key: "job-editor", from: "queue", open: ".voc-primary-action" },
    { key: "cancel-job", from: "queue", open: '[data-key="job:job-running"] [data-action="cancel-job"]' },
    { key: "queue-end", from: "queue", open: ".voc-queue-end" },
    { key: "start-job", from: "queue", open: '[data-key="job:job-kitchen"] [data-action="start-job"]' },
    { key: "job-defaults", from: "settings", open: '[data-action="open-job-defaults"]' },
    { key: "queue-settings", from: "settings", open: '[data-action="open-queue-settings"]' },
    { key: "release", from: "rooms", open: '[data-key="room:room-bathroom"] [data-action="open-release"]' },
    { key: "room-editor", from: "rooms", open: '[data-key="room:room-kitchen"] [data-action="edit-room"]' },
    { key: "robot-editor", from: "robots", open: '[data-key="robot:robot-dusty"] [data-action="edit-robot"]' },
    { key: "robot-add", from: "robots", open: ".voc-primary-action" },
    { key: "template", from: "templates", open: '[data-key="template:template-weekly"] [data-action="edit-template"]' },
  ];
  for (const entry of overlays) await overlay(page, card, entry);
});

test("the cell's rows set the height; rows: auto gives the card its own height", async ({ page }) => {
  let card = await mountCard(page, { layout: "grid", rows: 7 });
  await expectHeight(card, 7 * 64 - 8, "seven rows");
  card = await mountCard(page, { layout: "grid", rows: 14 });
  await expectHeight(card, 14 * 64 - 8, "fourteen rows");
  card = await mountCard(page, { layout: "grid", rows: "auto" });
  await expect(card.locator("ha-card")).not.toHaveAttribute("data-frame", /.*/);
});

test("a panel view gives the card its full height", async ({ page }) => {
  const card = await mountCard(page, { layout: "panel" });
  await expect(card.locator("ha-card")).toHaveAttribute("data-frame", "fill");
  await expectHeight(card, 800, "the panel's height");
});

test("with its own height the card keeps it while an overlay is open and lets it go after", async ({ page }) => {
  const card = await mountCard(page);
  const natural = await cardHeight(card);
  expect(natural, "the queue is taller than the frame's floor").toBeGreaterThan(440);
  await act(page, card.locator('[data-key="job:job-running"] [data-action="cancel-job"]'));
  await expect(card.locator(".voc-root")).toHaveAttribute("data-state", "overlay");
  await expectHeight(card, natural, "the short dialog keeps the queue's height");
  await act(page, card.locator(".voc-back"));
  await act(page, card.locator(".voc-primary-action"));
  await expectHeight(card, natural, "the long editor keeps the queue's height");
  await act(page, card.locator(".voc-back"));
  await expect(card.locator("ha-card")).not.toHaveAttribute("data-frame", /.*/);
  await expectHeight(card, natural, "the queue again");
});
