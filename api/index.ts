// @ts-nocheck
import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
// Plain ESM modules with no npm imports; the explicit .js extension is what
// the Vercel builder needs (see SEO.md, "The October 2026 crawler outage").
import {
  LAST_EDITED_IS_TRUSTWORTHY,
  deriveExcerpt,
  extractDek,
  setDek,
  sortImages,
  storeMediaUrls,
  toStoredUrl,
} from "../shared/article-media.js";
import { installJsonImageRewrite } from "./_lib/json-image-rewrite.js";
import { ingestArticleMedia, parseImageFields } from "./_lib/image-ingest.js";
import { recordPageEvent, registerAnalyticsRoutes } from "./_lib/analytics.js";
import {
  deleteArticle,
  findArticle,
  isValidPreviewToken,
  previewToken,
  replaceArticleCategories,
  replaceArticleImages,
  serializeArticle,
  updateArticleFields,
} from "./_lib/article-service.js";

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

// Stored form of our images: the public bucket URL (works with or without
// /media deployed). Applied at every write that can carry an image URL.
const storeUrls = (text: any) =>
  typeof text === "string" ? storeMediaUrls(text, supabaseUrl) : text;
const storeUrl = (url: any) =>
  typeof url === "string" ? toStoredUrl(url, supabaseUrl) : url;

// Content API utilities (inlined to avoid cross-directory import issues with @vercel/node)
import { createHash, randomBytes } from "crypto";

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const rawBytes = randomBytes(32);
  const key = `nk_${rawBytes.toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 11);
  return { key, hash, prefix };
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function authenticateApiKey(
  apiKeyHeader: string,
  sb: any
): Promise<{ userId?: number; error?: string }> {
  if (!apiKeyHeader || !apiKeyHeader.startsWith("nk_")) {
    return { error: "Invalid API key format" };
  }
  const keyHash = hashApiKey(apiKeyHeader);
  const { data: apiKeyRow, error } = await sb
    .from("api_keys").select("id, user_id, is_revoked, expires_at").eq("key_hash", keyHash).single();
  if (error || !apiKeyRow) return { error: "Invalid API key" };
  if (apiKeyRow.is_revoked) return { error: "API key has been revoked" };
  if (apiKeyRow.expires_at && new Date(apiKeyRow.expires_at) < new Date()) return { error: "API key has expired" };
  sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKeyRow.id).then(() => {});
  return { userId: apiKeyRow.user_id };
}

// ---- Rich markdown → HTML converter ----
// Implements docs/article-format.md: [!SUMMARY]/[!KEY]/[!QUOTE]/[!STAT] etc.
// callouts, GFM tables, figure/captions + galleries, video embeds, ```chart
// blocks. Self-contained (no deps). Canonical copy: server/markdown-to-html.ts
// — keep the two in sync.

const MD_CALLOUT_TITLES: Record<string, string> = {
  summary: "In brief",
  key: "Key points",
  context: "Context",
  tip: "Worth knowing",
  note: "Note",
  important: "Important",
  warning: "Caution",
};

const MD_IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

function mdEscapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdEscapeAttr(text: string): string {
  return mdEscapeHtml(text).replace(/"/g, "&quot;");
}

function mdInline(text: string): string {
  let r = text;
  r = r.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  r = r.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  r = r.replace(/__(.+?)__/g, "<strong>$1</strong>");
  r = r.replace(/\*(.+?)\*/g, "<em>$1</em>");
  r = r.replace(/_(.+?)_/g, "<em>$1</em>");
  return r;
}

function mdFigure(alt: string, url: string): string {
  const cap = alt.trim();
  return `<figure class="article-figure"><img src="${mdEscapeAttr(url)}" alt="${mdEscapeAttr(cap)}" loading="lazy">${
    cap ? `<figcaption>${mdInline(cap)}</figcaption>` : ""
  }</figure>`;
}

function mdVideoEmbed(line: string): string | null {
  const yt = line.match(
    /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})\S*$/
  );
  if (yt) {
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Embedded video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  const vm = line.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)\S*$/);
  if (vm) {
    return `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${vm[1]}" title="Embedded video" loading="lazy" allowfullscreen></iframe></div>`;
  }
  return null;
}

