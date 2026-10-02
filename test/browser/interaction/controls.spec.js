// The card's own controls with a real keyboard and pointer: roving choice groups that select as
// they move, the stepper, the entity search with its match list, and the job editor end to end.

const { test, expect } = require("../../helpers/playwright.js");
const { mountCard, serviceCalls } = require("../../helpers/browser-helpers.js");

test("a mode group selects with the arrow keys and keeps one tab stop", async ({ page }) => {
  const card = await mountCard(page);
  await card.locator(".voc-primary-action").click();
  const group = card.locator('[data-key="field:mode"] [role=radiogroup]');
  await group.locator('[role=radio][aria-checked="true"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.locator('[role=radio][data-value="mop"]')).toHaveAttribute("aria-checked", "true");
  await expect(group.locator('[role=radio][data-value="mop"]')).toBeFocused();
  await expect(group.locator('[role=radio][tabindex="0"]')).toHaveCount(1);
});

test("the stepper counts within its bounds", async ({ page }) => {
  const card = await mountCard(page);
  await card.locator(".voc-primary-action").click();
  const passes = card.locator('[data-key="field:passes"]');
  await expect(passes.locator("button").first()).toBeDisabled();
  await passes.locator("button").last().click();
  await expect(passes.locator("input")).toHaveValue("2");
});

test("the entity search filters as you type and ArrowDown enters the matches", async ({ page }) => {
  const card = await mountCard(page);
  await card.locator(".voc-primary-action").click();
  await card.locator('[data-action="set-overlay"][data-args*="moreOpen"]').click();
  const search = card.locator('[data-field="query:requiredOn"]');
  await search.fill("door");
  const matches = card.locator('[data-key="field:requiredOn"] .voc-entity-match');
  await expect(matches.first()).toContainText("Bathroom door");
  await search.press("ArrowDown");
  await expect(matches.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card.locator('[data-key="field:requiredOn"] .voc-entity-chip')).toContainText("Bathroom door");
  await expect(search).toHaveValue("");
});

test("a job built with pointer and keyboard reaches the integration", async ({ page }) => {
  const card = await mountCard(page);
  await card.locator(".voc-primary-action").click();
  await card.locator('[data-key="field:roomIds"] [data-value="room-kitchen"]').click();
  await card.locator('[data-key="field:mode"] [data-value="vacuum_then_mop"]').click();
  await card.locator('[data-key="field:vacuumPower"] [data-value="high"]').click();
  await card.locator('[data-action="save-draft"]').click();
  await expect(card.locator(".voc-notice")).toContainText("added");
  const [call] = await serviceCalls(page, "create_job");
  expect(call).toMatchObject({ areas: ["room-kitchen"], mode: "vacuum_then_mop", vacuum_power: "high" });
});
