/**
 * Direct prerender handler for testing
 * This is a simplified version of prerender-article.js that can be called directly
 */

// Import Supabase for database access
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Direct prerender module loaded with Supabase URL:', supabaseUrl ? 'defined' : 'undefined');

// Helper function to extract article ID or slug from URL
function extractArticleIdFromPath(path) {
  if (!path) return null;
  
  // Handle different path formats
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const match = cleanPath.match(/\/articles\/([^\/]+)/);
  
  if (match) {
    console.log('Extracted article ID/slug from path:', match[1]);
    return match[1];
  } else if (cleanPath.includes('/test-prerender/')) {
    // Extract directly from test-prerender path
    const testMatch = cleanPath.match(/\/test-prerender\/([^\/]+)/);
    if (testMatch) {
      console.log('Extracted article ID/slug from test-prerender path:', testMatch[1]);
      return testMatch[1];
    }
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

// Helper function to extract image URL from any format
function extractImageUrl(article) {
  // Debug what we're working with
  console.log('Extracting image URL from article with keys:', Object.keys(article));
  
  let imageUrl = null;
  
  // Try the image-related fields in article
  if (article.image_url) {
    imageUrl = article.image_url;
    console.log('Found article.image_url:', imageUrl);
  } else if (article.imageUrl) {
    imageUrl = article.imageUrl;
    console.log('Found article.imageUrl:', imageUrl);
  } else if (article.cover_image) {
    imageUrl = article.cover_image;
    console.log('Found article.cover_image:', imageUrl);
  } else if (article.coverImage) {
    imageUrl = article.coverImage;
    console.log('Found article.coverImage:', imageUrl);
  } else if (article.thumbnail) {
    imageUrl = article.thumbnail;
    console.log('Found article.thumbnail:', imageUrl);
  }
  
  // Try images array or article_images array
  if (!imageUrl) {
    if (Array.isArray(article.images) && article.images.length > 0) {
      const firstImage = article.images[0];
      // The image object could have different field names
      if (typeof firstImage === 'object') {
        imageUrl = firstImage.image_url || firstImage.imageUrl || firstImage.url || firstImage.src;
        console.log('Found image in article.images[0]:', imageUrl);
      } else if (typeof firstImage === 'string') {
        imageUrl = firstImage;
        console.log('Found string in article.images[0]:', imageUrl);
      }
    } else if (Array.isArray(article.article_images) && article.article_images.length > 0) {
      const firstImage = article.article_images[0];
      if (typeof firstImage === 'object') {
        imageUrl = firstImage.image_url || firstImage.imageUrl || firstImage.url || firstImage.src;
        console.log('Found image in article.article_images[0]:', imageUrl);
      }
    }
  }
  
  return imageUrl;
}

export default async function handler(req, res) {
  try {
    console.log('========= DIRECT PRERENDER HANDLER START =========');
    console.log('Environment check:');
    console.log('- VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? 'defined' : 'undefined');
    console.log('- VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? 'defined' : 'undefined');
    console.log('- NODE_ENV:', process.env.NODE_ENV || 'undefined');
    
    console.log('Request details:', {
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-forwarded-host': req.headers['x-forwarded-host']
      }
    });
    
    // Extract the article ID or slug from various possible sources
    let articleId = null;
    
    // First try from the path parameter
    if (req.params && req.params.slug) {
      articleId = req.params.slug;
    } 
    // Then try from the query parameter
    else if (req.query && req.query.slug) {
      articleId = req.query.slug;
    }
    // Then try from the URL/path
    else {
      const path = req.query.path || req.url || req.path || '';
      articleId = extractArticleIdFromPath(path);
    }
    
    if (!articleId) {
      console.log('No article ID found in request');
      return res.status(400).json({ error: 'No article ID found in request' });
    }
    
    console.log('Prerendering article:', articleId);
    
    // Fetch the article data from the database
    // First check if it's a numeric ID or a slug
    const isNumericId = /^\d+$/.test(articleId);
    
    let query;
    if (isNumericId) {
      query = supabase
        .from('articles')
        .select(`
          *,
          images:article_images (
            image_url,
            caption,
            order
          ),
          channel (
            id,
            name,
            slug
          )
        `)
        .eq('id', articleId)
        .single();
    } else {
      query = supabase
        .from('articles')
        .select(`
          *,
          images:article_images (
            image_url,
            caption,
            order
          ),
          channel (
            id,
            name,
            slug
          )
        `)
        .eq('slug', articleId)
        .single();
    }
    
    let { data: article, error } = await query;
    
    // If we got a relationship error, try a simpler query without the joins
    if (error && error.message && (
        error.message.includes('relationship between') || 
        error.message.includes('schema cache')
    )) {
      console.log('Got a relationship error, trying a simpler query');
      
      // Try a simpler query without joins
      let simpleQuery;
      if (isNumericId) {
        simpleQuery = supabase
          .from('articles')
          .select('*')
          .eq('id', articleId)
          .single();
      } else {
        simpleQuery = supabase
          .from('articles')
          .select('*')
          .eq('slug', articleId)
          .single();
      }
      
      const { data: simpleArticle, error: simpleError } = await simpleQuery;
      
      if (simpleError) {
        console.error('Error with simple query too:', simpleError);
        return res.status(404).json({ 
          error: 'Article not found', 
          details: simpleError.message,
          originalError: error.message
        });
      }
      
      if (!simpleArticle) {
        return res.status(404).json({ 
          error: 'Article not found', 
          details: 'No data returned from simple query' 
        });
      }
      
      // Use the simple article data
      article = simpleArticle;
      console.log('Using simple article data without images');
    } else if (error) {
      console.error('Error fetching article:', error);
      return res.status(404).json({ error: 'Article not found', details: error.message });
    }
    
    if (!article) {
      console.error('Article not found:', articleId);
      return res.status(404).json({ error: 'Article not found', details: 'No data returned from database' });
    }
    
    console.log('Article data retrieved:', {
      id: article.id,
      title: article.title,
      channelName: article.channel?.name || 'Unknown',
      imageCount: Array.isArray(article.images) ? article.images.length : 'not an array'
    });
    
    // Debug the structure of the article data
    console.log('Article data structure:');
    console.log('- article.images type:', typeof article.images);
    console.log('- article keys:', Object.keys(article));
    
    // Get the site URL for absolute URLs
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'newsplatform.org';
    const siteUrl = `${protocol}://${host}`;
    
    // Use our helper function to find an image
    let firstImage = extractImageUrl(article);
    let imageUrl = null;
    
    // Check if we should force a specific image (for testing)
    if (req.query.forceImage === 'true') {
      console.log('Forcing a sample image for testing purposes');
      firstImage = 'https://newsplatform.org/api/public-assets/sample-article-image.jpg';
    }
    
    // Ensure URLs are absolute and fix missing protocol
    if (firstImage) {
      if (firstImage.startsWith('//')) {
        imageUrl = `https:${firstImage}`;
      } else if (firstImage.startsWith('/')) {
        imageUrl = `${siteUrl}${firstImage}`;
      } else if (!firstImage.startsWith('http')) {
        imageUrl = `${siteUrl}/${firstImage}`;
      } else {
        imageUrl = firstImage;
      }
      console.log('Final image URL:', imageUrl);
    }
    
    // Create a description from the content
    const description = createDescription(article.content);
    
    const articleUrl = `${siteUrl}/articles/${article.slug || article.id}`;
    
    // Escape HTML entities in text content
    const escapeHtml = (text) => {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };
    
    const title = escapeHtml(article.title || 'News Article');
    const escapedDescription = escapeHtml(description);
    
    console.log('Preparing HTML response with:', {
      title,
      description: description.substring(0, 50) + '...',
      imageUrl: imageUrl ? 'present' : 'not found',
      articleUrl
    });
    
    // Determine if the request is from a crawler
    const userAgent = req.headers['user-agent'] || '';
    const isCrawler = userAgent.match(/(facebookexternalhit|Facebot|Twitterbot|WhatsApp|LinkedInBot|Pinterest|Slackbot|TelegramBot|Discordbot|googlebot|bingbot|yandex|baiduspider|duckduckbot)/i);

    console.log('User agent:', userAgent);
    console.log('Is crawler:', !!isCrawler);

    // Set a long delay for crawlers, short for humans
    const redirectDelay = isCrawler ? 30 : 1;

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
          ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : '<!-- No image available for og:image -->'}
          <meta property="og:site_name" content="News Platform" />
          
          <!-- Twitter -->
          <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />
          <meta name="twitter:title" content="${title}" />
          <meta name="twitter:description" content="${escapedDescription}" />
          ${imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : '<!-- No image available for twitter:image -->'}
          
          <!-- Redirect to the actual app after a delay - longer for crawlers -->
          <meta http-equiv="refresh" content="${redirectDelay};url=${articleUrl}" />
          
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            img {
              max-width: 100%;
              height: auto;
              border-radius: 8px;
              margin: 20px 0;
            }
            .debug-info {
              margin-top: 30px;
              padding: 15px;
              border: 1px solid #ccc;
              background: #f5f5f5;
              border-radius: 8px;
            }
            h1 {
              margin-bottom: 10px;
            }
            .redirect-notice {
              font-style: italic;
              color: #666;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p>${escapedDescription}</p>
          ${imageUrl ? `<img src="${imageUrl}" alt="${title}" />` : '<p>No image available</p>'}
          <p class="redirect-notice">Redirecting to the article in ${redirectDelay} second${redirectDelay !== 1 ? 's' : ''}...</p>
          
          <div class="debug-info">
            <h2>Debug Information</h2>
            <p>This page is for social media crawlers to generate link previews.</p>
            <p>Article ID: ${article.id}</p>
            <p>Article Slug: ${article.slug || 'No slug'}</p>
            <p>Image URL: ${imageUrl || 'None'}</p>
            <p>Site URL: ${siteUrl}</p>
            <p>Channel: ${article.channel?.name || 'Unknown'}</p>
            <p>User Agent: ${userAgent}</p>
            <p>Detected as crawler: ${!!isCrawler}</p>
            
            <h3>Environment</h3>
            <p>NODE_ENV: ${process.env.NODE_ENV || 'undefined'}</p>
            <p>SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? 'defined' : 'undefined'}</p>
            <p>SUPABASE_KEY: ${process.env.VITE_SUPABASE_ANON_KEY ? 'defined' : 'undefined'}</p>
          </div>
        </body>
      </html>
    `;
    
    // Return the pre-rendered HTML
    res.setHeader('Content-Type', 'text/html');
    console.log('Sending prerendered HTML response');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error('Error in direct prerender handler:', err);
    return res.status(500).json({
      error: 'Prerender test failed',
      details: err.message
    });
  }
} 