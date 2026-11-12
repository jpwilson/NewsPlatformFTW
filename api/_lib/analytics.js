/**
 * Analytics: what is being read, by whom (in aggregate) and from where.
 *
 *   registerAnalyticsRoutes(app, { supabase, getSupabaseUid, isAdminUser })
 *     GET  /api/v1/admin/analytics?range=24h|7d|30d|90d&tz=<minutes east of UTC>
 *          Admin only. One response feeds the whole Analytics tab.
 *     POST /api/t
 *          Public beacon: one page view or one read-through. Validated,
 *          capped, one small insert, no reads.
 *
 *   recordPageEvent(sb, req, fields)
 *     Writes one row to public.page_events. Never throws and never holds a
 *     response for more than 250 ms. If the table is missing it switches
 *     itself off for ten minutes.
 *
 * Sources of truth:
 *   - Reads are `article_views` rows: one per article per reader, written by
 *     POST /api/articles/:slug/view on a reader's first visit.
 *   - `articles.view_count` is reported separately as "shown on site" because
 *     an admin can set it by hand (/api/v1/admin/articles/:id/engagement).
 *   - Sources, countries, devices, crawlers and read-through come from
 *     `page_events` (optional; `traffic` is null when the table is missing).
 *
 * Privacy: no raw IP is ever stored or returned. `visitor` is a hash of a
 * daily salt, the IP and the user agent, so it cannot be joined across days.
 * `article_views.client_identifier` is used only to count distinct readers.
 *
 * Plain ESM with no npm imports (bundled into api/index.ts by esbuild, and
 * loadable by the offline tests). Types: analytics.d.ts.
 */

import { createHash } from "node:crypto";

/* ------------------------------------------------------------ constants */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** range -> { days, bucket }. "24h" is the last 24 hours by hour. */
export const RANGES = {
  "24h": { days: 1, bucket: "hour" },
  "7d": { days: 7, bucket: "day" },
  "30d": { days: 30, bucket: "day" },
  "90d": { days: 90, bucket: "day" },
};

const PAGE_SIZE = 1000; // PostgREST's default max-rows
const MAX_PAGES = 50; // hard cap per table read: 50,000 rows
const CACHE_MS = 60_000;
const OFF_MS = 10 * 60_000;
const WRITE_TIMEOUT_MS = 250;
const TOP_N = 10;

const SITE_HOSTS = new Set(["newsplatform.org", "www.newsplatform.org", "localhost", "127.0.0.1"]);

