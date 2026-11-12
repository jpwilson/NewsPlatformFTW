/**
 * Article images: permanent URLs, the cover, duplicates, captions, excerpts.
 *
 * One module for the browser (Vite), the Express API (api/index.ts) and the
 * crawler prerenderer (api/prerender-article.js), so all three make the same
 * decision about which photo is the hero and which body figure is a duplicate.
 *
 * It deliberately has no imports and is plain JavaScript (types in
 * article-media.d.ts), the same pattern as article-html-policy.js: a Vercel
 * function cannot load it wrongly, and adding it adds no npm dependency.
 *
 * URL forms
 *   served:  /media/<object path>             (relative in the SPA)
 *            https://www.newsplatform.org/media/<object path>   (API, crawlers)
 *   stored:  <SUPABASE_URL>/storage/v1/object/public/article-images/<object path>
 *   legacy:  …/storage/v1/object/sign/article-images/<path>?token=…  (expires)
 *
 * All functions are pure string transforms; none of them fetches anything.
 */

/** The storage bucket every article, channel and editor image lives in. */
export const BUCKET = "article-images";

/**
 * The `last_edited` column is bumped by a database trigger on every UPDATE,
 * including view-count increments, so it is not an edit time. Until that
 * trigger is fixed: no "Updated" label, dateModified = datePublished, and
 * sitemap lastmod = publish date.
 */
export const LAST_EDITED_IS_TRUSTWORTHY = false;

/* ------------------------------------------------------------ URL helpers */

const SAFE_PATH = /^[A-Za-z0-9._\/-]+$/;
const MAX_PATH = 300;

/** True for an object path /media/ will serve: safe charset, no `..`, ≤300. */
export function isSafeStoragePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= MAX_PATH &&
    SAFE_PATH.test(path) &&
    !path.startsWith("/") &&
    !path.split("/").some((seg) => seg === ".." || seg === ".")
  );
}

/**
 * Hosts whose `/media/<path>` URLs are ours: the site, its subdomains, Vercel
 * preview hosts and local development. A `/media/` path on any other host is
 * someone else's image and is left alone.
 */
function isOurSiteHost(host) {
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "");
  return (
    h === "newsplatform.org" ||
    h.endsWith(".newsplatform.org") ||
    h.endsWith(".vercel.app") ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]"
  );
}

/** Supabase hosts (the hosted service). Our bucket name alone is not enough. */
function isSupabaseHost(host) {
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "");
  return /^[a-z0-9-]+\.supabase\.(co|in)$/.test(h);
}

const STORAGE_PATH_RE = new RegExp(
  "^/storage/v1/(?:object/(?:sign|public|authenticated)|render/image/(?:public|sign|authenticated))/" +
    BUCKET +
    "/(.+)$"
);

/**
 * The object path inside our bucket for any form of one of our image URLs,
 * else null. Accepts `/media/<p>`, `https://<our host>/media/<p>`, and Supabase
 * `object/sign|public|authenticated/article-images/<p>[?token=…]` and
 * `render/image/public/article-images/<p>` URLs.
 * @param {unknown} url
 * @returns {string | null}
 */
