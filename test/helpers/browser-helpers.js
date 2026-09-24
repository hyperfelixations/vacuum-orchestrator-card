"use strict";
// Mounts the real card in a real browser against the production-faithful harness. The page
// gets a small `hass` stub that answers the card's WebSocket queries from wire pages this
// module builds in Node, so a browser test exercises the whole card — element, backend port,
// model, sections — not a fragment of it.

const fs = require("node:fs");
const path = require("node:path");
const { expect } = require("@playwright/test");
const { wireJob, wireJobListPage, wireQueuePage, wireArea, wireRobot } = require("../fixtures/wire.js");

const COVERAGE_DIR = process.env.VACUUM_ORCHESTRATOR_CARD_BROWSER_COVERAGE_DIR || "";

// The card reads the clock through its platform adapter, so the page keeps a fixed one: the
// fixtures are dated against it and a golden must not change with the day it is recorded.
const FIXED_NOW = Date.UTC(2026, 8, 17, 12, 0, 0);

const AREAS = {
  kitchen: { area_id: "kitchen", name: "Kitchen", icon: "mdi:floor-plan" },
  hall: { area_id: "hall", name: "Hall", icon: "mdi:floor-plan" },
  bathroom: { area_id: "bathroom", name: "Bathroom", icon: "mdi:floor-plan" },
  living_room: { area_id: "living_room", name: "Living room", icon: "mdi:floor-plan" },
};

const DEFAULT_JOBS = Object.freeze([
  wireJob({
    job_id: "job-1",
    name: "Kitchen and hall",
    areas: ["kitchen", "hall"],
    mode: "vacuum_then_mop",
    vacuum_power: "high",
    mop_intensity: "medium",
    mop_route: "standard",
    passes: 2,
    source: "Dashboard",
    readiness: { state: "ready", failed_on: [], failed_off: [], unknown: [] },
  }),
  wireJob({
    job_id: "job-2",
    name: "Bathroom",
    areas: ["bathroom"],
    mode: "mop",
    mop_intensity: "standard",
    mop_route: "deep",
    source: "Routine",
    settings_policy: "strict",
    readiness: { state: "blocked", failed_on: ["binary_sensor.door"], failed_off: [], unknown: [] },
  }),
]);

const RUNNING_JOB = wireJob({ job_id: "job-active", state: "running", name: "Living room", areas: ["living_room"], mode: "vacuum" });

const FINISHED_JOBS = Object.freeze([
  wireJob({
    job_id: "job-done",
    name: "Hall",
    areas: ["hall"],
    mode: "vacuum",
    state: "completed",
    source: "Routine",
    started_at: "2026-09-17T09:00:00Z",
    finished_at: "2026-09-17T09:26:00Z",
  }),
  wireJob({
    job_id: "job-failed",
    name: "Bathroom",
    areas: ["bathroom"],
    mode: "mop",
    state: "failed",
    source: "Dashboard",
    failure_code: "robot_needs_attention",
    started_at: "2026-09-16T18:00:00Z",
    finished_at: "2026-09-16T18:04:00Z",
  }),
]);

// The responses the in-page stub serves, assembled here so the browser side stays trivial.
function backendData({ jobs = DEFAULT_JOBS, registry = null, target = false, mode = "running", installed = true } = {}) {
  const active = mode === "running" ? [RUNNING_JOB] : [];
  return {
    installed,
    target,
    queue: wireQueuePage(jobs, { mode, total: jobs.length }),
    history: wireJobListPage(registry || [...active, ...jobs, ...FINISHED_JOBS]),
    robots: {
      api_version: 2,
      robots: [wireRobot({ active_job_id: active.length ? "job-active" : null, active_area_id: active.length ? "living_room" : null })],
    },
    areas: {
      api_version: 2,
      areas: [
        wireArea(),
        wireArea({ area_id: "hall", due_state: "vacuum_due", vacuum_due_at: "2026-09-17T06:00:00Z" }),
        wireArea({
          area_id: "bathroom",
          due_state: "both_due",
          release_entity_id: "input_boolean.bathroom_release",
          blocking_entity_ids: ["binary_sensor.door"],
        }),
      ],
    },
  };
}

async function gotoHarness(page) {
  await page.addInitScript((fixed) => {
    const RealDate = Date;
    function FixedDate(...args) {
      return args.length ? new RealDate(...args) : new RealDate(fixed);
    }
    FixedDate.prototype = RealDate.prototype;
    FixedDate.now = () => fixed;
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    window.Date = FixedDate;
  }, FIXED_NOW);
  await page.goto("/test/fixtures/harness.html");
}

// The stage shrink-wraps its content, so a card without a width would lay itself out at its
// own max-content width — different per fixture and wider than the viewport. Every mount
// therefore starts at one deterministic width; a test that cares picks another with
// setCardWidth.
const MOUNT_WIDTH = 640;