/** Crawler user agents, most specific first: [pattern, name, isAi]. */
const BOTS = [
  [/ChatGPT-User/i, "ChatGPT (user)", true],
  [/OAI-SearchBot/i, "ChatGPT search", true],
  [/GPTBot/i, "GPTBot (OpenAI)", true],
  [/Claude-User/i, "Claude (user)", true],
  [/Claude-SearchBot/i, "Claude search", true],
  [/ClaudeBot|anthropic-ai/i, "ClaudeBot (Anthropic)", true],
  [/Perplexity-User/i, "Perplexity (user)", true],
  [/PerplexityBot/i, "PerplexityBot", true],
  [/Google-Extended/i, "Google AI", true],
  [/Google-CloudVertexBot|GoogleOther/i, "Google (other)", true],
  [/meta-externalagent|meta-externalfetcher/i, "Meta AI", true],
  [/Applebot-Extended/i, "Apple AI", true],
  [/Amazonbot/i, "Amazonbot", true],
  [/Bytespider/i, "Bytespider (ByteDance)", true],
  [/CCBot/i, "Common Crawl", true],
  [/cohere-ai/i, "Cohere", true],
  [/MistralAI-User/i, "Mistral (user)", true],
  [/DuckAssistBot/i, "DuckDuckGo AI", true],
  [/Googlebot|Google-InspectionTool|Storebot-Google/i, "Googlebot", false],
  [/bingbot|BingPreview/i, "Bingbot", false],
  [/Applebot/i, "Applebot", false],
  [/DuckDuckBot/i, "DuckDuckBot", false],
  [/YandexBot/i, "YandexBot", false],
  [/Baiduspider/i, "Baiduspider", false],
  [/facebookexternalhit|facebookcatalog/i, "Facebook preview", false],
  [/Twitterbot/i, "X / Twitter preview", false],
  [/LinkedInBot/i, "LinkedIn preview", false],
  [/Slackbot/i, "Slack preview", false],
  [/Discordbot/i, "Discord preview", false],
  [/WhatsApp/i, "WhatsApp preview", false],
  [/TelegramBot/i, "Telegram preview", false],
  [/bot\b|crawler|spider|crawl|slurp|headless|python-requests|curl\/|wget\//i, "Other bot", false],
];

/** Referrer hosts that are AI assistants or search engines. */
const AI_HOSTS = [
  "chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "gemini.google.com",
  "copilot.microsoft.com", "chat.mistral.ai", "you.com", "phind.com", "poe.com", "meta.ai", "grok.com",
];
const SEARCH_HOSTS = ["google.", "bing.com", "duckduckgo.com", "search.yahoo.", "yandex.", "baidu.com", "ecosia.org", "search.brave.com"];
const SOCIAL_HOSTS = ["t.co", "x.com", "twitter.com", "facebook.com", "l.facebook.com", "m.facebook.com", "lm.facebook.com", "instagram.com", "linkedin.com", "lnkd.in", "reddit.com", "news.ycombinator.com", "threads.net", "bsky.app", "whatsapp.com", "t.me"];

/* --------------------------------------------------------- module state */

/** Epoch ms until which page_events is treated as missing. */
let tableOffUntil = 0;
/** range|tz -> { at, body } */
const cache = new Map();

/** For tests: forget the missing-table switch and the response cache. */
export function _resetAnalyticsState() {
  tableOffUntil = 0;
  cache.clear();
}

const tableOff = () => Date.now() < tableOffUntil;

/** True for "relation does not exist" (42P01) or PostgREST's PGRST205. */
export function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  const msg = String(error.message || "");
  return /page_events/.test(msg) && /does not exist|schema cache|could not find/i.test(msg);
}

function noteError(error) {
  if (isMissingTableError(error)) tableOffUntil = Date.now() + OFF_MS;
}

/* ------------------------------------------------------- request parsing */

const header = (req, name) => {
  const v = req?.headers?.[name];
  return String(Array.isArray(v) ? v[0] : v ?? "");
};

/** Visitor IP: first x-forwarded-for entry, else x-real-ip. Never stored. */
export function clientIp(req) {
  return header(req, "x-forwarded-for").split(",")[0].trim() || header(req, "x-real-ip").split(",")[0].trim() || "";
}

/** `<24 hex>`: sha256(daily salt + ip + user agent). */
export function visitorHash(req, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const secret = process.env.SUPABASE_SERVICE_KEY || "np";
  const salt = createHash("sha256").update(`np-analytics:${secret}:${day}`).digest("hex");
  return createHash("sha256").update(salt + clientIp(req) + header(req, "user-agent")).digest("hex").slice(0, 24);
}

/** Crawler name for a user agent, or null for a person. */
export function botFromUserAgent(ua) {
  const s = String(ua || "");
  if (!s) return "Other bot";
  for (const [re, name] of BOTS) if (re.test(s)) return name;
  return null;
}

const AI_BOT_NAMES = new Set(BOTS.filter((b) => b[2]).map((b) => b[1]));

export function deviceFromUserAgent(ua) {
  const s = String(ua || "");
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(s)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(s)) return "mobile";
  return "desktop";
}

export function browserFromUserAgent(ua) {
  const s = String(ua || "");
  if (/FBAN|FBAV|FB_IAB/.test(s)) return "Facebook app";
  if (/Instagram/.test(s)) return "Instagram app";
  if (/Edg(e|A|iOS)?\//.test(s)) return "Edge";
  if (/OPR\/|Opera/.test(s)) return "Opera";
  if (/SamsungBrowser/.test(s)) return "Samsung Internet";
  if (/Firefox|FxiOS/.test(s)) return "Firefox";
  if (/Chrome|CriOS|Chromium/.test(s)) return "Chrome";
  if (/Safari/.test(s)) return "Safari";
  return "Other";
}

/** Short trimmed text, or null. Only letters, digits and `_ . - + space`. */
function cleanToken(v, max = 100) {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max).replace(/[^\p{L}\p{N}_.+\- ]/gu, "");
  return s || null;
}

