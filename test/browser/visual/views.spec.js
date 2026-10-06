// Golden screenshots of the whole card in the harness that reproduces Home Assistant's theme, font
// and card element. Each picture first asserts the fact it is there to show, so a golden cannot be
// re-recorded around a card that stopped saying it.
// Re-record with `npx playwright test test/browser/visual --update-snapshots`, then look at every
// changed image.

const { test, expect } = require("../../helpers/playwright.js");
const { act, mountCard, setCardWidth } = require("../../helpers/browser-helpers.js");

const WIDE = 900;
const MEDIUM = 640;
const NARROW = 380;
const BASE = { time_format: "absolute" };

// The stage carries the page background and the gutter a dashboard card sits in, and it is wide
// enough to contain the card's own shadow.
async function shot(page, name, width) {
  if (width) await setCardWidth(page, width);
  await expect(page.locator("#stage")).toHaveScreenshot(name, { animations: "disabled" });
}

async function open(page, card, view) {
  await act(page, card.locator(`[role=tab][data-view="${view}"]`));
}

const cardHeight = (card) => card.evaluate((element) => Math.round(element.shadowRoot.querySelector("ha-card").getBoundingClientRect().height));

// Scrolls a region to a share of its overflow and waits for its edges to be marked.
async function scrollTo(card, selector, share) {
  await card.evaluate((element, [selector, share]) => {
    const region = element.shadowRoot.querySelector(selector);
    region.scrollTop = share * (region.scrollHeight - region.clientHeight);
  }, [selector, share]);
  await expect(card.locator(selector)).toHaveAttribute("data-overflow-top", "");
}

test.describe("the queue", () => {
  test("wide, light", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await expect(card.locator('[data-key="active"] .voc-job')).toHaveCount(1);
    await expect(card.locator('[data-key="waiting"] .voc-job')).toHaveCount(3);
    await expect(card.locator(".voc-queue-control")).toHaveText("Pause queue");
    await shot(page, "queue-wide-light.png", WIDE);
  });

  test("wide, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { config: BASE });
    await expect(card.locator(".voc-status-pill")).toHaveText("Cleaning");
    await shot(page, "queue-wide-dark.png", WIDE);
  });

  test("medium", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await expect(card.locator('[data-key="job:job-kitchen"]')).toHaveAttribute("data-actions", "several");
    await expect(card.locator('[data-key="grace"]')).toHaveCount(0);
    await shot(page, "queue-medium-light.png", MEDIUM);
  });

  test("narrow, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { config: BASE });
    await setCardWidth(page, NARROW);
    await expect(card.locator('[role=tab][data-view="rooms"]')).toHaveAccessibleName("Rooms");
    await shot(page, "queue-narrow-dark.png");
  });

  test("German, narrow", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, language: "de" } });
    await expect(card.locator(".voc-title")).toHaveText("Reinigung");
    await expect(card.locator(".voc-queue-control")).toHaveAccessibleName("Pausieren");
    await shot(page, "queue-german-narrow-light.png", NARROW);
  });

  test("empty", async ({ page }) => {
    const card = await mountCard(page, { scenario: "empty", config: BASE });
    await expect(card.locator('[data-key="empty"]')).toBeVisible();
    await expect(card.locator(".voc-queue-control")).toHaveText("Start queue");
    await shot(page, "queue-empty-medium-light.png", MEDIUM);
  });

  test("recovery and attention", async ({ page }) => {
    const card = await mountCard(page, { scenario: "attention", config: BASE });
    await expect(card.locator('[data-key="recovery:robot-rocky"]')).toBeVisible();
    await expect(card.locator(".voc-status-pill")).toHaveText("Attention");
    await shot(page, "queue-attention-medium-light.png", MEDIUM);
  });

  test("a run winding down", async ({ page }) => {
    const card = await mountCard(page, { scenario: "windingDown", config: BASE });
    await expect(card.locator(".voc-panel-mode")).toContainText("12");
    await shot(page, "queue-winding-down-medium-light.png", MEDIUM);
  });

  test("a run ending after the started job", async ({ page }) => {
    const card = await mountCard(page, { scenario: "ending", config: BASE });
    await expect(card.locator(".voc-panel-mode")).toHaveText("Queue ending · started jobs finish");
    await expect(card.locator(".voc-queue-end")).toHaveCount(0);
    await expect(card.locator(".voc-queue-control")).toHaveText("Resume queue");
    await shot(page, "queue-ending-medium-light.png", MEDIUM);
  });

  test("read-only", async ({ page }) => {
    const card = await mountCard(page, { admin: false, config: BASE });
    await expect(card.locator('[data-key="job:job-kitchen"] [data-action="edit-job"]')).toHaveAttribute("aria-disabled", "true");
    await shot(page, "queue-read-only-medium-light.png", MEDIUM);
  });
});

