# SEO and AI answer-engine discoverability

How NewsPlatform is made readable by Google, Bing and the AI answer engines
(ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok), what to do to keep it
that way, and the owner-only steps that still need doing.

Last updated: 12 November 2026 (crawl paths, news sitemap, IndexNow pings,
monitoring).

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
| `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/<indexnow-key>.txt`, `/site.css` | static files (`client/public`, or written by `scripts/prerender.ts`) |
| `/sitemap.xml`, `/news-sitemap.xml`, `/rss.xml`, `/channels/<id>/rss.xml`, `/latest`, `/api/*` | `api/index.ts` via rewrite |
| `/articles/<id>/<slug>` and `/channels/<id>` from a bot UA | `api/prerender-article.js` via rewrite (`?path=`) |
| `/media/<path>` | `api/media.js` (permanent image URLs) |
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

**One crawler list, two places**: `CRAWLER_TOKENS` in
`api/_lib/crawler-pages.js` (the prerenderer asks `crawlerName()` whether it
is talking to a crawler) and the `has.value` regex of every user-agent
rewrite in `vercel.json` (articles and channels). `npm run check:seo` fails if
the rewrites do not all carry the identical regex, if its tokens differ from
`CRAWLER_TOKENS` (case aside), or if a crawler rewrite sits after the SPA
rewrite for the same path (it would never fire). Add a crawler in both places.

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

### Crawl paths: `/latest` and channel pages

A crawler that lands on one article must be able to reach every other one by
following plain links. Two server-rendered pages do that; both list published
articles only (the service key bypasses row-level security, so the
`published = true` filter is the only guard; `npm run test:seo` checks it):

- **`/latest`** (`api/index.ts`, `renderLatestPage` in
  `api/_lib/crawler-pages.js`): every published article, newest first, 50 a
  page (`/latest?page=2`, …) with `rel="prev"`/`rel="next"`, a canonical per
  page, `CollectionPage` + `ItemList` JSON-LD. Each entry is a link with the
  title, channel, date and an excerpt. **The same HTML for every visitor**, so
  no user-agent sniffing. Pages past the end are a 404 with `noindex`.
  Linked from the footer and header (`FOOTER_LINKS`), `llms.txt` and every
  article crawler page.
- **`/channels/<id>`** for crawlers (`api/prerender-article.js`,
  `renderChannelPage`): the channel name, description, latest 50 articles as
  links, `ItemList` JSON-LD, canonical and RSS link. People get the SPA, as
  for articles. It is served by the article prerender function on purpose: it
  uses the same `?path=` rewrite that is proven in production.

Both pages wear the marketing pages' static header and footer.
`scripts/gen-site-shell.ts` turns `client/src/content/shell.ts` into plain
strings in `api/_lib/site-shell.js` (the functions cannot import TypeScript),
and `scripts/prerender.ts` writes the built stylesheet to `/site.css` under a
stable name (the functions cannot know the hashed one). **After changing
`FOOTER_LINKS` or `shell.ts`, run `npm run gen:shell`**; `check:seo` fails
until you do. The list itself is styled by a small inline stylesheet
(`np-*` classes), because Tailwind keeps only class names it finds under
`client/src`.

Crawler hits on article, channel and `/latest` pages are logged through
`recordPageEvent(…, { kind: "bot", bot, path, article_id, status })`
(`api/_lib/analytics.js`), awaited for at most 250 ms.

### Sitemaps and feeds