function mdTable(block: string): string | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0].includes("|")) return null;
  if (!/^\|?[\s:|-]+\|?$/.test(lines[1]) || !lines[1].includes("-")) return null;
  const parseRow = (line: string) =>
    line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headers = parseRow(lines[0]);
  const aligns = parseRow(lines[1]).map((sep) => {
    const l = sep.startsWith(":");
    const r = sep.endsWith(":");
    return l && r ? "center" : r ? "right" : "";
  });
  const cellAttr = (i: number) => (aligns[i] ? ` style="text-align:${aligns[i]}"` : "");
  const th = headers.map((h, i) => `<th${cellAttr(i)}>${mdInline(h)}</th>`).join("");
  const trs = lines
    .slice(2)
    .map(parseRow)
    .map((row) => `<tr>${headers.map((_, i) => `<td${cellAttr(i)}>${mdInline(row[i] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-wrap"><table class="article-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function mdCallout(block: string): string | null {
  const lines = block.split("\n").map((l) => l.replace(/^>\s?/, ""));
  const m = lines[0].match(/^\[!(\w+)\]\s*(.*)$/);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const titleRest = m[2].trim();
  const body = lines.slice(1).join("\n").trim();

  if (type === "quote") {
    const bl = body.split("\n").filter((l) => l.trim());
    let attribution = "";
    let quoteLines = bl;
    const last = (bl[bl.length - 1] || "").trim();
    if (/^(—|--|–)\s*/.test(last)) {
      attribution = last.replace(/^(—|--|–)\s*/, "");
      quoteLines = bl.slice(0, -1);
    }
    const text = quoteLines.join(" ").trim().replace(/^["“]/, "").replace(/["”]$/, "");
    return `<figure class="pull-quote"><blockquote>${mdInline(text)}</blockquote>${
      attribution ? `<figcaption>${mdInline(attribution)}</figcaption>` : ""
    }</figure>`;
  }

  if (type === "stat") {
    const bl = body.split("\n").filter((l) => l.trim());
    const figure = (bl[0] || titleRest).trim();
    const caption = bl.slice(1).join(" ").trim();
    return `<aside class="callout callout-stat"><div class="stat-figure">${mdInline(figure)}</div>${
      caption ? `<div class="stat-caption">${mdInline(caption)}</div>` : ""
    }</aside>`;
  }

  const known = ["summary", "key", "context", "tip", "note", "important", "warning"];
  const cls = known.includes(type) ? type : "note";
  const title = titleRest || MD_CALLOUT_TITLES[cls] || cls;
  const bodyHtml = markdownToHtml(body);
  return `<aside class="callout callout-${cls}" data-callout="${cls}"><div class="callout-title">${mdInline(
    title
  )}</div><div class="callout-body">${bodyHtml}</div></aside>`;
}

function markdownToHtml(markdown: string): string {
  let html = markdown.replace(/\r\n/g, "\n");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    if ((lang || "").toLowerCase() === "chart") {
      try {
        const spec = JSON.parse(code);
        return `<div class="article-chart" data-chart="${mdEscapeAttr(JSON.stringify(spec))}"></div>`;
      } catch {
        return `<pre><code>${mdEscapeHtml(code.trimEnd())}</code></pre>`;
      }
    }
    return `<pre><code>${mdEscapeHtml(code.trimEnd())}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, (_m, code) => `<code>${mdEscapeHtml(code)}</code>`);

  const blocks = html.split(/\n{2,}/);
  const output: string[] = [];

  for (const block of blocks) {
    const t = block.trim();
    if (!t) continue;

    if (t.startsWith("<pre><code>") || t.startsWith('<div class="article-chart"')) {
      output.push(t);
      continue;
    }

    const hm = t.match(/^(#{1,6})\s+(.+)$/m);
    if (hm && t.split("\n").length === 1) {
      output.push(`<h${hm[1].length}>${mdInline(hm[2])}</h${hm[1].length}>`);
      continue;
    }

    if (/^[-*_]{3,}$/.test(t)) {
      output.push("<hr>");
      continue;
    }

    if (t.startsWith(">")) {
      const callout = mdCallout(t);
      if (callout) {
        output.push(callout);
        continue;
      }
      const content = t.split("\n").map((l) => l.replace(/^>\s?/, "")).join("\n");
      output.push(`<blockquote><p>${mdInline(content)}</p></blockquote>`);
      continue;
    }

    const table = mdTable(t);
    if (table) {
      output.push(table);
      continue;
    }

    const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => MD_IMG_LINE.test(l))) {
      const figs = lines.map((l) => {
        const im = l.match(MD_IMG_LINE)!;
        return mdFigure(im[1], im[2]);
      });
      output.push(
        figs.length > 1
          ? `<div class="article-gallery" data-gallery data-count="${figs.length}">${figs.join("")}</div>`
          : figs[0]
      );
      continue;
    }

    if (lines.length === 1) {
      const video = mdVideoEmbed(lines[0]);
      if (video) {
        output.push(video);
        continue;
      }
    }

    if (/^[-*+]\s/.test(t)) {
      const lis = t
        .split("\n")
        .filter((l) => l.trim())
        .map((item) => `<li>${mdInline(item.replace(/^[-*+]\s+/, ""))}</li>`)
        .join("");
      output.push(`<ul>${lis}</ul>`);
      continue;
    }

    if (/^\d+\.\s/.test(t)) {
      const lis = t
        .split("\n")
        .filter((l) => l.trim())
        .map((item) => `<li>${mdInline(item.replace(/^\d+\.\s+/, ""))}</li>`)
        .join("");
      output.push(`<ol>${lis}</ol>`);
      continue;
    }

    output.push(`<p>${mdInline(t.replace(/\n/g, " "))}</p>`);
  }

  return output.join("\n");
}

function normalizeContent(content: string, format?: string): string {
  if (format === "html") return content;
  if (format === "markdown") return markdownToHtml(content);
  if (/<[a-z][\s\S]*>/i.test(content.trim())) return content;
  return markdownToHtml(content);
}

// Unified auth: try X-API-Key first, then fall back to Bearer JWT
async function authenticateRequest(
  req: express.Request
): Promise<{ userId?: number; error?: string; authMethod?: string }> {
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
  if (apiKeyHeader) {
    const result = await authenticateApiKey(apiKeyHeader, supabase);
    if (result.userId) {
      return { userId: result.userId, authMethod: "api-key" };
    }
    return result;
  }
  const result = await authenticateUser(req);
  if (result.userId) {
    return { userId: result.userId, authMethod: "jwt" };
  }
  return result;
}

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

// Logs must never carry credentials: API keys, bearer tokens, cookies, or
// the auth tokens some request bodies carry.
const SECRET_HEADERS = new Set(["authorization", "x-api-key", "cookie", "set-cookie"]);
const SECRET_BODY_KEYS = new Set(["access_token", "refresh_token", "provider_token", "password", "token"]);
function redactHeaders(headers: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}
function redactBody(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const out: any = {};
  for (const [k, v] of Object.entries(body)) out[k] = SECRET_BODY_KEYS.has(k) ? "[redacted]" : v;
  return out;
}

// Create Express app
const app = express();
app.disable("x-powered-by");

// Debug routes are retired. Answer 404 for any spelling of /api/debug: Express
// matches routes case-insensitively, and the raw URL may hold encoded or dot
// segments that the router resolves, so test both req.path and a decoded,
// normalised copy of the original path.
const DEBUG_PATH = /^\/api\/+debug(\/|$)/i;
function normalisedRequestPath(rawUrl: string): string {
  let p = String(rawUrl || "").split("?")[0].split("#")[0];
  for (let i = 0; i < 3; i++) {
    let decoded = p;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      break;
    }
    if (decoded === p) break;
    p = decoded;
  }
  const out: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
}
app.use((req, res, next) => {
  if (
    DEBUG_PATH.test(req.path) ||
    DEBUG_PATH.test(normalisedRequestPath(req.originalUrl || req.url))
  ) {
    return res.status(404).end();
  }
  next();
});

// Debug logs for deployment
console.log("API Handler initializing (all-in-one version)");
console.log("Environment:", process.env.NODE_ENV);
console.log("Has SUPABASE_URL:", !!process.env.SUPABASE_URL);
console.log("Has SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);

// Setup Express middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Every image URL the API emits is permanent (/media/<path>); see the module.
installJsonImageRewrite(app);

// Analytics routes (GET /api/v1/admin/analytics, POST /api/t); see the module.
registerAnalyticsRoutes(app, { supabase, getSupabaseUid, isAdminUser });

// Add CORS middleware with dynamic origin
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  // Allow the production origins, plus the local Vite dev server outside production
  const allowedOrigins = [
    "https://www.newsplatform.org",
    "https://newsplatform.org",
  ];
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push("http://localhost:5001");
  }

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
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
  console.log(`[${requestId}] Headers: ${JSON.stringify(redactHeaders(req.headers))}`);

  if (Object.keys(req.query).length > 0) {
    console.log(`[${requestId}] Query params: ${JSON.stringify(req.query)}`);
  }

  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[${requestId}] Body: ${JSON.stringify(redactBody(req.body))}`);
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
      .select("id, username, description, created_at")
      .eq("supabase_uid", supabaseUid)
      .single();

    if (dbError) {
      return res.status(401).json({ error: "No profile for this account" });
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
    // The Supabase id and email come only from the verified access token;
    // anything in the request body is ignored.
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : "";
    if (!token) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const supabase_uid = user.id;
    const email = user.email || "";

    console.log("Supabase OAuth callback received for a verified user");

    const publicUserColumns = "id, username, description, created_at";

    // Try to find existing user with this Supabase ID
    const { data: existingUser, error: findError } = await supabase
      .from("users")
      .select(publicUserColumns)
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

    // Create a new user, username derived from the verified email
    const baseUsername =
      (email.split("@")[0] || "").replace(/[^a-z0-9_]/gi, "").slice(0, 30) ||
      `user_${randomBytes(3).toString("hex")}`;

    let newUser = null;
    let createError = null;
    for (let attempt = 0; attempt < 3 && !newUser; attempt++) {
      const username =
        attempt === 0
          ? baseUsername
          : `${baseUsername.slice(0, 25)}_${randomBytes(2).toString("hex")}`;
      console.log("Creating new user with username:", username);

      ({ data: newUser, error: createError } = await supabase
        .from("users")
        .insert([
          {
            username,
            password: "", // No password needed
            supabase_uid,
          },
        ])
        .select(publicUserColumns)
        .single());

      if (createError && createError.code !== "23505") break;
    }

    if (createError || !newUser) {
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

    // The owner is the profile bound to the verified token; any userId in
    // the request body is ignored.
    const { data: ownerRow, error: ownerError } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_uid", user.id)
      .single();

    if (ownerError || !ownerRow) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No profile for this account",
      });
    }

    const numericUserId = ownerRow.id;
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
          id,
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
              // Cover = lowest (order, id); embedded rows come back unordered.
              article.images = sortImages(article.images).map((img) => ({
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

            // Slim the list payload: cards need an excerpt + word count, not
            // the full body (full bodies made this response megabytes; the
            // article page fetches its own full content).
            const plainText = String(article.content || "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            article.wordCount = plainText ? plainText.split(" ").length : 0;
            article.content = plainText.slice(0, 500);
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
      content: storeUrls(content),
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
    console.log("Request headers:", JSON.stringify(redactHeaders(req.headers), null, 2));

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

    // Drafts and unpublished articles are not public: only the owner, an
    // admin, or a holder of the article's preview token may read them. The
    // same 404 as a missing article, so a draft's existence is not revealed.
    if (article.status !== "published" && !(article.status == null && article.published)) {
      const allowed =
        isValidPreviewToken(article.id, req.query.preview, supabaseServiceKey) ||
        (await isOwnerOrAdmin(req, article.user_id));
      if (!allowed) {
        return res.status(404).json({ error: "Article not found" });
      }
      res.setHeader("Cache-Control", "private, no-store");
    }

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
        .order("order", { ascending: true })
        .order("id", { ascending: true });

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

// Recirculation for the end of an article: { next, sameChannel, more }.
// Cards only (no bodies), cached at the edge for five minutes.
app.get("/api/articles/:id/related", async (req, res) => {
  try {
    const article = await findArticle(supabase, req.params.id, "id, channel_id, category, created_at, status, published");
    if (!article) return res.status(404).json({ error: "Article not found" });
    const limit = Math.min(12, Math.max(1, parseInt(String(req.query.limit || "6"), 10) || 6));
    const cols = "id, slug, title, category, created_at, channel_id, images:article_images ( id, image_url, caption, order )";
    const published = () => supabase.from("articles").select(cols).eq("published", true).neq("id", article.id);

    const [sameRes, categoryRes, latestRes] = await Promise.all([
      published().eq("channel_id", article.channel_id).order("created_at", { ascending: false }).limit(limit + 1),
      article.category
        ? published().eq("category", article.category).neq("channel_id", article.channel_id).order("created_at", { ascending: false }).limit(limit)
        : Promise.resolve({ data: [] }),
      published().neq("channel_id", article.channel_id).order("created_at", { ascending: false }).limit(limit * 2),
    ]);
    const same = sameRes.data || [];
    const seen = new Set();
    const more = [];
    for (const a of [...(categoryRes.data || []), ...(latestRes.data || [])]) {
      if (more.length >= limit || seen.has(a.id)) continue;
      seen.add(a.id);
      more.push(a);
    }
    const older = same.find((a) => a.created_at && article.created_at && a.created_at < article.created_at);
    const next = older || more[0] || null;
    const sameChannel = same.filter((a) => !next || a.id !== next.id).slice(0, limit);
    const moreCards = more.filter((a) => !next || a.id !== next.id);

    const channelIds = [...new Set([next, ...sameChannel, ...moreCards].filter(Boolean).map((a) => a.channel_id))];
    const { data: channels } = channelIds.length
      ? await supabase.from("channels").select("id, name, slug, profile_image").in("id", channelIds)
      : { data: [] };
    const channelMap = new Map((channels || []).map((c) => [c.id, c]));
    const card = (a) => {
      if (!a) return null;
      const c = channelMap.get(a.channel_id);
      const cover = sortImages(a.images || [])[0];
      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        category: a.category || null,
        createdAt: a.created_at,
        channel: c ? { id: c.id, name: c.name, slug: c.slug, profileImage: c.profile_image || null } : null,
        image: cover ? { url: cover.image_url, caption: cover.caption || "" } : null,
      };
    };

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.json({ next: card(next), sameChannel: sameChannel.map(card), more: moreCards.map(card) });
  } catch (error) {
    console.error("Error in GET /api/articles/:id/related:", error);
    return res.status(500).json({ error: "Failed to fetch related articles" });
  }
});

/** True when the bearer token belongs to the user `ownerId` or to an admin. */
async function isOwnerOrAdmin(req, ownerId) {
  try {
    const uid = await getSupabaseUid(req);
    if (!uid) return false;
    const { data: dbUser } = await supabase.from("users").select("id").eq("supabase_uid", uid).maybeSingle();
    if (dbUser && dbUser.id === ownerId) return true;
    return await isAdminUser(uid);
  } catch (e) {
    console.error("Owner/admin check failed:", e);
    return false;
  }
}

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
      .select("id, username")
      .eq("supabase_uid", supabaseUid)
      .single();

    if (dbError) {
      return res.status(401).json({ error: "No profile for this account" });
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
      .select("id, username")
      .eq("supabase_uid", supabaseUid)
      .single();

    if (dbError) {
      return res.status(401).json({ error: "No profile for this account" });
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
          id,
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
          ? sortImages(article.images).map((img) => ({
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
    if (profileImage !== undefined) updateData.profile_image = storeUrl(profileImage);
    if (bannerImage !== undefined) updateData.banner_image = storeUrl(bannerImage);

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

    // Check if article exists and is published
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("id, published")
      .eq("id", articleId)
      .single();

    if (articleError || !article || !article.published) {
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

    if (content.trim().length > 5000) {
      return res
        .status(400)
        .json({ error: "Comment must be at most 5,000 characters" });
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

    // Add parent_id if it's provided; it must be a comment on this article
    if (parent_id) {
      const parentId = parseInt(parent_id, 10);
      const { data: parentComment } = isNaN(parentId)
        ? { data: null }
        : await supabase
            .from("comments")
            .select("id")
            .eq("id", parentId)
            .eq("article_id", articleId)
            .maybeSingle();
      if (!parentComment) {
        return res.status(400).json({ error: "Invalid parent comment" });
      }
      commentData.parent_id = parentId;
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
      .select("id, view_count, title, status, published")
      .eq("slug", req.params.slug)
      .single();

    if (articleError || !article) {
      console.error("Error finding article:", articleError);
      return res.status(404).json({ error: "Article not found" });
    }

    // Views of drafts (owner, admin or preview) are not readership.
    if (article.status !== "published" && !(article.status == null && article.published)) {
      return res.json({
        success: true,
        counted: false,
        message: "Not counted (article is not published)",
        shouldInvalidateFeeds: false,
        view_count: article.view_count || 0,
      });
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

    // Anonymous readers: a salted hash of the visitor's IP and user agent.
    // No raw IP is stored. On Vercel the visitor IP is the first entry of
    // x-forwarded-for (req.ip would be the proxy).
    if (!clientIdentifier) {
      clientIdentifier = anonymousVisitorId(req);
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

    // Optional page_events log (no-op until the analytics module ships).
    recordPageEvent(supabase, req, { kind: "view", articleId, userId }).catch(() => {});

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

/** `anon-<24 hex>`: sha256(pepper + ip + user agent), pepper = sha256(service key). */
function anonymousVisitorId(req) {
  const first = (v) => String(Array.isArray(v) ? v[0] : v || "").split(",")[0].trim();
  const ip = first(req.headers["x-forwarded-for"]) || first(req.headers["x-real-ip"]) || "unknown";
  const ua = String(req.headers["user-agent"] || "");
  const pepper = createHash("sha256").update(supabaseServiceKey || "np").digest("hex");
  return `anon-${createHash("sha256").update(pepper + ip + ua).digest("hex").slice(0, 24)}`;
}

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

    // Fetch the article to check ownership (numeric id or slug)
    const article = await findArticle(supabase, idOrSlug);

    if (!article) {
      console.error("Article not found:", idOrSlug);
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
    // The slug (and so the URL) changes only when the title actually changes:
    // the inline editor sends the title on every save.
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = storeUrls(content);
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
    let updatedArticle;
    try {
      ({ article: updatedArticle } = await updateArticleFields(supabase, article, updates, { slugMode: "if-title-changed" }));
    } catch (updateError) {
      console.error("Error updating article:", updateError);
      return res.status(500).json({
        message: "Failed to update article",
        details: updateError.message,
      });
    }

    // Handle category relationships if categoryIds is provided
    if (categoryIds && Array.isArray(categoryIds)) {
      await replaceArticleCategories(supabase, article.id, categoryIds);
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

    // Verify that article exists and belongs to this user (numeric id or slug)
    const article = await findArticle(supabase, idOrSlug);

    if (!article) {
      console.error("Article to delete not found:", idOrSlug);
      return res.status(404).json({ message: "Article not found" });
    }

    if (article.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You don't have permission to delete this article" });
    }

    console.log(`Deleting article ${article.id}`);

    try {
      await deleteArticle(supabase, article, { permanent: true });
      console.log(`Successfully deleted article ${article.id}`);
      return res.status(204).send();
    } catch (err) {
      console.error("Error deleting article:", err);
      return res.status(500).json({
        message: "Failed to delete article",
        error: err instanceof Error ? err.message : String(err),
        details: err?.cause ?? err,
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

// Search users by username (admin-only, for the grant UI)
app.get("/api/users/search", async (req, res) => {
  try {
    const uid = await getSupabaseUid(req);
    if (!uid || !(await isAdminUser(uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const q = (req.query.q as string || "").trim();
    if (!q) {
      return res.json([]);
    }

    const { data: users, error } = await supabase
      .from("users")
      .select("id, username")
      .ilike("username", `%${q}%`)
      .limit(10);

    if (error) {
      return res.status(500).json({ error: "Search failed" });
    }

    return res.json(users || []);
  } catch (error) {
    console.error("Error in GET /api/users/search:", error);
    return res.status(500).json({ error: "Server error" });
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
    if (profileImage !== undefined) updates.profile_image = storeUrl(profileImage);
    if (bannerImage !== undefined) updates.banner_image = storeUrl(bannerImage);

    // Update the user
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, username, description, created_at")
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
    if (isNaN(channelId)) {
      return res.status(400).json({ error: "Invalid channel ID" });
    }
    console.log(`API: Fetching subscribers for channel ID: ${channelId}`);

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

    // Only the channel owner (or an admin) may list its subscribers
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("user_id")
      .eq("id", channelId)
      .single();

    if (channelError || !channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    if (
      channel.user_id !== dbUser.id &&
      !(await isAdminUser(userData.user.id))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

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

    if (typeof isLike !== "boolean") {
      return res.status(400).json({ error: "isLike must be a boolean" });
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

    // First, get the article ID from the slug (published articles only)
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", articleSlug)
      .eq("published", true)
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
// An article image URL must be an https: URL or a site path under /media/.
function isAllowedImageUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("/media/")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

app.put("/api/articles/:id/images", async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const { images } = req.body; // Array of { image_url, caption, order }

    if (!Array.isArray(images)) {
      return res.status(400).json({ message: "images must be an array" });
    }
    if (!images.every((img) => isAllowedImageUrl(img?.image_url))) {
      return res.status(400).json({ message: "Invalid image URL" });
    }

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

    // Replace the rows (storage objects are never deleted: the same object
    // can back another article, a body figure or a cached /media URL).
    const rows = images.map((img) => ({
      image_url: storeUrl(img.image_url),
      caption: img.caption,
      order: img.order,
    }));
    try {
      await replaceArticleImages(supabase, articleId, rows);
    } catch (err) {
      console.error("Error replacing images:", err);
      return res.status(500).json({ message: "Failed to update images" });
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
    if (!imageData.every((img) => isAllowedImageUrl(img?.image_url))) {
      return res.status(400).json({ message: "Invalid image URL" });
    }

    const { data: insertedImages, error: insertError } = await supabase
      .from("article_images")
      .insert(
        imageData.map((img) => ({
          article_id: articleId,
          image_url: storeUrl(img.image_url),
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

// Market data endpoint - proxy for stock prices to avoid CORS
app.get("/api/market/stocks", async (req, res) => {
  try {
    const symbols = ["TSLA", "NVDA", "AAPL", "GOOGL", "META", "AMZN", "MSTR"];

    // Map symbols to readable labels
    const symbolLabels: Record<string, string> = {
      TSLA: "Tesla",
      NVDA: "NVIDIA",
      AAPL: "Apple",
      GOOGL: "Alphabet",
      META: "Meta",
      AMZN: "Amazon",
      MSTR: "MicroStrategy",
    };

    const results = [];

    console.log("[Stock API] Fetching stock data for symbols:", symbols);

    for (const symbol of symbols) {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
        );

        if (!response.ok) {
          console.error(`[Stock API] Failed to fetch ${symbol}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const quote = data?.chart?.result?.[0];

        if (!quote) {
          console.error(`[Stock API] No data available for ${symbol}`);
          continue;
        }

        const meta = quote.meta;
        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.chartPreviousClose;
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;

        const stockData = {
          symbol: symbol,
          label: symbolLabels[symbol] || symbol,
          price: currentPrice,
          change: change,
          changePercent: changePercent,
          currency: "$",
        };

        console.log(`[Stock API] Successfully fetched ${symbol}:`, stockData);
        results.push(stockData);
      } catch (error) {
        console.error(`[Stock API] Error fetching ${symbol}:`, error);
      }
    }

    console.log(`[Stock API] Returning ${results.length} stocks out of ${symbols.length} requested`);
    res.json(results);
  } catch (error) {
    console.error("[Stock API] Error fetching stock data:", error);
    res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

// The handler function that routes requests to our Express app
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();

  // Enhanced debugging for Vercel serverless environment
  console.log(`[${requestId}] 🚀 SERVERLESS FUNCTION INVOKED`);
  console.log(`[${requestId}] Method: ${req.method}, URL: ${req.url}`);
  console.log(`[${requestId}] Headers: ${JSON.stringify(redactHeaders(req.headers))}`);
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
      console.log(`[${requestId}] Request body: ${JSON.stringify(redactBody(req.body))}`);
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

// ===================================================================
// Content API v1 — Programmatic article creation
// ===================================================================

// --- API Key Management ---

// Generate a new API key
app.post("/api/v1/api-keys", async (req, res) => {
  try {
    const { userId, error: authError } = await authenticateUser(req);
    if (authError || !userId) {
      return res.status(401).json({ error: authError || "Authentication required" });
    }

    const { name, expiresInDays } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: "Key name is required" });
    }

    const { key, hash, prefix } = generateApiKey();

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: apiKeyRow, error: insertError } = await supabase
      .from("api_keys")
      .insert([{
        key_prefix: prefix,
        key_hash: hash,
        user_id: userId,
        name: name.trim(),
        expires_at: expiresAt,
      }])
      .select()
      .single();

    if (insertError) {
      console.error("Error creating API key:", insertError);
      return res.status(500).json({ error: "Failed to create API key" });
    }

    return res.status(201).json({
      id: apiKeyRow.id,
      key, // Only returned once at creation time
      prefix,
      name: apiKeyRow.name,
      createdAt: apiKeyRow.created_at,
      expiresAt: apiKeyRow.expires_at,
    });
  } catch (error) {
    console.error("Error in POST /api/v1/api-keys:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// List user's API keys
app.get("/api/v1/api-keys", async (req, res) => {
  try {
    const { userId, error: authError } = await authenticateUser(req);
    if (authError || !userId) {
      return res.status(401).json({ error: authError || "Authentication required" });
    }

    const { data: keys, error } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, created_at, last_used_at, expires_at, is_revoked")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error listing API keys:", error);
      return res.status(500).json({ error: "Failed to list API keys" });
    }

    return res.json(keys.map((k: any) => ({
      id: k.id,
      prefix: k.key_prefix,
      name: k.name,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
      expiresAt: k.expires_at,
      isRevoked: k.is_revoked,
    })));
  } catch (error) {
    console.error("Error in GET /api/v1/api-keys:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Revoke an API key
app.delete("/api/v1/api-keys/:id", async (req, res) => {
  try {
    const { userId, error: authError } = await authenticateUser(req);
    if (authError || !userId) {
      return res.status(401).json({ error: authError || "Authentication required" });
    }

    const keyId = req.params.id;

    // Verify the key belongs to the user
    const { data: existing } = await supabase
      .from("api_keys")
      .select("id, user_id")
      .eq("id", keyId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: "API key not found" });
    }
    if (existing.user_id !== userId) {
      return res.status(403).json({ error: "Not authorized to revoke this key" });
    }

    const { error } = await supabase
      .from("api_keys")
      .update({ is_revoked: true })
      .eq("id", keyId);

    if (error) {
      console.error("Error revoking API key:", error);
      return res.status(500).json({ error: "Failed to revoke API key" });
    }

    return res.json({ message: "API key revoked" });
  } catch (error) {
    console.error("Error in DELETE /api/v1/api-keys/:id:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- API Access Management (admin-only) ---

// Helper: get Supabase UUID from request JWT
async function getSupabaseUid(req: express.Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const { data } = await supabaseAuth.auth.getUser(token);
  return data?.user?.id || null;
}

// Helper: check if Supabase UUID is in admin_users
async function isAdminUser(uid: string): Promise<boolean> {
  const { data } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  return !!data;
}

// List users with API access
app.get("/api/v1/api-access-users", async (req, res) => {
  try {
    const uid = await getSupabaseUid(req);
    if (!uid || !(await isAdminUser(uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { data: grants, error } = await supabase
      .from("api_access_users")
      .select("user_id, created_at, granted_by")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Failed to list API access users" });
    }

    // Look up usernames for each granted user
    const results = [];
    for (const grant of grants || []) {
      const { data: authUser } = await supabase
        .from("users")
        .select("id, username")
        .eq("supabase_uid", grant.user_id)
        .maybeSingle();

      results.push({
        supabaseUid: grant.user_id,
        username: authUser?.username || "Unknown",
        localUserId: authUser?.id,
        grantedAt: grant.created_at,
      });
    }

    return res.json(results);
  } catch (error) {
    console.error("Error in GET /api/v1/api-access-users:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Grant API access to a user by username
app.post("/api/v1/api-access-users", async (req, res) => {
  try {
    const uid = await getSupabaseUid(req);
    if (!uid || !(await isAdminUser(uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { username } = req.body;
    if (!username?.trim()) {
      return res.status(400).json({ error: "Username is required" });
    }

    // Find the user by username
    const { data: dbUser } = await supabase
      .from("users")
      .select("id, username, supabase_uid")
      .eq("username", username.trim())
      .maybeSingle();

    if (!dbUser || !dbUser.supabase_uid) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already granted
    const { data: existing } = await supabase
      .from("api_access_users")
      .select("user_id")
      .eq("user_id", dbUser.supabase_uid)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "User already has API access" });
    }

    // Grant access
    const { error: insertError } = await supabase
      .from("api_access_users")
      .insert([{ user_id: dbUser.supabase_uid, granted_by: uid }]);

    if (insertError) {
      console.error("Error granting API access:", insertError);
      return res.status(500).json({ error: "Failed to grant API access" });
    }

    return res.status(201).json({
      supabaseUid: dbUser.supabase_uid,
      username: dbUser.username,
      localUserId: dbUser.id,
    });
  } catch (error) {
    console.error("Error in POST /api/v1/api-access-users:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Revoke API access
app.delete("/api/v1/api-access-users/:userId", async (req, res) => {
  try {
    const uid = await getSupabaseUid(req);
    if (!uid || !(await isAdminUser(uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const targetUid = req.params.userId;
    const { error } = await supabase
      .from("api_access_users")
      .delete()
      .eq("user_id", targetUid);

    if (error) {
      console.error("Error revoking API access:", error);
      return res.status(500).json({ error: "Failed to revoke API access" });
    }

    return res.json({ message: "API access revoked" });
  } catch (error) {
    console.error("Error in DELETE /api/v1/api-access-users:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- Content API Helpers ---

// Create a single article (shared logic for single and batch endpoints)
async function createSingleArticle(
  articleData: any,
  userId: number
): Promise<any> {
  const {
    title,
    content,
    contentFormat = "markdown",
    channelId,
    categoryIds = [],
    location,
    locationLat,
    locationLng,
    published = true,
    excerpt,
  } = articleData;

  // Validation
  if (!title?.trim()) throw new Error("Title is required");
  if (!content?.trim()) throw new Error("Content is required");
  if (!channelId) throw new Error("channelId is required");
  if (categoryIds.length > 3) throw new Error("Maximum 3 categories allowed");
  const imageFields = parseImageFields(articleData);
  if (imageFields.error) throw new Error(imageFields.error);
  if (excerpt !== undefined && excerpt !== null && (typeof excerpt !== "string" || excerpt.length > 300)) {
    throw new Error("excerpt must be a string of at most 300 characters");
  }

  // Convert content to HTML (our /media URLs stored as public bucket URLs)
  let htmlContent = storeUrls(normalizeContent(content, contentFormat));
  if (typeof excerpt === "string" && excerpt.trim()) htmlContent = setDek(htmlContent, excerpt);

  // Verify channel ownership
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("id, user_id")
    .eq("id", channelId)
    .single();

  if (channelError || !channel) {
    throw new Error("Channel not found");
  }
  if (channel.user_id !== userId) {
    throw new Error("Not authorized for this channel");
  }

  // Duplicate detection (same title + channel in last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existingArticles } = await supabase
    .from("articles")
    .select("id, title")
    .eq("channel_id", channelId)
    .eq("title", title.trim())
    .gte("created_at", oneDayAgo);

  if (existingArticles && existingArticles.length > 0) {
    const err: any = new Error(
      `Duplicate: "${title}" already published to this channel in the last 24 hours`
    );
    err.status = 409;
    err.existingArticleId = existingArticles[0].id;
    throw err;
  }

  // Generate slug
  const baseSlug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60);
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  let fullSlug = `${dateStr}-${baseSlug}`;

  // Handle slug collisions
  let slugAttempt = 0;
  let slugOk = false;
  while (!slugOk && slugAttempt < 10) {
    const candidateSlug = slugAttempt === 0 ? fullSlug : `${fullSlug}-${slugAttempt + 1}`;
    const { data: existing } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", candidateSlug)
      .single();
    if (!existing) {
      fullSlug = candidateSlug;
      slugOk = true;
    } else {
      slugAttempt++;
    }
  }

  // Images: the attached list (legacy `images`, or coverImage + gallery) and
  // every external body image are downloaded once per photo and stored by
  // content, so a photo sent both as an image and in the body is one object
  // and renders once. Lenient on create: a failed image is skipped (attached)
  // or keeps its URL (body), and is reported in `warnings`.
  const attached = imageFields.legacy
    ? imageFields.legacy
    : [...(imageFields.cover ? [imageFields.cover] : []), ...(imageFields.gallery || [])];
  const media = await ingestArticleMedia(supabase, { attached, html: htmlContent, supabaseUrl });
  htmlContent = media.html;
  const warnings = [...imageFields.warnings, ...media.failures, ...media.warnings];

  // Build article record
  const articleRecord: any = {
    title: title.trim(),
    content: htmlContent,
    channel_id: channelId,
    user_id: userId,
    category: "",
    slug: fullSlug,
    published,
    status: published ? "published" : "draft",
    view_count: 0,
    location: location || null,
    location_name: location || null,
    location_lat: locationLat || null,
    location_lng: locationLng || null,
  };

  if (locationLat && locationLng) {
    articleRecord.geom = `SRID=4326;POINT(${locationLng} ${locationLat})`;
  }

  // Insert article
  const { data: article, error: createError } = await supabase
    .from("articles")
    .insert([articleRecord])
    .select()
    .single();

  if (createError || !article) {
    throw new Error(`Failed to create article: ${createError?.message || "Unknown error"}`);
  }

  // Handle categories
  const categoryResults = [];
  for (let i = 0; i < categoryIds.length; i++) {
    const { error: catError } = await supabase
      .from("article_categories")
      .insert([{
        article_id: article.id,
        category_id: categoryIds[i],
        is_primary: i === 0,
      }]);
    if (!catError) {
      categoryResults.push(categoryIds[i]);
    }
  }

  // Update the category text field with the primary category name
  if (categoryIds.length > 0) {
    const { data: catData } = await supabase
      .from("categories")
      .select("name")
      .eq("id", categoryIds[0])
      .single();
    if (catData) {
      await supabase
        .from("articles")
        .update({ category: catData.name })
        .eq("id", article.id);
    }
  }

  // Attach the stored images (cover first). Legacy callers may set `order`.
  let processedImages: any[] = [];
  if (media.rows.length > 0) {
    const orderByField = new Map(attached.map((img: any, i: number) => [img.field, img.order ?? i]));
    try {
      processedImages = await replaceArticleImages(
        supabase,
        article.id,
        media.rows.map((r: any) => ({ image_url: r.image_url, caption: r.caption, order: orderByField.get(r.field) })),
        { renumber: !imageFields.legacy }
      );
    } catch (err) {
      console.error("Error attaching images:", err);
      warnings.push({ field: "images", url: "", reason: "attach_failed" });
    }
  }
  const sortedImages = sortImages(processedImages);
  const asImage = (r: any) => ({ url: r.image_url, caption: r.caption || "" });

  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    channelId: article.channel_id,
    status: article.status,
    published: article.published,
    createdAt: article.created_at,
    url: `/articles/${article.id}/${article.slug}`,
    images: processedImages,
    categories: categoryResults,
    coverImage: sortedImages[0] ? asImage(sortedImages[0]) : null,
    gallery: sortedImages.slice(1).map(asImage),
    excerpt: deriveExcerpt(article.content || htmlContent),
    warnings,
  };
}

// Admin: set engagement counters on an article. view_count is the article's
// absolute view total; admin_like_count / admin_dislike_count are added on
// top of real user reactions everywhere totals are computed.
app.post("/api/v1/admin/articles/:id/engagement", async (req, res) => {
  try {
    const uid = await getSupabaseUid(req);
    if (!uid || !(await isAdminUser(uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const articleId = parseInt(req.params.id);
    if (!articleId) {
      return res.status(400).json({ error: "Invalid article id" });
    }

    const { viewCount, adminLikeCount, adminDislikeCount } = req.body || {};
    const updates: any = {};
    if (viewCount !== undefined)
      updates.view_count = Math.max(0, parseInt(viewCount) || 0);
    if (adminLikeCount !== undefined)
      updates.admin_like_count = Math.max(0, parseInt(adminLikeCount) || 0);
    if (adminDislikeCount !== undefined)
      updates.admin_dislike_count = Math.max(0, parseInt(adminDislikeCount) || 0);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No engagement fields provided" });
    }

    const { data: article, error } = await supabase
      .from("articles")
      .update(updates)
      .eq("id", articleId)
      .select("id, title, view_count, admin_like_count, admin_dislike_count")
      .single();

    if (error || !article) {
      return res.status(404).json({ error: "Article not found or update failed" });
    }

    return res.json(article);
  } catch (error) {
    console.error("Error in POST /api/v1/admin/articles/:id/engagement:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- Content API Endpoints ---
//
// Every error body is { error, code } (plus extra fields where noted). Codes:
// validation_failed, not_found, channel_forbidden, channel_not_found,
// duplicate_title, image_failed, unauthorized, server_error.

function v1Error(res: any, status: number, code: string, error: string, extra: any = {}) {
  return res.status(status).json({ error, code, ...extra });
}

/** Error thrown by createSingleArticle -> status, code and body. */
function v1CreateError(error: any) {
  if (error?.status === 409) {
    return {
      status: 409,
      body: {
        error: "Duplicate article detected",
        code: "duplicate_title",
        message: error.message,
        existingArticleId: error.existingArticleId,
      },
    };
  }
  const message = error?.message || "Server error";
  if (message.includes("Not authorized")) return { status: 403, body: { error: message, code: "channel_forbidden" } };
  if (message.includes("not found")) return { status: 404, body: { error: message, code: "channel_not_found" } };
  if (message.startsWith("Failed to create article")) return { status: 400, body: { error: message, code: "server_error" } };
  return { status: 400, body: { error: message, code: "validation_failed" } };
}

async function v1Auth(req: any, res: any): Promise<number | null> {
  const { userId, error: authError } = await authenticateRequest(req);
  if (authError || !userId) {
    v1Error(res, 401, "unauthorized", authError || "Authentication required");
    return null;
  }
  return userId;
}

/** The caller's article, or null after sending the same 404 for missing and not-owned. */
async function v1OwnedArticle(req: any, res: any, userId: number) {
  const article = await findArticle(supabase, req.params.id);
  if (!article || article.user_id !== userId) {
    v1Error(res, 404, "not_found", "Article not found");
    return null;
  }
  return article;
}

const v1Serialize = (article: any, extra: any = {}) =>
  serializeArticle(supabase, article, { previewSecret: supabaseServiceKey, ...extra });

// Create a single article
app.post("/api/v1/content/articles", async (req, res) => {
  try {
    const userId = await v1Auth(req, res);
    if (!userId) return;

    const result = await createSingleArticle(req.body, userId);
    if (!result.published) {
      result.previewUrl = `${result.url}?preview=${previewToken(result.id, supabaseServiceKey)}`;
    }
    return res.status(201).json(result);
  } catch (error: any) {
    console.error("Error in POST /api/v1/content/articles:", error);
    const { status, body } = v1CreateError(error);
    return res.status(status).json(body);
  }
});

// Batch create articles
app.post("/api/v1/content/articles/batch", async (req, res) => {
  try {
    const userId = await v1Auth(req, res);
    if (!userId) return;

    const { articles } = req.body;
    if (!Array.isArray(articles) || articles.length === 0) {
      return v1Error(res, 400, "validation_failed", "articles array is required");
    }
    if (articles.length > 10) {
      return v1Error(res, 400, "validation_failed", "Maximum 10 articles per batch request");
    }

    const created: any[] = [];
    const failed: any[] = [];

    for (let i = 0; i < articles.length; i++) {
      try {
        const result = await createSingleArticle(articles[i], userId);
        created.push({ index: i, ...result });
      } catch (err: any) {
        failed.push({ index: i, title: articles[i]?.title || "Unknown", error: err.message, code: v1CreateError(err).body.code });
      }
    }

    return res.status(201).json({
      created,
      failed,
      summary: {
        total: articles.length,
        succeeded: created.length,
        failed: failed.length,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/v1/content/articles/batch:", error);
    return v1Error(res, 500, "server_error", "Server error");
  }
});

// Get article details (the caller's own articles only; others are 404)
app.get("/api/v1/content/articles/:id", async (req, res) => {
  try {
    const userId = await v1Auth(req, res);
    if (!userId) return;
    const article = await v1OwnedArticle(req, res, userId);
    if (!article) return;
    return res.json(await v1Serialize(article));
  } catch (error) {
    console.error("Error in GET /api/v1/content/articles/:id:", error);
    return v1Error(res, 500, "server_error", "Server error");
  }
});

const PATCH_FIELDS = [
  "title", "regenerateSlug", "content", "contentFormat", "excerpt", "channelId", "categoryIds",
  "location", "locationLat", "locationLng", "published", "coverImage", "gallery", "images",
];

/**
 * Validate a PATCH body. Returns an error message, or null.
 * Omitted fields are left alone; null clears where the docs say so.
 */
function validateV1Patch(body: any): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object";
  if (!PATCH_FIELDS.some((f) => f !== "contentFormat" && f !== "regenerateSlug" && body[f] !== undefined) && body.regenerateSlug !== true) {
    return "No updatable fields provided";
  }
  const { title, regenerateSlug, content, contentFormat, excerpt, channelId, categoryIds, location, locationLat, locationLng, published } = body;
  if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 300)) return "title must be a non-empty string of at most 300 characters";
  if (regenerateSlug !== undefined && typeof regenerateSlug !== "boolean") return "regenerateSlug must be a boolean";
  if (content !== undefined && (typeof content !== "string" || !content.trim())) return "content must be a non-empty string";
  if (contentFormat !== undefined && !["markdown", "html", "auto"].includes(contentFormat)) return 'contentFormat must be "markdown", "html" or "auto"';
  if (excerpt !== undefined && excerpt !== null && (typeof excerpt !== "string" || excerpt.length > 300)) return "excerpt must be a string of at most 300 characters, or null";
  if (channelId !== undefined && !(Number.isInteger(channelId) && channelId > 0)) return "channelId must be a positive integer";
  if (categoryIds !== undefined) {
    if (!Array.isArray(categoryIds) || !categoryIds.every((c) => Number.isInteger(c) && c > 0)) return "categoryIds must be an array of category ids";
    if (categoryIds.length > 3) return "Maximum 3 categories allowed";
  }
  if (location !== undefined && location !== null && typeof location !== "string") return "location must be a string or null";
  for (const [name, v] of [["locationLat", locationLat], ["locationLng", locationLng]]) {
    if (v !== undefined && v !== null && (typeof v !== "number" || !Number.isFinite(v))) return `${name} must be a number or null`;
  }
  if (published !== undefined && typeof published !== "boolean") return "published must be a boolean";
  return null;
}

// Update an article (the caller's own; others are 404)
app.patch("/api/v1/content/articles/:id", async (req, res) => {
  try {
    const userId = await v1Auth(req, res);
    if (!userId) return;
    const body = req.body || {};
    const invalid = validateV1Patch(body);
    const article = await v1OwnedArticle(req, res, userId);
    if (!article) return;
    if (invalid) return v1Error(res, 400, "validation_failed", invalid);
    const imageFields = parseImageFields(body);
    if (imageFields.error) return v1Error(res, 400, "validation_failed", imageFields.error);

    // Channel move: must exist and belong to the key's user.
    if (body.channelId !== undefined && body.channelId !== article.channel_id) {
      const { data: channel } = await supabase.from("channels").select("id, user_id").eq("id", body.channelId).maybeSingle();
      if (!channel) return v1Error(res, 404, "channel_not_found", "Channel not found");
      if (channel.user_id !== userId) return v1Error(res, 403, "channel_forbidden", "Not authorized for this channel");
    }

    // Body: converted like create; the standfirst is carried across a
    // content replace unless the new body has its own or `excerpt` is sent.
    let html: string | undefined;
    if (body.content !== undefined) {
      const format = body.contentFormat === "auto" ? undefined : body.contentFormat || "markdown";
      html = storeUrls(normalizeContent(body.content, format));
      const oldDek = extractDek(article.content || "").dek;
      if (body.excerpt === undefined && oldDek && !extractDek(html).dek) html = setDek(html, oldDek);
    }
    if (body.excerpt !== undefined) html = setDek(html ?? article.content ?? "", body.excerpt);

    // Images. coverImage alone keeps the gallery; gallery alone keeps the cover.
    const imagesTouched = imageFields.legacy !== undefined || imageFields.cover !== undefined || imageFields.gallery !== undefined;
    const warnings: any[] = [...imageFields.warnings];
    let target: any[] | null = null; // [{ url, caption, field, existing? }]
    if (imagesTouched) {
      if (imageFields.legacy) target = imageFields.legacy;
      else {
        const { data: currentRows } = await supabase.from("article_images").select("*").eq("article_id", article.id);
        const current = sortImages(currentRows || []).map((r: any, i: number) => ({
          url: r.image_url,
          caption: r.caption || "",
          field: i === 0 ? "coverImage" : `gallery[${i - 1}]`,
          existing: true,
        }));
        let cover = imageFields.cover !== undefined ? imageFields.cover : current[0] || null;
        const gallery = imageFields.gallery !== undefined ? imageFields.gallery : current.slice(1);
        target = cover ? [cover, ...gallery] : [...gallery];
        if (!cover && gallery.length) warnings.push({ field: "coverImage", url: gallery[0].url, reason: "cover_promoted_from_gallery" });
        if (target.length > 5) return v1Error(res, 400, "validation_failed", "Maximum 5 images allowed (cover included)");
      }
    }

    // Download everything first. Attached images are all-or-nothing; body
    // images that fail keep their URL and become warnings.
    const fresh = (target || []).filter((img: any) => !img.existing);
    const media = await ingestArticleMedia(supabase, {
      attached: fresh,
      html: html ?? "",
      supabaseUrl,
      rehostBody: html !== undefined && body.content !== undefined,
    });
    if (media.failures.length) {
      return v1Error(res, 422, "image_failed", "One or more images could not be downloaded; nothing was changed", {
        details: media.failures,
      });
    }
    if (html !== undefined) html = media.html;
    warnings.push(...media.warnings);

    // Write the article row.
    const fields: any = {};
    if (body.title !== undefined) fields.title = body.title.trim();
    if (html !== undefined) fields.content = html;
    if (body.channelId !== undefined) fields.channel_id = body.channelId;
    if (body.location !== undefined) {
      fields.location = body.location;
      fields.location_name = body.location;
    }
    if (body.locationLat !== undefined) fields.location_lat = body.locationLat;
    if (body.locationLng !== undefined) fields.location_lng = body.locationLng;
    if (body.locationLat !== undefined || body.locationLng !== undefined) {
      const lat = body.locationLat !== undefined ? body.locationLat : article.location_lat;
      const lng = body.locationLng !== undefined ? body.locationLng : article.location_lng;
      fields.geom = typeof lat === "number" && typeof lng === "number" ? `SRID=4326;POINT(${lng} ${lat})` : null;
    }
    if (body.published !== undefined) fields.status = body.published ? "published" : "draft";
    if (body.categoryIds !== undefined) {
      let primaryName = "";
      if (body.categoryIds.length) {
        const { data: cat } = await supabase.from("categories").select("name").eq("id", body.categoryIds[0]).maybeSingle();
        primaryName = cat?.name || "";
      }
      fields.category = primaryName;
    }

    const { article: updated, previousSlug } = await updateArticleFields(supabase, article, fields, {
      slugMode: body.regenerateSlug === true ? "regenerate" : "keep",
    });
    if (body.categoryIds !== undefined) await replaceArticleCategories(supabase, article.id, body.categoryIds);
    if (target) {
      const freshByField = new Map(media.rows.map((r: any) => [r.field, r]));
      const rows = target.map((img: any) => ({
        image_url: img.existing ? storeUrl(img.url) : freshByField.get(img.field).image_url,
        caption: img.caption || "",
      }));
      await replaceArticleImages(supabase, article.id, rows, { renumber: true });
    }

    return res.json(await v1Serialize(updated, { previousSlug, warnings }));
  } catch (error) {
    console.error("Error in PATCH /api/v1/content/articles/:id:", error);
    return v1Error(res, 500, "server_error", "Server error");
  }
});

// Delete an article: unpublish by default, ?permanent=true to delete,
// ?dryRun=true to report what would happen. Storage objects are kept.
app.delete("/api/v1/content/articles/:id", async (req, res) => {
  try {
    const userId = await v1Auth(req, res);
    if (!userId) return;
    const article = await v1OwnedArticle(req, res, userId);
    if (!article) return;
    const permanent = String(req.query.permanent || "") === "true";
    const restore = `PATCH /api/v1/content/articles/${article.id} {"published": true}`;

    if (String(req.query.dryRun || "") === "true") {
      return res.json({
        id: article.id,
        dryRun: true,
        action: permanent ? "delete" : "unpublish",
        currentStatus: article.status,
        ...(permanent
          ? { note: "Deletes the article, its comments, reactions, image rows and categories. Storage objects are kept." }
          : { restore }),
      });
    }

    const result = await deleteArticle(supabase, article, { permanent });
    return res.json(permanent ? result : { ...result, restore });
  } catch (error) {
    console.error("Error in DELETE /api/v1/content/articles/:id:", error);
    return v1Error(res, 500, "server_error", "Server error");
  }
});

// List user's channels
app.get("/api/v1/content/channels", async (req, res) => {
  try {
    const { userId, error: authError } = await authenticateRequest(req);
    if (authError || !userId) {
      return res.status(401).json({ error: authError || "Authentication required", code: "unauthorized" });
    }

    const { data: channels, error } = await supabase
      .from("channels")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch channels" });
    }

    // Enrich with article counts and subscriber counts
    const enriched = await Promise.all(
      (channels || []).map(async (ch: any) => {
        const { count: articleCount } = await supabase
          .from("articles")
          .select("*", { count: "exact", head: true })
          .eq("channel_id", ch.id)
          .eq("published", true);

        const { count: subscriberCount } = await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("channel_id", ch.id);

        return {
          id: ch.id,
          name: ch.name,
          slug: ch.slug,
          description: ch.description,
          category: ch.category,
          articleCount: articleCount || 0,
          subscriberCount: (subscriberCount || 0) + (ch.admin_subscriber_count || 0),
        };
      })
    );

    return res.json(enriched);
  } catch (error) {
    console.error("Error in GET /api/v1/content/channels:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// List available categories (hierarchical)
app.get("/api/v1/content/categories", async (req, res) => {
  try {
    // Categories are public, but still require auth for API consistency
    const { userId, error: authError } = await authenticateRequest(req);
    if (authError || !userId) {
      return res.status(401).json({ error: authError || "Authentication required", code: "unauthorized" });
    }

    const { data: categories, error } = await supabase
      .from("categories")
      .select("*")
      .order("name");

    if (error) {
      return res.status(500).json({ error: "Failed to fetch categories" });
    }

    // Build hierarchical tree
    const categoryMap = new Map<number, any>();
    const roots: any[] = [];

    for (const cat of categories || []) {
      categoryMap.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of categories || []) {
      const node = categoryMap.get(cat.id);
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        categoryMap.get(cat.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return res.json(roots);
  } catch (error) {
    console.error("Error in GET /api/v1/content/categories:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---- Homepage algorithm settings ----
// Single-row (id = 1) settings that drive how the homepage picks the hero and
// ranks stories. GET is public (the homepage reads it); PUT is admin-only.
const HOMEPAGE_SETTINGS_DEFAULTS = {
  heroMode: "recency_most_read",
  heroRecencyHours: 24,
  featuredArticleId: null as number | null,
  mostReadWindow: "7d",
  showReadingNow: true,
};

function mapHomepageSettingsRow(row: any) {
  if (!row) return { ...HOMEPAGE_SETTINGS_DEFAULTS };
  return {
    heroMode: row.hero_mode ?? HOMEPAGE_SETTINGS_DEFAULTS.heroMode,
    heroRecencyHours:
      row.hero_recency_hours ?? HOMEPAGE_SETTINGS_DEFAULTS.heroRecencyHours,
    featuredArticleId: row.featured_article_id ?? null,
    mostReadWindow:
      row.most_read_window ?? HOMEPAGE_SETTINGS_DEFAULTS.mostReadWindow,
    showReadingNow:
      row.show_reading_now ?? HOMEPAGE_SETTINGS_DEFAULTS.showReadingNow,
  };
}

// Returns an error message if the PUT body is invalid, else null.
function validateHomepageSettingsBody(body: any): string | null {
  const HERO_MODES = [
    "recency_most_read",
    "newest",
    "most_read_all_time",
    "manual",
    "manual_sponsored",
  ];
  const MOST_READ_WINDOWS = ["24h", "7d", "30d", "all"];
  if (body.heroMode !== undefined && !HERO_MODES.includes(body.heroMode))
    return "Invalid heroMode";
  if (
    body.mostReadWindow !== undefined &&
    !MOST_READ_WINDOWS.includes(body.mostReadWindow)
  )
    return "Invalid mostReadWindow";
  if (body.heroRecencyHours !== undefined) {
    const n = Number(body.heroRecencyHours);
    if (!Number.isInteger(n) || n < 1 || n > 24 * 30)
      return "Invalid heroRecencyHours";
  }
  if (body.featuredArticleId !== undefined && body.featuredArticleId !== null) {
    const n = Number(body.featuredArticleId);
    if (!Number.isInteger(n) || n < 1) return "Invalid featuredArticleId";
  }
  if (
    body.showReadingNow !== undefined &&
    typeof body.showReadingNow !== "boolean"
  )
    return "Invalid showReadingNow";
  return null;
}

// Get homepage algorithm settings (public)
app.get("/api/homepage/settings", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("homepage_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("Error fetching homepage settings:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch homepage settings" });
    }
    return res.json(mapHomepageSettingsRow(data));
  } catch (error) {
    console.error("Error in GET /api/homepage/settings:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Update homepage algorithm settings (admin-only)
app.put("/api/homepage/settings", async (req, res) => {
  try {
    const uid = await getSupabaseUid(req);
    if (!uid || !(await isAdminUser(uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const body = req.body || {};
    const validationError = validateHomepageSettingsBody(body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    if (
      body.featuredArticleId !== undefined &&
      body.featuredArticleId !== null
    ) {
      const { data: art } = await supabase
        .from("articles")
        .select("id")
        .eq("id", Number(body.featuredArticleId))
        .maybeSingle();
      if (!art) {
        return res.status(400).json({ error: "Featured article not found" });
      }
    }
    const updates: Record<string, any> = {
      id: 1,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    };
    if (body.heroMode !== undefined) updates.hero_mode = body.heroMode;
    if (body.heroRecencyHours !== undefined)
      updates.hero_recency_hours = Number(body.heroRecencyHours);
    if (body.featuredArticleId !== undefined)
      updates.featured_article_id =
        body.featuredArticleId === null ? null : Number(body.featuredArticleId);
    if (body.mostReadWindow !== undefined)
      updates.most_read_window = body.mostReadWindow;
    if (body.showReadingNow !== undefined)
      updates.show_reading_now = body.showReadingNow;

    const { data, error } = await supabase
      .from("homepage_settings")
      .upsert([updates])
      .select()
      .single();

    if (error) {
      console.error("Error updating homepage settings:", error);
      return res
        .status(500)
        .json({ error: "Failed to update homepage settings" });
    }
    return res.json(mapHomepageSettingsRow(data));
  } catch (error) {
    console.error("Error in PUT /api/homepage/settings:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---- SEO: sitemap + RSS feeds ----
// Served via vercel.json rewrites (/sitemap.xml, /rss.xml, /channels/:id/rss.xml).
const SITE_BASE = "https://www.newsplatform.org"; // canonical host (apex 308s here)
// Last content change to the static marketing pages (see
// client/src/content/marketing.ts LAST_UPDATED_ISO).
const PAGES_LASTMOD = "2026-10-21";

function xmlEscape(s: any): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rssItemXml(a: any): string {
  const link = `${SITE_BASE}/articles/${a.id}${a.slug ? `/${a.slug}` : ""}`;
  const desc = String(a.content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const pub = a.published_at || a.created_at;
  return `<item><title>${xmlEscape(a.title)}</title><link>${xmlEscape(link)}</link><guid isPermaLink="true">${xmlEscape(link)}</guid>${
    pub ? `<pubDate>${new Date(pub).toUTCString()}</pubDate>` : ""
  }${a.category ? `<category>${xmlEscape(a.category)}</category>` : ""}<description>${xmlEscape(desc)}</description></item>`;
}

function rssFeedXml(title: string, link: string, description: string, items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${xmlEscape(title)}</title><link>${xmlEscape(link)}</link><description>${xmlEscape(description)}</description><language>en</language>${items}</channel></rss>`;
}

app.get("/sitemap.xml", async (req, res) => {
  try {
    const { data: articles } = await supabase
      .from("articles")
      .select("id, slug, created_at, published_at, last_edited")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(5000);
    const { data: channels } = await supabase.from("channels").select("id");

    const urls: string[] = [
      `<url><loc>${SITE_BASE}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${SITE_BASE}/channels</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,
      // Prerendered marketing pages — keep in sync with
      // client/src/content/marketing.ts (MARKETING_PAGES).
      `<url><loc>${SITE_BASE}/about</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${SITE_BASE}/how-it-works</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${SITE_BASE}/for-writers</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${SITE_BASE}/faq</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${SITE_BASE}/compare</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${SITE_BASE}/compare/substack</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${SITE_BASE}/compare/medium</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${SITE_BASE}/compare/ghost</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${SITE_BASE}/alternatives</loc><lastmod>${PAGES_LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${SITE_BASE}/api</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
      `<url><loc>${SITE_BASE}/advertise</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
      `<url><loc>${SITE_BASE}/privacy</loc><priority>0.2</priority></url>`,
      `<url><loc>${SITE_BASE}/terms</loc><priority>0.2</priority></url>`,
    ];
    for (const c of channels || []) {
      urls.push(
        `<url><loc>${SITE_BASE}/channels/${c.id}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`
      );
    }
    for (const a of articles || []) {
      // last_edited is bumped by every view (shared/article-media.js,
      // LAST_EDITED_IS_TRUSTWORTHY), so the publish date is the honest lastmod.
      const modified = LAST_EDITED_IS_TRUSTWORTHY ? a.last_edited : null;
      const lastmod = String(modified || a.published_at || a.created_at || "").slice(0, 10);
      const loc = `${SITE_BASE}/articles/${a.id}${a.slug ? `/${xmlEscape(a.slug)}` : ""}`;
      urls.push(
        `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<priority>0.8</priority></url>`
      );
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
  } catch (e) {
    console.error("Error generating sitemap:", e);
    return res.status(500).end();
  }
});

app.get("/rss.xml", async (req, res) => {
  try {
    const { data: articles } = await supabase
      .from("articles")
      .select("id, slug, title, content, category, created_at, published_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(50);
    const items = (articles || []).map(rssItemXml).join("");
    const xml = rssFeedXml(
      "NewsPlatform",
      SITE_BASE,
      "Today's top stories from independent channels on NewsPlatform.",
      items
    );
    res.setHeader("Content-Type", "application/rss+xml");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).send(xml);
  } catch (e) {
    console.error("Error generating RSS:", e);
    return res.status(500).end();
  }
});

app.get("/channels/:id/rss.xml", async (req, res) => {
  try {
    const idMatch = String(req.params.id || "").match(/(\d+)$/);
    if (!idMatch) return res.status(404).end();
    const channelId = parseInt(idMatch[1], 10);

    const { data: channel } = await supabase
      .from("channels")
      .select("id, name, description")
      .eq("id", channelId)
      .maybeSingle();
    if (!channel) return res.status(404).end();

    const { data: articles } = await supabase
      .from("articles")
      .select("id, slug, title, content, category, created_at, published_at")
      .eq("channel_id", channelId)
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(50);

    const items = (articles || []).map(rssItemXml).join("");
    const xml = rssFeedXml(
      `${channel.name} — NewsPlatform`,
      `${SITE_BASE}/channels/${channel.id}`,
      channel.description || `Latest articles from ${channel.name} on NewsPlatform.`,
      items
    );
    res.setHeader("Content-Type", "application/rss+xml");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).send(xml);
  } catch (e) {
    console.error("Error generating channel RSS:", e);
    return res.status(500).end();
  }
});

// AI Integration Endpoint - public access to latest published stories
// No authentication required for AI tools to access
app.get("/api/ai/latest-stories", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || 20), 10), 100);
    const offset = Math.max(parseInt(String(req.query.offset || 0), 10), 0);
    const category = req.query.category ? String(req.query.category) : null;

    let query = supabase
      .from("articles")
      .select(`
        id,
        title,
        slug,
        content,
        category,
        location,
        published_at,
        created_at,
        channel:channels (
          id,
          name,
          slug,
          description
        )
      `)
      .eq("published", true)
      .order("published_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: articles, error } = await query;

    if (error) throw error;

    const response = {
      success: true,
      meta: {
        limit,
        offset,
        count: articles?.length || 0,
        category: category || "all",
      },
      data: (articles || []).map((article) => {
        const channel = Array.isArray(article.channel) ? article.channel[0] : article.channel;
        return {
          id: article.id,
          title: article.title,
          slug: article.slug,
          url: `https://www.newsplatform.org/articles/${article.id}${article.slug ? `/${article.slug}` : ""}`,
          excerpt: article.content ? article.content.substring(0, 300).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() + '...' : '',
          category: article.category,
          location: article.location,
          published_at: article.published_at || article.created_at,
          channel: {
            id: channel?.id,
            name: channel?.name,
            slug: channel?.slug,
            description: channel?.description,
            url: channel?.id ? `https://www.newsplatform.org/channels/${channel.id}` : null,
          },
        };
      }),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(response);
  } catch (e) {
    console.error("Error in AI integration endpoint:", e);
    return res.status(500).json({ 
      success: false, 
      error: "Failed to fetch stories" 
    });
  }
});
