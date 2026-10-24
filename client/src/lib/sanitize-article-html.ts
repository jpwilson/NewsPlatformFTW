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
  ALLOWED_TAGS,
  allAllowedAttrs,
  isAllowedIframeUrl,
} from "@shared/article-html-policy";

const ALLOWED_ATTR = allAllowedAttrs();
// DOMPurify's default pattern, narrowed to the schemes the policy allows:
// http(s), mailto, or a relative reference.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // DOMPurify's allowlist is global rather than per-element, so restrict the
  // one element where the target host matters: video embeds.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element) || node.tagName !== "IFRAME") return;
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
