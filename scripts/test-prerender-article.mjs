#!/usr/bin/env node
/**
 * Regression tests for the crawler article prerenderer (api/prerender-article.js).
 *
 * Runs the real handler against a stub Supabase REST endpoint, so we can assert
 * the two things that must never regress:
 *   1. only published articles are rendered (the service key bypasses RLS, so
 *      the `published=eq.true` filter is the only guard), and
 *   2. author-supplied HTML and titles cannot inject script into the response
 *      or break out of the JSON-LD block.
 *
 *   node scripts/test-prerender-article.mjs
 */

import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

/* ----------------------------------------------------- stub Supabase REST */

let lastQuery = "";
let rows = [];
let moreRows = [];

const supabase = http.createServer((req, res) => {
  // The "more from this channel" query selects only card columns.
  const isMore = decodeURIComponent(req.url).includes("select=id,slug,title,created_at");
  // Only article reads count here: the handler also logs the crawler hit to
  // page_events afterwards, which must not hide the query under test.
  if (!isMore && req.url.startsWith("/rest/v1/articles")) lastQuery = req.url;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(isMore ? moreRows : rows));
});
await new Promise((r) => supabase.listen(0, r));
const port = supabase.address().port;

process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.NODE_ENV = "production";

/* ------------------------------------------------- loadable on Vercel? */

// Vercel's function runtime cannot require() an ES module. sanitize-html is
// CommonJS and require()s htmlparser2, so htmlparser2 must resolve to a
// CommonJS build. A newer Node loads an ESM-only build happily, which is how
// sanitize-html 2.18 (htmlparser2 12, ESM-only) passed here and then crashed
// the function in production: every article answered crawlers with HTTP 500.
// Keep sanitize-html pinned (see SEO.md) until this check passes on a newer one.
{
  const sanitizerRequire = createRequire(createRequire(import.meta.url).resolve("sanitize-html"));
  const entry = sanitizerRequire.resolve("htmlparser2");
  let dir = path.dirname(entry);
  let pkg = {};
  for (;;) {
    const file = path.join(dir, "package.json");
    if (fs.existsSync(file)) {
      pkg = JSON.parse(fs.readFileSync(file, "utf8"));
      if (pkg.type || pkg.name) break;
    }
    if (dir === path.dirname(dir)) break;
    dir = path.dirname(dir);
  }
  const isEsm = entry.endsWith(".mjs") || (pkg.type === "module" && !entry.endsWith(".cjs"));
  if (isEsm) {
    console.error(
      `\n  ✗ sanitize-html would require() an ES module (${entry}).\n` +
        "    That loads on a recent local Node but crashes the Vercel function.\n" +
        "    Pin sanitize-html to a version whose htmlparser2 ships CommonJS.\n"
    );
    process.exit(1);
  }
}

const { default: handler } = await import("../api/prerender-article.js");
const { sanitizeArticleHtml } = await import("../api/_lib/sanitize-article-html.js");

/* ---------------------------------------------------------------- harness */

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body ?? "";
      return this;
    },
    end(body) {
      this.body = body ?? "";
      return this;
    },
  };
  return res;
}

async function get(path, userAgent = "GPTBot/1.0") {
  const res = mockRes();
  await handler(
    { url: path, query: { path }, headers: { "user-agent": userAgent, host: "www.newsplatform.org" } },
    res
  );
  return res;
}

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const published = {
  id: 7,
  slug: "2026-10-20-a-real-story",
  title: "A real story",
  content: "<p>Body copy.</p>",
  published: true,
  category: "Tech",
  created_at: "2026-10-20T10:00:00Z",
  published_at: "2026-10-20T10:00:00Z",
  channel: { id: 1, name: "Desk One", slug: "desk-one" },
  images: [],
};

/* ------------------------------------------------------------------ tests */

console.log("\nprerender-article:");

// 1. Only published articles are queried.
rows = [published];
let res = await get("/articles/7/2026-10-20-a-real-story");
check("renders a published article", res.statusCode === 200 && res.body.includes("A real story"));
check(
  "query filters on published=eq.true",
  lastQuery.includes("published=eq.true"),
  lastQuery
);

// 2. A draft (the stub returns nothing, as the filtered query would) is a 404
//    and is never cached.
rows = [];
res = await get("/articles/8/draft-story");
check("unpublished article → 404", res.statusCode === 404);
check(
  "404 is not CDN-cached",
  /no-store/.test(res.headers["cache-control"] || ""),
  res.headers["cache-control"]
);