/** Referrer URL (or bare host) -> lower-case host; null for our own site. */
export function referrerHost(v) {
  if (typeof v !== "string" || !v.trim() || v.length > 2000) return null;
  let host = "";
  try {
    host = new URL(v.includes("://") ? v : `https://${v}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!/^[a-z0-9.-]{1,100}$/.test(host) || !host.includes(".") && host !== "localhost") return null;
  if (SITE_HOSTS.has(host) || SITE_HOSTS.has(`www.${host}`) || host.endsWith(".vercel.app")) return null;
  return host;
}

/** Site path: starts with "/", no scheme or host, query stripped, <= 300 chars. */
function cleanPath(v) {
  if (typeof v !== "string") return null;
  const p = v.split(/[?#]/)[0];
  if (!p.startsWith("/") || p.startsWith("//") || p.length > 300 || /[\s<>"'\\]/.test(p)) return null;
  return p;
}

function intIn(v, min, max) {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i < min ? null : Math.min(i, max);
}

const posId = (v) => intIn(v, 1, 2_147_483_647);

/** The row recordPageEvent would write (exported for tests). */
export function buildEventRow(req, fields = {}) {
  const body = req?.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const pick = (k) => (fields[k] !== undefined ? fields[k] : body[k]);
  const ua = header(req, "user-agent");
  const bot = typeof fields.bot === "string" ? cleanToken(fields.bot, 60) : botFromUserAgent(ua);
  const utm = pick("utm") && typeof pick("utm") === "object" ? pick("utm") : {};
  const slug = req?.params?.slug;
  const path =
    cleanPath(pick("path")) ||
    cleanPath(typeof slug === "string" ? `/articles/${slug}` : "") ||
    cleanPath(String(req?.path || "")) ||
    "/";
  const kind = fields.kind === "bot" || (bot && fields.kind !== "read") ? "bot" : fields.kind === "read" ? "read" : "view";
  const country = header(req, "x-vercel-ip-country").trim().toUpperCase();
  return {
    kind,
    path,
    article_id: posId(pick("articleId")),
    channel_id: posId(pick("channelId")),
    visitor: visitorHash(req),
    user_id: posId(fields.userId),
    referrer_host: referrerHost(pick("referrer")),
    utm_source: cleanToken(utm.source),
    utm_medium: cleanToken(utm.medium),
    utm_campaign: cleanToken(utm.campaign),
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    device: bot ? "bot" : deviceFromUserAgent(ua),
    browser: bot ? null : browserFromUserAgent(ua),
    bot: bot || null,
    status: intIn(fields.status, 100, 599),
    engaged_ms: kind === "read" ? intIn(pick("engagedMs"), 0, 3_600_000) : null,
    scroll_pct: kind === "read" ? intIn(pick("scrollPct"), 0, 100) : null,
  };
}

/* ------------------------------------------------------------ recording */

/**
 * Write one page_events row. Resolves within ~250 ms, never rejects.
 * fields: { kind: "view"|"read"|"bot", articleId?, channelId?, userId?, path?,
 *           status?, bot?, referrer?, utm?, engagedMs?, scrollPct? }
 * Missing fields are taken from req.body (the view route forwards the
 * client's { referrer, utm, sid, path } that way).
 * @returns {Promise<boolean>} true when the row was written in time
 */
export async function recordPageEvent(sb, req, fields = {}) {
  try {
    if (!sb || tableOff()) return false;
    const row = buildEventRow(req, fields || {});
    const write = Promise.resolve(sb.from("page_events").insert(row)).then(
      (r) => {
        if (r && r.error) {
          noteError(r.error);
          return false;
        }
        return true;
      },
      () => false
    );
    let timer;
    const timeout = new Promise((r) => {
      timer = setTimeout(() => r(false), WRITE_TIMEOUT_MS);
    });
    const ok = await Promise.race([write, timeout]);
    clearTimeout(timer);
    return ok;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- ranges */

/**
 * Window for a range, aligned to the reader's clock.
 * tz is minutes EAST of UTC (the browser's -getTimezoneOffset()); a fixed
 * offset, so a daylight-saving change inside the window shifts one day by an
 * hour. Day ranges start at local midnight `days - 1` days ago and end now
 * (today so far); "24h" starts at the local hour 23 hours ago. The previous
 * period is the same window shifted back by `days`, so "today so far" is
 * compared with "yesterday up to the same time".
 */
export function computeRange(range, tz = 0, now = Date.now()) {
  const spec = RANGES[range];
  if (!spec) return null;
  const off = Math.max(-840, Math.min(840, Math.round(Number(tz) || 0))) * 60_000;
  const local = now + off;
  const step = spec.bucket === "hour" ? HOUR : DAY;
  const buckets = spec.bucket === "hour" ? 24 : spec.days;
  const start = Math.floor(local / step) * step - (buckets - 1) * step - off;
  const shift = spec.days * DAY;
  const label = (i) => {
    const d = new Date(start + i * step + off).toISOString();
    return spec.bucket === "hour" ? d.slice(0, 13) + ":00" : d.slice(0, 10);
  };
  return {
    key: range,
    days: spec.days,
    bucket: spec.bucket,
    tz: off / 60_000,
    step,
    buckets,
    from: start,
    to: now,
    prevFrom: start - shift,
    prevTo: now - shift,
    label,
  };
}

const iso = (ms) => new Date(ms).toISOString();

/* ---------------------------------------------------------------- reads */

/**
 * Read every row of a windowed query in pages. `build()` must return a fresh
 * ordered query. Stops at maxPages and reports truncated when more remain.
 */
export async function readPaged(build, { pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { rows, error, truncated: false };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { rows, error: null, truncated: false };
  }
  const probeFrom = maxPages * pageSize;
  const { data } = await build().range(probeFrom, probeFrom);
  return { rows, error: null, truncated: !!(data && data.length) };
}

async function headCount(sb, table, col, from, to) {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte(col, iso(from))
    .lt(col, iso(to));
  return error ? null : count ?? 0;
}

/** Rows of `table` with ids in `ids`, in chunks (keeps URLs short). */
async function byIds(sb, table, select, ids) {
  const out = [];
  const list = [...new Set(ids)].filter((x) => x != null);
  for (let i = 0; i < list.length; i += 150) {
    const { data, error } = await sb.from(table).select(select).in("id", list.slice(i, i + 150));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/* ---------------------------------------------------------- aggregation */

const inc = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);
const desc = (map, n, keyName, valName) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, n)
    .map(([k, v]) => ({ [keyName]: k, [valName]: v }));
const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const ts = (v) => (v ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`) : NaN);
const isPublished = (a) => a.status === "published" || (a.status == null && a.published);

function referrerKind(host) {
  if (!host) return "direct";
  const h = host.toLowerCase();
  if (AI_HOSTS.some((x) => h === x || h.endsWith(`.${x}`))) return "ai";
  if (SEARCH_HOSTS.some((x) => h.startsWith(x) || h.includes(`.${x}`) || h === x)) return "search";
  if (SOCIAL_HOSTS.some((x) => h === x || h.endsWith(`.${x}`))) return "social";
  return "other";
}

/**
 * Build the analytics response (no caching, no auth). Exported for tests.
 * @param {any} sb supabase-js client (service role)
 * @param {{ range?: string, tz?: number, now?: number, pageSize?: number, maxPages?: number }} opts
 */
export async function buildAnalytics(sb, { range = "7d", tz = 0, now = Date.now(), pageSize, maxPages } = {}) {
  const r = computeRange(range, tz, now);
  if (!r) throw new Error(`bad range ${range}`);
  const paging = { pageSize, maxPages };
  let truncated = false;

  // 1. Reads (article_views) for the previous and current period in one window.
  const views = await readPaged(
    () =>
      sb
        .from("article_views")
        .select("id, article_id, user_id, client_identifier, viewed_at")
        .gte("viewed_at", iso(r.prevFrom))
        .lt("viewed_at", iso(r.to))
        .order("viewed_at", { ascending: true })
        .order("id", { ascending: true }),
    paging
  );
  if (views.error) throw views.error;
  truncated ||= views.truncated;

  // 2. Articles published in either period (cadence, fresh, missing covers).
  const pubs = await readPaged(
    () =>
      sb
        .from("articles")
        .select("id, title, slug, channel_id, status, published, published_at, view_count, article_images(id)")
        .gte("published_at", iso(r.prevFrom))
        .lt("published_at", iso(r.to))
        .order("published_at", { ascending: true })
        .order("id", { ascending: true }),
    paging
  );
  if (pubs.error) throw pubs.error;
  truncated ||= pubs.truncated;
  const published = pubs.rows.filter(isPublished);

  // 3. Comments in either period.
  const comm = await readPaged(
    () =>
      sb
        .from("comments")
        .select("id, article_id, created_at")
        .gte("created_at", iso(r.prevFrom))
        .lt("created_at", iso(r.to))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    paging
  );
  if (comm.error) throw comm.error;
  truncated ||= comm.truncated;

  // 4. Follows: subscriptions may have no created_at column -> null.
  const subs = await readPaged(
    () =>
      sb
        .from("subscriptions")
        .select("id, channel_id, created_at")
        .gte("created_at", iso(r.prevFrom))
        .lt("created_at", iso(r.to))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    paging
  );
  const subsKnown = !subs.error;
  truncated ||= subsKnown && subs.truncated;

  // 5. Sign-ups (head-only counts) and the last API publish.
  const [newUsers, prevNewUsers, lastKey] = await Promise.all([
    headCount(sb, "users", "created_at", r.from, r.to),
    headCount(sb, "users", "created_at", r.prevFrom, r.prevTo),
    sb
      .from("api_keys")
      .select("last_used_at")
      .not("last_used_at", "is", null)
      .order("last_used_at", { ascending: false })
      .limit(1),
  ]);

  const inCur = (t) => t >= r.from && t < r.to;
  const inPrev = (t) => t >= r.prevFrom && t < r.prevTo;
  const bucketOf = (t) => Math.floor((t - r.from) / r.step);
  const prevBucketOf = (t) => Math.floor((t - r.prevFrom) / r.step);

  const series = Array.from({ length: r.buckets }, (_, i) => ({
    date: r.label(i),
    reads: 0,
    readers: 0,
    previousReads: 0,
    articlesPublished: 0,
    comments: 0,
  }));
  const bucketReaders = series.map(() => new Set());

  const curReaders = new Set();
  const prevReaders = new Set();
  const signedIn = new Set();
  const prevSignedIn = new Set();
  const readsByArticle = new Map();
  let reads = 0;
  let prevReads = 0;
  for (const v of views.rows) {
    const t = ts(v.viewed_at);
    const who = v.client_identifier || `row-${v.id}`;
    if (inCur(t)) {
      reads++;
      curReaders.add(who);
      if (v.user_id != null) signedIn.add(who);
      inc(readsByArticle, v.article_id);
      const b = bucketOf(t);
      if (series[b]) {
        series[b].reads++;
        bucketReaders[b].add(who);
      }
    } else if (inPrev(t)) {
      prevReads++;
      prevReaders.add(who);
      if (v.user_id != null) prevSignedIn.add(who);
      const b = prevBucketOf(t);
      if (series[b]) series[b].previousReads++;
    }
  }
  series.forEach((s, i) => (s.readers = bucketReaders[i].size));

  let commentsCur = 0;
  let commentsPrev = 0;
  const commentsByArticle = new Map();
  for (const c of comm.rows) {
    const t = ts(c.created_at);
    if (inCur(t)) {
      commentsCur++;
      inc(commentsByArticle, c.article_id);
      const b = bucketOf(t);
      if (series[b]) series[b].comments++;
    } else if (inPrev(t)) commentsPrev++;
  }

  const pubCur = [];
  let pubPrev = 0;
  for (const a of published) {
    const t = ts(a.published_at);
    if (inCur(t)) {
      pubCur.push(a);
      const b = bucketOf(t);
      if (series[b]) series[b].articlesPublished++;
    } else if (inPrev(t)) pubPrev++;
  }

  const followsByChannel = new Map();
  let followsCur = 0;
  let followsPrev = 0;
  if (subsKnown) {
    for (const s of subs.rows) {
      const t = ts(s.created_at);
      if (inCur(t)) {
        followsCur++;
        inc(followsByChannel, s.channel_id);
      } else if (inPrev(t)) followsPrev++;
    }
  }

  // Article and channel details for everything read or published in range.
  const readIds = [...readsByArticle.keys()];
  const articleRows = await byIds(sb, "articles", "id, title, slug, channel_id, view_count", readIds);
  const articles = new Map(articleRows.map((a) => [a.id, a]));
  for (const a of pubCur) if (!articles.has(a.id)) articles.set(a.id, a);
  const channelIds = new Set([...articles.values()].map((a) => a.channel_id));
  for (const id of followsByChannel.keys()) channelIds.add(id);
  const channelRows = await byIds(sb, "channels", "id, name, slug", [...channelIds]);
  const channels = new Map(channelRows.map((c) => [c.id, c]));

  const topArticles = [...readsByArticle.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, TOP_N)
    .map(([id, n]) => {
      const a = articles.get(id) || {};
      const ch = channels.get(a.channel_id);
      return {
        id,
        title: a.title || `Article ${id}`,
        slug: a.slug || null,
        channelId: a.channel_id ?? null,
        channelName: ch?.name || null,
        reads: n,
        shownOnSite: a.view_count ?? null,
        comments: commentsByArticle.get(id) || 0,
      };
    });

  const chan = new Map();
  const chanRow = (id) => {
    if (!chan.has(id)) chan.set(id, { id, name: channels.get(id)?.name || `Channel ${id}`, reads: 0, articlesPublished: 0, newFollowers: subsKnown ? 0 : null });
    return chan.get(id);
  };
  for (const [id, n] of readsByArticle) {
    const a = articles.get(id);
    if (a && a.channel_id != null) chanRow(a.channel_id).reads += n;
  }
  for (const a of pubCur) if (a.channel_id != null) chanRow(a.channel_id).articlesPublished++;
  for (const [id, n] of followsByChannel) if (id != null) chanRow(id).newFollowers = n;
  const topChannels = [...chan.values()]
    .sort((a, b) => b.reads - a.reads || b.articlesPublished - a.articlesPublished || a.id - b.id)
    .slice(0, TOP_N);

  const freshArticles = pubCur
    .slice()
    .sort((a, b) => ts(b.published_at) - ts(a.published_at))
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug || null,
      channelName: channels.get(a.channel_id)?.name || null,
      publishedAt: a.published_at,
      reads: readsByArticle.get(a.id) || 0,
      hasCover: Array.isArray(a.article_images) ? a.article_images.length > 0 : null,
    }));

  let returning = 0;
  for (const who of curReaders) if (prevReaders.has(who)) returning++;

  // Traffic from page_events (null when the table is missing).
  const traffic = await buildTraffic(sb, r, paging);
  if (traffic && traffic.truncated) truncated = true;
  if (traffic) delete traffic.truncated;

  return {
    range: { key: r.key, from: iso(r.from), to: iso(r.to), days: r.days, bucket: r.bucket, tz: r.tz },
    previousRange: { from: iso(r.prevFrom), to: iso(r.prevTo) },
    generatedAt: iso(now),
    truncated,
    totals: {
      reads,
      readers: curReaders.size,
      signedInReaders: signedIn.size,
      newUsers,
      newFollowers: subsKnown ? followsCur : null,
      comments: commentsCur,
      articlesPublished: pubCur.length,
    },
    previous: {
      reads: prevReads,
      readers: prevReaders.size,
      signedInReaders: prevSignedIn.size,
      newUsers: prevNewUsers,
      newFollowers: subsKnown ? followsPrev : null,
      comments: commentsPrev,
      articlesPublished: pubPrev,
    },
    series,
    topArticles,
    topChannels,
    freshArticles,
    readers: {
      returning,
      new: curReaders.size - returning,
      signedIn: signedIn.size,
      anonymous: curReaders.size - signedIn.size,
      articlesPerReader: curReaders.size ? Math.round((reads / curReaders.size) * 10) / 10 : null,
    },
    health: {
      lastApiPublishAt: lastKey?.data?.[0]?.last_used_at || null,
      articlesWithoutCover: pubCur.filter((a) => Array.isArray(a.article_images) && a.article_images.length === 0).length,
      crawlerErrors: traffic ? traffic.bots.errors : null,
      crawlerHits: traffic ? traffic.bots.total : null,
    },
    traffic,
  };
}

