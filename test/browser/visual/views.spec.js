// Golden screenshots of the whole card in the harness that reproduces Home Assistant's theme, font
// and card element. Every picture shows a mark of the integration's recordings and first asserts
// the fact it is there to show, so a golden cannot be re-recorded around a card that stopped
// saying it.
// Re-record with `npx playwright test test/browser/visual --update-snapshots`, then look at every
// changed image.

const path = require("node:path");
const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, act, fromMenu, mountCard, named, setCardWidth, waitForStableLayout } = require("../../helpers/browser-helpers.js");

const WIDE = 900;
const MEDIUM = 640;
const NARROW = 380;
const BASE = { time_format: "absolute" };

// Places in the recordings besides the busy afternoon.
const EMPTY = { recording: "queue_end", from: "The card opens" };
const WAITING_FOR_WORK = { recording: "queue_end", from: "The queue waits for work" };
const ENDING = { recording: "queue_controls", from: "The queue ends after the started job" };
const STOPPED = { recording: "queue_controls", from: "Rocky stopped in the studio" };
const STATION = { recording: "attention", from: "The station needs attention" };
const RECOVERY = { recording: "recovery", from: "The job needs clarification" };
const EITHER_ROBOT = { recording: "robot_choice", from: "Either robot can start the dining room" };
const TWO_ROBOTS_IDLE = { recording: "robot_choice", from: "The card opens" };
const ROCKY_REMOVED = { recording: "robot_removed", from: "Rocky is not configured" };
const TEMPLATE_USED = { recording: "template_controls", from: "The daily template made a job" };
const NOT_INSTALLED = { recording: "not_installed" };
const NOT_SET_UP = { recording: "setup", from: "Vacuum Orchestrator is installed but not set up" };
const ASSISTANT = { recording: "setup", from: "The assistant opens" };
const NOT_LOADED = { recording: "unloaded", from: "The integration is not loaded" };
const NO_ROBOT = { recording: "no_robot" };
const COUNTDOWN = { recording: "start_delay", from: "The job starts in four seconds" };
const HALFWAY = { recording: "start_delay", from: "Rocky is halfway through" };
const TWO_ROOMS = { recording: "start_delay", from: "The job waits for its two rooms" };
const EDITED_ELSEWHERE = { recording: "job_hold", from: "Another card edits the job" };
const FAULT = { recording: "device_fault", from: "The job waits for the fix" };
const READ_ONLY = { recording: "read_only_user", from: "The card opens for a read-only user" };

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

const room = (card, name) => card.locator('[data-key="field:roomIds"] [data-value]', { hasText: name });