test.describe("job pages", () => {
  test("detail with the execution explanation", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await act(page, card.locator('[data-key="job:job-bathroom"] .voc-job-main'));
    await expect(card.locator('[data-key="execution"]')).toContainText("Dusty");
    await shot(page, "detail-medium-light.png", MEDIUM);
  });

  test("new job editor", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await act(page, card.locator(".voc-primary-action"));
    await act(page, card.locator('[data-key="field:roomIds"] [data-value="room-kitchen"]'));
    await expect(card.locator('[data-key="field:roomIds"] [data-value="room-bedroom"] .voc-option-badge')).toBeVisible();
    await shot(page, "editor-medium-light.png", MEDIUM);
  });

  test("new job editor for all rooms, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, language: "de" } });
    await act(page, card.locator(".voc-primary-action"));
    await act(page, card.locator('[data-key="field:roomIds"] [data-value="all"]'));
    await expect(card.locator('[data-key="field:roomIds"] [data-value="all"]')).toHaveAttribute("aria-selected", "true");
    await expect(card.locator('[data-key="field:roomIds"] [data-value="room-hall"]')).toHaveClass(/is-muted/);
    await expect(card.locator('[data-key="field:roomIds"]')).toContainText("Der Auftrag behält diese Liste.");
    await shot(page, "editor-all-rooms-german-narrow-light.png", NARROW);
  });

  test("template editor, narrow", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "templates");
    await act(page, card.locator('[data-key="template:template-weekly"] [data-action="edit-template"]'));
    await expect(card.locator('[data-action="remove-template"]')).toBeVisible();
    await shot(page, "template-editor-narrow-light.png", NARROW);
  });

  test("new job editor for mopping, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, language: "de" } });
    await act(page, card.locator(".voc-primary-action"));
    await act(page, card.locator('[data-key="field:mode"] [data-value="mop"]'));
    await act(page, card.locator('[data-key="field:roomIds"] [data-value="room-hall"]'));
    await expect(card.locator('[data-key="field:vacuumPower"]')).toHaveCount(0);
    await expect(card.locator('[data-action="start-draft"]')).toHaveText("Jetzt starten");
    await shot(page, "editor-mop-german-narrow-light.png", NARROW);
  });

  test("cancelling a started job", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    const queueHeight = await cardHeight(card);
    await act(page, card.locator('[data-key="job:job-running"] [data-action="cancel-job"]'));
    expect(await cardHeight(card), "the dialog keeps the queue's height").toBe(queueHeight);
    await expect(card.locator('[data-key="overlay:cancel-job"]')).toHaveAttribute("role", "dialog");
    await expect(card.locator('[data-key="option:return_to_dock"]')).toHaveAttribute("aria-checked", "true");
    await shot(page, "cancel-job-narrow-light.png", NARROW);
  });

  test("cancelling a started job, German, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { config: { ...BASE, language: "de" } });
    await act(page, card.locator('[data-key="job:job-running"] [data-action="cancel-job"]'));
    await expect(card.locator('[data-action="confirm-cancel"]')).toHaveText("Auftrag abbrechen");
    await shot(page, "cancel-job-german-medium-dark.png", MEDIUM);
  });

  test("ending the queue with a started job", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await act(page, card.locator(".voc-queue-end"));
    await expect(card.locator('[data-key="overlay:queue-end"] [role=radio]')).toHaveCount(3);
    await shot(page, "queue-end-narrow-light.png", NARROW);
  });

  test("ending the queue with a started job, German", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, language: "de" } });
    await act(page, card.locator(".voc-queue-end"));
    await expect(card.locator('[data-action="confirm-end-queue"]')).toHaveText("Warteschlange beenden");
    await shot(page, "queue-end-german-medium-light.png", MEDIUM);
  });

  test("saving a job as a template", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await act(page, card.locator('[data-key="job:job-bathroom"] .voc-job-main'));
    await act(page, card.locator('[data-action="open-save-template"]'));
    await expect(card.locator('[data-field="overlay:name"]')).toHaveValue("Bathroom");
    await shot(page, "save-template-narrow-light.png", NARROW);
  });

  test("robot choice for a direct start", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await act(page, card.locator('[data-key="job:job-kitchen"] [data-action="start-job"]'));
    await expect(card.locator('[data-key="overlay:start-job"]')).toContainText("Dusty");
    await shot(page, "start-robot-medium-light.png", MEDIUM);
  });

  test("defaults for new jobs", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, start_view: "settings" } });
    await act(page, card.locator('[data-action="open-job-defaults"]'));
    await expect(card.locator('[data-key="field:overlay:vacuumPower"] [role=radio]')).toHaveCount(5);
    await shot(page, "job-defaults-medium-light.png", MEDIUM);
  });

  test("queue run settings", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, start_view: "settings" } });
    await act(page, card.locator('[data-action="open-queue-settings"]'));
    await expect(card.locator('[data-field="overlay:minutes"]')).toHaveValue("15");
    await shot(page, "queue-settings-medium-light.png", MEDIUM);
  });
});

