// What a view switch costs on a phone (UI-35): the built card in the test harness at a phone's
// width with touch and a throttled CPU, each view entered by a real tap, several rounds. Per view
// it prints the first visit and the median of the later ones: the tap until the next paint (Event
// Timing), until the view's content shows, script, style and layout time and count, and the
// card's nodes and icons. No test gates on these numbers. Usage, after `npm run build`:
// `npm run perf -- [--rate 4] [--width 380] [--rounds 5] [--language de]`. See internal dev doc §10.

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createStaticServer, HOST } = require("../test/helpers/static-server.js");

const VIEWS = ["queue", "rooms", "robots", "templates", "history", "settings"];
const MAP_PICTURE = path.join(ROOT, "test", "fixtures", "map.svg");

export function parseArguments(argv) {
  const options = { rate: 4, width: 380, rounds: 5, language: "de" };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.replace(/^--/, "");
    if (!Object.hasOwn(options, name)) throw new Error(`measure-performance: unknown option ${argv[index]}`);
    options[name] = name === "language" ? String(argv[index + 1]) : Number(argv[index + 1]);
    if (name !== "language" && !(options[name] > 0)) throw new Error(`measure-performance: --${name} needs a positive number`);
  }
  return options;
}

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function measure({ rate, width, rounds, language }) {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, timezoneId: "UTC", locale: "en-US" });
    const page = await context.newPage();
    // The recording's clock for the card, the real one for the measurement.
    await page.addInitScript(() => {
      window.__realNow = performance.now.bind(performance);
      const RealDate = Date;
      const now = () => window.__vocNow ?? RealDate.now();
      function FixedDate(...args) {
        return args.length ? new RealDate(...args) : new RealDate(now());
      }
      FixedDate.prototype = RealDate.prototype;
      FixedDate.now = now;
      FixedDate.parse = RealDate.parse;
      FixedDate.UTC = RealDate.UTC;
      window.Date = FixedDate;
      performance.now = now;
      window.__vocTaps = [];
      new PerformanceObserver((list) => window.__vocTaps.push(...list.getEntries().filter((entry) => entry.interactionId).map((entry) => entry.duration))).observe({ type: "event", durationThreshold: 16 });
    });
    await page.route("**/api/image_proxy/**", (route) => route.fulfill({ path: MAP_PICTURE, contentType: "image/svg+xml" }));
    await page.goto(`http://${HOST}:${server.address().port}/test/fixtures/harness.html`);
    await page.evaluate((options) => window.vocHarness.mount(options), { recording: "showcase", from: "A busy afternoon", width, layout: "grid", config: { language, views: VIEWS } });
    await page.waitForFunction(() => {
      const root = window.vocHarness.cards[0]?.shadowRoot?.querySelector(".voc-root");
      return root && !root.querySelector('[data-phase="probing"]') && !root.querySelector(".voc-loading");
    });
    // The browser falls idle once after the card opened; the harness holds idle work until then.
    await page.evaluate(() => window.__vocIdle?.flush());
    await page.waitForTimeout(400);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]));
    const card = page.locator("vacuum-orchestrator-card").first();
    const samples = Object.fromEntries(VIEWS.map((view) => [view, []]));
    for (let round = 0; round < rounds; round += 1) {
      for (const view of [...VIEWS.slice(1), VIEWS[0]]) {
        await page.evaluate(() => (window.__vocTaps = []));
        const before = await metrics();
        const started = await page.evaluate(() => window.__realNow());
        await card.locator(`[role=tab][data-view="${view}"]`).tap();
        const content = await page.evaluate(async ([view, started]) => {
          const root = window.vocHarness.cards[0].shadowRoot;
          const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
          while (!root.querySelector(`.voc-body[data-body="view:${view}"]:not([data-stale])`) || root.querySelector(".voc-loading")) await frame();
          await frame();
          return window.__realNow() - started;
        }, [view, started]);
        // Answers the recording plays meanwhile render as well.
        await page.waitForTimeout(400);
        const after = await metrics();
        const shown = await page.evaluate(() => {
          const root = window.vocHarness.cards[0].shadowRoot;
          return { taps: window.__vocTaps, nodes: root.querySelectorAll("*").length, icons: root.querySelectorAll("ha-icon").length };
        });
        const delta = (name) => (after[name] - before[name]) * 1000;
        samples[view].push({ tap: Math.max(0, ...shown.taps), content, script: delta("ScriptDuration"), style: delta("RecalcStyleDuration"), styles: after.RecalcStyleCount - before.RecalcStyleCount, layout: delta("LayoutDuration"), layouts: after.LayoutCount - before.LayoutCount, nodes: shown.nodes, icons: shown.icons });
      }
    }
    return samples;
  } finally {
    await browser.close();
    server.close();
  }
}

function report(samples, options) {
  const fields = ["tap", "content", "script", "style", "styles", "layout", "layouts"];
  const round = (value) => (value === null ? "—" : String(Math.round(value)));
  const lines = [`CPU ${options.rate}×, card ${options.width} px, touch, ${options.language}, ${options.rounds} rounds; ms unless counted`, "", `| view | visit | ${fields.join(" | ")} | nodes | icons |`, `|---|---|${fields.map(() => "---:").join("|")}|---:|---:|`];
  for (const [view, list] of Object.entries(samples)) {
    const [first, ...later] = list;
    lines.push(`| ${view} | first | ${fields.map((field) => round(first[field])).join(" | ")} | ${first.nodes} | ${first.icons} |`);
    if (later.length) lines.push(`| ${view} | median | ${fields.map((field) => round(median(later.map((entry) => entry[field])))).join(" | ")} | ${later.at(-1).nodes} | ${later.at(-1).icons} |`);
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  measure(options).then(
    (samples) => console.log(report(samples, options)),
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
