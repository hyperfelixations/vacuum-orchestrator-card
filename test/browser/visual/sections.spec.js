// Golden screenshots of the whole card in the harness that reproduces Home Assistant's own
// theme, font and card element. Each picture states, as an assertion, the fact it is there to
// show, so a golden cannot be re-recorded around a card that stopped saying it.
// Re-record with `npx playwright test --update-snapshots`, then look at every changed image.

const { test, expect } = require("../../helpers/playwright.js");
const { backendData, mountCard, setCardWidth } = require("../../helpers/browser-helpers.js");

const WIDE = 900;
const MEDIUM = 640;
const NARROW = 380;

// The stage carries the page background and the gutter a dashboard card sits in, and it is
// wide enough to contain the card's own shadow.
async function shot(page, name, width) {
  await setCardWidth(page, width);
  await expect(page.locator("#stage")).toHaveScreenshot(name, { animations: "disabled" });
}

const TARGET = { config: { time_format: "absolute" }, data: backendData({ target: true }) };

test.describe("the queue", () => {
  test("wide, light", async ({ page }) => {
    const card = await mountCard(page, TARGET);
    await expect(card.locator(".voc-active-jobs .voc-job-row")).toHaveCount(1);
    await expect(card.locator(".voc-pending-queue .voc-job-row")).toHaveCount(2);
    await expect(card.locator(".voc-status-pill")).toHaveText("Running");
    await expect(card.locator(".voc-queue-controls .voc-button")).toHaveText("Pause queue");
    await shot(page, "queue-wide-light.png", WIDE);
  });

  test("wide, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await mountCard(page, TARGET);
    await shot(page, "queue-wide-dark.png", WIDE);
  });

  test("medium", async ({ page }) => {
    await mountCard(page, TARGET);
    await shot(page, "queue-medium-light.png", MEDIUM);
  });

  test("narrow, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, TARGET);
    // The narrow stage is the one that hides the action words; the buttons keep their names.
    await expect(card.locator(".voc-job-action-edit").first()).toHaveAttribute("aria-label", "Edit");
    await shot(page, "queue-narrow-dark.png", NARROW);
  });

  test("empty", async ({ page }) => {
    const card = await mountCard(page, { config: { time_format: "absolute" }, data: backendData({ target: true, jobs: [], mode: "idle" }) });
    await expect(card.locator(".voc-empty-state")).toBeVisible();
    await expect(card.locator(".voc-queue-controls .voc-button")).toHaveText("Start queue");
    await shot(page, "queue-empty-medium-light.png", MEDIUM);
  });

  test("German", async ({ page }) => {
    const card = await mountCard(page, { config: { time_format: "absolute", language: "de" }, data: backendData({ target: true }) });
    await expect(card.locator(".voc-title")).toHaveText("Reinigung");
    await expect(card.locator(".voc-primary-action")).toHaveAttribute("aria-label", "Auftrag anlegen");
    await shot(page, "queue-german-wide-light.png", WIDE);
  });
});

test.describe("the overlay pages", () => {
  test("the job editor", async ({ page }) => {
    const card = await mountCard(page, TARGET);
    await card.locator(".voc-primary-action").click();
    await expect(card.locator(".voc-job-editor")).toBeVisible();
    await expect(card.locator("[role=tablist]")).toHaveCount(0);
    await shot(page, "editor-narrow-light.png", NARROW);
  });

  test("the job detail page", async ({ page }) => {
    const card = await mountCard(page, TARGET);
    await card.locator('.voc-job-row[data-job-id="job-1"] .voc-job-name').click();
    await expect(card.locator("#voc-detail-title")).toHaveText("Kitchen and hall");
    await shot(page, "detail-medium-light.png", MEDIUM);
  });

  test("the confirmation", async ({ page }) => {
    const card = await mountCard(page, TARGET);
    await card.locator('.voc-job-row[data-job-id="job-1"] .voc-job-action-delete').click();
    await expect(card.locator(".voc-confirm-overlay")).toHaveAttribute("role", "alertdialog");
    await shot(page, "confirm-narrow-light.png", NARROW);
  });
});

test.describe("the other sections", () => {
  async function open(page, section, options = TARGET) {
    const card = await mountCard(page, options);
    await card.locator(`[role=tab][data-section="${section}"]`).click();
    return card;
  }

  test("rooms with backend data", async ({ page }) => {
    const card = await open(page, "rooms");
    await expect(card.locator(".voc-room-row")).toHaveCount(3);
    await expect(card.locator(".voc-room-blockers")).toHaveCount(1);
    await shot(page, "rooms-medium-light.png", MEDIUM);
  });

  test("rooms without the backend capability", async ({ page }) => {
    const card = await open(page, "rooms", { config: { time_format: "absolute" } });
    await expect(card.locator(".voc-unavailable")).toHaveText("Room data is not provided by the backend.");
    await shot(page, "rooms-degraded-medium-light.png", MEDIUM);
  });

  test("robots with backend data", async ({ page }) => {
    const card = await open(page, "robots");
    await expect(card.locator(".voc-robot-card")).toHaveCount(1);
    await shot(page, "robots-medium-light.png", MEDIUM);
  });

  test("the history", async ({ page }) => {
    const card = await open(page, "history", {
      config: { time_format: "absolute", sections: ["queue", "history"] },
      data: backendData({ target: true }),
    });
    await expect(card.locator(".voc-history-section .voc-job-row").first()).toBeVisible();
    await shot(page, "history-medium-light.png", MEDIUM);
  });

  test("the diagnostics of a disconnected backend", async ({ page }) => {
    const card = await mountCard(page, { config: { time_format: "absolute" }, data: backendData({ target: true }), connected: false });
    await card.locator('[role=tab][data-section="diagnostics"]').click();
    await expect(card.locator(".voc-diagnostics-section")).toBeVisible();
    await shot(page, "diagnostics-disconnected-medium-light.png", MEDIUM);
  });
});
