export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow requests from any origin (adjust in production!)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', // Explicitly allow methods
} 