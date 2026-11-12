/**
 * Browser-side article HTML sanitiser.
 *
 * Mirrors api/_lib/sanitize-article-html.js: both enforce the single allowlist
 * in shared/article-html-policy.js, so an article body renders identically —
 * and equally safely — in the SPA and in the prerendered crawler HTML.
 */

import DOMPurify from "dompurify";

import {
  ALLOWED_DATA_ATTRS,
  ALLOWED_STYLE_PROPS,
  ALLOWED_TAGS,
  allAllowedAttrs,
  isAllowedIframeUrl,
} from "@shared/article-html-policy";

const ALLOWED_ATTR = allAllowedAttrs();
// DOMPurify's default pattern, narrowed to the schemes the policy allows:
// http(s), mailto, or a relative reference.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

let hooksInstalled = false;

/**
 * The style attribute reduced to the declarations the policy allows (today
 * only `text-align` with a fixed value), rebuilt as `prop:value;…`, or null
 * when nothing survives. Same result as sanitize-html's allowedStyles on the
 * server.
 */
export function filterStyle(style: string | null): string | null {
  if (!style) return null;
  const kept: string[] = [];
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    const re = Object.prototype.hasOwnProperty.call(ALLOWED_STYLE_PROPS, prop) ? ALLOWED_STYLE_PROPS[prop] : null;
    if (re && re.test(value)) kept.push(`${prop}:${value}`);
  }
  return kept.length ? kept.join(";") : null;
}

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // DOMPurify's allowlist is global rather than per-element, so restrict the
  // one element where the target host matters: video embeds.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    // Inline styles: keep only allowlisted declarations (F-16), so the
    // browser matches the server sanitiser.
    if (node.hasAttribute("style")) {
      const style = filterStyle(node.getAttribute("style"));
      if (style) node.setAttribute("style", style);
      else node.removeAttribute("style");
    }
    if (node.tagName !== "IFRAME") return;
    if (!isAllowedIframeUrl(node.getAttribute("src"))) node.remove();
  });
}

export function sanitizeArticleHtml(html: string): string {
  if (!html) return "";
  installHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ALLOWED_DATA_ATTRS,
    ALLOWED_URI_REGEXP,
  });
}
