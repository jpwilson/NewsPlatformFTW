export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.newsplatform.org', // Local dev goes through the same-origin Vite proxy
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', // Explicitly allow methods
} 