#!/usr/bin/env node
/**
 * End-to-end test of the Content API against a DEPLOYMENT (preview or
 * production). It writes to that deployment's database, so it is careful:
 *
 * - Everything happens on ONE article it creates as a draft
 *   (`published: false`) with a timestamped title. Drafts never appear in the
 *   feed, sitemap, RSS or IndexNow.
 * - Test images are the site's own static files, so storage gains at most
 *   three small content-addressed files that every later run reuses.
 * - The last step (in `finally`, and on Ctrl-C) is DELETE ?permanent=true,
 *   then a GET that must be 404. Nothing is left behind.
 *
 * Usage
 *   NP_API_KEY=nk_... node scripts/test-content-api.mjs <base-url> [--keep] [--cleanup <id>]
 *
 *   <base-url>       required, e.g. https://newsplatform-git-upgrade-….vercel.app
 *   --keep           skip the delete and print the preview URL of the test article
 *   --cleanup <id>   only permanently delete article <id> (after a --keep run)
 *   --image-base <u> where the test images come from (default https://www.newsplatform.org)
 *
 * Environment
 *   NP_API_KEY                       required: a key whose user owns at least one channel
 *   NP_CHANNEL_ID                    optional: channel to use (default: the key's first)
 *   NP_FOREIGN_ARTICLE_ID            optional: an article of ANOTHER user (default: found
 *                                    through /api/ai/latest-stories)
 *   NP_FOREIGN_CHANNEL_ID            optional: a channel of another user (403 check)
 *   VERCEL_AUTOMATION_BYPASS_SECRET  optional: sent as x-vercel-protection-bypass, for
 *                                    previews behind Vercel login
 */

import { composeArticleMedia, storagePathFromUrl } from "../shared/article-media.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = (args.find((a) => /^https?:\/\//.test(a) && a !== option("--image-base")) || "").replace(/\/+$/, "");
const KEY = process.env.NP_API_KEY || "";
const IMAGE_BASE = (option("--image-base") || "https://www.newsplatform.org").replace(/\/+$/, "");
const KEEP = flag("--keep");
const CLEANUP = option("--cleanup");

if (!BASE || !KEY) {
  console.error("Usage: NP_API_KEY=nk_... node scripts/test-content-api.mjs <base-url> [--keep] [--cleanup <id>]");
  process.exit(2);
}

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : {};

async function call(method, path, { body, key = KEY, headers = {} } = {}) {
  const h = { ...bypass, ...headers };
  if (key) h["x-api-key"] = key;
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: r.status, json, text, headers: r.headers };
}

let failures = 0;
let passed = 0;
function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}`}`);
  }
}
const step = (name) => console.log(`\n${name}`);

async function removeArticle(id) {
  const del = await call("DELETE", `/api/v1/content/articles/${id}?permanent=true`);
  const after = await call("GET", `/api/v1/content/articles/${id}`);
  return { del, after };
}

if (CLEANUP) {
  const { del, after } = await removeArticle(CLEANUP);
  console.log(`DELETE ${CLEANUP}?permanent=true → ${del.status}; GET → ${after.status}`);
  process.exit(after.status === 404 ? 0 : 1);
}

let articleId = null;
let cleanedUp = false;
async function cleanup() {
  if (cleanedUp || !articleId || KEEP) return;
  cleanedUp = true;
  step("cleanup");
  const { del, after } = await removeArticle(articleId);
  check(`DELETE ?permanent=true → 200`, del.status === 200 && del.json?.deleted === true, del.json);
  check(`GET afterwards → 404`, after.status === 404, after.status);
}
process.on("SIGINT", async () => {
  console.error("\nInterrupted: cleaning up…");
  await cleanup();
  process.exit(130);
});

const IMG1 = `${IMAGE_BASE}/logo-stacked.png`;
const IMG2 = `${IMAGE_BASE}/android-chrome-512x512.png`;
const IMG3 = `${IMAGE_BASE}/apple-touch-icon.png`;
const NOT_AN_IMAGE = `${IMAGE_BASE}/robots.txt`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const article = (j) => j || {};