| URL | Contents |
|---|---|
| `/sitemap.xml` | Home, marketing pages, every channel and every published article. Read from the database in pages of 1,000 (one large query is silently cut at Supabase's row cap). Each article carries `lastmod` = its publish date and its cover as `image:image` (absolute `/media/` URL). |
| `/news-sitemap.xml` | Google News: published articles from the last 48 hours (at most 1,000), with `news:publication` (NewsPlatform, `en`), `news:publication_date`, `news:title` and the cover as `image:image`. Empty (but valid) when nothing was published in 48 hours. |
| `/rss.xml`, `/channels/<id>/rss.xml` | The latest 50 articles: `description` is the excerpt (standfirst or first paragraph), `content:encoded` the full body through the server sanitiser with absolute `/media/` photo URLs, `enclosure` the cover, plus `atom:link rel="self"`. |

`robots.txt` lists both sitemaps and, in every group, `Allow: /api/ai/`
directly before `Disallow: /api/`, so the public AI endpoint advertised in
`llms.txt` and `docs/newsplatform-mcp.json` is crawlable while the rest of the
JSON API is not. `check:seo` asserts both.

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
| `/latest` | Every published article, newest first, 50 a page (server-rendered for everyone). |

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
npm run test:seo     # sitemaps, news sitemap, /latest, channel pages, RSS, IndexNow (offline)
npm run check:live   # AFTER a deploy: do crawlers really get the article pages?
```

`npm run check:live` is the only check that talks to the deployed site (plain
GET requests). It takes the newest article URLs from the live sitemap and
requests each as Googlebot, GPTBot and Twitterbot, failing unless every one
returns a full page with `NewsArticle` JSON-LD, an `og:image` and a canonical
link. It then fetches each article's `og:image` (must answer 200 with an
`image/*` type and must not be a signed, expiring Supabase URL), and checks
that `/sitemap.xml`, `/rss.xml`, `/news-sitemap.xml` and `/latest` answer 200
with the right content type and that a channel page served to Googlebot has
`ItemList` data and a canonical. Pass a URL to test another deployment:
`node scripts/check-live.mjs https://<preview>` (its `/media/` photos are then
fetched from that deployment). Run it after every deploy that touches `api/`,
`vercel.json` or `package.json` — see "The October 2026 crawler outage"
below for why. It also runs on a schedule (see "Monitoring").

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
4. Submit `https://www.newsplatform.org/sitemap.xml` **and**
   `https://www.newsplatform.org/news-sitemap.xml` (Sitemaps → Add a new
   sitemap, one at a time).
5. Check **Settings → Search generative AI** is left on (default), and watch
   the *Generative AI* performance report.

### Bing Webmaster Tools

1. <https://www.bing.com/webmasters> → **Add site**.
2. The fastest path is **Import from Google Search Console** once GSC is
   verified. Otherwise use the XML file or meta-tag method.
3. Submit the same two sitemap URLs.
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
Seznam and Naver. **It has never been run.** Run it after a deploy that
changes page content; a 200 or 202 is success (202 means the key has not been
validated yet).

### Automatic pings

Articles ping IndexNow by themselves (`api/_lib/indexnow.js`,
`pingIndexNow`): when one is published, edited while published, unpublished
or deleted, through the editor or the Content API
(`announceArticleChange` in `api/_lib/article-service.js`). The ping lists
the article URL (old and new when the slug changed), its channel page and
`/latest`. It runs only when `VERCEL_ENV` is `production` (previews, local
runs and tests never ping), waits at most 2 seconds and never fails the
request. The key is the constant `INDEXNOW_KEY`; `check:seo` fails if it does
not match the key file, so rotate both together. Changing only an article's
photos through the editor does not ping (the editor's save also edits the
article, which does).

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
3. Add it to `PAGES` in `scripts/check-seo.mjs`. Adding it to `FOOTER_LINKS`
   also changes the header and footer of `/latest` and the channel pages:
   run `npm run gen:shell`.
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

## The October 2026 crawler outage

From 24 October to the deploy of the fix in November 2026, **every article
URL answered crawlers with HTTP 500**: Google, Bing, the AI answer engines and
the social scrapers (so links shared on X, Facebook, LinkedIn, WhatsApp and
Slack showed no preview card). Human readers were unaffected, which is why
nothing looked wrong.

Cause: `api/prerender-article.js` sanitises article HTML with `sanitize-html`,
a CommonJS package. Version 2.18 moved to `htmlparser2` 12, which is published
as ES modules only. Vercel's function runtime cannot `require()` an ES module,
so the function crashed while loading (`ERR_REQUIRE_ESM`) before it could
handle a request. A recent local Node loads the same code without complaint,
so the tests passed.

What is in place now:

- `sanitize-html` is pinned to exactly **2.17.5**, the last release whose
  `htmlparser2` (10.x) ships a CommonJS build. Do not loosen the pin or bump
  it until `npm run test:prerender` passes with the new version: its first
  step checks that `htmlparser2` resolves to CommonJS and stops with an
  explanation if it does not.
- The advisories fixed after 2.17.5 (`</textarea/>` mis-close, SVG foreign
  content, `<noscript>` discard, `<meta http-equiv>`) concern elements that
  are not on the allowlist in `shared/article-html-policy.js`.
  `test:prerender` feeds those payloads through the real sanitiser and fails
  if any comes back as live markup. If the allowlist ever gains `svg`,
  `math`, `textarea`, `xmp`, `noscript` or `meta`, upgrade first.
- `npm run check:live` (above) tests the deployed site, which is the only
  place this class of failure shows up, and `.github/workflows/site-health.yml`
  runs it every six hours (see "Monitoring").
- `api/index.ts` loads the sanitiser lazily (it sanitises article HTML on
  write and for RSS): if `sanitize-html` ever fails to load again, article
  writes and the feeds fail, not the whole API.

---

## Monitoring

`.github/workflows/site-health.yml` runs `node scripts/check-live.mjs` against
production every six hours (at 23 minutes past 00, 06, 12 and 18 UTC) and on
demand (Actions → Site health → Run workflow). It needs no secrets and no
Vercel or Supabase settings. A failed run makes GitHub email whoever last
changed the workflow's schedule, so the owner should make that change (or
start it once by hand from their account), and keep *Settings →
Notifications → Actions → failed workflows* switched on. GitHub pauses
scheduled workflows in a repository with no activity for 60 days; the
Actions tab shows a banner to re-enable it.

`check-live.mjs --baseline` (or `CHECK_BASELINE=1`) skips the checks for what
the SEO branch added (`/news-sitemap.xml`, `/latest`, channel crawler pages,
and the "og:image is not a signed URL" rule). It exists only to test the
script against a deployment from before that branch. **Once the branch is
deployed to production, do not use it** (the scheduled workflow never does,
and `check:seo` fails if it is added there); it can be deleted from the
script at any time after that deploy.

---

## After merging the SEO branch (owner steps)

1. Deploy, then run `node scripts/check-live.mjs` (no flag) and expect every
   check to pass.
2. Google Search Console and Bing Webmaster Tools: submit
   `https://www.newsplatform.org/news-sitemap.xml` next to the existing
   `/sitemap.xml` (steps above). The news sitemap helps Google find new
   articles fast; whether they appear in Google News is Google's decision
   (its content policies apply). The
   [Publisher Center](https://publishercenter.google.com/) is optional.
3. Run IndexNow once for the whole site: `npm run build && node
   scripts/indexnow.mjs --sitemap` (a 200 or 202 is success). From then on,
   articles ping by themselves.
4. Open Actions → Site health → Run workflow once, from the owner's account,
   and check the run is green. That also makes the owner the person GitHub
   emails when it fails.

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
- **`npm run build` bundles 2.2 MB of JS** for every route including the
  marketing pages. The prerendered text is visible without it, so crawlers
  are unaffected, but LCP for humans would benefit from code-splitting the
  marketing routes away from the editor and admin bundles.
- **Off-site mentions** are the biggest remaining lever for both rankings and
  AI citations, and nothing in this repo can do them.
