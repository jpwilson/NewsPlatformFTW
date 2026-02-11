/**
 * Lightweight markdown → HTML converter.
 * Covers the features needed for article content: headings, paragraphs,
 * bold, italic, links, images, lists, blockquotes, code blocks, and hr.
 * No external dependencies — avoids ESM/CJS issues on Vercel.
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Normalize line endings
  html = html.replace(/\r\n/g, "\n");

  // Code blocks (fenced ``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);

  // Split into blocks by double newlines
  const blocks = html.split(/\n{2,}/);
  const output: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Already processed code blocks
    if (trimmed.startsWith("<pre><code>")) {
      output.push(trimmed);
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/m);
    if (headingMatch && trimmed.split("\n").length === 1) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      output.push("<hr>");
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      const content = trimmed
        .split("\n")
        .map((line: string) => line.replace(/^>\s?/, ""))
        .join("\n");
      output.push(`<blockquote><p>${inlineFormat(content)}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      const items = trimmed.split("\n").filter((l: string) => l.trim());
      const lis = items.map((item: string) => `<li>${inlineFormat(item.replace(/^[-*+]\s+/, ""))}</li>`).join("");
      output.push(`<ul>${lis}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items = trimmed.split("\n").filter((l: string) => l.trim());
      const lis = items.map((item: string) => `<li>${inlineFormat(item.replace(/^\d+\.\s+/, ""))}</li>`).join("");
      output.push(`<ol>${lis}</ol>`);
      continue;
    }

    // Regular paragraph (may have multiple lines within the block)
    output.push(`<p>${inlineFormat(trimmed.replace(/\n/g, " "))}</p>`);
  }

  return output.join("\n");
}

/** Process inline formatting: bold, italic, links, images */
function inlineFormat(text: string): string {
  let result = text;
  // Images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/_(.+?)_/g, "<em>$1</em>");
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  if (isHtml(content)) {
    return content;
  }
  return markdownToHtml(content);
}
