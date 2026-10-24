#!/usr/bin/env node
/**
 * Asserts that the built output in dist/public is actually crawlable.
 *
 * For every prerendered marketing page it checks that the raw HTML — with no
 * JavaScript executed — has a unique title, a meta description, an absolute
 * self-referencing canonical, exactly one <h1>, JSON-LD that parses, more than
 * 300 words of visible text, and a <html lang> attribute. It also checks
 * robots.txt, llms.txt, llms-full.txt, app.html and the IndexNow key file.
 *
 * It then boots scripts/serve-dist.mjs (the local mirror of the vercel.json
 * routing) and checks real HTTP responses: marketing pages at their canonical
 * slashless URLs, the SPA shell for app routes, and genuine 404s for unknown
 * routes and missing files rather than soft 404s.
 *
 *   npm run build && node scripts/check-seo.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SPA_ROUTES } from "../shared/spa-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "dist", "public");
const SITE = "https://www.newsplatform.org";

const PAGES = [
  "/",
  "/about",
  "/how-it-works",
  "/for-writers",
  "/faq",
  "/compare",
  "/compare/substack",
  "/compare/medium",
  "/compare/ghost",
  "/alternatives",
];

let failures = 0;
const titles = new Map();
const descriptions = new Map();

function fail(where, msg) {
  failures++;
  console.error(`  ✗ ${where}: ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function read(rel) {
  const full = path.join(OUT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

/** Visible word count: strip script/style/noscript/svg, then all tags. */
function wordCount(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

function checkPage(route) {
  const rel = route === "/" ? "index.html" : `${route.replace(/^\//, "")}/index.html`;
  const html = read(rel);
  const where = route;
  if (!html) return fail(where, `missing built file dist/public/${rel}`);

  if (!/<html[^>]+lang="en"/.test(html)) fail(where, "no <html lang> attribute");

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim();
  if (!title) fail(where, "no <title>");
  else if (titles.has(title)) fail(where, `duplicate <title> (also on ${titles.get(title)})`);
  else titles.set(title, route);

  const desc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/)?.[1];
  if (!desc) fail(where, "no meta description");
  else {
    if (desc.length < 80 || desc.length > 200)
      fail(where, `meta description is ${desc.length} chars (want 80–200)`);
    if (descriptions.has(desc))
      fail(where, `duplicate meta description (also on ${descriptions.get(desc)})`);
    else descriptions.set(desc, route);
  }

  const canonicals = [...html.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/g)].map(
    (m) => m[1]
  );
  const expected = `${SITE}${route === "/" ? "/" : route}`;
  if (canonicals.length !== 1) fail(where, `${canonicals.length} canonical tags (want 1)`);
  else if (canonicals[0] !== expected)
    fail(where, `canonical is ${canonicals[0]}, expected ${expected}`);

  const h1s = [...html.matchAll(/<h1[\s>]/g)].length;
  if (h1s !== 1) fail(where, `${h1s} <h1> elements (want exactly 1)`);

  for (const tag of ["og:title", "og:description", "og:url", "og:image"]) {
    if (!html.includes(`property="${tag}"`)) fail(where, `missing ${tag}`);
  }
  if (!/name="twitter:card"/.test(html)) fail(where, "missing twitter:card");

  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  if (!blocks.length) fail(where, "no JSON-LD");
  for (const [, raw] of blocks) {
    try {
      const parsed = JSON.parse(raw);
      if (JSON.stringify(parsed).includes("aggregateRating"))
        fail(where, "JSON-LD contains aggregateRating (no real reviews exist)");
    } catch (e) {
      fail(where, `JSON-LD does not parse: ${e.message}`);
    }
  }

  const words = wordCount(html);
  if (words <= 300) fail(where, `only ${words} crawler-visible words (want > 300)`);

  if (failures === 0 || true) ok(`${route.padEnd(20)} ${String(words).padStart(4)} words — ${title}`);
}

function checkFile(rel, assertions) {
  const body = read(rel);
  if (!body) return fail(rel, "missing from dist/public");
  for (const [label, test] of assertions) {
    if (!test(body)) fail(rel, label);
  }
  ok(`${rel} (${body.length} bytes)`);
}

console.log("\nPages (raw HTML, no JavaScript):");
for (const route of PAGES) checkPage(route);

console.log("\nFiles:");
checkFile("robots.txt", [
  ["no absolute Sitemap: line", (b) => b.includes(`Sitemap: ${SITE}/sitemap.xml`)],
  ["GPTBot not explicitly allowed", (b) => /User-agent: GPTBot/.test(b)],
  ["OAI-SearchBot not explicitly allowed", (b) => /User-agent: OAI-SearchBot/.test(b)],
  ["Claude-SearchBot not explicitly allowed", (b) => /User-agent: Claude-SearchBot/.test(b)],
  ["PerplexityBot not explicitly allowed", (b) => /User-agent: PerplexityBot/.test(b)],
  ["bingbot not explicitly allowed", (b) => /User-agent: bingbot/.test(b)],
  ["Applebot not explicitly allowed", (b) => /User-agent: Applebot/.test(b)],
  ["blanket Disallow: / present", (b) => !/^Disallow: \/$/m.test(b)],
]);