test.describe("the queue", () => {
  test("wide, light", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await expect(card.locator('[data-key="active"] .voc-job')).toHaveCount(1);
    await expect(card.locator('[data-key="waiting"] .voc-job')).toHaveCount(3);
    await expect(card.locator(".voc-queue-control")).toHaveText("Pause queue");
    await shot(page, "queue-wide-light.png", WIDE);
  });

  test("wide, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await expect(card.locator(".voc-status-pill")).toHaveText("Cleaning");
    await shot(page, "queue-wide-dark.png", WIDE);
  });

  test("medium", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await expect(named(card, ".voc-job", "Library, thoroughly", ".voc-job-status")).toHaveText("Job ready · Rocky is busy");
    await expect(card.locator('[data-key="grace"]')).toHaveCount(0);
    // UI-32: titles that fit leave the actions beside them, centred on the row.
    await expect(card.locator('.voc-job[data-title="fits"]')).toHaveCount(4);
    await shot(page, "queue-medium-light.png", MEDIUM);
  });

  test("narrow, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await setCardWidth(page, NARROW);
    await expect(card.locator('[role=tab][data-view="rooms"]')).toHaveAccessibleName("Rooms");
    await shot(page, "queue-narrow-dark.png");
  });

  test("German, narrow", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de" } });
    await expect(card.locator(".voc-title")).toHaveText("Reinigung");
    await expect(card.locator(".voc-queue-control")).toHaveAccessibleName("Pausieren");
    await shot(page, "queue-german-narrow-light.png", NARROW);
  });

  test("empty", async ({ page }) => {
    const card = await mountCard(page, { ...EMPTY, config: BASE });
    await expect(card.locator('[data-key="empty"]')).toBeVisible();
    await expect(card.locator(".voc-queue-control")).toHaveText("Start queue");
    await shot(page, "queue-empty-medium-light.png", MEDIUM);
  });

  test("the station needs attention", async ({ page }) => {
    const card = await mountCard(page, { ...STATION, config: BASE });
    await expect(card.locator(".voc-status-pill")).toHaveText("Attention");
    await shot(page, "queue-attention-medium-light.png", MEDIUM);
  });

  test("a job needs clarification", async ({ page }) => {
    const card = await mountCard(page, { ...RECOVERY, config: BASE });
    await expect(card.locator('[data-key^="recovery:"]')).toBeVisible();
    await shot(page, "queue-recovery-medium-light.png", MEDIUM);
  });

  test("a run waiting for work", async ({ page }) => {
    const card = await mountCard(page, { ...WAITING_FOR_WORK, config: BASE });
    await expect(card.locator(".voc-panel-mode")).toContainText("14");
    await shot(page, "queue-winding-down-medium-light.png", MEDIUM);
  });

  test("a run ending after the started job", async ({ page }) => {
    const card = await mountCard(page, { ...ENDING, config: BASE });
    await expect(card.locator(".voc-panel-mode")).toHaveText("Queue ending · started jobs finish");
    await expect(card.locator(".voc-queue-end")).toHaveCount(0);
    await expect(card.locator(".voc-queue-control")).toHaveText("Resume queue");
    await shot(page, "queue-ending-medium-light.png", MEDIUM);
  });

  test("a new job counting down to its start", async ({ page }) => {
    const card = await mountCard(page, { ...COUNTDOWN, config: BASE });
    const row = named(card, ".voc-job", "Dining Room, Studio");
    await expect(row.locator(".voc-job-status")).toHaveText("Starts in 4 seconds");
    await expect(row.locator('.voc-job-main-action[data-action="delete-job"]')).toHaveText("Delete");
    await shot(page, "queue-countdown-medium-light.png", MEDIUM);
  });

  test("a running job halfway through", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...HALFWAY, config: BASE });
    await expect(card.locator('[data-key="active"] .voc-progress')).toHaveAttribute("aria-valuenow", "50");
    await shot(page, "queue-progress-narrow-dark.png", NARROW);
  });

  test("a job edited on another card", async ({ page }) => {
    const card = await mountCard(page, { ...EDITED_ELSEWHERE, config: BASE });
    await expect(named(card, ".voc-job", "Dining Room", ".voc-job-status")).toHaveText("Being edited");
    await shot(page, "queue-held-medium-light.png", MEDIUM);
  });

  test("a job waiting for a fault to be fixed", async ({ page }) => {
    const card = await mountCard(page, { ...FAULT, config: BASE });
    await expect(card.locator('[data-key="active"] .voc-job-status[data-tone="attention"]')).toContainText("fails at");
    await shot(page, "queue-fault-medium-light.png", MEDIUM);
  });

  test("narrow, a row's menu open", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await setCardWidth(page, NARROW);
    await act(page, named(card, ".voc-job", "Library, thoroughly", ".voc-menu-button"));
    await expect(card.locator('[role="menu"] [role="menuitem"]')).toHaveText(["Move up", "Move down", "Edit", "Save as template", "Delete"]);
    await shot(page, "queue-menu-narrow-light.png");
  });

  test("seven open jobs, the list scrolling in the frame, medium", async ({ page }) => {
    const card = await mountCard(page, { recording: "showcase", from: "Seven jobs are open", config: BASE });
    await expect(card.locator('[data-key="waiting"] .voc-job')).toHaveCount(6);
    await expect(card.locator(".voc-body")).toHaveAttribute("data-overflow-bottom", "");
    await shot(page, "queue-seven-jobs-medium-light.png", MEDIUM);
  });

  // UI-32: a title too long for a line beside the actions runs across the row above them.
  test("a long title above its row's actions, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { recording: "showcase", from: "Seven jobs are open", config: { ...BASE, language: "de" } });
    await setCardWidth(page, NARROW);
    await expect(named(card, ".voc-job", "Library before the reading group on Saturday")).toHaveAttribute("data-title", "wraps");
    await expect(named(card, ".voc-job", "Library, thoroughly")).toHaveAttribute("data-title", "fits");
    await scrollTo(card, ".voc-body", 1);
    await shot(page, "queue-long-title-german-narrow-light.png");
  });

  test("a command's notice floats over the foot, medium", async ({ page }) => {
    const card = await mountCard(page, { recording: "queue_controls", from: "The queue runs again", config: BASE });
    await act(page, card.locator(".voc-primary-action"));
    await act(page, card.locator('[data-key="field:mode"] [data-value="mop"]'));
    await act(page, card.locator('[data-key="field:roomIds"] [data-value]', { hasText: "Dining Room" }));
    await act(page, card.locator('[data-action="save-draft"]'));
    await expect(card.locator(".voc-notice")).toContainText("added");
    await shot(page, "queue-notice-medium-light.png", MEDIUM);
  });

  // ACT-07: a user the integration lets only read sees the queue without its controls.
  test("read-only", async ({ page }) => {
    const card = await mountCard(page, { ...READ_ONLY, config: BASE });
    await expect(card.locator(".voc-subtitle")).toContainText("Read only for your account");
    await expect(named(card, ".voc-job", "Library", ".voc-menu-button")).toHaveCount(0);
    await shot(page, "queue-read-only-medium-light.png", MEDIUM);
  });

  test("read-only, narrow, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...READ_ONLY, config: BASE });
    await setCardWidth(page, NARROW);
    await expect(card.locator(".voc-job .voc-menu-button")).toHaveCount(0);
    await shot(page, "queue-read-only-narrow-dark.png");
  });
});

