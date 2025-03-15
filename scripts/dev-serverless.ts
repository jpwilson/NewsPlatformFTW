// Load environment variables first, before any other imports
import "dotenv/config";

import express from 'express';
import { createServer } from 'http';
import { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/index';

// Set environment variables for development
process.env.NODE_ENV = 'development';

// Debug logs for environment variables
console.log("[dev-serverless] Environment variables loaded:");
console.log("[dev-serverless] Has SUPABASE_URL:", !!process.env.SUPABASE_URL);
console.log("[dev-serverless] Has SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);
console.log("[dev-serverless] Has SUPABASE_ANON_KEY:", !!process.env.SUPABASE_ANON_KEY);
console.log("[dev-serverless] Has VITE_SUPABASE_ANON_KEY:", !!process.env.VITE_SUPABASE_ANON_KEY);

// Create Express app
const app = express();
const server = createServer(app);

// Add middleware to capture request body
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5001');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Route all API requests to the serverless handler
app.all('/api/:path*', async (req, res) => {
  // Convert Express req/res to Vercel req/res format
  const vercelReq = req as unknown as VercelRequest;
  const vercelRes = res as unknown as VercelResponse;
  
  // Add path to query params
  vercelReq.query = {
    ...vercelReq.query,
    path: req.params['path*']
  };
  
  console.log(`[dev-serverless] Handling ${req.method} ${req.url}`);
  
  try {
    // Call the Vercel serverless handler
    await handler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[dev-serverless] Error handling request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`[dev-serverless] API server running at http://localhost:${PORT}`);
  console.log('[dev-serverless] Frontend should be available at http://localhost:5001');
  console.log('[dev-serverless] API requests will be proxied from frontend to API server');
}); 