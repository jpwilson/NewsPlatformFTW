import { createClient } from '@supabase/supabase-js'

// Log the environment variables for debugging (remove in production)
console.log('VITE_SUPABASE_URL exists:', !!import.meta.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY exists:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
console.log('VITE_SUPABASE_URL value:', import.meta.env.VITE_SUPABASE_URL || 'undefined');

// Explicitly cast to string to ensure TypeScript is happy
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Check if values are missing and log a helpful error
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  console.error('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
  console.error('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY);
}

// Get the current domain for auth redirects
const domain = typeof window !== 'undefined' ? window.location.origin : '';
console.log('Current domain for auth redirects:', domain);

// Check if we're running in production (Vercel) or development
const isProduction = import.meta.env.PROD;
console.log('Running in production mode:', isProduction);

// Fallback values for development if environment variables are not set
const fallbackUrl = 'https://mwrhaqghxatfwzsjjfrv.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13cmhhcWdoeGF0Znd6c2pqZnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA1MTA3ODYsImV4cCI6MjA1NjA4Njc4Nn0.lFttNvmLpKXFRCq58bmn8OiVxnastEF7jWopx3CKa3M';

// Create client with appropriate settings based on environment
export const supabase = createClient(
  supabaseUrl || fallbackUrl, 
  supabaseAnonKey || fallbackKey, 
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
    // Add global error handler
    global: {
      headers: {
        'x-client-info': 'news-platform@1.0.0',
      },
    },
  }
);

// Debug storage initialization
console.log('Supabase storage initialized:', !!supabase.storage);
console.log('Supabase storage methods:', Object.keys(supabase.storage || {}));

// Test storage access
supabase.storage.listBuckets().then(({ data: buckets, error }) => {
  if (error) {
    console.error('Error accessing storage:', error);
  } else {
    console.log('Available storage buckets:', buckets);
  }
}).catch(err => {
  console.error('Failed to access storage:', err);
});

// Add event listener for auth state changes (debugging)
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Supabase auth state changed:', event, session ? '✓ Session exists' : '✗ No session');
  if (session) {
    console.log('User ID:', session.user.id);
    console.log('Access token exists:', !!session.access_token);
  }
});

// Utility function to get current session with error handling
export async function getCurrentSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error getting session:', error);
      return null;
    }
    return data.session;
  } catch (error) {
    console.error('Unexpected error getting session:', error);
    return null;
  }
}

// Utility function to check if user is authenticated
export async function isAuthenticated() {
  const session = await getCurrentSession();
  return !!session;
}

// Debug function to help troubleshoot authentication issues
export async function debugAuthState() {
  console.group('Debug Auth State');
  try {
    // Check session
    const { data: sessionData } = await supabase.auth.getSession();
    console.log('Session exists:', !!sessionData.session);
    
    if (sessionData.session) {
      console.log('User ID:', sessionData.session.user.id);
      console.log('Token expiry:', new Date(sessionData.session.expires_at! * 1000).toISOString());
      console.log('Is expired:', Date.now() > sessionData.session.expires_at! * 1000);
    }
    
    // Check localStorage
    if (typeof window !== 'undefined') {
      const keys = Object.keys(localStorage).filter(key => key.includes('supabase'));
      console.log('Supabase localStorage keys:', keys);
      
      keys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          console.log(`${key}: ${value ? '✓ Has value' : '✗ Empty'}`);
        } catch (e) {
          console.error(`Error reading ${key}:`, e);
        }
      });
    }
  } catch (error) {
    console.error('Error in debugAuthState:', error);
  }
  console.groupEnd();
}

// Call debug function on load
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(debugAuthState, 1000); // Delay to let auth initialize
  });
} 