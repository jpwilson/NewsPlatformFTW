/**
 * The client-side routes the SPA shell (app.html) must be served for.
 *
 * Kept in one place because three routers need the same list:
 *   - vercel.json         (production rewrites → /app.html)
 *   - server/vite.ts      (self-hosted Express production server)
 *   - scripts/serve-dist.mjs (local mirror of the Vercel routing)
 *
 * Anything not in this list and not a file on disk is a real 404, not the SPA
 * shell with HTTP 200 — soft 404s get indexed, and a crawler that cannot run
 * JavaScript otherwise receives the homepage's markup and canonical for a URL
 * that does not exist. scripts/check-seo.mjs asserts vercel.json matches.
 *
 * Patterns use the `:param` / `:param?` syntax that both Vercel rewrites and
 * Express 4 understand. Order is irrelevant — these all resolve to app.html.
 * The marketing routes are NOT here: they are prerendered static HTML (see
 * client/src/content/marketing.ts and scripts/prerender.ts).
 */

export const SPA_ROUTES = [
  "/channels",
  "/channels/new",
  "/channels/:id",
  "/channels/:id/subscribers",
  "/channels/:id/articles/new",
  "/articles/new",
  "/articles/:id/edit",
  "/articles/:id",
  "/articles/:id/:slug",
  "/auth",
  "/auth-callback",
  "/profile",
  "/users/:username",
  "/api",
  "/api-keys",
  "/admin",
  "/privacy",
  "/terms",
  "/advertise",
];

/** `/articles/:id/:slug` → /^\/articles\/[^/]+\/[^/]+$/ */
function toRegExp(pattern) {
  const source = pattern
    .split("/")
    .filter(Boolean)
    .map((seg) =>
      seg.startsWith(":")
        ? seg.endsWith("?")
          ? "(?:/[^/]+)?"
          : "/[^/]+"
        : `/${seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
    )
    .join("");
  return new RegExp(`^${source || "/"}$`);
}

const MATCHERS = SPA_ROUTES.map(toRegExp);

/** True when `pathname` (no query string, no trailing slash) is an app route. */
export function isSpaRoute(pathname) {
  return MATCHERS.some((re) => re.test(pathname));
}
