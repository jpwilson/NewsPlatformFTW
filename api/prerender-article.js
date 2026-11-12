/**
 * Prerender for crawlers (search engines + social scrapers).
 * Serves complete, indexable article HTML — full body, OG/Twitter tags, and
 * NewsArticle JSON-LD — to bot user-agents (rewritten here via vercel.json),
 * and the same for channel pages (/channels/<id>: name, description, the
 * latest 50 articles, ItemList JSON-LD).
 * Humans never see this; they get the SPA.
 */

import { createClient } from '@supabase/supabase-js';

import { sanitizeArticleHtml } from './_lib/sanitize-article-html.js';
import { recordPageEvent } from './_lib/analytics.js';
import { LIST_COLUMNS, PAGE_SIZE, crawlerName, renderChannelPage, withTimeout } from './_lib/crawler-pages.js';
import { isSafeUrl } from '../shared/article-html-policy.js';
import {
  LAST_EDITED_IS_TRUSTWORTHY,
  composeArticleMedia,
  deriveExcerpt,
  sortImages,
  toMediaUrl,
} from '../shared/article-media.js';

/** Permanent, publicly fetchable image URLs always use the production host. */
const SITE = 'https://www.newsplatform.org';
const FALLBACK_IMAGE = `${SITE}/logo-stacked.png`;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// Service key (bypasses RLS) with anon fallback
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Crawler hits go to page_events (analytics module; never throws). Awaited,
 * because a Vercel function may be frozen once the response is sent, but for
 * at most 250 ms.
 */
const logBotHit = (req, bot, fields) =>
  bot ? withTimeout(recordPageEvent(supabase, req, { kind: 'bot', bot, ...fields }), 250) : Promise.resolve();

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

/**
 * A channel page for crawlers. Published articles only: the service key
 * bypasses RLS, so `.eq('published', true)` is the only guard.
 */
