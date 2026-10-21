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

import http from "node:http";

/* ----------------------------------------------------- stub Supabase REST */

let lastQuery = "";
let rows = [];

const supabase = http.createServer((req, res) => {
  lastQuery = req.url;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(rows));
});
await new Promise((r) => supabase.listen(0, r));
const port = supabase.address().port;

process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.NODE_ENV = "production";

const { default: handler } = await import("../api/prerender-article.js");

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

supabase.close();
console.log("");
if (failures) {
  console.error(`test-prerender-article: ${failures} failure(s).\n`);
  process.exit(1);
}
console.log("test-prerender-article: all checks passed.\n");