/** Sources, countries, devices, crawlers and read-through from page_events. */
async function buildTraffic(sb, r, paging) {
  if (tableOff()) return null;
  const ev = await readPaged(
    () =>
      sb
        .from("page_events")
        .select("id, ts, kind, path, article_id, visitor, referrer_host, utm_source, country, device, bot, status, engaged_ms, scroll_pct")
        .gte("ts", iso(r.from))
        .lt("ts", iso(r.to))
        .order("ts", { ascending: true })
        .order("id", { ascending: true }),
    paging
  );
  if (ev.error) {
    noteError(ev.error);
    if (isMissingTableError(ev.error)) return null;
    throw ev.error;
  }

  const refs = new Map();
  const refKinds = new Map();
  const countries = new Map();
  const devices = new Map();
  const visitors = new Set();
  const bots = new Map();
  const botDays = new Set();
  const engaged = [];
  const scroll = [];
  let views = 0;
  let readEvents = 0;
  let finished = 0;
  let botTotal = 0;
  let botErrors = 0;
  let botLast = null;

  for (const e of ev.rows) {
    if (e.kind === "bot" || e.bot) {
      botTotal++;
      const name = e.bot || "Other bot";
      const b = bots.get(name) || { name, ai: AI_BOT_NAMES.has(name), hits: 0, errors: 0, lastSeen: null };
      b.hits++;
      if (e.status >= 400) {
        b.errors++;
        botErrors++;
      }
      if (!b.lastSeen || e.ts > b.lastSeen) b.lastSeen = e.ts;
      if (!botLast || e.ts > botLast) botLast = e.ts;
      bots.set(name, b);
      botDays.add(Math.floor((ts(e.ts) - r.from) / DAY));
      continue;
    }
    if (e.kind === "read") {
      readEvents++;
      if (typeof e.engaged_ms === "number") engaged.push(e.engaged_ms);
      if (typeof e.scroll_pct === "number") {
        scroll.push(e.scroll_pct);
        if (e.scroll_pct >= 90) finished++;
      }
      continue;
    }
    views++;
    if (e.visitor) visitors.add(e.visitor);
    const src = e.referrer_host || (e.utm_source ? `utm:${e.utm_source}` : null);
    inc(refs, src || "");
    inc(refKinds, e.referrer_host ? referrerKind(e.referrer_host) : e.utm_source ? "campaign" : "direct");
    inc(countries, e.country || "");
    inc(devices, e.device || "unknown");
  }

  const totalDays = Math.max(1, Math.ceil((r.to - r.from) / DAY));
  return {
    truncated: ev.truncated,
    views,
    visitors: visitors.size,
    referrers: desc(refs, 12, "host", "views").map((x) => ({
      host: x.host || null,
      kind: !x.host ? "direct" : x.host.startsWith("utm:") ? "campaign" : referrerKind(x.host),
      views: x.views,
    })),
    sourceKinds: desc(refKinds, 6, "kind", "views"),
    countries: desc(countries, 12, "country", "views").map((x) => ({ country: x.country || null, views: x.views })),
    devices: desc(devices, 5, "device", "views"),
    bots: {
      total: botTotal,
      errors: botErrors,
      lastSeen: botLast,
      daysWithoutHits: r.bucket === "day" ? Math.max(0, totalDays - botDays.size) : null,
      list: [...bots.values()].sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name)).slice(0, 15),
    },
    readThrough: {
      events: readEvents,
      medianEngagedSeconds: engaged.length ? Math.round(median(engaged) / 1000) : null,
      medianScrollPct: median(scroll),
      finishedShare: scroll.length ? Math.round((finished / scroll.length) * 100) / 100 : null,
    },
  };
}

