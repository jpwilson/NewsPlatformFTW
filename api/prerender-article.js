/**
 * Prerender middleware for social media crawlers
 * This intercepts requests to article pages from social media crawlers
 * and injects necessary meta tags for proper previews
 */

// Import Supabase for database access
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Prerender module loaded with Supabase URL:', supabaseUrl ? 'defined' : 'undefined');

// Helper function to determine if a request is from a crawler
function isSocialMediaCrawler(userAgent) {
  const crawlers = [
    'facebookexternalhit',
    'Facebot',
    'Twitterbot',
    'WhatsApp',
    'LinkedInBot',
    'Pinterest',
    'Slackbot',
    'TelegramBot',
    'Discordbot',
    'googlebot',
    'bingbot',
    'yandex',
    'baiduspider',
    'duckduckbot',
  ];
  
  if (!userAgent) return false;
  
  const isBot = crawlers.some(crawler => 
    userAgent.toLowerCase().includes(crawler.toLowerCase())
  );

  if (isBot) {
    console.log('Detected social media crawler:', userAgent);
  }
  
  return isBot;
}

// Helper function to extract article ID or slug from URL
function extractArticleIdFromPath(path) {
  if (!path) return null;
  
  // Handle different path formats
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Check for new ID-based URL format: /articles/{id}/{slug}
  const idBasedMatch = cleanPath.match(/\/articles\/(\d+)(?:\/.*)?/);
  if (idBasedMatch) {
    console.log('Extracted numeric article ID from path:', idBasedMatch[1]);
    return idBasedMatch[1];
  }
  
  // Fall back to old slug-based format: /articles/{slug}
  const slugMatch = cleanPath.match(/\/articles\/([^\/]+)/);
  if (slugMatch) {
    console.log('Extracted article slug from path:', slugMatch[1]);
    return slugMatch[1];
  }
  
  return null;
}

// Helper function to create a clean description from content
function createDescription(content, maxLength = 160) {
  if (!content) return '';
  
  // Strip any HTML if present
  const text = content.replace(/<[^>]*>/g, ' ');
  
  // Clean up whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  if (cleanText.length <= maxLength) {
    return cleanText;
  }
  
  // Try to find a good cutoff point
  const truncated = cleanText.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  
  if (lastPeriod > maxLength * 0.7) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace) + '...';
}

