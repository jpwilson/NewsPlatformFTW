#!/usr/bin/env node
/**
 * Offline route tests for the production API (api/index.ts).
 *
 * The real Express app runs against scripts/lib/stub-supabase.mjs (an
 * in-memory PostgREST, Auth and Storage). Nothing here touches the network
 * beyond 127.0.0.1, and no .env file is loaded (see scripts/lib/load-api.mjs).
 *
 *   node scripts/test-api-routes.mjs      (npm run test:api)
 *   NP_TEST_VERBOSE=1 node scripts/test-api-routes.mjs   (show API logs)
 */

import { createHash } from "node:crypto";
import http from "node:http";

import { startStubSupabase } from "./lib/stub-supabase.mjs";
import { loadApi } from "./lib/load-api.mjs";

const SB_HOST_URL = "https://mwrhaqghxatfwzsjjfrv.supabase.co";

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

/* ------------------------------------------------------------- fixtures */

const OWNER_TOKEN = "token-owner";
const OTHER_TOKEN = "token-other";
const OWNER_KEY = "nk_" + "a".repeat(64);
const OTHER_KEY = "nk_" + "b".repeat(64);
const sha = (s) => createHash("sha256").update(s).digest("hex");

function seed() {
  const now = new Date().toISOString();
  return {
    users: [
      { id: 1, supabase_uid: "uid-owner", username: "owner" },
      { id: 2, supabase_uid: "uid-other", username: "other" },
    ],
    api_keys: [
      { id: 1, user_id: 1, key_hash: sha(OWNER_KEY), is_revoked: false, expires_at: null },
      { id: 2, user_id: 2, key_hash: sha(OTHER_KEY), is_revoked: false, expires_at: null },
    ],
    channels: [
      { id: 10, user_id: 1, name: "Owner Desk", slug: "owner-desk", profile_image: null },
      { id: 11, user_id: 1, name: "Owner Second", slug: "owner-second" },
      { id: 20, user_id: 2, name: "Other Desk", slug: "other-desk" },
    ],
    categories: [
      { id: 1, name: "Business", parent_id: null },
      { id: 2, name: "Tech", parent_id: null },
    ],
    articles: [
      {
        id: 100,
        title: "Original title",
        slug: "2026-01-02-original-title",
        content: '<p class="article-dek">The dek.</p><p>Body text of the article.</p>',
        channel_id: 10,
        user_id: 1,
        status: "published",
        published: true,
        created_at: "2026-01-02T10:00:00.000Z",
        published_at: "2026-01-02T10:00:00.000Z",
        view_count: 5,
        category: "Business",
      },
      {
        id: 200,
        title: "Someone else's",
        slug: "2026-01-03-someone-else-s",
        content: "<p>Not yours.</p>",
        channel_id: 20,
        user_id: 2,
        status: "published",
        published: true,
        created_at: "2026-01-03T10:00:00.000Z",
        view_count: 1,
      },
      {
        id: 300,
        title: "A draft",
        slug: "2026-01-04-a-draft",
        content: "<p>Draft body.</p>",
        channel_id: 10,
        user_id: 1,
        status: "draft",
        published: false,
        created_at: "2026-01-04T10:00:00.000Z",
        view_count: 0,
      },
    ],
    article_images: [
      { id: 2, article_id: 100, image_url: `${SB_HOST_URL}/storage/v1/object/sign/article-images/b.jpg?token=t2`, caption: "B", order: 1 },
      { id: 1, article_id: 100, image_url: `${SB_HOST_URL}/storage/v1/object/sign/article-images/a.jpg?token=t1`, caption: "A", order: 0 },
    ],
    article_categories: [{ id: 1, article_id: 100, category_id: 1, is_primary: true }],
    comments: [{ id: 1, article_id: 100, user_id: 2, content: "Nice" }],
    reactions: [{ id: 1, article_id: 100, user_id: 2, is_like: true }],
    article_views: [],
  };
}

/* A stub image host for Content-API downloads. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 5)]);
const JPEG_B = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 6)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 3)]);
const imageHits = {};
const imageHost = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  imageHits[p] = (imageHits[p] || 0) + 1;
  const files = { "/one.jpg": ["image/jpeg", JPEG], "/two.jpg": ["image/jpeg", JPEG_B], "/three.png": ["image/png", PNG], "/fake.jpg": ["image/jpeg", Buffer.from("<html>")] };
  const f = files[p];
  if (p === "/wiki/Special:FilePath/One.jpg") {
    res.writeHead(302, { location: "/one.jpg" });
    return res.end();
  }
  if (!f) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": f[0] });
  res.end(f[1]);
});
await new Promise((r) => imageHost.listen(0, "127.0.0.1", r));
const IMG = `http://127.0.0.1:${imageHost.address().port}`;
process.env.NP_INGEST_ALLOW_HOSTS = `127.0.0.1:${imageHost.address().port}`;

const stub = await startStubSupabase({
  tables: seed(),
  tokens: { [OWNER_TOKEN]: "uid-owner", [OTHER_TOKEN]: "uid-other" },
});
// The API derives public URLs from SUPABASE_URL; use the stub's.
const api = await loadApi({ supabaseUrl: stub.url });
const PUBLIC = (p) => `${stub.url}/storage/v1/object/public/article-images/${p}`;

const owner = { authorization: `Bearer ${OWNER_TOKEN}` };
const other = { authorization: `Bearer ${OTHER_TOKEN}` };
const row = (t, id) => stub.table(t).find((r) => r.id === id);

/* ------------------------------------------------- session: PATCH article */

