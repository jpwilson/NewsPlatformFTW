/**
 * Rich markdown → HTML converter for NewsPlatform articles.
 * Implements the contract in docs/article-format.md:
 *   - [!SUMMARY]/[!KEY]/[!CONTEXT]/[!TIP]/[!NOTE]/[!WARNING] callout blocks
 *   - [!QUOTE] pull quotes with attribution, [!STAT] big-number callouts
 *   - GFM pipe tables
 *   - images as <figure> with captions; consecutive images → gallery
 *   - bare YouTube/Vimeo URLs → responsive embeds
 *   - ```chart fenced blocks → <div data-chart> (hydrated client-side)
 *   - headings, paragraphs, bold, italic, links, lists, blockquotes, code, hr
 * No external dependencies — avoids ESM/CJS issues on Vercel.
 *
 * IMPORTANT: an identical inlined copy lives in api/index.ts (which must stay
 * self-contained). Keep the two in sync.
 */

const MD_CALLOUT_TITLES: Record<string, string> = {
  summary: "In brief",
  key: "Key points",
  context: "Context",
  tip: "Worth knowing",
  note: "Note",
  important: "Important",
  warning: "Caution",
};

const MD_IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

function mdEscapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdEscapeAttr(text: string): string {
  return mdEscapeHtml(text).replace(/"/g, "&quot;");
}

/** Inline formatting: images, links, bold, italic */
function mdInline(text: string): string {
  let r = text;
  r = r.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  r = r.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  r = r.replace(/__(.+?)__/g, "<strong>$1</strong>");
  r = r.replace(/\*(.+?)\*/g, "<em>$1</em>");
  r = r.replace(/_(.+?)_/g, "<em>$1</em>");
  return r;
}

function mdFigure(alt: string, url: string): string {
  const cap = alt.trim();
  return `<figure class="article-figure"><img src="${mdEscapeAttr(url)}" alt="${mdEscapeAttr(cap)}" loading="lazy">${
    cap ? `<figcaption>${mdInline(cap)}</figcaption>` : ""
  }</figure>`;
}

/** Bare YouTube/Vimeo URL on its own line → responsive embed */
function mdVideoEmbed(line: string): string | null {
  const yt = line.match(
    /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})\S*$/
  );
  if (yt) {
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Embedded video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  const vm = line.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)\S*$/);
  if (vm) {
    return `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${vm[1]}" title="Embedded video" loading="lazy" allowfullscreen></iframe></div>`;
  }
  return null;
}