test.describe("job pages", () => {
  test("detail with the waiting reason on three axes", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await act(page, named(card, ".voc-job", "Conservatory", ".voc-job-main"));
    await expect(card.locator('[data-key="axis:robots"] li')).toHaveText("Rocky does not reach this room");
    await shot(page, "detail-medium-light.png", MEDIUM);
  });

  test("new job editor", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await act(page, card.locator(".voc-primary-action"));
    await act(page, room(card, "Dining Room"));
    await expect(room(card, "Conservatory").locator(".voc-option-badge")).toBeVisible();
    await shot(page, "editor-medium-light.png", MEDIUM);
  });

  test("new job editor for all rooms, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de" } });
    await act(page, card.locator(".voc-primary-action"));
    await act(page, card.locator('[data-key="field:roomIds"] [data-value="all"]'));
    await expect(card.locator('[data-key="field:roomIds"] [data-value="all"]')).toHaveAttribute("aria-selected", "true");
    await expect(room(card, "Studio")).toHaveClass(/is-included/);
    await shot(page, "editor-all-rooms-german-narrow-light.png", NARROW);
  });

  test("template editor, narrow", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "templates");
    for (const step of fromMenu(card, ".voc-template", "Weekly clean", '[data-action="edit-template"]')) await act(page, step);
    await expect(card.locator('[data-action="remove-template"]')).toBeVisible();
    await shot(page, "template-editor-narrow-light.png", NARROW);
  });

  // The fullest footer: on a narrow card, saving as a template and removing share a menu.
  test("waiting job editor with its menu, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { recording: "edit_hold", from: "A dining room job waits", config: { ...BASE, language: "de" } });
    for (const step of fromMenu(card, ".voc-job", "Dining Room", '[data-action="edit-job"]')) await act(page, step);
    await setCardWidth(page, NARROW);
    await act(page, card.locator('[data-key="menu:editor"] .voc-menu-button'));
    await expect(card.locator('.voc-menu [data-action="delete-job"]')).toBeVisible();
    await shot(page, "editor-waiting-german-narrow-light.png", NARROW);
  });

  test("new job editor for mopping, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de" } });
    await act(page, card.locator(".voc-primary-action"));
    await act(page, room(card, "Dining Room"));
    await act(page, card.locator('[data-key="field:mode"] [data-value="mop"]'));
    await expect(card.locator('[data-key="field:vacuumPower"]')).toHaveCount(0);
    await expect(card.locator('[data-key="field:mopIntensity"]')).toBeVisible();
    await shot(page, "editor-mop-german-narrow-light.png", NARROW);
  });

  test("cancelling a started job", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    const queueHeight = await cardHeight(card);
    await act(page, named(card, ".voc-job", "Studio", '[data-action="cancel-job"]'));
    expect(await cardHeight(card), "the dialog keeps the queue's height").toBe(queueHeight);
    await expect(card.locator('[data-key="overlay:cancel-job"]')).toHaveAttribute("role", "dialog");
    await expect(card.locator('[data-key="option:return_to_dock"]')).toHaveAttribute("aria-checked", "true");
    await shot(page, "cancel-job-narrow-light.png", NARROW);
  });

  // JOB-25: how a finished job ended, corrected by a person, with its log to save.
  test("detail of a corrected job, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { recording: "recovery", from: "The library job is corrected", config: { ...BASE, language: "de" } });
    await open(page, card, "history");
    await act(page, named(card, ".voc-job", "Library", ".voc-job-main"));
    await expect(card.locator('[data-key="result"] [data-key="note:reported_by_user"]')).toBeVisible();
    await shot(page, "detail-corrected-german-narrow-light.png", NARROW);
  });

  test("correcting a finished job's result", async ({ page }) => {
    const card = await mountCard(page, { recording: "recovery", from: "Rocky is free again", config: BASE });
    await open(page, card, "history");
    await act(page, named(card, ".voc-job", "Library", ".voc-job-main"));
    await act(page, card.locator('[data-key="result"] [data-action="correct-job"]'));
    await expect(card.locator('[data-action="confirm-correct"]')).toBeVisible();
    await shot(page, "correct-job-medium-light.png", MEDIUM);
  });

  test("cancelling a started job, German, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de" } });
    await act(page, named(card, ".voc-job", "Studio", '[data-action="cancel-job"]'));
    await expect(card.locator('[data-action="confirm-cancel"]')).toHaveText("Auftrag abbrechen");
    await shot(page, "cancel-job-german-medium-dark.png", MEDIUM);
  });

  test("ending the queue with a started job", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await act(page, card.locator(".voc-queue-end"));
    await expect(card.locator('[data-key="overlay:queue-end"] [role=radio]')).toHaveCount(3);
    await shot(page, "queue-end-narrow-light.png", NARROW);
  });

  test("ending the queue with a started job, German", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de" } });
    await act(page, card.locator(".voc-queue-end"));
    await expect(card.locator('[data-action="confirm-end-queue"]')).toHaveText("Warteschlange beenden");
    await shot(page, "queue-end-german-medium-light.png", MEDIUM);
  });

  test("saving a job as a template", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await act(page, named(card, ".voc-job", "Conservatory", ".voc-job-main"));
    await act(page, card.locator('[data-action="open-save-template"]'));
    await expect(card.locator('[data-field="overlay:name"]')).toHaveValue("Conservatory");
    await shot(page, "save-template-narrow-light.png", NARROW);
  });

  test("robot choice for a direct start", async ({ page }) => {
    const card = await mountCard(page, { ...EITHER_ROBOT, config: BASE });
    await act(page, named(card, ".voc-job", "Dining Room", '[data-action="start-job"]'));
    await expect(card.locator('[data-key="overlay:start-job"]')).toContainText("Dusty");
    await shot(page, "start-robot-medium-light.png", MEDIUM);
  });

  // JOB-27: below the robot's minimum battery a start is offered and asks first.
  test("starting below the minimum battery", async ({ page }) => {
    const card = await mountCard(page, { recording: "low_battery", from: "The job waits for the battery and offers a start", config: BASE });
    await act(page, card.locator('.voc-job [data-action="start-job"]').first());
    await expect(card.locator('[data-key="overlay:low-battery-start"]')).toBeVisible();
    await expect(card.locator('[data-key="overlay:low-battery-start"] [data-action="back"]')).toHaveText("Back");
    await shot(page, "low-battery-start-medium-light.png", MEDIUM);
  });

  test("defaults for new jobs", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, start_view: "settings" } });
    await act(page, card.locator('[data-action="open-job-defaults"]'));
    await expect(card.locator('[data-key="field:overlay:vacuumPower"] [role=radio]')).toHaveCount(5);
    await shot(page, "job-defaults-medium-light.png", MEDIUM);
  });

  test("queue run settings", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, start_view: "settings" } });
    await act(page, card.locator('[data-action="open-queue-settings"]'));
    await expect(card.locator('[data-field="overlay:minutes"]')).toHaveValue("15");
    await shot(page, "queue-settings-medium-light.png", MEDIUM);
  });
});

