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
      { id: 3, supabase_uid: "uid-admin", username: "admin" },
    ],
    admin_users: [{ user_id: "uid-admin" }],
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
  tokens: { [OWNER_TOKEN]: "uid-owner", [OTHER_TOKEN]: "uid-other", "token-admin": "uid-admin" },
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

/* ------------------------------------------------ v1: GET, PATCH, DELETE */

section("GET /api/v1/content/articles/:id");
{
  stub.reset(seed());
  let r = await api.request("GET", "/api/v1/content/articles/100", { headers: key(OWNER_KEY) });
  check("200", r.status === 200, r.json);
  const j = r.json || {};
  check("content, contentFormat, excerpt, excerptSource", j.content?.includes("Body text") && j.contentFormat === "html" && j.excerpt === "The dek." && j.excerptSource === "dek", j);
  check("coverImage is the lowest (order, id)", j.coverImage?.caption === "A" && j.gallery?.[0]?.caption === "B", { c: j.coverImage, g: j.gallery });
  check("absolute /media URLs (http only for a local host)", /^http:\/\/127\.0\.0\.1:\d+\/media\/a\.jpg$/.test(j.coverImage?.url || ""), j.coverImage);
  const viaProxy = await api.request("GET", "/api/v1/content/articles/100", { headers: { ...key(OWNER_KEY), "x-forwarded-host": "www.newsplatform.org", "x-forwarded-proto": "http" } });
  check("public host is always https", viaProxy.json?.coverImage?.url === "https://www.newsplatform.org/media/a.jpg", viaProxy.json?.coverImage);
  check("previewUrl null when published", j.previewUrl === null);
  const notOwned = await api.request("GET", "/api/v1/content/articles/200", { headers: key(OWNER_KEY) });
  const missing = await api.request("GET", "/api/v1/content/articles/9999", { headers: key(OWNER_KEY) });
  check("not owned → 404", notOwned.status === 404);
  check("not owned body identical to missing", notOwned.text === missing.text && missing.json?.code === "not_found", [notOwned.text, missing.text]);
  r = await api.request("GET", "/api/v1/content/articles/300", { headers: key(OWNER_KEY) });
  check("draft has a previewUrl", /^\/articles\/300\/2026-01-04-a-draft\?preview=[0-9a-f]{32}$/.test(r.json?.previewUrl || ""), r.json?.previewUrl);
  r = await api.request("GET", "/api/v1/content/articles/100");
  check("no key → 401 code unauthorized", r.status === 401 && r.json?.code === "unauthorized", r.json);
}