/** GFM pipe table → <table>, or null if the block isn't a table */
function mdTable(block: string): string | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0].includes("|")) return null;
  if (!/^\|?[\s:|-]+\|?$/.test(lines[1]) || !lines[1].includes("-")) return null;
  const parseRow = (line: string) =>
    line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headers = parseRow(lines[0]);
  const aligns = parseRow(lines[1]).map((sep) => {
    const l = sep.startsWith(":");
    const r = sep.endsWith(":");
    return l && r ? "center" : r ? "right" : "";
  });
  const cellAttr = (i: number) => (aligns[i] ? ` style="text-align:${aligns[i]}"` : "");
  const th = headers.map((h, i) => `<th${cellAttr(i)}>${mdInline(h)}</th>`).join("");
  const trs = lines
    .slice(2)
    .map(parseRow)
    .map((row) => `<tr>${headers.map((_, i) => `<td${cellAttr(i)}>${mdInline(row[i] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-wrap"><table class="article-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

/** `> [!TYPE]` admonition blocks → callouts / pull quotes / stat boxes */
function mdCallout(block: string): string | null {
  const lines = block.split("\n").map((l) => l.replace(/^>\s?/, ""));
  const m = lines[0].match(/^\[!(\w+)\]\s*(.*)$/);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const titleRest = m[2].trim();
  const body = lines.slice(1).join("\n").trim();

  if (type === "quote") {
    const bl = body.split("\n").filter((l) => l.trim());
    let attribution = "";
    let quoteLines = bl;
    const last = (bl[bl.length - 1] || "").trim();
    if (/^(—|--|–)\s*/.test(last)) {
      attribution = last.replace(/^(—|--|–)\s*/, "");
      quoteLines = bl.slice(0, -1);
    }
    const text = quoteLines.join(" ").trim().replace(/^["“]/, "").replace(/["”]$/, "");
    return `<figure class="pull-quote"><blockquote>${mdInline(text)}</blockquote>${
      attribution ? `<figcaption>${mdInline(attribution)}</figcaption>` : ""
    }</figure>`;
  }

  if (type === "stat") {
    const bl = body.split("\n").filter((l) => l.trim());
    const figure = (bl[0] || titleRest).trim();
    const caption = bl.slice(1).join(" ").trim();
    return `<aside class="callout callout-stat"><div class="stat-figure">${mdInline(figure)}</div>${
      caption ? `<div class="stat-caption">${mdInline(caption)}</div>` : ""
    }</aside>`;
  }

  const known = ["summary", "key", "context", "tip", "note", "important", "warning"];
  const cls = known.includes(type) ? type : "note";
  const title = titleRest || MD_CALLOUT_TITLES[cls] || cls;
  const bodyHtml = markdownToHtml(body);
  return `<aside class="callout callout-${cls}" data-callout="${cls}"><div class="callout-title">${mdInline(
    title
  )}</div><div class="callout-body">${bodyHtml}</div></aside>`;
}

export function markdownToHtml(markdown: string): string {
  let html = markdown.replace(/\r\n/g, "\n");

  // Fenced blocks first: ```chart → data div; everything else → <pre><code>
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    if ((lang || "").toLowerCase() === "chart") {
      try {
        const spec = JSON.parse(code);
        return `<div class="article-chart" data-chart="${mdEscapeAttr(JSON.stringify(spec))}"></div>`;
      } catch {
        return `<pre><code>${mdEscapeHtml(code.trimEnd())}</code></pre>`;
      }
    }
    return `<pre><code>${mdEscapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, (_m, code) => `<code>${mdEscapeHtml(code)}</code>`);

  const blocks = html.split(/\n{2,}/);
  const output: string[] = [];

  for (const block of blocks) {
    const t = block.trim();
    if (!t) continue;

    // Already-processed blocks pass through
    if (t.startsWith("<pre><code>") || t.startsWith('<div class="article-chart"')) {
      output.push(t);
      continue;
    }

    // Headings (single-line blocks)
    const hm = t.match(/^(#{1,6})\s+(.+)$/m);
    if (hm && t.split("\n").length === 1) {
      output.push(`<h${hm[1].length}>${mdInline(hm[2])}</h${hm[1].length}>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(t)) {
      output.push("<hr>");
      continue;
    }

    // Blockquotes: callouts first, then plain quotes
    if (t.startsWith(">")) {
      const callout = mdCallout(t);
      if (callout) {
        output.push(callout);
        continue;
      }
      const content = t.split("\n").map((l) => l.replace(/^>\s?/, "")).join("\n");
      output.push(`<blockquote><p>${mdInline(content)}</p></blockquote>`);
      continue;
    }

    // Tables
    const table = mdTable(t);
    if (table) {
      output.push(table);
      continue;
    }

    // Image blocks: every line an image → figure(s); 2+ → gallery
    const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => MD_IMG_LINE.test(l))) {
      const figs = lines.map((l) => {
        const im = l.match(MD_IMG_LINE)!;
        return mdFigure(im[1], im[2]);
      });
      output.push(
        figs.length > 1
          ? `<div class="article-gallery" data-gallery data-count="${figs.length}">${figs.join("")}</div>`
          : figs[0]
      );
      continue;
    }

    // Bare video URL on its own line
    if (lines.length === 1) {
      const video = mdVideoEmbed(lines[0]);
      if (video) {
        output.push(video);
        continue;
      }
    }

    // Unordered list
    if (/^[-*+]\s/.test(t)) {
      const lis = t
        .split("\n")
        .filter((l) => l.trim())
        .map((item) => `<li>${mdInline(item.replace(/^[-*+]\s+/, ""))}</li>`)
        .join("");
      output.push(`<ul>${lis}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(t)) {
      const lis = t
        .split("\n")
        .filter((l) => l.trim())
        .map((item) => `<li>${mdInline(item.replace(/^\d+\.\s+/, ""))}</li>`)
        .join("");
      output.push(`<ol>${lis}</ol>`);
      continue;
    }

    // Regular paragraph
    output.push(`<p>${mdInline(t.replace(/\n/g, " "))}</p>`);
  }

  return output.join("\n");
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
