/**
 * Prerender for crawlers (search engines + social scrapers).
 * Serves complete, indexable article HTML — full body, OG/Twitter tags, and
 * NewsArticle JSON-LD — to bot user-agents (rewritten here via vercel.json).
 * Humans never see this; they get the SPA.
 */

import { createClient } from '@supabase/supabase-js';

import { sanitizeArticleHtml } from './_lib/sanitize-article-html.js';
import { isSafeUrl } from '../shared/article-html-policy.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// Service key (bypasses RLS) with anon fallback
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function isCrawlerUA(userAgent) {
  if (!userAgent) return false;
  // Keep in sync with the user-agent regex in vercel.json.
  return /(GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|PerplexityBot|Perplexity-User|Google-Extended|DuckAssistBot|meta-externalagent|CCBot|Amazonbot|Bytespider|facebookexternalhit|Facebot|Twitterbot|WhatsApp|LinkedInBot|Pinterest|Slackbot|TelegramBot|Discordbot|Applebot|googlebot|bingbot|yandex|baiduspider|duckduckbot|Slurp)/i.test(
    userAgent
  );
}

/**
 * Extract article id or slug from the path.
 * IMPORTANT: slugs are dated (e.g. "2026-06-24-title"), so the numeric-id
 * match must be anchored — `\d+` alone would swallow the year as an "id".
 */
