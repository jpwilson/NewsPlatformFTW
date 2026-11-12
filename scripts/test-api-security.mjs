#!/usr/bin/env node
/**
 * Access-control regression tests for the Express API (api/index.ts).
 *
 * Runs the real handler on a local port against a stub Supabase server that
 * answers the REST (PostgREST), Auth and Storage endpoints the code calls and
 * records every request it receives. Nothing here talks to a real project.
 *
 *   npm run test:security        (tsx scripts/test-api-security.mjs)
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

/* --------------------------------------------------------------- fixtures */

const USERS = {
  // token -> verified Supabase user
  "tok-owner": { id: "uid-owner", email: "owner@example.com" },
  "tok-other": { id: "uid-other", email: "other@example.com" },
  // A verified user with no profile row, whose email local part equals the
  // username of an unbound legacy row.
  "tok-unbound": { id: "uid-unbound", email: "legacy@attacker.example" },
  // A new user whose email local part equals an existing username.
  "tok-clash": { id: "uid-clash", email: "owner@elsewhere.example" },
  "tok-new": { id: "uid-new", email: "new.person+x@example.com" },
};

function freshDb() {
  return {
    users: [
      { id: 10, username: "owner", password: "hash-owner", supabase_uid: "uid-owner", description: "", created_at: "2026-01-01T00:00:00" },
      { id: 11, username: "other", password: "hash-other", supabase_uid: "uid-other", description: "", created_at: "2026-01-01T00:00:00" },
      { id: 12, username: "legacy", password: "hash-legacy", supabase_uid: null, description: "", created_at: "2025-01-01T00:00:00" },
    ],
    channels: [{ id: 5, name: "Owner desk", description: "d", user_id: 10, slug: "owner-desk", created_at: "2026-01-01T00:00:00" }],
    subscriptions: [{ id: 1, user_id: 11, channel_id: 5, created_at: "2026-01-02T00:00:00" }],
    articles: [
      { id: 7, title: "Published", slug: "published", user_id: 10, channel_id: 5, published: true, content: "<p>x</p>" },
      { id: 8, title: "Draft", slug: "draft", user_id: 10, channel_id: 5, published: false, content: "<p>y</p>" },
    ],
    article_images: [
      { id: 1, article_id: 7, image_url: "https://stub.example/storage/v1/object/public/article-images/a.jpg", caption: "", order: 0 },
    ],
    comments: [],
    reactions: [],
    admin_users: [],
  };
}

/* ------------------------------------------------- stub Supabase server */

