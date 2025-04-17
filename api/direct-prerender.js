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

export default async function handler(req, res) {
  try {
    console.log('========= DIRECT PRERENDER HANDLER START =========');
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
    
    if (error) {
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
      imageCount: article.images?.length || 0
    });
    
    // Get the site URL for absolute URLs
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'newsplatform.org';
    const siteUrl = `${protocol}://${host}`;
    
    // Find the first image if available
    const firstImage = article.images && article.images.length > 0 
      ? article.images[0].image_url 
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
          <meta property="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />
          <meta property="twitter:title" content="${title}" />
          <meta property="twitter:description" content="${escapedDescription}" />
          ${imageUrl ? `<meta property="twitter:image" content="${imageUrl}" />` : ''}
          
          <!-- Redirect to the actual app after a moment for regular users -->
          <meta http-equiv="refresh" content="0;url=${articleUrl}" />
        </head>
        <body>
          <h1>${title}</h1>
          <p>${escapedDescription}</p>
          ${imageUrl ? `<img src="${imageUrl}" alt="${title}" />` : ''}
          <p>Redirecting to the article...</p>
          
          <div style="margin-top: 30px; padding: 15px; border: 1px solid #ccc; background: #f5f5f5;">
            <h2>Debug Information</h2>
            <p>This page is for social media crawlers to generate link previews.</p>
            <p>Article ID: ${article.id}</p>
            <p>Article Slug: ${article.slug}</p>
            <p>Image URL: ${imageUrl || 'None'}</p>
            <p>Site URL: ${siteUrl}</p>
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