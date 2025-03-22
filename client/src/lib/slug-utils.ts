/**
 * Utility functions for generating and working with URL slugs
 */

/**
 * Generate a URL-friendly slug from a string
 * @param text The text to convert to a slug
 * @param maxLength Optional maximum length for the slug
 * @returns A URL-friendly slug
 */
export function generateSlug(text: string, maxLength = 60): string {
  if (!text) return '';
  
  // Convert to lowercase
  let slug = text.toLowerCase();
  
  // Replace non-alphanumeric characters with hyphens
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  
  // Remove leading and trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');
  
  // Truncate if needed (without cutting words)
  if (maxLength && slug.length > maxLength) {
    // Find the last hyphen before the maxLength
    const lastHyphen = slug.substring(0, maxLength).lastIndexOf('-');
    if (lastHyphen > 0) {
      slug = slug.substring(0, lastHyphen);
    } else {
      // If no hyphen is found, just truncate
      slug = slug.substring(0, maxLength);
    }
  }
  
  return slug;
}

/**
 * Generate a channel slug from a channel name
 * @param name Channel name
 * @returns Slug for the channel
 */
export function generateChannelSlug(name: string): string {
  return generateSlug(name);
}

/**
 * Generate an article slug from its title
 * Optionally include a date prefix for better uniqueness
 * @param title Article title
 * @param includeDate Whether to include date prefix
 * @returns Slug for the article
 */
export function generateArticleSlug(title: string, includeDate = false): string {
  if (includeDate) {
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    return `${dateStr}-${generateSlug(title)}`;
  }
  
  return generateSlug(title);
}

/**
 * Extract the ID from a URL path
 * @param path URL path like "/channels/123" or "/channels/my-channel-123"
 * @returns The numeric ID
 */
export function extractIdFromPath(path: string): string | null {
  // Extract ID from URL paths like "/prefix/123" or "/prefix/slug-123"
  const idMatch = path.match(/\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (!idMatch) return null;

  // If the second part is purely numeric, return it
  if (/^\d+$/.test(idMatch[2])) {
    return idMatch[2];
  }
  
  // Check if there's a numeric ID at the end of the slug
  const idAtEndMatch = idMatch[2].match(/-(\d+)$/);
  if (idAtEndMatch) {
    return idAtEndMatch[1];
  }
  
  return null;
}

/**
 * Create a URL with just the slug
 * @param baseUrl The base URL path (e.g., "/channels/")
 * @param slug The slug text
 * @param id The numeric ID (used as fallback if no slug exists)
 * @returns URL with just the slug
 */
export function createSlugUrl(baseUrl: string, slug: string, id: string | number): string {
  // If no slug is provided, fall back to the ID
  return `${baseUrl}${slug || id}`;
} 