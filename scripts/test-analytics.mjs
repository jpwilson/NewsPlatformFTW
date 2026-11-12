#!/usr/bin/env node
/**
 * Offline tests for api/_lib/analytics.js.
 *
 * Part 1 drives the module directly (supabase-js against the in-memory stub):
 * range maths, aggregation, paging and the truncated flag, the missing-table
 * switch, beacon validation and the stored row (no raw IP).
 * Part 2 loads the real API (api/index.ts) against the same stub: the admin
 * gate, POST /api/t and the view route's page_events row.
 *
 * A small proxy sits in front of the stub so a test can make a table
 * "missing" (PGRST205) or a column "missing" (42703), as production would.
 *
 *   node scripts/test-analytics.mjs      (npm run test:analytics)
 */

import http from "node:http";
import { createClient } from "@supabase/supabase-js";

import { startStubSupabase } from "./lib/stub-supabase.mjs";
import { loadApi } from "./lib/load-api.mjs";
import * as A from "../api/_lib/analytics.js";

let failures = 0;
const out = [];
function check(label, condition, detail = "") {
  if (condition) out.push(`  ✓ ${label}`);
  else {
    failures++;
    out.push(`  ✗ ${label}${detail !== "" ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}
const section = (name) => out.push(`\n${name}:`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* --------------------------------------------------------------- proxy */

/** Proxy that can pretend a table or column does not exist. */
async function startProxy(target) {
  const ctl = { missingTables: new Set(), missingColumns: new Map(), hits: [] };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://p");
    const table = u.pathname.startsWith("/rest/v1/") ? u.pathname.slice(9) : null;
    if (table) ctl.hits.push(`${req.method} ${table}`);
    if (table && ctl.missingTables.has(table)) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache`, details: null, hint: null }));
    }
    const col = table && ctl.missingColumns.get(table);
    if (col && u.search.includes(col)) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ code: "42703", message: `column ${table}.${col} does not exist`, details: null, hint: null }));
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const up = http.request(target + req.url, { method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      up.end(Buffer.concat(chunks));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, ctl, close: () => new Promise((r) => server.close(r)) };
}

/* ------------------------------------------------------------ fixtures */

// Fixed clock: Thursday 2026-11-12 19:40 UTC.
const NOW = Date.parse("2026-11-12T19:40:00.000Z");
const at = (s) => new Date(Date.parse(s)).toISOString();
const IP = "203.0.113.77";

