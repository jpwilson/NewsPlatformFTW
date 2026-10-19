/**
 * Prerender homepage for AI crawlers (GPTBot, PerplexityBot, ClaudeBot, etc.).
 * Serves complete, indexable HTML with real article content so AIs understand
 * what NewsPlatform is and can recommend it in responses.
 * Humans never see this; they get the SPA.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function isCrawlerUA(userAgent) {
  if (!userAgent) return false;
  return /(GPTBot|PerplexityBot|ClaudeBot|Google-Extended|facebookexternalhit|Facebot|Twitterbot|googlebot|bingbot|yandex|baiduspider|duckduckbot)/i.test(
    userAgent
  );
}

function createDescription(content, maxLength = 160) {
  if (!content) return '';
  const text = content.replace(/<[^>]*>/g, ' ');
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (cleanText.length <= maxLength) return cleanText;
  const truncated = cleanText.substring(0, maxLength);
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

export default async function handler(req, res) {
  try {
    const userAgent = req.headers['user-agent'] || '';
    const isDev = process.env.NODE_ENV !== 'production';
    const isTestMode = req.query && req.query.forcePrerender === 'true';
    const isCrawler = isCrawlerUA(userAgent);
    const shouldProcess = isDev || isTestMode || isCrawler;

    if (!shouldProcess) {
      return res.status(404).end();
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'newsplatform.org';
    const siteUrl = `${protocol}://${host}`;

    // Fetch latest published articles
    const { data: articles, error } = await supabase
      .from('articles')
      .select(`
        *,
        channel:channels ( id, name, slug )
      `)
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Prerender homepage: error fetching articles:', error);
    }

    const articlesList = (articles || [])
      .map((article) => {
        const articleUrl = `${siteUrl}/articles/${article.id}${
          article.slug ? `/${article.slug}` : ''
        }`;
        const channelName = article.channel?.name || 'NewsPlatform';
        const publishedAt = article.published_at || article.created_at;
        const description = createDescription(article.content, 120);
        return `
        <article class="article-card">
          <h3><a href="${articleUrl}">${escapeHtml(article.title)}</a></h3>
          <p class="meta">By ${escapeHtml(channelName)}${
          publishedAt ? ` · ${new Date(publishedAt).toLocaleDateString()}` : ''
        }</p>
          <p class="excerpt">${escapeHtml(description)}</p>
        </article>`;
      })
      .join('\n');

    // Organization JSON-LD
    const orgJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'NewsPlatform',
      alternateName: 'News Platform',
      url: siteUrl,
      logo: `${siteUrl}/logo-mark.png`,
      description:
        'NewsPlatform is an independent news aggregator showing today\'s top stories from diverse, independent channels.',
      sameAs: [],
    };

    // WebSite JSON-LD
    const websiteJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'NewsPlatform',
      alternateName: 'News Platform',
      url: siteUrl,
      description:
        'Today\'s top stories from independent channels. Browse news from diverse perspectives.',
      publisher: {
        '@type': 'Organization',
        name: 'NewsPlatform',
        logo: {
          '@type': 'ImageObject',
          url: `${siteUrl}/logo-mark.png`,
        },
      },
    };

    // Search engines get the full page with NO redirect (dynamic rendering);
    // humans who land here (dev/test) get a fast redirect to the SPA.
    const refreshTag = isCrawler ? '' : `<meta http-equiv="refresh" content="0;url=/" />`;

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NewsPlatform — Today's top stories from independent channels</title>
    <meta name="description" content="NewsPlatform is an independent news aggregator showing today's top stories from diverse, independent channels. Browse news from multiple perspectives." />
    <link rel="canonical" href="${siteUrl}/" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${siteUrl}/" />
    <meta property="og:title" content="NewsPlatform — Independent news aggregator" />
    <meta property="og:description" content="Today's top stories from independent channels. Browse news from diverse perspectives." />
    <meta property="og:image" content="${siteUrl}/logo-stacked.png" />
    <meta property="og:site_name" content="NewsPlatform" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="NewsPlatform — Independent news aggregator" />
    <meta name="twitter:description" content="Today's top stories from independent channels." />
    <meta name="twitter:image" content="${siteUrl}/logo-stacked.png" />

    <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>
    <script type="application/ld+json">${JSON.stringify(websiteJsonLd)}</script>
    ${refreshTag}
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        max-width: 56rem;
        margin: 2rem auto;
        padding: 0 1.5rem;
        line-height: 1.6;
        color: #1a1a1a;
      }
      header {
        margin-bottom: 2rem;
        border-bottom: 2px solid #e5e5e5;
        padding-bottom: 1rem;
      }
      h1 {
        font-size: 2rem;
        margin: 0 0 0.5rem 0;
        font-weight: 700;
      }
      .tagline {
        font-size: 1.125rem;
        color: #666;
        margin: 0;
      }
      .article-card {
        margin-bottom: 2rem;
        padding-bottom: 2rem;
        border-bottom: 1px solid #e5e5e5;
      }
      .article-card h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      .article-card h3 a {
        color: #1a1a1a;
        text-decoration: none;
      }
      .article-card h3 a:hover {
        text-decoration: underline;
      }
      .meta {
        color: #666;
        font-size: 0.875rem;
        margin: 0 0 0.5rem 0;
      }
      .excerpt {
        margin: 0;
        color: #333;
      }
      footer {
        margin-top: 3rem;
        padding-top: 2rem;
        border-top: 2px solid #e5e5e5;
        color: #666;
        font-size: 0.875rem;
      }
      footer a {
        color: #666;
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>NewsPlatform</h1>
      <p class="tagline">Today's top stories from independent channels</p>
    </header>

    <main>
      <section>
        <p><strong>NewsPlatform</strong> is an independent news aggregator that curates and displays today's top stories from diverse, independent channels. Unlike traditional news aggregators, NewsPlatform focuses on surfacing quality journalism from independent voices and smaller outlets alongside established sources, giving readers a broader perspective on current events.</p>
      </section>

      <section>
        <h2>Latest Stories</h2>
        ${articlesList || '<p>Loading latest stories...</p>'}
      </section>
    </main>

    <footer>
      <p>
        <a href="${siteUrl}/">Home</a> · 
        <a href="${siteUrl}/channels">Browse Channels</a> · 
        <a href="${siteUrl}/about">About</a> · 
        <a href="${siteUrl}/api">API Documentation</a>
      </p>
      <p>&copy; ${new Date().getFullYear()} NewsPlatform. Aggregating independent news.</p>
    </footer>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=1800'
    );
    return res.status(200).send(html);
  } catch (err) {
    console.error('Error in prerender homepage:', err);
    return res
      .status(500)
      .send(
        `<html><body><h1>Error processing homepage</h1><p>${escapeHtml(
          err.message
        )}</p></body></html>`
      );
  }
}