let db = freshDb();
let log = []; // { method, path, query, body }
const UNIQUE = { users: ["username", "supabase_uid"] };

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function parseValue(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

function matches(row, filters) {
  return filters.every(([col, op, val]) => {
    const cell = row[col];
    if (op === "eq") return String(cell) === String(parseValue(val)) || cell === parseValue(val);
    if (op === "neq") return String(cell) !== String(parseValue(val));
    if (op === "is") return cell === parseValue(val);
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      return list.includes(String(cell));
    }
    if (op === "ilike") {
      const re = new RegExp("^" + val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*") + "$", "i");
      return re.test(String(cell ?? ""));
    }
    return true; // other operators: not filtered by the stub
  });
}

function project(row, select) {
  if (!select || select.includes("*") || select.includes("(")) return { ...row };
  const out = {};
  for (const col of select.split(",").map((s) => s.trim()).filter(Boolean)) out[col] = row[col] ?? null;
  return out;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const stub = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://stub");
  const raw = await readBody(req);
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  log.push({ method: req.method, path: url.pathname, query: url.search, body });

  // Auth: GET /auth/v1/user
  if (url.pathname === "/auth/v1/user") {
    const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const user = USERS[token];
    if (!user) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(res, 200, { ...user, aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: {} });
  }

  // Storage: never expected from the routes under test; recorded and answered.
  if (url.pathname.startsWith("/storage/v1/")) return send(res, 200, []);

  if (!url.pathname.startsWith("/rest/v1/")) return send(res, 404, { message: "stub: unknown path" });
  const table = url.pathname.slice("/rest/v1/".length);
  if (table.startsWith("rpc/")) return send(res, 200, null);
  if (!db[table]) db[table] = [];

  const filters = [];
  let select = null;
  let limit = Infinity;
  for (const [k, v] of url.searchParams) {
    if (k === "select") select = v;
    else if (k === "limit") limit = Number(v);
    else if (k === "order" || k === "offset" || k === "columns" || k === "on_conflict") continue;
    else {
      const i = v.indexOf(".");
      filters.push([k, v.slice(0, i), v.slice(i + 1)]);
    }
  }
  const wantsObject = String(req.headers.accept || "").includes("vnd.pgrst.object");
  const reply = (rows, status = 200) => {
    const out = rows.map((r) => project(r, select));
    if (wantsObject) {
      if (out.length !== 1) {
        return send(res, 406, {
          code: "PGRST116",
          details: `The result contains ${out.length} rows`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        });
      }
      return send(res, status, out[0]);
    }
    return send(res, status, out, { "content-range": `0-${Math.max(out.length - 1, 0)}/${out.length}` });
  };

  const rows = db[table];
  if (req.method === "GET" || req.method === "HEAD") {
    const found = rows.filter((r) => matches(r, filters)).slice(0, limit);
    if (req.method === "HEAD") return send(res, 200, undefined, { "content-range": `*/${found.length}` });
    return reply(found);
  }
  if (req.method === "POST") {
    const items = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const item of items) {
      for (const col of UNIQUE[table] || []) {
        if (item[col] != null && rows.some((r) => r[col] === item[col])) {
          return send(res, 409, { code: "23505", details: `Key (${col}) already exists.`, hint: null, message: "duplicate key value violates unique constraint" });
        }
      }
      const row = { id: rows.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1, created_at: new Date().toISOString(), ...item };
      rows.push(row);
      inserted.push(row);
    }
    return reply(inserted, 201);
  }
  if (req.method === "PATCH") {
    const changed = rows.filter((r) => matches(r, filters));
    for (const r of changed) Object.assign(r, body);
    return reply(changed);
  }
  if (req.method === "DELETE") {
    const removed = rows.filter((r) => matches(r, filters));
    db[table] = rows.filter((r) => !removed.includes(r));
    return reply(removed);
  }
  return send(res, 405, { message: "stub: method" });
});
await new Promise((r) => stub.listen(0, "127.0.0.1", r));

/* ------------------------------------------ load the app, offline only */

// Point the app at the stub before it is imported. dotenv (imported by the
// app) never overrides variables that are already set, and is told to load
// from an empty directory, so no local .env file is read.
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "np-security-test-"));
process.env.DOTENV_CONFIG_PATH = path.join(emptyDir, ".env");
process.env.SUPABASE_URL = `http://127.0.0.1:${stub.address().port}`;
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
process.env.NODE_ENV = "production";

// The app logs heavily; keep the test output readable.
const realLog = console.log;
console.log = console.error = console.warn = console.info = () => {};
const say = (...a) => realLog(...a);

const { default: handler } = await import("../api/index.ts");
const api = http.createServer((req, res) => handler(req, res));
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const apiPort = api.address().port;

/* ---------------------------------------------------------------- harness */

const responses = [];

