// The card's own notice with a real pointer, keyboard and clock (UI-33): one that informs goes by
// itself while a line along its top runs down its time, the pointer or focus on it holds both, and
// a refusal stays until it is closed.

const { test, expect } = require("../../helpers/playwright.js");
const { act, mountCard } = require("../../helpers/browser-helpers.js");

const SAVED = { recording: "queue_controls", from: "The queue runs again" };
// Rocky cleans with the queue running; the user may pause it next.
const RUNNING = { recording: "queue_controls", from: "The library job is next" };

// Adds a job with the pointer; the card's notice says so.
async function addJob(page, card) {
  await act(page, card.locator(".voc-primary-action"));
  await act(page, card.locator('[data-key="field:mode"] [data-value="mop"]'));
  await act(page, card.locator('[data-key="field:roomIds"] [data-value]', { hasText: "Dining Room" }));
  await card.locator('[data-action="save-draft"]').click();
  const notice = card.locator(".voc-notice--float");
  await expect(notice).toContainText("added");
  return notice;
}

// The running line's animation: its state, its length and how far it has run.
const line = (notice) =>
  notice.locator(".voc-notice-timer").evaluate((node) => {
    const [animation] = node.getAnimations();
    return animation ? { state: animation.playState, duration: animation.effect.getComputedTiming().duration, time: animation.currentTime } : null;
  });

const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// It appears where the pointer rests after saving; that alone does not hold it.
test("a success notice goes by itself while its line runs down its time", async ({ page }) => {
  const card = await mountCard(page, SAVED);
  const notice = await addJob(page, card);
  await expect(notice).toHaveAttribute("role", "status");
  const ms = Number(await notice.getAttribute("data-timeout"));
  expect(ms).toBeGreaterThanOrEqual(2000);
  expect(await line(notice)).toMatchObject({ state: "running", duration: ms });
  await expect(notice).toBeHidden({ timeout: ms + 5000 });
});

test("the pointer or focus on the notice holds it and its line; once they leave the rest runs", async ({ page }) => {
  const card = await mountCard(page, SAVED);
  const notice = await addJob(page, card);
  await page.mouse.move(0, 0);
  await notice.locator(".voc-notice-text").hover();
  await expect(notice).toHaveAttribute("data-paused", "");
  const held = await line(notice);
  expect(held.state).toBe("paused");
  await frames(page);
  expect((await line(notice)).time).toBe(held.time);
  await notice.locator(".voc-notice-close").focus();
  await page.mouse.move(0, 0);
  await expect(notice, "focus inside still holds it").toHaveAttribute("data-paused", "");
  await notice.locator(".voc-notice-close").blur();
  await expect(notice).not.toHaveAttribute("data-paused");
  expect((await line(notice)).state).toBe("running");
  await expect(notice).toBeHidden({ timeout: Number(await notice.getAttribute("data-timeout")) + 5000 });
});

test("a refused command's notice has no time and stays until it is closed", async ({ page }) => {
  const card = await mountCard(page, RUNNING);
  await page.evaluate(() => window.vocHarness.backend.failNext({ service: "pause_queue" }, { code: "home_assistant_error", message: "Unauthorized" }));
  await card.locator(".voc-queue-control").click();
  const notice = card.locator(".voc-notice--float.voc-notice--error");
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(notice).not.toHaveAttribute("data-timeout");
  await expect(notice.locator(".voc-notice-timer")).toHaveCount(0);
  await notice.locator(".voc-notice-close").click();
  await expect(notice).toHaveCount(0);
});

test("without motion the line is gone and the notice still goes in its time", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = await mountCard(page, SAVED);
  const notice = await addJob(page, card);
  await expect(notice.locator(".voc-notice-timer")).toBeHidden();
  await expect(notice).toBeHidden({ timeout: Number(await notice.getAttribute("data-timeout")) + 5000 });
});