/* --------------------------------------------------------------- routes */

/** Body of POST /api/t: express.json for application/json, else read text (sendBeacon). */
async function readBeaconBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).length) return req.body;
  if (req.readableEnded || req.complete) return null;
  const chunks = [];
  let size = 0;
  return new Promise((resolve) => {
    const done = (v) => resolve(v);
    // Over 4 KB: keep draining (so the 400 can still be sent) but drop it.
    req.on("data", (c) => {
      size += c.length;
      if (size <= 4096) chunks.push(c);
    });
    req.on("end", () => {
      if (size > 4096) return done(null);
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
        done(v && typeof v === "object" && !Array.isArray(v) ? v : null);
      } catch {
        done(null);
      }
    });
    req.on("error", () => done(null));
  });
}

/**
 * Validate a beacon body. Returns { fields } or { error }.
 * Accepts only kind "view" | "read"; every other field is optional and capped.
 */
export function validateBeacon(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Body must be a JSON object" };
  if (body.kind !== "view" && body.kind !== "read") return { error: 'kind must be "view" or "read"' };
  const path = cleanPath(body.path);
  if (!path) return { error: "path must be a site path starting with /" };
  if (path.startsWith("/admin") || path.startsWith("/api")) return { error: "path not tracked" };
  const utm = body.utm && typeof body.utm === "object" && !Array.isArray(body.utm) ? body.utm : {};
  return {
    fields: {
      kind: body.kind,
      path,
      articleId: posId(body.articleId),
      channelId: posId(body.channelId),
      referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 2000) : null,
      utm: { source: utm.source, medium: utm.medium, campaign: utm.campaign },
      engagedMs: body.kind === "read" ? intIn(body.engagedMs, 0, 3_600_000) : null,
      scrollPct: body.kind === "read" ? intIn(body.scrollPct, 0, 100) : null,
    },
  };
}

