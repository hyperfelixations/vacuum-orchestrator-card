// The card in a real browser: registration, the connected queue, and the markup boundary.
// Boundary to the jsdom component tests: those check behaviour, these check that a real engine
// builds the same card from the shipped bundle.

const { test, expect } = require("../../helpers/playwright.js");
const { backendData, gotoHarness, mountCard } = require("../../helpers/browser-helpers.js");

test("publishes one card registration and the production version identity", async ({ page }) => {
  await gotoHarness(page);
  const registration = await page.evaluate(() => ({
    customElement: customElements.get("vacuum-orchestrator-card")?.name,
    pickerCount: (window.customCards || []).filter((entry) => entry.type === "vacuum-orchestrator-card").length,
    version: window.vacuumOrchestratorCardVersion,
  }));

  expect(registration.customElement).toBe("VacuumOrchestratorCard");
  expect(registration.pickerCount).toBe(1);
  expect(registration.version).toBe("0.0.1");
});

test("the null configuration renders the connected queue", async ({ page }) => {
  const card = await mountCard(page, {});

  await expect(card.locator(".voc-root")).toHaveAttribute("data-state", "ready");
  await expect(card.locator(".voc-title")).toHaveText("Cleaning");
  await expect(card.locator(".voc-status-pill")).toHaveText("Running");
  await expect(card.locator(".voc-pending-queue .voc-job-row")).toHaveCount(2);
  await expect(card.locator(".voc-active-jobs .voc-job-row")).toHaveCount(1);
});

test("a missing integration shows the installation hint instead of an empty card", async ({ page }) => {
  const card = await mountCard(page, { data: { ...backendData(), installed: false } });

  await expect(card.locator(".voc-root")).toHaveAttribute("data-tone", "unsupported");
  await expect(card.locator(".voc-status-pill")).toHaveText("Not installed");
  await expect(card.locator(".voc-no-section")).toBeVisible();
});

test("keeps configured header text as text content", async ({ page }) => {
  const value = '<img src=x onerror="window.__vocXss = true">';
  const card = await mountCard(page, { config: { title: value } });

  await expect(card.locator(".voc-title")).toHaveText(value);
  expect(await page.evaluate(() => window.__vocXss || false)).toBe(false);
  expect(await card.locator(".voc-title img").count()).toBe(0);
});
