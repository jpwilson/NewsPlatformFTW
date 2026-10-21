# SEO and AI answer-engine discoverability

How NewsPlatform is made readable by Google, Bing and the AI answer engines
(ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok), what to do to keep it
that way, and the owner-only steps that still need doing.

Last updated: 21 October 2026.

---

## The bug this replaced

PR #2 added user-agent rewrites in `vercel.json` that were meant to send
GPTBot, Googlebot and friends to `api/prerender-homepage.js`. They never
fired. Vercel's request pipeline checks the **filesystem before it applies
`rewrites`**, and `/` already matched the static `dist/public/index.html`
produced by the `@vercel/static-build` entry in `builds`. The rewrite was
dead code, so every crawler kept getting the empty SPA shell — **1 word** of
visible text on the homepage.

The same ordering explains why the *other* rewrites in that file do work:
`/sitemap.xml`, `/rss.xml`, `/api/*` and `/articles/<id>/<slug>` have no
matching static file, so the rewrite is reached.

The fix does not fight the routing order. The marketing pages are now real
static files, which means the filesystem step is exactly what we want it to
hit, and **every visitor — human or bot — gets the same HTML**. No
user-agent sniffing, so no cloaking risk and nothing to break when a crawler
changes its token.

---

## How prerendering works

```
vite build                 → dist/public/{index.html, assets/*}
tsx scripts/prerender.ts   → dist/public/{index.html, about/index.html, faq/index.html, …}
esbuild api/index.ts       → dist/index.js   (unchanged)
```

`scripts/prerender.ts` runs as part of both `npm run build` and
`npm run vercel-build`. It:

1. Reads the Vite-built `dist/public/index.html` as a template (so the hashed
   `assets/main-*.js` and `assets/main-*.css` tags are always current).
2. Copies it unchanged to **`dist/public/app.html`** — the plain SPA shell.
3. For each page in `client/src/content/marketing.ts`, writes
   `dist/public/<path>/index.html` with per-page `<title>`, meta description,
   absolute canonical, OG/Twitter tags, JSON-LD, and the page's full text
   inside `<div id="root">`.
4. Writes `llms.txt`, `llms-full.txt` and `sitemap-pages.xml`.

React boots on top of the prerendered markup and takes over. The head tags in
the static files carry `data-rh="true"`, so `react-helmet-async` adopts them
on mount instead of leaving duplicates behind.

### Content lives in one place

`client/src/content/marketing.ts` is the single source of truth for every
marketing page: copy, JSON-LD and plain-text rendering. It has **no imports**
so `tsx` can execute it directly, and both the React route
(`client/src/pages/marketing-page.tsx`) and the prerenderer call the same
`renderPageHtml()`. There is no second copy of the copy to drift.

`client/src/content/shell.ts` holds the static header/footer markup. It lives
under `client/src` on purpose: Tailwind's content scanner only looks at
`./client/index.html` and `./client/src/**`, so class names used only in
`scripts/` would be purged from the stylesheet.

### Routing

Three kinds of URL, three answers — no catch-all that serves everything.
`index.html` is the prerendered **homepage**, so sending unknown or app
routes there would give `/channels`, `/profile`, article pages and every typo
URL the homepage's canonical, title and body text.

The app routes live in one place, `shared/spa-routes.js`, and are consumed by
`vercel.json` (production rewrites), `server/vite.ts` (the self-hosted Express
server) and `scripts/serve-dist.mjs` (the local mirror). `scripts/check-seo.mjs`
fails the build if `vercel.json` drifts from that list. `trailingSlash` is
`false`, so `/about/` redirects to the canonical `/about`.

| Request | Served by |
|---|---|
| `/`, `/about`, `/faq`, `/compare/*`, `/alternatives`, … | static prerendered HTML (filesystem) |
| `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/<indexnow-key>.txt` | static files from `client/public` |
| `/sitemap.xml`, `/rss.xml`, `/api/*` | `api/index.ts` via rewrite |
| `/articles/<id>/<slug>` from a bot UA | `api/prerender-article.js` via rewrite |
| app routes (`/profile`, `/admin`, `/channels/<id>`, `/articles/<id>/<slug>`, … — see `shared/spa-routes.js`) | `app.html` (SPA shell) |
| everything else | `api/not-found.js` — a real **404** with `noindex`, not the SPA shell with a 200 |

### Article pages

Articles are database-driven and there are thousands, so they are not
prerendered at build time. `api/prerender-article.js` still serves full HTML
with `NewsArticle` JSON-LD to bot user-agents, matched by the regex in
`vercel.json`. Both lists were widened to the current crawler tokens
(`OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`,
`PerplexityBot`, `Perplexity-User`, `DuckAssistBot`, `Applebot`,
`meta-externalagent`, `CCBot`, …) and made case-tolerant — the old pattern
only had lowercase `googlebot`/`bingbot`, which do not match the real
`Googlebot/2.1` and `bingbot/2.0` strings in a case-sensitive regex.