/** @param {any} app @param {{ supabase: any, getSupabaseUid: (req: any) => Promise<string|null>, isAdminUser: (uid: string) => Promise<boolean> }} deps */
export function registerAnalyticsRoutes(app, { supabase, getSupabaseUid, isAdminUser }) {
  app.get("/api/v1/admin/analytics", async (req, res) => {
    try {
      let uid = null;
      try {
        uid = await getSupabaseUid(req);
      } catch {
        uid = null;
      }
      if (!uid || !(await isAdminUser(uid))) {
        return res.status(403).json({ error: "Admin access required", code: "unauthorized" });
      }
      const range = String(req.query.range || "7d");
      if (!RANGES[range]) {
        return res.status(400).json({ error: "range must be one of 24h, 7d, 30d, 90d", code: "validation_failed" });
      }
      const tzRaw = Number(req.query.tz ?? 0);
      const tz = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, Math.round(tzRaw))) : 0;
      const key = `${range}|${tz}`;
      const hit = cache.get(key);
      res.set("Cache-Control", "private, max-age=60");
      if (hit && Date.now() - hit.at < CACHE_MS && req.query.fresh !== "1") return res.json(hit.body);
      const body = await buildAnalytics(supabase, { range, tz });
      cache.set(key, { at: Date.now(), body });
      return res.json(body);
    } catch (error) {
      console.error("Error in GET /api/v1/admin/analytics:", error && error.message);
      return res.status(500).json({ error: "Failed to build analytics" });
    }
  });

  app.post("/api/t", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      if (tableOff()) return res.status(200).json({ enabled: false });
      const body = await readBeaconBody(req);
      const v = validateBeacon(body);
      if (v.error) return res.status(400).json({ error: v.error, code: "validation_failed" });
      await recordPageEvent(supabase, { headers: req.headers, body: {}, path: v.fields.path }, v.fields);
      if (tableOff()) return res.status(200).json({ enabled: false });
      return res.status(204).end();
    } catch {
      return res.status(204).end();
    }
  });
}
