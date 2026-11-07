"use strict";

const { defineConfig, devices } = require("@playwright/test");
const { DEFAULT_PORT: PORT } = require("./test/helpers/static-server.js");
// A cold engine on a shared runner: one browser at a time, more time (internal dev doc §10).
const CROSS_ENGINE = { workers: 1, timeout: 60_000, expect: { timeout: 15_000 } };

module.exports = defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.spec.js",
  workers: 2,
  retries: 0,
  reporter: process.env.CI ? "list" : "dot",
  // Screenshots record formatted timestamps, so the engine's clock context is pinned rather
  // than inherited from whichever machine runs the suite.
  // The static server listens on loopback only (test/helpers/static-server.js).
  use: { baseURL: `http://127.0.0.1:${PORT}`, timezoneId: "UTC", locale: "en-US" },
  expect: { toHaveScreenshot: { maxDiffPixels: 200 } },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-core", testMatch: /core[\\/].*\.spec\.js/, ...CROSS_ENGINE, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-core", testMatch: /core[\\/].*\.spec\.js/, ...CROSS_ENGINE, use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node test/helpers/static-server.js",
    url: `http://127.0.0.1:${PORT}/test/fixtures/harness.html`,
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
  },
});