section("session PATCH /api/articles/:id");
{
  stub.reset(seed());
  let r = await api.request("PATCH", "/api/articles/100", { body: { title: "x" } });
  check("no token → 401 {message}", r.status === 401 && r.json?.message === "Authentication required", r.json);
  r = await api.request("PATCH", "/api/articles/999", { headers: owner, body: { title: "x" } });
  check("missing → 404 {message}", r.status === 404 && r.json?.message === "Article not found", r.json);
  r = await api.request("PATCH", "/api/articles/200", { headers: owner, body: { title: "x" } });
  check("not owner → 403 {message}", r.status === 403 && r.json?.message === "Not authorized to update this article", r.json);

  r = await api.request("PATCH", "/api/articles/100", {
    headers: owner,
    body: { content: '<p>New <img src="/media/c/abc.jpg"></p>', location: "Madrid" },
  });
  check("owner content update → 200 with the row", r.status === 200 && r.json?.id === 100, r.json);
  check("content /media stored as public URL", row("articles", 100).content.includes(`src="${PUBLIC("c/abc.jpg")}"`), row("articles", 100).content);
  check("response serves /media again", r.json?.content?.includes('src="/media/c/abc.jpg"'), r.json?.content);
  check("slug unchanged without a title", row("articles", 100).slug === "2026-01-02-original-title");
  check("location mirrored to location_name", row("articles", 100).location_name === "Madrid");

  r = await api.request("PATCH", "/api/articles/100", { headers: owner, body: { title: "Original title", content: "<p>Saved again.</p>" } });
  check("same title (editor save) keeps the slug", r.status === 200 && row("articles", 100).slug === "2026-01-02-original-title", row("articles", 100).slug);

  stub.table("articles").push({ id: 101, title: "Taken", slug: "2026-01-02-new-headline", channel_id: 10, user_id: 1, status: "draft", created_at: "2026-01-02T09:00:00.000Z" });
  r = await api.request("PATCH", "/api/articles/100", { headers: owner, body: { title: "New headline" } });
  check(
    "changed title: new slug dated by created_at, collision-suffixed",
    r.status === 200 && row("articles", 100).slug === "2026-01-02-new-headline-2",
    row("articles", 100).slug
  );
  check("response carries the new slug", r.json?.slug === "2026-01-02-new-headline-2", r.json?.slug);
  r = await api.request("PATCH", "/api/articles/100", { headers: owner, body: { title: "New headline" } });
  check("repeating the title keeps it", row("articles", 100).slug === "2026-01-02-new-headline-2", row("articles", 100).slug);

  r = await api.request("PATCH", "/api/articles/2026-01-02-new-headline-2", { headers: owner, body: { category: "Tech" } });
  check("lookup by slug works", r.status === 200 && row("articles", 100).category === "Tech", r.json);

  r = await api.request("PATCH", "/api/articles/100", { headers: owner, body: { categoryIds: [2, 1] } });
  const cats = stub.table("article_categories").filter((c) => c.article_id === 100);
  check("categoryIds replace, first primary", cats.length === 2 && cats.find((c) => c.category_id === 2)?.is_primary === true, cats);
}

/* ------------------------------------------------ session: PUT images */

section("session PUT /api/articles/:id/images");
{
  stub.reset(seed());
  let r = await api.request("PUT", "/api/articles/100/images", { headers: other, body: { images: [] } });
  check("not owner → 403", r.status === 403, r.json);
  r = await api.request("PUT", "/api/articles/100/images", {
    headers: owner,
    body: {
      images: [
        { image_url: "/media/a.jpg", caption: "A again", order: 0 },
        { image_url: "https://ext.example/x.jpg", caption: "", order: 1 },
      ],
    },
  });
  check("200 {message}", r.status === 200 && r.json?.message === "Images updated successfully", r.json);
  const imgs = stub.table("article_images").filter((i) => i.article_id === 100).sort((a, b) => a.order - b.order);
  check("rows replaced", imgs.length === 2 && imgs[0].caption === "A again", imgs);
  check("/media stored as public URL", imgs[0].image_url === PUBLIC("a.jpg"), imgs[0].image_url);
  check("external URL kept", imgs[1].image_url === "https://ext.example/x.jpg");
  check("no storage object deleted", stub.storage.removed.length === 0, stub.storage.removed);
}