**Keep the two lists in sync**: the `has.value` regexes in `vercel.json` and
`isCrawlerUA()` in `api/prerender-article.js`.

Two things the prerenderer must keep doing, both covered by
`scripts/test-prerender-article.mjs` (`npm run test:prerender`):

- **Published only.** It queries Supabase with the service key, which bypasses
  RLS, so `.eq("published", true)` is the only thing keeping drafts out of a
  public, CDN-cached response. Anything else is a `404` with `no-store`.
- **Sanitised.** Article bodies are author-supplied. They are filtered against
  the allowlist in `shared/article-html-policy.js` — the same policy the
  browser renderer uses via `client/src/lib/sanitize-article-html.ts`, so the
  SPA and the crawler HTML render the same thing. `<iframe>` is limited to
  YouTube/Vimeo hosts, and JSON-LD is serialised with `<`, `>` and `&`
  escaped so a headline cannot terminate the `<script>` element.

---

## What is on the site now

| URL | What it is |
|---|---|
| `/` | Homepage. Live feed plus a crawler-visible description of what NewsPlatform is. |
| `/about` | What NewsPlatform is, who it is for, how it is funded. |
| `/how-it-works` | Step-by-step for readers and for writers. |
| `/for-writers` | Publishing guide, including what the platform deliberately does not do. |
| `/faq` | 15 questions with FAQPage JSON-LD. |
| `/compare` | Comparison hub (also covers Ground News). |
| `/compare/substack` | NewsPlatform vs Substack. |
| `/compare/medium` | NewsPlatform vs Medium. |
| `/compare/ghost` | NewsPlatform vs Ghost. |
| `/alternatives` | Best platforms for independent journalists — honest round-up. |

Every page carries: unique title and meta description, one `<h1>`, an
absolute self-referencing canonical on `https://www.newsplatform.org`,
OG + `summary_large_image` Twitter tags, `<html lang="en">`, and a JSON-LD
graph. The homepage emits `Organization` + `WebSite` + `WebApplication`;
subpages emit `WebPage` + `BreadcrumbList`; pages with visible FAQs also emit
`FAQPage`. The `WebApplication` `offers` block says `price: "0"` because
publishing and reading really are free — that is the only price claim
anywhere in the structured data. There is deliberately **no
`aggregateRating`**: no real review corpus exists.

Internal linking: a nav strip in the prerendered header and `SiteFooter` on
every marketing page and on the homepage link to all of them, and the
comparison pages cross-link each other.

---

## Verification

```bash
npm ci
npm run check        # tsc
npm run build        # vite build + prerender + esbuild
npm run check:seo    # asserts the built HTML is actually crawlable
npm run test:prerender  # article prerender: published-only + sanitising
```

`scripts/check-seo.mjs` reads `dist/public` and fails if any page is missing a
unique title or description, has zero or multiple canonicals, has anything
other than exactly one `<h1>`, is missing OG/Twitter tags, has JSON-LD that
does not parse, or has 300 or fewer crawler-visible words (script, style,
noscript and svg stripped). It also checks `robots.txt`, `llms.txt`,
`llms-full.txt`, `sitemap-pages.xml`, `app.html` and the IndexNow key file.

It then boots `scripts/serve-dist.mjs` and checks real HTTP responses: each
marketing page at its canonical slashless URL, `/about/` redirecting to
`/about`, app routes getting the canonical-free shell, and genuine 404s for
unknown routes (`/does-not-exist`, `/compare/wordpress`) and missing files
(`/llms-fulll.txt`).

To look at the built site the way Vercel serves it:

```bash
node scripts/serve-dist.mjs 4287   # filesystem → app routes → 404
curl -s http://localhost:4287/faq | grep -c '<h1'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4287/nope   # 404
```

---

## Search Console and Bing Webmaster Tools (owner steps)

These need Jean-Paul to be signed in; nothing here can be automated from the
repo, and **no placeholder verification tokens have been committed**. The
existing `google-site-verification` meta tag in `client/index.html` is a real
one that was already there — leave it alone.

### Google Search Console

1. <https://search.google.com/search-console> → **Add property**.
2. Prefer the **Domain** property (`newsplatform.org`) and add the TXT record
   Google gives you at the DNS provider. It covers www, apex and both
   schemes at once.