test.describe("rooms", () => {
  test("light", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "rooms");
    await expect(named(card, ".voc-room", "Conservatory")).toContainText("No robot reaches this room");
    await shot(page, "rooms-wide-light.png", WIDE);
  });

  // DUE-03, DUE-04: an overdue room leads; a partly observed use carries its mark.
  test("an overdue and a partly observed room, medium", async ({ page }) => {
    const card = await mountCard(page, { recording: "long_history", from: "The dining room is overdue and the studio partly observed", config: { ...BASE, start_view: "rooms" } });
    await expect(card.locator(".voc-room").first().locator(".voc-room-name")).toHaveText("Dining Room");
    await expect(named(card, ".voc-room", "Dining Room", '[data-due][data-overdue="true"]')).toBeVisible();
    await expect(named(card, ".voc-room", "Studio", ".voc-due-status[data-explain] .voc-due-mark")).toHaveText("*");
    await shot(page, "rooms-due-medium-light.png", MEDIUM);
  });

  test("dark, narrow", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "rooms");
    await expect(card.locator(".voc-room")).toHaveCount(4);
    await shot(page, "rooms-narrow-dark.png", NARROW);
  });

  // Opened from the job, the dialog also says what the job still waits for afterwards.
  test("release dialog", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await act(page, named(card, ".voc-job", "Conservatory", '[data-action="open-release"]'));
    await expect(card.locator('[data-key="afterwards"]')).toBeVisible();
    await act(page, card.locator('[data-key="field:release:0:kind"] [data-value="timed"]'));
    await expect(card.locator('[data-field="release:0:hours"]')).toBeVisible();
    await shot(page, "release-medium-light.png", MEDIUM);
  });

  // REL-04, REL-06, REL-08: a job's two rooms, each with its own kind; a timed one with its quick
  // choice and hours beside minutes.
  test("release dialog for a job's two rooms", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROOMS, config: BASE });
    await act(page, named(card, ".voc-job", "Dining Room, Studio", '[data-action="open-release"]'));
    await act(page, card.locator('[data-key="field:release:0:kind"] [data-value="once"]'));
    await act(page, card.locator('[data-key="field:release:1:kind"] [data-value="timed"]'));
    await act(page, card.locator('[data-key="field:release:1:quick"] [data-value="240"]'));
    const [hours, minutes] = [await card.locator('[data-field="release:1:hours"]').boundingBox(), await card.locator('[data-field="release:1:minutes"]').boundingBox()];
    expect(Math.abs(hours.y - minutes.y), "hours beside minutes").toBeLessThanOrEqual(1);
    await shot(page, "release-rooms-medium-light.png", MEDIUM);
  });

  test("room settings", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "rooms");
    for (const step of fromMenu(card, ".voc-room", "Dining Room", '[data-action="edit-room"]')) await act(page, step);
    await act(page, card.locator('[data-action="set-overlay"][data-args*="bindingsOpen"]'));
    await expect(card.locator('[data-key^="detected:"]').first()).toBeVisible();
    await shot(page, "room-editor-medium-light.png", MEDIUM);
  });
});