/* ----------------------------------------------- session: GET article */

section("GET /api/articles/:id");
{
  stub.reset(seed());
  const r = await api.request("GET", "/api/articles/100");
  check("200", r.status === 200, r.status);
  check("images sorted by (order, id)", r.json?.images?.map((i) => i.caption).join() === "A,B", r.json?.images);
  check("images served as /media", r.json?.images?.[0]?.imageUrl === "/media/a.jpg", r.json?.images?.[0]);
  check("no token in the response", !r.text.includes("token="));
}

/* --------------------------------------------- session: DELETE article */

section("session DELETE /api/articles/:id");
{
  stub.reset(seed());
  let r = await api.request("DELETE", "/api/articles/100", { headers: other });
  check("not owner → 403 {message}", r.status === 403 && r.json?.message === "You don't have permission to delete this article", r.json);
  r = await api.request("DELETE", "/api/articles/999", { headers: owner });
  check("missing → 404", r.status === 404 && r.json?.message === "Article not found", r.json);
  r = await api.request("DELETE", "/api/articles/100", { headers: owner });
  check("owner → 204 empty", r.status === 204 && r.text === "", r.status);
  check("article gone", !row("articles", 100));
  check("comments, reactions, images, categories gone", ["comments", "reactions", "article_images", "article_categories"].every((t) => !stub.table(t).some((x) => x.article_id === 100)));
  check("no storage object deleted", stub.storage.removed.length === 0, stub.storage.removed);
}

/* --------------------------------------------- v1: POST create (compat) */

section("POST /api/v1/content/articles");
const key = (k) => ({ "x-api-key": k });
{
  stub.reset(seed());
  // The writer agent's habit: the same photos in `images` and in the body.
  const r = await api.request("POST", "/api/v1/content/articles", {
    headers: { ...key(OWNER_KEY), "x-forwarded-host": "www.newsplatform.org" },
    body: {
      title: "Legacy payload",
      content: `Intro paragraph that is long enough.\n\n![Caption one. Photo: Someone](${IMG}/one.jpg?width=1920)\n\nMore text.\n\n![Caption two](${IMG}/two.jpg)`,
      channelId: 10,
      categoryIds: [1],
      images: [{ url: `${IMG}/one.jpg?width=800` }, { url: `${IMG}/two.jpg`, caption: "" }, { url: `${IMG}/fake.jpg` }],
      published: false,
    },
  });
  check("201", r.status === 201, r.json);
  const j = r.json || {};
  check("legacy fields present", ["id", "title", "slug", "channelId", "status", "published", "createdAt", "url", "images", "categories"].every((k) => k in j), Object.keys(j));
  check("draft stays a draft", j.status === "draft" && j.published === false);
  check("images[] are the inserted rows", Array.isArray(j.images) && j.images.length === 2 && j.images.every((i) => i.id && i.article_id === j.id), j.images);
  check("image URLs are permanent and absolute", j.images.every((i) => /^https:\/\/www\.newsplatform\.org\/media\/c\/[0-9a-f]{32}\.jpg$/.test(i.image_url)), j.images.map((i) => i.image_url));
  check("each photo downloaded once", imageHits["/one.jpg"] === 1 && imageHits["/two.jpg"] === 1, imageHits);
  const stored = row("articles", j.id);
  check("body images re-hosted to the same objects", stored && !stored.content.includes(IMG) && stored.content.includes(stub.url + "/storage/v1/object/public/article-images/c/"), stored?.content);
  const cover = stub.table("article_images").filter((i) => i.article_id === j.id).sort((a, b) => a.order - b.order)[0];
  check("cover is images[0] and equals the first body figure", cover && stored.content.indexOf(cover.image_url) > -1 && stored.content.indexOf(cover.image_url) < stored.content.indexOf("More text"), cover);
  check("failed image reported, not fatal", j.warnings?.some((w) => w.field === "images[2]" && w.reason === "unsupported_type"), j.warnings);
  check("new fields: coverImage, gallery, excerpt", j.coverImage?.url === j.images[0].image_url && j.gallery?.length === 1 && j.excerpt === "Intro paragraph that is long enough.", { c: j.coverImage, g: j.gallery, e: j.excerpt });
  check("primary category name set", stored.category === "Business", stored.category);

  let r2 = await api.request("POST", "/api/v1/content/articles", {
    headers: key(OWNER_KEY),
    body: { title: "Legacy payload", content: "x", channelId: 10 },
  });
  check("duplicate title within 24 h → 409 with existingArticleId", r2.status === 409 && r2.json?.existingArticleId === j.id, r2.json);

  r2 = await api.request("POST", "/api/v1/content/articles", {
    headers: key(OWNER_KEY),
    body: {
      title: "Explicit cover",
      content: "<p>Lede text for the explicit-cover article.</p>",
      contentFormat: "html",
      channelId: 10,
      coverImage: { url: `${IMG}/wiki/Special:FilePath/One.jpg`, caption: "Cover caption.", credit: "Agency" },
      gallery: [`${IMG}/three.png`],
      excerpt: "A standfirst.",
    },
  });
  check("coverImage + gallery → 201", r2.status === 201, r2.json);
  check("cover caption carries the credit", r2.json?.coverImage?.caption === "Cover caption. Photo: Agency", r2.json?.coverImage);
  check("gallery after the cover", r2.json?.gallery?.length === 1 && /\.png$/.test(r2.json.gallery[0].url), r2.json?.gallery);
  check("identical bytes reuse one object (one.jpg via a redirect)", r2.json?.coverImage?.url?.split("/media/")[1] === j.coverImage?.url?.split("/media/")[1], [r2.json?.coverImage?.url, j.coverImage?.url]);
  check("excerpt stored as the dek", row("articles", r2.json?.id)?.content.startsWith('<p class="article-dek">A standfirst.</p>') && r2.json.excerpt === "A standfirst.");

  r2 = await api.request("POST", "/api/v1/content/articles", { headers: key(OWNER_KEY), body: { title: "Mixed", content: "x", channelId: 10, images: [], coverImage: "x" } });
  check("images with coverImage → 400", r2.status === 400 && r2.json?.error === "Use either images or coverImage/gallery, not both", r2.json);
  r2 = await api.request("POST", "/api/v1/content/articles", { headers: key(OWNER_KEY), body: { title: "Foreign", content: "x", channelId: 20 } });
  check("foreign channel → 403 (unchanged)", r2.status === 403 && r2.json?.error === "Not authorized for this channel", r2.json);
  r2 = await api.request("POST", "/api/v1/content/articles", { headers: key(OWNER_KEY), body: { title: "Nowhere", content: "x", channelId: 999 } });
  check("missing channel → 404 (unchanged)", r2.status === 404 && r2.json?.error === "Channel not found", r2.json);
  r2 = await api.request("POST", "/api/v1/content/articles", { body: { title: "No key", content: "x", channelId: 10 } });
  check("no key → 401", r2.status === 401, r2.json);
  r2 = await api.request("POST", "/api/v1/content/articles", { headers: key("nk_wrong"), body: { title: "Bad key", content: "x", channelId: 10 } });
  check("bad key → 401", r2.status === 401, r2.json);
}

