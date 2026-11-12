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
