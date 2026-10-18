// The card's own controls with a real keyboard and pointer: roving choice groups that select as
// they move, the stepper, the entity search with its match list, and the job editor end to end.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, mountCard, named, serviceCalls } = require("../../helpers/browser-helpers.js");

// The job defaults page carries the same mode group and stepper as the editor.
test("a mode group selects with the arrow keys and keeps one tab stop", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, config: { start_view: "settings" } });
  await card.locator('[data-action="open-job-defaults"]').click();
  const group = card.locator('[data-key="field:overlay:mode"] [role=radiogroup]');
  await group.locator('[role=radio][aria-checked="true"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.locator('[role=radio][data-value="mop"]')).toHaveAttribute("aria-checked", "true");
  await expect(group.locator('[role=radio][data-value="mop"]')).toBeFocused();
  await expect(group.locator('[role=radio][tabindex="0"]')).toHaveCount(1);
});

test("the stepper counts within its bounds", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, config: { start_view: "settings" } });
  await card.locator('[data-action="open-job-defaults"]').click();
  const passes = card.locator('[data-key="field:overlay:passes"]');
  await expect(passes.locator("button").first()).toBeDisabled();
  await passes.locator("button").last().click();
  await expect(passes.locator("input")).toHaveValue("2");
});

test("the entity search filters as you type and ArrowDown enters the matches", async ({ page }) => {
  const card = await mountCard(page, BUSY);
  await card.locator(".voc-primary-action").click();
  await card.locator('[data-action="set-overlay"][data-args*="moreOpen"]').click();
  const search = card.locator('[data-field="query:requiredOn"]');
  await search.fill("door");
  const matches = card.locator('[data-key="field:requiredOn"] .voc-entity-match');
  await expect(matches.first()).toContainText("Conservatory Door");
  await search.press("ArrowDown");
  await expect(matches.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card.locator('[data-key="field:requiredOn"] .voc-entity-chip')).toContainText("Conservatory Door");
  await expect(search).toHaveValue("");
});

test("a job built with the pointer reaches the integration", async ({ page }) => {
  const card = await mountCard(page, { recording: "queue_controls", from: "The queue runs again" });
  const tabsBefore = await card.locator(".voc-tab-row").boundingBox();
  await card.locator(".voc-primary-action").click();
  await card.locator('[data-key="field:mode"] [data-value="mop"]').click();
  const dining = card.locator('[data-key="field:roomIds"] [data-value]', { hasText: "Dining Room" });
  const room = await dining.getAttribute("data-value");
  await dining.click();
  await card.locator('[data-action="save-draft"]').click();
  await expect(card.locator(".voc-notice")).toContainText("added");
  // LAY-12: the notice floats over the card's foot and moves no control.
  expect((await card.locator(".voc-tab-row").boundingBox()).y).toBe(tabsBefore.y);
  const notice = await card.locator(".voc-notice").boundingBox();
  const frame = await card.locator("ha-card").boundingBox();
  expect(notice.y + notice.height).toBeLessThanOrEqual(frame.y + frame.height);
  expect(notice.y).toBeGreaterThan(frame.y + frame.height / 2);
  const [call] = await serviceCalls(page, "create_job");
  expect(call).toMatchObject({ areas: [room], mode: "mop" });
});
