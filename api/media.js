/**
 * GET /media/<object path>: permanent image URLs for the article-images bucket.
 *
 * Every image URL the site emits is /media/<path>. This function fetches the
 * object from the public bucket and serves it with a one-year immutable cache,
 * so Vercel's CDN answers repeat requests and a photo's URL never expires.
 *
 * It imports nothing (no npm, no shared modules) so it cannot fail to load the
 * way the prerenderer did in October 2026 (see SEO.md). Only raster images are
 * served, and what counts is the file's first bytes, never its label or name:
 * SVG and HTML are refused whatever they claim to be.
 */

const BUCKET = "article-images";
const MAX_INLINE = 4_000_000; // Vercel caps a function response at ~4.5 MB
const SAFE_PATH = /^[A-Za-z0-9._\/-]+$/;
const TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

/** @param {string} path */
export function isValidMediaPath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 300 &&
    SAFE_PATH.test(path) &&
    !path.startsWith("/") &&
    !path.split("/").some((seg) => seg === ".." || seg === "." || seg === "")
  );
}

/**
 * The image type its first bytes prove, or null.
 * @param {Uint8Array} b
 * @returns {string | null}
 */
export function sniffImageType(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "image/avif";
  return null;
}

function pathFromRequest(req) {
  const url = typeof req.url === "string" ? req.url : "";
  const pathname = url.split("?")[0].split("#")[0];
  if (pathname.startsWith("/media/")) return pathname.slice("/media/".length);
  const q = req.query && req.query.path;
  if (typeof q === "string") return q.replace(/^\/?media\//, "");
  if (Array.isArray(q)) return q.join("/");
  // /api/media.js?path=… without Vercel's parsed query
  const m = url.match(/[?&]path=([^&#]*)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]).replace(/^\/?media\//, "");
    } catch {
      return "";
    }
  }
  return "";
}

function send(res, status, headers, body) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

const textHeaders = (cache) => ({
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": cache,
  "X-Content-Type-Options": "nosniff",
});

/** Reads at most `limit` bytes; returns null when the body is larger. */
async function readCapped(response, limit) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.length > limit ? null : buf;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      try {
        await reader.cancel();
      } catch {}
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return send(res, 405, { ...textHeaders("no-store"), Allow: "GET, HEAD" }, "Method not allowed");
  }

  let path = pathFromRequest(req);
  try {
    // Only percent-escapes that decode to the safe charset survive validation.
    path = decodeURIComponent(path);
  } catch {
    return send(res, 400, textHeaders("no-store"), "Bad path");
  }
  if (!isValidMediaPath(path)) return send(res, 400, textHeaders("no-store"), "Bad path");

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!supabaseUrl) return send(res, 503, textHeaders("no-store"), "Storage not configured");
  const upstreamUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;

  let upstream;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    upstream = await fetch(upstreamUrl, { signal: controller.signal, redirect: "follow" });
  } catch {
    clearTimeout(timer);
    return send(res, 502, textHeaders("no-store"), "Upstream unavailable");
  }

  try {
    if (upstream.status !== 200) {
      try {
        await upstream.body?.cancel();
      } catch {}
      return send(res, 404, textHeaders("public, max-age=60"), "Not found");
    }

    // The bytes decide what a file is, not the type it was uploaded with: older
    // uploads carry whatever the browser claimed (or nothing useful), and a
    // photo must not vanish over a wrong label. A file too large to inspect is
    // only passed on when storage itself calls it a raster image.
    const declared = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const unsupported = () => send(res, 415, textHeaders("public, max-age=60"), "Unsupported media type");
    const tooLarge = async () => {
      try {
        await upstream.body?.cancel();
      } catch {}
      if (!TYPES.has(declared)) return unsupported();
      return send(
        res,
        302,
        { Location: upstreamUrl, "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
        ""
      );
    };

    const length = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_INLINE) return tooLarge();

    const bytes = await readCapped(upstream, MAX_INLINE);
    if (!bytes) return tooLarge();

    const actual = sniffImageType(bytes);
    if (!actual) return unsupported();

    const headers = {
      "Content-Type": actual,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Access-Control-Allow-Origin": "*",
    };
    const etag = upstream.headers.get("etag");
    if (etag) headers.ETag = etag;
    const lastModified = upstream.headers.get("last-modified");
    if (lastModified) headers["Last-Modified"] = lastModified;

    return send(res, 200, headers, method === "HEAD" ? undefined : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
  } finally {
    clearTimeout(timer);
  }
}
