"use strict";

const { defineConfig, devices } = require("@playwright/test");
const PORT = 4173;

module.exports = defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.spec.js",
  workers: 2,
  retries: 0,
  reporter: process.env.CI ? "list" : "dot",
  // Screenshots record formatted timestamps, so the engine's clock context is pinned rather
  // than inherited from whichever machine runs the suite.
  use: { baseURL: `http://localhost:${PORT}`, timezoneId: "UTC", locale: "en-US" },
  expect: { toHaveScreenshot: { maxDiffPixels: 200 } },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-core", testMatch: /core[\\/].*\.spec\.js/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-core", testMatch: /core[\\/].*\.spec\.js/, use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node test/helpers/static-server.js",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