checkFile("llms.txt", [
  ["looks like HTML, not text", (b) => !b.trimStart().startsWith("<")],
  ["too short", (b) => b.length > 500],
  ["does not link the key pages", (b) => b.includes(`${SITE}/faq`)],
  ["still calls the product an aggregator", (b) => !/is an independent news aggregator/.test(b)],
]);

checkFile("llms-full.txt", [
  ["looks like HTML, not text", (b) => !b.trimStart().startsWith("<")],
  ["too short to be the full text", (b) => b.split(/\s+/).length > 3000],
  ["missing a comparison page", (b) => b.includes("NewsPlatform vs Substack")],
]);

checkFile("sitemap-pages.xml", [
  ["not XML", (b) => b.trimStart().startsWith("<?xml")],
  ...PAGES.map((p) => [
    `missing ${p}`,
    (b) => b.includes(`<loc>${SITE}${p === "/" ? "/" : p}</loc>`),
  ]),
]);

checkFile("app.html", [
  ["SPA shell must not carry a canonical", (b) => !/rel="canonical"/.test(b)],
  ["SPA shell should be empty-rooted", (b) => b.includes('<div id="root"></div>')],
]);

const keyFile = fs.readdirSync(OUT).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) fail("indexnow", "no <32-hex>.txt key file in dist/public");
else {
  const body = read(keyFile).trim();
  if (body !== path.basename(keyFile, ".txt"))
    fail(keyFile, "contents must be exactly the key");
  else ok(`${keyFile} (IndexNow key)`);
}

/* ------------------------------------------------------------ HTTP routing */

// The vercel.json rewrites are hand-written; keep them honest about the list
// in shared/spa-routes.js.
const vercel = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "vercel.json"), "utf8")
);
const shellRewrites = new Set(
  vercel.rewrites.filter((r) => r.destination === "/app.html").map((r) => r.source)
);
const missingRewrites = SPA_ROUTES.filter((r) => !shellRewrites.has(r));
if (missingRewrites.length)
  fail("vercel.json", `app routes not rewritten to /app.html: ${missingRewrites.join(", ")}`);
if (!vercel.rewrites.some((r) => r.source === "/(.*)" && r.destination === "/api/not-found.js"))
  fail("vercel.json", "catch-all does not point at the 404 function (soft 404s)");
if (vercel.trailingSlash !== false)
  fail("vercel.json", 'trailingSlash must be false (canonicals are slashless)');
if (!failures) ok("vercel.json routing matches shared/spa-routes.js");

console.log("\nHTTP responses (scripts/serve-dist.mjs):");

const PORT = 4199 + (process.pid % 300);
const server = spawn(process.execPath, [path.join(__dirname, "serve-dist.mjs"), String(PORT)], {
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/robots.txt`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return false;
}

async function expect(label, url, { status, type, body, location } = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${url}`, { redirect: "manual" });
  const text = await res.text();
  if (status !== undefined && res.status !== status)
    return fail(label, `${url} → HTTP ${res.status}, expected ${status}`);
  if (type && !(res.headers.get("content-type") || "").includes(type))
    return fail(label, `${url} → content-type ${res.headers.get("content-type")}, want ${type}`);
  if (location && res.headers.get("location") !== location)
    return fail(label, `${url} → redirects to ${res.headers.get("location")}, want ${location}`);
  if (body && !body(text)) return fail(label, `${url} → unexpected body`);
  ok(`${url.padEnd(28)} ${res.status}${location ? ` → ${location}` : ""}`);
}

try {
  if (!(await waitForServer())) {
    fail("http", "serve-dist.mjs did not start");
  } else {
    await expect("home", "/", {
      status: 200,
      type: "text/html",
      body: (b) => b.includes(`<link data-rh="true" rel="canonical" href="${SITE}/" />`),
    });
    for (const route of PAGES.filter((p) => p !== "/")) {
      await expect("page", route, {
        status: 200,
        type: "text/html",
        body: (b) => b.includes(`rel="canonical" href="${SITE}${route}"`),
      });
    }
    // Canonicals are slashless, so the slashed form must redirect, not serve.
    await expect("trailing slash", "/about/", { status: 308, location: "/about" });
    // App routes: the shell, never the prerendered homepage or its canonical.
    for (const route of ["/profile", "/admin", "/channels", "/articles/1/a-slug"]) {
      await expect("app route", route, {
        status: 200,
        type: "text/html",
        body: (b) => !/rel="canonical"/.test(b) && b.includes('<div id="root"></div>'),
      });
    }
    // Unknown routes and missing files are real 404s, not the SPA with 200.
    await expect("unknown route", "/does-not-exist", { status: 404 });
    await expect("unknown nested route", "/compare/wordpress", { status: 404 });
    await expect("missing text file", "/llms-fulll.txt", { status: 404 });
    await expect("llms.txt", "/llms.txt", { status: 200, type: "text/plain" });
    await expect("robots.txt", "/robots.txt", { status: 200, type: "text/plain" });
  }
} finally {
  server.kill();
}

console.log("");
if (failures) {
  console.error(`check-seo: ${failures} problem(s).\n`);
  process.exit(1);
}
console.log("check-seo: all checks passed.\n");