function seed() {
  return {
    users: [
      { id: 1, supabase_uid: "uid-admin", username: "admin", created_at: "2026-01-01T00:00:00" },
      { id: 2, supabase_uid: "uid-writer", username: "writer", created_at: "2026-11-10T08:00:00" },
      { id: 3, supabase_uid: "uid-new", username: "newbie", created_at: "2026-11-02T08:00:00" },
    ],
    admin_users: [{ user_id: "uid-admin" }],
    channels: [
      { id: 10, user_id: 2, name: "City Desk", slug: "city-desk" },
      { id: 11, user_id: 2, name: "Sports", slug: "sports" },
    ],
    articles: [
      { id: 100, title: "Bridge reopens", slug: "bridge", channel_id: 10, user_id: 2, status: "published", published: true, published_at: at("2026-11-10T09:00:00Z"), view_count: 5000 },
      { id: 101, title: "Derby result", slug: "derby", channel_id: 11, user_id: 2, status: "published", published: true, published_at: at("2026-11-12T08:00:00Z"), view_count: 3 },
      { id: 102, title: "Old feature", slug: "old", channel_id: 10, user_id: 2, status: "published", published: true, published_at: at("2026-11-01T09:00:00Z"), view_count: 40 },
      { id: 103, title: "Draft", slug: "draft", channel_id: 10, user_id: 2, status: "draft", published: false, published_at: at("2026-11-11T09:00:00Z"), view_count: 0 },
    ],
    article_images: [{ id: 1, article_id: 100, image_url: "https://x/a.jpg", order: 0 }],
    article_views: [
      // current period (2026-11-06 .. now)
      { id: 1, article_id: 100, user_id: null, client_identifier: "anon-a", viewed_at: at("2026-11-10T10:00:00Z") },
      { id: 2, article_id: 100, user_id: null, client_identifier: "anon-b", viewed_at: at("2026-11-10T11:00:00Z") },
      { id: 3, article_id: 100, user_id: 2, client_identifier: "user-2", viewed_at: at("2026-11-11T12:00:00Z") },
      { id: 4, article_id: 101, user_id: null, client_identifier: "anon-a", viewed_at: at("2026-11-12T09:00:00Z") },
      { id: 5, article_id: 102, user_id: null, client_identifier: "anon-c", viewed_at: at("2026-11-12T19:39:00Z") },
      // previous period (2026-10-30 .. 2026-11-05 19:40)
      { id: 6, article_id: 102, user_id: null, client_identifier: "anon-a", viewed_at: at("2026-11-01T10:00:00Z") },
      { id: 7, article_id: 102, user_id: null, client_identifier: "anon-z", viewed_at: at("2026-11-02T10:00:00Z") },
      // in the gap after the previous period's cut-off (same weekday, later than now's time of day): ignored
      { id: 8, article_id: 102, user_id: null, client_identifier: "anon-y", viewed_at: at("2026-11-05T21:00:00Z") },
      // outside both
      { id: 9, article_id: 102, user_id: null, client_identifier: "anon-x", viewed_at: at("2026-10-20T10:00:00Z") },
    ],
    comments: [
      { id: 1, article_id: 100, user_id: 2, content: "c", created_at: at("2026-11-10T12:00:00Z") },
      { id: 2, article_id: 100, user_id: 2, content: "c", created_at: at("2026-11-02T12:00:00Z") },
    ],
    subscriptions: [{ id: 1, channel_id: 10, user_id: 3 }],
    api_keys: [
      { id: "k1", user_id: 2, key_hash: "h", last_used_at: at("2026-11-12T07:15:00Z") },
      { id: "k2", user_id: 2, key_hash: "h2", last_used_at: null },
    ],
    page_events: [
      { id: 1, ts: at("2026-11-10T10:00:00Z"), kind: "view", path: "/articles/100/bridge", article_id: 100, visitor: "v1", referrer_host: "chatgpt.com", country: "US", device: "mobile" },
      { id: 2, ts: at("2026-11-10T11:00:00Z"), kind: "view", path: "/articles/100/bridge", article_id: 100, visitor: "v2", referrer_host: "google.com", country: "GB", device: "desktop" },
      { id: 3, ts: at("2026-11-11T11:00:00Z"), kind: "view", path: "/", visitor: "v1", referrer_host: null, country: "US", device: "mobile" },
      { id: 4, ts: at("2026-11-11T11:05:00Z"), kind: "read", path: "/articles/100/bridge", article_id: 100, visitor: "v1", engaged_ms: 60000, scroll_pct: 95 },
      { id: 5, ts: at("2026-11-11T11:06:00Z"), kind: "read", path: "/articles/100/bridge", article_id: 100, visitor: "v2", engaged_ms: 20000, scroll_pct: 40 },
      { id: 6, ts: at("2026-11-12T03:00:00Z"), kind: "bot", path: "/articles/100/bridge", article_id: 100, bot: "GPTBot (OpenAI)", status: 200 },
      { id: 7, ts: at("2026-11-12T04:00:00Z"), kind: "bot", path: "/articles/101/derby", article_id: 101, bot: "Googlebot", status: 500 },
      { id: 8, ts: at("2026-11-01T04:00:00Z"), kind: "view", path: "/", visitor: "v9", country: "FR", device: "desktop" },
    ],
  };
}

/* ------------------------------------------------------- part 1: module */

const stub = await startStubSupabase({ tables: seed(), tokens: { "tok-admin": "uid-admin", "tok-writer": "uid-writer" } });
const proxy = await startProxy(stub.url);
proxy.ctl.missingColumns.set("subscriptions", "created_at");
const sb = createClient(proxy.url, "test-service-key", { auth: { persistSession: false, autoRefreshToken: false } });

