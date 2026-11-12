/**
 * Crawl paths: the sitemaps' article entries, the Google News sitemap, and
 * (see below) the /latest archive and the crawler HTML for channel pages.
 *
 * Plain ESM with no npm imports (see SEO.md, "The October 2026 crawler
 * outage"); imported by api/index.ts as ./_lib/crawler-pages.js.
 *
 * Every query that feeds these pages runs with the service key, which
 * bypasses row-level security: the `published = true` filter in the caller is
 * the only thing keeping drafts out. scripts/test-seo-routes.mjs checks it.
 */

import { deriveExcerpt, sortImages, toMediaUrl } from "../../shared/article-media.js";
import {
  SITE_FOOTER_HTML,
  SITE_HEADER_HTML,
  SITE_HEADER_LATEST_HTML,
  SITE_STYLESHEET,
} from "./site-shell.js";

/** Canonical, publicly fetchable host (the apex 308s here). */
export const SITE = "https://www.newsplatform.org";

/** Google News reads articles from the last two days only. */
export const NEWS_WINDOW_HOURS = 48;

/** Articles per /latest page, and on a channel's crawler page. */
export const PAGE_SIZE = 50;

/** Article columns the lists need (the body only feeds the excerpt). */
export const LIST_COLUMNS = "id, slug, title, content, category, created_at, published_at";

/* ------------------------------------------------------------- crawlers */

/**
 * Crawler and link-preview user agents. The same tokens appear in the
 * `user-agent` rewrites in vercel.json (articles and channels);
 * scripts/check-seo.mjs fails if the lists drift apart.
 */
export const CRAWLER_TOKENS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "DuckAssistBot", "meta-externalagent",
  "CCBot", "Amazonbot", "Bytespider", "facebookexternalhit", "Facebot", "Twitterbot", "WhatsApp",
  "LinkedInBot", "Pinterest", "Slackbot", "TelegramBot", "Discordbot", "Applebot", "googlebot",
  "bingbot", "yandex", "baiduspider", "duckduckbot", "Slurp",
];

const CRAWLER_RE = new RegExp(`(${CRAWLER_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i");

/** The crawler token in a user agent (as listed above), or null. */
export function crawlerName(userAgent) {
  const m = typeof userAgent === "string" ? userAgent.match(CRAWLER_RE) : null;
  if (!m) return null;
  const lower = m[1].toLowerCase();
  return CRAWLER_TOKENS.find((t) => t.toLowerCase() === lower) || m[1];
}

export const isCrawlerUA = (userAgent) => crawlerName(userAgent) !== null;

/** Wait for `promise`, but never longer than `ms`; never rejects. */
export function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch(() => undefined),
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `/articles/<id>/<slug>` (slug omitted when missing). */
export function articlePath(article) {
  const id = encodeURIComponent(String(article.id));
  return `/articles/${id}${article.slug ? `/${encodeURIComponent(article.slug)}` : ""}`;
}

export const articleUrl = (article, site = SITE) => `${site}${articlePath(article)}`;

/** The publish date shown and sent everywhere (published_at, else created_at). */
export const publishedAt = (article) => article.published_at || article.created_at || null;

/**
 * Absolute URL of the attached cover (lowest (order, id)): our photos become
 * permanent `/media/` URLs on the production host. Null when there is no
 * http(s) cover.
 * @param {{ image_url?: string, imageUrl?: string }[] | null | undefined} images
 */
export function coverImageUrl(images, site = SITE) {
  const cover = sortImages(images || []).find((img) => img && (img.image_url || img.imageUrl));
  if (!cover) return null;
  const url = toMediaUrl(cover.image_url || cover.imageUrl, site);
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Every row of a query, read in pages. Supabase caps a response at its
 * max-rows setting (1,000 by default), so a single large `limit` silently
 * truncates. This keeps reading until a page comes back empty, so a lower cap
 * than `pageSize` cannot truncate either.
 * @param {() => any} makeQuery returns a fresh, ordered PostgREST query builder
 * @returns {Promise<any[]>}
 */
export async function fetchAllRows(makeQuery, { pageSize = 1000, maxRows = 50000 } = {}) {
  const rows = [];
  while (rows.length < maxRows) {
    const from = rows.length;
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data);
  }
  return rows.slice(0, maxRows);
}

/** `<image:image>` for an article's cover, or "". */
export function sitemapImageXml(images, site = SITE) {
  const url = coverImageUrl(images, site);
  return url ? `<image:image><image:loc>${xmlEscape(url)}</image:loc></image:image>` : "";
}

/**
 * The Google News sitemap for the given (already filtered: published, last 48
 * hours) articles.
 * https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
export function newsSitemapXml(articles, site = SITE) {
  const urls = (articles || [])
    .map((a) => {
      const date = publishedAt(a);
      return `<url><loc>${xmlEscape(articleUrl(a, site))}</loc><news:news><news:publication><news:name>NewsPlatform</news:name><news:language>en</news:language></news:publication>${
        date ? `<news:publication_date>${xmlEscape(new Date(date).toISOString())}</news:publication_date>` : ""
      }<news:title>${xmlEscape(a.title || "")}</news:title></news:news>${sitemapImageXml(a.images, site)}</url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;
}

