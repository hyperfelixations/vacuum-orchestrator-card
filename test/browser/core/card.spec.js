// The card in each real engine: registration, the connected queue, every view without errors,
// onboarding, and text that never becomes markup. Behaviour in depth is the component tests';
// these check that each engine builds the same card from the shipped bundle.

const { test, expect } = require("../../helpers/playwright.js");
const { gotoHarness, mountCard } = require("../../helpers/browser-helpers.js");

test("publishes one card registration and the production version identity", async ({ page }) => {
  await gotoHarness(page);
  const registration = await page.evaluate(() => ({
    customElement: customElements.get("vacuum-orchestrator-card")?.name,
    pickerCount: (window.customCards || []).filter((entry) => entry.type === "vacuum-orchestrator-card").length,
    version: window.vacuumOrchestratorCardVersion,
  }));
  expect(registration.customElement).toBe("VacuumOrchestratorCard");
  expect(registration.pickerCount).toBe(1);
  expect(registration.version).toBe("0.1.0");
});

test("the null configuration renders the connected queue", async ({ page }) => {
  const card = await mountCard(page);
  await expect(card.locator(".voc-root")).toHaveAttribute("data-state", "view");
  await expect(card.locator(".voc-title")).toHaveText("Cleaning");
  await expect(card.locator(".voc-status-pill")).toHaveText("Cleaning");
  await expect(card.locator('[data-key="active"] .voc-job')).toHaveCount(1);
  await expect(card.locator('[data-key="waiting"] .voc-job')).toHaveCount(3);
});

test("every view renders without a console error", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const card = await mountCard(page, { config: { views: ["queue", "rooms", "robots", "templates", "history", "diagnostics", "setup"] } });
  for (const view of ["rooms", "robots", "templates", "history", "diagnostics", "setup", "queue"]) {
    await card.locator(`[role=tab][data-view="${view}"]`).click();
    await expect(card.locator(`[data-key="view:${view}"]`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("a missing integration shows how to install it", async ({ page }) => {
  const card = await mountCard(page, { installed: false, setUp: false });
  await expect(card.locator(".voc-status-pill")).toHaveText("Not installed");
  await expect(card.locator(".voc-onboarding")).toHaveAttribute("data-phase", "not_installed");
  const links = card.locator(".voc-onboarding a");
  await expect(links).toHaveText(["Open in HACS", "Installation guide"]);
  for (const link of await links.all()) await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("configured header text stays text", async ({ page }) => {
  const value = '<img src=x onerror="window.__vocXss = true">';
  const card = await mountCard(page, { config: { title: value } });
  await expect(card.locator(".voc-title")).toHaveText(value);
  expect(await page.evaluate(() => window.__vocXss || false)).toBe(false);
  expect(await card.locator(".voc-title img").count()).toBe(0);
});