section("range maths");
{
  const r = A.computeRange("7d", 0, NOW);
  check("7d starts at UTC midnight six days ago", r.from === Date.parse("2026-11-06T00:00:00Z"), new Date(r.from).toISOString());
  check("7d ends now", r.to === NOW);
  check("previous 7d is the same window a week earlier", r.prevFrom === Date.parse("2026-10-30T00:00:00Z") && r.prevTo === Date.parse("2026-11-05T19:40:00Z"));
  check("7d has 7 day labels ending today", r.buckets === 7 && r.label(0) === "2026-11-06" && r.label(6) === "2026-11-12");

  const ny = A.computeRange("7d", -300, NOW); // New York, UTC-5
  check("tz -300: local midnight is 05:00 UTC", ny.from === Date.parse("2026-11-06T05:00:00Z"), new Date(ny.from).toISOString());
  check("tz -300: labels are local dates", ny.label(6) === "2026-11-12");
  const late = A.computeRange("7d", -300, Date.parse("2026-11-13T02:00:00Z")); // 21:00 on the 12th in New York
  check("tz -300 at 02:00 UTC: today is still the 12th locally", late.label(6) === "2026-11-12" && late.from === Date.parse("2026-11-06T05:00:00Z"));
  const ind = A.computeRange("24h", 330, NOW); // India, UTC+5:30 -> 01:10 on the 13th
  check("24h tz +330: hourly, aligned to the local hour", ind.buckets === 24 && ind.from === Date.parse("2026-11-11T20:30:00Z"), new Date(ind.from).toISOString());
  check("24h tz +330: last label is the local hour", ind.label(23) === "2026-11-13T01:00", ind.label(23));
  check("24h previous is the 24 hours before", ind.prevTo === NOW - 86400000);
  const r90 = A.computeRange("90d", 0, NOW);
  check("90d spans 90 days", r90.buckets === 90 && r90.from === Date.parse("2026-08-15T00:00:00Z"));
  check("unknown range is null", A.computeRange("1y", 0, NOW) === null);
  check("tz is clamped", A.computeRange("7d", 99999, NOW).tz === 840);
}

section("aggregation (7d, UTC)");
A._resetAnalyticsState();
const res = await A.buildAnalytics(sb, { range: "7d", tz: 0, now: NOW });
{
  check("reads = current-period article_views rows", res.totals.reads === 5, res.totals);
  check("readers = distinct identifiers", res.totals.readers === 4);
  check("signed-in readers", res.totals.signedInReaders === 1);
  check("previous reads exclude rows after the previous cut-off", res.previous.reads === 2 && res.previous.readers === 2, res.previous);
  check("comments current and previous", res.totals.comments === 1 && res.previous.comments === 1);
  check("articles published: drafts excluded", res.totals.articlesPublished === 2 && res.previous.articlesPublished === 1, [res.totals, res.previous]);
  check("new users current and previous", res.totals.newUsers === 1 && res.previous.newUsers === 1, [res.totals.newUsers, res.previous.newUsers]);
  check("followers null when subscriptions has no created_at", res.totals.newFollowers === null && res.previous.newFollowers === null);
  check("series has 7 days", res.series.length === 7 && res.series[4].date === "2026-11-10");
  check("series reads per day", eq(res.series.map((s) => s.reads), [0, 0, 0, 0, 2, 1, 2]), res.series.map((s) => s.reads));
  check("series readers per day", eq(res.series.map((s) => s.readers), [0, 0, 0, 0, 2, 1, 2]));
  check("series previous reads aligned by day", eq(res.series.map((s) => s.previousReads), [0, 0, 1, 1, 0, 0, 0]), res.series.map((s) => s.previousReads));
  const top = res.topArticles[0];
  check("top article by reads", top.id === 100 && top.reads === 3 && top.channelName === "City Desk", top);
  check("shown on site is the public counter, reported apart", top.shownOnSite === 5000);
  check("top article comments in range", top.comments === 1);
  check("channels ranked by reads", res.topChannels[0].id === 10 && res.topChannels[0].reads === 4 && res.topChannels[0].newFollowers === null, res.topChannels);
  check("fresh articles newest first, with reads", res.freshArticles.length === 2 && res.freshArticles[0].id === 101 && res.freshArticles[0].reads === 1);
  check("cover flag on fresh articles", res.freshArticles[0].hasCover === false && res.freshArticles[1].hasCover === true);
  check("returning = also read in the previous period", res.readers.returning === 1 && res.readers.new === 3, res.readers);
  check("articles per reader", res.readers.articlesPerReader === 1.3);
  check("health: last API publish", res.health.lastApiPublishAt === at("2026-11-12T07:15:00Z"));
  check("health: articles without cover", res.health.articlesWithoutCover === 1);
  check("not truncated", res.truncated === false);
  const t = res.traffic;
  check("traffic present when the table exists", !!t);
  check("traffic: human views only", t.views === 3 && t.visitors === 2, t);
  check("traffic: referrers with kinds", t.referrers.some((x) => x.host === "chatgpt.com" && x.kind === "ai") && t.referrers.some((x) => x.host === "google.com" && x.kind === "search") && t.referrers.some((x) => x.host === null && x.kind === "direct"), t.referrers);
  check("traffic: countries", t.countries[0].country === "US" && t.countries[0].views === 2);
  check("traffic: devices", t.devices[0].device === "mobile" && t.devices[0].views === 2);
  check("traffic: bots with errors and AI flag", t.bots.total === 2 && t.bots.errors === 1 && t.bots.list.find((b) => b.name === "GPTBot (OpenAI)").ai === true, t.bots);
  check("traffic: days without crawler hits", t.bots.daysWithoutHits === 6, t.bots.daysWithoutHits);
  check("traffic: read-through", t.readThrough.events === 2 && t.readThrough.medianEngagedSeconds === 40 && t.readThrough.finishedShare === 0.5, t.readThrough);
  check("health: crawler errors", res.health.crawlerErrors === 1);
  check("no client identifier or raw IP in the response", !/anon-|user-2|203\.0\.113/.test(JSON.stringify(res)));
}