// Raw request: the path is sent exactly as written (no URL normalisation).
function request(method, rawPath, { token, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: apiPort,
        method,
        path: rawPath,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {}
          const out = { status: res.statusCode, headers: res.headers, text, json };
          responses.push({ method, rawPath, ...out });
          resolve(out);
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) say(`  ✓ ${label}`);
  else {
    failures++;
    say(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function reset() {
  db = freshDb();
  log = [];
}

function hasKeyDeep(value, key) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  return Object.keys(value).some((k) => k === key || hasKeyDeep(value[k], key));
}

/* ------------------------------------------------------------------ tests */

say("\napi security:");

// F-02: every spelling of a debug path is answered 404 by the guard (empty
// body, not Express's "Cannot GET" page) and never reaches Supabase.
{
  const variants = [
    "/api/debug",
    "/api/debug/test",
    "/api/Debug/test",
    "/api/DEBUG/test",
    "/api/DeBuG/system",
    "/api/Debug/subscriptions?userId=1",
    "/api/debug/channels",
    "/api/Debug/connectivity",
    "/api/debug/channels-test",
    "/api/./debug/test",
    "/api/./Debug/test",
    "/api/.%2fdebug/test",
    "/api//debug/test",
    "/api/x/../debug/test",
    "/api/%64ebug/test",
    "/api/%44EBUG/test",
    "/api/debug%2Ftest",
    "/api/%2e/debug/test",
    "/api/debug/",
  ];
  const bad = [];
  for (const method of ["GET", "POST", "HEAD"]) {
    for (const p of variants) {
      reset();
      const r = await request(method, p);
      if (r.status !== 404 || r.text !== "" || log.length !== 0) bad.push(`${method} ${p} → ${r.status} ${r.text.slice(0, 40)} (${log.length} stub calls)`);
    }
  }
  check(`debug path variants (${variants.length * 3}) → 404 from the guard, no handler reached`, bad.length === 0, bad.join(" | "));

  const health = await request("GET", "/api/health");
  check("non-debug route still served (/api/health 200)", health.status === 200);
  check("no X-Powered-By header", !("x-powered-by" in health.headers));
}

// F-01: a verified user without a profile row gets 401, no username lookup, no writes.
for (const route of ["/api/user", "/api/user/channels", "/api/user/subscriptions"]) {
  reset();
  const r = await request("GET", route, { token: "tok-unbound" });
  const usernameLookups = log.filter((l) => l.path === "/rest/v1/users" && /username=/.test(l.query));
  const writes = log.filter((l) => l.path.startsWith("/rest/v1/users") && l.method !== "GET" && l.method !== "HEAD");
  check(`${route}: uid without profile → 401`, r.status === 401, `${r.status} ${r.text}`);
  check(`${route}: error body "No profile for this account"`, r.json?.error === "No profile for this account", r.text);
  check(`${route}: no lookup by username`, usernameLookups.length === 0, JSON.stringify(usernameLookups));
  check(`${route}: no write to users`, writes.length === 0 && db.users.find((u) => u.id === 12).supabase_uid === null);
}
{
  reset();
  const r = await request("GET", "/api/user", { token: "tok-owner" });
  check("/api/user for a bound user → 200 with own profile", r.status === 200 && r.json?.id === 10 && r.json?.username === "owner", r.text);
  check("/api/user omits password and supabase_uid", !hasKeyDeep(r.json, "password") && !hasKeyDeep(r.json, "supabase_uid"), r.text);
  const noToken = await request("GET", "/api/user");
  check("/api/user without a token → 401", noToken.status === 401);
}

// F-06: the callback needs a verified token; body uid/email are ignored.
{
  reset();
  let r = await request("POST", "/api/auth/supabase-callback", { body: { supabase_uid: "uid-owner", email: "owner@example.com" } });
  check("callback without bearer → 401", r.status === 401, `${r.status} ${r.text}`);
  check("callback without bearer touches no table", !log.some((l) => l.path.startsWith("/rest/")));

  r = await request("POST", "/api/auth/supabase-callback", { token: "bogus", body: { supabase_uid: "uid-owner" } });
  check("callback with an invalid token → 401", r.status === 401);

  reset();
  r = await request("POST", "/api/auth/supabase-callback", {
    token: "tok-new",
    body: { supabase_uid: "uid-owner", email: "owner@example.com", name: "x" },
  });
  const created = db.users.find((u) => u.supabase_uid === "uid-new");
  check("callback creates the profile for the token's uid", r.status === 200 && !!created && r.json?.user?.id === created?.id, r.text);
  check("callback ignores body uid/email (owner row untouched, not returned)", r.json?.user?.id !== 10 && db.users.filter((u) => u.supabase_uid === "uid-owner").length === 1);
  check("callback username comes from the verified email, sanitised", created?.username === "newpersonx", created?.username);
  check("callback response has only id, username, description, created_at",
    r.json?.user && Object.keys(r.json.user).sort().join(",") === "created_at,description,id,username", r.text);

  reset();
  r = await request("POST", "/api/auth/supabase-callback", { token: "tok-clash", body: {} });
  const clash = db.users.find((u) => u.supabase_uid === "uid-clash");
  check("callback on a username clash creates a suffixed username, never the existing row",
    r.status === 200 && clash && /^owner_[0-9a-f]{4}$/.test(clash.username) && r.json?.user?.id === clash.id && db.users.find((u) => u.id === 10).supabase_uid === "uid-owner",
    `${r.status} ${r.text}`);

  reset();
  r = await request("POST", "/api/auth/supabase-callback", { token: "tok-owner", body: { supabase_uid: "uid-other" } });
  check("callback for an existing user returns that user", r.status === 200 && r.json?.user?.id === 10, r.text);
}

// F-05: channel owner comes from the token.
{
  reset();
  const r = await request("POST", "/api/channels", { token: "tok-owner", body: { name: "New desk", description: "about", userId: 11 } });
  const ch = db.channels.find((c) => c.name === "New desk");
  check("POST /api/channels ignores body userId (owner from token)", r.status === 201 && ch?.user_id === 10, `${r.status} ${JSON.stringify(ch)}`);
  reset();
  const r2 = await request("POST", "/api/channels", { token: "tok-unbound", body: { name: "Nope", description: "x", userId: 10 } });
  check("POST /api/channels without a profile → 401, nothing created", r2.status === 401 && !db.channels.some((c) => c.name === "Nope"), `${r2.status}`);
}

// F-08: subscriber list is owner-only.
{
  reset();
  let r = await request("GET", "/api/channels/5/subscribers", { token: "tok-other" });
  check("subscriber list for a non-owner → 403", r.status === 403, `${r.status} ${r.text}`);
  check("non-owner request never reads subscriptions", !log.some((l) => l.path === "/rest/v1/subscriptions"));
  r = await request("GET", "/api/channels/5/subscribers", { token: "tok-owner" });
  check("subscriber list for the owner → 200", r.status === 200 && Array.isArray(r.json) && r.json[0]?.id === 11, r.text);
  r = await request("GET", "/api/channels/abc/subscribers", { token: "tok-owner" });
  check("subscriber list with a non-numeric id → 400", r.status === 400);
  r = await request("GET", "/api/channels/99/subscribers", { token: "tok-owner" });
  check("subscriber list for an unknown channel → 404", r.status === 404);
}

// F-04: images routes never call storage and validate URLs.
{
  reset();
  let r = await request("PUT", "/api/articles/7/images", { token: "tok-owner", body: { images: [] } });
  check("PUT …/images (removing an image) → 200", r.status === 200, `${r.status} ${r.text}`);
  check("PUT …/images makes no storage call", !log.some((l) => l.path.startsWith("/storage/")), JSON.stringify(log.filter((l) => l.path.startsWith("/storage/"))));
  check("PUT …/images removed the row", db.article_images.length === 0);

  reset();
  r = await request("PUT", "/api/articles/7/images", {
    token: "tok-owner",
    body: { images: [{ image_url: "https://cdn.example/b.jpg", caption: "c", order: 0 }, { image_url: "/media/c.png", caption: "", order: 1 }] },
  });
  check("PUT …/images with https and /media/ URLs → 200", r.status === 200 && db.article_images.length === 2, r.text);
  check("PUT …/images replacing images makes no storage call", !log.some((l) => l.path.startsWith("/storage/")));

  for (const images of [{ image_url: "https://x" }, "x", null]) {
    reset();
    r = await request("PUT", "/api/articles/7/images", { token: "tok-owner", body: { images } });
    check(`PUT …/images with non-array images (${JSON.stringify(images)}) → 400`, r.status === 400 && db.article_images.length === 1, `${r.status}`);
  }
  for (const bad of ["http://cdn.example/b.jpg", "javascript:alert(1)", "//evil.example/x.jpg", "../x.jpg", "data:image/png;base64,AA"]) {
    reset();
    r = await request("PUT", "/api/articles/7/images", { token: "tok-owner", body: { images: [{ image_url: bad }] } });
    const r2 = await request("POST", "/api/articles/7/images", { token: "tok-owner", body: [{ image_url: bad }] });
    check(`image_url ${JSON.stringify(bad)} → 400 on PUT and POST`, r.status === 400 && r2.status === 400 && db.article_images.length === 1, `${r.status}/${r2.status}`);
  }
  reset();
  r = await request("POST", "/api/articles/7/images", { token: "tok-owner", body: [{ image_url: "https://cdn.example/d.jpg", caption: "", order: 0 }] });
  check("POST …/images with an https URL → 200", r.status === 200, `${r.status} ${r.text}`);
  r = await request("PUT", "/api/articles/7/images", { token: "tok-other", body: { images: [] } });
  check("PUT …/images by a non-owner → 403", r.status === 403);
}

// F-11 / F-14: profile responses and route order.
{
  reset();
  let r = await request("PATCH", "/api/users/10", { token: "tok-owner", body: { description: "hi" } });
  check("PATCH /api/users/:id → 200 without password or supabase_uid", r.status === 200 && r.json?.description === "hi" && !hasKeyDeep(r.json, "password") && !hasKeyDeep(r.json, "supabase_uid"), r.text);
  r = await request("GET", "/api/users/search?q=own", { token: "tok-owner" });
  check("/api/users/search is reached (403 for a non-admin, not 400 from /api/users/:id)", r.status === 403, `${r.status} ${r.text}`);
  db.admin_users.push({ user_id: "uid-owner" });
  r = await request("GET", "/api/users/search?q=own", { token: "tok-owner" });
  check("/api/users/search works for an admin", r.status === 200 && Array.isArray(r.json) && r.json[0]?.username === "owner", r.text);
}

// F-21: comment and reaction input.
{
  reset();
  let r = await request("POST", "/api/articles/8/comments", { token: "tok-owner", body: { content: "hello" } });
  check("comment on an unpublished article → 404", r.status === 404 && db.comments.length === 0);
  r = await request("POST", "/api/articles/7/comments", { token: "tok-owner", body: { content: "x".repeat(5001) } });
  check("comment over 5,000 characters → 400", r.status === 400 && db.comments.length === 0);
  r = await request("POST", "/api/articles/7/comments", { token: "tok-owner", body: { content: "hello" } });
  check("comment on a published article → 201", r.status === 201 && db.comments.length === 1, `${r.status} ${r.text}`);
  db.comments.push({ id: 50, article_id: 8, user_id: 10, content: "other article" });
  r = await request("POST", "/api/articles/7/comments", { token: "tok-owner", body: { content: "reply", parent_id: 50 } });
  check("reply whose parent is on another article → 400", r.status === 400);
  r = await request("POST", "/api/articles/7/comments", { token: "tok-owner", body: { content: "reply", parent_id: db.comments[0].id } });
  check("reply to a comment on the same article → 201", r.status === 201, `${r.status} ${r.text}`);
  r = await request("POST", "/api/articles/published/reactions", { token: "tok-owner", body: { isLike: "yes" } });
  check("reaction with a non-boolean isLike → 400", r.status === 400);
  r = await request("POST", "/api/articles/draft/reactions", { token: "tok-owner", body: { isLike: true } });
  check("reaction on an unpublished article → 404", r.status === 404);
}

// F-15: CORS.
{
  const evil = await request("GET", "/api/health", { headers: { origin: "https://newsplatformmvp.vercel.app" } });
  const good = await request("GET", "/api/health", { headers: { origin: "https://www.newsplatform.org" } });
  check("CORS: retired origin not allowed", !("access-control-allow-origin" in evil.headers));
  check("CORS: www.newsplatform.org allowed, no credentials header",
    good.headers["access-control-allow-origin"] === "https://www.newsplatform.org" && !("access-control-allow-credentials" in good.headers));
}

// Across the whole suite: no response carries a password field.
{
  const leaking = responses.filter((r) => hasKeyDeep(r.json, "password") || /"password"\s*:/.test(r.text));
  check(`no response in the suite (${responses.length}) contains a password field`, leaking.length === 0, leaking.map((r) => `${r.method} ${r.rawPath}`).join(", "));
}

api.close();
stub.close();
fs.rmSync(emptyDir, { recursive: true, force: true });
say("");
if (failures) {
  say(`test-api-security: ${failures} failure(s).\n`);
  process.exit(1);
}
say("test-api-security: all checks passed.\n");
process.exit(0);
