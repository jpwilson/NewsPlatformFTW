/**
 * The single writer of articles and their attached images.
 *
 * The session routes (the owner's editor) and the v1 Content API (API keys)
 * both call these functions, so an edit, an image replacement or a delete
 * behaves the same whichever way it arrives. Every function takes the
 * Supabase client `sb` (service key) as its first argument.
 *
 * Plain ESM, imported by api/index.ts as ./_lib/article-service.js.
 * Storage objects are never deleted here.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { deriveExcerpt, extractDek, sortImages } from "../../shared/article-media.js";
import { INDEXNOW_HOST, pingIndexNow } from "./indexnow.js";

/** A numeric id or a slug. */
export function isNumericId(idOrSlug) {
  return /^\d+$/.test(String(idOrSlug));
}

/**
 * The article row for a numeric id or a slug, or null.
 * @param {any} sb
 * @param {string | number} idOrSlug
 * @param {string} [columns]
 */
export async function findArticle(sb, idOrSlug, columns = "*") {
  const key = String(idOrSlug ?? "").trim();
  if (!key) return null;
  let query = sb.from("articles").select(columns);
  query = isNumericId(key) ? query.eq("id", parseInt(key, 10)) : query.eq("slug", key);
  const { data, error } = await query.limit(1);
  if (error) {
    console.error("findArticle failed:", error);
    return null;
  }
  return (data && data[0]) || null;
}

/* ------------------------------------------------------------------ slug */

/** Same rule as article creation: lower case, dashes, at most 60 chars. */
export function slugBase(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60);
}

/** YYYY-MM-DD in UTC (creation uses server local time, which is UTC on Vercel). */
export function slugDate(date) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * `<date>-<title>` with creation's collision loop (-2, -3, … up to 10
 * attempts). The article itself never counts as a collision.
 */
export async function uniqueSlug(sb, title, date, excludeId) {
  const base = `${slugDate(date)}-${slugBase(title)}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await sb.from("articles").select("id").eq("slug", candidate).limit(1);
    const taken = data && data[0];
    if (!taken || (excludeId !== undefined && String(taken.id) === String(excludeId))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/* -------------------------------------------------------- announcements */

/** Live on the site: status "published" (or, for old rows, the flag). */
export function isPublishedRow(article) {
  if (!article) return false;
  return article.status === "published" || (article.status == null && !!article.published);
}

/**
 * Tell search engines (IndexNow) that an article's public pages changed: it
 * was published, edited while published, unpublished or deleted. `before`
 * is the row before the write (null for a new article), `after` the row
 * after it (null when deleted). Nothing is sent when neither is public, and
 * nothing outside production (see indexnow.js). Never throws; waits at most
 * two seconds.
 * @returns {Promise<{ sent: boolean, status?: number, reason?: string, urls?: string[] }>}
 */
export async function announceArticleChange(before, after) {
  try {
    if (!isPublishedRow(before) && !isPublishedRow(after)) return { sent: false, reason: "not_public" };
    const origin = `https://${INDEXNOW_HOST}`;
    const urls = [];
    for (const row of [after, before]) {
      if (!row || row.id == null) continue;
      urls.push(`${origin}/articles/${encodeURIComponent(row.id)}${row.slug ? `/${encodeURIComponent(row.slug)}` : ""}`);
      if (row.channel_id != null) urls.push(`${origin}/channels/${encodeURIComponent(row.channel_id)}`);
    }
    urls.push(`${origin}/latest`);
    return await pingIndexNow(urls);
  } catch {
    return { sent: false, reason: "error" };
  }
}

/* --------------------------------------------------------------- writes */

/**
 * Update the article row.
 *
 * slugMode:
 *   "keep"              the slug never changes (unless `fields.slug` is given)
 *   "regenerate"        a new slug from the (new) title, dated with the
 *                       article's created_at, collision-suffixed
 *   "if-title-changed"  "regenerate" only when the title actually changed
 *
 * Announces the change to search engines when the article was or is public.
 * @returns {Promise<{ article: any, previousSlug: string | null }>}
 */
export async function updateArticleFields(sb, article, fields, { slugMode = "keep" } = {}) {
  const updates = { ...fields };
  let previousSlug = null;
  const newTitle = typeof updates.title === "string" ? updates.title : article.title;
  const titleChanged = typeof updates.title === "string" && updates.title.trim() !== String(article.title || "").trim();
  if (slugMode === "regenerate" || (slugMode === "if-title-changed" && titleChanged)) {
    const slug = await uniqueSlug(sb, newTitle, new Date(article.created_at || Date.now()), article.id);
    if (slug !== article.slug) {
      updates.slug = slug;
      previousSlug = article.slug || null;
    }
  }
  if (Object.keys(updates).length === 0) return { article, previousSlug };
  const { data, error } = await sb.from("articles").update(updates).eq("id", article.id).select().single();
  if (error) {
    const err = new Error(error.message || "Failed to update article");
    err.cause = error;
    throw err;
  }
  await announceArticleChange(article, data);
  return { article: data, previousSlug };
}

/**
 * Replace every attached image of an article: delete all rows, insert the
 * given ones. `renumber` writes order 0..n in list order (cover first);
 * otherwise each row keeps its own `order` (the editor sends it).
 * Storage objects are left alone.
 * @param {any} sb
 * @param {number} articleId
 * @param {{ image_url: string, caption?: string | null, order?: number }[]} rows
 * @returns {Promise<any[]>} the inserted rows
 */