try {
  console.log(`Content API test against ${BASE}`);

  step("setup");
  const channels = await call("GET", "/api/v1/content/channels");
  check("GET channels → 200", channels.status === 200 && Array.isArray(channels.json) && channels.json.length > 0, channels.json);
  const own = channels.json || [];
  const channelId = Number(process.env.NP_CHANNEL_ID) || own[0]?.id;
  const secondChannel = own.find((c) => c.id !== channelId)?.id;

  step("1. legacy POST: same photos in images and in the body");
  const created = await call("POST", "/api/v1/content/articles", {
    body: {
      title: `Content API test ${stamp}`,
      channelId,
      published: false,
      content: `Test paragraph written by scripts/test-content-api.mjs; this article is removed when the run ends.\n\n## First section\n\n![First test figure. Photo: NewsPlatform](${IMG1})\n\nSecond paragraph of the test body.\n\n![Second test figure](${IMG2})`,
      images: [{ url: IMG1 }, { url: IMG2 }],
    },
  });
  check("201", created.status === 201, created.json);
  articleId = created.json?.id;
  if (!articleId) throw new Error("create failed; nothing to clean up");
  const c = article(created.json);
  check("legacy response fields present", ["id", "title", "slug", "channelId", "status", "published", "createdAt", "url", "images", "categories"].every((k) => k in c), Object.keys(c));
  check("draft", c.published === false && c.status === "draft");
  check("cover = images[0]", c.coverImage?.url === c.images?.[0]?.image_url, [c.coverImage, c.images?.[0]]);
  check("image URLs are permanent /media URLs", (c.images || []).every((i) => /\/media\//.test(i.image_url) && !/token=/.test(i.image_url)), c.images);
  check("previewUrl for the draft", /\?preview=[0-9a-f]{32}$/.test(c.previewUrl || ""), c.previewUrl);
  const originalSlug = c.slug;

  const page = await call("GET", `/api/articles/${articleId}?preview=${(c.previewUrl || "").split("preview=")[1]}`, { key: "" });
  check("article page data via the preview token → 200", page.status === 200, page.status);
  const composed = composeArticleMedia({ images: page.json?.images, html: page.json?.content || "" });
  check("page: duplicate detected exactly", composed.dedupe === "exact", composed.dedupe);
  check("page: hero is the cover", storagePathFromUrl(composed.hero?.src) === storagePathFromUrl(c.coverImage?.url), [composed.hero?.src, c.coverImage?.url]);
  check("page: cover photo not repeated in the body", !composed.bodyHtml.includes(storagePathFromUrl(c.coverImage?.url) || "@@"));
  check("page: hero takes the figure's caption", composed.hero?.caption === "First test figure." && composed.hero?.credit === "NewsPlatform", composed.hero);

  const patch = (body, key) => call("PATCH", `/api/v1/content/articles/${articleId}`, { body, key });

  step("2. PATCH title keeps the slug");
  let r = await patch({ title: `Content API test ${stamp} (edited)` });
  check("200, slug unchanged", r.status === 200 && r.json?.slug === originalSlug && r.json?.previousSlug === null, r.json);

  step("3. PATCH title with regenerateSlug");
  r = await patch({ title: `Content API test ${stamp} renamed`, regenerateSlug: true });
  check("slug changed, previousSlug set", r.status === 200 && r.json?.slug !== originalSlug && r.json?.previousSlug === originalSlug, r.json);
  r = await call("GET", `/api/v1/content/articles/${articleId}`);
  check("id lookup still works", r.status === 200 && r.json?.id === articleId);

  step("4. PATCH markdown content");
  r = await patch({ content: "## Rewritten\n\nThe body was replaced by a markdown PATCH and this paragraph is long enough." });
  check("body has <h2>", r.status === 200 && /<h2>Rewritten<\/h2>/.test(r.json?.content || ""), r.json?.content);

  step("5. excerpt");
  r = await patch({ excerpt: "A standfirst set by the test." });
  check("set", r.json?.excerpt === "A standfirst set by the test." && r.json?.excerptSource === "dek", r.json);
  r = await patch({ content: "Replaced again, the standfirst must survive this content replace." });
  check("carried across a content replace", r.json?.excerpt === "A standfirst set by the test.", r.json?.excerpt);
  r = await patch({ excerpt: null });
  check("removed with null", r.json?.excerptSource === "derived" && !/article-dek/.test(r.json?.content || ""), r.json);

  step("6. coverImage alone leaves the gallery untouched");
  const galleryBefore = (await call("GET", `/api/v1/content/articles/${articleId}`)).json?.gallery || [];
  r = await patch({ coverImage: { url: IMG3, caption: "New test cover.", credit: "NewsPlatform" } });
  check("cover replaced", r.status === 200 && r.json?.coverImage?.caption === "New test cover. Photo: NewsPlatform", r.json);
  check("gallery unchanged", JSON.stringify((r.json?.gallery || []).map((g) => g.url)) === JSON.stringify(galleryBefore.map((g) => g.url)), [r.json?.gallery, galleryBefore]);

  step("7. gallery replace, then clear");
  r = await patch({ gallery: [IMG1, { url: IMG2, caption: "Second" }] });
  check("replaced", r.json?.gallery?.length === 2 && r.json.gallery[1].caption === "Second", r.json?.gallery);
  r = await patch({ gallery: [] });
  check("cleared, cover kept", r.json?.gallery?.length === 0 && !!r.json?.coverImage, r.json);

  step("8. validation and the all-or-nothing image rule");
  r = await patch({ images: [IMG1], coverImage: IMG2 });
  check("images + coverImage → 400 validation_failed", r.status === 400 && r.json?.code === "validation_failed", r.json);
  const beforeBad = (await call("GET", `/api/v1/content/articles/${articleId}`)).json;
  r = await patch({ title: "Must not apply", gallery: [IMG1, NOT_AN_IMAGE] });
  check("a non-image → 422 image_failed with details", r.status === 422 && r.json?.code === "image_failed" && r.json?.details?.[0]?.field === "gallery[1]", r.json);
  const afterBad = (await call("GET", `/api/v1/content/articles/${articleId}`)).json;
  check("422 changed nothing", afterBad?.title === beforeBad?.title && JSON.stringify(afterBad?.gallery) === JSON.stringify(beforeBad?.gallery));

  step("9. channel moves");
  if (secondChannel) {
    r = await patch({ channelId: secondChannel });
    check("move to own second channel", r.status === 200 && r.json?.channelId === secondChannel, r.json);
    r = await patch({ channelId });
    check("and back", r.status === 200 && r.json?.channelId === channelId);
  } else console.log("  - skipped: the key's user has one channel");
  r = await patch({ channelId: 2147483000 });
  check("missing channel → 404 channel_not_found", r.status === 404 && r.json?.code === "channel_not_found", r.json);
  if (process.env.NP_FOREIGN_CHANNEL_ID) {
    r = await patch({ channelId: Number(process.env.NP_FOREIGN_CHANNEL_ID) });
    check("foreign channel → 403 channel_forbidden", r.status === 403 && r.json?.code === "channel_forbidden", r.json);
  } else console.log("  - skipped foreign-channel 403 (set NP_FOREIGN_CHANNEL_ID)");

  step("10. authentication");
  r = await call("PATCH", `/api/v1/content/articles/${articleId}`, { body: { title: "x" }, key: "" });
  check("no key → 401", r.status === 401 && r.json?.code === "unauthorized", r.json);
  r = await patch({ title: "x" }, "nk_" + "0".repeat(64));
  check("bad key → 401", r.status === 401 && r.json?.code === "unauthorized", r.json);

  step("11. someone else's article is 404, same as a missing one");
  let foreignId = process.env.NP_FOREIGN_ARTICLE_ID;
  if (!foreignId) {
    const latest = await call("GET", "/api/ai/latest-stories?limit=20", { key: "" });
    const stories = latest.json?.stories || latest.json?.articles || [];
    for (const s of stories) {
      const probe = await call("GET", `/api/v1/content/articles/${s.id}`);
      if (probe.status === 404) {
        foreignId = s.id;
        break;
      }
    }
  }
  if (foreignId) {
    // Deliberately harmless requests: an empty PATCH and a dry-run DELETE. If
    // the ownership check were ever broken, neither could change a real article.
    const missing = await call("PATCH", "/api/v1/content/articles/2147483000", { body: {} });
    const foreignPatch = await call("PATCH", `/api/v1/content/articles/${foreignId}`, { body: {} });
    const foreignDel = await call("DELETE", `/api/v1/content/articles/${foreignId}?dryRun=true`);
    check("PATCH foreign → 404, same body as missing", foreignPatch.status === 404 && foreignPatch.text === missing.text, [foreignPatch.text, missing.text]);
    check("DELETE foreign → 404", foreignDel.status === 404 && foreignDel.text === missing.text, foreignDel.text);
  } else console.log("  - skipped: no foreign article found (set NP_FOREIGN_ARTICLE_ID)");

  step("12. every returned image URL resolves to an image");
  const final = (await call("GET", `/api/v1/content/articles/${articleId}`)).json;
  const urls = [...new Set([final?.coverImage?.url, ...(final?.gallery || []).map((g) => g.url), ...(final?.images || []).map((i) => i.image_url)].filter(Boolean))];
  for (const u of urls) {
    const img = await fetch(u, { headers: bypass, redirect: "follow" });
    check(`${u.replace(/^https?:\/\/[^/]+/, "")} → 200 image/*`, img.status === 200 && /^image\//.test(img.headers.get("content-type") || ""), `${img.status} ${img.headers.get("content-type")}`);
  }

  // The article is never published (that would put it in the feed for a
  // moment); the draft guard is the same check an unpublish relies on.
  step("13. drafts are private; DELETE unpublishes");
  r = await call("GET", `/api/articles/${articleId}`, { key: "" });
  check("draft: unauthenticated GET /api/articles/:id → 404", r.status === 404, r.status);
  r = await call("DELETE", `/api/v1/content/articles/${articleId}?dryRun=true`);
  check("dryRun reports, changes nothing", r.json?.dryRun === true && r.json?.action === "unpublish", r.json);
  r = await call("DELETE", `/api/v1/content/articles/${articleId}`);
  check("soft DELETE → unpublished", r.status === 200 && r.json?.unpublished === true && r.json?.status === "draft", r.json);
  r = await call("GET", `/api/articles/${articleId}`, { key: "" });
  check("unauthenticated GET /api/articles/:id → 404", r.status === 404, r.status);
  r = await call("DELETE", `/api/v1/content/articles/${articleId}`);
  check("repeat soft DELETE → 200", r.status === 200);

  if (KEEP) {
    const kept = (await call("GET", `/api/v1/content/articles/${articleId}`)).json;
    console.log(`\nKept article ${articleId} (draft). Preview: ${BASE}${kept?.previewUrl}`);
    console.log(`Remove it with: node scripts/test-content-api.mjs ${BASE} --cleanup ${articleId}`);
  }
} catch (err) {
  failures++;
  console.error(`\n  ✗ aborted: ${err?.stack || err}`);
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
