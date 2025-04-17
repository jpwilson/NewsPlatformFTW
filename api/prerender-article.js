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
  
  return crawlers.some(crawler => 
    userAgent.toLowerCase().includes(crawler.toLowerCase())
  );
}

// Helper function to extract article ID or slug from URL
function extractArticleIdFromPath(path) {
  if (!path) return null;
  
  // Handle different path formats
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const match = cleanPath.match(/\/articles\/([^\/]+)/);
  return match ? match[1] : null;
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
    // Get the path from URL or directly from the request path
    let path;
    if (req.query && req.query.path) {
      path = req.query.path;
    } else if (req.url) {
      // Extract path from the request URL
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      path = urlObj.pathname;
    } else {
      // Fallback to request path
      path = req.path || '';
    }
    
    const userAgent = req.headers['user-agent'] || '';
    
    // To enable local testing, don't check for crawler user agent in development
    const isDev = process.env.NODE_ENV !== 'production';
    const isTestMode = req.query.forcePrerender === 'true';
    const shouldProcess = isDev || isTestMode || isSocialMediaCrawler(userAgent);
    
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
    
    // Fetch the article data from the database
    // First check if it's a numeric ID or a slug
    const isNumericId = /^\d+$/.test(articleId);
    
    let query;
    if (isNumericId) {
      query = supabase
        .from('articles')
        .select('*, images(*), channel(id, name, slug)')
        .eq('id', articleId)
        .single();
    } else {
      query = supabase
        .from('articles')
        .select('*, images(*), channel(id, name, slug)')
        .eq('slug', articleId)
        .single();
    }
    
    let { data: article, error } = await query;
    
    if (error || !article) {
      console.error('Error fetching article:', error);
      return res.status(404).end();
    }
    
    // Get the site URL for absolute URLs
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5001';
    const siteUrl = `${protocol}://${host}`;
    
    // Find the first image if available
    const firstImage = article.images && article.images.length > 0 
      ? article.images[0].imageUrl 
      : null;
    
    // Create a description from the content
    const description = createDescription(article.content);
    
    // Ensure URLs are absolute
    const imageUrl = firstImage 
      ? (firstImage.startsWith('http') ? firstImage : `${siteUrl}${firstImage}`)
      : null;
    
    const articleUrl = `${siteUrl}/articles/${article.slug || article.id}`;
    
    // Escape HTML entities in text content
    const escapeHtml = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };
    
    const title = escapeHtml(article.title || 'News Article');
    const escapedDescription = escapeHtml(description);
    
    // Construct HTML with proper meta tags
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
          ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : ''}
          <meta property="og:site_name" content="News Platform" />
          
          <!-- Twitter -->
          <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />
          <meta name="twitter:title" content="${title}" />
          <meta name="twitter:description" content="${escapedDescription}" />
          ${imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : ''}
          
          <!-- Redirect to the actual app after a moment for regular users -->
          <meta http-equiv="refresh" content="0;url=${articleUrl}" />
          
          <!-- Debug info for development -->
          ${isDev ? `<!-- Debug Mode: Article ID ${article.id}, Slug: ${article.slug} -->` : ''}
        </head>
        <body>
          <h1>${title}</h1>
          <p>${escapedDescription}</p>
          ${imageUrl ? `<img src="${imageUrl}" alt="${title}" />` : ''}
          <p>Redirecting to the article...</p>
          
          ${isDev || isTestMode ? `
          <div style="margin-top: 30px; padding: 15px; border: 1px solid #ccc; background: #f5f5f5;">
            <h2>Debug Information (Development/Test Mode Only)</h2>
            <p>This page is for social media crawlers to generate link previews.</p>
            <p>Article ID: ${article.id}</p>
            <p>Article Slug: ${article.slug}</p>
            <p>Image URL: ${imageUrl || 'None'}</p>
            <p>Site URL: ${siteUrl}</p>
            <p>User Agent: ${userAgent}</p>
          </div>
          ` : ''}
        </body>
      </html>
    `;
    
    // Return the pre-rendered HTML
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error('Error in prerender middleware:', err);
    return res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error processing article for sharing</h1>
          <p>${process.env.NODE_ENV !== 'production' ? err.toString() : 'An error occurred'}</p>
        </body>
      </html>
    `);
  }
} 