/* ------------------------------------------------------------ logging */

section("request logs");
{
  await api.request("POST", "/api/v1/content/articles", { headers: { "x-api-key": OWNER_KEY, cookie: "sb=secret-cookie" }, body: { title: "" } });
  stub.reset(seed());
  const r = await api.request("POST", "/api/articles/100/images", {
    headers: owner,
    body: [{ article_id: 100, image_url: "/media/c/new.jpg", caption: "New", order: 2 }],
  });
  check("POST images → 200 with rows", r.status === 200 && Array.isArray(r.json) && r.json[0]?.caption === "New", r.json);
  check("POST images stores the public URL", stub.table("article_images").some((i) => i.image_url === PUBLIC("c/new.jpg")));
  check("POST images response serves /media", r.json?.[0]?.image_url === "/media/c/new.jpg", r.json?.[0]?.image_url);
  await api.request("POST", "/api/auth/session-from-hash", { body: { access_token: "secret-access-token", refresh_token: "secret-refresh" } });
  const all = api.logs.join("\n");
  check("logs were captured", all.length > 0);
  check("no bearer token in the logs", !all.includes(OWNER_TOKEN) && !all.includes(OTHER_TOKEN));
  check("no API key in the logs", !all.includes(OWNER_KEY));
  check("no cookie in the logs", !all.includes("secret-cookie"));
  check("no body tokens in the logs", !all.includes("secret-access-token") && !all.includes("secret-refresh"));
}

/* ------------------------------------------------------------------ end */

await api.close();
await stub.close();
imageHost.close();
api.restoreConsole();
console.log(out.join("\n"));
console.log("");
if (failures) {
  console.error(`test-api-routes: ${failures} failure(s).\n`);
  if (!process.env.NP_TEST_VERBOSE) console.error("  (NP_TEST_VERBOSE=1 shows the API's own logs)\n");
  process.exit(1);
}
console.log("test-api-routes: all checks passed.\n");
