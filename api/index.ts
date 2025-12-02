import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client directly
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

// Validate keys
if (!supabaseUrl) {
  console.error("CRITICAL ERROR: Missing SUPABASE_URL environment variable");
}
if (!supabaseServiceKey) {
  console.error(
    "CRITICAL ERROR: Missing SUPABASE_SERVICE_KEY environment variable"
  );
}

// Create two clients - one for auth verification (using the token from the client)
// and one with admin rights for database operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to authenticate user from request and return the userId
async function authenticateUser(
  req: express.Request
): Promise<{ userId?: number; error?: string }> {
  // Extract the Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No Authorization header found");
    return { error: "Authentication required" };
  }

  const token = authHeader.split(" ")[1];

  // Verify the token with Supabase
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(
    token
  );

  if (userError || !userData.user) {
    console.error("Error verifying user token:", userError);
    return { error: "Invalid authentication" };
  }

  // Look up the user in the database
  const { data: dbUser, error: dbError } = await supabase
    .from("users")
    .select("id")
    .eq("supabase_uid", userData.user.id)
    .single();

  if (dbError || !dbUser) {
    console.error("Error finding user:", dbError);
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
    "https://newsplatformmvp.vercel.app",
    "https://newsplatformmvp-git-main-jpwilsons-projects.vercel.app",
  ];

  if (
    process.env.NODE_ENV === "development" ||
    allowedOrigins.includes(origin)
  ) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
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
  res.send = function (body) {
    const duration = Date.now() - start;

    // Log response status
    const status = res.statusCode;
    const statusIcon =
      status >= 200 && status < 300 ? "✅" : status >= 400 ? "❌" : "⚠️";

    console.log(
      `[${requestId}] ${statusIcon} RESPONSE ${status} - ${duration}ms`
    );

    // For error responses, log more details
    if (status >= 400) {
      try {
        const responseBody = typeof body === "string" ? JSON.parse(body) : body;
        console.log(
          `[${requestId}] Error response: ${JSON.stringify(responseBody)}`
        );
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
      vercel: process.env.VERCEL === "1" ? "true" : "false",
      vercelEnv: process.env.VERCEL_ENV,
      region: process.env.VERCEL_REGION,
    },
    query: req.query,
  };

  return res.json({
    message: "Serverless function is working correctly",
    requestInfo,
    timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
    },
    supabase: {
      status: "unknown",
      error: null,
      tables: [],
    },
    env: {
      node: process.env.NODE_ENV,
      vercel: process.env.VERCEL === "1" ? "true" : "false",
      vercelEnv: process.env.VERCEL_ENV,
      region: process.env.VERCEL_REGION,
      supabaseUrl: process.env.SUPABASE_URL ? "defined" : "undefined",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ? "defined" : "undefined",
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "defined"
        : "undefined",
    },
  };

  try {
    // Test Supabase connection with a simple query
    const { data: tableData, error: tableError } = await supabaseAuth
      .from("users")
      .select("count")
      .limit(1);

    if (tableError) {
      results.supabase.status = "error";
      results.supabase.error = `Error querying users table: ${tableError.message}`;
    } else {
      results.supabase.status = "connected";

      // Try to fetch a list of tables to verify access
      try {
        const { data: tablesData, error: tablesError } = await supabaseAuth.rpc(
          "get_tables"
        );

        if (tablesError) {
          results.supabase.tables = ["Error fetching tables"];
        } else if (tablesData) {
          results.supabase.tables = Array.isArray(tablesData)
            ? tablesData
            : ["Data returned but not an array"];
        }
      } catch (tableListError: any) {
        console.error("Error fetching table list:", tableListError);
        results.supabase.tables = ["Error fetching tables list"];
      }

      // Attempt a more direct query to list tables
      try {
        const { data: schemaData, error: schemaError } = await supabaseAuth
          .from("pg_tables")
          .select("tablename")
          .eq("schemaname", "public")
          .limit(10);

        if (!schemaError && schemaData) {
          results.supabase.tables = schemaData.map(
            (t: any) => t.tablename as string
          );
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
    subscriberCounts: [],
  };

  try {
    // First test the /api/channels endpoint directly
    console.log("Testing channels endpoint...");
    try {
      // Get all channels using the same logic as the main endpoint
      const { data: channels, error } = await supabaseAuth
        .from("channels")
        .select("*")
        .order("created_at", { ascending: false });

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
        for (const channel of channels.slice(0, 3)) {
          // Limit to first 3 channels
          try {
            const { data: subs, error: subError } = await supabaseAuth
              .from("subscriptions")
              .select("count")
              .eq("channel_id", channel.id);

            results.subscriberCounts.push({
              channelId: channel.id,
              name: channel.name,
              subscriberCount: subError ? "error" : subs?.[0]?.count || 0,
              error: subError ? subError.message : null,
            });
          } catch (e: any) {
            results.subscriberCounts.push({
              channelId: channel.id,
              name: channel.name,
              subscriberCount: "error",
              error: e.message,
            });
          }
        }

        // Test fetching a specific channel
        if (channels.length > 0) {
          const testChannelId = channels[0].id;
          try {
            const { data: channel, error: channelError } = await supabaseAuth
              .from("channels")
              .select("*")
              .eq("id", testChannelId)
              .single();

            if (channelError) {
              results.specificChannel.status = "error";
              results.specificChannel.error = channelError.message;
            } else {
              results.specificChannel.status = "success";
              results.specificChannel.data = {
                id: channel.id,
                name: channel.name,
                found: !!channel,
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
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
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
    deployment: "vercel-inline",
  });
});

// User route
app.get("/api/user", async (req, res) => {
  try {
    console.log("User endpoint called");

    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found");
      return res.sendStatus(401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("No token found in Authorization header");
      return res.sendStatus(401);
    }

    console.log("Verifying user token...");

    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      console.error("Error verifying user token:", error);
      return res.sendStatus(401);
    }

    const supabaseUid = user.id;
    console.log("User verified, Supabase UID:", supabaseUid);
    console.log("User email:", user.email);
    console.log("User metadata:", user.user_metadata);

    // Look up the user in our database
    console.log("Looking up user in database with Supabase UID:", supabaseUid);
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("*")
      .eq("supabase_uid", supabaseUid)
      .single();

    if (dbError) {
      console.error("Error finding user in database:", dbError);
      if (dbError.code === "PGRST116") {
        console.log(
          "No user found in the database with supabase_uid:",
          supabaseUid
        );
      }

      // FALLBACK: Try to get user by username if supabase_uid fails
      const username =
        user.email?.split("@")[0] ||
        user.user_metadata?.name ||
        user.user_metadata?.full_name;
      if (username) {
        console.log("Trying fallback: looking up user by username:", username);
        const { data: userByUsername, error: usernameError } = await supabase
          .from("users")
          .select("*")
          .eq("username", username)
          .single();

        if (usernameError) {
          console.error("Fallback search also failed:", usernameError);
        } else if (userByUsername) {
          console.log("Found user by username instead:", userByUsername);

          // Update this user's supabase_uid if it's missing
          if (!userByUsername.supabase_uid) {
            console.log("Updating user record with correct Supabase UID");
            const { error: updateError } = await supabase
              .from("users")
              .update({ supabase_uid: supabaseUid })
              .eq("id", userByUsername.id);

            if (updateError) {
              console.error(
                "Failed to update user with Supabase UID:",
                updateError
              );
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
    console.error("Error in /api/user endpoint:", error);
    return res.sendStatus(401);
  }
});

// Add Supabase callback endpoint for Google OAuth
app.post("/api/auth/supabase-callback", async (req, res) => {
  try {
    const { supabase_uid, email, name } = req.body;

    console.log("Supabase OAuth callback received:", {
      supabase_uid: supabase_uid ? "✓" : "✗",
      email: email ? "✓" : "✗",
      name: name ? "✓" : "✗",
    });

    if (!supabase_uid) {
      return res.status(400).json({
        success: false,
        error: "Missing Supabase user ID",
      });
    }

    // Try to find existing user with this Supabase ID
    const { data: existingUser, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("supabase_uid", supabase_uid)
      .single();

    if (findError && findError.code !== "PGRST116") {
      console.error("Error finding user:", findError);
      return res.status(500).json({
        success: false,
        error: "Database error when finding user",
      });
    }

    if (existingUser) {
      console.log("Found existing user:", existingUser.username);
      return res.json({
        success: true,
        user: existingUser,
      });
    }

    // Create a new user
    const username = email ? email.split("@")[0] : `user_${Date.now()}`;
    console.log("Creating new user with username:", username);

    const { data: newUser, error: createError } = await supabase
      .from("users")
      .insert([
        {
          username,
          password: "", // No password needed
          supabase_uid,
        },
      ])
      .select()
      .single();

    if (createError) {
      console.error("Error creating user:", createError);
      return res.status(500).json({
        success: false,
        error: "Failed to create user",
      });
    }

    return res.json({
      success: true,
      user: newUser,
    });
  } catch (error) {
    console.error("Error in Supabase callback:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
      details: String(error),
    });
  }
});

// Channels route
app.get("/api/channels", async (req, res) => {
  try {
    console.log("Fetching channels from Supabase");
    // Fetch all channels from Supabase, including admin_subscriber_count
    const { data: channels, error } = await supabase
      .from("channels")
      .select("*, admin_subscriber_count");

    if (error) {
      console.error("Error fetching channels:", error);
      return res.status(500).json({ error: "Failed to fetch channels" });
    }

    console.log(`Successfully fetched ${channels?.length || 0} channels`);

    // Enrich each channel with subscriber count and article count
    const enrichedChannels = await Promise.all(
      (channels || []).map(async (channel) => {
        // Get subscriber count using a more direct approach that works in all environments
        try {
          const { count: subscriberCount, error: countError } = await supabase
            .from("subscriptions")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", channel.id);

          if (countError) {
            console.error(
              `Error fetching subscriber count for channel ${channel.id}:`,
              countError
            );
          }

          // Get article count (only published articles)
          const { count: articleCount, error: articleError } = await supabase
            .from("articles")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", channel.id)
            .eq("status", "published");

          if (articleError) {
            console.error(
              `Error fetching article count for channel ${channel.id}:`,
              articleError
            );
          }

          // Add admin_subscriber_count to the real count
          const realCount = subscriberCount || 0;
          const adminCount = channel.admin_subscriber_count || 0;
          const totalCount = realCount + adminCount;

          console.log(
            `Channel ${channel.id} (${channel.name}) has ${realCount} real subscribers + ${adminCount} admin subscribers = ${totalCount} total, ${articleCount || 0} articles`
          );

          return {
            ...channel,
            subscriberCount: totalCount,
            articleCount: articleCount || 0,
          };
        } catch (error) {
          console.error(
            `Unexpected error fetching data for channel ${channel.id}:`,
            error
          );
          return {
            ...channel,
            subscriberCount: channel.admin_subscriber_count || 0,
            articleCount: 0,
          };
        }
      })
    );

    res.json(enrichedChannels || []);
  } catch (error) {
    console.error("Error fetching channels:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch channels", details: String(error) });
  }
});

// Channel creation endpoint
app.post("/api/channels", async (req, res) => {
  try {
    console.log("Channel creation request received:", req.body);

    // Properly extract the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("No authorization header found");
      return res.status(401).json({
        error: "Unauthorized",
        message: "You must be logged in to create a channel",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify the token using Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error or no user:", authError);
      return res.status(401).json({
        error: "Unauthorized",
        message: "You must be logged in to create a channel",
      });
    }

    console.log("Supabase auth user:", user.id);

    // Validate required fields
    const { name, description } = req.body;
    if (!name || !description) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Name and description are required",
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
        message: "Failed to check existing channels",
      });
    }

    const channelCount = userChannels ? userChannels.length : 0;
    console.log(`User ${numericUserId} has ${channelCount} existing channels`);

    if (channelCount >= 10) {
      console.log("User has reached channel limit:", channelCount);
      return res.status(400).json({
        error: "Limit Exceeded",
        message:
          "Maximum limit reached. You cannot create more than 10 channels.",
      });
    }

    // Generate a slug from the channel name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 60);

    console.log("Generated slug for channel:", baseSlug);

    // Create the channel with the correct field name
    const { data: newChannel, error: insertError } = await supabase
      .from("channels")
      .insert({
        name,
        description,
        user_id: numericUserId, // Use the correct column name (user_id with underscore)
        slug: baseSlug,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Error creating channel:", insertError);
      return res.status(500).json({
        error: "Creation Failed",
        message: "Failed to create channel",
        details: insertError.message,
      });
    }

    // Convert snake_case to camelCase for front-end consistency
    const formattedChannel = {
      id: newChannel.id,
      name: newChannel.name,
      description: newChannel.description,
      userId: newChannel.user_id,
      createdAt: newChannel.created_at,
      ...newChannel, // Include other fields as well
    };

    console.log("Channel created successfully:", formattedChannel);
    res.status(201).json(formattedChannel);
  } catch (error) {
    console.error("Unexpected error in channel creation:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      details: error.message,
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
      .select(
        `
        *,
        images:article_images (
          image_url,
          caption,
          order
        )
      `
      )
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (articlesError) {
      console.error("Error fetching articles:", articlesError);
      return res.status(500).json({ error: "Failed to fetch articles" });
    }

    // If we have articles, fetch all needed channels in one query
    if (articles && articles.length > 0) {
      // Get unique channel IDs
      const channelIds = [
        ...new Set(articles.map((article) => article.channel_id)),
      ].filter(Boolean);
      console.log(`Found ${channelIds.length} unique channel IDs:`, channelIds);

      // Get all article IDs for fetching categories
      const articleIds = articles.map((article) => article.id);

      // Fetch all categories for all articles in one query
      const { data: allCategories, error: categoriesError } = await supabase
        .from("article_categories")
        .select(
          `
          article_id,
          category_id,
          is_primary,
          categories:category_id (
            id, 
            name,
            parent_id
          )
        `
        )
        .in("article_id", articleIds);

      if (categoriesError) {
        console.error(
          "Error fetching categories for articles:",
          categoriesError
        );
      }

      // Group categories by article ID
      const categoriesByArticle = {};
      if (allCategories && allCategories.length > 0) {
        allCategories.forEach((categoryItem) => {
          if (!categoriesByArticle[categoryItem.article_id]) {
            categoriesByArticle[categoryItem.article_id] = [];
          }
          categoriesByArticle[categoryItem.article_id].push({
            id: categoryItem.category_id,
            name: categoryItem.categories?.name || "",
            isPrimary: categoryItem.is_primary,
          });
        });
      }

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
          const { data: allReactions, error: reactionsError } = await supabase
            .from("reactions")
            .select("article_id, is_like, user_id")
            .in("article_id", articleIds);

          if (reactionsError) {
            console.error(
              "Error fetching reactions for articles:",
              reactionsError
            );
          }

          // Group reactions by article ID
          const reactionsByArticle = {};
          if (allReactions && allReactions.length > 0) {
            allReactions.forEach((reaction) => {
              if (!reactionsByArticle[reaction.article_id]) {
                reactionsByArticle[reaction.article_id] = [];
              }
              reactionsByArticle[reaction.article_id].push(reaction);
            });
          }

          // Get comment counts for all articles in one query
          const { data: commentCounts, error: commentCountsError } =
            await supabase
              .from("comments")
              .select("article_id, id")
              .in("article_id", articleIds);

          if (commentCountsError) {
            console.error(
              "Error fetching comment counts for articles:",
              commentCountsError
            );
          }

          // Group comments by article ID
          const commentsByArticle = {};
          if (commentCounts && commentCounts.length > 0) {
            commentCounts.forEach((comment) => {
              if (!commentsByArticle[comment.article_id]) {
                commentsByArticle[comment.article_id] = [];
              }
              commentsByArticle[comment.article_id].push(comment);
            });
          }

          // Get user ID if authenticated
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            try {
              const { data, error: authError } =
                await supabaseAuth.auth.getUser(token);

              if (!authError && data?.user) {
                // Look up the user in our users table
                const { data: dbUser, error: dbUserError } = await supabase
                  .from("users")
                  .select("id")
                  .eq("supabase_uid", data.user.id)
                  .single();

                if (!dbUserError && dbUser) {
                  userId = dbUser.id;
                }
              }
            } catch (e) {
              console.error("Error verifying token:", e);
            }
          }

          // Enrich articles with related data
          articles.forEach((article) => {
            // Add channel data
            article.channel = channelMap[article.channel_id] || null;

            // Add categories
            article.categories = categoriesByArticle[article.id] || [];

            // Calculate likes and dislikes
            const articleReactions = reactionsByArticle[article.id] || [];
            // Only count real user reactions
            const userLikes = articleReactions.filter(
              (r) => r.is_like && r.user_id > 0
            ).length;
            const userDislikes = articleReactions.filter(
              (r) => !r.is_like && r.user_id > 0
            ).length;

            // Add admin counts from the articles table
            const adminLikes = article.admin_like_count || 0;
            const adminDislikes = article.admin_dislike_count || 0;

            // Set both like_count/dislike_count and likes/dislikes for compatibility
            article.like_count = userLikes + adminLikes;
            article.dislike_count = userDislikes + adminDislikes;
            article.likes = article.like_count;
            article.dislikes = article.dislike_count;

            // Add user's reaction if authenticated
            if (userId) {
              const userReaction = articleReactions.find(
                (r) => r.user_id === userId
              );
              if (userReaction) {
                article.userReaction = userReaction.is_like;
              }
            }

            // Transform images data to match the expected format
            if (article.images) {
              article.images = article.images.map((img) => ({
                imageUrl: img.image_url,
                caption: img.caption || "",
              }));
            }

            // Add comment counts from our grouped data
            const articleComments = commentsByArticle[article.id] || [];
            const commentCount = articleComments.length;

            // Ensure comment count is available in multiple formats for backward compatibility
            article._count = { comments: commentCount };
            article.commentCount = commentCount;
            article.comment_count = commentCount;
          });
        }
      }
    }

    // Return the enriched articles
    console.log(
      `Returning ${articles?.length || 0} articles with images and channel data`
    );
    res.json(articles || []);
  } catch (error) {
    console.error("Error in /api/articles endpoint:", error);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

// Create article endpoint
app.post("/api/articles", async (req, res) => {
  try {
    console.log("Creating a new article");

    // Extract the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found for article creation");
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error(
        "Error verifying user token for article creation:",
        userError
      );
      return res.status(401).json({ error: "Invalid authentication" });
    }

    // Look up the user in the database
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", userData.user.id)
      .single();

    if (dbError || !dbUser) {
      console.error("Error finding user for article creation:", dbError);
      return res.status(401).json({ error: "User not found" });
    }

    const userId = dbUser.id;

    // Extract article data from request
    const {
      title,
      content,
      channelId,
      categoryId,
      categoryIds,
      category,
      location,
      location_name,
      location_lat,
      location_lng,
      published = true,
    } = req.body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!content || typeof content !== "string" || content.trim() === "") {
      return res.status(400).json({ error: "Content is required" });
    }

    if (!channelId || isNaN(parseInt(channelId))) {
      return res.status(400).json({ error: "Valid channel ID is required" });
    }

    // Verify the channel exists and belongs to this user
    const channelIdNumber = parseInt(channelId);
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id, user_id")
      .eq("id", channelIdNumber)
      .single();

    if (channelError || !channel) {
      console.error(`Channel ${channelIdNumber} not found:`, channelError);
      return res.status(404).json({ error: "Channel not found" });
    }

    if (channel.user_id !== userId) {
      console.error(
        `User ${userId} is not authorized to create article in channel ${channelIdNumber}`
      );
      return res
        .status(403)
        .json({ error: "Not authorized to create article in this channel" });
    }

    // Generate a slug from the title
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 60);

    // Add date to make it more unique
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    const fullSlug = `${dateStr}-${baseSlug}`;

    console.log("Generated slug for article:", fullSlug);

    // Prepare the article object
    const articleData: any = {
      title: title.trim(),
      content: content,
      channel_id: channelIdNumber,
      user_id: userId,
      category: category || "",
      slug: fullSlug,
      published: published,
      created_at: new Date().toISOString(),
      status: published ? "published" : "draft",
      view_count: 0,
    };

    // Handle backward compatibility for location
    articleData.location = location_name || location || null;

    // Add new location fields if provided
    if (location_name) {
      articleData.location_name = location_name;
    }

    if (location_lat !== undefined && location_lng !== undefined) {
      articleData.location_lat = location_lat;
      articleData.location_lng = location_lng;

      // Create PostGIS geometry point if coordinates are provided
      if (
        typeof location_lat === "number" &&
        typeof location_lng === "number"
      ) {
        // Using PostGIS function to create a Point geometry
        articleData.geom = `SRID=4326;POINT(${location_lng} ${location_lat})`;
      }
    }

    // Create the article
    const { data: article, error: createError } = await supabase
      .from("articles")
      .insert([articleData])
      .select()
      .single();

    if (createError) {
      console.error("Error creating article:", createError);
      return res.status(500).json({
        error: "Failed to create article",
        details: createError.message,
      });
    }

    console.log(`Article created successfully with ID ${article.id}`);

    // Handle categories - support both single categoryId and multiple categoryIds
    interface CategoryToAdd {
      categoryId: number;
      isPrimary: boolean;
    }

    const categoriesToAdd: CategoryToAdd[] = [];

    // Add single categoryId if provided and valid
    if (categoryId !== undefined) {
      categoriesToAdd.push({
        categoryId: parseInt(categoryId),
        isPrimary: true,
      });
    }

    // Add multiple categoryIds if provided
    if (categoryIds && Array.isArray(categoryIds)) {
      // If we already have a primary category from categoryId, mark others as non-primary
      const startingIndex = categoriesToAdd.length;

      categoryIds.forEach((id, index) => {
        // Skip if it's the same as the single categoryId that was already added
        if (categoryId !== undefined && categoryId === id) {
          return;
        }

        categoriesToAdd.push({
          categoryId: parseInt(id),
          isPrimary: startingIndex === 0 && index === 0, // First one is primary if no categoryId was provided
        });
      });
    }

    // Process all categories
    if (categoriesToAdd.length > 0) {
      console.log(
        `Creating ${categoriesToAdd.length} category relationships for article ${article.id}`
      );

      for (const catEntry of categoriesToAdd) {
        const catId = catEntry.categoryId;
        const isPrimary = catEntry.isPrimary;

        console.log(`Processing category ${catId}, isPrimary: ${isPrimary}`);

        // Check if the category relationship already exists
        const { data: existingCategories, error: fetchCategoriesError } =
          await supabase
            .from("article_categories")
            .select("*")
            .eq("article_id", article.id)
            .eq("category_id", catId);

        if (fetchCategoriesError) {
          console.error(
            `Error fetching existing category relationship for category ${catId}:`,
            fetchCategoriesError
          );
          continue; // Skip to next category if this one fails
        }

        // If relationship doesn't exist, create it
        if (!existingCategories || existingCategories.length === 0) {
          // Insert the new category relationship
          const { error: insertCategoryError } = await supabase
            .from("article_categories")
            .insert([
              {
                article_id: article.id,
                category_id: catId,
                is_primary: isPrimary,
              },
            ]);

          if (insertCategoryError) {
            console.error(
              `Error inserting category relationship for category ${catId}:`,
              insertCategoryError
            );
          } else {
            console.log(
              `Successfully created category relationship for article ${article.id} with category ${catId}`
            );
          }
        }
      }
    }

    // Return the created article
    return res.status(201).json(article);
  } catch (error) {
    console.error("Error in create article endpoint:", error);
    return res.status(500).json({ error: "Server error" });
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
    let articleId: number | null = null;

    // Check if id is numeric (old format) or a slug (new format)
    if (/^\d+$/.test(id)) {
      // Numeric ID
      articleId = parseInt(id);
      console.log("Looking up article by numeric ID:", id);
      const result = await supabase
        .from("articles")
        .select(
          `
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
        `
        )
        .eq("id", articleId)
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
        .select(
          `
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
        `
        )
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
          articleId = parseInt(extractedId);
          console.log("Extracted ID from slug:", extractedId);

          const idResult = await supabase
            .from("articles")
            .select(
              `
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
            `
            )
            .eq("id", articleId)
            .single();

          article = idResult.data;
          error = idResult.error;
          console.log(
            "Extracted ID lookup result:",
            article ? "Found" : "Not found"
          );
          if (error) console.error("Extracted ID lookup error:", error);
        }
      } else if (article) {
        articleId = article.id;
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

    // Fetch categories for this article
    if (articleId) {
      const { data: categoryData, error: categoryError } = await supabase
        .from("article_categories")
        .select(
          `
          category_id,
          is_primary,
          categories:category_id (
            id, 
            name,
            parent_id
          )
        `
        )
        .eq("article_id", articleId);

      if (!categoryError && categoryData && categoryData.length > 0) {
        console.log(
          `Found ${categoryData.length} categories for article ${articleId}`
        );

        // Define interface for category items
        interface ArticleCategory {
          id: number;
          name: string;
          isPrimary: boolean;
        }

        // Add categories to the article object
        article.categories = categoryData.map((item) => ({
          id: item.category_id,
          name: item.categories?.name || "",
          isPrimary: item.is_primary,
        })) as ArticleCategory[];

        // Sort so primary category is first
        article.categories.sort((a, b) => {
          if (a.isPrimary && !b.isPrimary) return -1;
          if (!a.isPrimary && b.isPrimary) return 1;
          return 0;
        });

        console.log("Article categories:", article.categories);
      } else {
        console.log(`No categories found for article ${articleId}`);
        article.categories = [];
      }

      // Fetch images for this article
      const { data: imageData, error: imageError } = await supabase
        .from("article_images")
        .select("*")
        .eq("article_id", articleId)
        .order("order", { ascending: true });

      if (!imageError && imageData) {
        console.log(
          `Found ${imageData.length} images for article ${articleId}`
        );
        article.images = imageData.map((img) => ({
          imageUrl: img.image_url,
          caption: img.caption || "",
        }));
        console.log("Article images:", article.images);
      } else {
        console.log(`No images found for article ${articleId}`);
        article.images = [];
      }
    }

    console.log("====== END ARTICLE LOOKUP DEBUG ======");

    // Add reaction data to the response
    await enrichArticleWithReactions(article, req);

    res.json(article);
  } catch (error) {
    console.error("Error fetching article:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch article", details: String(error) });
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
      // Only count real user reactions (positive user_id)
      const userLikes = reactions.filter(
        (r) => r.is_like && r.user_id > 0
      ).length;
      const userDislikes = reactions.filter(
        (r) => !r.is_like && r.user_id > 0
      ).length;

      // Add admin-set counts from the articles table
      const adminLikes = article.admin_like_count || 0;
      const adminDislikes = article.admin_dislike_count || 0;

      // Set the total counts (user reactions + admin counts)
      article.like_count = userLikes + adminLikes;
      article.dislike_count = userDislikes + adminDislikes;

      // For backwards compatibility
      article.likes = article.like_count;
      article.dislikes = article.dislike_count;

      console.log(
        `Article ${article.id} reactions: ${userLikes} user likes + ${adminLikes} admin likes = ${article.like_count} total`
      );
      console.log(
        `Article ${article.id} reactions: ${userDislikes} user dislikes + ${adminDislikes} admin dislikes = ${article.dislike_count} total`
      );

      // If user is authenticated, check if they have reacted
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];

        try {
          const { data, error: authError } = await supabaseAuth.auth.getUser(
            token
          );
          if (!authError && data.user) {
            // Look up internal user ID
            const { data: dbUser } = await supabase
              .from("users")
              .select("id")
              .eq("supabase_uid", data.user.id)
              .single();

            if (dbUser) {
              const userId = dbUser.id;

              // Find user's reaction
              const userReactionData = reactions.find(
                (r) => r.user_id === userId
              );
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
app.post("/api/auth/session-from-hash", async (req, res) => {
  try {
    const { access_token, refresh_token, expires_in, provider_token } =
      req.body;

    console.log("Session from hash received:", {
      access_token: access_token ? "✓" : "✗",
      refresh_token: refresh_token ? "✓" : "✗",
      expires_in: expires_in ? "✓" : "✗",
      provider_token: provider_token ? "✓" : "✗",
    });

    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: "Missing access token",
      });
    }

    // Return success response
    return res.json({
      success: true,
      message: "Session parameters received",
    });
  } catch (error) {
    console.error("Error in session-from-hash:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
      details: String(error),
    });
  }
});

// Add logout endpoint
app.post("/api/logout", async (req, res) => {
  try {
    console.log("Logout requested");

    // Extract the Authorization header to identify the session
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];

      // Sign out from Supabase
      const { error } = await supabaseAuth.auth.signOut();

      if (error) {
        console.error("Error during logout:", error);
        return res.status(500).json({ error: "Failed to logout" });
      }
    }

    // Return success even if no token was provided
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in logout endpoint:", error);
    return res.status(500).json({ error: "Server error during logout" });
  }
});

// Add user channels endpoint
app.get("/api/user/channels", async (req, res) => {
  try {
    console.log("User channels endpoint called");

    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found");
      return res.sendStatus(401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("No token found in Authorization header");
      return res.sendStatus(401);
    }

    console.log("Verifying user token...");

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error("Error verifying user token:", userError);
      return res.sendStatus(401);
    }

    const supabaseUid = userData.user.id;
    console.log("User verified, Supabase UID:", supabaseUid);

    // IMPORTANT DEBUG: Directly query the users table to understand the data structure
    try {
      const { data: allUsers, error: allUsersError } = await supabase
        .from("users")
        .select("id, username, supabase_uid")
        .limit(10);

      if (allUsersError) {
        console.error("Error querying users table:", allUsersError);
      } else {
        console.log("First 10 users in database:", allUsers);

        // Find this user in the returned users
        const currentUserInList = allUsers?.find(
          (u) => u.supabase_uid === supabaseUid
        );
        if (currentUserInList) {
          console.log("Found current user in users table:", currentUserInList);
        } else {
          console.log(
            "Current user NOT found in users table. Looking for Supabase UID:",
            supabaseUid
          );
        }
      }
    } catch (userQueryError) {
      console.error("Exception querying users table:", userQueryError);
    }

    // Look up the user in our database
    console.log("Looking up user in database with Supabase UID:", supabaseUid);
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("*")
      .eq("supabase_uid", supabaseUid)
      .single();

    if (dbError) {
      console.error("Error finding user in database:", dbError);
      if (dbError.code === "PGRST116") {
        console.log(
          "No user found in the database with supabase_uid:",
          supabaseUid
        );
      }

      // FALLBACK: Try to get user by username if supabase_uid fails
      const username =
        userData.user.email?.split("@")[0] ||
        userData.user.user_metadata?.name ||
        userData.user.user_metadata?.full_name;
      if (username) {
        console.log("Trying fallback: looking up user by username:", username);
        const { data: userByUsername, error: usernameError } = await supabase
          .from("users")
          .select("*")
          .eq("username", username)
          .single();

        if (usernameError) {
          console.error("Fallback search also failed:", usernameError);
        } else if (userByUsername) {
          console.log("Found user by username instead:", userByUsername);

          // Update this user's supabase_uid if it's missing
          if (!userByUsername.supabase_uid) {
            console.log("Updating user record with correct Supabase UID");
            const { error: updateError } = await supabase
              .from("users")
              .update({ supabase_uid: supabaseUid })
              .eq("id", userByUsername.id);

            if (updateError) {
              console.error(
                "Failed to update user with Supabase UID:",
                updateError
              );
            }
          }

          // Return this user
          return res.json(userByUsername);
        }
      }

      return res.sendStatus(401);
    }

    if (!dbUser) {
      console.log("User not found in database");
      return res.status(401).json({ error: "User not found in database" });
    }

    const userId = dbUser.id;
    console.log("User found in database, ID:", userId);

    // Fetch channels owned by this user
    console.log(`Fetching channels for user ID ${userId}...`);

    // First, check if we can query the channels table
    try {
      const { count, error: countError } = await supabase
        .from("channels")
        .select("*", { count: "exact", head: true });

      if (countError) {
        console.error("Error checking channels table:", countError);
      } else {
        console.log(`Total channels in database: ${count || 0}`);
      }
    } catch (countErr) {
      console.error("Unexpected error checking channels table:", countErr);
    }

    try {
      // IMPORTANT: Print all channels in the database to see if data exists
      const { data: allChannels, error: allChannelsError } = await supabase
        .from("channels")
        .select("id, name, user_id")
        .limit(20);

      if (allChannelsError) {
        console.error("Error querying all channels:", allChannelsError);
      } else {
        console.log("All channels in database:", allChannels);
      }

      // Normal query for this user's channels
      const { data: channels, error: channelsError } = await supabase
        .from("channels")
        .select("*")
        .eq("user_id", userId);

      if (channelsError) {
        console.error("Error fetching user channels:", channelsError);
        return res.status(500).json({
          error: "Failed to fetch user channels",
          details: channelsError,
        });
      }

      console.log(
        `Found ${channels?.length || 0} channels for user ${dbUser.username}`
      );
      if (channels && channels.length > 0) {
        console.log("Channel IDs:", channels.map((c) => c.id).join(", "));
      } else {
        console.log("No channels found for this user");
      }

      // Return the channels
      return res.json(channels || []);
    } catch (channelsErr) {
      console.error("Unexpected error fetching channels:", channelsErr);
      return res.status(500).json({
        error: "Unexpected error fetching channels",
        details: String(channelsErr),
      });
    }
  } catch (error) {
    console.error("Error in /api/user/channels endpoint:", error);
    return res.status(500).json({
      error: "Server error",
      details: String(error),
    });
  }
});

// Add user subscriptions endpoint
app.get("/api/user/subscriptions", async (req, res) => {
  try {
    console.log("User subscriptions endpoint called");

    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found");
      return res.sendStatus(401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("No token found in Authorization header");
      return res.sendStatus(401);
    }

    console.log("Verifying user token...");

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error("Error verifying user token:", userError);
      return res.sendStatus(401);
    }

    const supabaseUid = userData.user.id;
    console.log("User verified, Supabase UID:", supabaseUid);

    // Look up the user in our database
    console.log("Looking up user in database with Supabase UID:", supabaseUid);
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("*")
      .eq("supabase_uid", supabaseUid)
      .single();

    if (dbError) {
      console.error("Error finding user in database:", dbError);
      if (dbError.code === "PGRST116") {
        console.log(
          "No user found in the database with supabase_uid:",
          supabaseUid
        );
      }

      // FALLBACK: Try to get user by username if supabase_uid fails
      const username =
        userData.user.email?.split("@")[0] ||
        userData.user.user_metadata?.name ||
        userData.user.user_metadata?.full_name;
      if (username) {
        console.log("Trying fallback: looking up user by username:", username);
        const { data: userByUsername, error: usernameError } = await supabase
          .from("users")
          .select("*")
          .eq("username", username)
          .single();

        if (usernameError) {
          console.error("Fallback search also failed:", usernameError);
          return res
            .status(401)
            .json({ error: "User not found in database", details: dbError });
        }

        if (userByUsername) {
          console.log("Found user by username instead:", userByUsername);

          // Update this user's supabase_uid if it's missing
          if (!userByUsername.supabase_uid) {
            console.log("Updating user record with correct Supabase UID");
            const { error: updateError } = await supabase
              .from("users")
              .update({ supabase_uid: supabaseUid })
              .eq("id", userByUsername.id);

            if (updateError) {
              console.error(
                "Failed to update user with Supabase UID:",
                updateError
              );
            }
          }

          // Continue with this user
          const userId = userByUsername.id;
          console.log(`Using user ID ${userId} found by username instead`);

          return handleUserSubscriptions(userId, res);
        }
      }

      return res
        .status(401)
        .json({ error: "User not found in database", details: dbError });
    }

    if (!dbUser) {
      console.log("User not found in database");
      return res.status(401).json({ error: "User not found in database" });
    }

    const userId = dbUser.id;
    console.log("User found in database, ID:", userId);

    return handleUserSubscriptions(userId, res);
  } catch (error) {
    console.error("Error in /api/user/subscriptions endpoint:", error);
    return res.status(500).json({
      error: "Server error",
      details: String(error),
    });
  }
});

// Helper function to handle getting user subscriptions by ID
async function handleUserSubscriptions(userId: number, res: any) {
  try {
    console.log(`Fetching subscriptions for user ID ${userId}...`);

    // Check the available columns in the subscriptions table first
    const { data: availableColumns, error: columnsError } = await supabase
      .from("subscriptions")
      .select("*")
      .limit(1);

    const createdAtColumn = "created_at";

    if (columnsError) {
      console.error("Error checking subscriptions schema:", columnsError);
    }

    // Check if created_at exists in the table structure
    const hasCreatedAt =
      availableColumns &&
      availableColumns.length > 0 &&
      createdAtColumn in availableColumns[0];

    console.log(
      `Subscriptions table ${
        hasCreatedAt ? "has" : "does not have"
      } created_at column`
    );

    // First get just the subscription records
    let selectColumns = "id, channel_id";
    if (hasCreatedAt) {
      selectColumns += ", created_at";
    }

    const { data: subscriptions, error: subsError } = await supabase
      .from("subscriptions")
      .select(selectColumns)
      .eq("user_id", userId);

    if (subsError) {
      console.error("Error fetching user subscriptions:", subsError);
      return res.status(500).json({
        error: "Failed to fetch user subscriptions",
        details: subsError,
      });
    }

    // If no subscriptions, return empty array
    if (!subscriptions || subscriptions.length === 0) {
      console.log("No subscriptions found for user");
      return res.json([]);
    }

    console.log(
      `Found ${subscriptions.length} subscriptions for user ${userId}`
    );

    // Extract channel IDs using type assertion to avoid TypeScript errors
    const subscriptionsArray = subscriptions as unknown as Array<{
      channel_id: number;
    }>;
    const channelIds = subscriptionsArray.map((sub) => sub.channel_id);

    console.log("Subscription channel IDs:", channelIds);

    // Now fetch the channel data separately
    const { data: channels, error: channelsError } = await supabase
      .from("channels")
      .select("*")
      .in("id", channelIds);

    if (channelsError) {
      console.error(
        "Error fetching channels for subscriptions:",
        channelsError
      );
      return res.status(500).json({
        error: "Failed to fetch subscription channels",
        details: channelsError,
      });
    }

    console.log(`Found ${channels?.length || 0} channels for subscriptions`);

    // Add subscriber count to each channel
    const enhancedChannels = await Promise.all(
      (channels || []).map(async (channel) => {
        try {
          // Get subscriber count for this channel
          const { count, error: countError } = await supabase
            .from("subscriptions")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", channel.id);

          if (!countError) {
            return {
              ...channel,
              subscriberCount: count || 0,
            };
          }
          return channel;
        } catch (error) {
          console.error(
            `Error getting subscriber count for channel ${channel.id}:`,
            error
          );
          return channel;
        }
      })
    );

    // Return the channels with subscriber counts
    return res.json(enhancedChannels || []);
  } catch (error) {
    console.error("Error handling user subscriptions:", error);
    return res.status(500).json({
      error: "Server error",
      details: String(error),
    });
  }
}

// Remove the user-specific endpoints and add proper parameterized debug endpoints
// 1. Debug endpoint for channels with proper query parameters
app.get("/api/debug/channels", async (req, res) => {
  try {
    const userId = req.query.userId
      ? parseInt(req.query.userId as string)
      : null;
    console.log(
      `Debug endpoint: Fetching channels${
        userId ? ` for user ID ${userId}` : " (all channels)"
      }`
    );

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
        channels: [],
      });
    }

    console.log(
      `Debug endpoint: Found ${channels.length} channels${
        userId ? ` for user ID ${userId}` : ""
      }`
    );

    // Enrich each channel with subscriber count
    const enrichedChannels = await Promise.all(
      (channels || []).map(async (channel) => {
        // Get subscriber count
        const { count, error: countError } = await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("channel_id", channel.id);

        if (countError) {
          console.error(
            `Error fetching subscriber count for channel ${channel.id}:`,
            countError
          );
        }

        return {
          ...channel,
          subscriberCount: count || 0,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: `Channels found${userId ? ` for user ID ${userId}` : ""}`,
      count: enrichedChannels.length,
      channels: enrichedChannels,
    });
  } catch (error) {
    console.error("Debug endpoint unexpected error:", error);
    return res.status(500).json({
      success: false,
      message: "Unexpected error fetching channels",
      error: error.message,
      count: 0,
      channels: [],
    });
  }
});

// 2. Debug endpoint for subscriptions with proper query parameters
app.get("/api/debug/subscriptions", async (req, res) => {
  // Add timestamp to response
  const timestamp = new Date().toISOString();

  try {
    // Parse userId if provided
    const userId = req.query.userId
      ? parseInt(req.query.userId as string)
      : null;

    console.log(
      `Debug endpoint: Fetching subscriptions${
        userId ? ` for user ID ${userId}` : " (all subscriptions)"
      }`
    );

    // Build overall response
    const response = {
      success: true,
      message: "Debug subscriptions endpoint",
      timestamp,
      count: 0,
      subscriptions: [] as any[],
      diagnostic: null as any,
    };

    // First check if user exists
    if (userId) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, username")
        .eq("id", userId)
        .single();

      if (userError) {
        console.error("Error checking if user exists:", userError);
        response.diagnostic = { userCheck: "failed", error: userError };
      } else if (!user) {
        response.message = `User with ID ${userId} not found`;
        return res.json(response);
      }
    }

    // Build query to get subscriptions
    let query = supabase
      .from("subscriptions")
      .select("id, user_id, channel_id");

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
        error: String(error),
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      response.message = userId
        ? `No subscriptions found for user ID ${userId}`
        : "No subscriptions found";
      return res.json(response);
    }

    // Get channel data for each subscription
    const channelIds = subscriptions.map((sub) => sub.channel_id);
    const { data: channels, error: channelsError } = await supabase
      .from("channels")
      .select("*")
      .in("id", channelIds);

    if (channelsError) {
      console.error(
        "Error fetching channels for subscriptions:",
        channelsError
      );
      response.diagnostic = { channelsQuery: "failed", error: channelsError };
      return res.json(response);
    }

    // Create a map for quick lookup
    const channelMap = {};
    if (channels) {
      await Promise.all(
        channels.map(async (channel) => {
          // Get subscriber count for each channel
          const { count, error: countError } = await supabase
            .from("subscriptions")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", channel.id);

          channelMap[channel.id] = {
            ...channel,
            subscriberCount: countError ? 0 : count || 0,
          };
        })
      );
    }

    // Format subscriptions with channel data
    const formattedSubscriptions = subscriptions.map((sub) => {
      return {
        id: sub.id,
        userId: sub.user_id,
        channelId: sub.channel_id,
        channel: channelMap[sub.channel_id] || null,
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
      error: String(error),
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
      environment: process.env.NODE_ENV || "unknown",
      timestamp: new Date().toISOString(),
      supabase: {
        url: supabaseUrl ? supabaseUrl.substring(0, 10) + "..." : "missing",
        serviceKeyPresent: !!supabaseServiceKey,
        anonKeyPresent: !!supabaseAnonKey,
      },
      vercel: {
        isVercel: process.env.VERCEL === "1",
        environment: process.env.VERCEL_ENV || null,
        url: process.env.VERCEL_URL || null,
        region: process.env.VERCEL_REGION || null,
      },
      database: {
        tables: {
          status: "pending",
          tableNames: null,
        },
        counts: {
          users: { count: null },
          channels: { count: null },
          subscriptions: { count: null },
        },
        sampleQueries: {
          userWithId3: { exists: false },
          channelsForUser3: { count: null },
          subscriptionsForUser3: { count: null },
        },
        schemas: {
          users: { columns: null },
          channels: { columns: null },
          subscriptions: { columns: null },
        },
      },
    };

    // Test database schema access
    try {
      const { data: tables, error: tablesError } = await supabase
        .from("information_schema.tables")
        .select("table_name")
        .eq("table_schema", "public");

      if (tablesError) {
        diagnosticInfo.database.tables.status = "error";
        diagnosticInfo.database.tables.error = tablesError.message;
      } else {
        diagnosticInfo.database.tables.status = "success";
        diagnosticInfo.database.tables.tableNames =
          tables?.map((t) => t.table_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.tables.status = "exception";
      diagnosticInfo.database.tables.error = String(error);
    }

    // Check table counts
    try {
      const { count: userCount, error: userError } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

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
        .from("channels")
        .select("*", { count: "exact", head: true });

      if (channelError) {
        diagnosticInfo.database.counts.channels.error = channelError.message;
      } else {
        diagnosticInfo.database.counts.channels.count = channelCount;
      }
    } catch (error) {
      diagnosticInfo.database.counts.channels.error = String(error);
    }

    try {
      const { count: subscriptionCount, error: subscriptionError } =
        await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true });

      if (subscriptionError) {
        diagnosticInfo.database.counts.subscriptions.error =
          subscriptionError.message;
      } else {
        diagnosticInfo.database.counts.subscriptions.count = subscriptionCount;
      }
    } catch (error) {
      diagnosticInfo.database.counts.subscriptions.error = String(error);
    }

    // Check for user with ID 3
    try {
      const { data: user3, error: user3Error } = await supabase
        .from("users")
        .select("*")
        .eq("id", 3)
        .single();

      if (user3Error) {
        diagnosticInfo.database.sampleQueries.userWithId3.error =
          user3Error.message;
      } else {
        diagnosticInfo.database.sampleQueries.userWithId3.exists = !!user3;
      }
    } catch (error) {
      diagnosticInfo.database.sampleQueries.userWithId3.error = String(error);
    }

    // Check for channels with user_id 3
    try {
      const { count: channelsUser3Count, error: channelsUser3Error } =
        await supabase
          .from("channels")
          .select("*", { count: "exact", head: true })
          .eq("user_id", 3);

      if (channelsUser3Error) {
        diagnosticInfo.database.sampleQueries.channelsForUser3.error =
          channelsUser3Error.message;
      } else {
        diagnosticInfo.database.sampleQueries.channelsForUser3.count =
          channelsUser3Count;
      }
    } catch (error) {
      diagnosticInfo.database.sampleQueries.channelsForUser3.error =
        String(error);
    }

    // Check for subscriptions with user_id 3
    try {
      const { count: subscriptionsUser3Count, error: subscriptionsUser3Error } =
        await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", 3);

      if (subscriptionsUser3Error) {
        diagnosticInfo.database.sampleQueries.subscriptionsForUser3.error =
          subscriptionsUser3Error.message;
      } else {
        diagnosticInfo.database.sampleQueries.subscriptionsForUser3.count =
          subscriptionsUser3Count;
      }
    } catch (error) {
      diagnosticInfo.database.sampleQueries.subscriptionsForUser3.error =
        String(error);
    }

    // Get schema information
    try {
      const { data: usersColumns, error: usersColumnsError } = await supabase
        .from("information_schema.columns")
        .select("column_name")
        .eq("table_name", "users")
        .eq("table_schema", "public");

      if (usersColumnsError) {
        diagnosticInfo.database.schemas.users.error = usersColumnsError.message;
      } else {
        diagnosticInfo.database.schemas.users.columns =
          usersColumns?.map((c) => c.column_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.schemas.users.error = String(error);
    }

    try {
      const { data: channelsColumns, error: channelsColumnsError } =
        await supabase
          .from("information_schema.columns")
          .select("column_name")
          .eq("table_name", "channels")
          .eq("table_schema", "public");

      if (channelsColumnsError) {
        diagnosticInfo.database.schemas.channels.error =
          channelsColumnsError.message;
      } else {
        diagnosticInfo.database.schemas.channels.columns =
          channelsColumns?.map((c) => c.column_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.schemas.channels.error = String(error);
    }

    try {
      const { data: subscriptionsColumns, error: subscriptionsColumnsError } =
        await supabase
          .from("information_schema.columns")
          .select("column_name")
          .eq("table_name", "subscriptions")
          .eq("table_schema", "public");

      if (subscriptionsColumnsError) {
        diagnosticInfo.database.schemas.subscriptions.error =
          subscriptionsColumnsError.message;
      } else {
        diagnosticInfo.database.schemas.subscriptions.columns =
          subscriptionsColumns?.map((c) => c.column_name) || [];
      }
    } catch (error) {
      diagnosticInfo.database.schemas.subscriptions.error = String(error);
    }

    return res.status(200).json(diagnosticInfo);
  } catch (error) {
    console.error("Error in system diagnostics endpoint:", error);
    return res.status(500).json({
      success: false,
      message: "Error running system diagnostics",
      error: String(error),
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
        .select("*, admin_subscriber_count")
        .eq("id", parseInt(id))
        .single();

      channel = result.data;
      error = result.error;
    } else {
      // Slug lookup
      console.log("Looking up channel by slug:", id);
      const result = await supabase
        .from("channels")
        .select("*, admin_subscriber_count")
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
            .select("*, admin_subscriber_count")
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

    // Get real subscriber count
    try {
      const { count: subscriberCount, error: countError } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", channel.id);

      if (countError) {
        console.error(
          `Error fetching subscriber count for channel ${channel.id}:`,
          countError
        );
      }

      // Add real and admin subscriber counts
      const realCount = subscriberCount || 0;
      const adminCount = channel.admin_subscriber_count || 0;
      const totalCount = realCount + adminCount;

      // Add subscriber count to the channel data
      channel.subscriberCount = totalCount;
      channel.realSubscriberCount = realCount;

      console.log(
        `Channel ${channel.id} has ${realCount} real + ${adminCount} admin = ${totalCount} total subscribers`
      );
    } catch (countError) {
      console.error(
        `Error calculating subscriber count for channel ${channel.id}:`,
        countError
      );
      channel.subscriberCount = channel.admin_subscriber_count || 0;
      channel.realSubscriberCount = 0;
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
        console.error(
          `Error checking subscription for user ${userId} to channel ${channel.id}:`,
          subError
        );
        channel.isSubscribed = false;
      }
    }

    // Transform snake_case to camelCase for the response
    const transformedChannel = {
      ...channel,
      profileImage: channel.profile_image,
      bannerImage: channel.banner_image,
      userId: channel.user_id,
      createdAt: channel.created_at,
      updatedAt: channel.updated_at,
    };

    console.log(`[GET /api/channels/${id}] Raw channel from DB:`, {
      id: channel.id,
      name: channel.name,
      profile_image: channel.profile_image,
      banner_image: channel.banner_image,
    });
    console.log(`[GET /api/channels/${id}] Transformed response:`, {
      id: transformedChannel.id,
      name: transformedChannel.name,
      profileImage: transformedChannel.profileImage,
      bannerImage: transformedChannel.bannerImage,
    });

    res.json(transformedChannel);
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found for subscription");
      return res.sendStatus(401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("No token found in Authorization header for subscription");
      return res.sendStatus(401);
    }

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error("Error verifying user token for subscription:", userError);
      return res.sendStatus(401);
    }

    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", userData.user.id)
      .single();

    if (dbError || !dbUser) {
      console.error("Error finding user for subscription:", dbError);
      return res.status(401).json({ error: "User not found" });
    }

    const userId = dbUser.id;

    // Handle both numeric IDs and slugs
    const channelIdParam = req.params.id;
    let channelId: number;

    if (/^\d+$/.test(channelIdParam)) {
      // It's a numeric ID
      channelId = parseInt(channelIdParam);
    } else {
      // It's a slug, we need to fetch the channel first to get its ID
      console.log(`Looking up channel by slug: ${channelIdParam}`);
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", channelIdParam)
        .single();

      if (channelError || !channel) {
        // Try extracting ID from slug as fallback
        const idMatch = channelIdParam.match(/-(\d+)$/);
        if (idMatch) {
          channelId = parseInt(idMatch[1]);
          console.log(`Extracted ID from slug: ${channelId}`);
        } else {
          console.error(`Channel not found for slug: ${channelIdParam}`);
          return res.status(404).json({ error: "Channel not found" });
        }
      } else {
        channelId = channel.id;
        console.log(`Found channel ID ${channelId} for slug ${channelIdParam}`);
      }
    }

    // Validate the channel ID
    if (isNaN(channelId)) {
      console.error(`Invalid channel ID: ${channelIdParam}, parsed as NaN`);
      return res.status(400).json({ error: "Invalid channel ID" });
    }

    // Check if already subscribed
    const { data: existingSub, error: subCheckError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .maybeSingle();

    if (subCheckError) {
      console.error("Error checking existing subscription:", subCheckError);
    }

    if (existingSub) {
      console.log(`User ${userId} already subscribed to channel ${channelId}`);
      return res.json({ message: "Already subscribed" });
    }

    // Create the subscription
    const { data, error: createError } = await supabase
      .from("subscriptions")
      .insert([{ user_id: userId, channel_id: channelId }])
      .select()
      .single();

    if (createError) {
      console.error("Error creating subscription:", createError);
      return res.status(500).json({ error: "Failed to subscribe" });
    }

    console.log(`User ${userId} subscribed to channel ${channelId}`);
    return res.status(201).json(data);
  } catch (error) {
    console.error("Error in subscribe endpoint:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/channels/:id/subscribe", async (req, res) => {
  try {
    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found for unsubscribe");
      return res.sendStatus(401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("No token found in Authorization header for unsubscribe");
      return res.sendStatus(401);
    }

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error("Error verifying user token for unsubscribe:", userError);
      return res.sendStatus(401);
    }

    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", userData.user.id)
      .single();

    if (dbError || !dbUser) {
      console.error("Error finding user for unsubscribe:", dbError);
      return res.status(401).json({ error: "User not found" });
    }

    const userId = dbUser.id;

    // Handle both numeric IDs and slugs
    const channelIdParam = req.params.id;
    let channelId: number;

    if (/^\d+$/.test(channelIdParam)) {
      // It's a numeric ID
      channelId = parseInt(channelIdParam);
    } else {
      // It's a slug, we need to fetch the channel first to get its ID
      console.log(`Looking up channel by slug: ${channelIdParam}`);
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", channelIdParam)
        .single();

      if (channelError || !channel) {
        // Try extracting ID from slug as fallback
        const idMatch = channelIdParam.match(/-(\d+)$/);
        if (idMatch) {
          channelId = parseInt(idMatch[1]);
          console.log(`Extracted ID from slug: ${channelId}`);
        } else {
          console.error(`Channel not found for slug: ${channelIdParam}`);
          return res.status(404).json({ error: "Channel not found" });
        }
      } else {
        channelId = channel.id;
        console.log(`Found channel ID ${channelId} for slug ${channelIdParam}`);
      }
    }

    // Validate the channel ID
    if (isNaN(channelId)) {
      console.error(`Invalid channel ID: ${channelIdParam}, parsed as NaN`);
      return res.status(400).json({ error: "Invalid channel ID" });
    }

    // Delete the subscription
    const { error: deleteError } = await supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("channel_id", channelId);

    if (deleteError) {
      console.error("Error deleting subscription:", deleteError);
      return res.status(500).json({ error: "Failed to unsubscribe" });
    }

    console.log(`User ${userId} unsubscribed from channel ${channelId}`);
    return res.json({ message: "Unsubscribed successfully" });
  } catch (error) {
    console.error("Error in unsubscribe endpoint:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Add channel articles endpoint
app.get("/api/channels/:id/articles", async (req, res) => {
  try {
    const channelIdParam = req.params.id;
    console.log(`Raw channel ID parameter: ${channelIdParam}`);

    // Handle both numeric IDs and slugs
    let channelId: number;

    if (/^\d+$/.test(channelIdParam)) {
      // It's a numeric ID
      channelId = parseInt(channelIdParam);
    } else {
      // It's a slug, we need to fetch the channel first to get its ID
      console.log(`Looking up channel by slug: ${channelIdParam}`);
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", channelIdParam)
        .single();

      if (channelError || !channel) {
        // Try extracting ID from slug as fallback
        const idMatch = channelIdParam.match(/-(\d+)$/);
        if (idMatch) {
          channelId = parseInt(idMatch[1]);
          console.log(`Extracted ID from slug: ${channelId}`);
        } else {
          console.error(`Channel not found for slug: ${channelIdParam}`);
          return res.status(404).json({ error: "Channel not found" });
        }
      } else {
        channelId = channel.id;
        console.log(`Found channel ID ${channelId} for slug ${channelIdParam}`);
      }
    }

    // Validate the channel ID
    if (isNaN(channelId)) {
      console.error(`Invalid channel ID: ${channelIdParam}, parsed as NaN`);
      return res.status(400).json({ error: "Invalid channel ID" });
    }

    console.log(`Fetching articles for channel ID: ${channelId}`);

    // Fetch published articles for the channel
    const { data: articles, error } = await supabase
      .from("articles")
      .select(
        `
        *,
        images:article_images (
          image_url,
          caption,
          order
        )
      `
      )
      .eq("channel_id", channelId)
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Error fetching articles for channel ${channelId}:`, error);
      return res.status(500).json({ error: "Failed to fetch articles" });
    }

    console.log(
      `Found ${articles?.length || 0} articles for channel ${channelId}`
    );

    // If we have articles, enrich them with reaction data
    if (articles && articles.length > 0) {
      // Get all reactions for all articles in a single query
      const articleIds = articles.map((article) => article.id);
      const { data: allReactions, error: reactionsError } = await supabase
        .from("reactions")
        .select("article_id, is_like, user_id")
        .in("article_id", articleIds);

      if (reactionsError) {
        console.error(
          "Error fetching reactions for channel articles:",
          reactionsError
        );
      }

      // Group reactions by article ID
      const reactionsByArticle = {};
      if (allReactions && allReactions.length > 0) {
        allReactions.forEach((reaction) => {
          if (!reactionsByArticle[reaction.article_id]) {
            reactionsByArticle[reaction.article_id] = [];
          }
          reactionsByArticle[reaction.article_id].push(reaction);
        });
      }

      // Get comment counts for all articles in one query
      const { data: commentCounts, error: commentCountsError } = await supabase
        .from("comments")
        .select("article_id, id")
        .in("article_id", articleIds);

      if (commentCountsError) {
        console.error(
          "Error fetching comment counts for articles:",
          commentCountsError
        );
      }

      // Group comments by article ID
      const commentsByArticle = {};
      if (commentCounts && commentCounts.length > 0) {
        commentCounts.forEach((comment) => {
          if (!commentsByArticle[comment.article_id]) {
            commentsByArticle[comment.article_id] = [];
          }
          commentsByArticle[comment.article_id].push(comment);
        });
      }

      // Get user ID if authenticated
      let userId = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
          const { data, error: authError } = await supabaseAuth.auth.getUser(
            token
          );

          if (!authError && data?.user) {
            // Look up the user in our users table
            const { data: dbUser, error: dbUserError } = await supabase
              .from("users")
              .select("id")
              .eq("supabase_uid", data.user.id)
              .single();

            if (!dbUserError && dbUser) {
              userId = dbUser.id;
            }
          }
        } catch (e) {
          console.error("Error checking user for reactions:", e);
        }
      }

      // Add reaction data to each article
      const articlesWithReactions = articles.map((article) => {
        // Add reaction data
        const articleReactions = reactionsByArticle[article.id] || [];
        // Only count real user reactions
        const userLikes = articleReactions.filter(
          (r) => r.is_like && r.user_id > 0
        ).length;
        const userDislikes = articleReactions.filter(
          (r) => !r.is_like && r.user_id > 0
        ).length;

        // Add admin counts from the articles table
        const adminLikes = article.admin_like_count || 0;
        const adminDislikes = article.admin_dislike_count || 0;

        // Set both like_count/dislike_count and likes/dislikes for compatibility
        article.like_count = userLikes + adminLikes;
        article.dislike_count = userDislikes + adminDislikes;
        article.likes = article.like_count;
        article.dislikes = article.dislike_count;

        // Check if the current user has reacted
        let userReaction = null;
        if (userId) {
          const userReactionData = articleReactions.find(
            (r) => r.user_id === userId
          );
          if (userReactionData) {
            userReaction = userReactionData.is_like;
          }
        }

        // Transform images data to match the expected format
        const transformedImages = article.images
          ? article.images.map((img) => ({
              imageUrl: img.image_url,
              caption: img.caption || "",
            }))
          : [];

        // Add comment count in multiple formats for compatibility
        // Note: We can't fetch this in real-time here as it would require
        // an async operation inside a map, but we'll set placeholder values
        // that will be used by the UI until a proper count is available
        if (!article._count) {
          article._count = { comments: 0 };
        }

        return {
          ...article,
          likes: article.like_count,
          dislikes: article.dislike_count,
          userReaction,
          images: transformedImages,
          // Ensure comment count is available in multiple formats
          commentCount:
            article.commentCount ||
            article.comment_count ||
            article._count?.comments ||
            0,
          comment_count:
            article.commentCount ||
            article.comment_count ||
            article._count?.comments ||
            0,
          _count: {
            ...article._count,
            comments: article._count?.comments || 0,
          },
        };
      });

      console.log(
        `Added reaction data to ${articlesWithReactions.length} channel articles`
      );
      return res.json(articlesWithReactions);
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found for drafts");
      return res.sendStatus(401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("No token found in Authorization header for drafts");
      return res.sendStatus(401);
    }

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error("Error verifying user token for drafts:", userError);
      return res.sendStatus(401);
    }

    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", userData.user.id)
      .single();

    if (dbError || !dbUser) {
      console.error("Error finding user for drafts:", dbError);
      return res.status(401).json({ error: "User not found" });
    }

    const userId = dbUser.id;
    const channelIdParam = req.params.id;
    console.log(`Raw channel ID parameter for drafts: ${channelIdParam}`);

    // Handle both numeric IDs and slugs
    let channelId: number;

    if (/^\d+$/.test(channelIdParam)) {
      // It's a numeric ID
      channelId = parseInt(channelIdParam);
    } else {
      // It's a slug, we need to fetch the channel first to get its ID
      console.log(`Looking up channel by slug for drafts: ${channelIdParam}`);
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", channelIdParam)
        .single();

      if (channelError || !channel) {
        // Try extracting ID from slug as fallback
        const idMatch = channelIdParam.match(/-(\d+)$/);
        if (idMatch) {
          channelId = parseInt(idMatch[1]);
          console.log(`Extracted ID from slug for drafts: ${channelId}`);
        } else {
          console.error(`Channel not found for slug: ${channelIdParam}`);
          return res.status(404).json({ error: "Channel not found" });
        }
      } else {
        channelId = channel.id;
        console.log(`Found channel ID ${channelId} for slug ${channelIdParam}`);
      }
    }

    // Validate the channel ID
    if (isNaN(channelId)) {
      console.error(
        `Invalid channel ID for drafts: ${channelIdParam}, parsed as NaN`
      );
      return res.status(400).json({ error: "Invalid channel ID" });
    }

    // Verify user owns this channel
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .eq("user_id", userId)
      .single();

    if (channelError || !channel) {
      console.error(
        `User ${userId} not authorized to view drafts for channel ${channelId}`
      );
      return res
        .status(403)
        .json({ error: "Not authorized to view drafts for this channel" });
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
    const idParam = req.params.id;
    const { name, description, category, profileImage, bannerImage } = req.body;
    console.log(`Updating channel with param ${idParam}:`, req.body);

    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found for channel update");
      return res.sendStatus(401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("No token found in Authorization header for channel update");
      return res.sendStatus(401);
    }

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error(
        "Error verifying user token for channel update:",
        userError
      );
      return res.sendStatus(401);
    }

    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", userData.user.id)
      .single();

    if (dbError || !dbUser) {
      console.error("Error finding user for channel update:", dbError);
      return res.status(401).json({ error: "User not found" });
    }

    const userId = dbUser.id;

    // Find the channel by ID or slug
    let channelId: number;
    if (/^\d+$/.test(idParam)) {
      // It's a numeric ID
      channelId = parseInt(idParam);
    } else {
      // It's a slug, we need to fetch the channel first to get its ID
      console.log(`Looking up channel by slug for update: ${idParam}`);
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", idParam)
        .single();

      if (channelError || !channel) {
        // Try extracting ID from slug as fallback
        const idMatch = idParam.match(/-(\d+)$/);
        if (idMatch) {
          channelId = parseInt(idMatch[1]);
          console.log(`Extracted ID from slug for update: ${channelId}`);
        } else {
          console.error(`Channel not found for slug: ${idParam}`);
          return res.status(404).json({ error: "Channel not found" });
        }
      } else {
        channelId = channel.id;
        console.log(`Found channel ID ${channelId} for slug ${idParam}`);
      }
    }

    // Verify user owns this channel
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .eq("user_id", userId)
      .single();

    if (channelError || !channel) {
      console.error(
        `User ${userId} not authorized to update channel ${channelId}`
      );
      return res
        .status(403)
        .json({ error: "Not authorized to update this channel" });
    }

    // Build update object with only provided fields
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (profileImage !== undefined) updateData.profile_image = profileImage;
    if (bannerImage !== undefined) updateData.banner_image = bannerImage;

    console.log(`[PATCH /api/channels/${channelId}] Request body:`, { name, description, category, profileImage, bannerImage });
    console.log(`[PATCH /api/channels/${channelId}] Update data to send to DB:`, updateData);

    // Update the channel
    const { data: updatedChannel, error } = await supabase
      .from("channels")
      .update(updateData)
      .eq("id", channelId)
      .select()
      .single();

    if (error) {
      console.error(`Error updating channel ${channelId}:`, error);
      return res.status(500).json({ error: "Failed to update channel" });
    }

    console.log(`Channel ${channelId} updated successfully`);
    console.log(`[PATCH /api/channels/${channelId}] Data returned from DB:`, {
      id: updatedChannel.id,
      name: updatedChannel.name,
      profile_image: updatedChannel.profile_image,
      banner_image: updatedChannel.banner_image,
      user_id: updatedChannel.user_id,
    });

    // Transform snake_case to camelCase for the response
    const transformedChannel = {
      ...updatedChannel,
      profileImage: updatedChannel.profile_image,
      bannerImage: updatedChannel.banner_image,
      userId: updatedChannel.user_id,
      createdAt: updatedChannel.created_at,
      updatedAt: updatedChannel.updated_at,
    };

    console.log(`[PATCH /api/channels/${channelId}] Transformed response:`, {
      id: transformedChannel.id,
      name: transformedChannel.name,
      profileImage: transformedChannel.profileImage,
      bannerImage: transformedChannel.bannerImage,
    });

    return res.json(transformedChannel);
  } catch (error) {
    console.error("Error in channel update endpoint:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Article comments endpoints
app.post("/api/articles/:id/comments", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    console.log(`Adding comment to article ${articleId}`);

    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Authorization header found for adding comment");
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error(
        "Error verifying user token for adding comment:",
        userError
      );
      return res.status(401).json({ error: "Invalid authentication" });
    }

    // Look up the user in the database
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", userData.user.id)
      .single();

    if (dbError || !dbUser) {
      console.error("Error finding user for adding comment:", dbError);
      return res.status(401).json({ error: "User not found" });
    }

    const userId = dbUser.id;

    // Check if article exists
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("id")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      console.error(`Article ${articleId} not found:`, articleError);
      return res.status(404).json({ error: "Article not found" });
    }

    // Create the comment
    const { content, parent_id } = req.body;
    console.log("Creating comment with:", {
      content,
      parent_id,
      articleId,
      userId,
    });

    if (!content || typeof content !== "string" || content.trim() === "") {
      return res.status(400).json({ error: "Comment content is required" });
    }

    const commentData: {
      article_id: number;
      user_id: number;
      content: string;
      created_at: string;
      parent_id?: number;
    } = {
      article_id: articleId,
      user_id: userId,
      content: content.trim(),
      created_at: new Date().toISOString(),
    };

    // Add parent_id if it's provided
    if (parent_id) {
      commentData.parent_id = parseInt(parent_id, 10);
    }

    console.log("Final comment data to insert:", commentData);

    const { data: comment, error: commentError } = await supabase
      .from("comments")
      .insert([commentData])
      .select("*, user:user_id(id, username)")
      .single();

    if (commentError) {
      console.error("Error creating comment:", commentError);
      return res.status(500).json({ error: "Failed to create comment" });
    }

    console.log(`Comment added to article ${articleId} by user ${userId}`);
    return res.status(201).json(comment);
  } catch (error) {
    console.error("Error in add comment endpoint:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/articles/:id/comments", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    console.log(`Fetching comments for article ${articleId}`);

    // Check if article exists
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("id")
      .eq("id", articleId)
      .single();

    if (articleError) {
      if (articleError.code === "PGRST116") {
        console.error(`Article ${articleId} not found`);
        return res.status(404).json({ error: "Article not found" });
      }

      console.error(`Error checking article ${articleId}:`, articleError);
      return res.status(500).json({ error: "Failed to check article" });
    }

    // Fetch comments with user info
    const { data: comments, error: commentsError } = await supabase
      .from("comments")
      .select(
        `
        id,
        content,
        created_at,
        user:user_id(id, username)
      `
      )
      .eq("article_id", articleId)
      .order("created_at", { ascending: true });

    if (commentsError) {
      console.error(
        `Error fetching comments for article ${articleId}:`,
        commentsError
      );
      return res.status(500).json({ error: "Failed to fetch comments" });
    }

    console.log(
      `Found ${comments?.length || 0} comments for article ${articleId}`
    );
    return res.json(comments || []);
  } catch (error) {
    console.error("Error in get comments endpoint:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Article view endpoint
app.post("/api/articles/:slug/view", async (req, res) => {
  try {
    console.log(`Processing view for article slug: ${req.params.slug}`);

    // Get article ID from slug
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("id, view_count, title")
      .eq("slug", req.params.slug)
      .single();

    if (articleError || !article) {
      console.error("Error finding article:", articleError);
      return res.status(404).json({ error: "Article not found" });
    }

    const articleId = article.id;
    const currentCount = article.view_count || 0;
    console.log(
      `Found article ID: ${articleId}, Title: "${article.title}", Current view_count: ${currentCount}`
    );

    let userId = null;
    let clientIdentifier = null;

    // Check for authenticated user
    if (req.headers.authorization) {
      const token = req.headers.authorization.replace("Bearer ", "");
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (!authError && user) {
        // Get internal user ID from Supabase Auth ID
        const { data: dbUser } = await supabase
          .from("users")
          .select("id")
          .eq("supabase_uid", user.id)
          .single();

        if (dbUser) {
          userId = dbUser.id;
          clientIdentifier = `user-${userId}`;
          console.log(`Authenticated user ID: ${userId}`);
        }
      }
    }

    // Use IP address for non-authenticated users
    if (!clientIdentifier) {
      const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
      clientIdentifier = `ip-${ip}`;
      console.log(`Anonymous user with IP identifier: ${clientIdentifier}`);
    }

    // Check if this view already exists (anti-gaming mechanism)
    const { data: existingView } = await supabase
      .from("article_views")
      .select("*")
      .eq("article_id", articleId)
      .eq("client_identifier", clientIdentifier)
      .single();

    let shouldInvalidateFeeds = false;
    let updatedViewCount = currentCount;

    if (!existingView) {
      console.log("New view detected, recording view");

      // Record the view in article_views table
      const { error: viewError } = await supabase.from("article_views").insert({
        article_id: articleId,
        user_id: userId,
        client_identifier: clientIdentifier,
        viewed_at: new Date().toISOString(),
      });

      if (viewError) {
        console.error("Error recording view:", viewError);
        throw viewError;
      }

      // Increment the current view count by 1, ALWAYS preserving the current count
      // This ensures admin-set counts are respected
      updatedViewCount = currentCount + 1;
      console.log(
        `Incrementing view count from ${currentCount} to ${updatedViewCount}`
      );

      // Update the article's view count
      const { error: updateError } = await supabase
        .from("articles")
        .update({ view_count: updatedViewCount })
        .eq("id", articleId);

      if (updateError) {
        console.error("Error updating view count:", updateError);
        throw updateError;
      }

      shouldInvalidateFeeds = true;
    } else {
      console.log(
        "View already recorded for this client, not incrementing count"
      );
    }

    // Return the current view count
    res.json({
      success: true,
      counted: !existingView,
      message: existingView ? "View already recorded" : "View recorded",
      shouldInvalidateFeeds,
      view_count: updatedViewCount,
    });
  } catch (error) {
    console.error("Error processing view:", error);
    res.status(500).json({ error: "Failed to process view" });
  }
});

// Article update endpoint
app.patch("/api/articles/:id", async (req, res) => {
  try {
    console.log("Update article endpoint called");

    // Get article ID or slug from URL parameter
    const idOrSlug = req.params.id;
    console.log("Looking up article:", idOrSlug);

    // Authenticate user
    const { userId, error: authError } = await authenticateUser(req);
    if (authError) {
      return res.status(401).json({ message: authError });
    }

    // Fetch the article to check ownership - try both ID and slug
    let article;
    let fetchError;

    if (/^\d+$/.test(idOrSlug)) {
      // It's a numeric ID
      const result = await supabase
        .from("articles")
        .select("*")
        .eq("id", parseInt(idOrSlug))
        .single();
      article = result.data;
      fetchError = result.error;
    } else {
      // Try slug lookup
      const result = await supabase
        .from("articles")
        .select("*")
        .eq("slug", idOrSlug)
        .single();
      article = result.data;
      fetchError = result.error;
    }

    if (fetchError || !article) {
      console.error("Error fetching article:", fetchError);
      return res.status(404).json({ message: "Article not found" });
    }

    // Check if user owns the article
    if (article.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this article" });
    }

    // Extract update fields from request body
    const {
      title,
      content,
      categoryId,
      categoryIds,
      category,
      location,
      location_name,
      location_lat,
      location_lng,
    } = req.body;

    // Construct update object with only provided fields
    const updates: any = {};
    if (title !== undefined) {
      updates.title = title;

      // Update slug if title changes
      const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 60);

      // Add date to make it more unique
      const date = new Date();
      const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
      updates.slug = `${dateStr}-${baseSlug}`;

      console.log("Generated new slug for article update:", updates.slug);
    }
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;

    // Handle location fields with the new structure
    // For backward compatibility, also update the location column
    if (location_name !== undefined) {
      updates.location_name = location_name;
      updates.location = location_name; // Keep legacy field in sync
    } else if (location !== undefined) {
      updates.location = location;
      // Also update location_name if it's not explicitly set
      if (location_name === undefined) {
        updates.location_name = location;
      }
    }

    // Handle coordinates and geometry
    if (location_lat !== undefined) updates.location_lat = location_lat;
    if (location_lng !== undefined) updates.location_lng = location_lng;

    // Create PostGIS point geometry if we have valid coordinates
    if (typeof location_lat === "number" && typeof location_lng === "number") {
      updates.geom = `SRID=4326;POINT(${location_lng} ${location_lat})`;
    } else if (location_lat === null && location_lng === null) {
      // Clear geometry if coordinates are explicitly set to null
      updates.geom = null;
    }

    if (categoryId !== undefined) updates.category_id = categoryId;

    // Update the article
    const { data: updatedArticle, error: updateError } = await supabase
      .from("articles")
      .update(updates)
      .eq("id", article.id) // Always use numeric ID for update
      .select()
      .single();

    if (updateError) {
      console.error("Error updating article:", updateError);
      return res.status(500).json({
        message: "Failed to update article",
        details: updateError.message,
      });
    }

    // Handle category relationships if categoryIds is provided
    if (categoryIds && Array.isArray(categoryIds)) {
      // First remove all existing category relationships
      await supabase
        .from("article_categories")
        .delete()
        .eq("article_id", article.id);

      // Then add new ones
      if (categoryIds.length > 0) {
        const categoryRelations = categoryIds.map((catId, index) => ({
          article_id: article.id,
          category_id: catId,
          is_primary: index === 0,
        }));

        await supabase.from("article_categories").insert(categoryRelations);
      }
    }

    return res.json(updatedArticle);
  } catch (error) {
    console.error("Error in update article endpoint:", error);
    return res.status(500).json({ message: "Failed to update article" });
  }
});

// Delete an article
app.delete("/api/articles/:id", async (req, res) => {
  try {
    console.log("Delete article endpoint called");

    // Get article ID or slug from URL parameter
    const idOrSlug = req.params.id;
    console.log("Looking up article to delete:", idOrSlug);

    // Authenticate the user
    const { userId, error: authError } = await authenticateUser(req);
    if (authError) {
      return res.status(401).json({ message: authError });
    }

    // Verify that article exists and belongs to this user - try both ID and slug
    let article;
    let getError;

    if (/^\d+$/.test(idOrSlug)) {
      // It's a numeric ID
      const result = await supabase
        .from("articles")
        .select("*")
        .eq("id", parseInt(idOrSlug))
        .single();
      article = result.data;
      getError = result.error;
    } else {
      // Try slug lookup
      const result = await supabase
        .from("articles")
        .select("*")
        .eq("slug", idOrSlug)
        .single();
      article = result.data;
      getError = result.error;
    }

    if (getError || !article) {
      console.error("Error getting article to delete:", getError);
      return res.status(404).json({ message: "Article not found" });
    }

    if (article.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You don't have permission to delete this article" });
    }

    console.log(`Deleting article ${article.id} with a direct SQL approach`);

    try {
      // Step 1: Delete all comments for this article
      const { error: commentsError } = await supabase
        .from("comments")
        .delete()
        .eq("article_id", article.id);

      if (commentsError) {
        console.error("Error deleting comments:", commentsError);
      }

      // Step 2: Delete all reactions for this article
      const { error: reactionsError } = await supabase
        .from("reactions")
        .delete()
        .eq("article_id", article.id);

      if (reactionsError) {
        console.error("Error deleting reactions:", reactionsError);
      }

      // Step 3: Delete all images for this article
      const { error: imagesError } = await supabase
        .from("article_images")
        .delete()
        .eq("article_id", article.id);

      if (imagesError) {
        console.error("Error deleting images:", imagesError);
      }

      // Step 4: Delete all category associations
      const { error: categoriesError } = await supabase
        .from("article_categories")
        .delete()
        .eq("article_id", article.id);

      if (categoriesError) {
        console.error("Error deleting article categories:", categoriesError);
      }

      // Step 5: Finally, delete the article
      const { error: articleError } = await supabase
        .from("articles")
        .delete()
        .eq("id", article.id);

      if (articleError) {
        console.error("Error deleting article:", articleError);
        return res.status(500).json({
          message: "Failed to delete article",
          error: articleError.message,
          details: articleError,
        });
      }

      console.log(`Successfully deleted article ${article.id}`);
      return res.status(204).send();
    } catch (err) {
      console.error("Error during article deletion sequence:", err);
      return res.status(500).json({
        message: "Failed to delete article",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (error) {
    console.error("Error in delete article endpoint:", error);
    return res.status(500).json({
      message: "Failed to delete article",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get user information by ID
app.get("/api/users/:id", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Fetch user from database - only select existing columns
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, description, created_at")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return user info (excluding sensitive data)
    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Failed to fetch user information" });
  }
});

// Get user information by username
app.get("/api/users/by-username/:username", async (req, res) => {
  try {
    const { username } = req.params;
    
    // Fetch user from database - only select existing columns
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, description, created_at")
      .eq("username", username)
      .single();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return user info (excluding sensitive data)
    res.json(user);
  } catch (error) {
    console.error("Error fetching user by username:", error);
    res.status(500).json({ message: "Failed to fetch user information" });
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
    const { userId: authUserId, error: authError } = await authenticateUser(
      req
    );
    if (authError) {
      return res.status(401).json({ message: authError });
    }

    // Check if the authenticated user is trying to update their own profile
    if (authUserId !== userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this user" });
    }

    // Extract update fields from request body
    const { description, username, profileImage, bannerImage } = req.body;

    // Construct update object
    const updates: any = {};
    if (description !== undefined) updates.description = description;
    if (username !== undefined) updates.username = username;
    if (profileImage !== undefined) updates.profile_image = profileImage;
    if (bannerImage !== undefined) updates.banner_image = bannerImage;

    // Update the user
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating user:", updateError);
      return res
        .status(500)
        .json({ message: "Failed to update user", details: updateError });
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
    res.setHeader("Content-Type", "application/json");

    const channelId = parseInt(req.params.id);
    console.log(`API: Fetching subscribers for channel ID: ${channelId}`);

    // Debug log to check all request headers
    console.log("Request headers:", JSON.stringify(req.headers, null, 2));

    // Extract the Authorization header (if any)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("API: No Authorization header found for get subscribers");
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log(
        "API: No token found in Authorization header for get subscribers"
      );
      return res.status(401).json({ error: "Authentication token required" });
    }

    // Verify the token with Supabase
    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData.user) {
      console.error(
        "API: Error verifying user token for get subscribers:",
        userError
      );
      return res.status(401).json({ error: "Invalid authentication token" });
    }

    console.log(`API: Token verified for user: ${userData.user.id}`);

    // Look up the user in our database
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", userData.user.id)
      .single();

    if (dbError || !dbUser) {
      console.error("API: Error finding user for get subscribers:", dbError);
      return res.status(401).json({ error: "User not found" });
    }

    console.log(`API: Found user ID: ${dbUser.id}`);

    // Simplified query that just gets subscriptions and user info directly
    try {
      console.log(`API: Fetching subscriptions for channel ID: ${channelId}`);

      // Get subscriptions for this channel
      const { data: subscriptions, error: subError } = await supabase
        .from("subscriptions")
        .select("id, user_id")
        .eq("channel_id", channelId);

      if (subError) {
        console.error("API: Subscription query error:", subError);
        return res.status(500).json({ error: "Error fetching subscriptions" });
      }

      console.log(`API: Found ${subscriptions?.length || 0} subscriptions`);

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`API: No subscribers found for channel ${channelId}`);
        return res.json([]);
      }

      // Get user details for each subscriber
      const userIds = subscriptions.map((sub) => sub.user_id);
      console.log(`API: Fetching details for user IDs:`, userIds);

      const { data: users, error: userQueryError } = await supabase
        .from("users")
        .select("id, username")
        .in("id", userIds);

      if (userQueryError) {
        console.error("API: User query error:", userQueryError);
        return res
          .status(500)
          .json({ error: "Error fetching subscriber details" });
      }

      console.log(`API: Found ${users?.length || 0} users`);

      // Just return the subscribers with their usernames, no dates
      const subscribers = users.map((user) => ({
        id: user.id,
        username: user.username,
      }));

      console.log(
        `API: Returning ${subscribers.length} subscribers for channel ${channelId}`
      );
      console.log(
        "API: Sample subscriber data:",
        subscribers.length > 0 ? subscribers[0] : "No subscribers"
      );

      return res.json(subscribers);
    } catch (queryError) {
      console.error("API: Error in simplified subscriber query:", queryError);
      return res.status(500).json({ error: "Database query error" });
    }
  } catch (error) {
    console.error("API: Error in get channel subscribers endpoint:", error);
    return res
      .status(500)
      .json({ error: "Server error", details: String(error) });
  }
});

// Article reactions endpoint
app.post("/api/articles/:slug/reactions", async (req, res) => {
  const articleSlug = req.params.slug;
  const { isLike } = req.body;

  try {
    // Verify user is authenticated
    if (!req.headers.authorization) {
      return res.status(401).json({ error: "No authorization header" });
    }

    const token = req.headers.authorization.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return res.status(401).json({ error: "Unauthorized" });
    }

    // First, get the article ID from the slug
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", articleSlug)
      .single();

    if (articleError || !article) {
      console.error("Error finding article:", articleError);
      return res.status(404).json({ error: "Article not found" });
    }

    const articleId = article.id;
    console.log(`Found article ID ${articleId} for slug ${articleSlug}`);

    // Get internal user ID from Supabase Auth ID
    const { data: dbUser, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", user.id)
      .single();

    if (userError || !dbUser) {
      console.error("Error finding user:", userError);
      return res.status(404).json({ error: "User not found" });
    }

    const userId = dbUser.id;
    console.log(
      `Processing reaction for article ${articleId} by internal user ID ${userId}`
    );

    // Check for existing reaction
    const { data: existingReaction } = await supabase
      .from("reactions")
      .select("*")
      .eq("article_id", articleId)
      .eq("user_id", userId)
      .single();

    if (existingReaction) {
      console.log("Existing reaction found:", existingReaction);

      if (existingReaction.is_like === isLike) {
        // Remove reaction if same type
        const { error: removeError } = await supabase.rpc(
          "remove_article_reaction",
          {
            article_id: articleId,
            reaction_id: existingReaction.id,
            was_like: existingReaction.is_like,
          }
        );

        if (removeError) {
          console.error("Error removing reaction:", removeError);
          throw removeError;
        }
      } else {
        // Update reaction if different type
        const { error: updateError } = await supabase.rpc(
          "update_article_reaction",
          {
            article_id: articleId,
            reaction_id: existingReaction.id,
            old_is_like: existingReaction.is_like,
            new_is_like: isLike,
          }
        );

        if (updateError) {
          console.error("Error updating reaction:", updateError);
          throw updateError;
        }
      }
    } else {
      console.log("Creating new reaction");

      // Create new reaction
      const { error: addError } = await supabase.rpc("add_article_reaction", {
        article_id: articleId,
        user_id: userId,
        is_like: isLike,
      });

      if (addError) {
        console.error("Error adding reaction:", addError);
        throw addError;
      }
    }

    // Get updated reaction counts
    const { data: counts, error: countError } = await supabase
      .from("reactions")
      .select("is_like")
      .eq("article_id", articleId);

    if (countError) {
      console.error("Error getting counts:", countError);
      throw countError;
    }

    const likeCount = counts.filter((r) => r.is_like).length;
    const dislikeCount = counts.filter((r) => !r.is_like).length;

    res.json({
      like_count: likeCount,
      dislike_count: dislikeCount,
      user_reaction: existingReaction ? null : isLike,
    });
  } catch (error) {
    console.error("Error processing reaction:", error);
    res.status(500).json({ error: "Failed to process reaction" });
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
    const likes = reactions?.filter((r) => r.is_like).length || 0;
    const dislikes = reactions?.filter((r) => !r.is_like).length || 0;

    // Get user's reaction if authenticated
    let userReaction = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];

      try {
        const { data, error: authError } = await supabaseAuth.auth.getUser(
          token
        );
        if (!authError && data.user) {
          // Look up internal user ID
          const { data: dbUser } = await supabase
            .from("users")
            .select("id")
            .eq("supabase_uid", data.user.id)
            .single();

          if (dbUser) {
            const userId = dbUser.id;

            // Find user's reaction
            const userReactionData = reactions?.find(
              (r) => r.user_id === userId
            );
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

// Categories endpoint
app.get("/api/categories", async (req, res) => {
  try {
    console.log("Fetching categories from Supabase");

    // Fetch all categories from the database
    const { data: categories, error } = await supabase
      .from("categories")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching categories:", error);
      return res.status(500).json({ error: "Failed to fetch categories" });
    }

    console.log(`Successfully fetched ${categories?.length || 0} categories`);

    // Transform into a hierarchical structure
    const categoryMap = new Map();
    const rootCategories = [];

    // First pass: create all category objects and store in map
    categories?.forEach((category) => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    // Second pass: build the hierarchy
    categories?.forEach((category) => {
      const categoryWithChildren = categoryMap.get(category.id);

      if (category.parent_id === null) {
        // This is a root category
        rootCategories.push(categoryWithChildren);
      } else {
        // This is a child category, add to its parent's children array
        const parent = categoryMap.get(category.parent_id);
        if (parent) {
          parent.children.push(categoryWithChildren);
        }
      }
    });

    res.json(rootCategories || []);
  } catch (error) {
    console.error("Error in categories endpoint:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Locations endpoint
app.get("/api/locations", async (req, res) => {
  try {
    console.log("Fetching locations from Supabase");

    // Fetch all locations from the database
    const { data: locations, error } = await supabase
      .from("locations")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching locations:", error);
      return res.status(500).json({ error: "Failed to fetch locations" });
    }

    console.log(`Successfully fetched ${locations?.length || 0} locations`);

    // Transform into a hierarchical structure
    const locationMap = new Map();
    const rootLocations = [];

    // First pass: create all location objects and store in map
    locations?.forEach((location) => {
      locationMap.set(location.id, { ...location, children: [] });
    });

    // Second pass: build the hierarchy
    locations?.forEach((location) => {
      const locationWithChildren = locationMap.get(location.id);

      if (location.parent_id === null) {
        // This is a root location
        rootLocations.push(locationWithChildren);
      } else {
        // This is a child location, add to its parent's children array
        const parent = locationMap.get(location.parent_id);
        if (parent) {
          parent.children.push(locationWithChildren);
        }
      }
    });

    res.json(rootLocations || []);
  } catch (error) {
    console.error("Error in locations endpoint:", error);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

// Update article images
app.put("/api/articles/:id/images", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const { images } = req.body; // Array of { image_url, caption, order }

    // Authenticate the user
    const { userId, error: authError } = await authenticateUser(req);
    if (authError) {
      return res.status(401).json({ message: authError });
    }

    // Verify article ownership
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("user_id")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      return res.status(404).json({ message: "Article not found" });
    }

    if (article.user_id !== userId) {
      return res.status(403).json({
        message: "You don't have permission to update this article's images",
      });
    }

    // Get current images
    const { data: currentImages, error: getCurrentError } = await supabase
      .from("article_images")
      .select("*")
      .eq("article_id", articleId);

    if (getCurrentError) {
      console.error("Error fetching current images:", getCurrentError);
      return res
        .status(500)
        .json({ message: "Failed to fetch current images" });
    }

    // Find images to delete (images in currentImages but not in new images array)
    const newImageUrls = new Set(images.map((img) => img.image_url));
    const imagesToDelete =
      currentImages?.filter((img) => !newImageUrls.has(img.image_url)) || [];

    // Delete removed images from storage
    if (imagesToDelete.length > 0) {
      const storage = supabase.storage.from("article-images");
      for (const image of imagesToDelete) {
        const filename = image.image_url.split("/").pop();
        if (filename) {
          const { error: deleteStorageError } = await storage.remove([
            filename,
          ]);
          if (deleteStorageError) {
            console.error(
              "Error deleting image from storage:",
              deleteStorageError
            );
          }
        }
      }
    }

    // Delete all current images from the database (we'll reinsert the kept ones)
    const { error: deleteError } = await supabase
      .from("article_images")
      .delete()
      .eq("article_id", articleId);

    if (deleteError) {
      console.error("Error deleting current images:", deleteError);
      return res.status(500).json({ message: "Failed to update images" });
    }

    // Insert new/kept images
    if (images.length > 0) {
      const { error: insertError } = await supabase
        .from("article_images")
        .insert(
          images.map((img) => ({
            article_id: articleId,
            image_url: img.image_url,
            caption: img.caption,
            order: img.order,
          }))
        );

      if (insertError) {
        console.error("Error inserting new images:", insertError);
        return res.status(500).json({ message: "Failed to update images" });
      }
    }

    return res.json({ message: "Images updated successfully" });
  } catch (error) {
    console.error("Error in update article images endpoint:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Add this new endpoint handler before the final export
// Handle article image metadata
app.post("/api/articles/:id/images", async (req, res) => {
  try {
    console.log("=== DEBUG: POST /api/articles/:id/images ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("Request params:", JSON.stringify(req.params, null, 2));
    console.log("Request headers:", JSON.stringify(req.headers, null, 2));

    const { userId, error: authError } = await authenticateUser(req);
    console.log("Auth result - userId:", userId, "authError:", authError);

    if (authError || !userId) {
      console.log("Authentication failed");
      return res.status(401).json({ message: authError || "Unauthorized" });
    }

    const articleId = parseInt(req.params.id);
    console.log("Parsed articleId:", articleId);

    if (isNaN(articleId)) {
      console.log("Invalid article ID");
      return res.status(400).json({ message: "Invalid article ID" });
    }

    // Verify the article exists and belongs to the user
    console.log("Fetching article from database...");
    const { data: article, error: getError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .single();

    console.log("Article fetch result - article:", article, "error:", getError);

    if (getError || !article) {
      console.error("Error getting article:", getError);
      return res.status(404).json({ message: "Article not found" });
    }

    if (article.user_id !== userId) {
      console.log(
        `Permission denied - article.user_id: ${article.user_id}, userId: ${userId}`
      );
      return res
        .status(403)
        .json({ message: "You don't have permission to modify this article" });
    }

    // Insert the image metadata
    const imageData = Array.isArray(req.body) ? req.body : [req.body];
    console.log(
      "Preparing to insert image metadata:",
      JSON.stringify(imageData, null, 2)
    );

    const { data: insertedImages, error: insertError } = await supabase
      .from("article_images")
      .insert(
        imageData.map((img) => ({
          article_id: articleId,
          image_url: img.image_url,
          caption: img.caption || "",
          order: img.order || 0,
        }))
      )
      .select();

    console.log(
      "Insert result - insertedImages:",
      insertedImages,
      "error:",
      insertError
    );

    if (insertError) {
      console.error("Error inserting image metadata:", insertError);
      return res.status(500).json({
        message: "Failed to save image metadata",
        details: insertError,
      });
    }

    console.log("Successfully saved image metadata");
    return res.status(200).json(insertedImages);
  } catch (error) {
    console.error("Unexpected error handling article images:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
});

// The handler function that routes requests to our Express app
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();

  // Enhanced debugging for Vercel serverless environment
  console.log(`[${requestId}] 🚀 SERVERLESS FUNCTION INVOKED`);
  console.log(`[${requestId}] Method: ${req.method}, URL: ${req.url}`);
  console.log(`[${requestId}] Headers: ${JSON.stringify(req.headers)}`);
  console.log(`[${requestId}] Query params: ${JSON.stringify(req.query)}`);
  console.log(
    `[${requestId}] Environment: Vercel=${
      process.env.VERCEL === "1" ? "true" : "false"
    }, NODE_ENV=${process.env.NODE_ENV}, Region=${
      process.env.VERCEL_REGION || "unknown"
    }`
  );

  if (req.body && Object.keys(req.body).length > 0) {
    try {
      console.log(`[${requestId}] Request body: ${JSON.stringify(req.body)}`);
    } catch (err) {
      console.log(
        `[${requestId}] Request body present but not JSON serializable`
      );
    }
  }

  try {
    await app(req, res);
    const duration = Date.now() - startTime;
    console.log(
      `[${requestId}] ✅ Request completed in ${duration}ms with status ${res.statusCode}`
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[${requestId}] ❌ Error handling request (${duration}ms):`,
      error
    );

    // If headers haven't been sent yet, respond with error
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal Server Error",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "An unexpected error occurred",
      });
    }
  }
}

// Toggle article publish status
app.post("/api/articles/:id/toggle-status", async (req, res) => {
  try {
    console.log("Toggle article status endpoint called");

    // Get article ID or slug from URL parameter
    const idOrSlug = req.params.id;
    console.log("Looking up article for status toggle:", idOrSlug);

    // Authenticate user
    const { userId, error: authError } = await authenticateUser(req);
    if (authError) {
      return res.status(401).json({ message: authError });
    }

    // Fetch the article to check ownership - try both ID and slug
    let article;
    let fetchError;

    if (/^\d+$/.test(idOrSlug)) {
      // It's a numeric ID
      const result = await supabase
        .from("articles")
        .select("*")
        .eq("id", parseInt(idOrSlug))
        .single();
      article = result.data;
      fetchError = result.error;
    } else {
      // Try slug lookup
      const result = await supabase
        .from("articles")
        .select("*")
        .eq("slug", idOrSlug)
        .single();
      article = result.data;
      fetchError = result.error;
    }

    if (fetchError || !article) {
      console.error("Error fetching article for status toggle:", fetchError);
      return res.status(404).json({ message: "Article not found" });
    }

    // Check if user owns the article
    if (article.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to toggle this article's status" });
    }

    // Toggle the published status
    const newStatus = article.published ? false : true;

    // Update the article
    const { data: updatedArticle, error: updateError } = await supabase
      .from("articles")
      .update({
        published: newStatus,
        status: newStatus ? "published" : "draft",
        last_edited: new Date().toISOString(),
      })
      .eq("id", article.id) // Always use numeric ID for update
      .select()
      .single();

    if (updateError) {
      console.error(`Error toggling article ${article.id}:`, updateError);
      return res
        .status(500)
        .json({ message: "Failed to toggle article status" });
    }

    console.log(
      `Article ${article.id} toggled to ${
        updatedArticle.published ? "published" : "draft"
      }`
    );
    return res.json(updatedArticle);
  } catch (error) {
    console.error("Error in toggle article status endpoint:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Article endpoint
app.get("/api/articles/:idOrSlug", async (req, res) => {
  try {
    console.log("Article endpoint called");

    // Get article ID or slug from URL parameter
    const idOrSlug = req.params.idOrSlug;
    console.log("Looking up article:", idOrSlug);

    let article;
    let fetchError;

    if (/^\d+$/.test(idOrSlug)) {
      // It's a numeric ID
      console.log("Fetching article by ID:", idOrSlug);
      const result = await supabase
        .from("articles")
        .select(
          `
          *,
          user:user_id (id, username, supabase_uid),
          channel:channel_id (id, name, slug, description, profile_image, user_id),
          images:article_images (id, image_url, caption, "order"),
          categories:article_categories (
            category_id, 
            is_primary,
            category:category_id (id, name, parent_id)
          )
        `
        )
        .eq("id", parseInt(idOrSlug))
        .single();
      article = result.data;
      fetchError = result.error;
    } else {
      // Try slug lookup
      console.log("Fetching article by slug:", idOrSlug);
      const result = await supabase
        .from("articles")
        .select(
          `
          *,
          user:user_id (id, username, supabase_uid),
          channel:channel_id (id, name, slug, description, profile_image, user_id),
          images:article_images (id, image_url, caption, "order"),
          categories:article_categories (
            category_id, 
            is_primary,
            category:category_id (id, name, parent_id)
          )
        `
        )
        .eq("slug", idOrSlug)
        .single();
      article = result.data;
      fetchError = result.error;
    }

    if (fetchError || !article) {
      console.error("Error fetching article:", fetchError);
      return res.status(404).json({ message: "Article not found" });
    }

    console.log(`Found article: "${article.title}"`);

    // Get reaction counts
    const { data: likes, error: likesError } = await supabase
      .from("reactions")
      .select("id")
      .eq("article_id", article.id)
      .eq("is_like", true)
      .gt("user_id", 0); // Only count real user reactions here

    if (likesError) {
      console.error("Error fetching likes:", likesError);
    }

    const { data: dislikes, error: dislikesError } = await supabase
      .from("reactions")
      .select("id")
      .eq("article_id", article.id)
      .eq("is_like", false)
      .gt("user_id", 0); // Only count real user reactions here

    if (dislikesError) {
      console.error("Error fetching dislikes:", dislikesError);
    }

    // Get comment count - this needs to actually count the comments
    const { data: comments, error: commentsError } = await supabase
      .from("comments")
      .select("id")
      .eq("article_id", article.id);

    if (commentsError) {
      console.error("Error fetching comment count:", commentsError);
    }

    console.log(`DEBUG: Raw comments data:`, comments);

    // Store comment count in article._count - use actual comment array length
    const commentCount = comments?.length || 0;
    console.log(`DEBUG: Comment count calculated:`, commentCount);

    article._count = {
      ...article._count,
      comments: commentCount,
    };

    // Also expose comment count in multiple formats for backward compatibility
    article.comment_count = commentCount;
    article.commentCount = commentCount;

    console.log(`DEBUG: Article comment counts set:`, {
      _count: article._count,
      comment_count: article.comment_count,
      commentCount: article.commentCount,
    });

    // Get user's reaction if authenticated
    let userReaction = null;

    if (req.headers.authorization) {
      const token = req.headers.authorization.replace("Bearer ", "");
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (!authError && user) {
        // Get internal user ID from Supabase Auth ID
        const { data: dbUser } = await supabase
          .from("users")
          .select("id")
          .eq("supabase_uid", user.id)
          .single();

        if (dbUser) {
          const { data: reaction } = await supabase
            .from("reactions")
            .select("is_like")
            .eq("article_id", article.id)
            .eq("user_id", dbUser.id)
            .maybeSingle();

          if (reaction) {
            userReaction = reaction.is_like;
          }
        }
      }
    }

    // Add reaction data to article
    const userLikes = likes?.length || 0;
    const userDislikes = dislikes?.length || 0;
    const adminLikes = article.admin_like_count || 0;
    const adminDislikes = article.admin_dislike_count || 0;

    // The frontend expects like_count and dislike_count, not likes and dislikes
    article.like_count = userLikes + adminLikes;
    article.dislike_count = userDislikes + adminDislikes;
    article.userReaction = userReaction;

    console.log(
      `Article ${article.id} reactions: ${userLikes} user likes + ${adminLikes} admin likes = ${article.like_count} total likes`
    );
    console.log(
      `Article ${article.id} reactions: ${userDislikes} user dislikes + ${adminDislikes} admin dislikes = ${article.dislike_count} total dislikes`
    );
    console.log(`Article ${article.id} has ${commentCount} comments`);

    // Keep these for backwards compatibility
    article.likes = article.like_count;
    article.dislikes = article.dislike_count;

    // Sort images by order field
    if (article.images) {
      article.images.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // Format categories to match expected client structure
    if (article.categories) {
      article.categories = article.categories.map((cat) => ({
        id: cat.category_id,
        name: cat.category?.name,
        isPrimary: cat.is_primary,
      }));
    }

    res.json(article);
  } catch (error) {
    console.error("Error in article endpoint:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// API endpoint to find an article ID by slug (used for redirecting old URLs)
app.get("/api/articles/by-slug/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    console.log("Article lookup by slug request for:", slug);

    // Query the database to find the article by slug
    const { data, error } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      console.log("Article not found for slug:", slug);
      return res.status(404).json({ error: "Article not found" });
    }

    console.log("Found article ID for slug:", data.id);
    res.json({ id: data.id });
  } catch (error) {
    console.error("Error finding article by slug:", error);
    res
      .status(500)
      .json({ error: "Failed to find article", details: String(error) });
  }
});
