"use strict";
// The browser harness's file server (internal dev doc §10): it listens on loopback only, serves
// exactly the files the harness asks for, and answers a malformed or escaping path with a status
// instead of an exception.

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_PORT, HOST, createStaticServer, resolveRequest } = require("../helpers/static-server.js");

// Several checkouts and projects of the workspace serve a harness on this machine; reusing a server
// already listening would test their files.
test("Playwright starts its own server on the card's own port and never reuses one", () => {
  const config = require("../../playwright.config.js");
  assert.equal(config.webServer.reuseExistingServer, false);
  assert.equal(config.webServer.url, `http://${HOST}:${DEFAULT_PORT}/test/fixtures/harness.html`);
  assert.deepEqual(config.webServer.env, { PORT: String(DEFAULT_PORT) });
  assert.equal(config.use.baseURL, `http://${HOST}:${DEFAULT_PORT}`);
});

test("the harness, its fixtures, the recording player, the bundle and the icon paths are served", () => {
  for (const url of [
    "/test/fixtures/harness.html",
    "/test/fixtures/harness.html?probe=1",
    "/test/fixtures/fonts/roboto.css",
    "/test/fixtures/voi/recordings/showcase.json",
    "/test/helpers/recorded-backend.js",
    "/dist/vacuum-orchestrator-card.js",
    "/node_modules/@mdi/js/mdi.js",
  ]) {
    assert.equal(resolveRequest(url).status, 200, url);
  }
});

test("nothing else of the checkout is served", () => {
  for (const url of ["/", "/package.json", "/src/index.js", "/test/helpers/static-server.js", "/test/fixtures", "/.git/config", "/node_modules/jsdom/package.json", "/test/fixtures-other/x.js"]) {
    assert.equal(resolveRequest(url).status, 404, url);
  }
});

test("a path that leaves the checkout is refused", () => {
  for (const url of ["/test/fixtures/..%2F..%2F..%2Foutside.txt", "/..%2Foutside.txt"]) {
    assert.equal(resolveRequest(url).status, 403, url);
  }
  // The URL parser resolves plain and encoded dot segments before the server sees them.
  for (const url of ["/../outside.txt", "/%2e%2e/%2e%2e/outside.txt", "/test/fixtures/..%5C..%5C..%5Coutside.txt"]) {
    assert.notEqual(resolveRequest(url).status, 200, url);
  }
});

test("a malformed escape or a null byte is a bad request", () => {
  for (const url of ["/%ZZ", "/test/fixtures/%E0%A4%A", "/test/fixtures/harness.html%00"]) {
    assert.equal(resolveRequest(url).status, 400, url);
  }
});

test("the server listens on loopback only and answers every case without failing", async () => {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  try {
    const { address, port } = server.address();
    assert.equal(address, "127.0.0.1");
    const status = async (url) => (await fetch(`http://127.0.0.1:${port}${url}`)).status;
    assert.equal(await status("/%ZZ"), 400);
    assert.equal(await status("/package.json"), 404);
    const harness = await fetch(`http://127.0.0.1:${port}/test/fixtures/harness.html`);
    assert.equal(harness.status, 200);
    assert.equal(harness.headers.get("content-type"), "text/html; charset=utf-8");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
