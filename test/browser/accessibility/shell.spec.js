// Accessibility of the card shell in a real engine: landmark roles, the tab strip contract with
// its keyboard, names that survive a narrow card, and status that does not depend on colour.

const { test, expect } = require("../../helpers/playwright.js");
const { mountCard, setCardWidth } = require("../../helpers/browser-helpers.js");

test("exposes a focusable root, a tab panel and a polite live region", async ({ page }) => {
  const card = await mountCard(page);
  await expect(card.locator(".voc-root")).toHaveAttribute("tabindex", "-1");
  await expect(card.locator(".voc-body")).toHaveAttribute("role", "tabpanel");
  await expect(card.locator(".voc-body")).toHaveAttribute("aria-labelledby", "voc-tab-queue");
  await expect(card.locator(".voc-live-region")).toHaveAttribute("aria-live", "polite");
});

test("the tab strip is a roving tablist operable with the arrow keys", async ({ page }) => {
  const card = await mountCard(page);
  const tabs = card.locator("[role=tab]");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(card.locator('[role=tab][data-view="rooms"]')).toHaveAttribute("aria-selected", "true");
  await expect(card.locator('[role=tab][data-view="rooms"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(card.locator('[role=tab][data-view="settings"]')).toBeFocused();
});

test("on a narrow card inactive tabs show icons yet keep their names", async ({ page }) => {
  const card = await mountCard(page);
  await setCardWidth(page, 380);
  const rooms = card.locator('[role=tab][data-view="rooms"]');
  await expect(rooms).toHaveAccessibleName("Rooms");
  const label = await rooms.locator(".voc-tab-label").evaluate((node) => node.getBoundingClientRect().width);
  expect(label).toBeLessThanOrEqual(1);
  await expect(card.locator('[role=tab][aria-selected="true"] .voc-tab-label')).toBeVisible();
  await expect(card.locator(".voc-primary-action")).toHaveAccessibleName("Add job");
  await expect(card.locator(".voc-queue-control")).toHaveAccessibleName("Pause queue");
});

test("status and readiness are readable without colour", async ({ page }) => {
  const card = await mountCard(page);
  await expect(card.locator(".voc-status-pill")).toHaveText("Cleaning");
  await expect(card.locator('[data-key="job:job-bathroom"] .voc-job-readiness')).toContainText("Not released");
  await expect(card.locator('[data-key="job:job-running"] .voc-pill')).toHaveText("Cleaning");
});

test("a control the user may not use keeps its explanation and stays reachable", async ({ page }) => {
  const card = await mountCard(page, { admin: false });
  const edit = card.locator('[data-key="job:job-kitchen"] [data-action="edit-job"]');
  await expect(edit).toHaveAttribute("aria-disabled", "true");
  await expect(edit).toHaveAttribute("title", /administrator/i);
  await edit.focus();
  await expect(edit).toBeFocused();
});

// A strip that does not fit first drops the inactive labels, then the active one, and only then
// scrolls (Material's scrollable tabs): an edge fades where more tabs lie, and the active tab is
// always brought fully into view, whether chosen by key, by start view or by narrowing.
const tabInView = (card, view) => card.evaluate((element, key) => {
  const list = element.shadowRoot.querySelector(".voc-tabs").getBoundingClientRect();
  const tab = element.shadowRoot.querySelector(`[role=tab][data-view="${key}"]`).getBoundingClientRect();
  return tab.left >= list.left - 0.5 && tab.right <= list.right + 0.5;
}, view);

test("long labels give way step by step, alike in every view", async ({ page }) => {
  const card = await mountCard(page, { width: 900, config: { language: "de" } });
  const row = card.locator(".voc-tab-row");
  await expect(row).not.toHaveAttribute("data-compact");
  await setCardWidth(page, 640);
  await expect(row).toHaveAttribute("data-compact", "labels");
  await expect(card.locator('[role=tab][aria-selected="true"] .voc-tab-label')).toBeVisible();
  await expect(card.locator('[role=tab][data-view="settings"]')).toHaveAccessibleName("Einstellungen");
  await expect(card.locator(".voc-primary-action")).toHaveAccessibleName("Auftrag anlegen");
  await card.locator('[role=tab][data-view="history"]').click();
  await expect(card.locator(".voc-primary-action")).toHaveCount(0);
  await expect(row, "a view without a primary action keeps the same tabs").toHaveAttribute("data-compact", "labels");
  await setCardWidth(page, 320);
  await expect(row).toHaveAttribute("data-compact", "icons");
  await expect(card.locator('[role=tab][aria-selected="true"]')).toHaveAccessibleName("Verlauf");
  await expect(card.locator(".voc-tabs")).not.toHaveAttribute("data-overflow-end");
  for (const view of ["queue", "settings"]) expect(await tabInView(card, view), view).toBe(true);
});

test.describe("with more tabs than fit even as icons", () => {
  test.use({ hasTouch: true });
  const VIEWS = ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics", "settings"];

  test("the strip fades where more tabs follow and keeps the active tab in view", async ({ page }) => {
    const card = await mountCard(page, { width: 320, config: { views: VIEWS, start_view: "queue" } });
    const strip = card.locator(".voc-tabs");
    await expect(strip).toHaveAttribute("data-overflow-end", "");
    await expect(strip).not.toHaveAttribute("data-overflow-start");
    expect(await tabInView(card, "settings")).toBe(false);
    await card.locator('[role=tab][aria-selected="true"]').focus();
    await page.keyboard.press("End");
    await expect(card.locator('[role=tab][data-view="settings"]')).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => tabInView(card, "settings")).toBe(true);
    await expect(strip).toHaveAttribute("data-overflow-start", "");
    await page.keyboard.press("Home");
    await expect.poll(() => tabInView(card, "setup")).toBe(true);
  });

  test("a start view beyond the visible strip is in view from the first render", async ({ page }) => {
    const card = await mountCard(page, { width: 320, config: { views: VIEWS, start_view: "settings" } });
    expect(await tabInView(card, "settings")).toBe(true);
  });
});