export async function replaceArticleImages(sb, articleId, rows, { renumber = false } = {}) {
  const { error: deleteError } = await sb.from("article_images").delete().eq("article_id", articleId);
  if (deleteError) {
    const err = new Error("Failed to delete current images");
    err.cause = deleteError;
    err.stage = "delete";
    throw err;
  }
  if (!rows.length) return [];
  const records = rows.map((img, i) => ({
    article_id: articleId,
    image_url: img.image_url,
    caption: img.caption,
    order: renumber ? i : img.order,
  }));
  const { data, error } = await sb.from("article_images").insert(records).select();
  if (error) {
    const err = new Error("Failed to insert images");
    err.cause = error;
    err.stage = "insert";
    throw err;
  }
  return data || [];
}

/**
 * Replace the category links; the first id is primary.
 * @returns {Promise<void>}
 */
export async function replaceArticleCategories(sb, articleId, categoryIds) {
  await sb.from("article_categories").delete().eq("article_id", articleId);
  if (categoryIds.length > 0) {
    await sb.from("article_categories").insert(
      categoryIds.map((catId, index) => ({
        article_id: articleId,
        category_id: catId,
        is_primary: index === 0,
      }))
    );
  }
}

/**
 * Unpublish (default) or permanently delete an article. Either way search
 * engines are told the page changed (announceArticleChange).
 *
 * Soft: status "draft" (the database trigger sets published = false), the
 * same state as the owner's "Move to Drafts". Permanent: the existing manual
 * cascade (comments, reactions, images, categories, then the row).
 */
export async function deleteArticle(sb, article, { permanent = false } = {}) {
  if (!permanent) {
    const { error } = await sb.from("articles").update({ status: "draft" }).eq("id", article.id);
    if (error) {
      const err = new Error(error.message || "Failed to unpublish article");
      err.cause = error;
      throw err;
    }
    await announceArticleChange(article, null);
    return { id: article.id, deleted: false, unpublished: true, status: "draft" };
  }

  for (const table of ["comments", "reactions", "article_images", "article_categories"]) {
    const { error } = await sb.from(table).delete().eq("article_id", article.id);
    if (error) console.error(`Error deleting ${table} of article ${article.id}:`, error);
  }
  const { error } = await sb.from("articles").delete().eq("id", article.id);
  if (error) {
    const err = new Error(error.message || "Failed to delete article");
    err.cause = error;
    throw err;
  }
  await announceArticleChange(article, null);
  return { id: article.id, deleted: true };
}

/* ------------------------------------------------------------- preview */

/**
 * Preview token for a non-published article: first 32 hex chars of
 * HMAC-SHA256(secret, "preview:" + id). Stateless; changes only with the key.
 */
export function previewToken(articleId, secret) {
  return createHmac("sha256", String(secret || "")).update(`preview:${articleId}`).digest("hex").slice(0, 32);
}

/** Constant-time check of a ?preview= value. */
export function isValidPreviewToken(articleId, token, secret) {
  if (typeof token !== "string" || !secret) return false;
  const expected = Buffer.from(previewToken(articleId, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/* ----------------------------------------------------------- serialise */

const asImage = (row) => ({ url: row.image_url, caption: row.caption || "" });

/**
 * The v1 Content API shape of an article (GET, PATCH; POST is a subset).
 * Image URLs are stored public URLs here; the JSON rewrite turns them into
 * absolute /media URLs on the way out.
 */
export async function serializeArticle(sb, article, { previousSlug, warnings, previewSecret } = {}) {
  const [{ data: channel }, { data: images }, { data: categories }] = await Promise.all([
    sb.from("channels").select("id, name, slug").eq("id", article.channel_id).limit(1).maybeSingle(),
    sb.from("article_images").select("*").eq("article_id", article.id).order("order").order("id"),
    sb.from("article_categories").select("category_id, is_primary, categories(id, name)").eq("article_id", article.id),
  ]);
  const sorted = sortImages(images || []);
  const content = article.content || "";
  const dek = extractDek(content).dek;
  const published = article.status === "published" || (article.status == null && !!article.published);
  const out = {
    id: article.id,
    title: article.title,
    slug: article.slug,
    url: `/articles/${article.id}/${article.slug}`,
    channelId: article.channel_id,
    channelName: channel?.name || null,
    status: article.status,
    published: !!article.published,
    createdAt: article.created_at,
    viewCount: article.view_count,
    excerpt: dek || deriveExcerpt(content) || "",
    excerptSource: dek ? "dek" : "derived",
    content,
    contentFormat: "html",
    coverImage: sorted[0] ? asImage(sorted[0]) : null,
    gallery: sorted.slice(1).map(asImage),
    images: sorted,
    categories: categories || [],
    location: article.location_name || article.location || null,
    locationLat: article.location_lat ?? null,
    locationLng: article.location_lng ?? null,
    previewUrl: null,
  };
  if (!published && previewSecret) {
    out.previewUrl = `/articles/${article.id}/${article.slug}?preview=${previewToken(article.id, previewSecret)}`;
  }
  if (previousSlug !== undefined) out.previousSlug = previousSlug;
  if (warnings !== undefined) out.warnings = warnings;
  return out;
}