section("PATCH /api/v1/content/articles/:id");
{
  stub.reset(seed());
  const patch = (id, body, k = OWNER_KEY) => api.request("PATCH", `/api/v1/content/articles/${id}`, { headers: key(k), body });

  let r = await patch(100, { title: "A better title" });
  check("title → 200, slug unchanged", r.status === 200 && r.json?.slug === "2026-01-02-original-title" && r.json?.title === "A better title", r.json);
  check("previousSlug null when unchanged", r.json?.previousSlug === null);

  r = await patch(100, { title: "Regenerated headline", regenerateSlug: true });
  check("regenerateSlug: new slug dated by created_at", r.json?.slug === "2026-01-02-regenerated-headline" && r.json?.previousSlug === "2026-01-02-original-title", r.json);
  r = await api.request("GET", "/api/v1/content/articles/100", { headers: key(OWNER_KEY) });
  check("id lookup still works after a slug change", r.status === 200 && r.json?.slug === "2026-01-02-regenerated-headline");

  r = await patch(100, { content: "## Section\n\nNew paragraph that is long enough here." });
  check("markdown content → <h2>", r.status === 200 && r.json?.content?.includes("<h2>Section</h2>"), r.json?.content);
  check("standfirst carried across a content replace", r.json?.content?.startsWith('<p class="article-dek">The dek.</p>') && r.json?.excerpt === "The dek.", r.json?.content);

  r = await patch(100, { excerpt: "A new standfirst." });
  check("excerpt set", r.json?.excerpt === "A new standfirst." && r.json?.excerptSource === "dek" && r.json?.content?.includes("<h2>Section</h2>"), r.json);
  r = await patch(100, { excerpt: null });
  check("excerpt null removes it; derived excerpt", !r.json?.content?.includes("article-dek") && r.json?.excerptSource === "derived" && r.json?.excerpt === "New paragraph that is long enough here.", r.json);

  r = await patch(100, { content: "<p>Html body that is long enough.</p>", contentFormat: "html" });
  check("contentFormat html kept as is", r.json?.content === "<p>Html body that is long enough.</p>", r.json?.content);

  stub.reset(seed());
  r = await patch(100, { coverImage: { url: `${IMG}/three.png`, caption: "New cover.", credit: "Wire" } });
  check("coverImage alone → 200", r.status === 200, r.json);
  check("cover replaced, caption with credit", r.json?.coverImage?.caption === "New cover. Photo: Wire" && /\.png$/.test(r.json?.coverImage?.url), r.json?.coverImage);
  check("gallery untouched", r.json?.gallery?.length === 1 && r.json.gallery[0].caption === "B", r.json?.gallery);
  check("rows renumbered 0..n", stub.table("article_images").filter((i) => i.article_id === 100).map((i) => i.order).sort().join() === "0,1");

  r = await patch(100, { gallery: [`${IMG}/one.jpg`, { url: `${IMG}/two.jpg`, caption: "Two" }] });
  check("gallery replace keeps the cover", r.json?.coverImage?.caption === "New cover. Photo: Wire" && r.json?.gallery?.length === 2 && r.json.gallery[1].caption === "Two", r.json);
  r = await patch(100, { gallery: [] });
  check("gallery [] clears", r.json?.gallery?.length === 0 && r.json?.coverImage, r.json);

  r = await patch(100, { coverImage: r.json.coverImage.url.replace(/^https?:\/\/[^/]+/, "https://www.newsplatform.org"), gallery: [] });
  check("our own /media URL accepted back without download", r.status === 200 && /\.png$/.test(r.json?.coverImage?.url), r.json);

  r = await patch(100, { gallery: [`${IMG}/one.jpg`] });
  r = await patch(100, { coverImage: null });
  check("coverImage null promotes the first gallery image", r.json?.gallery?.length === 0 && r.json?.coverImage && r.json?.warnings?.some((w) => w.reason === "cover_promoted_from_gallery"), r.json);

  const before = JSON.stringify(stub.table("article_images").filter((i) => i.article_id === 100));
  const beforeTitle = row("articles", 100).title;
  r = await patch(100, { title: "Should not apply", gallery: [`${IMG}/one.jpg`, `${IMG}/fake.jpg`] });
  check("one failed image → 422 image_failed with details", r.status === 422 && r.json?.code === "image_failed" && r.json?.details?.[0]?.field === "gallery[1]" && r.json.details[0].reason === "unsupported_type", r.json);
  check("422 changes nothing", JSON.stringify(stub.table("article_images").filter((i) => i.article_id === 100)) === before && row("articles", 100).title === beforeTitle);

  r = await patch(100, { content: `<p>Text long enough for a paragraph.</p><img src="${IMG}/missing.jpg">`, contentFormat: "html" });
  check("failed body image is a warning, not a failure", r.status === 200 && r.json?.warnings?.some((w) => w.field === "content"), r.json);

  r = await patch(100, { images: [`${IMG}/one.jpg`], coverImage: `${IMG}/two.jpg` });
  check("images + coverImage → 400 validation_failed", r.status === 400 && r.json?.code === "validation_failed", r.json);
  r = await patch(100, { coverImage: `${IMG}/one.jpg`, gallery: [1, 2, 3, 4, 5].map((n) => `${IMG}/one.jpg?n=${n}`) });
  check("more than 5 → 400", r.status === 400 && /Maximum 5/.test(r.json?.error || ""), r.json);
  r = await patch(100, {});
  check("empty body → 400 No updatable fields provided", r.status === 400 && r.json?.error === "No updatable fields provided", r.json);
  r = await patch(100, { title: "" });
  check("empty title → 400", r.status === 400 && r.json?.code === "validation_failed");

  r = await patch(100, { channelId: 11 });
  check("move to own second channel", r.status === 200 && r.json?.channelId === 11 && r.json?.channelName === "Owner Second", r.json);
  r = await patch(100, { channelId: 999 });
  check("missing channel → 404 channel_not_found", r.status === 404 && r.json?.code === "channel_not_found" && r.json?.error === "Channel not found", r.json);
  r = await patch(100, { channelId: 20 });
  check("foreign channel → 403 channel_forbidden", r.status === 403 && r.json?.code === "channel_forbidden", r.json);

  r = await patch(100, { categoryIds: [2] });
  check("categoryIds replace + primary name", r.status === 200 && row("articles", 100).category === "Tech" && r.json?.categories?.length === 1, r.json?.categories);
  r = await patch(100, { location: "Madrid, Spain", locationLat: 40.4, locationLng: -3.7 });
  check("location", row("articles", 100).location_name === "Madrid, Spain" && row("articles", 100).geom === "SRID=4326;POINT(-3.7 40.4)");
  r = await patch(100, { published: false });
  check("published false → draft + previewUrl", r.json?.status === "draft" && r.json?.published === false && !!r.json?.previewUrl, r.json);
  r = await patch(100, { published: true });
  check("published true → published", r.json?.status === "published" && r.json?.published === true);

  const foreign = await patch(200, { title: "x" });
  const missing = await patch(9999, { title: "x" });
  check("foreign article → 404, same body as missing", foreign.status === 404 && foreign.text === missing.text, [foreign.text, missing.text]);
  check("foreign article untouched", row("articles", 200).title === "Someone else's");
  r = await api.request("PATCH", "/api/v1/content/articles/100", { body: { title: "x" } });
  check("no key → 401", r.status === 401 && r.json?.code === "unauthorized");
  r = await patch(100, { title: "x" }, "nk_bad");
  check("bad key → 401", r.status === 401 && r.json?.code === "unauthorized");
}