section("24h by hour");
{
  const r = await A.buildAnalytics(sb, { range: "24h", tz: 0, now: NOW });
  check("24 hourly buckets", r.series.length === 24 && r.series[23].date === "2026-11-12T19:00");
  check("24h reads", r.totals.reads === 2 && r.series[23].reads === 1 && r.series[13].reads === 1, r.series.map((s) => s.reads).join(","));
  check("24h previous = the day before", r.previous.reads === 1, r.previous);
}

section("time-zone offset moves rows between days");
{
  // tz +600 (Sydney-ish): 2026-11-12T19:39Z is already the 13th locally.
  const r = await A.buildAnalytics(sb, { range: "7d", tz: 600, now: NOW });
  check("last label is the local date", r.series[6].date === "2026-11-13");
  check("late read counted on the local day", r.series[6].reads === 1 && r.series[5].reads === 1, r.series.map((s) => s.reads));
}

section("paging and the truncated flag");
{
  let pages = 0;
  const fakeRows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
  const build = () => ({
    range: async (from, to) => {
      pages++;
      return { data: fakeRows.slice(from, to + 1), error: null };
    },
  });
  let p = await A.readPaged(build, { pageSize: 2, maxPages: 2 });
  check("stops at the page cap and flags truncated", p.rows.length === 4 && p.truncated === true && pages === 3, { n: p.rows.length, pages });
  pages = 0;
  p = await A.readPaged(build, { pageSize: 2, maxPages: 3 });
  check("short last page ends the read, not truncated", p.rows.length === 5 && p.truncated === false && pages === 3);
  fakeRows.pop();
  pages = 0;
  p = await A.readPaged(build, { pageSize: 2, maxPages: 2 });
  check("exactly at the cap: probe finds nothing, not truncated", p.rows.length === 4 && p.truncated === false && pages === 3);
  A._resetAnalyticsState();
  const r = await A.buildAnalytics(sb, { range: "7d", tz: 0, now: NOW, pageSize: 2, maxPages: 2 });
  check("buildAnalytics reports truncated when a table hits the cap", r.truncated === true);
  const full = await A.buildAnalytics(sb, { range: "7d", tz: 0, now: NOW, pageSize: 2, maxPages: 10 });
  check("small pages give the same totals as one page", eq(full.totals, res.totals) && full.truncated === false, full.totals);
}

section("missing page_events table");
{
  A._resetAnalyticsState();
  proxy.ctl.missingTables.add("page_events");
  const r = await A.buildAnalytics(sb, { range: "7d", tz: 0, now: NOW });
  check("traffic is null", r.traffic === null);
  check("the rest still works", r.totals.reads === 5 && r.health.crawlerErrors === null);
  A._resetAnalyticsState();
  const req = { headers: { "x-forwarded-for": IP, "user-agent": "Mozilla/5.0 (iPhone)" }, body: {} };
  const ok1 = await A.recordPageEvent(sb, req, { kind: "view", path: "/" });
  const before = proxy.ctl.hits.filter((h) => h.endsWith("page_events")).length;
  const ok2 = await A.recordPageEvent(sb, req, { kind: "view", path: "/" });
  const after = proxy.ctl.hits.filter((h) => h.endsWith("page_events")).length;
  check("recordPageEvent resolves false and does not throw", ok1 === false && ok2 === false);
  check("then switches itself off (no further requests)", after === before);
  const r2 = await A.buildAnalytics(sb, { range: "7d", tz: 0, now: NOW });
  check("while off, analytics skips the table", r2.traffic === null && proxy.ctl.hits.filter((h) => h.endsWith("page_events")).length === after);
  proxy.ctl.missingTables.delete("page_events");
  A._resetAnalyticsState();
}