// 3. Stored XSS in the body and the title cannot escape.
rows = [
  {
    ...published,
    title: 'Pwn </script><script>alert(1)</script>',
    content:
      '<p>ok</p><script>alert("body")</script><img src=x onerror=alert(2)>' +
      '<a href="javascript:alert(3)">click</a><iframe src="https://evil.example/x"></iframe>' +
      '<div class="article-chart" data-chart="{&quot;type&quot;:&quot;bar&quot;}"></div>' +
      '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>',
  },
];
res = await get("/articles/7/2026-10-20-a-real-story");
const body = res.body;
check("no <script> survives in the body", !/<script>alert/i.test(body));
check("no onerror handler survives", !/onerror/i.test(body));
check("javascript: URL stripped", !/javascript:/i.test(body));
check("off-allowlist iframe stripped", !body.includes("evil.example"));
check("video embed kept", body.includes("youtube-nocookie.com/embed/abc123"));
check("chart placeholder kept", body.includes("data-chart"));
check(
  "title cannot break out of JSON-LD",
  !/<\/script><script>alert\(1\)<\/script>/.test(body)
);

const ld = body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
check("JSON-LD still parses", (() => {
  if (!ld) return false;
  try {
    return JSON.parse(ld[1]).headline.includes("Pwn");
  } catch {
    return false;
  }
})());

// 4. Non-crawler, non-dev requests are not served the prerender.
rows = [published];
res = await get("/articles/7/2026-10-20-a-real-story", "Mozilla/5.0 (a human)");
check("human UA in production → 404 (SPA serves them)", res.statusCode === 404);

// 5. Raw-text elements. The pinned sanitize-html predates the fixes for
//    GHSA-jxwj-j7wr-gfrw (`</textarea/>` mis-close) and GHSA-g8qq-57p8-ggw5
//    (SVG foreign content); neither tag is on our allowlist, and these prove
//    the payloads cannot come back as live markup.
const hostile = [
  '<textarea></textarea/><img src=x onerror=alert(1)>',
  '<textarea>a</textarea/><script>alert(1)</script>',
  '<xmp><img src=x onerror=alert(1)></xmp>',
  '<xmp></xmp/><img src=x onerror=alert(1)>',
  '<svg><textarea><img src=x onerror=alert(1)></textarea></svg>',
  '<svg><style><img src=x onerror=alert(1)></style></svg>',
  '<math><xmp><img src=x onerror=alert(1)></xmp></math>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  '<option><img src=x onerror=alert(1)></option>',
];
const leaked = hostile.filter((html) => {
  const out = sanitizeArticleHtml(html);
  return /<script/i.test(out) || /<[a-z][^>]*\son\w+\s*=/i.test(out) || /<(svg|math|textarea|xmp|noscript|option)\b/i.test(out);
});
check("raw-text element payloads stay inert", leaked.length === 0, leaked.join(" | "));

// 6. Images: cover rule, duplicates, permanent URLs (shared/article-media.js).
const SB = "https://mwrhaqghxatfwzsjjfrv.supabase.co";
const signed = (p) => `${SB}/storage/v1/object/sign/article-images/${p}?token=fixture-token`;
const meta = (html, attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
};
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

