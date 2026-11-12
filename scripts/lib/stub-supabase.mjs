/**
 * An in-memory stand-in for the parts of Supabase the API uses, for offline
 * tests: PostgREST (select with embeds, filters, order, limit, single, count,
 * insert, update, delete), database functions (RPC below), Auth
 * (GET /auth/v1/user) and Storage uploads.
 *
 * It is deliberately small. It knows the foreign keys of the tables the
 * article routes touch (see FK below) and emulates the sync_article_status
 * trigger (status -> published, published_at, last_edited).
 *
 *   const sb = await startStubSupabase({ tables: { articles: [...] }, tokens: { tok: "uid-1" } });
 *   process.env.SUPABASE_URL = sb.url;
 *   ...
 *   sb.close();
 */

import http from "node:http";

/** Foreign keys: table -> { column: referenced table }. */
const FK = {
  articles: { channel_id: "channels", user_id: "users", location_id: "locations" },
  article_categories: { article_id: "articles", category_id: "categories" },
  article_images: { article_id: "articles" },
  article_views: { article_id: "articles", user_id: "users" },
  comments: { article_id: "articles", user_id: "users" },
  reactions: { article_id: "articles" },
  channels: { user_id: "users" },
  subscriptions: { channel_id: "channels", user_id: "users" },
  categories: { parent_id: "categories" },
  api_keys: { user_id: "users" },
};

/* --------------------------------------------------------- select parser */

function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const unquote = (s) => s.replace(/"/g, "").trim();

/** "*,channel:channel_id(id,name)" -> [{ kind, ... }] */
function parseSelect(sel) {
  const clean = String(sel || "*").replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, "");
  return splitTop(clean).map((item) => {
    const m = item.match(/^(?:([^:(]+):)?([^(!]+)(?:![a-z_]+)?\((.*)\)$/s);
    if (m) return { kind: "embed", alias: unquote(m[1] || m[2]), rel: unquote(m[2]), sub: parseSelect(m[3]) };
    const c = item.match(/^(?:([^:]+):)?(.+)$/);
    const col = unquote(c[2]).replace(/::\w+$/, "");
    return col === "*" ? { kind: "star" } : { kind: "col", alias: unquote(c[1] || col), col };
  });
}

/**
 * Database functions (POST /rest/v1/rpc/<name>), as defined in
 * supabase/migrations/20250403213550_remote_schema.sql. Return null = void.
 */
const RPC = {
  increment_article_view: ({ article_id }, table) => {
    const row = table("articles").find((r) => same(r.id, article_id));
    if (row) row.view_count = (row.view_count || 0) + 1;
    return null;
  },
};

/* --------------------------------------------------------------- filters */

function coerce(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function same(a, b) {
  if (a === null || a === undefined || b === null) return a == b;
  return String(a) === String(b);
}

function test(row, col, expr) {
  const v = row[col];
  const neg = expr.startsWith("not.");
  const e = neg ? expr.slice(4) : expr;
  const dot = e.indexOf(".");
  const op = e.slice(0, dot);
  const arg = decodeURIComponent(e.slice(dot + 1));
  let r;
  switch (op) {
    case "eq": r = same(v, coerce(arg)); break;
    case "neq": r = !same(v, coerce(arg)); break;
    case "gt": r = v !== null && v !== undefined && (typeof v === "number" ? v > Number(arg) : String(v) > arg); break;
    case "gte": r = v !== null && v !== undefined && (typeof v === "number" ? v >= Number(arg) : String(v) >= arg); break;
    case "lt": r = v !== null && v !== undefined && (typeof v === "number" ? v < Number(arg) : String(v) < arg); break;
    case "lte": r = v !== null && v !== undefined && (typeof v === "number" ? v <= Number(arg) : String(v) <= arg); break;
    case "is": r = arg === "null" ? v === null || v === undefined : same(v, coerce(arg)); break;
    case "in": {
      const list = arg.replace(/^\(|\)$/g, "").split(",").map((x) => unquote(x));
      r = list.some((x) => same(v, coerce(x)));
      break;
    }
    case "like":
    case "ilike": {
      const re = new RegExp(`^${arg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*")}$`, op === "ilike" ? "i" : "");
      r = re.test(String(v ?? ""));
      break;
    }
    default:
      throw new Error(`stub-supabase: unsupported operator ${op}`);
  }
  return neg ? !r : r;
}

function testOr(row, expr) {
  const inner = expr.replace(/^\(|\)$/g, "");
  return splitTop(inner).some((part) => {
    const m = part.match(/^([^.]+)\.(.+)$/);
    return m ? test(row, m[1], m[2]) : false;
  });
}

const RESERVED = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    if (k === "or") out = out.filter((r) => testOr(r, v));
    else if (k.includes(".")) continue; // filters on embedded resources: ignored
    else out = out.filter((r) => test(r, k, v));
  }
  return out;
}

function applyOrder(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((part) => {
    const [col, dir = "asc", nulls] = part.split(".");
    return { col: unquote(col), desc: dir === "desc", nullsFirst: nulls === "nullsfirst" };
  });
  return rows.slice().sort((a, b) => {
    for (const k of keys) {
      const av = a[k.col];
      const bv = b[k.col];
      if (av === bv) continue;
      if (av === null || av === undefined) return k.nullsFirst ? -1 : 1;
      if (bv === null || bv === undefined) return k.nullsFirst ? 1 : -1;
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av) < String(bv) ? -1 : 1;
      return k.desc ? -c : c;
    }
    return 0;
  });
}