export function storagePathFromUrl(url) {
  if (typeof url !== "string") return null;
  const raw = url.trim().replace(/&amp;/g, "&");
  if (!raw) return null;

  let host = "";
  let pathname = raw;
  const abs = raw.match(/^(?:https?:)?\/\/([^\/?#]+)(\/[^?#]*)?/i);
  if (abs) {
    host = abs[1];
    pathname = abs[2] || "/";
  } else if (raw.startsWith("/")) {
    pathname = raw.replace(/[?#].*$/, "");
  } else {
    return null;
  }

  let path = null;
  if (pathname.startsWith("/media/") && (!host || isOurSiteHost(host))) {
    path = pathname.slice("/media/".length);
  } else if (host && isSupabaseHost(host)) {
    const m = pathname.match(STORAGE_PATH_RE);
    if (m) path = m[1];
  }
  return path && isSafeStoragePath(path) ? path : null;
}

/**
 * The served form: `origin + "/media/" + path` for one of our images, else the
 * input unchanged (external images, data the function does not recognise).
 * @param {string} url
 * @param {string} [origin] "" for a site-relative URL, or "https://host".
 */
export function toMediaUrl(url, origin = "") {
  const path = storagePathFromUrl(url);
  return path ? `${trimSlash(origin)}/media/${path}` : url;
}

/**
 * The stored form: the Supabase public URL for one of our images, else the
 * input unchanged. Works with or without /media deployed, so a rollback can
 * never break a stored photo.
 * @param {string} url
 * @param {string} supabaseUrl e.g. https://<ref>.supabase.co
 */
export function toStoredUrl(url, supabaseUrl) {
  const path = storagePathFromUrl(url);
  if (!path || !supabaseUrl) return url;
  return publicStorageUrl(path, supabaseUrl);
}

/** `<supabaseUrl>/storage/v1/object/public/article-images/<path>` */
export function publicStorageUrl(path, supabaseUrl) {
  return `${trimSlash(supabaseUrl)}/storage/v1/object/public/${BUCKET}/${path}`;
}

function trimSlash(s) {
  return String(s || "").replace(/\/+$/, "");
}

// Pieces shared by the two text rewriters. `\\?/` matches a slash written
// plainly or JSON-escaped as `\/`.
const SL = "\\\\?/";
const PATH_CHARS = "(?:[^\\s\"'<>?#\\\\&()]|\\\\/)+"; // stops at quotes, `\"`, `?`, `)`
const QUERY = "(?:\\?(?:[A-Za-z0-9._~=&;%+\\-]|\\\\u0026)*)?";

const SUPABASE_IN_TEXT = new RegExp(
  "https?:" + SL + SL + "([A-Za-z0-9-]+\\.supabase\\.(?:co|in))" + SL +
    "storage" + SL + "v1" + SL +
    "(?:object" + SL + "(?:sign|public|authenticated)|render" + SL + "image" + SL + "(?:public|sign|authenticated))" +
    SL + BUCKET + SL + "(" + PATH_CHARS + ")" + QUERY,
  "g"
);

const MEDIA_IN_TEXT = new RegExp(
  "(?:(https?:" + SL + SL + ")([A-Za-z0-9.\\-]+(?::\\d+)?|\\[::1\\](?::\\d+)?))?" +
    SL + "media" + SL + "(" + PATH_CHARS + ")" + QUERY,
  "g"
);

const unescapeSlashes = (s) => s.replace(/\\\//g, "/");

/**
 * Every Supabase storage URL for our bucket inside any text (JSON, HTML),
 * token included, becomes `origin/media/<path>`. Safe on JSON-escaped text
 * (`\/`, `\"`) and on HTML-escaped query strings (`&amp;`). A URL whose path
 * /media/ could not serve is left untouched.
 * @param {string} text
 * @param {string} [origin]
 */
export function rewriteStorageUrls(text, origin = "") {
  if (typeof text !== "string" || text.indexOf(BUCKET) === -1) return text;
  const base = trimSlash(origin);
  return text.replace(SUPABASE_IN_TEXT, (match, _host, rawPath) => {
    const path = unescapeSlashes(rawPath);
    return isSafeStoragePath(path) ? `${base}/media/${path}` : match;
  });
}

/**
 * The reverse, for writes: `/media/<path>` (relative, or absolute on one of
 * our hosts) inside any text becomes the Supabase public URL. A relative
 * match must start a URL (after a quote, `(`, `=`, whitespace or `>`), so
 * `https://elsewhere.example/a/media/x.jpg` is never touched.
 * @param {string} text
 * @param {string} supabaseUrl
 */
export function storeMediaUrls(text, supabaseUrl) {
  if (typeof text !== "string" || !supabaseUrl || text.indexOf("media") === -1) return text;
  return text.replace(MEDIA_IN_TEXT, (match, scheme, host, rawPath, offset, whole) => {
    if (scheme) {
      if (!isOurSiteHost(host)) return match;
    } else {
      const before = offset > 0 ? whole[offset - 1] : "";
      if (before && !/["'(=\s>]/.test(before)) return match;
    }
    const path = unescapeSlashes(rawPath);
    if (!isSafeStoragePath(path)) return match;
    const escaped = match.includes("\\/");
    const out = publicStorageUrl(path, supabaseUrl);
    return escaped ? out.replace(/\//g, "\\/") : out;
  });
}

/* ------------------------------------------------------------- identity */

const SIZING_PARAMS = new Set([
  "w", "h", "width", "height", "q", "quality", "fit", "crop", "dpr", "auto", "fm", "format",
]);

function decodeSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** MediaWiki file title: underscores for spaces, first letter upper case. */
function wikimediaName(name) {
  const n = decodeSafe(decodeSafe(name)).replace(/^(?:File|Image):/i, "").replace(/ /g, "_").trim();
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
}

/**
 * A stable identity for "the same photo" across URL forms:
 *   s:<object path>   anything in our bucket (/media, signed, public, render)
 *   wm:<File_name>    Wikimedia Commons (Special:FilePath, Special:Redirect,
 *                     File: pages, upload.wikimedia.org originals and thumbs)
 *   u:<host><path>?<query>   otherwise, sizing parameters removed
 * @param {unknown} url
 * @returns {string}
 */
export function imageKey(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  const raw = url.trim().replace(/&amp;/g, "&");
  const path = storagePathFromUrl(raw);
  if (path) return `s:${path}`;

  let parsed;
  try {
    parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return `u:${raw}`;
  }
  const host = parsed.hostname.toLowerCase();
  if (/(^|\.)(wikimedia|wikipedia)\.org$/.test(host)) {
    const p = parsed.pathname;
    let m = p.match(/\/wiki\/Special:(?:FilePath|Redirect\/file)\/(.+)$/i);
    if (!m) m = p.match(/\/wiki\/(?:File|Image):(.+)$/i);
    if (!m && /\/thumb\//.test(p)) m = p.match(/\/thumb\/(?:[0-9a-f]\/[0-9a-f]{2}\/)?([^\/]+)\/[^\/]+$/i);
    if (!m && host === "upload.wikimedia.org") m = p.match(/\/([^\/]+)$/);
    if (!m && /Special:(?:FilePath|Redirect)/i.test(p) && parsed.searchParams.get("file")) {
      m = [null, parsed.searchParams.get("file")];
    }
    if (m && m[1]) {
      const name = wikimediaName(m[1]);
      if (name) return `wm:${name}`;
    }
  }
  const kept = [];
  parsed.searchParams.forEach((v, k) => {
    if (!SIZING_PARAMS.has(k.toLowerCase())) kept.push(`${k}=${v}`);
  });
  return `u:${host}${parsed.pathname}${kept.length ? `?${kept.join("&")}` : ""}`;
}

/* -------------------------------------------------------------- captions */

const CREDIT_RE = /(^|[\s.;,(—–-])(?:Photo(?:graph)?(?: credit)?|Photos|Image|Credit|Picture)\s*:\s*([^:]{1,200})$/i;

/**
 * Credit lives at the end of the caption as `… Photo: <credit>` (there is no
 * credit column). Returns both parts, trimmed; credit is "" when absent.
 * @param {unknown} text
 */
export function splitCaptionCredit(text) {
  const s = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!s) return { caption: "", credit: "" };
  const m = s.match(CREDIT_RE);
  if (!m) return { caption: s, credit: "" };
  const credit = m[2].trim();
  if (!credit) return { caption: s, credit: "" };
  const cut = m.index + m[1].length;
  const caption = s.slice(0, cut).replace(/[\s(—–-]+$/, "").trim();
  return { caption, credit };
}

/**
 * Inverse of splitCaptionCredit: `<caption> Photo: <credit>`.
 * @param {string | null | undefined} caption
 * @param {string | null | undefined} credit
 */
export function joinCaptionCredit(caption, credit) {
  const c = String(caption || "").replace(/\s+/g, " ").trim();
  const k = String(credit || "").replace(/\s+/g, " ").trim();
  if (!k) return c;
  if (splitCaptionCredit(c).credit === k) return c;
  return c ? `${c} Photo: ${k}` : `Photo: ${k}`;
}

function normalizeCaption(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.。!]+$/, "")
    .trim();
}

/* ------------------------------------------------------------ text utils */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function escapeText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Visible text of an HTML fragment: tags dropped, entities decoded, spaces collapsed. */
function htmlToText(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/* ---------------------------------------------------------- excerpt, dek */

const DEK_RE = /^\s*<p\b[^>]*\bclass\s*=\s*(["'])(?:[^"']*\s)?article-dek(?:\s[^"']*)?\1[^>]*>([\s\S]*?)<\/p>\s*/i;

/**
 * The standfirst stored as a leading `<p class="article-dek">…</p>`.
 * @param {string} html
 * @returns {{ dek: string | null, html: string }} html is the body without it.
 */
export function extractDek(html) {
  const s = typeof html === "string" ? html : "";
  const m = s.match(DEK_RE);
  if (!m) return { dek: null, html: s };
  const dek = htmlToText(m[2]);
  return { dek: dek || null, html: s.slice(m[0].length) };
}

/**
 * Insert, replace or (with null / "") remove the standfirst.
 * @param {string} html
 * @param {string | null | undefined} dek plain text
 */
export function setDek(html, dek) {
  const rest = extractDek(html).html;
  const text = typeof dek === "string" ? dek.replace(/\s+/g, " ").trim() : "";
  return text ? `<p class="article-dek">${escapeText(text)}</p>\n${rest}` : rest;
}

function truncateWords(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—–-]+$/, "")}…`;
}

/**
 * A short description: the standfirst; else the first paragraph outside
 * callouts, figures and tables; else the first bullet of the summary callout;
 * else the first words of the text. At most `max` characters.
 * @param {string} html
 * @param {number} [max]
 */
export function deriveExcerpt(html, max = 200) {
  const s = typeof html === "string" ? html : "";
  const { dek, html: rest } = extractDek(s);
  if (dek) return truncateWords(dek, max);
  const outside = rest
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<figure\b[\s\S]*?<\/figure>/gi, " ")
    .replace(/<table\b[\s\S]*?<\/table>/gi, " ")
    .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, " ");
  for (const m of outside.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = htmlToText(m[1]);
    if (t.length >= 20) return truncateWords(t, max);
  }
  const summary = rest.match(/<aside\b[^>]*callout-summary[^>]*>([\s\S]*?)<\/aside>/i);
  if (summary) {
    const li = summary[1].match(/<li\b[^>]*>([\s\S]*?)<\/li>/i);
    if (li) {
      const t = htmlToText(li[1]);
      if (t) return truncateWords(t, max);
    }
  }
  return truncateWords(htmlToText(rest), max);
}

/** Reading time in whole minutes (225 words a minute, at least 1). */
export function readMinutes(html) {
  const text = htmlToText(String(html || "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " "));
  const words = text ? text.split(" ").length : 0;
  return Math.max(1, Math.ceil(words / 225));
}

/* ------------------------------------------------------------- ordering */

function sortNum(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Attached image rows sorted by (order, id); rows without either keep their
 * input order. The first row is the cover. Returns a new array.
 * @template T
 * @param {T[] | null | undefined} images
 * @returns {T[]}
 */
export function sortImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((img, i) => ({ img, i }))
    .sort((a, b) => {
      const ao = sortNum(a.img && a.img.order);
      const bo = sortNum(b.img && b.img.order);
      if (ao !== bo) return ao < bo ? -1 : 1;
      const ai = sortNum(a.img && a.img.id);
      const bi = sortNum(b.img && b.img.id);
      if (ai !== bi) return ai < bi ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.img);
}

/* ------------------------------------------------------- body scanning */

const VOID = new Set(["img", "br", "hr", "source", "col", "input", "meta", "link", "wbr", "area", "base", "embed", "track", "param"]);
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|<!--[\s\S]*?-->/g;

function attr(attrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i");
  const m = attrs.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : "";
}

function hasClass(attrs, cls) {
  return attr(attrs, "class").split(/\s+/).includes(cls);
}

/**
 * Elements of interest in a body: images (with their figure, gallery and
 * paragraph), figures, galleries and paragraphs, as [start, end) offsets.
 */
function scanBody(html) {
  const images = [];
  const figures = [];
  const galleries = [];
  const paragraphs = [];
  const stack = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    if (!m[2]) continue; // comment
    const name = m[2].toLowerCase();
    const closing = m[1] === "/";
    const attrs = m[3] || "";
    const start = m.index;
    const end = m.index + m[0].length;
    if (!closing) {
      const inner = (n) => {
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === n) return stack[i];
        return null;
      };
      if (name === "img") {
        const fig = inner("figure");
        const gal = stack.slice().reverse().find((e) => e.gallery) || null;
        const par = inner("p");
        const img = {
          start,
          end,
          src: attr(attrs, "src"),
          alt: attr(attrs, "alt"),
          figure: fig ? fig.rec : null,
          gallery: gal ? gal.rec : null,
          paragraph: par ? par.rec : null,
        };
        images.push(img);
        if (fig) fig.rec.images.push(img);
        if (gal) gal.rec.images.push(img);
        if (par) par.rec.images.push(img);
        continue;
      }
      if (VOID.has(name) || m[4] === "/") continue;
      const el = { name, rec: null, gallery: false };
      if (name === "figure") {
        el.rec = { start, end: -1, images: [], captionStart: -1, captionEnd: -1 };
        figures.push(el.rec);
      } else if (name === "div" && hasClass(attrs, "article-gallery")) {
        el.rec = { start, end: -1, images: [] };
        el.gallery = true;
        galleries.push(el.rec);
      } else if (name === "p") {
        el.rec = { start, end: -1, images: [], innerStart: end, innerEnd: -1 };
        paragraphs.push(el.rec);
      } else if (name === "figcaption") {
        const fig = stack.slice().reverse().find((e) => e.name === "figure");
        if (fig && fig.rec.captionStart < 0) fig.rec.captionStart = end;
        el.captionOf = fig ? fig.rec : null;
      }
      stack.push(el);
    } else {
      let i = stack.length - 1;
      while (i >= 0 && stack[i].name !== name) i--;
      if (i < 0) continue;
      const el = stack[i];
      stack.length = i;
      if (el.rec) {
        el.rec.end = end;
        if (name === "p") el.rec.innerEnd = start;
      }
      if (el.captionOf && el.captionOf.captionEnd < 0) el.captionOf.captionEnd = start;
    }
  }
  // Unclosed elements end at the end of the text.
  for (const r of [...figures, ...galleries, ...paragraphs]) if (r.end < 0) r.end = html.length;
  for (const img of images) {
    const f = img.figure;
    img.captionHtml =
      f && f.captionStart >= 0 && f.captionEnd > f.captionStart && f.images.length === 1
        ? html.slice(f.captionStart, f.captionEnd)
        : "";
  }
  return { images, figures, galleries, paragraphs };
}

/** The [start, end) range to cut so an image disappears from the body. */
function removalRange(html, img) {
  if (img.figure) return [img.figure.start, img.figure.end];
  const p = img.paragraph;
  if (p && p.images.length === 1 && p.innerEnd >= 0) {
    const inner = html.slice(p.innerStart, p.innerEnd);
    if (!htmlToText(inner.replace(/<img\b[^>]*>/gi, ""))) return [p.start, p.end];
  }
  return [img.start, img.end];
}

function cutRanges(html, ranges) {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = "";
  let pos = 0;
  for (const [s, e] of merged) {
    out += html.slice(pos, s);
    pos = e;
  }
  out += html.slice(pos);
  return out;
}

/* ------------------------------------------------------ the composition */

const LEGACY_API_FILE = /^api_\d+_\d+_\d+\.[A-Za-z0-9]+$/;

function rowUrl(row) {
  return (row && (row.image_url || row.imageUrl || row.url)) || "";
}

function makeSlide(src, fullCaption, alt, origin, kind) {
  const { caption, credit } = splitCaptionCredit(fullCaption);
  return {
    src: toMediaUrl(src, origin),
    caption,
    credit,
    alt: (alt || caption || "").replace(/\s+/g, " ").trim(),
    origin: kind,
  };
}

/**
 * What the article page shows, decided once for the SPA and the crawler HTML.
 *
 * 1. Exact: an attached image is "in the body" when a body image has the same
 *    imageKey or the same non-empty normalised caption. A cover in the body
 *    becomes the hero and that body figure is removed. Attached images in the
 *    body are not shown again. A key repeated in the body shows once.
 * 2. Mirror (legacy Content-API articles such as 814): no exact match, every
 *    attached file is `api_<n>_<n>_<n>.<ext>` with an empty caption, and the
 *    body has at least as many images. The attachments are copies of body
 *    images, so the first body figure is promoted to hero with its own caption
 *    and no attachment is rendered.
 * 3. Otherwise: hero = cover, body untouched, gallery = the other attachments.
 *
 * @param {{ images?: any[] | null, html?: string | null, origin?: string }} input
 *   html must already be sanitised.
 */
export function composeArticleMedia({ images, html, origin = "" } = {}) {
  const rows = sortImages(images).filter((r) => rowUrl(r));
  const { dek, html: body } = extractDek(typeof html === "string" ? html : "");
  const scan = scanBody(body);

  const bodyImgs = scan.images.filter((img) => img.src);
  for (const img of bodyImgs) {
    img.key = imageKey(img.src);
    img.fullCaption = htmlToText(img.captionHtml) || img.alt;
    img.capNorm = normalizeCaption(img.fullCaption);
    img.capOnlyNorm = normalizeCaption(splitCaptionCredit(img.fullCaption).caption);
  }

  // A key repeated inside the body shows only the first time.
  const remove = new Set();
  const seen = new Set();
  for (const img of bodyImgs) {
    if (seen.has(img.key)) remove.add(img);
    else seen.add(img.key);
  }
  const firstOf = bodyImgs.filter((img) => !remove.has(img));

  const findInBody = (row) => {
    const key = imageKey(rowUrl(row));
    const cap = normalizeCaption(row.caption);
    const capOnly = normalizeCaption(splitCaptionCredit(row.caption || "").caption);
    return (
      firstOf.find((img) => img.key === key) ||
      (cap ? firstOf.find((img) => img.capNorm === cap || (capOnly && img.capOnlyNorm === capOnly)) : undefined) ||
      null
    );
  };
  const matches = rows.map(findInBody);
  const anyExact = matches.some(Boolean);

  let hero = null;
  let heroSource = null;
  let dedupe = "none";
  const gallery = [];

  if (anyExact) {
    dedupe = "exact";
    const cover = rows[0];
    const coverMatch = matches[0];
    if (coverMatch) remove.add(coverMatch);
    hero = makeSlide(
      rowUrl(cover),
      (cover.caption && String(cover.caption).trim()) || (coverMatch ? coverMatch.fullCaption : ""),
      coverMatch ? coverMatch.alt : "",
      origin,
      "hero"
    );
    heroSource = "cover";
    rows.forEach((row, i) => {
      if (i > 0 && !matches[i]) gallery.push(makeSlide(rowUrl(row), row.caption, "", origin, "gallery"));
    });
  } else if (
    rows.length > 0 &&
    firstOf.length >= rows.length &&
    rows.every((row) => {
      const p = storagePathFromUrl(rowUrl(row));
      return p && LEGACY_API_FILE.test(p.split("/").pop()) && !String(row.caption || "").trim();
    })
  ) {
    dedupe = "mirror";
    const standalone = firstOf.find((img) => img.figure && !img.gallery && img.figure.images.length === 1);
    const promoted = standalone || firstOf[0];
    remove.add(promoted);
    hero = makeSlide(promoted.src, promoted.fullCaption, promoted.alt, origin, "hero");
    heroSource = "body-promoted";
  } else if (rows.length > 0) {
    const cover = rows[0];
    hero = makeSlide(rowUrl(cover), cover.caption, "", origin, "hero");
    heroSource = "cover";
    for (const row of rows.slice(1)) gallery.push(makeSlide(rowUrl(row), row.caption, "", origin, "gallery"));
  }

  // Cut removed images; a gallery left with no image goes as a whole.
  const ranges = [...remove].map((img) => removalRange(body, img));
  for (const g of scan.galleries) {
    if (g.images.length && g.images.every((img) => remove.has(img) || !img.src)) ranges.push([g.start, g.end]);
  }
  const bodyHtml = rewriteStorageUrls(cutRanges(body, ranges), origin);

  const bodySlides = bodyImgs
    .filter((img) => !remove.has(img))
    .map((img) => makeSlide(img.src, img.fullCaption, img.alt, origin, "body"));

  return {
    hero,
    heroSource,
    dek,
    bodyHtml,
    gallery,
    slides: [...(hero ? [hero] : []), ...bodySlides, ...gallery],
    dedupe,
  };
}