test.describe("rooms", () => {
  test("light", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "rooms");
    await expect(card.locator('[data-key="room:room-bedroom"]')).toContainText("No robot reaches this room");
    await shot(page, "rooms-wide-light.png", WIDE);
  });

  test("dark, narrow", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "rooms");
    await expect(card.locator(".voc-room")).toHaveCount(5);
    await shot(page, "rooms-narrow-dark.png", NARROW);
  });

  test("release dialog", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "rooms");
    await act(page, card.locator('[data-key="room:room-bathroom"] [data-action="open-release"]'));
    await act(page, card.locator('[data-key="field:overlay:releaseKind"] [data-value="timed"]'));
    await expect(card.locator('[data-field="overlay:hours"]')).toBeVisible();
    await shot(page, "release-medium-light.png", MEDIUM);
  });

  test("room settings", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "rooms");
    await act(page, card.locator('[data-key="room:room-kitchen"] [data-action="edit-room"]'));
    await act(page, card.locator('[data-action="set-overlay"][data-args*="bindingsOpen"]'));
    await expect(card.locator('[data-key="detected:robot-rocky"]')).toBeVisible();
    await shot(page, "room-editor-medium-light.png", MEDIUM);
  });
});

test.describe("robots", () => {
  test("profiles with live state and map", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "robots");
    await expect(card.locator('[data-key="robot:robot-rocky"] .voc-robot-map img')).toBeVisible();
    await shot(page, "robots-medium-light.png", MEDIUM);
  });

  test("a robot stopped away from its dock", async ({ page }) => {
    const card = await mountCard(page, { scenario: "ending", config: BASE });
    await open(page, card, "robots");
    await expect(card.locator('[data-key="robot:robot-dusty"] [data-action="return-robot"]')).toHaveText("Return to dock");
    await shot(page, "robots-return-medium-light.png", MEDIUM);
  });

  test("profile editor with roles", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "robots");
    await act(page, card.locator('[data-key="robot:robot-dusty"] [data-action="edit-robot"]'));
    await act(page, card.locator('[data-action="toggle-section"][data-args*="roles"]'));
    await expect(card.locator('[data-key="role:status"]')).toContainText("Several entities fit");
    await shot(page, "robot-editor-medium-light.png", MEDIUM);
  });

  test("discovered vacuums", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "robots");
    await act(page, card.locator(".voc-primary-action"));
    await expect(card.locator('[data-key="overlay:robot-add"] .voc-robot')).toHaveCount(2);
    await shot(page, "robot-add-medium-light.png", MEDIUM);
  });
});

test.describe("templates, history and diagnostics", () => {
  test("templates", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "templates");
    await expect(card.locator('[data-key="template:template-weekly"] [data-key="suppressed"]')).toBeVisible();
    await shot(page, "templates-medium-light.png", MEDIUM);
  });

  test("history of jobs", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "history");
    await expect(card.locator('[data-key="jobs"] .voc-job')).toHaveCount(7);
    await shot(page, "history-jobs-medium-light.png", MEDIUM);
  });

  test("history of cleaning runs, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { config: BASE });
    await open(page, card, "history");
    await act(page, card.locator('[data-key="segment:runs"]'));
    await expect(card.locator(".voc-run")).toHaveCount(3);
    await shot(page, "history-runs-medium-dark.png", MEDIUM);
  });

  test("diagnostics", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, views: ["queue", "diagnostics"], start_view: "diagnostics" } });
    await expect(card.locator('[data-key="versions"]')).toContainText("0.1.0");
    await shot(page, "diagnostics-medium-light.png", MEDIUM);
  });
});