{
  const a814 = JSON.parse(fs.readFileSync(new URL("./fixtures/article-814.json", import.meta.url), "utf8"));
  rows = [{ ...published, id: 814, slug: a814.slug, title: a814.title, content: a814.content, images: a814.images.map((im, i) => ({ id: 10 + i, image_url: im.imageUrl, caption: im.caption, order: i })) }];
  moreRows = [];
  res = await get(`/articles/814/${a814.slug}`);
  const html = res.body;
  const MARCH = "26S-Manifestaci%C3%B3n%20por%20la%20vivienda--01.jpg";
  check("814: renders", res.statusCode === 200);
  check("814: the Madrid march photo appears once in the page body", html.split("<body>")[1].split(MARCH).length - 1 === 1, html.split("<body>")[1].split(MARCH).length - 1);
  check("814: hero figure carries the caption", /<figure class="hero"><img[^>]*26S-Manifestaci[^>]*><figcaption>Marchers at a housing demonstration/.test(html));
  check("814: credit split out", html.includes('<small class="credit">Nemo / Wikimedia Commons (CC BY-SA 4.0)</small>'));
  check("814: other figures stay in the body", html.includes("Huelga%20general") && html.includes("Unai%20Sordo"));
  check("814: og:image is the attached cover as a permanent URL", meta(html, "property", "og:image") === "https://www.newsplatform.org/media/api_814_1794486229127_0.jpg", meta(html, "property", "og:image"));
  check("no signed URL or token anywhere", !html.includes("token=") && !html.includes("/object/sign/"));
}
{
  rows = [
    {
      ...published,
      channel: { id: 1, name: "Desk One", slug: "desk-one" },
      last_edited: "2026-11-01T00:00:00Z",
      content: `<p class="article-dek">The standfirst.</p><p>Lede paragraph of the story.</p><figure class="article-figure"><img src="/media/c/cover.jpg" alt="Cover alt"><figcaption>Body copy of the cover</figcaption></figure><p>More.</p>`,
      images: [
        { id: 2, image_url: signed("c/second.jpg"), caption: "Second photo", order: 1 },
        { id: 1, image_url: signed("c/cover.jpg"), caption: "Cover caption. Photo: Agency", order: 0 },
      ],
    },
  ];
  moreRows = [
    { id: 7, slug: "2026-10-20-a-real-story", title: "A real story" },
    { id: 8, slug: "other-story", title: "Other story" },
  ];
  res = await get("/articles/7/2026-10-20-a-real-story");
  const html = res.body;
  check("cover = lowest (order, id) even when rows arrive unordered", meta(html, "property", "og:image") === "https://www.newsplatform.org/media/c/cover.jpg", meta(html, "property", "og:image"));
  check("og:image:alt is the photo's alt text", meta(html, "property", "og:image:alt") === "Cover alt", meta(html, "property", "og:image:alt"));
  check("twitter:image matches", meta(html, "name", "twitter:image") === meta(html, "property", "og:image"));
  check("max-image-preview:large", meta(html, "name", "robots") === "max-image-preview:large");
  const bodyPart = html.split("<body>")[1];
  check("body copy of the cover removed (shown once, as hero)", !html.includes("Body copy of the cover") && bodyPart.split("c/cover.jpg").length - 1 === 1, bodyPart.split("c/cover.jpg").length - 1);
  check("hero caption is the cover's own caption", /<figure class="hero">[^]*?<figcaption>Cover caption\. <small class="credit">Agency<\/small><\/figcaption>/.test(bodyPart));
  check("non-cover attachment in a Photos section after the body", /<section class="photos"><h2>Photos<\/h2><figure><img src="https:\/\/www\.newsplatform\.org\/media\/c\/second\.jpg"/.test(html));
  check("description from the standfirst", meta(html, "name", "description") === "The standfirst.");
  const [ld, crumbs] = ldOf(html);
  check("JSON-LD image: up to three permanent URLs", Array.isArray(ld.image) && ld.image.length === 2 && ld.image.every((u) => u.startsWith("https://www.newsplatform.org/media/")), ld.image);
  check("dateModified = datePublished (last_edited not trusted)", ld.dateModified === ld.datePublished && !html.includes("2026-11-01"), ld.dateModified);
  check("author has the channel URL", ld.author.url === "https://www.newsplatform.org/channels/1");
  check("isAccessibleForFree", ld.isAccessibleForFree === true);
  check("BreadcrumbList", crumbs["@type"] === "BreadcrumbList" && crumbs.itemListElement.length === 3);
  check("links to the channel", html.includes('href="https://www.newsplatform.org/channels/1"'));
  check("links to /latest (every article reachable)", html.includes('href="https://www.newsplatform.org/latest"'));
  check("links to more from the channel, not to itself", html.includes("/articles/8/other-story") && !/<li><a href="[^"]*\/articles\/7\//.test(html));
}
{
  rows = [{ ...published, content: "<p>Plain legacy body with no images at all.</p>", images: [] }];
  moreRows = [];
  res = await get("/articles/7/2026-10-20-a-real-story");
  check("no images: logo fallback on www", meta(res.body, "property", "og:image") === "https://www.newsplatform.org/logo-stacked.png", meta(res.body, "property", "og:image"));
  check("no images: summary card, no hero", meta(res.body, "name", "twitter:card") === "summary" && !res.body.includes('class="hero"'));
  check("no images: body unchanged", res.body.includes("<p>Plain legacy body with no images at all.</p>"));
  rows = [{ ...published, content: '<p>Body.</p><figure><img src="https://ext.example/body.jpg" alt="B"></figure>', images: [] }];
  res = await get("/articles/7/2026-10-20-a-real-story");
  check("no attachment: og:image falls back to the first body image", meta(res.body, "property", "og:image") === "https://ext.example/body.jpg", meta(res.body, "property", "og:image"));
}

supabase.close();
console.log("");
if (failures) {
  console.error(`test-prerender-article: ${failures} failure(s).\n`);
  process.exit(1);
}
console.log("test-prerender-article: all checks passed.\n");
