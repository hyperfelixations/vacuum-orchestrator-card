"use strict";
// The browser harness's file server: loopback only, and only the files the harness and its tests
// request. A malformed or escaping path gets a status, never an exception. Started as a script by
// Playwright's web server and the README image script (internal dev doc §10).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
// The card's own port: Playwright never reuses a server already listening there, so a server of
// another checkout or project on the machine fails the run instead of serving foreign files.
const DEFAULT_PORT = 4273;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const HOST = "127.0.0.1";
// The harness self-hosts its font, so woff2 needs a real type: a browser refuses a font
// served as application/octet-stream.
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
// The harness and its fixtures, the recording player, the bundle under test and the icon paths
// its `ha-icon` stub draws.
const SERVED_PREFIXES = Object.freeze(["test/fixtures/"]);
const SERVED_FILES = Object.freeze(["test/helpers/recorded-backend.js", "dist/vacuum-orchestrator-card.js", "node_modules/@mdi/js/mdi.js"]);

// `{ status, file }` for a request URL: 400 for an undecodable path, 403 for one outside the
// checkout, 404 for one the harness does not use.
function resolveRequest(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl || "/", "http://localhost").pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes("\0")) return { status: 400 };
  const file = path.resolve(ROOT, `.${pathname}`);
  const relative = path.relative(ROOT, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return { status: 403 };
  const key = relative.split(path.sep).join("/");
  const served = SERVED_FILES.includes(key) || SERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
  return served ? { status: 200, file } : { status: 404 };
}

function respond(request, response) {
  const { status, file } = resolveRequest(request.url);
  if (status !== 200) {
    response.writeHead(status);
    response.end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    response.end(data);
  });
}

const createStaticServer = () => http.createServer(respond);

if (require.main === module) {
  createStaticServer().listen(PORT, HOST, () => console.log(`static-server listening on http://${HOST}:${PORT}`));
}

module.exports = { DEFAULT_PORT, HOST, createStaticServer, resolveRequest };