function extractArticleRef(path) {
  if (!path) return null;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // ID-based format: /articles/{id} or /articles/{id}/{slug}
  const idMatch = cleanPath.match(/^\/articles\/(\d+)(?:\/|$)/);
  if (idMatch) return { id: idMatch[1] };
  // Slug-based format: /articles/{slug}
  const slugMatch = cleanPath.match(/^\/articles\/([^\/?#]+)/);
  if (slugMatch) return { slug: decodeURIComponent(slugMatch[1]) };
  return null;
}

function createDescription(content, maxLength = 160) {
  if (!content) return '';
  const text = content.replace(/<[^>]*>/g, ' ');
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (cleanText.length <= maxLength) return cleanText;
  const truncated = cleanText.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > maxLength * 0.7) return truncated.substring(0, lastPeriod + 1);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace) + '...';
}

const escapeHtml = (text) =>
  String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * JSON-LD safe for a <script> element: escaping `<`, `>` and `&` keeps a
 * payload such as a headline containing `</script><script>` from breaking out
 * of the element. The escapes are valid JSON, so parsers are unaffected.
 */
const jsonLdScript = (data) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

/** Attribute value: escaped, and only if the URL scheme is safe. */
const safeUrlAttr = (url, fallback = '') =>
  escapeHtml(isSafeUrl(url) ? url : fallback);

/** Responses that must never be cached by the CDN (404s, drafts, errors). */
const noStore = (res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  return res;
};

export default async function handler(req, res) {
  try {
    // Resolve the requested path
    let path;
    if (req.query && req.query.path) {
      path = req.query.path;
    } else if (req.url) {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      path = urlObj.pathname;
    } else {
      path = req.path || '';
    }

    const userAgent = req.headers['user-agent'] || '';
    const isDev = process.env.NODE_ENV !== 'production';
    const isTestMode = req.query && req.query.forcePrerender === 'true';
    const isCrawler = isCrawlerUA(userAgent);
    const shouldProcess = isDev || isTestMode || isCrawler;

    if (!path.includes('/articles/') || !shouldProcess) {
      return noStore(res).status(404).end();
    }

    const ref = extractArticleRef(path);
    if (!ref) return noStore(res).status(404).end();

    const selectStatement = `
      *,
      channel:channels ( id, name, slug ),
      images:article_images ( image_url, caption, order )
    `;

    // Published only. The Supabase client here uses the service key, which
    // bypasses RLS, so the filter is the only thing keeping drafts and
    // unpublished articles out of a public, CDN-cached response.
    let query = supabase
      .from('articles')
      .select(selectStatement)
      .eq('published', true)
      .limit(1);
    query = ref.id ? query.eq('id', ref.id) : query.eq('slug', ref.slug);
    const { data: rows, error } = await query;

    if (error || !rows || rows.length === 0) {
      if (error) console.error('Prerender: error fetching article:', error);
      return noStore(res).status(404).end('Article not found');
    }
    const article = rows[0];

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'newsplatform.org';
    const siteUrl = `${protocol}://${host}`;

    // Collect image URLs (attached gallery + absolute-ify)
    const toAbsolute = (u) => {
      if (!u) return null;
      if (u.startsWith('//')) return `https:${u}`;
      if (u.startsWith('/')) return `${siteUrl}${u}`;
      if (!u.startsWith('http')) return `${siteUrl}/${u}`;
      return u;
    };
    const imageUrls = (Array.isArray(article.images) ? article.images : [])
      .map((img) => toAbsolute(img && (img.image_url || img.imageUrl)))
      .filter((u) => u && /^https?:\/\//i.test(u));
    const primaryImage = imageUrls[0] || 'https://newsplatform.org/logo-stacked.png';

    const articleUrl = `${siteUrl}/articles/${encodeURIComponent(article.id)}${
      article.slug ? `/${encodeURIComponent(article.slug)}` : ''
    }`;
    const articleUrlAttr = escapeHtml(articleUrl);
    // Author-supplied body HTML, reduced to the shared allowlist.
    const safeContent = sanitizeArticleHtml(article.content);
    const description = createDescription(article.content);
    const title = escapeHtml(article.title || 'News Article');
    const escapedDescription = escapeHtml(description);
    const channelName = article.channel?.name || 'NewsPlatform';
    const publishedAt = article.published_at || article.created_at || null;
    const modifiedAt = article.last_edited || publishedAt;

    // NewsArticle structured data
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: article.title || '',
      description,
      image: imageUrls.length ? imageUrls : [primaryImage],
      datePublished: publishedAt,
      dateModified: modifiedAt,
      author: { '@type': 'Organization', name: channelName },
      publisher: {
        '@type': 'Organization',
        name: 'NewsPlatform',
        logo: {
          '@type': 'ImageObject',
          url: 'https://newsplatform.org/logo-mark.png',
        },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
      ...(article.category ? { articleSection: article.category } : {}),
    };

    // Search engines get the full page with NO redirect (dynamic rendering);
    // humans who land here (dev/test) get a fast redirect to the SPA.
    const refreshTag = isCrawler
      ? ''
      : `<meta http-equiv="refresh" content="1;url=${articleUrlAttr}" />`;

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} — NewsPlatform</title>
    <meta name="description" content="${escapedDescription}" />
    <link rel="canonical" href="${articleUrlAttr}" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${articleUrlAttr}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:image" content="${safeUrlAttr(primaryImage)}" />
    <meta property="og:site_name" content="NewsPlatform" />
    ${publishedAt ? `<meta property="article:published_time" content="${escapeHtml(publishedAt)}" />` : ''}
    ${modifiedAt ? `<meta property="article:modified_time" content="${escapeHtml(modifiedAt)}" />` : ''}
    ${article.category ? `<meta property="article:section" content="${escapeHtml(article.category)}" />` : ''}

    <!-- Twitter -->
    <meta name="twitter:card" content="${imageUrls.length ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${safeUrlAttr(primaryImage)}" />

    <script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
    ${refreshTag}
    <style>
      body { font-family: Georgia, serif; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #1a1a1a; }
      img { max-width: 100%; height: auto; }
      figcaption { font-size: 0.85rem; color: #666; }
      .byline { color: #666; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      <p class="byline">By ${escapeHtml(channelName)}${
        publishedAt ? ` · ${new Date(publishedAt).toDateString()}` : ''
      }</p>
      ${imageUrls.length ? `<img src="${safeUrlAttr(imageUrls[0])}" alt="${title}">` : ''}
      ${safeContent || `<p>${escapedDescription}</p>`}
      <p><a href="${articleUrlAttr}">Read on NewsPlatform</a> · <a href="${escapeHtml(siteUrl)}">More stories</a></p>
    </article>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=600, stale-while-revalidate=3600'
    );
    return res.status(200).send(html);
  } catch (err) {
    console.error('Error in prerender middleware:', err);
    return noStore(res)
      .status(500)
      .send(
        `<html><body><h1>Error processing article</h1><p>${escapeHtml(
          err.message
        )}</p></body></html>`
      );
  }
}