section("recordPageEvent: stored row and timing");
{
  const req = {
    headers: {
      "x-forwarded-for": `${IP}, 10.0.0.1`,
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "x-vercel-ip-country": "de",
    },
    params: { slug: "bridge" },
    body: { referrer: "https://www.perplexity.ai/search?q=x", utm: { source: "newsletter", medium: "email", campaign: "<script>" }, sid: "abc", path: "/articles/100/bridge?x=1" },
  };
  const before = stub.table("page_events").length;
  const ok = await A.recordPageEvent(sb, req, { kind: "view", articleId: 100, userId: 2 });
  const row = stub.table("page_events").at(-1);
  check("one row written", ok === true && stub.table("page_events").length === before + 1);
  check("no raw IP stored anywhere in the row", !JSON.stringify(row).includes("203.0.113") && !JSON.stringify(row).includes("10.0.0.1"), row);
  check("visitor is a 24-hex hash", /^[0-9a-f]{24}$/.test(row.visitor));
  check("visitor differs by IP", A.visitorHash({ headers: { "x-forwarded-for": "198.51.100.1", "user-agent": req.headers["user-agent"] } }) !== row.visitor);
  check("x-real-ip used when x-forwarded-for is absent", A.clientIp({ headers: { "x-real-ip": "198.51.100.9" } }) === "198.51.100.9");
  check("visitor salt changes daily", A.visitorHash(req, new Date("2026-11-12T10:00:00Z")) !== A.visitorHash(req, new Date("2026-11-13T10:00:00Z")));
  check("fields from the body: referrer host, utm, path", row.referrer_host === "perplexity.ai" && row.utm_source === "newsletter" && row.utm_medium === "email" && row.utm_campaign === "script" && row.path === "/articles/100/bridge", row);
  check("country, device, browser", row.country === "DE" && row.device === "mobile" && row.browser === "Safari", row);
  check("article and user ids", row.article_id === 100 && row.user_id === 2 && row.kind === "view");
  const botRow = A.buildEventRow({ headers: { "user-agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" }, body: {} }, { kind: "view", path: "/articles/1/x", status: 200 });
  check("crawler hits: kind bot with name and status", botRow.kind === "bot" && botRow.bot === "GPTBot (OpenAI)" && botRow.status === 200 && botRow.device === "bot", botRow);
  check("own-site referrer is dropped", A.referrerHost("https://www.newsplatform.org/channels/1") === null);
  check("bad referrer is dropped", A.referrerHost("javascript:alert(1)") === null && A.referrerHost("") === null);

  const slow = { from: () => ({ insert: () => new Promise((r) => setTimeout(() => r({ error: null }), 2000)) }) };
  const t0 = Date.now();
  const okSlow = await A.recordPageEvent(slow, req, { kind: "view" });
  const dt = Date.now() - t0;
  check("a slow database never holds the caller more than ~250 ms", okSlow === false && dt < 400, `${dt} ms`);
  const throwing = { from: () => { throw new Error("boom"); } };
  check("a throwing client never throws", (await A.recordPageEvent(throwing, req, { kind: "view" })) === false);
  check("no client at all is fine", (await A.recordPageEvent(null, req, {})) === false);
  const n0 = stub.table("page_events").length;
  const dnt = await A.recordPageEvent(sb, { headers: { ...req.headers, dnt: "1" }, body: {} }, { kind: "view", path: "/" });
  const gpc = await A.recordPageEvent(sb, { headers: { ...req.headers, "sec-gpc": "1" }, body: {} }, { kind: "view", path: "/" });
  const flag = await A.recordPageEvent(sb, { headers: req.headers, body: { dnt: true } }, { kind: "view", path: "/" });
  check("Do Not Track, GPC and the client's dnt flag: nothing written", !dnt && !gpc && !flag && stub.table("page_events").length === n0);
}