test.describe("robots", () => {
  test("profiles with live state and map", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "robots");
    await expect(named(card, ".voc-robot", "Rocky", ".voc-robot-map img")).toBeVisible();
    await shot(page, "robots-medium-light.png", MEDIUM);
  });

  // A tall map on a wide card turns to fill its column instead of standing narrow.
  test("a tall map on a wide card", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await page.route("**/api/image_proxy/**", (route) => route.fulfill({ path: path.join(__dirname, "..", "..", "fixtures", "map-portrait.svg"), contentType: "image/svg+xml" }));
    await setCardWidth(page, WIDE);
    await open(page, card, "robots");
    const stage = named(card, ".voc-robot", "Rocky", "[data-map-stage]");
    await expect(stage).toHaveAttribute("data-rotated", "true");
    const [box, picture] = await Promise.all([stage.boundingBox(), stage.locator("img").boundingBox()]);
    expect(picture.width / box.width, "the turned map fills most of its column").toBeGreaterThan(0.6);
    await shot(page, "robots-tall-map-wide-light.png", WIDE);
    // A card that narrows within a width tier (a turned tablet) lays its map out again; it never
    // keeps the old size.
    await setCardWidth(page, MEDIUM);
    await setCardWidth(page, NARROW);
    await expect.poll(async () => {
      const [narrowBox, narrowPicture] = await Promise.all([stage.boundingBox(), stage.locator("img").boundingBox()]);
      return Math.round((narrowPicture.width / narrowBox.width) * 100);
    }).toBeGreaterThanOrEqual(95);
  });

  // UI-10: the map opens large; on a narrow card a wide map turns to fill it, on a wider one it
  // stays upright.
  test("the map enlarged, narrow and medium", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "robots");
    await setCardWidth(page, NARROW);
    await act(page, named(card, ".voc-robot", "Rocky", '[data-action="open-map"]'));
    await expect(card.locator("[data-map-stage]")).toHaveAttribute("data-rotated", "true");
    // The whole map stays in view below the page's lead.
    const [stageBox, regionBox] = await Promise.all([card.locator("[data-map-stage]").boundingBox(), card.locator(".voc-overlay-scroll").boundingBox()]);
    expect(stageBox.y + stageBox.height).toBeLessThanOrEqual(regionBox.y + regionBox.height + 1);
    await shot(page, "robot-map-narrow-light.png", NARROW);
    await setCardWidth(page, MEDIUM);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await act(page, card.locator('[data-action="back"]').first());
    await act(page, named(card, ".voc-robot", "Rocky", '[data-action="open-map"]'));
    await expect(card.locator("[data-map-stage]")).toHaveAttribute("data-rotated", "false");
    await shot(page, "robot-map-medium-light.png", MEDIUM);
  });

  // ROB-13: a fault names its cause and which cleaning it blocks.
  test("a robot whose station needs attention, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { recording: "attention", from: "The station needs attention", config: { ...BASE, language: "de" } });
    await open(page, card, "robots");
    await expect(named(card, ".voc-robot", "Rocky", '[data-key="fault:dirty_water_full"]')).toContainText("Sperrt: Wischen");
    await shot(page, "robots-fault-german-narrow-light.png", NARROW);
  });

  // ROOM-08: an own binding picks the robot's map and segments by name.
  test("a room bound to a segment of another map", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "rooms");
    for (const step of fromMenu(card, ".voc-room", "Conservatory", '[data-action="edit-room"]')) await act(page, step);
    await act(page, card.locator('[data-key="group:targets"] .voc-disclosure'));
    await act(page, card.locator('[data-action="add-binding"]').first());
    await act(page, card.locator('[data-key="field:bindings.0.mapId"] [data-value="1"]'));
    await act(page, card.locator('[data-key="field:bindings.0.targetIds"] [data-value="16"]'));
    await card.locator('[data-key="field:bindings.0.targetIds"]').evaluate((node) => node.scrollIntoView({ block: "center" }));
    await expect(card.locator('[data-key="field:bindings.0.targetIds"] [data-value="16"]')).toHaveAttribute("aria-selected", "true");
    await shot(page, "room-binding-medium-light.png", MEDIUM);
  });

  test("a robot stopped away from its dock", async ({ page }) => {
    const card = await mountCard(page, { ...STOPPED, config: BASE });
    await open(page, card, "robots");
    await expect(named(card, ".voc-robot", "Rocky", '[data-action="return-robot"]')).toHaveText("Return to dock");
    await shot(page, "robots-return-medium-light.png", MEDIUM);
  });

  // UI-18: the areas a robot cleans are an explicit choice; none chosen is said in words.
  test("profile editor limited to some areas, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS_IDLE, config: { ...BASE, language: "de" } });
    await open(page, card, "robots");
    for (const step of fromMenu(card, ".voc-robot", "Rocky", '[data-action="edit-robot"]')) await act(page, step);
    await act(page, card.locator('[data-key="field:areaScope"] [data-value="only"]'));
    await expect(card.locator('[data-key="field:targetAreas"] .voc-field-warning')).toBeVisible();
    await card.locator('[data-key="field:targetAreas"] .voc-field-warning').evaluate((node) => node.scrollIntoView({ block: "center" }));
    await shot(page, "robot-editor-areas-german-narrow-light.png", NARROW);
  });

  test("profile editor with roles", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS_IDLE, config: BASE });
    await open(page, card, "robots");
    for (const step of fromMenu(card, ".voc-robot", "Rocky", '[data-action="edit-robot"]')) await act(page, step);
    await act(page, card.locator('[data-action="toggle-section"][data-args*="roles"]'));
    await expect(card.locator('[data-key="role:status"]')).toContainText("Found: Rocky Status");
    await shot(page, "robot-editor-medium-light.png", MEDIUM);
  });

  // UI-32: the profile opens with the robot's own name; empty, it follows Home Assistant's.
  test("profile editor opening with the name, narrow", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS_IDLE, config: BASE });
    await setCardWidth(page, NARROW);
    await open(page, card, "robots");
    for (const step of fromMenu(card, ".voc-robot", "Rocky", '[data-action="edit-robot"]')) await act(page, step);
    const name = card.locator('[data-field="name"]');
    await expect(name).toHaveValue("");
    await expect(name).toHaveAttribute("placeholder", "Rocky");
    await shot(page, "robot-editor-name-narrow-light.png");
  });

  test("discovered vacuums", async ({ page }) => {
    const card = await mountCard(page, { ...ROCKY_REMOVED, config: BASE });
    await open(page, card, "robots");
    await act(page, card.locator(".voc-primary-action"));
    await expect(card.locator('[data-key="overlay:robot-add"] [data-action="add-candidate"]')).toHaveCount(1);
    await shot(page, "robot-add-medium-light.png", MEDIUM);
  });
});

