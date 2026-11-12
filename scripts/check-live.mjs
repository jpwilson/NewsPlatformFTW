#!/usr/bin/env node
/**
 * Live smoke check: do crawlers actually get article pages?
 *
 * Fetches the newest article URLs from the sitemap and requests each one the
 * way Google, an AI answer engine and a social scraper would. Fails (exit 1)
 * if any of them gets an error, an empty page, or a page without the
 * NewsArticle structured data, or if the page's og:image is not a working,
 * permanent image. Then checks that the feeds and crawl pages answer:
 * /sitemap.xml, /news-sitemap.xml, /rss.xml, /latest, and a channel page as
 * a crawler sees it.
 *
 * This exists because the unit test (scripts/test-prerender-article.mjs) runs
 * on the local Node, while the page is served by Vercel's function runtime.
 * In October 2026 a dependency that loaded fine locally crashed there, and
 * every article answered crawlers with HTTP 500 for three weeks without
 * anything noticing. Run this after every deploy;
 * .github/workflows/site-health.yml also runs it every six hours.
 *
 *   node scripts/check-live.mjs                          # production
 *   node scripts/check-live.mjs https://<preview-url>    # any deployment
 *   node scripts/check-live.mjs --baseline               # a deployment from
 *        before the SEO branch: skips the checks for what that branch added
 *        (/news-sitemap.xml, /latest, channel crawler pages, permanent
 *        og:image URLs). Also CHECK_BASELINE=1. See SEO.md.
 *   CHECK_ARTICLES=5 node scripts/check-live.mjs
 */

const args = process.argv.slice(2);
const BASELINE = args.includes("--baseline") || process.env.CHECK_BASELINE === "1";
const BASE = (args.find((a) => !a.startsWith("--")) || "https://www.newsplatform.org").replace(/\/$/, "");
const ARTICLE_COUNT = Number(process.env.CHECK_ARTICLES || 3);
const TIMEOUT_MS = 30_000;

const CRAWLERS = [
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"],
  ["Twitterbot", "Twitterbot/1.0"],
];
const GOOGLEBOT = CRAWLERS[0][1];

const failures = [];
let checks = 0;
const skipped = [];

function report(label, problems) {
  checks++;
  if (problems.length) failures.push(`${label} → ${problems.join(", ")}`);
  console.log(`${problems.length ? "✗" : "✓"} ${label}${problems.length ? "  — " + problems.join(", ") : ""}`);
}

/** Runs a check introduced by the SEO branch, unless --baseline. */
async function newCheck(label, fn) {
  if (BASELINE) {
    skipped.push(label);
    console.log(`- ${label}  (skipped: --baseline)`);
    return;
  }
  await fn();
}

async function get(url, userAgent, { text = true } = {}) {
  const res = await fetch(url, {
    headers: userAgent ? { "user-agent": userAgent } : {},
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = text ? await res.text() : (await res.arrayBuffer(), "");
  return { status: res.status, type: res.headers.get("content-type") || "", body, url: res.url };
}

/** Problems with a response that should be `status` 200 of a given type. */
async function expectResponse(label, url, { type, userAgent, body: bodyTest } = {}) {
  let problems = [];
  try {
    const r = await get(url, userAgent);
    if (r.status !== 200) problems.push(`HTTP ${r.status}`);
    else {
      if (type && !type.test(r.type)) problems.push(`content-type "${r.type}"`);
      if (bodyTest) problems.push(...bodyTest(r.body));
    }
  } catch (error) {
    problems = [`request failed: ${error.message}`];
  }
  report(label, problems);
}

function jsonLdNodes(body) {
  const nodes = [];
  let broken = false;
  for (const [, json] of body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      nodes.push(...[JSON.parse(json)].flat().flatMap((n) => n["@graph"] || n));
    } catch {
      broken = true;
    }
  }
  return { nodes, broken };
}

const hasType = (nodes, type) => nodes.some((n) => [n["@type"]].flat().includes(type));

/** Returns the reasons a crawler response is not a usable article page. */
function problemsWith({ status, type, body }) {
  const problems = [];
  if (status !== 200) problems.push(`HTTP ${status}`);
  if (!type.includes("text/html")) problems.push(`content-type "${type}"`);
  if (problems.length) return problems;

  const words = body.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 80) problems.push(`only ${words.length} words of text`);
  if (!/<meta[^>]+property="og:image"/.test(body)) problems.push("no og:image");
  if (!/<link[^>]+rel="canonical"/.test(body)) problems.push("no canonical link");

  const { nodes, broken } = jsonLdNodes(body);
  if (broken) problems.push("structured data does not parse");
  if (!hasType(nodes, "NewsArticle")) problems.push("no NewsArticle structured data");
  return problems;
}

const ogImageOf = (body) =>
  (body.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || [])[1]?.replace(/&amp;/g, "&") || null;

/** A signed (expiring) Supabase storage URL: what took article photos down. */
const isSignedUrl = (url) => /\/storage\/v1\/object\/sign\//.test(url) || /[?&]token=/.test(url);

const PRODUCTION = "https://www.newsplatform.org";