/* ------------------------------------------------------------------ stub */

export async function startStubSupabase({ tables = {}, tokens = {}, objects = {} } = {}) {
  const db = {};
  const seq = {};
  const log = [];
  const storage = { uploads: [], removed: [], objects: { ...objects } };
  // missingRpc: names of database functions to answer 404 for (tests fallbacks).
  const state = { db, log, storage, tokens, failNext: null, missingRpc: null };

  const table = (name) => (db[name] ||= []);
  const reset = (data) => {
    for (const k of Object.keys(db)) delete db[k];
    for (const [name, rows] of Object.entries(data || {})) {
      db[name] = rows.map((r) => ({ ...r }));
      seq[name] = Math.max(0, ...db[name].map((r) => Number(r.id) || 0));
    }
  };
  reset(tables);

  function resolveRel(parent, rel) {
    const fks = FK[parent] || {};
    if (fks[rel]) return { type: "one", col: rel, target: fks[rel] };
    const col = Object.keys(fks).find((c) => fks[c] === rel);
    if (col) return { type: "one", col, target: rel };
    const childFks = FK[rel] || {};
    const childCol = Object.keys(childFks).find((c) => childFks[c] === parent);
    if (childCol) return { type: "many", col: childCol, target: rel };
    throw new Error(`stub-supabase: no relation ${parent} -> ${rel}`);
  }

  function project(tableName, row, sel) {
    const out = {};
    for (const item of sel) {
      if (item.kind === "star") Object.assign(out, row);
      else if (item.kind === "col") out[item.alias] = row[item.col] ?? null;
    }
    for (const item of sel) {
      if (item.kind !== "embed") continue;
      const rel = resolveRel(tableName, item.rel);
      if (rel.type === "one") {
        const target = table(rel.target).find((r) => same(r.id, row[rel.col]));
        out[item.alias] = target ? project(rel.target, target, item.sub) : null;
      } else {
        out[item.alias] = table(rel.target)
          .filter((r) => same(r[rel.col], row.id))
          .map((r) => project(rel.target, r, item.sub));
      }
    }
    return out;
  }

  function trigger(name, row, isInsert) {
    const now = new Date().toISOString();
    if (name === "articles") {
      if (row.status !== undefined) {
        row.published = row.status === "published";
        if (row.published && !row.published_at) row.published_at = now;
      }
      row.last_edited = now;
      if (isInsert && !row.created_at) row.created_at = now;
    }
    if (isInsert && !row.created_at && name !== "articles") row.created_at = now;
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  function rest(req, res, body, name, params) {
    const prefer = String(req.headers.prefer || "");
    const wantsObject = String(req.headers.accept || "").includes("vnd.pgrst.object");
    const returnRep = prefer.includes("return=representation");
    const sel = parseSelect(params.get("select") || "*");
    const rows = table(name);
    log.push({ method: req.method, table: name, query: params.toString(), body });

    if (state.failNext && state.failNext.table === name && state.failNext.method === req.method) {
      const f = state.failNext;
      state.failNext = null;
      return send(res, f.status || 500, { code: "XX000", message: f.message || "stub failure", details: null, hint: null });
    }

    const finish = (result, status = 200) => {
      let projected = result.map((r) => project(name, r, sel));
      if (wantsObject) {
        if (projected.length !== 1) {
          return send(res, 406, {
            code: "PGRST116",
            details: `The result contains ${projected.length} rows`,
            hint: null,
            message: "JSON object requested, multiple (or no) rows returned",
          });
        }
        return send(res, status, projected[0]);
      }
      return send(res, status, projected);
    };

    if (req.method === "GET" || req.method === "HEAD") {
      let result = applyOrder(applyFilters(rows, params), params.get("order"));
      const total = result.length;
      const offset = Number(params.get("offset") || 0);
      const limit = params.has("limit") ? Number(params.get("limit")) : Infinity;
      result = result.slice(offset, offset + limit);
      const range = { "content-range": `${result.length ? `${offset}-${offset + result.length - 1}` : "*"}/${prefer.includes("count=") ? total : "*"}` };
      if (req.method === "HEAD") {
        res.writeHead(200, range);
        return res.end();
      }
      if (wantsObject) return finish(result);
      res.writeHead(200, { "content-type": "application/json", ...range });
      return res.end(JSON.stringify(result.map((r) => project(name, r, sel))));
    }

    if (req.method === "POST") {
      const items = Array.isArray(body) ? body : [body];
      const inserted = items.map((item) => {
        const row = { ...item };
        if (row.id === undefined) row.id = ++seq[name] || (seq[name] = 1);
        else seq[name] = Math.max(seq[name] || 0, Number(row.id) || 0);
        trigger(name, row, true);
        rows.push(row);
        return row;
      });
      if (!returnRep) return send(res, 201, undefined);
      return finish(inserted, 201);
    }

    if (req.method === "PATCH") {
      const matched = applyFilters(rows, params);
      for (const row of matched) {
        Object.assign(row, body);
        trigger(name, row, false);
      }
      if (!returnRep) return send(res, 204, undefined);
      return finish(matched);
    }

    if (req.method === "DELETE") {
      const matched = applyFilters(rows, params);
      db[name] = rows.filter((r) => !matched.includes(r));
      if (!returnRep) return send(res, 204, undefined);
      return finish(matched);
    }
    return send(res, 405, { message: "method" });
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const u = new URL(req.url, "http://stub");
      try {
        if (u.pathname.startsWith("/rest/v1/rpc/")) {
          // Database functions the API calls (see RPC below).
          const name = u.pathname.slice("/rest/v1/rpc/".length);
          const args = raw.length ? JSON.parse(raw.toString("utf8")) : {};
          log.push({ method: req.method, rpc: name, body: args });
          const fn = RPC[name];
          if (!fn || state.missingRpc?.includes(name)) {
            return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${name}`, details: null, hint: null });
          }
          return send(res, 200, fn(args, table));
        }
        if (u.pathname.startsWith("/rest/v1/")) {
          const name = u.pathname.slice("/rest/v1/".length);
          const body = raw.length ? JSON.parse(raw.toString("utf8")) : undefined;
          return rest(req, res, body, name, u.searchParams);
        }
        if (u.pathname === "/auth/v1/user") {
          const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
          const uid = tokens[token];
          log.push({ method: req.method, auth: token ? "token" : "none" });
          if (!uid) return send(res, 401, { code: 401, msg: "invalid JWT" });
          return send(res, 200, { id: uid, aud: "authenticated", role: "authenticated", email: `${uid}@example.test` });
        }
        const up = u.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
        if (up && (req.method === "POST" || req.method === "PUT")) {
          const [, bucket, path] = up;
          const key = `${bucket}/${decodeURIComponent(path)}`;
          log.push({ method: req.method, storage: key });
          if (storage.objects[key] && req.method === "POST" && req.headers["x-upsert"] !== "true") {
            return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
          }
          storage.objects[key] = { bytes: raw, type: req.headers["content-type"] };
          storage.uploads.push(key);
          return send(res, 200, { Key: key, Id: key });
        }
        const pub = u.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
        if (pub && (req.method === "GET" || req.method === "HEAD")) {
          const obj = storage.objects[`${pub[1]}/${decodeURIComponent(pub[2])}`];
          if (!obj) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
          res.writeHead(200, { "content-type": obj.type || "application/octet-stream", "content-length": String(obj.bytes.length) });
          return res.end(req.method === "HEAD" ? undefined : obj.bytes);
        }
        if (u.pathname.startsWith("/storage/v1/object/") && req.method === "DELETE") {
          storage.removed.push(u.pathname);
          return send(res, 200, []);
        }
        if (u.pathname.startsWith("/storage/v1/")) {
          storage.removed.push(`${req.method} ${u.pathname}`);
          return send(res, 200, []);
        }
        send(res, 404, { message: `stub: no route ${req.method} ${u.pathname}` });
      } catch (err) {
        send(res, 500, { message: String(err && err.message) });
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    url,
    db,
    log,
    storage,
    state,
    table,
    reset,
    close: () => new Promise((r) => server.close(r)),
  };
}