// Installs the stub and creates the card, in Home Assistant's own call order.
async function mountCard(page, { config = {}, data = backendData(), areas = AREAS, isAdmin = true, connected = true, width = MOUNT_WIDTH } = {}) {
  await gotoHarness(page);
  await page.evaluate(
    ({ config, data, areas, isAdmin, connected, width }) => {
      const calls = [];
      window.__vocCalls = calls;
      const unknown = (type) => Promise.reject(Object.assign(new Error(type), { code: "unknown_command" }));
      const offline = () => Promise.reject(Object.assign(new Error("connection_lost"), { code: "connection_lost" }));
      const hass = {
        states: {
          "binary_sensor.door": { entity_id: "binary_sensor.door", state: "off", attributes: { friendly_name: "Hall door" } },
          "input_boolean.bathroom_release": {
            entity_id: "input_boolean.bathroom_release",
            state: "on",
            attributes: { friendly_name: "Bathroom released" },
          },
        },
        entities: {},
        areas,
        services: {
          vacuum_orchestrator: Object.fromEntries(
            ["create_job", "update_job", "delete_job", "move_job", "start_job", "cancel_job", "retry_job", "run_queue", "pause_queue", "resume_queue"].map((name) => [name, {}])
          ),
        },
        config: { components: data.installed ? ["vacuum_orchestrator"] : [], time_zone: "UTC" },
        user: { is_admin: isAdmin },
        locale: { language: config.language || "en" },
        language: config.language || "en",
        connection: { subscribeMessage: async () => () => {} },
        callWS: (message) => {
          calls.push({ kind: "ws", type: message.type });
          if (!connected) return offline();
          // A backend that offers the target contract announces it; today's answers nothing.
          if (message.type === "vacuum_orchestrator/describe") {
            return data.target
              ? Promise.resolve({
                  api_version: 2,
                  integration_version: "0.2.0",
                  capabilities: ["queueRead", "jobRead", "jobsHistory", "liveSubscribe", "robotsRead", "areasRead", "jobProgress", "describe"],
                  limits: { max_page_size: 100, max_areas_per_job: 8, max_passes: 10 },
                })
              : unknown(message.type);
          }
          if (message.type === "vacuum_orchestrator/queue/get") return Promise.resolve(data.queue);
          if (message.type === "vacuum_orchestrator/jobs/list") return Promise.resolve(data.history);
          if (data.target && message.type === "vacuum_orchestrator/robots/list") return Promise.resolve(data.robots);
          if (data.target && message.type === "vacuum_orchestrator/areas/status") return Promise.resolve(data.areas);
          return unknown(message.type);
        },
        callService: (domain, service, serviceData) => {
          calls.push({ kind: "service", domain, service, data: serviceData });
          return Promise.resolve({ context: {} });
        },
        hassUrl: (value) => value,
      };
      const card = document.createElement("vacuum-orchestrator-card");
      card.style.width = `${width}px`;
      document.getElementById("stage").replaceChildren(card);
      card.setConfig(config);
      card.hass = hass;
      window.__vocCard = card;
      return card._backend?.connect();
    },
    { config, data, areas, isAdmin, connected, width }
  );
  // The shadow root is pierced automatically by Playwright selectors.
  await page.locator("vacuum-orchestrator-card .voc-root").waitFor();
  await waitForStableLayout(page, width);
  return page.locator("vacuum-orchestrator-card");
}

// Waits for the card to finish laying out by observing the mechanism, never a duration: the
// requested width is reached, the resize runtime has no measurement queued, the self-hosted
// font has settled, and the subtree's box sizes match across two consecutive frames.
async function waitForStableLayout(page, widthPx = null) {
  await expect
    .poll(
      async () =>
        page.evaluate(async (widthPx) => {
          const card = window.__vocCard;
          if (!card?.shadowRoot) return false;
          if (widthPx !== null && Math.round(card.getBoundingClientRect().width) !== widthPx) return false;
          if (card._resize?.hasPendingFrame?.()) return false;
          await document.fonts.ready;
          const read = () =>
            Array.from(card.shadowRoot.querySelectorAll("*"), (node) => {
              const rect = node.getBoundingClientRect();
              return `${rect.width},${rect.height}`;
            }).join("|");
          const before = read();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (card._resize?.hasPendingFrame?.()) return false;
          return read() === before;
        }, widthPx),
      { message: `the card never settled into a stable layout${widthPx === null ? "" : ` at ${widthPx}px`}` }
    )
    .toBe(true);
}

// The one entry point for "show this card at this width". The card sizes itself to its
// container, so the width belongs on the card, not on the viewport.
async function setCardWidth(page, widthPx) {
  await page.evaluate((widthPx) => {
    window.__vocCard.style.width = `${widthPx}px`;
  }, widthPx);
  await waitForStableLayout(page, widthPx);
}

function serviceCalls(page, service) {
  return page.evaluate((name) => (window.__vocCalls || []).filter((call) => call.kind === "service" && call.service === name), service);
}

async function startCoverage(page) {
  if (!COVERAGE_DIR) return;
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
}

async function stopCoverage(page, testInfo) {
  if (!COVERAGE_DIR) return;
  const entries = await page.coverage.stopJSCoverage();
  fs.mkdirSync(COVERAGE_DIR, { recursive: true });
  const name = `${testInfo.testId || testInfo.title.replace(/\W+/g, "-")}.json`;
  // merge-coverage.mjs reads each file as a bare list of V8 script entries.
  fs.writeFileSync(path.join(COVERAGE_DIR, name), JSON.stringify(entries), "utf8");
}

module.exports = {
  mountCard,
  gotoHarness,
  backendData,
  serviceCalls,
  setCardWidth,
  waitForStableLayout,
  startCoverage,
  stopCoverage,
  DEFAULT_JOBS,
  RUNNING_JOB,
  FINISHED_JOBS,
  AREAS,
  FIXED_NOW,
};