/* ------------------------------------------------------------ HTML pages */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** JSON-LD that cannot close its own <script> element. */
const jsonLd = (data) =>
  JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const isoDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};

/** Text-only excerpt of an article body (the body itself is never echoed). */
export const articleExcerpt = (article, max = 220) => deriveExcerpt(String(article.content || ""), max);

/**
 * Own styles for the list. Only the header and footer use Tailwind classes:
 * Tailwind keeps just the class names it finds under client/src, so classes
 * used only here would be missing from the built stylesheet.
 */
const PAGE_STYLE = `
  .np-page { max-width: 48rem; margin: 0 auto; padding: 2.5rem 1rem 1rem; }
  .np-page h1 { font-family: "Playfair Display", Georgia, serif; font-size: 2.25rem; line-height: 1.15; font-weight: 800; margin: 0; }
  .np-lead { margin: .75rem 0 0; color: hsl(var(--muted-foreground, 0 0% 40%)); line-height: 1.6; }
  .np-lead a, .np-meta a, .np-more a { color: inherit; text-underline-offset: 2px; }
  .np-list { list-style: none; margin: 2rem 0 0; padding: 0; border-top: 1px solid hsl(var(--edition-border-hair, 0 0% 90%)); }
  .np-item { padding: 1.25rem 0; border-bottom: 1px solid hsl(var(--edition-border-hair, 0 0% 90%)); }
  .np-item h2 { font-family: "Playfair Display", Georgia, serif; font-size: 1.3rem; line-height: 1.3; font-weight: 700; margin: 0; }
  .np-item h2 a { color: inherit; text-decoration: none; }
  .np-item h2 a:hover, .np-item h2 a:focus-visible { text-decoration: underline; }
  .np-meta { margin: .4rem 0 0; font-size: .85rem; color: hsl(var(--muted-foreground, 0 0% 40%)); }
  .np-excerpt { margin: .5rem 0 0; line-height: 1.6; }
  .np-pager { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .75rem; margin: 2.5rem 0 0; font-size: .95rem; }
  .np-pager a { display: inline-block; padding: .55rem 1rem; border: 1px solid hsl(var(--edition-border-hair, 0 0% 85%)); border-radius: .5rem; color: inherit; text-decoration: none; }
  .np-pager a:hover, .np-pager a:focus-visible { background: hsl(var(--edition-panel, 0 0% 97%)); }
  .np-pager .np-count { color: hsl(var(--muted-foreground, 0 0% 40%)); }
  .np-more { margin: 2rem 0 0; }
  @media (max-width: 640px) { .np-page h1 { font-size: 1.85rem; } .np-item h2 { font-size: 1.15rem; } }
`;