test.describe("templates, history and diagnostics", () => {
  test("templates", async ({ page }) => {
    const card = await mountCard(page, { ...TEMPLATE_USED, config: BASE });
    await open(page, card, "templates");
    await expect(named(card, ".voc-template", "Dining room daily", '[data-key="suppressed"]')).toBeVisible();
    await shot(page, "templates-medium-light.png", MEDIUM);
  });

  test("history of jobs", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "history");
    await expect(card.locator('[data-key="jobs"] .voc-job')).toHaveCount(3);
    await shot(page, "history-jobs-medium-light.png", MEDIUM);
  });

  // UI-32: a finished job's further actions are in its menu, correcting its result first.
  test("history of jobs with a row's menu open, narrow", async ({ page }) => {
    const card = await mountCard(page, { recording: "long_history", from: "Rocky has cleaned six times", config: { ...BASE, start_view: "history" } });
    await setCardWidth(page, NARROW);
    await act(page, card.locator('[data-key="jobs"] .voc-job .voc-menu-button').first());
    await expect(card.locator('[role="menu"] [role="menuitem"]')).toHaveText(["Correct result", "Save as template", "Delete"]);
    await shot(page, "history-menu-narrow-light.png");
  });

  test("history of cleaning runs, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await open(page, card, "history");
    await act(page, card.locator('[data-key="segment:runs"]'));
    await expect(card.locator(".voc-run")).toHaveCount(1);
    await shot(page, "history-runs-medium-dark.png", MEDIUM);
  });

  test("diagnostics", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, views: ["queue", "diagnostics"], start_view: "diagnostics" } });
    await expect(card.locator('[data-key="versions"]')).toContainText(/Integration\s*\d+\.\d+\.\d+/);
    await shot(page, "diagnostics-medium-light.png", MEDIUM);
  });
});

test.describe("settings", () => {
  test("light", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, start_view: "settings" } });
    await expect(card.locator('[data-key="queue"] [data-key="fact:grace"]')).toHaveText("15 min");
    await expect(card.locator('[data-key="about"]')).toContainText(/\d+\.\d+\.\d+/);
    await shot(page, "settings-medium-light.png", MEDIUM);
  });

  // ROOM-13: how the integration orders the rooms, set for every card.
  test("the rooms' order, medium", async ({ page }) => {
    const card = await mountCard(page, { recording: "settings_controls", from: "Rooms are listed by name", config: { ...BASE, start_view: "settings" } });
    const rooms = card.locator('[data-key="rooms"]');
    await expect(rooms).toContainText("By name");
    await rooms.scrollIntoViewIfNeeded();
    await waitForStableLayout(page);
    await shot(page, "settings-rooms-medium-light.png", MEDIUM);
  });

  test("dark, narrow, German", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de", start_view: "settings" } });
    await expect(card.locator('[data-key="queue"]')).toContainText("Nachlaufzeit");
    // LAY-08: long German words break at syllables.
    await expect(card.locator(".voc-facts dt").first()).toHaveCSS("hyphens", "auto");
    await expect(card.locator(".voc-facts dd").first()).toHaveCSS("hyphens", "auto");
    await shot(page, "settings-narrow-dark.png", NARROW);
  });
});

// Touch emulation makes the pointer coarse. The viewport holds the whole stage: a taller element
// makes the capture resize the viewport, which drops the emulation from the picture.
test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 1100 } });

  test("the queue, narrow", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await setCardWidth(page, NARROW);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    for (const target of [named(card, ".voc-job", "Studio", ".voc-job-main-action"), named(card, ".voc-job", "Library, thoroughly", ".voc-menu-button")]) {
      expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await shot(page, "queue-narrow-touch-light.png");
  });

  // UI-22: a refused control has no hover on touch; tapped, it says why. The profile of a working
  // robot opens for its next job; removing it waits.
  test("a tapped refused control says why", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: BASE });
    await setCardWidth(page, NARROW);
    await open(page, card, "robots");
    await act(page, card.locator(".voc-robot .voc-menu-button").first());
    await act(page, card.locator('.voc-robot [role="menu"] [data-action="edit-robot"]').first());
    await expect(card.locator('[data-key="busy"]')).toBeVisible();
    // LAY-12: only the card's own notice floats; a page's notes stand in its flow.
    expect(await card.locator('[data-key="busy"]').evaluate((node) => getComputedStyle(node).position)).toBe("static");
    await act(page, card.locator(".voc-overlay-actions .voc-menu-button"));
    await card.locator('[role="menuitem"][data-action="remove-robot"]').tap({ force: true });
    await expect(card.locator(".voc-notice--info:not([data-key])")).toBeVisible();
    await shot(page, "robot-refused-narrow-touch-light.png");
  });

  test("more views than fit, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const views = ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics", "settings"];
    const card = await mountCard(page, { ...BUSY, width: 320, config: { ...BASE, views, start_view: "queue" } });
    await expect(card.locator(".voc-tabs")).toHaveAttribute("data-overflow-end", "");
    await shot(page, "tabs-overflow-touch-dark.png");
  });
});

