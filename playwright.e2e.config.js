"use strict";

// The smoke test in the real Home Assistant frontend (internal dev doc §10 "Smoke-Test"): one
// Home Assistant process from the integration's E2E host, the built card on its dashboard, and
// three cases run one after another because they share the simulated robot.

const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.js",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "dot",
  globalSetup: require.resolve("./test/e2e/host.js"),
  // No trace or video: they would keep the owner's tokens of the throwaway instance (SEC-04).
  use: { ...devices["Desktop Chrome"], timezoneId: "UTC", locale: "en-US", trace: "off", video: "off" },
  projects: [{ name: "e2e" }],
});
