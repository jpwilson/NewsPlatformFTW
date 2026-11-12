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

/* ------------------------------------------------------------------ end */

await api.close();
await stub.close();
api.restoreConsole();
console.log(out.join("\n"));
console.log("");
if (failures) {
  console.error(`test-api-routes: ${failures} failure(s).\n`);
  if (!process.env.NP_TEST_VERBOSE) console.error("  (NP_TEST_VERBOSE=1 shows the API's own logs)\n");
  process.exit(1);
}
console.log("test-api-routes: all checks passed.\n");
