/**
 * Server-side article HTML sanitiser, used by the crawler prerenderer.
 *
 * Article bodies are author-supplied, so they are never interpolated into a
 * response raw: this strips everything outside the shared allowlist in
 * shared/article-html-policy.js (same policy the browser renderer uses).
 */

import sanitizeHtml from "sanitize-html";

import {
  ALLOWED_IFRAME_HOSTS,
  ALLOWED_STYLE_PROPS,
  ALLOWED_TAGS,
  ALLOWED_URL_SCHEMES,
  GLOBAL_ATTRS,
  TAG_ATTRS,
} from "../../shared/article-html-policy.js";

const allowedStyles = {
  "*": Object.fromEntries(
    Object.entries(ALLOWED_STYLE_PROPS).map(([prop, re]) => [prop, [re]])
  ),
};

const OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { "*": GLOBAL_ATTRS, ...TAG_ATTRS },
  allowedSchemes: ALLOWED_URL_SCHEMES,
  allowedSchemesAppliedToAttributes: ["href", "src", "srcset"],
  allowProtocolRelative: false,
  allowedIframeHostnames: ALLOWED_IFRAME_HOSTS,
  allowIframeRelativeUrls: false,
  allowedStyles,
  // Drop these elements *and* their text, so a stray </script> payload cannot
  // leak through as visible content.
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "template"],
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: true,
};

/** @param {unknown} html @returns {string} sanitised HTML, safe to embed */
export function sanitizeArticleHtml(html) {
  if (typeof html !== "string" || !html) return "";
  return sanitizeHtml(html, OPTIONS);
}