test.describe("onboarding and setup", () => {
  test("not installed", async ({ page }) => {
    const card = await mountCard(page, { ...NOT_INSTALLED, config: BASE });
    await expect(card.locator(".voc-onboarding ol li")).toHaveCount(3);
    await expect(card.locator(".voc-onboarding-actions a").first()).toHaveText("Open in HACS");
    await shot(page, "onboarding-not-installed-medium-light.png", MEDIUM);
  });

  test("not set up, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...NOT_SET_UP, config: BASE });
    await expect(card.locator(".voc-onboarding [data-action=navigate]")).toHaveText("Set up integration");
    await shot(page, "onboarding-not-set-up-medium-dark.png", MEDIUM);
  });

  test("not loaded", async ({ page }) => {
    const card = await mountCard(page, { ...NOT_LOADED, config: BASE });
    await expect(card.locator(".voc-onboarding")).toHaveAttribute("data-phase", "load_failed");
    await shot(page, "onboarding-load-failed-narrow-light.png", NARROW);
  });

  test("check failed", async ({ page }) => {
    const card = await mountCard(page, { ...NOT_INSTALLED, failNext: [[{ type: "manifest/get" }, { code: "home_assistant_error", message: "Unknown error" }]], config: BASE });
    await expect(card.locator(".voc-onboarding")).toHaveAttribute("data-phase", "check_failed");
    await expect(card.locator(".voc-onboarding-note")).toHaveText("The request failed: Unknown error");
    await expect(card.locator(".voc-status-pill")).toHaveText("Error");
    await shot(page, "onboarding-check-failed-narrow-light.png", NARROW);
  });

  test("setup without a robot", async ({ page }) => {
    const card = await mountCard(page, { ...NO_ROBOT, config: BASE });
    await expect(card.locator('[data-key="step:robots"]')).toHaveAttribute("data-current", "true");
    await shot(page, "setup-robots-medium-light.png", MEDIUM);
  });

  test("setup again from the settings, German, narrow", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de", start_view: "settings" } });
    await act(page, card.locator('[data-action="open-setup"]'));
    await expect(card.locator(".voc-setup-step")).toHaveCount(4);
    await expect(card.locator('[data-key="step:robots"]')).toHaveAttribute("data-current", "true");
    await shot(page, "setup-guide-german-narrow-light.png", NARROW);
  });

  test("the assistant after adding the integration, narrow", async ({ page }) => {
    const card = await mountCard(page, { ...ASSISTANT, config: BASE });
    await expect(card.locator('[role=tab][aria-selected="true"]')).toHaveAttribute("data-view", "setup");
    await expect(card.locator('[data-key="step:robots"]')).toContainText("Rocky");
    await shot(page, "setup-assistant-narrow-light.png", NARROW);
  });

  test("the assistant on its last step, where finishing stands out, medium", async ({ page }) => {
    const card = await mountCard(page, { ...ASSISTANT, config: BASE });
    for (const step of ["robots", "rooms", "defaults"]) await act(page, card.locator(`[data-key="step:${step}"] [data-key="setup-next"]`));
    await expect(card.locator('[data-key="step:queue"]')).toHaveAttribute("data-current", "true");
    await expect(card.locator('[data-action="complete-setup"]')).toHaveClass(/voc-button--primary/);
    await shot(page, "setup-assistant-last-step-medium-light.png", MEDIUM);
  });
});

