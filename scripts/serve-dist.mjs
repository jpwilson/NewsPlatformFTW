#!/usr/bin/env node
/**
 * Serve dist/public the way Vercel does, for local verification:
 * filesystem first (including `/<path>/index.html` for clean URLs), then the
 * SPA shell app.html for the app routes in shared/spa-routes.js, then a real
 * 404 for anything else. Mirrors the routing in vercel.json.
 *
 *   npm run build && node scripts/serve-dist.mjs [port]
 *
 * API routes are not served here — this is for checking the static output
 * (prerendered pages, robots.txt, llms*.txt) and for screenshots.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isSpaRoute } from "../shared/spa-routes.js";
import { notFoundHtml } from "../api/not-found.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "dist", "public");
const PORT = Number(process.argv[2] || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  if (clean.includes("..")) return null;
  const base = path.join(ROOT, clean);
  for (const candidate of [base, `${base}.html`, path.join(base, "index.html")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

http
  .createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    const pathname = decodeURIComponent(url);

    // trailingSlash: false — /about/ redirects to /about
    if (pathname.length > 1 && pathname.endsWith("/")) {
      res.writeHead(308, { location: pathname.replace(/\/+$/, "") });
      res.end();
      return;
    }

    const file = resolveFile(url);
    if (file) {
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(fs.readFileSync(file));
      return;
    }

    if (isSpaRoute(pathname)) {
      res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
      res.end(fs.readFileSync(path.join(ROOT, "app.html")));
      return;
    }

    res.writeHead(404, {
      "content-type": TYPES[".html"],
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    });
    res.end(notFoundHtml(pathname));
  })
  .listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
