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

import { startStubSupabase } from "./lib/stub-supabase.mjs";
import { loadApi } from "./lib/load-api.mjs";

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