3. If DNS is awkward, use the **URL prefix** property for
   `https://www.newsplatform.org/` and the *HTML tag* method: paste the
   `<meta name="google-site-verification" content="…">` line into
   `client/index.html` next to the existing one, deploy, then verify.
4. Submit `https://www.newsplatform.org/sitemap.xml`.
5. Check **Settings → Search generative AI** is left on (default), and watch
   the *Generative AI* performance report.

### Bing Webmaster Tools

1. <https://www.bing.com/webmasters> → **Add site**.
2. The fastest path is **Import from Google Search Console** once GSC is
   verified. Otherwise use the XML file or meta-tag method.
3. Submit the same sitemap URL.
4. Bing's index feeds Copilot and DuckDuckGo and is one of ChatGPT's search
   partners, so this is not optional.

### Other

- **Brave** (which Claude's search uses) crawls independently; links from
  indexed pages are the lever there.
- **Grok** searches X directly — posts from the NewsPlatform account matter
  more than anything in this repo.

---

## IndexNow

A 32-hex key is committed at `client/public/7943e3bc64637f01d2f7ccf9eef61dc3.txt`
(the file's contents are the key, which is how IndexNow verifies ownership).
`vite build` copies it to `dist/public`, so it is served at
<https://www.newsplatform.org/7943e3bc64637f01d2f7ccf9eef61dc3.txt>.

```bash
npm run build
node scripts/indexnow.mjs --dry-run     # print the payload, send nothing
node scripts/indexnow.mjs               # submit the 15 marketing/static URLs
node scripts/indexnow.mjs --sitemap     # also pull every URL from the live sitemap
```

It pings `https://api.indexnow.org/indexnow`, which fans out to Bing, Yandex,
Seznam and Naver. **It has not been run against the live API from this
branch.** Run it after a deploy that changes page content; a 200 or 202 is
success (202 means the key has not been validated yet).

To rotate the key: generate a new 32-hex value, rename the file in
`client/public`, deploy, then re-run. `scripts/indexnow.mjs` finds the key by
globbing for `<32-hex>.txt`, or takes `INDEXNOW_KEY` from the environment.

---

## Adding a new marketing page

1. Add a `MarketingPage` object to `client/src/content/marketing.ts` and push
   it into `MARKETING_PAGES`. Give it a `path`, a unique `title` (50–60 chars,
   brand at the end), a `description` (80–200 chars), an `h1`, a `lead` whose
   first sentence says what the thing is and who it is for, and `sections`.
   Add it to `FOOTER_LINKS` so it is linked from every page.
2. Add a route in `client/src/App.tsx`:
   `<Route path="/new-page" component={marketingRoute("/new-page")} />`.
3. Add it to `PAGES` in `scripts/check-seo.mjs`.
4. Add it to the sitemap URL lists in `api/index.ts` and `server/routes.ts`
   (both generate `/sitemap.xml`; the serverless one is what production uses).
5. `npm run build && npm run check:seo`, then `node scripts/indexnow.mjs`
   after deploying.

Content rules, non-negotiable: only facts that are true of NewsPlatform and
checkable in this repo or on the live site. No invented users, stats,
testimonials, ratings or prices. Competitor facts must be general, publicly
published, linked, hedged ("as of October 2026, per their website") and
dated, and must say where the competitor is stronger.

---

## Known gaps

- **Cached draft responses (owner step).** Before this fix the article
  prerenderer could return an unpublished article to a crawler with
  `s-maxage=600`, so a draft may still sit in the Vercel edge cache for up to
  ten minutes after the next deploy. If a specific draft URL is known to have
  leaked, purge the CDN cache for it in the Vercel dashboard
  (Project → Settings → Data Cache / Purge Everything) after deploying.
- **Unknown paths outside the static build.** `/does-not-exist` and missing
  text files now return a real 404 from `api/not-found.js`. A client-side
  navigation inside the SPA to a bogus route still renders the app's
  `NotFound` component with whatever status the shell was served with; only
  the self-hosted Express path sets 404 on the shell itself.
- **`/advertise`, `/api`, `/privacy`, `/terms`, `/channels`** are still
  client-rendered. They are in the sitemap and Googlebot renders JS, but
  non-JS AI fetchers see only the shell. `/advertise` is the one worth
  prerendering next — it has real published prices.
- **Channel pages** (`/channels/<id>`) have no prerender path. Articles do;
  channels do not.
- **`npm run build` bundles 2.2 MB of JS** for every route including the
  marketing pages. The prerendered text is visible without it, so crawlers
  are unaffected, but LCP for humans would benefit from code-splitting the
  marketing routes away from the editor and admin bundles.
- **Off-site mentions** are the biggest remaining lever for both rankings and
  AI citations, and nothing in this repo can do them.
