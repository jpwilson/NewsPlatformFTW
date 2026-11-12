#!/usr/bin/env node
/**
 * Live smoke check: do crawlers actually get article pages?
 *
 * Fetches the newest article URLs from the sitemap and requests each one the
 * way Google, an AI answer engine and a social scraper would. Fails (exit 1)
 * if any of them gets an error, an empty page, or a page without the
 * NewsArticle structured data.
 *
 * This exists because the unit test (scripts/test-prerender-article.mjs) runs
 * on the local Node, while the page is served by Vercel's function runtime.
 * In October 2026 a dependency that loaded fine locally crashed there, and
 * every article answered crawlers with HTTP 500 for three weeks without
 * anything noticing. Run this after every deploy.
 *
 *   node scripts/check-live.mjs                          # production
 *   node scripts/check-live.mjs https://<preview-url>    # any deployment
 *   CHECK_ARTICLES=5 node scripts/check-live.mjs
 */

const BASE = (process.argv[2] || "https://www.newsplatform.org").replace(/\/$/, "");
const ARTICLE_COUNT = Number(process.env.CHECK_ARTICLES || 3);
const TIMEOUT_MS = 30_000;

const CRAWLERS = [
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"],
  ["Twitterbot", "Twitterbot/1.0"],
];

const failures = [];
let checks = 0;

async function get(url, userAgent) {
  const res = await fetch(url, {
    headers: userAgent ? { "user-agent": userAgent } : {},
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, type: res.headers.get("content-type") || "", body: await res.text() };
}

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

  const blocks = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let hasArticle = false;
  for (const [, json] of blocks) {
    try {
      const nodes = [JSON.parse(json)].flat().flatMap((n) => n["@graph"] || n);
      if (nodes.some((n) => [n["@type"]].flat().includes("NewsArticle"))) hasArticle = true;
    } catch {
      problems.push("structured data does not parse");
    }
  }
  if (!hasArticle) problems.push("no NewsArticle structured data");
  return problems;
}

const sitemap = await get(`${BASE}/sitemap.xml`);
if (sitemap.status !== 200) {
  console.error(`✗ ${BASE}/sitemap.xml → HTTP ${sitemap.status}`);
  process.exit(1);
}
// The sitemap always lists canonical production URLs; test them on BASE.
const articlePaths = [...sitemap.body.matchAll(/<loc>https?:\/\/[^/<]+(\/articles\/[^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .slice(0, ARTICLE_COUNT);
if (articlePaths.length === 0) {
  console.error("✗ sitemap lists no article URLs");
  process.exit(1);
}

for (const path of articlePaths) {
  for (const [name, userAgent] of CRAWLERS) {
    checks++;
    let problems;
    try {
      problems = problemsWith(await get(BASE + path, userAgent));
    } catch (error) {
      problems = [`request failed: ${error.message}`];
    }
    if (problems.length) failures.push(`${name} ${path} → ${problems.join(", ")}`);
    console.log(`${problems.length ? "✗" : "✓"} ${name.padEnd(10)} ${path}${problems.length ? "  — " + problems.join(", ") : ""}`);
  }
}

if (failures.length) {
  console.error(`\ncheck-live: ${failures.length} of ${checks} crawler requests failed on ${BASE}`);
  process.exit(1);
}
console.log(`\ncheck-live: all ${checks} crawler requests returned a full article page on ${BASE}`);