test.describe("settings", () => {
  test("light", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, start_view: "settings" } });
    await expect(card.locator('[data-key="setting:grace"] .voc-setting-value')).toHaveText("15 min");
    await expect(card.locator('[data-key="integration"]')).toContainText("0.1.0");
    await shot(page, "settings-medium-light.png", MEDIUM);
  });

  test("dark, narrow, German", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { config: { ...BASE, language: "de", start_view: "settings" } });
    await expect(card.locator('[data-key="setting:grace"]')).toContainText("Wartezeit bis zum Laufende");
    await shot(page, "settings-narrow-dark.png", NARROW);
  });
});

// Touch emulation makes the pointer coarse. The viewport holds the whole stage: a taller element
// makes the capture resize the viewport, which drops the emulation from the picture.
test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 1100 } });

  test("the queue, narrow", async ({ page }) => {
    const card = await mountCard(page, { config: BASE });
    await setCardWidth(page, NARROW);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await expect(card.locator('[data-key="job:job-running"]')).toHaveAttribute("data-actions", "one");
    const tile = await card.locator('[data-key="job:job-kitchen"] .voc-job-actions .voc-button').first().boundingBox();
    expect(tile.height).toBeGreaterThanOrEqual(44);
    await shot(page, "queue-narrow-touch-light.png");
  });

  test("more views than fit, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const views = ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics", "settings"];
    const card = await mountCard(page, { width: 320, config: { ...BASE, views, start_view: "queue" } });
    await expect(card.locator(".voc-tabs")).toHaveAttribute("data-overflow-end", "");
    await shot(page, "tabs-overflow-touch-dark.png");
  });
});

test.describe("onboarding and setup", () => {
  test("not installed", async ({ page }) => {
    const card = await mountCard(page, { installed: false, setUp: false, config: BASE });
    await expect(card.locator(".voc-onboarding ol li")).toHaveCount(3);
    await expect(card.locator(".voc-onboarding-actions a").first()).toHaveText("Open in HACS");
    await shot(page, "onboarding-not-installed-medium-light.png", MEDIUM);
  });

  test("not set up, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { setUp: false, config: BASE });
    await expect(card.locator(".voc-onboarding [data-action=navigate]")).toHaveText("Set up integration");
    await shot(page, "onboarding-not-set-up-medium-dark.png", MEDIUM);
  });

  test("failed to load", async ({ page }) => {
    const card = await mountCard(page, { runtimeLoaded: false, config: BASE });
    await expect(card.locator(".voc-onboarding")).toHaveAttribute("data-phase", "load_failed");
    await shot(page, "onboarding-load-failed-narrow-light.png", NARROW);
  });

  test("check failed", async ({ page }) => {
    const card = await mountCard(page, { installed: false, setUp: false, failNext: { "manifest/get": { code: "home_assistant_error", message: "Unknown error" } }, config: BASE });
    await expect(card.locator(".voc-onboarding")).toHaveAttribute("data-phase", "check_failed");
    await expect(card.locator(".voc-onboarding-note")).toHaveText("The request failed: Unknown error");
    await expect(card.locator(".voc-status-pill")).toHaveText("Error");
    await shot(page, "onboarding-check-failed-narrow-light.png", NARROW);
  });

  test("setup, first step", async ({ page }) => {
    const card = await mountCard(page, { scenario: "fresh", config: BASE });
    await expect(card.locator('[data-key="step:robots"]')).toHaveAttribute("data-current", "true");
    await shot(page, "setup-robots-medium-light.png", MEDIUM);
  });

  test("setup again from the settings, German, narrow", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, language: "de", start_view: "settings" } });
    await act(page, card.locator('[data-action="open-setup"]'));
    await expect(card.locator(".voc-setup-step")).toHaveCount(9);
    await expect(card.locator('[data-key="step:defaults"]')).toHaveAttribute("data-current", "true");
    await shot(page, "setup-guide-german-narrow-light.png", NARROW);
  });

  test("setup, rooms step after adding a robot", async ({ page }) => {
    const card = await mountCard(page, { scenario: "fresh", config: BASE });
    await act(page, card.locator('[data-action="add-candidate"][data-args*="vacuum.rocky"]'));
    await expect(card.locator('[data-key="step:rooms"]')).toHaveAttribute("data-current", "true");
    await shot(page, "setup-rooms-narrow-light.png", NARROW);
  });
});

