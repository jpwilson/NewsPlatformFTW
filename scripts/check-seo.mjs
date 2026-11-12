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
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SPA_ROUTES } from "../shared/spa-routes.js";
import { INDEXNOW_KEY } from "../api/_lib/indexnow.js";
import { CRAWLER_TOKENS } from "../api/_lib/crawler-pages.js";

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

/** Public URLs served by api/index.ts through a vercel.json rewrite. */
const API_PAGES = ["/sitemap.xml", "/news-sitemap.xml", "/rss.xml", "/latest"];

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

/** robots.txt groups: the rule lines after each `User-agent:` block. */
function robotsGroups(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^User-agent:/i.test(line)) {
      if (!current || current.rules.length) groups.push((current = { rules: [] }));
    } else if (current && !/^Sitemap:/i.test(line)) current.rules.push(line);
  }
  return groups.map((g) => g.rules);
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
  ["no Sitemap: line for the news sitemap", (b) => b.includes(`Sitemap: ${SITE}/news-sitemap.xml`)],
  [
    "a group lacks `Allow: /api/ai/` directly before `Disallow: /api/` (the AI endpoint must stay reachable)",
    (b) => robotsGroups(b).length > 0 && robotsGroups(b).every((g) => {
      const allow = g.indexOf("Allow: /api/ai/");
      const disallow = g.indexOf("Disallow: /api/");
      return allow !== -1 && disallow === allow + 1;
    }),
  ],
]);

checkFile("llms.txt", [
  ["looks like HTML, not text", (b) => !b.trimStart().startsWith("<")],
  ["too short", (b) => b.length > 500],
  ["does not link the key pages", (b) => b.includes(`${SITE}/faq`)],
  ["does not link /latest (the crawlable archive)", (b) => b.includes(`${SITE}/latest`)],
  ["still calls the product an aggregator", (b) => !/is an independent news aggregator/.test(b)],
]);

checkFile("site.css", [
  ["is not the built stylesheet (api/_lib/site-shell.js pages link it)", (b) => {
    const href = read("app.html")?.match(/<link[^>]+rel="stylesheet"[^>]+href="\/(assets\/[^"]+\.css)"/)?.[1];
    return !!href && read(href) === b;
  }],
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
  else if (body !== INDEXNOW_KEY)
    fail(keyFile, `api/_lib/indexnow.js pings with key ${INDEXNOW_KEY}; the served key file is ${keyFile} (update INDEXNOW_KEY)`);
  else ok(`${keyFile} (IndexNow key, matches api/_lib/indexnow.js)`);
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
// Feeds and crawl pages generated by api/index.ts: each needs a rewrite ahead
// of the catch-all, or it silently becomes the 404 function.
const catchAllIndex = vercel.rewrites.findIndex((r) => r.source === "/(.*)");
for (const source of API_PAGES) {
  const i = vercel.rewrites.findIndex((r) => r.source === source && r.destination === "/api/index.ts" && !r.has);
  if (i === -1 || i > catchAllIndex) fail("vercel.json", `${source} is not rewritten to /api/index.ts before the catch-all`);
}
// Crawler user-agent rewrites (articles and channels): one regex, the same
// tokens as CRAWLER_TOKENS in api/_lib/crawler-pages.js, which the
// prerenderer uses to decide it is talking to a crawler.
const uaRewrites = vercel.rewrites.filter((r) => (r.has || []).some((h) => h.type === "header" && h.key === "user-agent"));
const uaValues = new Set(uaRewrites.map((r) => r.has.find((h) => h.key === "user-agent").value));
if (uaValues.size !== 1) fail("vercel.json", `the crawler user-agent rewrites use ${uaValues.size} different regexes; they must be identical`);
const [uaRegex] = uaValues;
const vercelTokens = (uaRegex || "").replace(/^\.\*\(/, "").replace(/\)\.\*$/, "").split("|")
  .map((t) => t.replace(/\[([A-Za-z])([A-Za-z])\]/g, (m, a, b) => (a.toLowerCase() === b.toLowerCase() ? a.toLowerCase() : m)).toLowerCase());
const jsTokens = CRAWLER_TOKENS.map((t) => t.toLowerCase());
const onlyVercel = vercelTokens.filter((t) => !jsTokens.includes(t));
const onlyJs = jsTokens.filter((t) => !vercelTokens.includes(t));
if (onlyVercel.length || onlyJs.length)
  fail("vercel.json", `crawler lists differ from CRAWLER_TOKENS (api/_lib/crawler-pages.js): only in vercel.json [${onlyVercel}], only in the JS [${onlyJs}]`);
for (const [source, prefix] of [["/articles/:id/:slug?", "/articles/"], ["/articles/:slug", "/articles/"], ["/channels/:id", "/channels/"]]) {
  const bot = vercel.rewrites.findIndex((r) => r.source === source && r.has && r.destination.startsWith(`/api/prerender-article.js?path=${prefix}`));
  const spa = vercel.rewrites.findIndex((r) => !r.has && r.destination === "/app.html" && (r.source === source || r.source === source.replace("?", "") || (source === "/articles/:slug" && r.source === "/articles/:id")));
  if (bot === -1) fail("vercel.json", `no crawler rewrite for ${source} to api/prerender-article.js`);
  else if (spa !== -1 && bot > spa) fail("vercel.json", `the crawler rewrite for ${source} comes after the SPA rewrite, so it never fires`);
}
if (vercel.trailingSlash !== false)
  fail("vercel.json", 'trailingSlash must be false (canonicals are slashless)');
if (!failures) ok("vercel.json routing matches shared/spa-routes.js");

// The /latest and channel crawler pages wear the marketing pages' header and
// footer, through a generated module.
const tsx = path.resolve(__dirname, "..", "node_modules", ".bin", "tsx");
const shellCheck = spawnSync(tsx, [path.join(__dirname, "gen-site-shell.ts"), "--check"], { encoding: "utf8" });
if (shellCheck.status !== 0) fail("api/_lib/site-shell.js", (shellCheck.stderr || shellCheck.stdout || "check failed").trim());
else ok("api/_lib/site-shell.js matches client/src/content/shell.ts");
if (!read("index.html")?.includes('href="/latest"')) fail("footer", "the static footer does not link /latest");

// The scheduled monitor (SEO.md, "Monitoring"): it must run the full check.
const workflow = path.resolve(__dirname, "..", ".github", "workflows", "site-health.yml");
const wf = fs.existsSync(workflow) ? fs.readFileSync(workflow, "utf8") : "";
if (!/node scripts\/check-live\.mjs/.test(wf) || /--baseline|CHECK_BASELINE/.test(wf) || !/cron:/.test(wf))
  fail(".github/workflows/site-health.yml", "must run node scripts/check-live.mjs on a schedule, without --baseline");
else ok(".github/workflows/site-health.yml runs the full live check on a schedule");

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