/**
 * One article in a list: a link with the title, the channel, the date and
 * a short excerpt. `channel` comes from the embed, or is passed in.
 */
export function articleListItemHtml(article, { channel = article.channel, site = SITE } = {}) {
  const ch = Array.isArray(channel) ? channel[0] : channel;
  const date = isoDate(publishedAt(article));
  const excerpt = articleExcerpt(article);
  const meta = [
    ch && ch.id != null
      ? `<a href="${escapeHtml(`${site}/channels/${encodeURIComponent(ch.id)}`)}">${escapeHtml(ch.name || "Channel")}</a>`
      : "",
    article.category ? escapeHtml(article.category) : "",
    date ? `<time datetime="${escapeHtml(date.toISOString())}">${escapeHtml(DATE_FMT.format(date))}</time>` : "",
  ].filter(Boolean);
  return `<li class="np-item"><article><h2><a href="${escapeHtml(articleUrl(article, site))}">${escapeHtml(
    article.title || "Untitled"
  )}</a></h2>${meta.length ? `<p class="np-meta">${meta.join(" · ")}</p>` : ""}${
    excerpt ? `<p class="np-excerpt">${escapeHtml(excerpt)}</p>` : ""
  }</article></li>`;
}

/** ItemList JSON-LD for a list of articles, positions starting at `offset + 1`. */
export function itemListJsonLd(articles, { name, url, offset = 0, total, site = SITE } = {}) {
  return {
    "@type": "ItemList",
    name,
    url,
    ...(typeof total === "number" ? { numberOfItems: total } : {}),
    itemListElement: (articles || []).map((a, i) => ({
      "@type": "ListItem",
      position: offset + i + 1,
      url: articleUrl(a, site),
      name: a.title || "",
    })),
  };
}

/** A complete page in the site's static shell. */
function documentHtml({ title, description, canonical, head = "", header, main, image, ld }) {
  const img = image || `${SITE}/logo-stacked.png`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    ${head}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="NewsPlatform" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(img)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(img)}" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#111111" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Playfair+Display:wght@700;800;900&amp;display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${SITE_STYLESHEET}" />
    <link rel="alternate" type="application/rss+xml" title="NewsPlatform" href="${SITE}/rss.xml" />
    <style>${PAGE_STYLE}</style>
    <script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", ...ld })}</script>
  </head>
  <body class="font-sans antialiased bg-background text-foreground">
    <div class="min-h-screen bg-background">${header}<main class="np-page" id="main">${main}</main>${SITE_FOOTER_HTML.replace(
      "{{YEAR}}",
      String(new Date().getUTCFullYear())
    )}</div>
  </body>
</html>`;
}

/** `/latest` or `/latest?page=N`. */
export const latestUrl = (page, site = SITE) => `${site}/latest${page > 1 ? `?page=${page}` : ""}`;

/**
 * The /latest archive: every published article, newest first, PAGE_SIZE to
 * a page, with rel prev/next. Real HTML for every visitor.
 * @param {{ articles: any[], page: number, total: number }} input
 */
export function renderLatestPage({ articles, page, total }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const canonical = latestUrl(page);
  const prev = page > 1 ? latestUrl(page - 1) : null;
  const next = page < totalPages ? latestUrl(page + 1) : null;
  const pageLabel = page > 1 ? ` (page ${page} of ${totalPages})` : "";
  const title = `Latest stories${page > 1 ? `, page ${page}` : ""} — NewsPlatform`;
  const description = `Every story published on NewsPlatform by its independent channels, newest first${pageLabel}.`;
  const offset = (page - 1) * PAGE_SIZE;
  const list = articles.length
    ? `<ol class="np-list" start="${offset + 1}">${articles.map((a) => articleListItemHtml(a)).join("")}</ol>`
    : `<p class="np-lead">No stories have been published yet.</p>`;
  const pager =
    totalPages > 1
      ? `<nav class="np-pager" aria-label="Pages">${prev ? `<a href="${escapeHtml(prev)}" rel="prev">← Newer stories</a>` : "<span></span>"}<span class="np-count">Page ${page} of ${totalPages}</span>${
          next ? `<a href="${escapeHtml(next)}" rel="next">Older stories →</a>` : "<span></span>"
        }</nav>`
      : "";
  const main = `<h1>Latest stories</h1>
