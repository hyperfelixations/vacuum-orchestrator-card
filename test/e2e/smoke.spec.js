// The card in the real Home Assistant frontend: only the seams the harness stands in for — the
// card loading as a dashboard resource, the real `hass` object and its websocket, the sections
// grid, the image proxy. What the card says and does is covered by the recordings of the real
// integration (internal dev doc §10). The cases share one host and run in order.

const fs = require("node:fs");
const { test, expect } = require("@playwright/test");
const { HOST_FILE } = require("./host.js");

const READY_MS = 30_000;

function host() {
  const { url, session } = JSON.parse(fs.readFileSync(HOST_FILE, "utf8"));
  return { origin: new URL(url).origin, session: JSON.parse(fs.readFileSync(session, "utf8")) };
}

// Signs in as the host's owner before the frontend loads: Home Assistant takes stored tokens
// whose `hassUrl` is the page's origin (frontend `loadTokens`, js-websocket `getAuth`).
async function openDashboard(page) {
  const { origin, session } = host();
  const tokens = {
    hassUrl: origin,
    clientId: session.client_id,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires: Date.now() + session.expires_in * 1000,
  };
  await page.addInitScript((stored) => window.localStorage.setItem("hassTokens", JSON.stringify(stored)), tokens);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.stack || error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} ${message.location().url}`);
  });
  await page.goto(`${origin}/lovelace/voi`);
  const card = page.locator("vacuum-orchestrator-card");
  await expect(card.locator(".voc-panel")).toBeVisible({ timeout: READY_MS });
  return { card, errors };
}

function cardErrors(errors) {
  return errors.filter((entry) => entry.includes("vacuum-orchestrator-card"));
}

// What the frontend's own connection answers; the tests use it only to steer the simulator.
function callWS(page, message) {
  return page.evaluate((payload) => document.querySelector("home-assistant").hass.callWS(payload), message);
}

test.describe.serial("[ha-frontend] smoke", () => {
  test("[ha-frontend] the card loads on the dashboard, keeps its height and shows the robot's map", async ({ page }) => {
    const { card, errors } = await openDashboard(page);
    expect(await page.evaluate(() => Boolean(customElements.get("vacuum-orchestrator-card")))).toBe(true);
    await expect(card.locator(".voc-panel-robot")).toContainText("Rocky");
    const frame = card.locator("ha-card");
    const resting = (await frame.boundingBox()).height;
    await card.locator('[role="tab"][data-view="robots"]').click();
    const picture = card.locator(".voc-robot-map img").first();
    await expect.poll(() => picture.evaluate((image) => image.complete && image.naturalWidth), { timeout: READY_MS }).toBeGreaterThan(0);
    await card.locator('[data-action="edit-robot"]').first().click();
    await expect(card.locator(".voc-overlay")).toBeVisible();
    expect(Math.abs((await frame.boundingBox()).height - resting), "a page keeps the card's height (LAY-17)").toBeLessThanOrEqual(1);
    await card.locator('.voc-overlay [data-action="back"]').first().click();
    await expect(card.locator(".voc-overlay")).toHaveCount(0);
    expect(cardErrors(errors)).toEqual([]);
  });

  test("[ha-frontend] a job created in the editor reaches the integration and waits for its room", async ({ page }) => {
    const { card, errors } = await openDashboard(page);
    await card.locator('[role="tab"][data-view="queue"]').click();
    // An empty queue offers the editor in its body, a filled one in the tab row (UI-19).
    await card.locator('[data-action="create-job"]').first().click();
    await expect(card.locator('.voc-overlay[data-key="overlay:job-editor"]')).toBeVisible();
    await card.locator('[data-key="field:roomIds"] .voc-option', { hasText: "Dining Room" }).click();
    await card.locator('[data-action="save-draft"]').click();
    await expect(card.locator(".voc-overlay")).toHaveCount(0, { timeout: READY_MS });
    // Rooms start locked, so the new job waits and offers to release its room.
    const row = card.locator(".voc-job", { hasText: "Dining Room" }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('[data-action="open-release"]')).toBeVisible();
    const queue = await callWS(page, { type: "vacuum_orchestrator/queue/get", offset: 0, limit: 25 });
    expect(queue.jobs.length, "the integration holds the job the card shows").toBeGreaterThan(0);
    expect(cardErrors(errors)).toEqual([]);
  });

  test("[ha-frontend] the card keeps its state over a reload and comes back after the connection drops", async ({ page }) => {
    let { card, errors } = await openDashboard(page);
    await card.locator('[role="tab"][data-view="queue"]').click();
    const before = await card.locator(".voc-job").count();
    await page.reload();
    card = page.locator("vacuum-orchestrator-card");
    await expect(card.locator(".voc-panel")).toBeVisible({ timeout: READY_MS });
    await card.locator('[role="tab"][data-view="queue"]').click();
    await expect(card.locator(".voc-job")).toHaveCount(before);
    // The frontend reconnects by itself; the card follows the new connection.
    await page.evaluate(() => document.querySelector("home-assistant").hass.connection.socket.close());
    await expect.poll(() => page.evaluate(() => document.querySelector("home-assistant").hass.connected), { timeout: READY_MS }).toBe(true);
    await callWS(page, { type: "voi_e2e/robot", robot: "Rocky", stimulus: "set", key: "battery", value: "42" });
    await expect(card.locator(".voc-panel-robot")).toContainText(/42\s?%/, { timeout: READY_MS });
    errors = cardErrors(errors);
    expect(errors).toEqual([]);
  });
});
