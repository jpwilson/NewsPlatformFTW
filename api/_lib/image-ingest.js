/**
 * Downloading and re-hosting article images (Content API).
 *
 * - fetchRemoteImage: a guarded download. http/https only; localhost and
 *   private, loopback and link-local addresses refused (IP literals and DNS
 *   answers); redirects followed by hand, at most 5, each hop re-checked;
 *   8 s timeout; 10 MB cap; content type AND magic bytes must be
 *   jpeg/png/gif/webp.
 * - storeImageBuffer: content-addressed upload, `c/<sha256:32>.<ext>`; an
 *   object that already exists is success (same bytes, same name), so the
 *   same photo is stored once however many times it is sent.
 * - ingestArticleMedia: cover + gallery + external body images, grouped by
 *   imageKey so each photo is downloaded once, four at a time. Returns the
 *   rows to attach, the body with re-hosted src attributes, warnings, and
 *   per-image failures (the caller decides whether those are fatal).
 *
 * Plain ESM; node built-ins and the shared module only. Nothing is deleted.
 */

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  BUCKET,
  imageKey,
  joinCaptionCredit,
  storagePathFromUrl,
  toStoredUrl,
} from "../../shared/article-media.js";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 5;
const CONCURRENCY = 4;
const MAX_BODY_IMAGES = 20;
const USER_AGENT = "NewsPlatform-ContentAPI/1.1 (+https://www.newsplatform.org)";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

/* ------------------------------------------------------------ addresses */

function ipv4Private(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6Private(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || s.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  const hexMapped = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (first & 0xff00) === 0xff00 || // multicast
    s.startsWith("64:ff9b:") // NAT64 (can reach IPv4 private space)
  );
}

/** True for an address no server-side fetch may reach. */
export function isPrivateAddress(ip) {
  const kind = isIP(String(ip).replace(/^\[|\]$/g, ""));
  if (kind === 4) return ipv4Private(ip);
  if (kind === 6) return ipv6Private(ip);
  return true;
}

/**
 * Test-only escape hatch: `NP_INGEST_ALLOW_HOSTS=127.0.0.1:1234,…` lets the
 * offline tests fetch from local stub servers. Ignored on Vercel.
 */
function allowedForTests(url) {
  if (process.env.VERCEL) return false;
  const list = String(process.env.NP_INGEST_ALLOW_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(url.host);
}

/** Throws a coded error unless `url` is a public http(s) URL. */
export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw ingestError("invalid_url", "Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw ingestError("invalid_url", "Only http and https URLs");
  if (url.username || url.password) throw ingestError("blocked_url", "Credentials in URL");
  if (allowedForTests(url)) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw ingestError("blocked_url", "Host not allowed");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw ingestError("blocked_url", "Private address not allowed");
    return url;
  }
  let answers;
  try {
    answers = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw ingestError("download_failed", "Host did not resolve");
  }
  if (!answers.length || answers.some((a) => isPrivateAddress(a.address))) {
    throw ingestError("blocked_url", "Host resolves to a private address");
  }
  return url;
}

function ingestError(reason, message) {
  const err = new Error(message);
  err.reason = reason;
  return err;
}

/* ------------------------------------------------------------- download */

/** The image type its first bytes prove, or null. */
export function sniffImageType(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

async function readCapped(response, limit) {
  const len = Number(response.headers.get("content-length"));
  if (Number.isFinite(len) && len > limit) throw ingestError("too_large", "Image larger than 10 MB");
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > limit) throw ingestError("too_large", "Image larger than 10 MB");
    return buf;
  }
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
      throw ingestError("too_large", "Image larger than 10 MB");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Download one image with every guard on. Resolves to
 * `{ buffer, contentType, finalUrl }` or rejects with `err.reason` set to
 * invalid_url | blocked_url | download_failed | timeout | too_large |
 * unsupported_type.
 */