<p class="np-lead">Every article published on NewsPlatform, newest first${pageLabel}. Also as <a href="${SITE}/rss.xml">RSS</a>; the <a href="${SITE}/channels">channel directory</a> lists who writes them.</p>
${list}
${pager}`;
  return documentHtml({
    title,
    description,
    canonical,
    head: [prev ? `<link rel="prev" href="${escapeHtml(prev)}" />` : "", next ? `<link rel="next" href="${escapeHtml(next)}" />` : ""]
      .filter(Boolean)
      .join("\n    "),
    header: SITE_HEADER_LATEST_HTML,
    main,
    ld: {
      "@type": "CollectionPage",
      name: title,
      url: canonical,
      isPartOf: { "@type": "WebSite", name: "NewsPlatform", url: `${SITE}/` },
      mainEntity: itemListJsonLd(articles, { name: "Latest stories", url: canonical, offset, total }),
    },
  });
}

/**
 * A channel page for crawlers: name, description, the latest PAGE_SIZE
 * articles as links, ItemList JSON-LD and a canonical. Humans get the SPA.
 * @param {{ channel: any, articles: any[], total?: number }} input
 */
export function renderChannelPage({ channel, articles, total }) {
  const canonical = `${SITE}/channels/${encodeURIComponent(channel.id)}`;
  const name = String(channel.name || "Channel");
  const about = String(channel.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  const description = (about || `Latest articles from ${name} on NewsPlatform.`).slice(0, 300);
  const rss = `${canonical}/rss.xml`;
  const imageUrl = channel.profile_image ? toMediaUrl(channel.profile_image, SITE) : null;
  const image = typeof imageUrl === "string" && /^https:\/\//i.test(imageUrl) ? imageUrl : null;
  const list = articles.length
    ? `<ol class="np-list">${articles.map((a) => articleListItemHtml(a, { channel })).join("")}</ol>`
    : `<p class="np-lead">${escapeHtml(name)} has not published any stories yet.</p>`;
  const count = typeof total === "number" && total > articles.length ? ` The latest ${articles.length} of ${total} are listed here.` : "";
  const main = `<h1>${escapeHtml(name)}</h1>
${about ? `<p class="np-lead">${escapeHtml(about)}</p>` : ""}
<p class="np-meta">A channel on NewsPlatform.${escapeHtml(count)} Follow it by <a href="${escapeHtml(rss)}">RSS</a>.</p>
${list}
<p class="np-more"><a href="${SITE}/latest">All stories on NewsPlatform</a> · <a href="${SITE}/channels">All channels</a></p>`;
  return documentHtml({
    title: `${name} — NewsPlatform`,
    description,
    canonical,
    head: `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(name)}" href="${escapeHtml(rss)}" />`,
    header: SITE_HEADER_HTML,
    main,
    image,
    ld: {
      "@type": "CollectionPage",
      name,
      description,
      url: canonical,
      isPartOf: { "@type": "WebSite", name: "NewsPlatform", url: `${SITE}/` },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NewsPlatform", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Channels", item: `${SITE}/channels` },
          { "@type": "ListItem", position: 3, name, item: canonical },
        ],
      },
      mainEntity: itemListJsonLd(articles, { name: `Latest from ${name}`, url: canonical, total }),
    },
  });
}
