"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PORT = Number(process.env.PORT) || 4173;
// The harness self-hosts its font, so woff2 needs a real type: a browser refuses a font
// served as application/octet-stream.
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const safe = path.normalize(requestPath).replace(/^([/\\.]\.[/\\])+/u, "");
  const file = path.join(ROOT, safe);
  if (!file.startsWith(ROOT)) { response.writeHead(403); response.end("Forbidden"); return; }
  fs.readFile(file, (error, data) => { if (error) { response.writeHead(404); response.end("Not found"); return; } response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }); response.end(data); });
});
server.listen(PORT, () => console.log(`static-server listening on http://localhost:${PORT}`));