export async function fetchRemoteImage(rawUrl, { timeoutMs = FETCH_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublicUrl(current);
      let response;
      try {
        response = await fetchImpl(url.href, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "image/jpeg,image/png,image/gif,image/webp;q=0.9,*/*;q=0.1" },
        });
      } catch (err) {
        if (controller.signal.aborted) throw ingestError("timeout", "Download timed out");
        throw ingestError("download_failed", "Download failed");
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        try {
          await response.body?.cancel();
        } catch {}
        if (!location) throw ingestError("download_failed", "Redirect without a location");
        if (hop === MAX_REDIRECTS) throw ingestError("download_failed", "Too many redirects");
        current = new URL(location, url).href;
        continue;
      }
      if (response.status !== 200) {
        try {
          await response.body?.cancel();
        } catch {}
        throw ingestError("download_failed", `HTTP ${response.status}`);
      }
      const declared = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!EXT[declared]) {
        try {
          await response.body?.cancel();
        } catch {}
        throw ingestError("unsupported_type", `Unsupported type ${declared || "(none)"}`);
      }
      let buffer;
      try {
        buffer = await readCapped(response, MAX_IMAGE_BYTES);
      } catch (err) {
        if (err.reason) throw err;
        if (controller.signal.aborted) throw ingestError("timeout", "Download timed out");
        throw ingestError("download_failed", "Download failed");
      }
      // Both the declared type and the bytes must be a supported image; the
      // bytes decide the stored type.
      const actual = sniffImageType(buffer);
      if (!actual) throw ingestError("unsupported_type", "Content is not a supported image");
      return { buffer, contentType: actual, finalUrl: url.href };
    }
    throw ingestError("download_failed", "Too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- store */

/** `c/<first 32 hex of sha256>.<ext>` */
export function contentPath(buffer, contentType) {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  return `c/${hash}.${EXT[contentType] || "jpg"}`;
}

/**
 * Upload by content; "already exists" counts as success.
 * @returns {Promise<string>} the public URL (the stored form)
 */
export async function storeImageBuffer(sb, buffer, contentType) {
  const path = contentPath(buffer, contentType);
  const bucket = sb.storage.from(BUCKET);
  const { error } = await bucket.upload(path, buffer, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) {
    const status = String(error.statusCode ?? error.status ?? "");
    if (!(status === "409" || /already exists|duplicate/i.test(String(error.message || error.error || "")))) {
      const err = ingestError("upload_failed", "Upload failed");
      err.cause = error;
      throw err;
    }
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

/* --------------------------------------------------------------- ingest */

/** `"url"` or `{ url, caption?, credit? }` -> `{ url, caption }`, or null. */
export function normalizeImageInput(input) {
  if (typeof input === "string") return input.trim() ? { url: input.trim(), caption: "" } : null;
  if (!input || typeof input !== "object") return null;
  const url = typeof input.url === "string" ? input.url.trim() : typeof input.image_url === "string" ? input.image_url.trim() : "";
  if (!url) return null;
  return { url, caption: joinCaptionCredit(input.caption, input.credit) };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const SRC_ATTR = /(\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

const decodeAttr = (v) => v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const encodeAttr = (v) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** External http(s) `<img src>` values in document order (decoded). */
export function bodyImageUrls(html) {
  const out = [];
  for (const tag of String(html || "").match(IMG_TAG) || []) {
    const m = tag.match(SRC_ATTR);
    if (!m) continue;
    const src = decodeAttr(m[2] ?? m[3] ?? m[4] ?? "");
    if (/^https?:\/\//i.test(src)) out.push(src);
  }
  return out;
}

/** Replace `<img src>` values whose decoded URL is in `map`. */
export function rewriteBodySrc(html, map) {
  if (!map.size) return html;
  return String(html || "").replace(IMG_TAG, (tag) =>
    tag.replace(SRC_ATTR, (whole, prefix, dq, sq, bare) => {
      const src = decodeAttr(dq ?? sq ?? bare ?? "");
      const next = map.get(src);
      return next ? `${prefix}"${encodeAttr(next)}"` : whole;
    })
  );
}

/**
 * Download and re-host the attached images and the external body images.
 *
 * @param {any} sb
 * @param {{
 *   attached: { url: string, caption: string, field: string }[],
 *   html?: string,
 *   supabaseUrl: string,
 *   rehostBody?: boolean,
 *   fetchImpl?: typeof fetch,
 * }} input  attached[0] is the cover.
 * @returns {Promise<{
 *   rows: { image_url: string, caption: string, field: string }[],
 *   html: string,
 *   warnings: { field: string, url: string, reason: string }[],
 *   failures: { field: string, url: string, reason: string }[],
 * }>}
 *   rows: attached images that succeeded, in input order. failures: attached
 *   images that failed (the caller is lenient or strict). Body images that
 *   failed keep their URL and are reported in warnings only.
 */
export async function ingestArticleMedia(sb, { attached = [], html = "", supabaseUrl, rehostBody = true, fetchImpl } = {}) {
  const warnings = [];
  const failures = [];
  const groups = new Map(); // key -> { url, stored?, error? }

  const keyFor = (url) => {
    const key = imageKey(url);
    if (!groups.has(key)) groups.set(key, { url });
    return key;
  };

  const attachedKeys = attached.map((img) => keyFor(img.url));
  const bodyUrls = rehostBody ? bodyImageUrls(html).filter((u) => !storagePathFromUrl(u)) : [];
  const bodyKeys = [];
  for (const u of bodyUrls) {
    const key = imageKey(u);
    if (groups.has(key) || bodyKeys.length < MAX_BODY_IMAGES) bodyKeys.push(keyFor(u));
    else warnings.push({ field: "content", url: u, reason: "too_many_images" });
  }

  await mapLimit([...groups.entries()], CONCURRENCY, async ([, group]) => {
    if (storagePathFromUrl(group.url)) {
      // One of ours (a /media or storage URL returned earlier): no download.
      group.stored = toStoredUrl(group.url, supabaseUrl);
      return;
    }
    try {
      const { buffer, contentType } = await fetchRemoteImage(group.url, fetchImpl ? { fetchImpl } : undefined);
      group.stored = await storeImageBuffer(sb, buffer, contentType);
    } catch (err) {
      group.error = err.reason || "download_failed";
      if (!err.reason) console.error("Image ingest failed:", group.url, err);
    }
  });

  const rows = [];
  attached.forEach((img, i) => {
    const group = groups.get(attachedKeys[i]);
    if (group.stored) rows.push({ image_url: group.stored, caption: img.caption || "", field: img.field });
    else failures.push({ field: img.field, url: img.url, reason: group.error || "download_failed" });
  });

  const srcMap = new Map();
  bodyUrls.forEach((u) => {
    const group = groups.get(imageKey(u));
    if (!group) return;
    if (group.stored) srcMap.set(u, group.stored);
    else if (!warnings.some((w) => w.field === "content" && w.url === u)) {
      warnings.push({ field: "content", url: u, reason: group.error || "download_failed" });
    }
  });

  return { rows, html: rewriteBodySrc(html, srcMap), warnings, failures };
}

/* ------------------------------------------------------- request fields */

/**
 * The image fields of a Content API body, validated and normalised.
 *
 *   images      legacy full list, first = cover (cannot be combined)
 *   coverImage  Image | null
 *   gallery     Image[]
 *
 * An Image is `"url"` or `{ url, caption?, credit? }`; credit is folded into
 * the caption as "… Photo: <credit>". Legacy entries that are not images are
 * skipped with a warning (as before); new-style ones are a 400.
 *
 * @returns {{ error: string } | {
 *   legacy?: { url: string, caption: string, field: string, order?: number }[],
 *   cover?: { url: string, caption: string, field: string } | null,
 *   gallery?: { url: string, caption: string, field: string }[],
 *   warnings: { field: string, url: string, reason: string }[],
 * }}
 */
export function parseImageFields(body) {
  const { images, coverImage, gallery } = body || {};
  const warnings = [];
  if (images !== undefined && (coverImage !== undefined || gallery !== undefined)) {
    return { error: "Use either images or coverImage/gallery, not both" };
  }
  const out = { warnings };
  if (images !== undefined && images !== null) {
    if (!Array.isArray(images)) return { error: "images must be an array" };
    if (images.length > 5) return { error: "Maximum 5 images allowed" };
    out.legacy = [];
    images.forEach((raw, i) => {
      const img = normalizeImageInput(raw);
      if (!img) {
        warnings.push({ field: `images[${i}]`, url: "", reason: "invalid_url" });
        return;
      }
      const order = raw && typeof raw === "object" && Number.isFinite(raw.order) ? raw.order : i;
      out.legacy.push({ ...img, field: `images[${i}]`, order });
    });
  }
  if (coverImage !== undefined) {
    if (coverImage === null) out.cover = null;
    else {
      const img = normalizeImageInput(coverImage);
      if (!img) return { error: "coverImage must be a URL string or { url, caption?, credit? }" };
      out.cover = { ...img, field: "coverImage" };
    }
  }
  if (gallery !== undefined) {
    if (!Array.isArray(gallery)) return { error: "gallery must be an array" };
    out.gallery = [];
    for (let i = 0; i < gallery.length; i++) {
      const img = normalizeImageInput(gallery[i]);
      if (!img) return { error: `gallery[${i}] must be a URL string or { url, caption?, credit? }` };
      out.gallery.push({ ...img, field: `gallery[${i}]` });
    }
  }
  const explicitCount = (out.cover ? 1 : 0) + (out.gallery ? out.gallery.length : 0);
  if (explicitCount > 5) return { error: "Maximum 5 images allowed (cover included)" };
  return out;
}
