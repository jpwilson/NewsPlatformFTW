#!/usr/bin/env node
/**
 * Offline tests for the search and discoverability routes of api/index.ts:
 * /sitemap.xml (paging, cover images), /news-sitemap.xml, /latest, crawler
 * HTML for /channels/:id, /rss.xml, and the IndexNow ping.
 *
 * Same harness as scripts/test-api-routes.mjs: the real Express app against
 * the in-memory Supabase stub. Nothing leaves 127.0.0.1: global fetch is
 * wrapped so a request to IndexNow is recorded and answered locally.
 *
 *   node scripts/test-seo-routes.mjs      (npm run test:seo)
 */

import { createHash } from "node:crypto";

import { startStubSupabase } from "./lib/stub-supabase.mjs";
import { loadApi } from "./lib/load-api.mjs";
import { INDEXNOW_KEY, pingIndexNow } from "../api/_lib/indexnow.js";

const SB_HOST_URL = "https://mwrhaqghxatfwzsjjfrv.supabase.co";
const SITE = "https://www.newsplatform.org";

let failures = 0;
const out = [];
function check(label, condition, detail = "") {
  if (condition) out.push(`  ✓ ${label}`);
  else {
    failures++;
    out.push(`  ✗ ${label}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}
const section = (name) => out.push(`\n${name}:`);

/* --------------------------------------------- outbound requests (IndexNow) */

const indexNowCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (/indexnow/i.test(url)) {
    indexNowCalls.push({ url, body: JSON.parse(init?.body || "{}") });
    return new Response("", { status: 202 });
  }
  if (!/^http:\/\/127\.0\.0\.1[:/]/.test(url)) throw new Error(`test-seo-routes: blocked outbound request to ${url}`);
  return realFetch(input, init);
};

/* ------------------------------------------------------------- fixtures */

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const OWNER_TOKEN = "token-owner";
const OWNER_KEY = "nk_" + "c".repeat(64);
const sha = (v) => createHash("sha256").update(v).digest("hex");

function article(id, over = {}) {
  return {
    id,
    title: `Story ${id}`,
    slug: `2026-01-01-story-${id}`,
    content: `<p>Body of story ${id}, long enough to be an excerpt.</p>`,
    channel_id: 10,
    user_id: 1,
    status: "published",
    published: true,
    category: "Tech",
    created_at: "2026-01-01T10:00:00.000Z",
    published_at: "2026-01-01T10:00:00.000Z",
    view_count: 0,
    ...over,
  };
}

function seed() {
  return {
    users: [{ id: 1, supabase_uid: "uid-owner", username: "owner" }],
    api_keys: [{ id: 1, user_id: 1, key_hash: sha(OWNER_KEY), is_revoked: false, expires_at: null }],
    channels: [
      { id: 10, user_id: 1, name: "Desk & Co", slug: "desk", description: "Local reporting <b>daily</b>.", profile_image: null },
      { id: 20, user_id: 1, name: "Empty Desk", slug: "empty", description: "" },
    ],
    articles: [
      article(1, { title: "Fresh <news>", published_at: hoursAgo(2), created_at: hoursAgo(2) }),
      article(2, { title: "Yesterday's", published_at: hoursAgo(30), created_at: hoursAgo(30) }),
      article(3, { title: "Last week", published_at: hoursAgo(24 * 7), created_at: hoursAgo(24 * 7) }),
      article(4, { title: "Secret draft", status: "draft", published: false, published_at: hoursAgo(1), created_at: hoursAgo(1), slug: "secret-draft" }),
    ],
    article_images: [
      { id: 2, article_id: 1, image_url: `${SB_HOST_URL}/storage/v1/object/sign/article-images/c/second.jpg?token=x`, caption: "", order: 1 },
      { id: 1, article_id: 1, image_url: `${SB_HOST_URL}/storage/v1/object/public/article-images/c/cover.jpg`, caption: "Cover", order: 0 },
      { id: 3, article_id: 4, image_url: `${SB_HOST_URL}/storage/v1/object/public/article-images/c/draft.jpg`, caption: "", order: 0 },
    ],
    article_views: [],
  };
}

const stub = await startStubSupabase({ tables: seed(), tokens: { [OWNER_TOKEN]: "uid-owner" } });
const api = await loadApi({ supabaseUrl: stub.url });
// The crawler prerenderer (articles and channels) reads SUPABASE_URL at import.
const { default: prerender } = await import("../api/prerender-article.js");

/** Calls api/prerender-article.js the way the vercel.json rewrite does. */
async function prerenderGet(path, userAgent) {
  const res = {
    statusCode: 200, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b ?? ""; return this; },
    end(b) { this.body = b ?? ""; return this; },
  };
  await prerender({ url: `/api/prerender-article.js?path=${path}`, query: { path }, headers: { "user-agent": userAgent, host: "www.newsplatform.org" } }, res);
  return res;
}
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

/* ------------------------------------------------------------- sitemaps */

section("GET /sitemap.xml");
{
  const data = seed();
  // More than two pages of 1,000 rows: a single query would be truncated.
  for (let i = 0; i < 2100; i++) data.articles.push(article(1000 + i, { created_at: new Date(Date.UTC(2025, 0, 1) + i * 60000).toISOString() }));
  stub.reset(data);
  stub.log.length = 0;
  const r = await api.request("GET", "/sitemap.xml");
  const locs = [...r.text.matchAll(/<loc>[^<]*\/articles\/(\d+)\//g)].map((m) => Number(m[1]));
  check("200 application/xml", r.status === 200 && /xml/.test(r.headers.get("content-type") || ""), r.status);
  check("every published article is listed (read in pages)", locs.length === 2103 && new Set(locs).size === 2103, locs.length);
  const reads = stub.log.filter((l) => l.method === "GET" && l.table === "articles");
  check("articles read in pages of at most 1,000", reads.length >= 3 && reads.every((l) => /limit=1000/.test(l.query)), reads.map((l) => l.query));
  check("drafts not listed", !r.text.includes("/articles/4/") && !r.text.includes("draft.jpg"));
  check("image namespace declared", r.text.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
  check(
    "cover (lowest order) as an absolute permanent URL",
    r.text.includes(`/articles/1/2026-01-01-story-1</loc><lastmod>`) && r.text.includes(`<image:image><image:loc>${SITE}/media/c/cover.jpg</image:loc></image:image>`),
    r.text.match(/<url><loc>[^<]*\/articles\/1\/[\s\S]*?<\/url>/)?.[0]
  );
  check("no signed URL anywhere", !r.text.includes("token=") && !r.text.includes("/object/sign/"));
  check("channels listed", r.text.includes(`<loc>${SITE}/channels/10</loc>`) && r.text.includes(`<loc>${SITE}/channels/20</loc>`));
}

section("GET /news-sitemap.xml");
{
  stub.reset(seed());
  stub.log.length = 0;
  const r = await api.request("GET", "/news-sitemap.xml");
  check("200 application/xml", r.status === 200 && /xml/.test(r.headers.get("content-type") || ""), r.status);
  check("news namespace", r.text.includes('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"'));
  check("articles from the last 48 hours", r.text.includes("/articles/1/") && r.text.includes("/articles/2/"), r.text);
  check("older articles left out", !r.text.includes("/articles/3/"));
  check("drafts never listed", !r.text.includes("/articles/4/") && !r.text.includes("Secret draft") && !r.text.includes("secret-draft"));
  const entry = r.text.match(/<url><loc>[^<]*\/articles\/1\/[\s\S]*?<\/url>/)?.[0] || "";
  check("publication name and language", entry.includes("<news:publication><news:name>NewsPlatform</news:name><news:language>en</news:language></news:publication>"), entry);
  check("title XML-escaped", entry.includes("<news:title>Fresh &lt;news&gt;</news:title>"), entry);
  check("publication date in W3C format", /<news:publication_date>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z<\/news:publication_date>/.test(entry), entry);
  check("cover image absolute /media URL", entry.includes(`<image:loc>${SITE}/media/c/cover.jpg</image:loc>`), entry);
  check("filters published=eq.true", stub.log.some((l) => l.table === "articles" && /published=eq\.true/.test(l.query) && /published_at=gte\./.test(l.query)));
}

/* ------------------------------------------------------------- /latest */

section("GET /latest");
{
  const data = seed();
  // 120 published articles + the seeded ones; drafts sprinkled in.
  for (let i = 0; i < 120; i++) {
    const draft = i % 10 === 0;
    data.articles.push(article(2000 + i, {
      title: draft ? `Draft number ${i}` : `Archive story ${i}`,
      slug: draft ? `draft-slug-${i}` : `2025-06-01-archive-${i}`,
      status: draft ? "draft" : "published",
      published: !draft,
      created_at: new Date(Date.UTC(2025, 5, 1) + i * 3600000).toISOString(),
      published_at: new Date(Date.UTC(2025, 5, 1) + i * 3600000).toISOString(),
    }));
  }
  stub.reset(data);
  const published = data.articles.filter((a) => a.published).length; // 3 seeded + 108
  const pages = Math.ceil(published / 50);
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const r = await api.request("GET", p === 1 ? "/latest" : `/latest?page=${p}`, { headers: { "user-agent": "Mozilla/5.0 (a person)" } });
    const html = r.text;
    if (p === 1) {
      check("200 text/html for a person (no user-agent sniffing)", r.status === 200 && /text\/html/.test(r.headers.get("content-type") || ""), r.status);
      check("cached at the edge", /s-maxage=/.test(r.headers.get("cache-control") || ""));
      check("canonical /latest", html.includes(`<link rel="canonical" href="${SITE}/latest" />`));
      check("rel=next, no rel=prev on page 1", html.includes(`<link rel="next" href="${SITE}/latest?page=2" />`) && !html.includes('rel="prev"'));
      check("one <h1>", (html.match(/<h1[\s>]/g) || []).length === 1);
      check("the static site header and footer", html.includes('aria-label="Primary"') && html.includes('aria-label="Footer"') && html.includes('href="/latest"'));
      check("header marks Latest stories as current", /href="\/latest"[^>]*aria-current="page"/.test(html));
      check("links the stable stylesheet", html.includes('<link rel="stylesheet" href="/site.css" />'));
      const entry = html.match(/<li class="np-item">[\s\S]*?<\/li>/)?.[0] || "";
      check("entry: title link, channel link, date, excerpt", entry.includes(`href="${SITE}/articles/1/2026-01-01-story-1"`) && entry.includes("Fresh &lt;news&gt;") && entry.includes(`href="${SITE}/channels/10"`) && entry.includes("Desk &amp; Co") && /<time datetime="[^"]+">\d{1,2} \w{3} \d{4}<\/time>/.test(entry) && entry.includes("Body of story 1, long enough"), entry);
      const ld = ldBlocks(html)[0];
      check("CollectionPage + ItemList JSON-LD", ld["@type"] === "CollectionPage" && ld.mainEntity["@type"] === "ItemList" && ld.mainEntity.itemListElement.length === 50 && ld.mainEntity.numberOfItems === published, ld.mainEntity?.numberOfItems);
    }
    if (p === 2) {
      check("page 2: canonical, prev and next", html.includes(`<link rel="canonical" href="${SITE}/latest?page=2" />`) && html.includes(`<link rel="prev" href="${SITE}/latest" />`) && html.includes(`<link rel="next" href="${SITE}/latest?page=3" />`));
      check("page 2: numbered list continues at 51", html.includes('<ol class="np-list" start="51">'));
    }
    if (p === pages) check("last page: no rel=next", !html.includes('rel="next"') && html.includes('rel="prev"'));
    all.push(...[...html.matchAll(/<h2><a href="[^"]*\/articles\/(\d+)\//g)].map((m) => Number(m[1])));
  }
  const expected = data.articles.filter((a) => a.published).map((a) => a.id).sort((a, b) => a - b);
  check(`every published article reachable across ${pages} pages, once`, JSON.stringify([...all].sort((a, b) => a - b)) === JSON.stringify(expected), { got: all.length, want: expected.length });
  check("newest first", all[0] === 1 && all[1] === 2, all.slice(0, 3));
  let r = await api.request("GET", "/latest?page=1");
  const page1 = r.text;
  check("drafts never appear", !page1.includes("Draft number") && !page1.includes("draft-slug") && !page1.includes("Secret draft"));
  check("filters published=eq.true", stub.log.some((l) => l.table === "articles" && /published=eq\.true/.test(l.query) && /limit=50/.test(l.query)));
  r = await api.request("GET", `/latest?page=${pages + 1}`);
  check("past the last page → 404 noindex, not cached", r.status === 404 && /no-store/.test(r.headers.get("cache-control") || "") && /noindex/.test(r.headers.get("x-robots-tag") || ""), r.status);
  for (const bad of ["0", "-1", "abc", "1.5"]) {
    r = await api.request("GET", `/latest?page=${bad}`);
    if (r.status !== 404) check(`?page=${bad} → 404`, false, r.status);
  }
  check("invalid page numbers → 404", true);
  stub.reset({ ...seed(), articles: [] });
  r = await api.request("GET", "/latest");
  check("no articles yet: page 1 still 200", r.status === 200 && r.text.includes("No stories have been published yet"));
}

/* ------------------------------------------------- channel crawler page */

section("channel pages for crawlers (api/prerender-article.js)");
{
  const data = seed();
  for (let i = 0; i < 60; i++) data.articles.push(article(3000 + i, { created_at: new Date(Date.UTC(2025, 0, 1) + i * 3600000).toISOString() }));
  data.articles.push(article(3999, { title: "Channel draft", slug: "channel-draft", status: "draft", published: false, created_at: "2027-01-01T00:00:00.000Z" }));
  data.articles.push(article(4000, { title: "Other channel story", channel_id: 20 }));
  stub.reset(data);
  stub.log.length = 0;
  let r = await prerenderGet("/channels/10", GOOGLEBOT);
  const html = r.body;
  check("200 text/html for Googlebot", r.statusCode === 200 && /text\/html/.test(r.headers["content-type"] || ""), r.statusCode);
  check("canonical", html.includes(`<link rel="canonical" href="${SITE}/channels/10" />`));
  check("channel name in <title> and <h1>, escaped", html.includes("<title>Desk &amp; Co — NewsPlatform</title>") && html.includes("<h1>Desk &amp; Co</h1>"));
  check("description as text (tags stripped, not live)", html.includes("Local reporting daily.") && !html.includes("<b>daily</b>"));
  const items = [...html.matchAll(/<li class="np-item">/g)].length;
  check("latest 50 articles as links", items === 50, items);
  check("drafts never appear", !html.includes("Channel draft") && !html.includes("channel-draft") && !html.includes("Secret draft"));
  check("only this channel's articles", !html.includes("Other channel story"));
  const ld = ldBlocks(html)[0];
  check("ItemList JSON-LD (50 items, total count)", ld.mainEntity?.["@type"] === "ItemList" && ld.mainEntity.itemListElement.length === 50 && ld.mainEntity.numberOfItems === 63 && ld.mainEntity.itemListElement[0].url.startsWith(`${SITE}/articles/`), ld.mainEntity?.numberOfItems);
  check("links /latest and the channel RSS", html.includes(`href="${SITE}/latest"`) && html.includes(`href="${SITE}/channels/10/rss.xml"`));
  check("query filters published=eq.true", stub.log.some((l) => l.table === "articles" && /published=eq\.true/.test(l.query) && /channel_id=eq\.10/.test(l.query)));
  r = await prerenderGet("/channels/desk", GOOGLEBOT);
  check("by slug too", r.statusCode === 200 && r.body.includes("<h1>Desk &amp; Co</h1>"));
  r = await prerenderGet("/channels/20", GOOGLEBOT);
  check("a channel with no description gets a generated one", r.statusCode === 200 && r.body.includes('content="Latest articles from Empty Desk on NewsPlatform."'));
  r = await prerenderGet("/channels/999", GOOGLEBOT);
  check("missing channel → 404, not cached", r.statusCode === 404 && /no-store/.test(r.headers["cache-control"] || ""), r.statusCode);
  process.env.NODE_ENV = "production";
  r = await prerenderGet("/channels/10", "Mozilla/5.0 (a person)");
  check("a person in production → 404 (vercel.json gives people the SPA)", r.statusCode === 404);
  r = await prerenderGet("/articles/1/2026-01-01-story-1", GOOGLEBOT);
  check("article crawler page links /latest", r.statusCode === 200 && r.body.includes(`href="${SITE}/latest"`));
  r = await prerenderGet("/articles/4/secret-draft", GOOGLEBOT);
  check("article draft still 404", r.statusCode === 404);
  process.env.NODE_ENV = "test";
}

/* ------------------------------------------------------------- IndexNow */

section("pingIndexNow (api/_lib/indexnow.js)");
{
  const calls = [];
  const okFetch = async (url, init) => (calls.push({ url, init }), new Response("", { status: 200 }));
  const url = `${SITE}/articles/1/a`;
  let r = await pingIndexNow([url], { env: {}, fetchImpl: okFetch });
  check("silent without VERCEL_ENV", r.sent === false && r.reason === "not_production" && calls.length === 0, r);
  r = await pingIndexNow([url], { env: { VERCEL_ENV: "preview" }, fetchImpl: okFetch });
  check("silent on preview deployments", r.sent === false && calls.length === 0, r);
  r = await pingIndexNow([url, url, "https://evil.example/x", `${SITE}/channels/10`], { env: { VERCEL_ENV: "production" }, fetchImpl: okFetch });
  const body = JSON.parse(calls[0]?.init?.body || "{}");
  check("production: one POST to api.indexnow.org", r.sent === true && calls.length === 1 && calls[0].url === "https://api.indexnow.org/indexnow" && calls[0].init.method === "POST", calls);
  check("payload: host, key, keyLocation", body.host === "www.newsplatform.org" && body.key === INDEXNOW_KEY && body.keyLocation === `${SITE}/${INDEXNOW_KEY}.txt`, body);
  check("only our URLs, de-duplicated", JSON.stringify(body.urlList) === JSON.stringify([url, `${SITE}/channels/10`]), body.urlList);
  r = await pingIndexNow([], { env: { VERCEL_ENV: "production" }, fetchImpl: okFetch });
  check("no URLs: nothing sent", r.sent === false && calls.length === 1);
  r = await pingIndexNow([url], { env: { VERCEL_ENV: "production" }, fetchImpl: async () => { throw new Error("network down"); } });
  check("a network error never throws", r.sent === false && r.reason === "error", r);
  r = await pingIndexNow([url], { env: { VERCEL_ENV: "production" }, fetchImpl: () => { throw new Error("sync throw"); } });
  check("a synchronous throw never throws", r.sent === false, r);
  const t0 = Date.now();
  r = await pingIndexNow([url], { env: { VERCEL_ENV: "production" }, fetchImpl: () => new Promise(() => {}) });
  const waited = Date.now() - t0;
  check("a hanging endpoint is abandoned after 2 seconds", r.sent === false && r.reason === "timeout" && waited >= 1900 && waited < 2600, { r, waited });
}

section("IndexNow from the article routes");
{
  stub.reset(seed());
  indexNowCalls.length = 0;
  const owner = { authorization: `Bearer ${OWNER_TOKEN}` };
  const key = { "x-api-key": OWNER_KEY };
  // Outside production (VERCEL_ENV unset, as on every test run): silent.
  await api.request("PATCH", "/api/articles/1", { headers: owner, body: { content: "<p>Edited while published, long enough.</p>" } });
  await api.request("POST", "/api/v1/content/articles", { headers: key, body: { title: "New via API", content: "<p>Body long enough here.</p>", contentFormat: "html", channelId: 10 } });
  await api.request("DELETE", "/api/v1/content/articles/2", { headers: key });
  check("no ping outside production", indexNowCalls.length === 0, indexNowCalls);

  stub.reset(seed());
  process.env.VERCEL_ENV = "production";
  const pinged = async (label, fn, expectUrls) => {
    indexNowCalls.length = 0;
    const r = await fn();
    const urls = indexNowCalls.flatMap((c) => c.body.urlList || []);
    if (expectUrls === null) check(label, r.status < 300 && indexNowCalls.length === 0, { status: r.status, urls });
    else check(label, r.status < 300 && indexNowCalls.length === 1 && expectUrls.every((u) => urls.includes(u)), { status: r.status, urls });
    return r;
  };
  await pinged("session PATCH of a published article", () => api.request("PATCH", "/api/articles/1", { headers: owner, body: { content: "<p>Edited again, long enough.</p>" } }), [`${SITE}/articles/1/2026-01-01-story-1`, `${SITE}/channels/10`, `${SITE}/latest`]);
  await pinged("session PATCH of a draft that stays a draft: no ping", () => api.request("PATCH", "/api/articles/4", { headers: owner, body: { content: "<p>Draft edit.</p>" } }), null);
  await pinged("session PATCH with a new title: old and new URL", () => api.request("PATCH", "/api/articles/2", { headers: owner, body: { title: "Renamed story" } }), [`${SITE}/articles/2/2026-01-01-story-2`]);
  check("…and the new slug's URL", indexNowCalls[0]?.body.urlList.some((u) => /\/articles\/2\/\d{4}-\d\d-\d\d-renamed-story$/.test(u)), indexNowCalls[0]?.body.urlList);
  await pinged("toggle-status (unpublish)", () => api.request("POST", "/api/articles/3/toggle-status", { headers: owner }), [`${SITE}/articles/3/2026-01-01-story-3`]);
  await pinged("session POST of a published article", () => api.request("POST", "/api/articles", { headers: owner, body: { title: "Session new", content: "<p>Body.</p>", channelId: 10 } }), [`${SITE}/latest`]);
  await pinged("session POST of a draft: no ping", () => api.request("POST", "/api/articles", { headers: owner, body: { title: "Session draft", content: "<p>Body.</p>", channelId: 10, published: false } }), null);
  const created = await pinged("v1 POST (published)", () => api.request("POST", "/api/v1/content/articles", { headers: key, body: { title: "Via API", content: "<p>Body long enough here.</p>", contentFormat: "html", channelId: 10 } }), [`${SITE}/channels/10`]);
  check("…with the new article's URL", indexNowCalls[0]?.body.urlList.includes(`${SITE}/articles/${created.json?.id}/${created.json?.slug}`), indexNowCalls[0]?.body.urlList);
  await pinged("v1 PATCH published:false (unpublish)", () => api.request("PATCH", "/api/v1/content/articles/1", { headers: key, body: { published: false } }), [`${SITE}/articles/1/2026-01-01-story-1`]);
  await pinged("v1 PATCH published:true (publish)", () => api.request("PATCH", "/api/v1/content/articles/1", { headers: key, body: { published: true } }), [`${SITE}/articles/1/2026-01-01-story-1`]);
  await pinged("v1 DELETE (soft)", () => api.request("DELETE", "/api/v1/content/articles/1", { headers: key }), [`${SITE}/articles/1/2026-01-01-story-1`]);
  await pinged("v1 DELETE of a draft: no ping", () => api.request("DELETE", "/api/v1/content/articles/4", { headers: key }), null);
  stub.reset(seed());
  await pinged("v1 DELETE ?permanent=true", () => api.request("DELETE", "/api/v1/content/articles/1?permanent=true", { headers: key }), [`${SITE}/articles/1/2026-01-01-story-1`]);
  await pinged("session DELETE", () => api.request("DELETE", "/api/articles/2", { headers: owner }), [`${SITE}/articles/2/2026-01-01-story-2`]);
  delete process.env.VERCEL_ENV;
}

/* ------------------------------------------------------------------ end */

await api.close();
await stub.close();
api.restoreConsole();
globalThis.fetch = realFetch;
console.log(out.join("\n"));
console.log("");
if (failures) {
  console.error(`test-seo-routes: ${failures} failure(s).\n`);
  if (!process.env.NP_TEST_VERBOSE) console.error("  (NP_TEST_VERBOSE=1 shows the API's own logs)\n");
  process.exit(1);
}
console.log("test-seo-routes: all checks passed.\n");
