// Accessibility of the section bodies and the overlay pages: no interactive element inside
// another, every overlay is a named region, and focus returns where it came from.

const { test, expect } = require("../../helpers/playwright.js");
const { backendData, mountCard } = require("../../helpers/browser-helpers.js");

test("no interactive element sits inside another", async ({ page }) => {
  await mountCard(page, {});
  const nested = await page.evaluate(() => {
    const root = document.querySelector("vacuum-orchestrator-card").shadowRoot;
    const interactive = [...root.querySelectorAll("button, a[href], input, textarea, select, [role=button], [role=tab], [role=option], [role=radio], [role=switch]")];
    return interactive.filter((node) => interactive.some((other) => other !== node && other.contains(node))).map((node) => node.className);
  });
  expect(nested).toEqual([]);
});

test("the editor is a named region whose fields carry label, error and description", async ({ page }) => {
  const card = await mountCard(page, {});
  await card.locator(".voc-primary-action").click();

  const editor = card.locator(".voc-job-editor");
  await expect(editor).toHaveAttribute("role", "region");
  await expect(editor).toHaveAttribute("aria-labelledby", "voc-editor-title");

  const areas = editor.locator('[data-control][data-field-path="areas"]');
  await expect(areas).toHaveAttribute("role", "listbox");
  await expect(areas).toHaveAttribute("aria-multiselectable", "true");
  await expect(areas).toHaveAttribute("aria-invalid", "true");
  await expect(editor.locator('[data-field-path="areas"] .voc-field-error')).toHaveAttribute("role", "alert");
});

test("the confirmation is an alert dialog and Escape returns to the queue", async ({ page }) => {
  const card = await mountCard(page, {});
  await card.locator(".voc-pending-queue .voc-job-row").first().locator(".voc-job-action-delete").click();

  const confirm = card.locator(".voc-confirm-overlay");
  await expect(confirm).toHaveAttribute("role", "alertdialog");
  await expect(confirm).toHaveAttribute("aria-modal", "true");

  await page.keyboard.press("Escape");
  await expect(card.locator(".voc-queue-section")).toBeVisible();
  const services = await page.evaluate(() => (window.__vocCalls || []).filter((call) => call.kind === "service").length);
  expect(services).toBe(0);
});

test("a degraded section names the backend function it needs", async ({ page }) => {
  const card = await mountCard(page, {});
  await card.locator('[role=tab][data-section="rooms"]').click();
  await expect(card.locator(".voc-unavailable")).toHaveText("Room data is not provided by the backend.");

  const full = await mountCard(page, { data: { ...backendData({ target: true }) } });
  await full.locator('[role=tab][data-section="rooms"]').click();
  await expect(full.locator(".voc-room-row")).toHaveCount(3);
});