section("DELETE /api/v1/content/articles/:id");
{
  stub.reset(seed());
  const del = (id, q = "", k = OWNER_KEY) => api.request("DELETE", `/api/v1/content/articles/${id}${q}`, { headers: key(k) });
  let r = await del(100, "?dryRun=true");
  check("dryRun reports and changes nothing", r.status === 200 && r.json?.dryRun === true && r.json?.action === "unpublish" && row("articles", 100).status === "published", r.json);
  r = await del(100, "?permanent=true&dryRun=true");
  check("permanent dryRun reports delete", r.json?.action === "delete" && !!row("articles", 100));
  r = await del(100);
  check("soft delete → 200 unpublished", r.status === 200 && r.json?.deleted === false && r.json?.unpublished === true && r.json?.status === "draft" && /PATCH/.test(r.json?.restore), r.json);
  check("row is a draft", row("articles", 100).status === "draft" && row("articles", 100).published === false);
  r = await api.request("GET", "/api/articles/100");
  check("unauthenticated GET /api/articles/:id of the draft → 404", r.status === 404, r.status);
  r = await del(100);
  check("repeat soft delete → 200", r.status === 200);
  const foreign = await del(200);
  const missing = await del(9999);
  check("foreign → 404 identical to missing", foreign.status === 404 && foreign.text === missing.text);
  check("foreign untouched", row("articles", 200)?.status === "published");
  r = await del(100, "?permanent=true");
  check("permanent → 200 deleted", r.status === 200 && r.json?.deleted === true && !row("articles", 100), r.json);
  check("cascade removed images and categories", !stub.table("article_images").some((i) => i.article_id === 100) && !stub.table("article_categories").some((c) => c.article_id === 100));
  r = await del(100, "?permanent=true");
  check("after permanent delete → 404", r.status === 404);
  check("no storage object ever deleted", stub.storage.removed.length === 0, stub.storage.removed);
}

/* ------------------------------------- draft guard, preview, views, related */