async function channelPage(req, res, { key, bot }) {
  const path = `/channels/${key}`;
  let query = supabase.from('channels').select('id, name, slug, description, profile_image').limit(1);
  query = /^\d+$/.test(key) ? query.eq('id', parseInt(key, 10)) : query.eq('slug', key);
  const { data: channels, error } = await query;
  const channel = !error && Array.isArray(channels) ? channels[0] : null;
  if (!channel) {
    if (error) console.error('Prerender: error fetching channel:', error);
    await logBotHit(req, bot, { path, article_id: null, status: 404 });
    return noStore(res).status(404).end('Channel not found');
  }
  const { data: articles, count, error: listError } = await supabase
    .from('articles')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('channel_id', channel.id)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);
  if (listError) throw listError;
  const html = renderChannelPage({ channel, articles: Array.isArray(articles) ? articles : [], total: count ?? undefined });
  await logBotHit(req, bot, { path, article_id: null, status: 200 });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  return res.status(200).send(html);
}

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
    // The crawler list lives in api/_lib/crawler-pages.js (CRAWLER_TOKENS);
    // check-seo keeps vercel.json's user-agent rewrites in sync with it.
    const bot = crawlerName(userAgent);
    const isCrawler = bot !== null;
    const shouldProcess = isDev || isTestMode || isCrawler;

    if (!shouldProcess) return noStore(res).status(404).end();

    const channelRef = String(path).match(/^\/?channels\/([^/?#]+)\/?$/);
    if (channelRef) {
      let key;
      try {
        key = decodeURIComponent(channelRef[1]);
      } catch {
        return noStore(res).status(404).end();
      }
      return await channelPage(req, res, { key, bot });
    }

    if (!path.includes('/articles/')) {
      return noStore(res).status(404).end();
    }

    const ref = extractArticleRef(path);
    if (!ref) return noStore(res).status(404).end();

    const selectStatement = `
      *,
      channel:channels ( id, name, slug ),
      images:article_images ( id, image_url, caption, order )
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
      await logBotHit(req, bot, { path, article_id: null, status: 404 });
      return noStore(res).status(404).end('Article not found');
    }
    const article = rows[0];

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'newsplatform.org';
    const siteUrl = `${protocol}://${host}`;

    const articleUrl = `${siteUrl}/articles/${encodeURIComponent(article.id)}${
      article.slug ? `/${encodeURIComponent(article.slug)}` : ''
    }`;
    const articleUrlAttr = escapeHtml(articleUrl);

    // Author-supplied body HTML, reduced to the shared allowlist, then the
    // same cover/duplicate decision the SPA makes: the hero shows once, a
    // body copy of it is removed, storage URLs become permanent /media URLs.
    const safeContent = sanitizeArticleHtml(article.content);
    const media = composeArticleMedia({ images: article.images, html: safeContent, origin: SITE });

    // Cards and social previews use the attached cover (lowest order, id).
    const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
    const cover = sortImages(article.images).find((img) => img && (img.image_url || img.imageUrl));
    const coverUrl = cover ? toMediaUrl(cover.image_url || cover.imageUrl, SITE) : null;
    const bodyFirst = media.slides.find((sl) => sl.origin !== 'gallery' && isHttp(sl.src));
    const primaryImage = isHttp(coverUrl) ? coverUrl : bodyFirst ? bodyFirst.src : null;
    const primaryAlt =
      (media.hero && (media.hero.alt || media.hero.caption)) || (bodyFirst && bodyFirst.alt) || article.title || '';
    const ldImages = [...new Set([primaryImage, ...media.slides.map((sl) => sl.src)].filter(isHttp))].slice(0, 3);

    const description = deriveExcerpt(safeContent, 160);
    const title = escapeHtml(article.title || 'News Article');
    const escapedDescription = escapeHtml(description);
    const channel = article.channel || null;
    const channelName = channel?.name || 'NewsPlatform';
    const channelUrl = channel?.id ? `${SITE}/channels/${encodeURIComponent(channel.id)}` : null;
    const publishedAt = article.published_at || article.created_at || null;
    // last_edited is bumped by every view (see shared/article-media.js).
    const modifiedAt = LAST_EDITED_IS_TRUSTWORTHY ? article.last_edited || publishedAt : publishedAt;

    // Other stories from the channel: real links for crawlers to follow.
    let moreFromChannel = [];
    if (channel?.id) {
      const { data: more } = await supabase
        .from('articles')
        .select('id, slug, title, created_at')
        .eq('published', true)
        .eq('channel_id', channel.id)
        .neq('id', article.id)
        .order('created_at', { ascending: false })
        .limit(5);
      moreFromChannel = (Array.isArray(more) ? more : []).filter((a) => a && a.id !== article.id).slice(0, 5);
    }

    // NewsArticle structured data
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: article.title || '',
      description,
      image: ldImages.length ? ldImages : [FALLBACK_IMAGE],
      datePublished: publishedAt,
      dateModified: modifiedAt,
      author: { '@type': 'Organization', name: channelName, ...(channelUrl ? { url: channelUrl } : {}) },
      publisher: {
        '@type': 'Organization',
        name: 'NewsPlatform',
        logo: {
          '@type': 'ImageObject',
          url: `${SITE}/logo-mark.png`,
        },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
      isAccessibleForFree: true,
      ...(article.category ? { articleSection: article.category } : {}),
    };
    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'NewsPlatform', item: `${SITE}/` },
        ...(channelUrl ? [{ '@type': 'ListItem', position: 2, name: channelName, item: channelUrl }] : []),
        { '@type': 'ListItem', position: channelUrl ? 3 : 2, name: article.title || '', item: articleUrl },
      ],
    };

    const figure = (slide, extraClass = '') => {
      const caption = slide.caption ? escapeHtml(slide.caption) : '';
      const credit = slide.credit ? `<small class="credit">${escapeHtml(slide.credit)}</small>` : '';
      return `<figure${extraClass ? ` class="${extraClass}"` : ''}><img src="${safeUrlAttr(slide.src)}" alt="${escapeHtml(
        slide.alt || slide.caption || ''
      )}"${extraClass === 'hero' ? '' : ' loading="lazy"'}>${
        caption || credit ? `<figcaption>${caption}${caption && credit ? ' ' : ''}${credit}</figcaption>` : ''
      }</figure>`;
    };
    const heroHtml = media.hero && isSafeUrl(media.hero.src) ? figure(media.hero, 'hero') : '';
    const dekHtml = media.dek ? `<p class="dek">${escapeHtml(media.dek)}</p>` : '';
    const galleryHtml = media.gallery.length
      ? `<section class="photos"><h2>Photos</h2>${media.gallery.map((sl) => figure(sl)).join('')}</section>`
      : '';
    const moreHtml = moreFromChannel.length
      ? `<section><h2>More from ${escapeHtml(channelName)}</h2><ul>${moreFromChannel
          .map(
            (a) =>
              `<li><a href="${escapeHtml(
                `${SITE}/articles/${encodeURIComponent(a.id)}${a.slug ? `/${encodeURIComponent(a.slug)}` : ''}`
              )}">${escapeHtml(a.title || '')}</a></li>`
          )
          .join('')}</ul></section>`
      : '';

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
    <meta property="og:image" content="${safeUrlAttr(primaryImage || FALLBACK_IMAGE)}" />
    ${primaryImage ? `<meta property="og:image:alt" content="${escapeHtml(primaryAlt)}" />` : ''}
    <meta property="og:site_name" content="NewsPlatform" />
    <meta name="robots" content="max-image-preview:large" />
    ${publishedAt ? `<meta property="article:published_time" content="${escapeHtml(publishedAt)}" />` : ''}
    ${modifiedAt ? `<meta property="article:modified_time" content="${escapeHtml(modifiedAt)}" />` : ''}
    ${article.category ? `<meta property="article:section" content="${escapeHtml(article.category)}" />` : ''}

    <!-- Twitter -->
    <meta name="twitter:card" content="${primaryImage ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${safeUrlAttr(primaryImage || FALLBACK_IMAGE)}" />
    ${primaryImage ? `<meta name="twitter:image:alt" content="${escapeHtml(primaryAlt)}" />` : ''}

    <script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
    <script type="application/ld+json">${jsonLdScript(breadcrumbs)}</script>
    ${refreshTag}
    <style>
      body { font-family: Georgia, serif; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #1a1a1a; }
      img { max-width: 100%; height: auto; }
      figure { margin: 1.5rem 0; }
      figcaption { font-size: 0.85rem; color: #666; }
      figcaption .credit { text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.04em; }
      .dek { font-size: 1.2rem; color: #444; }
      .byline { color: #666; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      ${dekHtml}
      <p class="byline">By ${
        channelUrl ? `<a href="${escapeHtml(channelUrl)}">${escapeHtml(channelName)}</a>` : escapeHtml(channelName)
      }${publishedAt ? ` · <time datetime="${escapeHtml(publishedAt)}">${new Date(publishedAt).toDateString()}</time>` : ''}</p>
      ${heroHtml}
      ${media.bodyHtml || `<p>${escapedDescription}</p>`}
      ${galleryHtml}
    </article>
    <nav>
      ${moreHtml}
      <p><a href="${articleUrlAttr}">Read on NewsPlatform</a> · ${
        channelUrl ? `<a href="${escapeHtml(channelUrl)}">${escapeHtml(channelName)}</a> · ` : ''
      }<a href="${SITE}/latest">Latest stories</a> · <a href="${SITE}/">More stories</a></p>
    </nav>
  </body>
</html>`;

    await logBotHit(req, bot, { path, article_id: article.id, status: 200 });
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
