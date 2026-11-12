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

import { sortImages, toMediaUrl } from "../../shared/article-media.js";

/** Canonical, publicly fetchable host (the apex 308s here). */
export const SITE = "https://www.newsplatform.org";

/** Google News reads articles from the last two days only. */
export const NEWS_WINDOW_HOURS = 48;

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