// A sections grid cell of the default ten rows: header, panel and tabs stay, the content scrolls.
test.describe("in a sections grid cell", () => {
  const FRAMED = 10 * 64 - 8;

  test("the queue", async ({ page }) => {
    const card = await mountCard(page, { layout: "grid", config: BASE });
    expect(await cardHeight(card)).toBe(FRAMED);
    await expect(card.locator(".voc-body")).not.toHaveAttribute("data-overflow-bottom", "");
    await shot(page, "frame-queue-medium-light.png", MEDIUM);
  });

  test("a dialog, narrow, German, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { layout: "grid", config: { ...BASE, language: "de" } });
    await setCardWidth(page, NARROW);
    await act(page, card.locator('[data-key="job:job-running"] [data-action="cancel-job"]'));
    expect(await cardHeight(card)).toBe(FRAMED);
    const [actions, surface] = [await card.locator(".voc-overlay-actions").boundingBox(), await card.locator("ha-card").boundingBox()];
    expect(surface.y + surface.height - (actions.y + actions.height), "the actions sit at the bottom").toBeLessThan(20);
    await shot(page, "frame-cancel-narrow-dark.png");
  });

  test("the job editor with its actions in place", async ({ page }) => {
    const card = await mountCard(page, { layout: "grid", config: BASE });
    await act(page, card.locator(".voc-primary-action"));
    expect(await cardHeight(card)).toBe(FRAMED);
    await expect(card.locator(".voc-overlay-scroll")).toHaveAttribute("data-overflow-bottom", "");
    await expect(card.locator(".voc-overlay-actions")).toBeInViewport({ ratio: 1 });
    await shot(page, "frame-editor-medium-light.png", MEDIUM);
  });

  test("the robot editor scrolled to its middle", async ({ page }) => {
    const card = await mountCard(page, { layout: "grid", config: BASE });
    await open(page, card, "robots");
    await act(page, card.locator('[data-key="robot:robot-dusty"] [data-action="edit-robot"]'));
    await scrollTo(card, ".voc-overlay-scroll", 0.5);
    await expect(card.locator(".voc-overlay-scroll")).toHaveAttribute("data-overflow-bottom", "");
    await shot(page, "frame-robot-editor-medium-light.png", MEDIUM);
  });

  test("not installed, narrow", async ({ page }) => {
    const card = await mountCard(page, { layout: "grid", installed: false, setUp: false, config: BASE });
    await setCardWidth(page, NARROW);
    const [box, body] = [await card.locator(".voc-onboarding").boundingBox(), await card.locator(".voc-body").boundingBox()];
    expect(Math.abs(box.y - body.y - (body.y + body.height - box.y - box.height)), "the guide is centred").toBeLessThan(24);
    await shot(page, "frame-onboarding-not-installed-narrow-light.png");
  });

  test.describe("on a touch screen", () => {
    test.use({ hasTouch: true, viewport: { width: 1280, height: 1100 } });

    test("the queue scrolled to its end, narrow", async ({ page }) => {
      const card = await mountCard(page, { layout: "grid", config: BASE });
      await setCardWidth(page, NARROW);
      await scrollTo(card, ".voc-body", 1);
      await expect(card.locator(".voc-body")).not.toHaveAttribute("data-overflow-bottom", "");
      await expect(card.locator(".voc-tab-row")).toBeInViewport({ ratio: 1 });
      await shot(page, "frame-queue-end-narrow-touch-light.png");
    });
  });
});

test.describe("shell variants", () => {
  test("warning from the configuration", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, page_size: 1 } });
    await expect(card.locator(".voc-warning-text")).toContainText("page_size");
    await shot(page, "warning-medium-light.png", MEDIUM);
  });

  test("one view without a tab strip, custom header", async ({ page }) => {
    const card = await mountCard(page, { config: { ...BASE, views: ["rooms"], title: "Downstairs", icon: "mdi:home-floor-0", show: { panel: false } } });
    await expect(card.locator(".voc-tabs")).toHaveCount(0);
    await expect(card.locator(".voc-title")).toHaveText("Downstairs");
    await shot(page, "single-view-medium-light.png", MEDIUM);
  });

  test("two cards side by side", async ({ page }) => {
    await mountCard(page, { width: 420, configs: [{ ...BASE, views: ["queue", "rooms"] }, { ...BASE, views: ["robots", "history"], start_view: "robots", show: { panel: false } }] });
    expect(await page.evaluate(() => window.vocHarness.fake.subscriberCount())).toBe(1);
    await shot(page, "two-cards-light.png");
  });
});
