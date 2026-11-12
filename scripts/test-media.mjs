#!/usr/bin/env node
/**
 * Offline tests for api/media.js (the /media/<path> image function).
 *
 * Runs the real handler behind a local HTTP server, against a stub of the
 * Supabase public-object endpoint. No network, no real storage.
 *
 *   node scripts/test-media.mjs      (npm run test:media-fn)
 */

import fs from "node:fs";
import http from "node:http";

/* ------------------------------------------------------ stub Supabase */

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");

let upstreamRequests = [];
const OBJECTS = {
  "c/photo.jpg": { type: "image/jpeg", body: JPEG },
  "channels/4/banner_1_x.png": { type: "image/png", body: PNG },
  "evil.svg": { type: "image/svg+xml", body: SVG },
  "fake.jpg": { type: "image/jpeg", body: HTML }, // claims jpeg, is HTML
  "page.html": { type: "text/html", body: HTML },
  "big.jpg": { type: "image/jpeg", body: Buffer.concat([JPEG, Buffer.alloc(4_100_000)]) },
  "big-chunked.jpg": { type: "image/jpeg", body: Buffer.concat([JPEG, Buffer.alloc(4_100_000)]), chunked: true },
};

const supabase = http.createServer((req, res) => {
  upstreamRequests.push(req.url);
  const prefix = "/storage/v1/object/public/article-images/";
  const key = req.url.startsWith(prefix) ? decodeURIComponent(req.url.slice(prefix.length)) : null;
  const obj = key && OBJECTS[key];
  if (!obj) {
    res.writeHead(400, { "content-type": "application/json" });
    return res.end('{"statusCode":"404","error":"not_found"}');
  }
  const headers = {
    "content-type": obj.type,
    "x-robots-tag": "none",
    "set-cookie": "sb=1",
    etag: '"abc"',
  };
  if (!obj.chunked) headers["content-length"] = String(obj.body.length);
  res.writeHead(200, headers);
  res.end(obj.body);
});
await new Promise((r) => supabase.listen(0, "127.0.0.1", r));
process.env.SUPABASE_URL = `http://127.0.0.1:${supabase.address().port}`;

/* ------------------------------------------------------ the function */

const { default: handler, sniffImageType, isValidMediaPath } = await import("../api/media.js");

// It must import nothing at all (no npm, no shared modules).
const source = fs.readFileSync(new URL("../api/media.js", import.meta.url), "utf8");

const app = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    res.statusCode = 599;
    res.end(String(err));
  });
});
await new Promise((r) => app.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.address().port}`;

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const get = (p, method = "GET") => fetch(base + p, { method, redirect: "manual" });

console.log("\nmedia function:");

check("imports nothing", !/^\s*import\s/m.test(source) && !/\brequire\(/.test(source));

// Happy path.
let r = await get("/media/c/photo.jpg?x=1");
let body = Buffer.from(await r.arrayBuffer());
check("jpeg → 200", r.status === 200, String(r.status));
check("bytes served unchanged", body.equals(JPEG));
check("content-type from upstream", r.headers.get("content-type") === "image/jpeg");
check(
  "one-year immutable cache",
  r.headers.get("cache-control") === "public, max-age=31536000, s-maxage=31536000, immutable",
  r.headers.get("cache-control")
);
check("nosniff", r.headers.get("x-content-type-options") === "nosniff");
check("sandbox CSP", r.headers.get("content-security-policy") === "default-src 'none'; sandbox");
check("CORS open", r.headers.get("access-control-allow-origin") === "*");
check("x-robots-tag not forwarded", !r.headers.get("x-robots-tag"));
check("set-cookie not forwarded", !r.headers.get("set-cookie"));
check(
  "upstream is the public object URL",
  upstreamRequests.at(-1) === "/storage/v1/object/public/article-images/c/photo.jpg",
  upstreamRequests.at(-1)
);

r = await get("/media/channels/4/banner_1_x.png");
check("nested path png → 200", r.status === 200 && r.headers.get("content-type") === "image/png");

r = await get("/media/c/photo.jpg", "HEAD");
check("HEAD → 200 with no body", r.status === 200 && (await r.arrayBuffer()).byteLength === 0);

r = await get("/media/c/photo.jpg", "POST");
check("POST → 405", r.status === 405);

// Fallback: path from the query (rewrite to /api/media.js?path=…).
r = await get("/api/media.js?path=c%2Fphoto.jpg");
check("path from query → 200", r.status === 200, String(r.status));

// Validation.
upstreamRequests = [];
for (const bad of [
  "/media/../etc/passwd",
  "/media/c/..%2F..%2Fsecret.jpg",
  "/media/%2e%2e/x.jpg",
  "/media//abs.jpg",
  "/media/a%20b.jpg",
  "/media/a<b>.jpg",
  `/media/${"a".repeat(301)}`,
  "/media/",
]) {
  r = await get(bad);
  check(`rejects ${bad.slice(0, 40)} → 400`, r.status === 400, String(r.status));
}
check("rejected paths never reach storage", upstreamRequests.length === 0, upstreamRequests.join(","));

// Missing object: 404 cached briefly.
r = await get("/media/missing.jpg");
check("missing → 404", r.status === 404);
check("404 cached 60 s", r.headers.get("cache-control") === "public, max-age=60", r.headers.get("cache-control"));

// Wrong types.
r = await get("/media/evil.svg");
check("SVG → 415", r.status === 415, String(r.status));
r = await get("/media/page.html");
check("HTML → 415", r.status === 415);
r = await get("/media/fake.jpg");
check("HTML claiming to be jpeg (magic bytes) → 415", r.status === 415, String(r.status));
check("415 body is not the upstream body", !(await r.text()).includes("<script>"));

// Oversize: redirect to the public URL.
r = await get("/media/big.jpg");
check("over 4 MB → 302", r.status === 302, String(r.status));
check(
  "redirects to the public Supabase URL",
  r.headers.get("location") === `${process.env.SUPABASE_URL}/storage/v1/object/public/article-images/big.jpg`,
  r.headers.get("location")
);
check("redirect cached a day", r.headers.get("cache-control") === "public, max-age=86400");
r = await get("/media/big-chunked.jpg");
check("over 4 MB without content-length → 302", r.status === 302, String(r.status));

// Magic bytes.
check("sniff jpeg", sniffImageType(JPEG) === "image/jpeg");
check("sniff svg → null", sniffImageType(SVG) === null);
check("sniff webp", sniffImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")) === "image/webp");
check("sniff avif", sniffImageType(Buffer.from("\0\0\0\x1cftypavif\0\0")) === "image/avif");
check("path validator", isValidMediaPath("c/a.jpg") && !isValidMediaPath("a/../b") && !isValidMediaPath("/a"));

app.close();
supabase.close();
console.log("");
if (failures) {
  console.error(`test-media: ${failures} failure(s).\n`);
  process.exit(1);
}
console.log("test-media: all checks passed.\n");