/**
 * Crawler pages always point og:image at the production host. When testing
 * another deployment, fetch our /media/ photos from that deployment instead:
 * that tests its media function, and production may not have it yet.
 */
const imageFetchUrl = (url) =>
  BASE !== PRODUCTION && url.startsWith(`${PRODUCTION}/media/`) ? BASE + url.slice(PRODUCTION.length) : url;

/** The og:image must be a working image at a permanent URL. */
async function checkOgImage(path, imageUrl) {
  const label = `og:image   ${path}`;
  if (!imageUrl) return report(label, ["missing"]);
  const problems = [];
  if (isSignedUrl(imageUrl)) problems.push(`signed (expiring) URL ${imageUrl.slice(0, 100)}…`);
  try {
    const r = await get(imageFetchUrl(imageUrl), CRAWLERS[2][1], { text: false });
    if (r.status !== 200) problems.push(`HTTP ${r.status} for ${imageUrl}`);
    else if (!/^image\//i.test(r.type)) problems.push(`content-type "${r.type}" for ${imageUrl}`);
  } catch (error) {
    problems.push(`request failed: ${error.message}`);
  }
  report(label, problems);
}

/* ---------------------------------------------------------- the sitemap */

const sitemap = await get(`${BASE}/sitemap.xml`);
if (sitemap.status !== 200) {
  console.error(`✗ ${BASE}/sitemap.xml → HTTP ${sitemap.status}`);
  process.exit(1);
}
// The sitemap always lists canonical production URLs; test them on BASE.
const articlePaths = [...sitemap.body.matchAll(/<loc>https?:\/\/[^/<]+(\/articles\/[^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .slice(0, ARTICLE_COUNT);
const channelPath = (sitemap.body.match(/<loc>https?:\/\/[^/<]+(\/channels\/[^/<]+)<\/loc>/) || [])[1] || null;
if (articlePaths.length === 0) {
  console.error("✗ sitemap lists no article URLs");
  process.exit(1);
}

/* ---------------------------------------------------- article pages */

for (const path of articlePaths) {
  let ogImage = null;
  for (const [name, userAgent] of CRAWLERS) {
    let problems;
    try {
      const page = await get(BASE + path, userAgent);
      problems = problemsWith(page);
      if (name === "Googlebot" && !problems.length) ogImage = ogImageOf(page.body);
    } catch (error) {
      problems = [`request failed: ${error.message}`];
    }
    report(`${name.padEnd(10)} ${path}`, problems);
  }
  if (ogImage) {
    if (BASELINE) {
      // Before the branch, og:image may still be a signed URL; it must load.
      await expectResponse(`og:image   ${path}`, imageFetchUrl(ogImage), { type: /^image\//i, userAgent: CRAWLERS[2][1] });
    } else {
      await checkOgImage(path, ogImage);
    }
  }
}

/* ------------------------------------------------- feeds and crawl pages */

const xmlRoot = (root) => (body) => (body.includes(`<${root}`) ? [] : [`no <${root}> element`]);

await expectResponse("sitemap    /sitemap.xml", `${BASE}/sitemap.xml`, { type: /xml/i, body: xmlRoot("urlset") });
await expectResponse("rss        /rss.xml", `${BASE}/rss.xml`, { type: /(rss\+xml|xml)/i, body: xmlRoot("rss") });
await newCheck("news       /news-sitemap.xml", () =>
  expectResponse("news       /news-sitemap.xml", `${BASE}/news-sitemap.xml`, {
    type: /xml/i,
    body: (b) => (b.includes("sitemap-news/0.9") ? [] : ["not a Google News sitemap"]),
  })
);
await newCheck("latest     /latest", () =>
  expectResponse("latest     /latest", `${BASE}/latest`, {
    type: /text\/html/i,
    body: (b) => {
      const problems = [];
      if (!/<link[^>]+rel="canonical"[^>]+\/latest"/.test(b)) problems.push("no /latest canonical");
      if (!/href="[^"]*\/articles\/\d+/.test(b)) problems.push("no article links");
      return problems;
    },
  })
);
if (channelPath) {
  await newCheck(`Googlebot  ${channelPath}`, () =>
    expectResponse(`Googlebot  ${channelPath}`, BASE + channelPath, {
      type: /text\/html/i,
      userAgent: GOOGLEBOT,
      body: (b) => {
        const problems = [];
        const { nodes, broken } = jsonLdNodes(b);
        if (broken) problems.push("structured data does not parse");
        if (!JSON.stringify(nodes).includes('"ItemList"')) problems.push("no ItemList structured data");
        if (!/<link[^>]+rel="canonical"/.test(b)) problems.push("no canonical link");
        return problems;
      },
    })
  );
}

/* ------------------------------------------------------------------ end */

const note = skipped.length ? ` (${skipped.length} skipped with --baseline)` : "";
if (failures.length) {
  console.error(`\ncheck-live: ${failures.length} of ${checks} checks failed on ${BASE}${note}`);
  process.exit(1);
}
console.log(`\ncheck-live: all ${checks} checks passed on ${BASE}${note}`);
