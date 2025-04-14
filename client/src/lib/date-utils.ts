/**
 * Format a date string or Date object to a localized string
 * Safely handles invalid or undefined dates by returning a fallback value
 * @param dateString The date to format
 * @param includeTime If true, includes time in the format
 * @returns Formatted date string
 */
export function formatDate(
  dateString: string | Date | null | undefined, 
  includeTime: boolean = false,
  useFriendlyFormat: boolean = true
): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    
    if (useFriendlyFormat) {
      // Format like "Tue, 5 Mar 25"
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = date.getFullYear().toString().slice(-2);
      
      if (includeTime) {
        const time = date.toLocaleTimeString('en-US', { 
          hour: 'numeric',
          minute: '2-digit',
          hour12: true 
        });
        return `${weekday}, ${day} ${month} ${year} at ${time}`;
      }
      
      return `${weekday}, ${day} ${month} ${year}`;
    }
    
    // Traditional format
    if (includeTime) {
      return date.toLocaleString();
    }
    return date.toLocaleDateString();
  } catch (e) {
    return "Invalid date";
  }
} 

/**
 * Format a date as a relative time string (e.g., "2 minutes ago", "1 day ago")
 * @param dateString The date to format
 * @returns Formatted relative time string
 */
export function formatTimeAgo(dateString: string | Date | null | undefined): string {
  if (!dateString) return "N/A";
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    // Less than a minute
    if (diffInSeconds < 60) {
      return diffInSeconds <= 1 ? 'just now' : `${diffInSeconds} seconds ago`;
    }
    
    // Less than an hour
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`;
    }
    
    // Less than a day
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
    }
    
    // Less than a week
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
    }
    
    // Less than a month (30 days)
    if (diffInDays < 30) {
      const diffInWeeks = Math.floor(diffInDays / 7);
      return diffInWeeks === 1 ? '1 week ago' : `${diffInWeeks} weeks ago`;
    }
    
    // Less than a year (365 days)
    if (diffInDays < 365) {
      const diffInMonths = Math.floor(diffInDays / 30);
      return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`;
    }
    
    // More than a year
    const diffInYears = Math.floor(diffInDays / 365);
    return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`;
  } catch (e) {
    return "Invalid date";
  }
} 