section("beacon validation");
{
  const v = A.validateBeacon;
  check("kind must be view or read", !!v({ kind: "bot", path: "/" }).error && !!v({ path: "/" }).error);
  check("path required and must be a site path", !!v({ kind: "view" }).error && !!v({ kind: "view", path: "https://evil.example/" }).error && !!v({ kind: "view", path: "//evil" }).error);
  check("long path rejected", !!v({ kind: "view", path: "/" + "a".repeat(400) }).error);
  check("admin and api paths are not tracked", !!v({ kind: "view", path: "/admin" }).error && !!v({ kind: "view", path: "/api/x" }).error);
  check("non-object rejected", !!v(null).error && !!v([1]).error && !!v("x").error);
  const ok = v({ kind: "read", path: "/articles/1/x", articleId: "7", engagedMs: 1e12, scrollPct: 500, junk: "x".repeat(10000) });
  check("numbers capped", ok.fields.engagedMs === 3_600_000 && ok.fields.scrollPct === 100 && ok.fields.articleId === 7, ok.fields);
  check("unknown fields dropped", !("junk" in ok.fields));
  const neg = v({ kind: "read", path: "/", engagedMs: -5, scrollPct: "abc", articleId: -1 });
  check("bad numbers become null", neg.fields.engagedMs === null && neg.fields.scrollPct === null && neg.fields.articleId === null);
  const row = A.buildEventRow({ headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36" }, body: {} }, v({ kind: "view", path: "/", utm: { source: "x".repeat(500) } }).fields);
  check("utm values capped at 100 chars", row.utm_source.length === 100);
}

await proxy.close();

/* ---------------------------------------------------------- part 2: API */

section("API: GET /api/v1/admin/analytics");
const stub2 = await startStubSupabase({ tables: seed(), tokens: { "tok-admin": "uid-admin", "tok-writer": "uid-writer" } });
const proxy2 = await startProxy(stub2.url);
const api = await loadApi({ supabaseUrl: proxy2.url });
try {
  let r = await api.request("GET", "/api/v1/admin/analytics?range=7d");
  check("no token: 403", r.status === 403, r.status);
  r = await api.request("GET", "/api/v1/admin/analytics?range=7d", { headers: { authorization: "Bearer tok-writer" } });
  check("signed-in non-admin: 403", r.status === 403, r.status);
  r = await api.request("GET", "/api/v1/admin/analytics?range=7d", { headers: { authorization: "Bearer bad" } });
  check("bad token: 403", r.status === 403, r.status);
  r = await api.request("GET", "/api/v1/admin/analytics?range=1y", { headers: { authorization: "Bearer tok-admin" } });
  check("bad range: 400", r.status === 400 && r.json.code === "validation_failed", r.status);
  r = await api.request("GET", "/api/v1/admin/analytics?range=30d&tz=-300", { headers: { authorization: "Bearer tok-admin" } });
  check("admin: 200", r.status === 200, r.text.slice(0, 200));
  const keys = ["range", "previousRange", "generatedAt", "truncated", "totals", "previous", "series", "topArticles", "topChannels", "freshArticles", "readers", "health", "traffic"];
  check("response has every section", r.json && keys.every((k) => k in r.json), r.json && Object.keys(r.json));
  check("30 daily points", r.json.series.length === 30 && r.json.range.tz === -300);
  check("private cache header", /private, max-age=60/.test(r.headers.get("cache-control") || ""));
  const gen = r.json.generatedAt;
  const r2 = await api.request("GET", "/api/v1/admin/analytics?range=30d&tz=-300", { headers: { authorization: "Bearer tok-admin" } });
  check("second call within 60 s is served from cache", r2.json.generatedAt === gen);
  check("cache does not bypass the admin gate", (await api.request("GET", "/api/v1/admin/analytics?range=30d&tz=-300")).status === 403);
  check("no identifiers or IPs in the response", !/anon-|user-\d|client_identifier/.test(r.text));

  section("API: POST /api/t");
  const ua = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "x-forwarded-for": IP, "x-vercel-ip-country": "CA" };
  const count = () => stub2.table("page_events").length;
  let n = count();
  r = await api.request("POST", "/api/t", { headers: ua, body: { kind: "view", path: "/channels/10", channelId: 10, referrer: "https://t.co/abc", sid: "s1" } });
  check("valid view: 204 and one row", r.status === 204 && count() === n + 1, r.status);
  let row = stub2.table("page_events").at(-1);
  check("row fields", row.kind === "view" && row.channel_id === 10 && row.referrer_host === "t.co" && row.country === "CA" && row.device === "desktop", row);
  check("no raw IP in the row", !JSON.stringify(row).includes(IP));
  n = count();
  r = await api.request("POST", "/api/t", { headers: { ...ua, "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ kind: "read", path: "/articles/100/bridge", articleId: 100, engagedMs: 45000, scrollPct: 88 }) });
  check("sendBeacon text/plain body accepted", r.status === 204 && count() === n + 1, r.status);
  row = stub2.table("page_events").at(-1);
  check("read row carries engaged time and scroll", row.kind === "read" && row.engaged_ms === 45000 && row.scroll_pct === 88, row);
  n = count();
  r = await api.request("POST", "/api/t", { headers: ua, body: { kind: "bot", path: "/" } });
  check("kind bot rejected: 400, nothing written", r.status === 400 && count() === n);
  r = await api.request("POST", "/api/t", { headers: ua, body: { kind: "view", path: "https://evil.example" } });
  check("bad path: 400", r.status === 400 && count() === n);
  r = await api.request("POST", "/api/t", { headers: { ...ua, "content-type": "text/plain" }, body: "not json" });
  check("garbage: 400", r.status === 400 && count() === n);
  r = await api.request("POST", "/api/t", { headers: { ...ua, "content-type": "text/plain" }, body: JSON.stringify({ kind: "view", path: "/", pad: "x".repeat(6000) }) });
  check("oversized text body: 400", r.status === 400 && count() === n, r.status);
  const reads = proxy2.ctl.hits.length;
  await api.request("POST", "/api/t", { headers: ua, body: { kind: "view", path: "/" } });
  const newHits = proxy2.ctl.hits.slice(reads);
  check("one insert and no reads per beacon", newHits.length === 1 && newHits[0] === "POST page_events", newHits);

  section("API: view route writes a page_events row");
  n = count();
  r = await api.request("POST", "/api/articles/bridge/view", { headers: ua, body: { referrer: "https://chatgpt.com/", utm: { source: "chatgpt.com" }, sid: "s2", path: "/articles/100/bridge", channelId: 10 } });
  check("view route still answers", r.status === 200 && r.json.success === true, r.text.slice(0, 200));
  await new Promise((res) => setTimeout(res, 300));
  row = stub2.table("page_events").at(-1);
  check("page_events row for the view", count() === n + 1 && row.article_id === 100 && row.referrer_host === "chatgpt.com" && row.path === "/articles/100/bridge", row);
  check("no raw IP in page_events or article_views", !JSON.stringify(stub2.table("page_events")).includes(IP) && !JSON.stringify(stub2.table("article_views")).includes(IP));

  section("API: missing table");
  proxy2.ctl.missingTables.add("page_events");
  r = await api.request("POST", "/api/t", { headers: ua, body: { kind: "view", path: "/" } });
  check("first beacon after the table goes: enabled false", r.status === 200 && r.json && r.json.enabled === false, r.status);
  const h = proxy2.ctl.hits.length;
  r = await api.request("POST", "/api/t", { headers: ua, body: { kind: "view", path: "/" } });
  check("then answers enabled false without touching the database", r.json && r.json.enabled === false && proxy2.ctl.hits.length === h);
  r = await api.request("POST", "/api/articles/bridge/view", { headers: ua, body: {} });
  check("view route unaffected", r.status === 200 && r.json.success === true);
  r = await api.request("GET", "/api/v1/admin/analytics?range=90d", { headers: { authorization: "Bearer tok-admin" } });
  check("analytics: traffic null, rest present", r.status === 200 && r.json.traffic === null && typeof r.json.totals.reads === "number", r.status);
} finally {
  api.restoreConsole();
  await api.close();
  await proxy2.close();
  await stub2.close();
  await stub.close();
}

console.log(out.join("\n"));
console.log(failures ? `\n${failures} check(s) failed` : "\nAll analytics checks passed");
process.exit(failures ? 1 : 0);
