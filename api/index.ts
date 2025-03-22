import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import "dotenv/config";
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client directly
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// Validate keys
if (!supabaseUrl) {
  console.error("CRITICAL ERROR: Missing SUPABASE_URL environment variable");
}
if (!supabaseServiceKey) {
  console.error("CRITICAL ERROR: Missing SUPABASE_SERVICE_KEY environment variable");
}

// Create two clients - one for auth verification (using the token from the client)
// and one with admin rights for database operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to authenticate user from request and return the userId
async function authenticateUser(req: express.Request): Promise<{ userId?: number; error?: string }> {
  // Extract the Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("No Authorization header found");
    return { error: "Authentication required" };
  }
  
  const token = authHeader.split(' ')[1];
  
  // Verify the token with Supabase
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
  
  if (userError || !userData.user) {
    console.error('Error verifying user token:', userError);
    return { error: "Invalid authentication" };
  }
  
  // Look up the user in the database
  const { data: dbUser, error: dbError } = await supabase
    .from('users')
    .select('id')
    .eq('supabase_uid', userData.user.id)
    .single();
  
  if (dbError || !dbUser) {
    console.error('Error finding user:', dbError);
    return { error: "User not found" };
  }
  
  return { userId: dbUser.id };
}

// Create Express app
const app = express();

