// Accessibility of the card shell in a real engine: landmark roles, the tab strip contract,
// keyboard navigation, and status that does not depend on colour alone.

const { test, expect } = require("@playwright/test");
const { mountCard, startCoverage, stopCoverage } = require("../../helpers/browser-helpers.js");

test.beforeEach(async ({ page }) => {
  await startCoverage(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await stopCoverage(page, testInfo);
});

test("exposes semantic body, status and live-region surfaces", async ({ page }) => {
  const card = await mountCard(page, {});

  await expect(card.locator(".voc-root")).toHaveAttribute("tabindex", "-1");
  await expect(card.locator(".voc-body")).toHaveAttribute("role", "tabpanel");
  await expect(card.locator(".voc-live-region")).toHaveAttribute("aria-live", "polite");
  await expect(card.locator(".voc-live-region")).toHaveAttribute("aria-atomic", "true");
});

test("the tab strip is a tablist that is operable with the arrow keys", async ({ page }) => {
  const card = await mountCard(page, {});
  const tabs = card.locator("[role=tab]");

  await expect(card.locator("[role=tablist]")).toBeVisible();
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");

  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(card.locator(".voc-body .voc-section")).toHaveAttribute("data-section", "rooms");
  await expect(card.locator('[role=tab][data-section="rooms"]')).toHaveAttribute("aria-selected", "true");
});

test("status and readiness are readable without colour", async ({ page }) => {
  const card = await mountCard(page, {});

  await expect(card.locator(".voc-status-pill")).not.toHaveText("");
  await expect(card.locator(".voc-pending-queue .voc-job-row").first().locator("[data-row-state]")).toHaveText("Queued");
  await expect(card.locator(".voc-pending-queue .voc-job-row").nth(1).locator("[data-row-readiness]")).toHaveText("Blocked");
});

// A disabled control still has to explain itself, so it stays reachable rather than inert.
test("a control the user may not use keeps its explanation", async ({ page }) => {
  const card = await mountCard(page, { isAdmin: false });
  const start = card.locator(".voc-pending-queue .voc-job-row").first().locator(".voc-job-action-start");

  await expect(start).toHaveAttribute("aria-disabled", "true");
  await expect(start).toHaveAttribute("title", "This user cannot change jobs");
});
