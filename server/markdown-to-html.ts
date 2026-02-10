import { marked } from "marked";

/**
 * Convert markdown to HTML compatible with TipTap's output.
 * Both use standard semantic HTML: <h1>, <strong>, <em>, <ul>, <blockquote>, etc.
 */
export function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown, {
    gfm: true,
    breaks: false,
  });

  if (typeof html !== "string") {
    throw new Error("Unexpected async result from marked.parse");
  }

  return html.trim();
}

/** Detect if content is already HTML */
export function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content.trim());
}

/**
 * Normalize content: accept markdown or HTML, always return HTML.
 * If format is specified, uses that. Otherwise auto-detects.
 */
export function normalizeContent(content: string, format?: "markdown" | "html"): string {
  if (format === "html") {
    return content;
  }
  if (format === "markdown") {
    return markdownToHtml(content);
  }
  // Auto-detect: if it looks like HTML, pass through; otherwise treat as markdown
  if (isHtml(content)) {
    return content;
  }
  return markdownToHtml(content);
}