// A sections grid cell of the default ten rows: header, panel and tabs stay, the content scrolls.
test.describe("in a sections grid cell", () => {
  const FRAMED = 10 * 64 - 8;

  test("the queue", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, layout: "grid", config: BASE });
    expect(await cardHeight(card)).toBe(FRAMED);
    await expect(card.locator(".voc-body")).not.toHaveAttribute("data-overflow-bottom", "");
    await shot(page, "frame-queue-medium-light.png", MEDIUM);
  });

  test("a dialog, narrow, German, dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const card = await mountCard(page, { ...BUSY, layout: "grid", config: { ...BASE, language: "de" } });
    await setCardWidth(page, NARROW);
    await act(page, named(card, ".voc-job", "Studio", '[data-action="cancel-job"]'));
    expect(await cardHeight(card)).toBe(FRAMED);
    await expect(card.locator(".voc-root"), "the scrim follows Home Assistant's dark theme").toHaveAttribute("data-scheme", "dark");
    const [content, actions] = [await card.locator(".voc-dialog-scroll").boundingBox(), await card.locator(".voc-dialog-actions").boundingBox()];
    expect(actions.y - (content.y + content.height), "a compact dialog: the actions right below the content").toBeLessThanOrEqual(24);
    await shot(page, "frame-cancel-narrow-dark.png");
  });

  test("the job editor with its actions in place", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, layout: "grid", config: BASE });
    await act(page, card.locator(".voc-primary-action"));
    expect(await cardHeight(card)).toBe(FRAMED);
    await expect(card.locator(".voc-overlay-scroll"), "the everyday fields fit the frame").not.toHaveAttribute("data-overflow-bottom", "");
    await act(page, card.locator('[data-key="group:more"] .voc-disclosure'));
    await expect(card.locator(".voc-overlay-scroll")).toHaveAttribute("data-overflow-bottom", "");
    await expect(card.locator(".voc-overlay-actions")).toBeInViewport({ ratio: 1 });
    await shot(page, "frame-editor-medium-light.png", MEDIUM);
  });

  test("the robot editor scrolled to its middle", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS_IDLE, layout: "grid", config: BASE });
    await open(page, card, "robots");
    for (const step of fromMenu(card, ".voc-robot", "Rocky", '[data-action="edit-robot"]')) await act(page, step);
    await scrollTo(card, ".voc-overlay-scroll", 0.5);
    await expect(card.locator(".voc-overlay-scroll")).toHaveAttribute("data-overflow-bottom", "");
    await shot(page, "frame-robot-editor-medium-light.png", MEDIUM);
  });

  test("not installed, narrow", async ({ page }) => {
    const card = await mountCard(page, { ...NOT_INSTALLED, layout: "grid", config: BASE });
    await setCardWidth(page, NARROW);
    const [box, body] = [await card.locator(".voc-onboarding").boundingBox(), await card.locator(".voc-body").boundingBox()];
    expect(Math.abs(box.y - body.y - (body.y + body.height - box.y - box.height)), "the guide is centred").toBeLessThan(24);
    await shot(page, "frame-onboarding-not-installed-narrow-light.png");
  });

  test.describe("on a touch screen", () => {
    test.use({ hasTouch: true, viewport: { width: 1280, height: 1100 } });

    test("the queue scrolled to its end, narrow", async ({ page }) => {
      const card = await mountCard(page, { ...BUSY, layout: "grid", config: BASE });
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
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, page_size: 1 } });
    await expect(card.locator(".voc-warning-text")).toContainText("page_size");
    await shot(page, "warning-medium-light.png", MEDIUM);
  });

  test("one view without a tab strip, custom header", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, views: ["rooms"], title: "Downstairs", icon: "mdi:home-floor-0", show: { panel: false } } });
    await expect(card.locator(".voc-tabs")).toHaveCount(0);
    await expect(card.locator(".voc-title")).toHaveText("Downstairs");
    const [pill, action] = [await card.locator(".voc-status-pill").boundingBox(), await card.locator(".voc-header-action").boundingBox()];
    expect(Math.abs(pill.y + pill.height / 2 - (action.y + action.height / 2)), "the primary action ends the header row").toBeLessThanOrEqual(1);
    expect(action.x).toBeGreaterThan(pill.x + pill.width);
    await shot(page, "single-view-medium-light.png", MEDIUM);
  });

  test("two cards side by side", async ({ page }) => {
    await mountCard(page, { ...BUSY, width: 420, configs: [{ ...BASE, views: ["queue", "rooms"] }, { ...BASE, views: ["robots", "history"], start_view: "robots", show: { panel: false } }] });
    expect(await page.evaluate(() => window.vocHarness.backend.calls.filter((message) => message.type === "vacuum_orchestrator/subscribe").length)).toBe(1);
    await shot(page, "two-cards-light.png");
  });
});

// Large text (125 %, as the browser's zoom gives it) still wraps inside the card: no element
// reaches past its edge and nothing scrolls sideways, except the tab strip, which scrolls by design.
test.describe("large text", () => {
  test("the queue at 125 %, narrow, German", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, config: { ...BASE, language: "de" } });
    await page.evaluate(() => {
      for (const element of window.vocHarness.cards) Object.assign(element.style, { width: "304px", zoom: "1.25" });
    });
    await waitForStableLayout(page);
    const overflow = await card.evaluate((element) => {
      const root = element.shadowRoot.querySelector(".voc-root");
      const edge = element.getBoundingClientRect().right + 0.5;
      const past = [...element.shadowRoot.querySelectorAll("*")]
        .filter((node) => !node.closest(".voc-tabs") && node.getClientRects().length && node.getBoundingClientRect().right > edge)
        .map((node) => node.className || node.tagName);
      const cut = [...element.shadowRoot.querySelectorAll(".voc-job-title")].filter((title) => title.scrollWidth > title.clientWidth + 1).map((title) => title.textContent);
      return { sideways: root.scrollWidth > root.clientWidth, past, cut };
    });
    expect(overflow).toEqual({ sideways: false, past: [], cut: [] });
    // In so little room a row's main action shows its icon; its label stays its accessible name.
    await expect(named(card, ".voc-job", "Conservatory", ".voc-job-main-action")).toHaveAccessibleName("Freigeben …");
    await shot(page, "queue-large-text-german-narrow-light.png");
  });
});
