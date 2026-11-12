/**
 * Permanent image URLs in every JSON response of the Express API.
 *
 * Wraps res.json once: any Supabase storage URL for the article-images bucket
 * in the serialised body (signed URLs included, whose tokens expire) becomes
 * /media/<path>. The SPA gets site-relative URLs; the public v1 and AI APIs
 * get absolute URLs on the request's host. Any failure sends the untouched
 * response, so this can never break an endpoint.
 */

import { rewriteStorageUrls } from "../../shared/article-media.js";

const DEFAULT_HOST = "www.newsplatform.org";

/**
 * `https://<host>` for the public APIs (/api/v1/*, /api/ai/*), else "".
 * @param {{ path?: string, url?: string, headers: Record<string, any> }} req
 */
export function responseOrigin(req) {
  const path = req.path || (req.url || "").split("?")[0];
  if (!path.startsWith("/api/v1/") && !path.startsWith("/api/ai/")) return "";
  return absoluteOrigin(req);
}

/** `https://<request host>`, falling back to the production host. */
export function absoluteOrigin(req) {
  const first = (v) => String(v || "").split(",")[0].trim();
  let host = first(req.headers["x-forwarded-host"]) || first(req.headers.host);
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) host = DEFAULT_HOST;
  // http only for local development; everything else is https.
  const wanted = first(req.headers["x-forwarded-proto"]) || req.protocol || "https";
  const proto = wanted === "http" && /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}

/** @param {import("express").Express} app */
export function installJsonImageRewrite(app) {
  app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (body) {
      try {
        const text = JSON.stringify(body);
        if (typeof text !== "string" || text.indexOf("article-images") === -1) {
          return originalJson.call(this, body);
        }
        const rewritten = rewriteStorageUrls(text, responseOrigin(req));
        if (!this.get("Content-Type")) this.set("Content-Type", "application/json; charset=utf-8");
        return this.send(rewritten);
      } catch (err) {
        console.error("Image URL rewrite failed; sending the original response:", err);
        return originalJson.call(this, body);
      }
    };
    next();
  });
}
