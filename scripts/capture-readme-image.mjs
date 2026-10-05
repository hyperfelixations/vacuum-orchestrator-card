// Records the README picture: the queue of the showcase household (everyday use, no special
// case) in light and dark, side by side, on the test harness with its fixed clock. Run with
// `npm run readme:image`; no test compares it.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "vacuum-orchestrator-card.png");
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const CARD_WIDTH = 640;

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { mountCard } = require("../test/helpers/browser-helpers.js");

async function waitForServer(attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await fetch(`${BASE_URL}/test/fixtures/harness.html`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`readme:image: the static server did not answer on ${BASE_URL}`);
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, "test", "helpers", "static-server.js")], { cwd: ROOT, stdio: "ignore" });
  const browser = await chromium.launch();
  try {
    await waitForServer();
    const context = await browser.newContext({ baseURL: BASE_URL, timezoneId: "UTC", locale: "en-US", viewport: { width: 2 * CARD_WIDTH + 200, height: 1200 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await mountCard(page, { scenario: "showcase", themes: ["light", "dark"], width: CARD_WIDTH, config: { time_format: "absolute" } });
    // Whole pixels on every edge: a fractional panel height lets the page background show as
    // a line under the picture.
    const stage = await page.evaluate(() => {
      const whole = Math.ceil(document.getElementById("stage").getBoundingClientRect().height);
      for (const panel of document.querySelectorAll(".voc-theme")) Object.assign(panel.style, { boxSizing: "border-box", height: `${whole}px` });
      const { x, y, width, height } = document.getElementById("stage").getBoundingClientRect();
      return [x, y, width, height];
    });
    if (!stage.every(Number.isInteger)) throw new Error(`readme:image: the stage is not on whole pixels (${stage.join(", ")})`);
    const backgrounds = await page.evaluate(() => window.vocHarness.cards.map((card) => getComputedStyle(card).getPropertyValue("--card-background-color").trim()));
    if (backgrounds.join() !== "#ffffff,#1c1c1c") throw new Error(`readme:image: the panels are not light and dark (${backgrounds.join(", ")})`);
    await page.locator("#stage").screenshot({ path: OUTPUT, animations: "disabled" });
    console.log(`readme:image: wrote ${path.relative(ROOT, OUTPUT)}`);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