export default async function handler(req, res) {
  try {
    console.log('========= PRERENDER HANDLER START =========');
    console.log('Request details:', {
      url: req.url,
      path: req.path,
      query: req.query,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-forwarded-host': req.headers['x-forwarded-host']
      }
    });
    console.log('Supabase config:', {
      url: supabaseUrl ? 'defined' : 'undefined',
      key: supabaseKey ? 'defined' : 'undefined'
    });
    
    console.log('Prerender handler called:', {
      url: req.url,
      headers: req.headers,
      query: req.query
    });

    // Get the path from URL or directly from the request path
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
    const isTestMode = req.query.forcePrerender === 'true';
    const shouldProcess = isDev || isTestMode || isSocialMediaCrawler(userAgent);
    
    console.log('Processing decision:', {
      isDev,
      isTestMode,
      isCrawler: isSocialMediaCrawler(userAgent),
      shouldProcess
    });
    
    // Only process article pages and crawler requests (or in test mode)
    if (!path.includes('/articles/') || (!shouldProcess && !isTestMode)) {
      // Return 404 to pass through to the default handler
      console.log('Not processing page for prerendering:', path);
      return res.status(404).end();
    }
    
    // Extract the article ID or slug
    const articleId = extractArticleIdFromPath(path);
    if (!articleId) {
      console.log('No article ID found in path:', path);
      return res.status(404).end();
    }
    
    console.log('Prerendering article:', articleId);
    
    // Fetch the article data, ensuring we join article_images correctly
    const isNumericId = /^\d+$/.test(articleId);
    let query;
    const selectStatement = `
      *,
      images:article_images (
        image_url,
        caption,
        order
      )
    `;

    if (isNumericId) {
      query = supabase.from('articles').select(selectStatement).eq('id', articleId).single();
    } else {
      query = supabase.from('articles').select(selectStatement).eq('slug', articleId).single();
    }
    
    let { data: article, error } = await query;
    
    if (error) {
      console.error('Error fetching article:', error);
      return res.status(404).end(`Error fetching article: ${error.message}`);
    }
    
    if (!article) {
      console.error('Article not found:', articleId);
      return res.status(404).end('Article not found');
    }
    
    console.log('Article data structure check:');
    console.log('- article keys:', Object.keys(article));
    console.log('- article.images type:', typeof article.images);
    console.log('- article.images:', JSON.stringify(article.images));

    // Get the site URL for absolute URLs
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'newsplatform.org';
    const siteUrl = `${protocol}://${host}`;
    
    // Simplified image extraction - expecting article.images to be the result of the join
    let imageUrl = null;
    if (article.images && Array.isArray(article.images) && article.images.length > 0) {
      const firstImage = article.images[0];
      if (firstImage && (firstImage.image_url || firstImage.imageUrl)) {
        imageUrl = firstImage.image_url || firstImage.imageUrl;
        console.log('Found image URL:', imageUrl);
      } else {
        console.log('First image object found, but no image_url or imageUrl property.');
      }
    } else {
      console.log('No images found in article.images array.');
    }

    // Ensure image URL is absolute
    let absoluteImageUrl = null;
    if (imageUrl) {
      if (imageUrl.startsWith('//')) {
        absoluteImageUrl = `https:${imageUrl}`;
      } else if (imageUrl.startsWith('/')) {
        absoluteImageUrl = `${siteUrl}${imageUrl}`;
      } else if (!imageUrl.startsWith('http')) {
        absoluteImageUrl = `${siteUrl}/${imageUrl}`;
      } else {
        absoluteImageUrl = imageUrl;
      }
      console.log('Final absolute image URL:', absoluteImageUrl);
    }

    // Construct article URL in the new format with ID/slug
    const articleUrl = `${siteUrl}/articles/${article.id}${article.slug ? `/${article.slug}` : ''}`;
    const description = createDescription(article.content);
    const escapeHtml = (text) => String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const title = escapeHtml(article.title || 'News Article');
    const escapedDescription = escapeHtml(description);
    
    console.log('Preparing HTML response with:', {
      title,
      description: description.substring(0, 50) + '...',
      imageUrl: absoluteImageUrl ? 'present' : 'not found',
      articleUrl
    });
    
    // Determine redirect delay based on user agent
    const isCrawler = userAgent.match(/(facebookexternalhit|Facebot|Twitterbot|WhatsApp|LinkedInBot|Pinterest|Slackbot|TelegramBot|Discordbot|googlebot|bingbot|yandex|baiduspider|duckduckbot)/i);
    const redirectDelay = isCrawler ? 30 : 1;

    // Construct HTML
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${title}</title>
          <meta name="description" content="${escapedDescription}" />
          
          <!-- Open Graph / Facebook -->
          <meta property="og:type" content="article" />
          <meta property="og:url" content="${articleUrl}" />
          <meta property="og:title" content="${title}" />
          <meta property="og:description" content="${escapedDescription}" />
          ${absoluteImageUrl ? `<meta property="og:image" content="${absoluteImageUrl}" />` : '<!-- No image available -->'}
          <meta property="og:site_name" content="News Platform" />
          
          <!-- Twitter -->
          <meta name="twitter:card" content="${absoluteImageUrl ? 'summary_large_image' : 'summary'}" />
          <meta name="twitter:title" content="${title}" />
          <meta name="twitter:description" content="${escapedDescription}" />
          ${absoluteImageUrl ? `<meta name="twitter:image" content="${absoluteImageUrl}" />` : '<!-- No image available -->'}
          
          <!-- Redirect after delay -->
          <meta http-equiv="refresh" content="${redirectDelay};url=${articleUrl}" />
        </head>
        <body>
          <h1>${title}</h1>
          <p>${escapedDescription}</p>
          ${absoluteImageUrl ? `<img src="${absoluteImageUrl}" alt="${title}" style="max-width:100%; height:auto;">` : '<p>No image available</p>'}
          <p>Redirecting to the article in ${redirectDelay} second${redirectDelay !== 1 ? 's' : ''}...</p>
        </body>
      </html>
    `;
    
    // Return the pre-rendered HTML
    res.setHeader('Content-Type', 'text/html');
    console.log('Sending prerendered HTML response');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error('Error in prerender middleware:', err);
    return res.status(500).send(`<html><body><h1>Error processing article for sharing</h1><p>${err.message}</p></body></html>`);
  }
} 