section("drafts, preview token, views");
{
  stub.reset(seed());
  const { createHmac } = await import("node:crypto");
  const token = createHmac("sha256", "test-service-key").update("preview:300").digest("hex").slice(0, 32);
  let r = await api.request("GET", "/api/articles/300");
  check("draft, anonymous → 404", r.status === 404 && r.json?.error === "Article not found", r.json);
  r = await api.request("GET", "/api/articles/2026-01-04-a-draft");
  check("draft by slug, anonymous → 404", r.status === 404);
  r = await api.request("GET", "/api/articles/300", { headers: other });
  check("draft, another user → 404", r.status === 404);
  r = await api.request("GET", "/api/articles/300", { headers: owner });
  check("draft, owner → 200, not cacheable", r.status === 200 && /no-store/.test(r.headers.get("cache-control") || ""), r.status);
  r = await api.request("GET", "/api/articles/300", { headers: { authorization: "Bearer token-admin" } });
  check("draft, admin → 200", r.status === 200);
  r = await api.request("GET", `/api/articles/300?preview=${token}`);
  check("draft with the preview token → 200", r.status === 200 && r.json?.title === "A draft");
  r = await api.request("GET", `/api/articles/300?preview=${"0".repeat(32)}`);
  check("wrong preview token → 404", r.status === 404);
  r = await api.request("GET", `/api/articles/100?preview=${token}`);
  check("another article's token does not matter for a published one", r.status === 200);

  r = await api.request("POST", "/api/articles/2026-01-04-a-draft/view", { headers: { "x-forwarded-for": "203.0.113.9" } });
  check("draft view not counted", r.status === 200 && r.json?.counted === false && stub.table("article_views").length === 0, r.json);

  r = await api.request("POST", "/api/articles/2026-01-02-original-title/view", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "Reader/1.0" },
  });
  const views = stub.table("article_views");
  check("published view counted", r.json?.counted === true && views.length === 1 && row("articles", 100).view_count === 6, r.json);
  check("anonymous identity is anon-<24 hex>", /^anon-[0-9a-f]{24}$/.test(views[0]?.client_identifier || ""), views[0]);
  check("no raw IP stored", !JSON.stringify(views).includes("203.0.113.9"));
  r = await api.request("POST", "/api/articles/2026-01-02-original-title/view", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.2", "user-agent": "Reader/1.0" },
  });
  check("same visitor (first x-forwarded-for entry) not counted twice", r.json?.counted === false && stub.table("article_views").length === 1, r.json);
  r = await api.request("POST", "/api/articles/2026-01-02-original-title/view", { headers: { "x-real-ip": "198.51.100.7", "user-agent": "Other/2.0" } });
  check("x-real-ip used when there is no x-forwarded-for", r.json?.counted === true && stub.table("article_views").length === 2);
}

section("GET /api/articles/:id/related");
{
  const base = seed();
  const mk = (id, channel_id, created, category = "Business", status = "published") => ({
    id, title: `Story ${id}`, slug: `s-${id}`, content: "<p>long body that must not be sent</p>", channel_id, user_id: channel_id === 20 ? 2 : 1,
    status, published: status === "published", created_at: created, category,
  });
  base.articles.push(
    mk(401, 10, "2026-01-01T00:00:00.000Z"),
    mk(402, 10, "2025-12-01T00:00:00.000Z"),
    mk(403, 10, "2026-02-01T00:00:00.000Z"),
    mk(404, 20, "2026-01-05T00:00:00.000Z", "Business"),
    mk(405, 20, "2026-01-06T00:00:00.000Z", "Tech"),
    mk(406, 10, "2026-01-01T12:00:00.000Z", "Business", "draft"),
  );
  base.article_images.push({ id: 9, article_id: 404, image_url: `${SB_HOST_URL}/storage/v1/object/sign/article-images/r.jpg?token=x`, caption: "R", order: 0 });
  stub.reset(base);
  const r = await api.request("GET", "/api/articles/100/related?limit=3");
  const j = r.json || {};
  check("200 with next, sameChannel, more", r.status === 200 && "next" in j && Array.isArray(j.sameChannel) && Array.isArray(j.more), j);
  check("next = the previous story in the same channel", j.next?.id === 401, j.next);
  check("sameChannel excludes next, drafts and the article", j.sameChannel.map((a) => a.id).join() === "403,402", j.sameChannel.map((a) => a.id));
  check("more prefers the same category from other channels", j.more[0]?.id === 404 && j.more.some((a) => a.id === 405), j.more.map((a) => a.id));
  check("card shape, no bodies", !r.text.includes("long body") && j.more[0].channel?.name === "Other Desk" && j.more[0].image?.url === "/media/r.jpg", j.more[0]);
  check("cached at the edge", /s-maxage=300/.test(r.headers.get("cache-control") || ""));
  const missing = await api.request("GET", "/api/articles/9999/related");
  check("missing → 404", missing.status === 404);
}

/* ------------------------------------------------------------- sitemap */

section("sitemap.xml");
{
  const data = seed();
  data.articles[0].last_edited = "2026-11-11T00:00:00.000Z"; // bumped by a view
  stub.reset(data);
  const r = await api.request("GET", "/sitemap.xml");
  check("200 xml", r.status === 200 && r.text.startsWith("<?xml"));
  check("article lastmod is the publish date, not last_edited", r.text.includes("/articles/100/2026-01-02-original-title</loc><lastmod>2026-01-02</lastmod>") && !r.text.includes("2026-11-11"), r.text.slice(0, 200));
  check("drafts not listed", !r.text.includes("/articles/300"));
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