// Debug logs for deployment
console.log("API Handler initializing (all-in-one version)");
console.log("Environment:", process.env.NODE_ENV);
console.log("Has SUPABASE_URL:", !!process.env.SUPABASE_URL);
console.log("Has SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);

// Setup Express middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add CORS middleware with dynamic origin
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  // Allow specific origins or all in development
  const allowedOrigins = [
    'https://newsplatformmvp.vercel.app',
    'https://newsplatformmvp-git-main-jpwilsons-projects.vercel.app'
  ];
  
  if (process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Verbose request logging middleware for debugging
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  // Log request details
  console.log(`[${requestId}] 🔍 REQUEST ${req.method} ${req.url}`);
  console.log(`[${requestId}] Headers: ${JSON.stringify(req.headers)}`);
  
  if (Object.keys(req.query).length > 0) {
    console.log(`[${requestId}] Query params: ${JSON.stringify(req.query)}`);
  }
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[${requestId}] Body: ${JSON.stringify(req.body)}`);
  }
  
  // Capture response data
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - start;
    
    // Log response status
    const status = res.statusCode;
    const statusIcon = status >= 200 && status < 300 ? '✅' : status >= 400 ? '❌' : '⚠️';
    
    console.log(`[${requestId}] ${statusIcon} RESPONSE ${status} - ${duration}ms`);
    
    // For error responses, log more details
    if (status >= 400) {
      try {
        const responseBody = typeof body === 'string' ? JSON.parse(body) : body;
        console.log(`[${requestId}] Error response: ${JSON.stringify(responseBody)}`);
      } catch (e) {
        console.log(`[${requestId}] Error response: ${body}`);
      }
    }
    
    return originalSend.call(this, body);
  };
  
  next();
});

// ===== DIRECT ROUTE IMPLEMENTATIONS =====

// Simple test endpoint to verify serverless functionality
app.get("/api/debug/test", (req, res) => {
  console.log("Debug test endpoint called");
  const requestInfo = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    timestamp: new Date().toISOString(),
    env: {
      node: process.env.NODE_ENV,
      vercel: process.env.VERCEL === '1' ? 'true' : 'false',
      vercelEnv: process.env.VERCEL_ENV,
      region: process.env.VERCEL_REGION
    },
    query: req.query
  };
  
  return res.json({ 
    message: "Serverless function is working correctly",
    requestInfo,
    timestamp: new Date().toISOString()
  });
});

// Comprehensive connectivity test endpoint
app.get("/api/debug/connectivity", async (req, res) => {
  console.log("Debug connectivity endpoint called");
  
  interface ConnectivityResults {
    serverless: {
      status: string;
      timestamp: string;
    };
    supabase: {
      status: string;
      error: string | null;
      tables: string[];
    };
    env: {
      node: string | undefined;
      vercel: string;
      vercelEnv: string | undefined;
      region: string | undefined;
      supabaseUrl: string;
      supabaseAnonKey: string;
      supabaseServiceKey: string;
    };
  }
  
  const results: ConnectivityResults = {
    serverless: {
      status: "ok",
      timestamp: new Date().toISOString()
    },
    supabase: {
      status: "unknown",
      error: null,
      tables: [],
    },
    env: {
      node: process.env.NODE_ENV,
      vercel: process.env.VERCEL === '1' ? 'true' : 'false',
      vercelEnv: process.env.VERCEL_ENV,
      region: process.env.VERCEL_REGION,
      supabaseUrl: process.env.SUPABASE_URL ? "defined" : "undefined",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ? "defined" : "undefined",
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? "defined" : "undefined"
    }
  };

  try {
    // Test Supabase connection with a simple query
    const { data: tableData, error: tableError } = await supabaseAuth
      .from('users')
      .select('count')
      .limit(1);
    
    if (tableError) {
      results.supabase.status = "error";
      results.supabase.error = `Error querying users table: ${tableError.message}`;
    } else {
      results.supabase.status = "connected";
      
      // Try to fetch a list of tables to verify access
      try {
        const { data: tablesData, error: tablesError } = await supabaseAuth.rpc('get_tables');
        
        if (tablesError) {
          results.supabase.tables = ["Error fetching tables"];
        } else if (tablesData) {
          results.supabase.tables = Array.isArray(tablesData) ? tablesData : ["Data returned but not an array"];
        }
      } catch (tableListError: any) {
        console.error("Error fetching table list:", tableListError);
        results.supabase.tables = ["Error fetching tables list"];
      }

      // Attempt a more direct query to list tables
      try {
        const { data: schemaData, error: schemaError } = await supabaseAuth
          .from('pg_tables')
          .select('tablename')
          .eq('schemaname', 'public')
          .limit(10);
        
        if (!schemaError && schemaData) {
          results.supabase.tables = schemaData.map((t: any) => t.tablename as string);
        }
      } catch (directTableError) {
        // Silently handle this error as it's just a fallback
      }
    }
  } catch (e: any) {
    results.supabase.status = "error";
    results.supabase.error = `Exception testing Supabase: ${e.message}`;
    console.error("Supabase connectivity test failed:", e);
  }

  return res.json(results);
});

// Channel diagnostic test endpoint
app.get("/api/debug/channels-test", async (req, res) => {
  console.log("Channel diagnostic test endpoint called");
  
  interface ChannelDiagnosticResults {
    timestamp: string;
    channelsEndpoint: {
      status: string;
      error: string | null;
      data: string | null;
    };
    specificChannel: {
      status: string;
      error: string | null;
      data: any | null;
    };
    subscriberCounts: Array<{
      channelId: string;
      name: string;
      subscriberCount: string | number;
      error: string | null;
    }>;
  }
  
  const results: ChannelDiagnosticResults = {
    timestamp: new Date().toISOString(),
    channelsEndpoint: {
      status: "pending",
      error: null,
      data: null,
    },
    specificChannel: {
      status: "pending",
      error: null,
      data: null,
    },
    subscriberCounts: []
  };
  
  try {
    // First test the /api/channels endpoint directly
    console.log("Testing channels endpoint...");
    try {
      // Get all channels using the same logic as the main endpoint
      const { data: channels, error } = await supabaseAuth
        .from('channels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        results.channelsEndpoint.status = "error";
        results.channelsEndpoint.error = error.message;
      } else if (!channels || channels.length === 0) {
        results.channelsEndpoint.status = "empty";
        results.channelsEndpoint.data = "No channels found";
      } else {
        // Successfully retrieved channels
        results.channelsEndpoint.status = "success";
        results.channelsEndpoint.data = `Found ${channels.length} channels`;
        
        // Try to enrich with subscriber counts
        for (const channel of channels.slice(0, 3)) { // Limit to first 3 channels
          try {
            const { data: subs, error: subError } = await supabaseAuth
              .from('subscriptions')
              .select('count')
              .eq('channel_id', channel.id);
              
            results.subscriberCounts.push({
              channelId: channel.id,
              name: channel.name,
              subscriberCount: subError ? 'error' : (subs?.[0]?.count || 0),
              error: subError ? subError.message : null
            });
          } catch (e: any) {
            results.subscriberCounts.push({
              channelId: channel.id,
              name: channel.name,
              subscriberCount: 'error',
              error: e.message
            });
          }
        }
        
        // Test fetching a specific channel
        if (channels.length > 0) {
          const testChannelId = channels[0].id;
          try {
            const { data: channel, error: channelError } = await supabaseAuth
              .from('channels')
              .select('*')
              .eq('id', testChannelId)
              .single();
              
            if (channelError) {
              results.specificChannel.status = "error";
              results.specificChannel.error = channelError.message;
            } else {
              results.specificChannel.status = "success";
              results.specificChannel.data = {
                id: channel.id,
                name: channel.name,
                found: !!channel
              };
            }
          } catch (e: any) {
            results.specificChannel.status = "exception";
            results.specificChannel.error = e.message;
          }
        }
      }
    } catch (e: any) {
      results.channelsEndpoint.status = "exception";
      results.channelsEndpoint.error = e.message;
    }
  } catch (e: any) {
    console.error("Error in channel diagnostic endpoint:", e);
    return res.status(500).json({
      error: "Internal server error in diagnostic endpoint",
      message: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
  
  return res.json(results);
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    deployment: "vercel-inline" 
  });
});

// User route
app.get("/api/user", async (req, res) => {
  try {
    console.log("User endpoint called");
    
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found");
      return res.sendStatus(401);
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("No token found in Authorization header");
      return res.sendStatus(401);
    }
    
    console.log("Verifying user token...");
    
    // Verify the token with Supabase
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    
    if (error || !user) {
      console.error('Error verifying user token:', error);
      return res.sendStatus(401);
    }
    
    const supabaseUid = user.id;
    console.log("User verified, Supabase UID:", supabaseUid);
    console.log("User email:", user.email);
    console.log("User metadata:", user.user_metadata);
    
    // Look up the user in our database
    console.log("Looking up user in database with Supabase UID:", supabaseUid);
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_uid', supabaseUid)
      .single();
    
    if (dbError) {
      console.error('Error finding user in database:', dbError);
      if (dbError.code === 'PGRST116') {
        console.log("No user found in the database with supabase_uid:", supabaseUid);
      }
      
      // FALLBACK: Try to get user by username if supabase_uid fails
      const username = user.email?.split('@')[0] || user.user_metadata?.name || user.user_metadata?.full_name;
      if (username) {
        console.log('Trying fallback: looking up user by username:', username);
        const { data: userByUsername, error: usernameError } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .single();
          
        if (usernameError) {
          console.error('Fallback search also failed:', usernameError);
        } else if (userByUsername) {
          console.log('Found user by username instead:', userByUsername);
          
          // Update this user's supabase_uid if it's missing
          if (!userByUsername.supabase_uid) {
            console.log('Updating user record with correct Supabase UID');
            const { error: updateError } = await supabase
              .from('users')
              .update({ supabase_uid: supabaseUid })
              .eq('id', userByUsername.id);
              
            if (updateError) {
              console.error('Failed to update user with Supabase UID:', updateError);
            }
          }
          
          // Return this user
          return res.json(userByUsername);
        }
      }
      
      return res.sendStatus(401);
    }
    
    if (!dbUser) {
      console.log("User record exists but data is null");
      return res.sendStatus(401);
    }
    
    console.log("User found in database, ID:", dbUser.id);
    
    // Return the user
    return res.json(dbUser);
  } catch (error) {
    console.error('Error in /api/user endpoint:', error);
    return res.sendStatus(401);
  }
});

// Add Supabase callback endpoint for Google OAuth
app.post('/api/auth/supabase-callback', async (req, res) => {
  try {
    const { supabase_uid, email, name } = req.body;
    
    console.log('Supabase OAuth callback received:', { 
      supabase_uid: supabase_uid ? "✓" : "✗", 
      email: email ? "✓" : "✗",
      name: name ? "✓" : "✗"
    });
    
    if (!supabase_uid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing Supabase user ID' 
      });
    }
    
    // Try to find existing user with this Supabase ID
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_uid', supabase_uid)
      .single();
    
    if (findError && findError.code !== 'PGRST116') {
      console.error('Error finding user:', findError);
      return res.status(500).json({ 
        success: false, 
        error: 'Database error when finding user' 
      });
    }
    
    if (existingUser) {
      console.log('Found existing user:', existingUser.username);
      return res.json({ 
        success: true, 
        user: existingUser 
      });
    }
    
    // Create a new user
    const username = email ? email.split('@')[0] : `user_${Date.now()}`;
    console.log('Creating new user with username:', username);
    
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ 
        username, 
        password: '', // No password needed
        supabase_uid 
      }])
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating user:', createError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create user' 
      });
    }
    
    return res.json({ 
      success: true, 
      user: newUser 
    });
  } catch (error) {
    console.error('Error in Supabase callback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      details: String(error)
    });
  }
});

// Channels route
app.get("/api/channels", async (req, res) => {
  try {
    console.log("Fetching channels from Supabase");
    // Fetch all channels from Supabase
    const { data: channels, error } = await supabase
      .from("channels")
      .select("*");
    
    if (error) {
      console.error("Error fetching channels:", error);
      return res.status(500).json({ error: "Failed to fetch channels" });
    }
    
    console.log(`Successfully fetched ${channels?.length || 0} channels`);
    
    // Enrich each channel with subscriber count
    const enrichedChannels = await Promise.all((channels || []).map(async (channel) => {
      // Get subscriber count using a more direct approach that works in all environments
      try {
        const { count, error: countError } = await supabase
          .from("subscriptions")
          .select("*", { count: 'exact', head: true })
          .eq("channel_id", channel.id);
          
        if (countError) {
          console.error(`Error fetching subscriber count for channel ${channel.id}:`, countError);
          return {
            ...channel,
            subscriberCount: 0
          };
        }
        
        console.log(`Channel ${channel.id} (${channel.name}) has ${count || 0} subscribers`);
        
        return {
          ...channel,
          subscriberCount: count || 0
        };
      } catch (countError) {
        console.error(`Unexpected error fetching subscriber count for channel ${channel.id}:`, countError);
        return {
          ...channel,
          subscriberCount: 0
        };
      }
    }));
    
    res.json(enrichedChannels || []);
  } catch (error) {
    console.error("Error fetching channels:", error);
    res.status(500).json({ error: "Failed to fetch channels", details: String(error) });
  }
});

// Channel creation endpoint
app.post("/api/channels", async (req, res) => {
  try {
    console.log("Channel creation request received:", req.body);
    
    // Properly extract the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error("No authorization header found");
      return res.status(401).json({ error: "Unauthorized", message: "You must be logged in to create a channel" });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the token using Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error or no user:", authError);
      return res.status(401).json({ error: "Unauthorized", message: "You must be logged in to create a channel" });
    }
    
    console.log("Supabase auth user:", user.id);
    
    // Validate required fields
    const { name, description } = req.body;
    if (!name || !description) {
      return res.status(400).json({ 
        error: "Bad Request", 
        message: "Name and description are required" 
      });
    }
    
    // Extract the numeric user ID from the request body
    const numericUserId = req.body.userId || 3; // Default to 3 if not provided
    console.log("Using numeric user ID:", numericUserId);
    
    // Check if user has reached the maximum number of channels (10)
    const { data: userChannels, error: countError } = await supabase
      .from("channels")
      .select("id")
      .eq("user_id", numericUserId);
    
    if (countError) {
      console.error("Error checking existing channels:", countError);
      return res.status(500).json({ 
        error: "Internal Server Error", 
        message: "Failed to check existing channels" 
      });
    }
    
    const channelCount = userChannels ? userChannels.length : 0;
    console.log(`User ${numericUserId} has ${channelCount} existing channels`);
    
    if (channelCount >= 10) {
      console.log("User has reached channel limit:", channelCount);
      return res.status(400).json({ 
        error: "Limit Exceeded", 
        message: "Maximum limit reached. You cannot create more than 10 channels." 
      });
    }
    
    // Create the channel with the correct field name
    const { data: newChannel, error: insertError } = await supabase
      .from("channels")
      .insert({
        name,
        description,
        user_id: numericUserId // Use the correct column name (user_id with underscore)
      })
      .select("*")
      .single();
    
    if (insertError) {
      console.error("Error creating channel:", insertError);
      return res.status(500).json({ 
        error: "Creation Failed", 
        message: "Failed to create channel", 
        details: insertError.message 
      });
    }
    
    // Convert snake_case to camelCase for front-end consistency
    const formattedChannel = {
      id: newChannel.id,
      name: newChannel.name,
      description: newChannel.description,
      userId: newChannel.user_id,
      createdAt: newChannel.created_at,
      ...newChannel // Include other fields as well
    };
    
    console.log("Channel created successfully:", formattedChannel);
    res.status(201).json(formattedChannel);
  } catch (error) {
    console.error("Unexpected error in channel creation:", error);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: "An unexpected error occurred", 
      details: error.message 
    });
  }
});

// Articles route with channel data
app.get("/api/articles", async (req, res) => {
  try {
    console.log("Fetching articles with channel data from Supabase");
    
    // Fetch articles first
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });
      
    if (articlesError) {
      console.error("Error fetching articles:", articlesError);
      return res.status(500).json({ error: "Failed to fetch articles" });
    }
    
    // If we have articles, fetch all needed channels in one query
    if (articles && articles.length > 0) {
      // Get unique channel IDs
      const channelIds = [...new Set(articles.map(article => article.channel_id))].filter(Boolean);
      console.log(`Found ${channelIds.length} unique channel IDs:`, channelIds);
      
      if (channelIds.length > 0) {
        const { data: channels, error: channelsError } = await supabase
          .from("channels")
          .select("*")
          .in("id", channelIds);
          
        if (channelsError) {
          console.error("Error fetching channels for articles:", channelsError);
        } else if (channels && channels.length > 0) {
          console.log(`Successfully fetched ${channels.length} channels`);
          
          // Create a map for quick lookup
          const channelMap = channels.reduce((map, channel) => {
            map[channel.id] = channel;
            return map;
          }, {});
          
          // Get all reactions for all articles in a single query
          const articleIds = articles.map(article => article.id);
          const { data: allReactions, error: reactionsError } = await supabase
            .from("reactions")
            .select("article_id, is_like, user_id")
            .in("article_id", articleIds);
            
          if (reactionsError) {
            console.error("Error fetching reactions for articles:", reactionsError);
          }
          
          // Group reactions by article ID
          const reactionsByArticle = {};
          if (allReactions && allReactions.length > 0) {
            allReactions.forEach(reaction => {
              if (!reactionsByArticle[reaction.article_id]) {
                reactionsByArticle[reaction.article_id] = [];
              }
              reactionsByArticle[reaction.article_id].push(reaction);
            });
          }
          
          // Get user ID if authenticated
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
              const { data, error: authError } = await supabaseAuth.auth.getUser(token);
              if (!authError && data.user) {
                // Look up internal user ID
                const { data: dbUser } = await supabase
                  .from('users')
                  .select('id')
                  .eq('supabase_uid', data.user.id)
                  .single();
                  
                if (dbUser) {
                  userId = dbUser.id;
                }
              }
            } catch (e) {
              console.error("Error checking user for reactions:", e);
            }
          }
          
          // Attach channel and reaction data to each article
          const articlesWithData = articles.map(article => {
            const channelId = article.channel_id;
            const channel = channelId ? channelMap[channelId] : null;
            
            // Add reaction data
            const articleReactions = reactionsByArticle[article.id] || [];
            const likes = articleReactions.filter(r => r.is_like).length;
            const dislikes = articleReactions.filter(r => !r.is_like).length;
            
            // Check if the current user has reacted
            let userReaction = null;
            if (userId) {
              const userReactionData = articleReactions.find(r => r.user_id === userId);
              if (userReactionData) {
                userReaction = userReactionData.is_like;
              }
            }
            
            return {
              ...article,
              channel,
              likes,
              dislikes,
              userReaction
            };
          });
          
          console.log(`Successfully enhanced ${articlesWithData.length} articles with channel and reaction data`);
          return res.json(articlesWithData || []);
        }
      }
    }
    
    // Fallback: return articles without channels
    console.log(`Returning ${articles?.length || 0} articles without channel data`);
    res.json(articles || []);
  } catch (error) {
    console.error("Error fetching articles:", error);
    res.status(500).json({ error: "Failed to fetch articles", details: String(error) });
  }
});

// Create article endpoint
app.post("/api/articles", async (req, res) => {
  try {
    console.log("Creating a new article");
    
    // Extract the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found for article creation");
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token for article creation:', userError);
      return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    // Look up the user in the database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', userData.user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('Error finding user for article creation:', dbError);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userId = dbUser.id;
    
    // Extract article data from request
    const { title, content, channelId, category, location, published = true } = req.body;
    
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    if (!channelId || isNaN(parseInt(channelId))) {
      return res.status(400).json({ error: 'Valid channel ID is required' });
    }
    
    // Verify the channel exists and belongs to this user
    const channelIdNumber = parseInt(channelId);
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('id, user_id')
      .eq('id', channelIdNumber)
      .single();
      
    if (channelError || !channel) {
      console.error(`Channel ${channelIdNumber} not found:`, channelError);
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    if (channel.user_id !== userId) {
      console.error(`User ${userId} is not authorized to create article in channel ${channelIdNumber}`);
      return res.status(403).json({ error: 'Not authorized to create article in this channel' });
    }
    
    // Create the article
    const { data: article, error: createError } = await supabase
      .from('articles')
      .insert([{
        title: title.trim(),
        content: content,
        channel_id: channelIdNumber,
        user_id: userId,
        category: category || '',
        location: location || null,
        published: published,
        created_at: new Date().toISOString(),
        status: published ? 'published' : 'draft',
        view_count: 0
      }])
      .select()
      .single();
      
    if (createError) {
      console.error('Error creating article:', createError);
      return res.status(500).json({ error: 'Failed to create article' });
    }
    
    console.log(`Article created successfully with ID ${article.id}`);
    return res.status(201).json(article);
  } catch (error) {
    console.error('Error in create article endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Single article route (needed for article detail page)
app.get("/api/articles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("====== ARTICLE LOOKUP DEBUG ======");
    console.log("Article lookup request for:", id);
    console.log("Request headers:", JSON.stringify(req.headers, null, 2));
    
    let article;
    let error;
    
    // Check if id is numeric (old format) or a slug (new format)
    if (/^\d+$/.test(id)) {
      // Numeric ID
      console.log("Looking up article by numeric ID:", id);
      const result = await supabase
        .from("articles")
        .select(`
          *,
          channel:channel_id (
            id,
            name,
            description,
            category,
            location,
            banner_image,
            profile_image,
            user_id,
            created_at,
            slug
          )
        `)
        .eq("id", parseInt(id))
        .single();
        
      article = result.data;
      error = result.error;
      console.log("Numeric ID lookup result:", article ? "Found" : "Not found");
      if (error) console.error("Numeric ID lookup error:", error);
    } else {
      // Slug lookup
      console.log("Looking up article by slug:", id);
      const result = await supabase
        .from("articles")
        .select(`
          *,
          channel:channel_id (
            id,
            name,
            description,
            category,
            location,
            banner_image,
            profile_image,
            user_id,
            created_at,
            slug
          )
        `)
        .eq("slug", id)
        .single();
        
      article = result.data;
      error = result.error;
      console.log("Slug lookup result:", article ? "Found" : "Not found");
      if (error) console.error("Slug lookup error:", error);
      
      // If not found by slug, try extracting ID from slug
      if (!article && !error) {
        const idMatch = id.match(/-(\d+)$/);
        if (idMatch) {
          const extractedId = idMatch[1];
          console.log("Extracted ID from slug:", extractedId);
          
          const idResult = await supabase
            .from("articles")
            .select(`
              *,
              channel:channel_id (
                id,
                name,
                description,
                category,
                location,
                banner_image,
                profile_image,
                user_id,
                created_at,
                slug
              )
            `)
            .eq("id", parseInt(extractedId))
            .single();
            
          article = idResult.data;
          error = idResult.error;
          console.log("Extracted ID lookup result:", article ? "Found" : "Not found");
          if (error) console.error("Extracted ID lookup error:", error);
        }
      }
    }
    
    if (error) {
      console.error("Error fetching article:", error);
      return res.status(404).json({ error: "Article not found" });
    }
    
    if (!article) {
      console.log("Article not found for slug or ID:", id);
      return res.status(404).json({ error: "Article not found" });
    }
    
    console.log("Retrieved article:", article.id, article.title);
    console.log("Article slug:", article.slug);
    console.log("====== END ARTICLE LOOKUP DEBUG ======");

    // Add reaction data to the response
    await enrichArticleWithReactions(article, req);

    res.json(article);
  } catch (error) {
    console.error("Error fetching article:", error);
    res.status(500).json({ error: "Failed to fetch article", details: String(error) });
  }
});

// Helper function to add reaction data to articles
async function enrichArticleWithReactions(article, req) {
  if (!article) return;
  
  try {
    // Get all reactions for this article
    const { data: reactions, error: reactionsError } = await supabase
      .from("reactions")
      .select("is_like, user_id")
      .eq("article_id", article.id);
      
    if (!reactionsError && reactions) {
      article.likes = reactions.filter(r => r.is_like).length;
      article.dislikes = reactions.filter(r => !r.is_like).length;
      
      // If user is authenticated, check if they have reacted
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        
        try {
          const { data, error: authError } = await supabaseAuth.auth.getUser(token);
          if (!authError && data.user) {
            // Look up internal user ID
            const { data: dbUser } = await supabase
              .from('users')
              .select('id')
              .eq('supabase_uid', data.user.id)
              .single();
              
            if (dbUser) {
              const userId = dbUser.id;
              
              // Find user's reaction
              const userReactionData = reactions.find(r => r.user_id === userId);
              if (userReactionData) {
                article.userReaction = userReactionData.is_like;
              }
            }
          }
        } catch (e) {
          console.error("Error checking user reaction:", e);
        }
      }
    }
  } catch (e) {
    console.error("Error enriching article with reactions:", e);
  }
}

// Add session-from-hash endpoint to help with authentication
app.post('/api/auth/session-from-hash', async (req, res) => {
  try {
    const { access_token, refresh_token, expires_in, provider_token } = req.body;
    
    console.log('Session from hash received:', { 
      access_token: access_token ? "✓" : "✗", 
      refresh_token: refresh_token ? "✓" : "✗",
      expires_in: expires_in ? "✓" : "✗",
      provider_token: provider_token ? "✓" : "✗"
    });
    
    if (!access_token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing access token' 
      });
    }
    
    // Return success response
    return res.json({ 
      success: true, 
      message: 'Session parameters received' 
    });
  } catch (error) {
    console.error('Error in session-from-hash:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      details: String(error)
    });
  }
});

// Add logout endpoint
app.post("/api/logout", async (req, res) => {
  try {
    console.log("Logout requested");
    
    // Extract the Authorization header to identify the session
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      // Sign out from Supabase
      const { error } = await supabaseAuth.auth.signOut();
      
      if (error) {
        console.error('Error during logout:', error);
        return res.status(500).json({ error: 'Failed to logout' });
      }
    }
    
    // Return success even if no token was provided
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in logout endpoint:', error);
    return res.status(500).json({ error: 'Server error during logout' });
  }
});

// Add user channels endpoint
app.get("/api/user/channels", async (req, res) => {
  try {
    console.log("User channels endpoint called");
    
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found");
      return res.sendStatus(401);
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("No token found in Authorization header");
      return res.sendStatus(401);
    }
    
    console.log("Verifying user token...");
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token:', userError);
      return res.sendStatus(401);
    }
    
    const supabaseUid = userData.user.id;
    console.log("User verified, Supabase UID:", supabaseUid);
    
    // IMPORTANT DEBUG: Directly query the users table to understand the data structure
    try {
      const { data: allUsers, error: allUsersError } = await supabase
        .from('users')
        .select('id, username, supabase_uid')
        .limit(10);
        
      if (allUsersError) {
        console.error('Error querying users table:', allUsersError);
      } else {
        console.log('First 10 users in database:', allUsers);
        
        // Find this user in the returned users
        const currentUserInList = allUsers?.find(u => u.supabase_uid === supabaseUid);
        if (currentUserInList) {
          console.log('Found current user in users table:', currentUserInList);
        } else {
          console.log('Current user NOT found in users table. Looking for Supabase UID:', supabaseUid);
        }
      }
    } catch (userQueryError) {
      console.error('Exception querying users table:', userQueryError);
    }
    
    // Look up the user in our database
    console.log("Looking up user in database with Supabase UID:", supabaseUid);
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_uid', supabaseUid)
      .single();
    
    if (dbError) {
      console.error('Error finding user in database:', dbError);
      if (dbError.code === 'PGRST116') {
        console.log("No user found in the database with supabase_uid:", supabaseUid);
      }
      
      // FALLBACK: Try to get user by username if supabase_uid fails
      const username = userData.user.email?.split('@')[0] || userData.user.user_metadata?.name || userData.user.user_metadata?.full_name;
      if (username) {
        console.log('Trying fallback: looking up user by username:', username);
        const { data: userByUsername, error: usernameError } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .single();
          
        if (usernameError) {
          console.error('Fallback search also failed:', usernameError);
          return res.status(401).json({ error: 'User not found in database', details: dbError });
        }
        
        if (userByUsername) {
          console.log('Found user by username instead:', userByUsername);
          
          // Update this user's supabase_uid if it's missing
          if (!userByUsername.supabase_uid) {
            console.log('Updating user record with correct Supabase UID');
            const { error: updateError } = await supabase
              .from('users')
              .update({ supabase_uid: supabaseUid })
              .eq('id', userByUsername.id);
              
            if (updateError) {
              console.error('Failed to update user with Supabase UID:', updateError);
            }
          }
          
          // Continue with this user
          const userId = userByUsername.id;
          console.log(`Using user ID ${userId} found by username instead`);
          
          // Fetch channels for this user ID
          const { data: channels, error: channelsError } = await supabase
            .from('channels')
            .select('*')
            .eq('user_id', userId);
            
          if (channelsError) {
            console.error('Error fetching user channels by username fallback:', channelsError);
            return res.status(500).json({ error: 'Failed to fetch user channels', details: channelsError });
          }
          
          console.log(`Found ${channels?.length || 0} channels for user ${username} via fallback method`);
          return res.json(channels || []);
        }
      }
      
      return res.status(401).json({ error: 'User not found in database', details: dbError });
    }
    
    if (!dbUser) {
      console.log("User not found in database");
      return res.status(401).json({ error: 'User not found in database' });
    }
    
    const userId = dbUser.id;
    console.log("User found in database, ID:", userId);
    
    // Fetch channels owned by this user
    console.log(`Fetching channels for user ID ${userId}...`);
    
    // First, check if we can query the channels table
    try {
      const { count, error: countError } = await supabase
        .from('channels')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        console.error('Error checking channels table:', countError);
      } else {
        console.log(`Total channels in database: ${count || 0}`);
      }
    } catch (countErr) {
      console.error('Unexpected error checking channels table:', countErr);
    }
    
    try {
      // IMPORTANT: Print all channels in the database to see if data exists
      const { data: allChannels, error: allChannelsError } = await supabase
        .from('channels')
        .select('id, name, user_id')
        .limit(20);
        
      if (allChannelsError) {
        console.error('Error querying all channels:', allChannelsError);
      } else {
        console.log('All channels in database:', allChannels);
      }
      
      // Normal query for this user's channels
      const { data: channels, error: channelsError } = await supabase
        .from('channels')
        .select('*')
        .eq('user_id', userId);
        
      if (channelsError) {
        console.error('Error fetching user channels:', channelsError);
        return res.status(500).json({ error: 'Failed to fetch user channels', details: channelsError });
      }
      
      console.log(`Found ${channels?.length || 0} channels for user ${dbUser.username}`);
      if (channels && channels.length > 0) {
        console.log('Channel IDs:', channels.map(c => c.id).join(', '));
      } else {
        console.log('No channels found for this user');
      }
      
      // Return the channels
      return res.json(channels || []);
    } catch (channelsErr) {
      console.error('Unexpected error fetching channels:', channelsErr);
      return res.status(500).json({ 
        error: 'Unexpected error fetching channels', 
        details: String(channelsErr) 
      });
    }
  } catch (error) {
    console.error('Error in /api/user/channels endpoint:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: String(error)
    });
  }
});

// Add user subscriptions endpoint
app.get("/api/user/subscriptions", async (req, res) => {
  try {
    console.log("User subscriptions endpoint called");
    
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found");
      return res.sendStatus(401);
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("No token found in Authorization header");
      return res.sendStatus(401);
    }
    
    console.log("Verifying user token...");
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token:', userError);
      return res.sendStatus(401);
    }
    
    const supabaseUid = userData.user.id;
    console.log("User verified, Supabase UID:", supabaseUid);
    
    // Look up the user in our database
    console.log("Looking up user in database with Supabase UID:", supabaseUid);
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_uid', supabaseUid)
      .single();
    
    if (dbError) {
      console.error('Error finding user in database:', dbError);
      if (dbError.code === 'PGRST116') {
        console.log("No user found in the database with supabase_uid:", supabaseUid);
      }
      
      // FALLBACK: Try to get user by username if supabase_uid fails
      const username = userData.user.email?.split('@')[0] || userData.user.user_metadata?.name || userData.user.user_metadata?.full_name;
      if (username) {
        console.log('Trying fallback: looking up user by username:', username);
        const { data: userByUsername, error: usernameError } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .single();
          
        if (usernameError) {
          console.error('Fallback search also failed:', usernameError);
          return res.status(401).json({ error: 'User not found in database', details: dbError });
        }
        
        if (userByUsername) {
          console.log('Found user by username instead:', userByUsername);
          
          // Update this user's supabase_uid if it's missing
          if (!userByUsername.supabase_uid) {
            console.log('Updating user record with correct Supabase UID');
            const { error: updateError } = await supabase
              .from('users')
              .update({ supabase_uid: supabaseUid })
              .eq('id', userByUsername.id);
              
            if (updateError) {
              console.error('Failed to update user with Supabase UID:', updateError);
            }
          }
          
          // Continue with this user
          const userId = userByUsername.id;
          console.log(`Using user ID ${userId} found by username instead`);
          
          return handleUserSubscriptions(userId, res);
        }
      }
      
      return res.status(401).json({ error: 'User not found in database', details: dbError });
    }
    
    if (!dbUser) {
      console.log("User not found in database");
      return res.status(401).json({ error: 'User not found in database' });
    }
    
    const userId = dbUser.id;
    console.log("User found in database, ID:", userId);
    
    return handleUserSubscriptions(userId, res);
  } catch (error) {
    console.error('Error in /api/user/subscriptions endpoint:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: String(error)
    });
  }
});

// Helper function to handle getting user subscriptions by ID
async function handleUserSubscriptions(userId: number, res: any) {
  try {
    console.log(`Fetching subscriptions for user ID ${userId}...`);
    
    // Check the available columns in the subscriptions table first
    const { data: availableColumns, error: columnsError } = await supabase
      .from('subscriptions')
      .select('*')
      .limit(1);
      
    const createdAtColumn = 'created_at';
    
    if (columnsError) {
      console.error('Error checking subscriptions schema:', columnsError);
    }
    
    // Check if created_at exists in the table structure
    const hasCreatedAt = availableColumns && 
                        availableColumns.length > 0 && 
                        createdAtColumn in availableColumns[0];
    
    console.log(`Subscriptions table ${hasCreatedAt ? 'has' : 'does not have'} created_at column`);
    
    // First get just the subscription records
    let selectColumns = 'id, channel_id';
    if (hasCreatedAt) {
      selectColumns += ', created_at';
    }
    
    const { data: subscriptions, error: subsError } = await supabase
      .from('subscriptions')
      .select(selectColumns)
      .eq('user_id', userId);
      
    if (subsError) {
      console.error('Error fetching user subscriptions:', subsError);
      return res.status(500).json({ error: 'Failed to fetch user subscriptions', details: subsError });
    }
    
    // If no subscriptions, return empty array
    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for user');
      return res.json([]);
    }
    
    console.log(`Found ${subscriptions.length} subscriptions for user ${userId}`);
    
    // Extract channel IDs using type assertion to avoid TypeScript errors
    const subscriptionsArray = subscriptions as unknown as Array<{channel_id: number}>;
    const channelIds = subscriptionsArray.map(sub => sub.channel_id);
    
    console.log('Subscription channel IDs:', channelIds);
    
    // Now fetch the channel data separately
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('*')
      .in('id', channelIds);
      
    if (channelsError) {
      console.error('Error fetching channels for subscriptions:', channelsError);
      return res.status(500).json({ error: 'Failed to fetch subscription channels', details: channelsError });
    }
    
    console.log(`Found ${channels?.length || 0} channels for subscriptions`);
    
    // Add subscriber count to each channel
    const enhancedChannels = await Promise.all((channels || []).map(async (channel) => {
      try {
        // Get subscriber count for this channel
        const { count, error: countError } = await supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', channel.id);
          
        if (!countError) {
          return {
            ...channel,
            subscriberCount: count || 0
          };
        }
        return channel;
      } catch (error) {
        console.error(`Error getting subscriber count for channel ${channel.id}:`, error);
        return channel;
      }
    }));
    
    // Return the channels with subscriber counts
    return res.json(enhancedChannels || []);
  } catch (error) {
    console.error('Error handling user subscriptions:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: String(error)
    });
  }
}

// Remove the user-specific endpoints and add proper parameterized debug endpoints
// 1. Debug endpoint for channels with proper query parameters
app.get("/api/debug/channels", async (req, res) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
    console.log(`Debug endpoint: Fetching channels${userId ? ` for user ID ${userId}` : ' (all channels)'}`);
    
    // Build query
    let query = supabase.from("channels").select("*");
    
    // Apply userId filter if provided
    if (userId) {
      query = query.eq("user_id", userId);
    }
    
    // Execute query
    const { data: channels, error } = await query;
    
    if (error) {
      console.error("Debug endpoint error:", error);
      return res.status(500).json({ 
        success: false,
        message: "Error fetching channels", 
        error: error.message,
        count: 0,
        channels: []
      });
    }
    
    console.log(`Debug endpoint: Found ${channels.length} channels${userId ? ` for user ID ${userId}` : ''}`);
    
    // Enrich each channel with subscriber count
    const enrichedChannels = await Promise.all((channels || []).map(async (channel) => {
      // Get subscriber count
      const { count, error: countError } = await supabase
        .from("subscriptions")
        .select("*", { count: 'exact', head: true })
        .eq("channel_id", channel.id);
        
      if (countError) {
        console.error(`Error fetching subscriber count for channel ${channel.id}:`, countError);
      }
      
      return {
        ...channel,
        subscriberCount: count || 0
      };
    }));
    
    return res.status(200).json({ 
      success: true,
      message: `Channels found${userId ? ` for user ID ${userId}` : ''}`, 
      count: enrichedChannels.length,
      channels: enrichedChannels
    });
  } catch (error) {
    console.error("Debug endpoint unexpected error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Unexpected error fetching channels", 
      error: error.message,
      count: 0,
      channels: []
    });
  }
});

// 2. Debug endpoint for subscriptions with proper query parameters
app.get("/api/debug/subscriptions", async (req, res) => {
  // Add timestamp to response
  const timestamp = new Date().toISOString();
  
  try {
    // Parse userId if provided
    const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
    
    console.log(`Debug endpoint: Fetching subscriptions${userId ? ` for user ID ${userId}` : ' (all subscriptions)'}`);
    
    // Build overall response
    const response = {
      success: true,
      message: "Debug subscriptions endpoint",
      timestamp,
      count: 0,
      subscriptions: [] as any[],
      diagnostic: null as any
    };
    
    // First check if user exists
    if (userId) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, username')
        .eq('id', userId)
        .single();
        
      if (userError) {
        console.error('Error checking if user exists:', userError);
        response.diagnostic = { userCheck: 'failed', error: userError };
      } else if (!user) {
        response.message = `User with ID ${userId} not found`;
        return res.json(response);
      }
    }
    
    // Build query to get subscriptions
    let query = supabase.from("subscriptions").select("id, user_id, channel_id");
    
    // Apply userId filter if provided
    if (userId) {
      query = query.eq("user_id", userId);
    }
    
    // Execute query
    const { data: subscriptions, error } = await query;
    
    if (error) {
      console.error("Debug subscriptions endpoint error:", error);
      return res.status(500).json({ 
        success: false,
        message: "Error fetching subscriptions",
        timestamp,
        error: String(error)
      });
    }
    
    if (!subscriptions || subscriptions.length === 0) {
      response.message = userId 
        ? `No subscriptions found for user ID ${userId}` 
        : "No subscriptions found";
      return res.json(response);
    }
    
    // Get channel data for each subscription
    const channelIds = subscriptions.map(sub => sub.channel_id);
    const { data: channels, error: channelsError } = await supabase
      .from("channels")
      .select("*")
      .in("id", channelIds);
      
    if (channelsError) {
      console.error("Error fetching channels for subscriptions:", channelsError);
      response.diagnostic = { channelsQuery: 'failed', error: channelsError };
      return res.json(response);
    }
    
    // Create a map for quick lookup
    const channelMap = {};
    if (channels) {
      await Promise.all(channels.map(async (channel) => {
        // Get subscriber count for each channel
        const { count, error: countError } = await supabase
          .from("subscriptions")
          .select("*", { count: 'exact', head: true })
          .eq("channel_id", channel.id);
          
        channelMap[channel.id] = {
          ...channel,
          subscriberCount: countError ? 0 : (count || 0)
        };
      }));
    }
    
    // Format subscriptions with channel data
    const formattedSubscriptions = subscriptions.map(sub => {
      return {
        id: sub.id,
        userId: sub.user_id,
        channelId: sub.channel_id,
        channel: channelMap[sub.channel_id] || null
      };
    });
    
    response.count = formattedSubscriptions.length;
    response.subscriptions = formattedSubscriptions;
    
    return res.json(response);
  } catch (error) {
    console.error("Error in debug subscriptions endpoint:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error in debug subscriptions endpoint",
      timestamp,
      error: String(error)
    });
  }
});

// Add a diagnostic endpoint for checking the entire system
app.get("/api/debug/system", async (req, res) => {
  try {
    console.log("System diagnostic endpoint called");
    
    interface SystemDebugInfo {
      environment: string;
      timestamp: string;
      supabase: {
        url: string;
        serviceKeyPresent: boolean;
        anonKeyPresent: boolean;
      };
      vercel: {
        isVercel: boolean;
        environment: string | null;
        url: string | null;
        region: string | null;
      };
      database: {
        tables: {
          status: string;
          tableNames: string[] | null;
          error?: string;
        };
        counts: {
          users: { count: number | null; error?: string };
          channels: { count: number | null; error?: string };
          subscriptions: { count: number | null; error?: string };
        };
        sampleQueries: {
          userWithId3: { exists: boolean; error?: string };
          channelsForUser3: { count: number | null; error?: string };
          subscriptionsForUser3: { count: number | null; error?: string };
        };
        schemas: {
          users: { columns: string[] | null; error?: string };
          channels: { columns: string[] | null; error?: string };
          subscriptions: { columns: string[] | null; error?: string };
        };
      };
    }
    
    const diagnosticInfo: SystemDebugInfo = {
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString(),
      supabase: {
        url: supabaseUrl ? supabaseUrl.substring(0, 10) + '...' : 'missing',
        serviceKeyPresent: !!supabaseServiceKey,
        anonKeyPresent: !!supabaseAnonKey
      },
      vercel: {
        isVercel: process.env.VERCEL === '1',
        environment: process.env.VERCEL_ENV || null,
        url: process.env.VERCEL_URL || null,
        region: process.env.VERCEL_REGION || null
      },
      database: {
        tables: {
          status: 'pending',
          tableNames: null
        },
        counts: {
          users: { count: null },
          channels: { count: null },
          subscriptions: { count: null }
        },
        sampleQueries: {
          userWithId3: { exists: false },
          channelsForUser3: { count: null },
          subscriptionsForUser3: { count: null }
        },
        schemas: {
          users: { columns: null },
          channels: { columns: null },
          subscriptions: { columns: null }
        }
      }
    };
    
    // Test database schema access
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
      
      if (tablesError) {
        diagnosticInfo.database.tables.status = 'error';
        diagnosticInfo.database.tables.error = tablesError.message;
      } else {
        diagnosticInfo.database.tables.status = 'success';
        diagnosticInfo.database.tables.tableNames = tables?.map(t => t.table_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.tables.status = 'exception';
      diagnosticInfo.database.tables.error = String(error);
    }
    
    // Check table counts
    try {
      const { count: userCount, error: userError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      if (userError) {
        diagnosticInfo.database.counts.users.error = userError.message;
      } else {
        diagnosticInfo.database.counts.users.count = userCount;
      }
    } catch (error) {
      diagnosticInfo.database.counts.users.error = String(error);
    }
    
    try {
      const { count: channelCount, error: channelError } = await supabase
        .from('channels')
        .select('*', { count: 'exact', head: true });
      
      if (channelError) {
        diagnosticInfo.database.counts.channels.error = channelError.message;
      } else {
        diagnosticInfo.database.counts.channels.count = channelCount;
      }
    } catch (error) {
      diagnosticInfo.database.counts.channels.error = String(error);
    }
    
    try {
      const { count: subscriptionCount, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true });
      
      if (subscriptionError) {
        diagnosticInfo.database.counts.subscriptions.error = subscriptionError.message;
      } else {
        diagnosticInfo.database.counts.subscriptions.count = subscriptionCount;
      }
    } catch (error) {
      diagnosticInfo.database.counts.subscriptions.error = String(error);
    }
    
    // Check for user with ID 3
    try {
      const { data: user3, error: user3Error } = await supabase
        .from('users')
        .select('*')
        .eq('id', 3)
        .single();
      
      if (user3Error) {
        diagnosticInfo.database.sampleQueries.userWithId3.error = user3Error.message;
      } else {
        diagnosticInfo.database.sampleQueries.userWithId3.exists = !!user3;
      }
    } catch (error) {
      diagnosticInfo.database.sampleQueries.userWithId3.error = String(error);
    }
    
    // Check for channels with user_id 3
    try {
      const { count: channelsUser3Count, error: channelsUser3Error } = await supabase
        .from('channels')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', 3);
      
      if (channelsUser3Error) {
        diagnosticInfo.database.sampleQueries.channelsForUser3.error = channelsUser3Error.message;
      } else {
        diagnosticInfo.database.sampleQueries.channelsForUser3.count = channelsUser3Count;
      }
    } catch (error) {
      diagnosticInfo.database.sampleQueries.channelsForUser3.error = String(error);
    }
    
    // Check for subscriptions with user_id 3
    try {
      const { count: subscriptionsUser3Count, error: subscriptionsUser3Error } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', 3);
      
      if (subscriptionsUser3Error) {
        diagnosticInfo.database.sampleQueries.subscriptionsForUser3.error = subscriptionsUser3Error.message;
      } else {
        diagnosticInfo.database.sampleQueries.subscriptionsForUser3.count = subscriptionsUser3Count;
      }
    } catch (error) {
      diagnosticInfo.database.sampleQueries.subscriptionsForUser3.error = String(error);
    }
    
    // Get schema information
    try {
      const { data: usersColumns, error: usersColumnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'users')
        .eq('table_schema', 'public');
      
      if (usersColumnsError) {
        diagnosticInfo.database.schemas.users.error = usersColumnsError.message;
      } else {
        diagnosticInfo.database.schemas.users.columns = usersColumns?.map(c => c.column_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.schemas.users.error = String(error);
    }
    
    try {
      const { data: channelsColumns, error: channelsColumnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'channels')
        .eq('table_schema', 'public');
      
      if (channelsColumnsError) {
        diagnosticInfo.database.schemas.channels.error = channelsColumnsError.message;
      } else {
        diagnosticInfo.database.schemas.channels.columns = channelsColumns?.map(c => c.column_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.schemas.channels.error = String(error);
    }
    
    try {
      const { data: subscriptionsColumns, error: subscriptionsColumnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'subscriptions')
        .eq('table_schema', 'public');
      
      if (subscriptionsColumnsError) {
        diagnosticInfo.database.schemas.subscriptions.error = subscriptionsColumnsError.message;
      } else {
        diagnosticInfo.database.schemas.subscriptions.columns = subscriptionsColumns?.map(c => c.column_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.schemas.subscriptions.error = String(error);
    }
    
    return res.status(200).json(diagnosticInfo);
  } catch (error) {
    console.error('Error in system diagnostics endpoint:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Error running system diagnostics', 
      error: String(error)
    });
  }
});

// Add single channel endpoint to fix channel not found issue
app.get("/api/channels/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Channel lookup request for:", id);
    
    let channel;
    let error;
    
    // Check if id is numeric (old format) or a slug (new format)
    if (/^\d+$/.test(id)) {
      // Numeric ID
      console.log("Looking up channel by numeric ID:", id);
      const result = await supabase
        .from("channels")
        .select("*")
        .eq("id", parseInt(id))
        .single();
        
      channel = result.data;
      error = result.error;
    } else {
      // Slug lookup
      console.log("Looking up channel by slug:", id);
      const result = await supabase
        .from("channels")
        .select("*")
        .eq("slug", id)
        .single();
        
      channel = result.data;
      error = result.error;
      
      // If not found by slug, try extracting ID from slug
      if (!channel && !error) {
        const idMatch = id.match(/-(\d+)$/);
        if (idMatch) {
          const extractedId = idMatch[1];
          console.log("Extracted ID from slug:", extractedId);
          
          const idResult = await supabase
            .from("channels")
            .select("*")
            .eq("id", parseInt(extractedId))
            .single();
            
          channel = idResult.data;
          error = idResult.error;
        }
      }
    }
    
    if (error) {
      console.error("Error fetching channel:", error);
      return res.status(404).json({ error: "Channel not found" });
    }
    
    if (!channel) {
      console.log("Channel not found for slug or ID:", id);
      return res.status(404).json({ error: "Channel not found" });
    }
    
    console.log("Retrieved channel:", channel.id, channel.name);
    
    // Get subscriber count
    try {
      const { count: subscriberCount, error: countError } = await supabase
        .from("subscriptions")
        .select("*", { count: 'exact', head: true })
        .eq("channel_id", channel.id);
        
      if (countError) {
        console.error(`Error fetching subscriber count for channel ${channel.id}:`, countError);
      }
      
      // Add subscriber count to the channel data
      channel.subscriberCount = subscriberCount || 0;
      
      console.log(`Channel ${channel.id} has ${channel.subscriberCount} subscribers`);
    } catch (countError) {
      console.error(`Error calculating subscriber count for channel ${channel.id}:`, countError);
      channel.subscriberCount = 0;
    }
    
    // Check if user is subscribed - use authenticateUser helper
    const { userId } = await authenticateUser(req);
    if (userId) {
      try {
        const { data: subscription, error: subError } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", userId)
          .eq("channel_id", channel.id)
          .single();
          
        channel.isSubscribed = !!subscription;
      } catch (subError) {
        console.error(`Error checking subscription for user ${userId} to channel ${channel.id}:`, subError);
        channel.isSubscribed = false;
      }
    }
    
    res.json(channel);
  } catch (error) {
    console.error(`Error fetching channel ID ${req.params.id}:`, error);
    return res.status(500).json({ error: "Failed to fetch channel details" });
  }
});

// Add subscribe/unsubscribe endpoints
app.post("/api/channels/:id/subscribe", async (req, res) => {
  try {
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found for subscription");
      return res.sendStatus(401);
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("No token found in Authorization header for subscription");
      return res.sendStatus(401);
    }
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token for subscription:', userError);
      return res.sendStatus(401);
    }
    
    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', userData.user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('Error finding user for subscription:', dbError);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userId = dbUser.id;
    const channelId = parseInt(req.params.id);
    
    // Check if already subscribed
    const { data: existingSub, error: subCheckError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .maybeSingle();
    
    if (subCheckError) {
      console.error('Error checking existing subscription:', subCheckError);
    }
    
    if (existingSub) {
      console.log(`User ${userId} already subscribed to channel ${channelId}`);
      return res.json({ message: 'Already subscribed' });
    }
    
    // Create the subscription
    const { data, error: createError } = await supabase
      .from('subscriptions')
      .insert([{ user_id: userId, channel_id: channelId }])
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating subscription:', createError);
      return res.status(500).json({ error: 'Failed to subscribe' });
    }
    
    console.log(`User ${userId} subscribed to channel ${channelId}`);
    return res.status(201).json(data);
  } catch (error) {
    console.error('Error in subscribe endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.delete("/api/channels/:id/subscribe", async (req, res) => {
  try {
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found for unsubscribe");
      return res.sendStatus(401);
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("No token found in Authorization header for unsubscribe");
      return res.sendStatus(401);
    }
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token for unsubscribe:', userError);
      return res.sendStatus(401);
    }
    
    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', userData.user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('Error finding user for unsubscribe:', dbError);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userId = dbUser.id;
    const channelId = parseInt(req.params.id);
    
    // Delete the subscription
    const { error: deleteError } = await supabase
      .from('subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('channel_id', channelId);
    
    if (deleteError) {
      console.error('Error deleting subscription:', deleteError);
      return res.status(500).json({ error: 'Failed to unsubscribe' });
    }
    
    console.log(`User ${userId} unsubscribed from channel ${channelId}`);
    return res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error in unsubscribe endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Add channel articles endpoint
app.get("/api/channels/:id/articles", async (req, res) => {
  try {
    const channelId = parseInt(req.params.id);
    console.log(`Fetching articles for channel ID: ${channelId}`);
    
    // Fetch published articles for the channel
    const { data: articles, error } = await supabase
      .from("articles")
      .select("*")
      .eq("channel_id", channelId)
      .eq("published", true)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error(`Error fetching articles for channel ${channelId}:`, error);
      return res.status(500).json({ error: "Failed to fetch articles" });
    }
    
    console.log(`Found ${articles?.length || 0} articles for channel ${channelId}`);
    
    // If we have articles, enrich them with reaction data
    if (articles && articles.length > 0) {
      // Get all reactions for all articles in a single query
      const articleIds = articles.map(article => article.id);
      const { data: allReactions, error: reactionsError } = await supabase
        .from("reactions")
        .select("article_id, is_like, user_id")
        .in("article_id", articleIds);
        
      if (reactionsError) {
        console.error("Error fetching reactions for channel articles:", reactionsError);
      } else if (allReactions && allReactions.length > 0) {
        // Group reactions by article ID
        const reactionsByArticle = {};
        allReactions.forEach(reaction => {
          if (!reactionsByArticle[reaction.article_id]) {
            reactionsByArticle[reaction.article_id] = [];
          }
          reactionsByArticle[reaction.article_id].push(reaction);
        });
        
        // Get user ID if authenticated
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split(' ')[1];
          try {
            const { data, error: authError } = await supabaseAuth.auth.getUser(token);
            if (!authError && data.user) {
              // Look up internal user ID
              const { data: dbUser } = await supabase
                .from('users')
                .select('id')
                .eq('supabase_uid', data.user.id)
                .single();
                
              if (dbUser) {
                userId = dbUser.id;
              }
            }
          } catch (e) {
            console.error("Error checking user for reactions:", e);
          }
        }
        
        // Add reaction data to each article
        const articlesWithReactions = articles.map(article => {
          // Add reaction data
          const articleReactions = reactionsByArticle[article.id] || [];
          const likes = articleReactions.filter(r => r.is_like).length;
          const dislikes = articleReactions.filter(r => !r.is_like).length;
          
          // Check if the current user has reacted
          let userReaction = null;
          if (userId) {
            const userReactionData = articleReactions.find(r => r.user_id === userId);
            if (userReactionData) {
              userReaction = userReactionData.is_like;
            }
          }
          
          return {
            ...article,
            likes,
            dislikes,
            userReaction
          };
        });
        
        console.log(`Added reaction data to ${articlesWithReactions.length} channel articles`);
        return res.json(articlesWithReactions);
      }
    }
    
    return res.json(articles || []);
  } catch (error) {
    console.error(`Error fetching articles for channel:`, error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Add channel drafts endpoint
app.get("/api/channels/:id/drafts", async (req, res) => {
  try {
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found for drafts");
      return res.sendStatus(401);
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("No token found in Authorization header for drafts");
      return res.sendStatus(401);
    }
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token for drafts:', userError);
      return res.sendStatus(401);
    }
    
    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', userData.user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('Error finding user for drafts:', dbError);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userId = dbUser.id;
    const channelId = parseInt(req.params.id);
    
    // Verify user owns this channel
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('user_id', userId)
      .single();
    
    if (channelError || !channel) {
      console.error(`User ${userId} not authorized to view drafts for channel ${channelId}`);
      return res.status(403).json({ error: 'Not authorized to view drafts for this channel' });
    }
    
    // Fetch draft articles for the channel
    const { data: drafts, error } = await supabase
      .from("articles")
      .select("*")
      .eq("channel_id", channelId)
      .eq("published", false)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error(`Error fetching drafts for channel ${channelId}:`, error);
      return res.status(500).json({ error: "Failed to fetch drafts" });
    }
    
    console.log(`Found ${drafts?.length || 0} drafts for channel ${channelId}`);
    return res.json(drafts || []);
  } catch (error) {
    console.error(`Error fetching drafts for channel:`, error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Add support for updating a channel
app.patch("/api/channels/:id", async (req, res) => {
  try {
    const channelId = parseInt(req.params.id);
    const { name, description, category } = req.body;
    console.log(`Updating channel ID ${channelId} with:`, req.body);
    
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found for channel update");
      return res.sendStatus(401);
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("No token found in Authorization header for channel update");
      return res.sendStatus(401);
    }
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token for channel update:', userError);
      return res.sendStatus(401);
    }
    
    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', userData.user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('Error finding user for channel update:', dbError);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userId = dbUser.id;
    
    // Verify user owns this channel
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('user_id', userId)
      .single();
    
    if (channelError || !channel) {
      console.error(`User ${userId} not authorized to update channel ${channelId}`);
      return res.status(403).json({ error: 'Not authorized to update this channel' });
    }
    
    // Update the channel
    const { data: updatedChannel, error } = await supabase
      .from('channels')
      .update({ 
        name: name || channel.name,
        description: description || channel.description,
        category: category || channel.category
      })
      .eq('id', channelId)
      .select()
      .single();
    
    if (error) {
      console.error(`Error updating channel ${channelId}:`, error);
      return res.status(500).json({ error: 'Failed to update channel' });
    }
    
    console.log(`Channel ${channelId} updated successfully`);
    return res.json(updatedChannel);
  } catch (error) {
    console.error('Error in channel update endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Article comments endpoints
app.post("/api/articles/:id/comments", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    console.log(`Adding comment to article ${articleId}`);
    
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No Authorization header found for adding comment");
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Error verifying user token for adding comment:', userError);
      return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    // Look up the user in the database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', userData.user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('Error finding user for adding comment:', dbError);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userId = dbUser.id;
    
    // Check if article exists
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id')
      .eq('id', articleId)
      .single();
      
    if (articleError || !article) {
      console.error(`Article ${articleId} not found:`, articleError);
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Create the comment
    const { content } = req.body;
    
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .insert([{
        article_id: articleId,
        user_id: userId,
        content: content.trim(),
        created_at: new Date().toISOString()
      }])
      .select('*, user:user_id(id, username)')
      .single();
      
    if (commentError) {
      console.error('Error creating comment:', commentError);
      return res.status(500).json({ error: 'Failed to create comment' });
    }
    
    console.log(`Comment added to article ${articleId} by user ${userId}`);
    return res.status(201).json(comment);
  } catch (error) {
    console.error('Error in add comment endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get("/api/articles/:id/comments", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    console.log(`Fetching comments for article ${articleId}`);
    
    // Check if article exists
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id')
      .eq('id', articleId)
      .single();
      
    if (articleError) {
      if (articleError.code === 'PGRST116') {
        console.error(`Article ${articleId} not found`);
        return res.status(404).json({ error: 'Article not found' });
      }
      
      console.error(`Error checking article ${articleId}:`, articleError);
      return res.status(500).json({ error: 'Failed to check article' });
    }
    
    // Fetch comments with user info
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        id,
        content,
        created_at,
        user:user_id(id, username)
      `)
      .eq('article_id', articleId)
      .order('created_at', { ascending: true });
      
    if (commentsError) {
      console.error(`Error fetching comments for article ${articleId}:`, commentsError);
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }
    
    console.log(`Found ${comments?.length || 0} comments for article ${articleId}`);
    return res.json(comments || []);
  } catch (error) {
    console.error('Error in get comments endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Article view endpoint
app.post("/api/articles/:id/view", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    console.log(`Recording view for article ${articleId}`);
    
    // Get user ID if authenticated
    let userId = null;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        const { data, error } = await supabaseAuth.auth.getUser(token);
        if (!error && data.user) {
          // Look up internal user ID if auth succeeded
          const { data: dbUser } = await supabase
            .from('users')
            .select('id')
            .eq('supabase_uid', data.user.id)
            .single();
            
          if (dbUser) {
            userId = dbUser.id;
            console.log(`Authenticated view from user ${userId}`);
          }
        }
      } catch (authError) {
        console.error('Error checking auth for view:', authError);
        // Continue as anonymous view if auth fails
      }
    }
    
    // Use IP address as client identifier for anonymous views
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const clientIdentifier = userId ? `user-${userId}` : `ip-${clientIp}`;
    
    console.log(`Processing view: articleId=${articleId}, clientId=${clientIdentifier}`);
    
    // Step 1: Check if this client has already viewed this article
    const { data: existingView, error: checkError } = await supabase
      .from('article_views')
      .select('id')
      .eq('article_id', articleId)
      .eq('client_identifier', clientIdentifier)
      .maybeSingle();
      
    if (checkError) {
      console.error('Error checking existing view:', checkError);
    }
    
    let viewCounted = false;
    
    // Step 2: If this is a new view, record it and increment the count
    if (!existingView) {
      // Insert view record
      const { error: insertError } = await supabase
        .from('article_views')
        .insert({
          article_id: articleId,
          user_id: userId,
          client_identifier: clientIdentifier
        });
        
      if (insertError) {
        console.error('Error recording view:', insertError);
      } else {
        // Increment view count directly
        const { data: article, error: getError } = await supabase
          .from('articles')
          .select('view_count')
          .eq('id', articleId)
          .single();
          
        if (getError) {
          console.error('Error getting current view count:', getError);
        } else {
          // Calculate new count and update
          const currentCount = article?.view_count || 0;
          const newCount = currentCount + 1;
          
          const { error: updateError } = await supabase
            .from('articles')
            .update({ view_count: newCount })
            .eq('id', articleId);
            
          if (updateError) {
            console.error('Error updating view count:', updateError);
          } else {
            viewCounted = true;
            console.log(`Updated view count for article ${articleId} to ${newCount}`);
          }
        }
      }
    }
    
    // Step 3: Get the current view count to return to client
    const { data: latestArticle, error: latestError } = await supabase
      .from('articles')
      .select('view_count')
      .eq('id', articleId)
      .single();
      
    if (latestError) {
      console.error('Error getting latest view count:', latestError);
      return res.json({ 
        success: true,
        counted: viewCounted,
        message: viewCounted ? 'View counted' : 'View already recorded',
        shouldInvalidateFeeds: viewCounted // Add this flag
      });
    }
    
    return res.json({
      success: true,
      counted: viewCounted, 
      view_count: latestArticle.view_count,
      message: viewCounted ? 'View counted' : 'View already recorded',
      shouldInvalidateFeeds: viewCounted // Add this flag
    });
  } catch (error) {
    console.error('Error in article view endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Article update endpoint
app.patch("/api/articles/:id", async (req, res) => {
  try {
    console.log("Update article endpoint called");
    
    // Get article ID from URL parameter
    const articleId = parseInt(req.params.id);
    if (isNaN(articleId)) {
      return res.status(400).json({ message: "Invalid article ID" });
    }
    
    // Authenticate user
    const { userId, error: authError } = await authenticateUser(req);
    if (authError) {
      return res.status(401).json({ message: authError });
    }
    
    // Fetch the article to check ownership
    const { data: article, error: fetchError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();
      
    if (fetchError) {
      console.error("Error fetching article:", fetchError);
      return res.status(404).json({ message: "Article not found" });
    }
    
    // Check if user owns the article
    if (article.user_id !== userId) {
      return res.status(403).json({ message: "Not authorized to update this article" });
    }
    
    // Extract update fields from request body
    const { title, content, categoryId, locationId } = req.body;
    
    // Construct update object with only provided fields
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (categoryId !== undefined) updates.category_id = categoryId;
    if (locationId !== undefined) updates.location_id = locationId;
    
    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString();
    
    // Update the article
    const { data: updatedArticle, error: updateError } = await supabase
      .from('articles')
      .update(updates)
      .eq('id', articleId)
      .select()
      .single();
      
    if (updateError) {
      console.error("Error updating article:", updateError);
      return res.status(500).json({ message: "Failed to update article" });
    }
    
    return res.json(updatedArticle);
  } catch (error) {
    console.error("Error in update article endpoint:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Update user information by ID
app.patch("/api/users/:id", async (req, res) => {
  try {
    console.log("Update user endpoint called");
    
    // Get user ID from URL parameter
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Authenticate the user
    const { userId: authUserId, error: authError } = await authenticateUser(req);
    if (authError) {
      return res.status(401).json({ message: authError });
    }
    
    // Check if the authenticated user is trying to update their own profile
    if (authUserId !== userId) {
      return res.status(403).json({ message: "Not authorized to update this user" });
    }
    
    // Extract update fields from request body (only allow description for now)
    const { description } = req.body;
    
    // Construct update object
    const updates: any = {};
    if (description !== undefined) updates.description = description;
    
    // Update the user
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
      
    if (updateError) {
      console.error("Error updating user:", updateError);
      return res.status(500).json({ message: "Failed to update user", details: updateError });
    }
    
    return res.json(updatedUser);
  } catch (error) {
    console.error("Error in update user endpoint:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Add channel subscribers endpoint
app.get("/api/channels/:id/subscribers", async (req, res) => {
  try {
    // Set content type to JSON explicitly
    res.setHeader('Content-Type', 'application/json');
    
    const channelId = parseInt(req.params.id);
    console.log(`API: Fetching subscribers for channel ID: ${channelId}`);
    
    // Debug log to check all request headers
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("API: No Authorization header found for get subscribers");
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("API: No token found in Authorization header for get subscribers");
      return res.status(401).json({ error: 'Authentication token required' });
    }
    
    // Verify the token with Supabase
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('API: Error verifying user token for get subscribers:', userError);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    console.log(`API: Token verified for user: ${userData.user.id}`);
    
    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', userData.user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('API: Error finding user for get subscribers:', dbError);
      return res.status(401).json({ error: 'User not found' });
    }
    
    console.log(`API: Found user ID: ${dbUser.id}`);

    // Simplified query that just gets subscriptions and user info directly
    try {
      console.log(`API: Fetching subscriptions for channel ID: ${channelId}`);
      
      // Get subscriptions for this channel
      const { data: subscriptions, error: subError } = await supabase
        .from('subscriptions')
        .select('id, user_id')
        .eq('channel_id', channelId);
      
      if (subError) {
        console.error('API: Subscription query error:', subError);
        return res.status(500).json({ error: 'Error fetching subscriptions' });
      }
      
      console.log(`API: Found ${subscriptions?.length || 0} subscriptions`);
      
      if (!subscriptions || subscriptions.length === 0) {
        console.log(`API: No subscribers found for channel ${channelId}`);
        return res.json([]);
      }
      
      // Get user details for each subscriber
      const userIds = subscriptions.map(sub => sub.user_id);
      console.log(`API: Fetching details for user IDs:`, userIds);
      
      const { data: users, error: userQueryError } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);
      
      if (userQueryError) {
        console.error('API: User query error:', userQueryError);
        return res.status(500).json({ error: 'Error fetching subscriber details' });
      }
      
      console.log(`API: Found ${users?.length || 0} users`);
      
      // Just return the subscribers with their usernames, no dates
      const subscribers = users.map(user => ({
        id: user.id,
        username: user.username
      }));
      
      console.log(`API: Returning ${subscribers.length} subscribers for channel ${channelId}`);
      console.log('API: Sample subscriber data:', subscribers.length > 0 ? subscribers[0] : 'No subscribers');
      
      return res.json(subscribers);
    } catch (queryError) {
      console.error('API: Error in simplified subscriber query:', queryError);
      return res.status(500).json({ error: 'Database query error' });
    }
  } catch (error) {
    console.error('API: Error in get channel subscribers endpoint:', error);
    return res.status(500).json({ error: 'Server error', details: String(error) });
  }
});

// Article reactions endpoint
app.post("/api/articles/:id/reactions", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    let userId = null;
    const isLike = req.body.isLike;
    
    // Get user ID if authenticated (required for reactions)
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the user
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      console.error('Error checking auth for reaction:', error);
      return res.status(401).json({ error: "Authentication required" });
    }
    
    // Look up internal user ID
    const { data: dbUser } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_uid', data.user.id)
      .single();
      
    if (!dbUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    userId = dbUser.id;
    console.log(`Processing reaction: articleId=${articleId}, userId=${userId}, isLike=${isLike}`);
    
    // Check if user has already reacted to this article
    const { data: existingReaction, error: findError } = await supabase
      .from("reactions")
      .select("id, is_like")
      .eq("article_id", articleId)
      .eq("user_id", userId)
      .maybeSingle();
      
    if (findError) {
      console.error("Error finding existing reaction:", findError);
      return res.status(500).json({ error: "Failed to check existing reaction" });
    }
    
    // If reaction exists and is the same type, remove it (toggle off)
    if (existingReaction && existingReaction.is_like === isLike) {
      const { error: deleteError } = await supabase
        .from("reactions")
        .delete()
        .eq("id", existingReaction.id);
        
      if (deleteError) {
        console.error("Error deleting reaction:", deleteError);
        return res.status(500).json({ error: "Failed to remove reaction" });
      }
      
      return res.json({ removed: true, isLike });
    }
    
    // If reaction exists but is different type, update it
    if (existingReaction) {
      const { data: updatedReaction, error: updateError } = await supabase
        .from("reactions")
        .update({ is_like: isLike })
        .eq("id", existingReaction.id)
        .select()
        .single();
        
      if (updateError) {
        console.error("Error updating reaction:", updateError);
        return res.status(500).json({ error: "Failed to update reaction" });
      }
      
      return res.json(updatedReaction);
    }
    
    // Otherwise create a new reaction
    const { data: newReaction, error: createError } = await supabase
      .from("reactions")
      .insert({
        article_id: articleId,
        user_id: userId,
        is_like: isLike
      })
      .select()
      .single();
      
    if (createError) {
      console.error("Error creating reaction:", createError);
      return res.status(500).json({ error: "Failed to create reaction" });
    }
    
    return res.json(newReaction);
  } catch (error) {
    console.error("Error handling reaction:", error);
    return res.status(500).json({ error: "Failed to process reaction", details: String(error) });
  }
});

// Get reactions for an article
app.get("/api/articles/:id/reactions", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    
    // Get all reactions for this article
    const { data: reactions, error } = await supabase
      .from("reactions")
      .select("is_like, user_id")
      .eq("article_id", articleId);
      
    if (error) {
      console.error("Error fetching reactions:", error);
      return res.status(500).json({ error: "Failed to fetch reactions" });
    }
    
    // Calculate counts
    const likes = reactions?.filter(r => r.is_like).length || 0;
    const dislikes = reactions?.filter(r => !r.is_like).length || 0;
    
    // Get user's reaction if authenticated
    let userReaction = null;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        const { data, error: authError } = await supabaseAuth.auth.getUser(token);
        if (!authError && data.user) {
          // Look up internal user ID
          const { data: dbUser } = await supabase
            .from('users')
            .select('id')
            .eq('supabase_uid', data.user.id)
            .single();
            
          if (dbUser) {
            const userId = dbUser.id;
            
            // Find user's reaction
            const userReactionData = reactions?.find(r => r.user_id === userId);
            if (userReactionData) {
              userReaction = userReactionData.is_like;
            }
          }
        }
      } catch (e) {
        console.error("Error checking user reaction:", e);
        // Continue without user reaction info
      }
    }
    
    return res.json({ likes, dislikes, userReaction });
  } catch (error) {
    console.error("Error fetching reactions:", error);
    return res.status(500).json({ error: "Failed to fetch reactions" });
  }
});

// The handler function that routes requests to our Express app
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();
  
  // Enhanced debugging for Vercel serverless environment
  console.log(`[${requestId}] 🚀 SERVERLESS FUNCTION INVOKED`);
  console.log(`[${requestId}] Method: ${req.method}, URL: ${req.url}`);
  console.log(`[${requestId}] Headers: ${JSON.stringify(req.headers)}`);
  console.log(`[${requestId}] Query params: ${JSON.stringify(req.query)}`);
  console.log(`[${requestId}] Environment: Vercel=${process.env.VERCEL === '1' ? 'true' : 'false'}, NODE_ENV=${process.env.NODE_ENV}, Region=${process.env.VERCEL_REGION || 'unknown'}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    try {
      console.log(`[${requestId}] Request body: ${JSON.stringify(req.body)}`);
    } catch (err) {
      console.log(`[${requestId}] Request body present but not JSON serializable`);
    }
  }
  
  try {
    await app(req, res);
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ✅ Request completed in ${duration}ms with status ${res.statusCode}`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Error handling request (${duration}ms):`, error);
    
    // If headers haven't been sent yet, respond with error
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
      });
    }
  }
} 